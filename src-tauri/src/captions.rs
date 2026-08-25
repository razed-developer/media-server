use crate::{activity, app_state::persist_settings, database, library, Shared};
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, VecDeque}, fs, io::Read, path::{Path, PathBuf}, process::Stdio, sync::{Arc, RwLock}};
use tauri::State;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionJob {
    pub media_id: String,
    pub title: String,
    pub status: String,
    pub message: Option<String>,
    pub queued_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub progress_percent: u8,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionStatus {
    pub enabled: bool,
    pub auto_new: bool,
    pub language: String,
    pub executable: Option<String>,
    pub model_path: Option<String>,
    pub ready: bool,
    pub active_media_id: Option<String>,
    pub jobs: Vec<CaptionJob>,
}

#[derive(Clone, Default)]
pub struct CaptionRuntime {
    queue: Arc<RwLock<VecDeque<String>>>,
    jobs: Arc<RwLock<HashMap<String, CaptionJob>>>,
    active: Arc<RwLock<Option<String>>>,
}

fn available_command(configured: Option<&str>) -> Option<String> {
    let candidates = configured.into_iter().chain(["whisper-cli", "whisper.cpp", "main"]);
    for candidate in candidates {
        if crate::child_process::command(candidate).arg("--help").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
            return Some(candidate.to_string());
        }
    }
    None
}

fn configured(state: &crate::app_state::AppState) -> Result<(String, PathBuf, String), String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let executable = available_command(settings.caption_executable.as_deref())
        .ok_or("whisper.cpp was not found. Choose whisper-cli in Settings → Subtitles.")?;
    let model = settings.caption_model_path.as_ref().map(PathBuf::from)
        .filter(|path| path.is_file()).ok_or("Choose a downloaded whisper.cpp model in Settings → Subtitles.")?;
    Ok((executable, model, if settings.caption_language.trim().is_empty() { "en".into() } else { settings.caption_language.clone() }))
}

pub fn status(state: &crate::app_state::AppState) -> CaptionStatus {
    let settings = state.settings.read().ok();
    let executable = settings.as_ref().and_then(|s| s.caption_executable.clone());
    let model_path = settings.as_ref().and_then(|s| s.caption_model_path.clone());
    let ready = available_command(executable.as_deref()).is_some() && model_path.as_ref().is_some_and(|p| Path::new(p).is_file());
    let mut jobs = state.captions.jobs.read().map(|v| v.values().cloned().collect::<Vec<_>>()).unwrap_or_default();
    jobs.sort_by(|a,b| b.queued_at.cmp(&a.queued_at));
    CaptionStatus {
        enabled: settings.as_ref().is_some_and(|s| s.captions_enabled),
        auto_new: settings.as_ref().is_some_and(|s| s.captions_auto_new),
        language: settings.as_ref().map(|s| s.caption_language.clone()).unwrap_or_else(|| "en".into()),
        executable, model_path, ready,
        active_media_id: state.captions.active.read().ok().and_then(|v| v.clone()), jobs,
    }
}

fn enqueue(state: &Shared, media_id: &str, force: bool) -> Result<bool, String> {
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|item| item.id == media_id).cloned().ok_or("Media item not found")?;
    if !force && !item.subtitles.is_empty() { return Ok(false); }
    let mut jobs = state.captions.jobs.write().map_err(|_| "Caption job lock poisoned")?;
    if jobs.get(media_id).is_some_and(|job| matches!(job.status.as_str(), "queued" | "extracting" | "transcribing")) { return Ok(false); }
    let title = item.title.clone();
    let path = item.path.clone();
    jobs.insert(media_id.into(), CaptionJob { media_id: media_id.into(), title: item.title, status: "queued".into(), message: Some("Waiting for the caption worker".into()), queued_at: chrono::Utc::now().timestamp(), started_at: None, finished_at: None, progress_percent: 0 });
    drop(jobs);
    state.captions.queue.write().map_err(|_| "Caption queue lock poisoned")?.push_back(media_id.into());
    activity::info("Captions", format!("Queued AI subtitles for “{title}” — {path}"));
    start_worker(state.clone());
    Ok(true)
}

fn set_job(state: &crate::app_state::AppState, id: &str, status: &str, message: Option<String>, progress_percent: u8) {
    if let Ok(mut jobs) = state.captions.jobs.write() { if let Some(job) = jobs.get_mut(id) {
        job.status = status.into(); job.message = message; job.progress_percent = progress_percent;
        if job.started_at.is_none() && status != "queued" { job.started_at = Some(chrono::Utc::now().timestamp()); }
        if matches!(status, "complete" | "failed") { job.finished_at = Some(chrono::Utc::now().timestamp()); }
    } }
}

fn reported_percent(text: &str) -> Option<u8> {
    text.match_indices('%').filter_map(|(index, _)| {
        let prefix = text[..index].trim_end();
        let digits = prefix.rsplit(|c: char| !c.is_ascii_digit()).next()?;
        digits.parse::<u8>().ok().filter(|value| *value <= 100)
    }).last()
}

fn destination(video: &Path, language: &str) -> Result<(PathBuf, PathBuf), String> {
    let parent = video.parent().ok_or("Media file has no parent folder")?;
    let stem = video.file_stem().and_then(|v| v.to_str()).ok_or("Media filename is invalid")?;
    let base = parent.join(format!("{stem}.{language}.ai"));
    Ok((base.clone(), base.with_extension("ai.vtt")))
}

fn process_one(state: &Shared, id: &str) -> Result<(), String> {
    let (executable, model, language) = configured(state)?;
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|item| item.id == id).cloned().ok_or("Media item no longer exists")?;
    let work = state.provider_path.join("caption-work");
    fs::create_dir_all(&work).map_err(|e| format!("Could not create caption work folder: {e}"))?;
    let wav = work.join(format!("{id}.wav"));
    let video = Path::new(&item.path);
    let (output_base, output_vtt) = destination(video, &language)?;
    set_job(state, id, "extracting", Some(format!("Extracting audio from {}", video.display())), 5);
    activity::info("Captions", format!("Extracting audio for “{}” — {}", item.title, video.display()));
    let ffmpeg = crate::child_process::command("ffmpeg").args(["-y", "-hide_banner", "-loglevel", "error", "-i"]).arg(video)
        .args(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"]).arg(&wav).output()
        .map_err(|e| format!("Could not run FFmpeg: {e}"))?;
    if !ffmpeg.status.success() { let _=fs::remove_file(&wav); return Err(format!("FFmpeg could not extract audio: {}", String::from_utf8_lossy(&ffmpeg.stderr).trim())); }
    set_job(state, id, "transcribing", Some(format!("Transcribing {}", video.display())), 20);
    activity::info("Captions", format!("Transcribing “{}” with whisper.cpp — {}", item.title, video.display()));
    let mut child = crate::child_process::command(&executable).arg("-m").arg(model).arg("-f").arg(&wav)
        .args(["-l", &language, "-ovtt", "-pp", "-of"]).arg(&output_base)
        .stdout(Stdio::null()).stderr(Stdio::piped()).spawn()
        .map_err(|e| format!("Could not run whisper.cpp: {e}"))?;
    let mut stderr_text = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let mut buffer = [0_u8; 4096];
        loop {
            let count = stderr.read(&mut buffer).map_err(|e| format!("Could not read whisper.cpp progress: {e}"))?;
            if count == 0 { break; }
            let chunk = String::from_utf8_lossy(&buffer[..count]);
            stderr_text.push_str(&chunk);
            if stderr_text.len() > 12_000 { stderr_text = stderr_text.chars().rev().take(12_000).collect::<String>().chars().rev().collect(); }
            if let Some(percent) = reported_percent(&chunk) {
                set_job(state, id, "transcribing", Some(format!("Transcribing {} — {percent}%", video.display())), 20 + ((percent as u16 * 78 / 100) as u8));
            }
        }
    }
    let status = child.wait().map_err(|e| format!("Could not wait for whisper.cpp: {e}"))?;
    let _ = fs::remove_file(&wav);
    if !status.success() { return Err(format!("whisper.cpp failed: {}", stderr_text.trim())); }
    if !output_vtt.is_file() { return Err("whisper.cpp finished without creating a WebVTT file".into()); }
    let snapshot = {
        let mut media = state.media.write().map_err(|_| "Media lock poisoned")?;
        if let Some(current) = media.iter_mut().find(|item| item.id == id) { library::refresh_external_subtitles(current); }
        media.clone()
    };
    database::replace_library(&state.database_path, &snapshot)?;
    activity::info("Captions", format!("Generated AI subtitles for “{}” — saved {} (source {})", item.title, output_vtt.display(), video.display()));
    Ok(())
}

fn start_worker(state: Shared) {
    let should_start = state.captions.active.write().map(|mut active| { if active.is_some() { false } else { *active = Some(String::new()); true } }).unwrap_or(false);
    if !should_start { return; }
    tauri::async_runtime::spawn_blocking(move || loop {
        let next = state.captions.queue.write().ok().and_then(|mut queue| queue.pop_front());
        let Some(id) = next else { if let Ok(mut active)=state.captions.active.write(){*active=None;} break; };
        if let Ok(mut active)=state.captions.active.write(){*active=Some(id.clone());}
        match process_one(&state, &id) {
            Ok(()) => set_job(&state, &id, "complete", Some("Subtitle saved and added to the library".into()), 100),
            Err(error) => {
                let item = state.media.read().ok().and_then(|items| items.iter().find(|item| item.id == id).cloned());
                let target = item.map(|item| format!("“{}” — {}", item.title, item.path)).unwrap_or_else(|| id.clone());
                activity::error("Captions", format!("Caption generation failed for {target}: {error}"));
                set_job(&state, &id, "failed", Some(error), 0);
            }
        }
    });
}

pub fn queue_new_media(state: &Shared, ids: &[String]) {
    let enabled = state.settings.read().ok().is_some_and(|s| s.captions_enabled && s.captions_auto_new);
    if !enabled { return; }
    for id in ids { let _ = enqueue(state, id, false); }
}

#[tauri::command]
pub fn caption_status(state: State<'_, Shared>) -> CaptionStatus { status(&state) }

#[tauri::command]
pub fn caption_configure(enabled: bool, auto_new: bool, language: String, executable: Option<String>, model_path: Option<String>, state: State<'_, Shared>) -> Result<CaptionStatus,String> {
    { let mut settings=state.settings.write().map_err(|_|"Settings lock poisoned")?; settings.captions_enabled=enabled; settings.captions_auto_new=auto_new; settings.caption_language=if language.trim().is_empty(){"en".into()}else{language.trim().into()}; settings.caption_executable=executable.filter(|v|!v.trim().is_empty()); settings.caption_model_path=model_path.filter(|v|!v.trim().is_empty()); }
    persist_settings(&state)?; Ok(status(&state))
}

#[tauri::command]
pub fn caption_generate(media_id: String, force: Option<bool>, state: State<'_, Shared>) -> Result<bool,String> { let _=configured(&state)?; enqueue(state.inner(), &media_id, force.unwrap_or(false)) }

#[tauri::command]
pub fn caption_generate_missing(state: State<'_, Shared>) -> Result<usize,String> {
    let _=configured(&state)?;
    let ids=state.media.read().map_err(|_|"Media lock poisoned")?.iter().filter(|item|item.subtitles.is_empty()).map(|item|item.id.clone()).collect::<Vec<_>>();
    let mut count=0; for id in ids { if enqueue(state.inner(),&id,false)? { count+=1; } } Ok(count)
}
