use crate::{app_state::{persist_settings, Shared}, database, library, models::MediaItem, PORT};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State as TauriState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    running: bool,
    local_url: String,
    library_path: Option<String>,
    movie_path: Option<String>,
    tv_path: Option<String>,
    item_count: usize,
    ffprobe_available: bool,
    ffmpeg_available: bool,
}

fn command_available(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn scan(state: &crate::app_state::AppState) -> Result<Vec<MediaItem>, String> {
    let (legacy_path, movie_path, tv_path) = {
        let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
        (
            settings.library_path.clone(),
            settings.movie_path.clone(),
            settings.tv_path.clone(),
        )
    };

    let mut media = Vec::new();
    if movie_path.is_none() && tv_path.is_none() {
        if let Some(root) = legacy_path {
            media.extend(library::scan(&PathBuf::from(root), &state.database_path, None)?);
        }
    } else {
        if let Some(root) = movie_path {
            media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("movie"))?);
        }
        if let Some(root) = tv_path {
            media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("episode"))?);
        }
    }

    media.sort_by(|a, b| {
        let kind_order = a.kind.cmp(&b.kind);
        if kind_order != std::cmp::Ordering::Equal { return kind_order; }
        let a_key = (a.show_title.as_deref().unwrap_or(&a.title).to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
        let b_key = (b.show_title.as_deref().unwrap_or(&b.title).to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase());
        a_key.cmp(&b_key)
    });

    database::replace_library(&state.database_path, &media)?;
    *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone();
    Ok(media)
}

fn validate_folder(path: &str) -> Result<(), String> {
    if Path::new(path).is_dir() { Ok(()) } else { Err("Selected path is not a folder".into()) }
}

#[tauri::command]
pub fn set_library_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    validate_folder(&path)?;
    state.settings.write().map_err(|_| "Settings lock poisoned")?.library_path = Some(path);
    persist_settings(&state)?;
    scan(&state)?;
    Ok(())
}

#[tauri::command]
pub fn set_movie_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    validate_folder(&path)?;
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    settings.movie_path = Some(path);
    drop(settings);
    persist_settings(&state)?;
    scan(&state)?;
    Ok(())
}

#[tauri::command]
pub fn set_tv_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    validate_folder(&path)?;
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    settings.tv_path = Some(path);
    drop(settings);
    persist_settings(&state)?;
    scan(&state)?;
    Ok(())
}

#[tauri::command]
pub fn scan_library(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { scan(&state) }

#[tauri::command]
pub fn list_media(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    Ok(state.media.read().map_err(|_| "Media lock poisoned")?.clone())
}

#[tauri::command]
pub fn save_progress(id: String, seconds: u64, state: TauriState<'_, Shared>) -> Result<(), String> {
    database::save_progress(&state.database_path, &id, seconds)?;
    if let Ok(mut media) = state.media.write() {
        if let Some(item) = media.iter_mut().find(|item| item.id == id) { item.progress_seconds = seconds; }
    }
    Ok(())
}

#[tauri::command]
pub fn server_status(state: TauriState<'_, Shared>) -> Result<ServerStatus, String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let item_count = state.media.read().map_err(|_| "Media lock poisoned")?.len();
    Ok(ServerStatus {
        running: true,
        local_url: format!("http://127.0.0.1:{PORT}"),
        library_path: settings.library_path.clone(),
        movie_path: settings.movie_path.clone(),
        tv_path: settings.tv_path.clone(),
        item_count,
        ffprobe_available: command_available("ffprobe"),
        ffmpeg_available: command_available("ffmpeg"),
    })
}
