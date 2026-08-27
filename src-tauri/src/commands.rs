use crate::{
    app_state::{persist_settings, ScanProgress}, artwork, database, ibroadcast, library, metadata, metadata_view,
    models::{EnrichedAnalyticsSummary, MediaItem, MetadataProviderStatus, MetadataSearchResult, Playlist, UserPreferences, UserProfile},
    Shared, FUNNEL_GATEWAY_PORT, PORT,
};
use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, net::UdpSocket, path::{Path, PathBuf}, process::Command, sync::Arc, time::Instant};
use tauri::State as TauriState;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    running: bool,
    local_url: String,
    library_path: Option<String>,
    movie_path: Option<String>,
    tv_path: Option<String>,
    movie_paths: Vec<String>,
    tv_paths: Vec<String>,
    special_paths: Vec<String>,
    item_count: usize,
    ffprobe_available: bool,
    ffmpeg_available: bool,
    access_password_set: bool,
    artwork_cache_bytes: u64,
    setup_complete: bool,
    ibroadcast_client_id: Option<String>,
    scan_progress: ScanProgress,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunnelStatus {
    available: bool,
    enabled: bool,
    url: Option<String>,
    password_set: bool,
    detail: Option<String>,
}

fn tailscale_command() -> Command { crate::child_process::command("tailscale") }

pub(crate) fn read_funnel_status(password_set: bool) -> FunnelStatus {
    let output = tailscale_command().args(["funnel", "status"]).output();
    let Ok(output) = output else { return FunnelStatus { available: false, enabled: false, url: None, password_set, detail: Some("Tailscale CLI was not found on this computer.".into()) }; };
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let url = regex::Regex::new(r"https://[^\s/]+\.ts\.net").ok().and_then(|pattern| pattern.find(&stdout).map(|value| value.as_str().to_string()));
    let target = format!("127.0.0.1:{FUNNEL_GATEWAY_PORT}");
    let enabled = output.status.success() && url.is_some() && stdout.contains(&target);
    FunnelStatus { available: true, enabled, url: if enabled { url } else { None }, password_set, detail: if output.status.success() || stderr.is_empty() { None } else { Some(stderr) } }
}

#[tauri::command]
pub fn funnel_status(state: TauriState<'_, Shared>) -> Result<FunnelStatus, String> {
    let password_set = state.settings.read().map_err(|_| "Settings lock poisoned")?.access_password_hash.is_some();
    Ok(read_funnel_status(password_set))
}

pub(crate) fn set_funnel_enabled_for_state(enabled: bool, state: &Shared) -> Result<FunnelStatus, String> {
    let password_set = state.settings.read().map_err(|_| "Settings lock poisoned")?.access_password_hash.is_some();
    if enabled && !password_set { return Err("Set a Funnel password before turning on public access.".into()); }
    let output = if enabled {
        tailscale_command().args(["funnel", "--bg", &format!("http://127.0.0.1:{FUNNEL_GATEWAY_PORT}")]).output()
    } else {
        tailscale_command().args(["funnel", "--https=443", "off"]).output()
    }.map_err(|error| format!("Could not run Tailscale: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }
    Ok(read_funnel_status(password_set))
}

#[tauri::command]
pub fn set_funnel_enabled(enabled: bool, state: TauriState<'_, Shared>) -> Result<FunnelStatus, String> {
    set_funnel_enabled_for_state(enabled, state.inner())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    complete: bool,
    movie_path: Option<String>,
    tv_path: Option<String>,
    movie_paths: Vec<String>,
    tv_paths: Vec<String>,
    special_paths: Vec<String>,
    ibroadcast_client_id: Option<String>,
    users: Vec<UserProfile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInput {
    title: Option<String>,
    year: Option<u16>,
    kind: Option<String>,
    show_title: Option<String>,
    season: Option<u16>,
    episode: Option<u16>,
}

fn command_available(name: &str) -> bool {
    crate::child_process::command(name)
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn lan_url() -> String {
    let ip = UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("8.8.8.8:80")?;
            socket.local_addr()
        })
        .map(|address| address.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into());
    format!("http://{ip}:{PORT}")
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).map_err(|error| error.to_string())?;
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

fn validate_folder(path: &str) -> Result<(), String> {
    if Path::new(path).is_dir() { Ok(()) } else { Err("Selected path is not a folder".into()) }
}

fn ensure_user(state: &crate::app_state::AppState, user_id: &str) -> Result<(), String> {
    if database::user_exists(&state.database_path, user_id) { Ok(()) } else { Err("Unknown Onyx user".into()) }
}

fn enrich(state: &crate::app_state::AppState, mut items: Vec<MediaItem>) -> Result<Vec<MediaItem>, String> {
    metadata::enrich_media(&state.database_path, &mut items)?;
    metadata_view::canonicalize(&state.database_path, &mut items)?;
    Ok(items)
}

fn show_root(item: &MediaItem) -> PathBuf {
    let path = Path::new(&item.path);
    let parent = path.parent().unwrap_or(path);
    if parent.file_name().and_then(|value| value.to_str()).is_some_and(|name| name.to_ascii_lowercase().starts_with("season")) {
        parent.parent().unwrap_or(parent).to_path_buf()
    } else {
        parent.to_path_buf()
    }
}

fn scan(state: &crate::app_state::AppState, target: Option<&str>) -> Result<Vec<MediaItem>, String> {
    crate::activity::info("Library", "Scanning configured media libraries");
    let started_at = chrono::Utc::now().timestamp();
    if let Ok(mut progress) = state.scan_progress.write() {
        *progress = ScanProgress { active: true, phase: "starting".into(), started_at, ..ScanProgress::default() };
    }

    let result: Result<Vec<MediaItem>, String> = (|| {
        let (legacy_path, movie_paths, tv_paths, special_paths) = {
            let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
            (settings.library_path.clone(), settings.effective_movie_paths(), settings.effective_tv_paths(), settings.effective_special_paths())
        };
        let mut roots: Vec<(PathBuf, Option<String>,Option<crate::collection_sources::CollectionSource>)> = Vec::new();
        if movie_paths.is_empty() && tv_paths.is_empty() && special_paths.is_empty() {
            if let Some(root) = legacy_path { roots.push((PathBuf::from(root), None,None)); }
        } else {
            roots.extend(movie_paths.into_iter().map(|root| (PathBuf::from(root), Some("movie".into()),None)));
            roots.extend(tv_paths.into_iter().map(|root| (PathBuf::from(root), Some("episode".into()),None)));
            roots.extend(special_paths.into_iter().map(|root| (PathBuf::from(root), Some("special".into()),None)));
        }
        for source in crate::collection_sources::list(&state.provider_path)?{roots.push((PathBuf::from(&source.path),Some("collection".into()),Some(source)))}
        if let Some(target) = target {
            roots.retain(|(_, hint, source)| match target { "movie" => hint.as_deref()==Some("movie"), "tv" => hint.as_deref()==Some("episode"), "special" => hint.as_deref()==Some("special"), value if value.starts_with("collection:") => source.as_ref().is_some_and(|item|item.id==value.trim_start_matches("collection:")), _ => false });
            if roots.is_empty(){return Err(format!("No configured library found for {target}"));}
        }

        let mut media = if let Some(target)=target { state.media.read().map_err(|_|"Media lock poisoned")?.iter().filter(|item|match target{"movie"=>item.kind!="movie","tv"=>item.kind!="episode","special"=>item.kind!="special",value if value.starts_with("collection:")=>item.collection_source_id.as_deref()!=Some(value.trim_start_matches("collection:")),_=>true}).cloned().collect() } else { Vec::new() };
        let mut discovered_before = 0usize;
        let mut inspected_before = 0usize;
        for (root, hint, source) in roots {
            let mut root_discovered = 0usize;
            let mut root_inspected = 0usize;
            let mut report = |phase: &str, discovered: usize, inspected: usize, path: Option<&Path>| {
                root_discovered = discovered;
                root_inspected = inspected;
                if let Ok(mut progress) = state.scan_progress.write() {
                    progress.phase = phase.into();
                    progress.discovered = discovered_before + discovered;
                    progress.inspected = inspected_before + inspected;
                    progress.current_path = path.map(|value| value.to_string_lossy().to_string());
                }
            };
            let mut found=library::scan(&root,&state.database_path,hint.as_deref(),&mut report)?;
            if let Some(source)=source{for item in &mut found{let path=Path::new(&item.path);item.title=path.file_stem().map(|name|name.to_string_lossy().to_string()).unwrap_or_else(||item.title.clone());item.year=None;item.collection_source_id=Some(source.id.clone());item.collection_source_name=Some(source.name.clone());item.collection_protected=source.protected;item.collection_folder=path.parent().and_then(|parent|parent.strip_prefix(&source.path).ok()).and_then(|relative|relative.components().next()).map(|part|part.as_os_str().to_string_lossy().to_string()).or_else(||Some("Unsorted".into()));}}
            media.extend(found);
            discovered_before += root_discovered;
            inspected_before += root_inspected;
        }

        let mut seen = HashSet::new();
        media.retain(|item| seen.insert(item.id.clone()));
        media.sort_by(|a, b| {
            let kind_order = a.kind.cmp(&b.kind);
            if kind_order != std::cmp::Ordering::Equal { return kind_order; }
            let a_key = (a.show_title.as_deref().unwrap_or(&a.title).to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
            let b_key = (b.show_title.as_deref().unwrap_or(&b.title).to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase());
            a_key.cmp(&b_key)
        });
        if let Ok(mut progress) = state.scan_progress.write() { progress.phase = "saving".into(); }
        let previous_ids = state.media.read().map_err(|_| "Media lock poisoned")?.iter().map(|item| item.id.clone()).collect::<HashSet<_>>();
        database::replace_library(&state.database_path, &media)?;
        let metadata_media = media.iter().filter(|item| item.kind != "collection").cloned().collect::<Vec<_>>();
        metadata::reconcile_local_entities(&state.database_path, &metadata_media)?;
        *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone();
        let new_ids = media.iter().filter(|item| !previous_ids.contains(&item.id)).map(|item| item.id.clone()).collect::<Vec<_>>();
        crate::activity::info("Library", format!("Library scan complete: {} media files", media.len()));
        crate::captions::queue_new_media(&Arc::new((*state).clone()), &new_ids);
        Ok(media)
    })();

    let finished_at = chrono::Utc::now().timestamp();
    if let Ok(mut progress) = state.scan_progress.write() {
        progress.active = false;
        progress.finished_at = Some(finished_at);
        progress.current_path = None;
        match &result {
            Ok(media) => { progress.phase = "complete".into(); progress.discovered = media.len().max(progress.discovered); progress.inspected = progress.discovered; progress.error = None; }
            Err(error) => { progress.phase = "failed".into(); progress.error = Some(error.clone()); }
        }
    }
    result
}

fn update_root(state: &crate::app_state::AppState, kind: &str, path: String, add: bool) -> Result<(), String> {
    validate_folder(&path)?;
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    let target = match kind { "movie" => &mut settings.movie_paths, "tv" => &mut settings.tv_paths, _ => &mut settings.special_paths };
    if add {
        if !target.iter().any(|existing| Path::new(existing) == Path::new(&path)) { target.push(path.clone()); }
    } else {
        target.clear();
        target.push(path.clone());
    }
    target.sort(); target.dedup();
    if kind == "movie" { settings.movie_path = target.first().cloned(); } else if kind == "tv" { settings.tv_path = target.first().cloned(); }
    drop(settings);
    persist_settings(state)?;
    scan(state, None)?;
    Ok(())
}

fn remove_root(state: &crate::app_state::AppState, kind: &str, path: &str) -> Result<(), String> {
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    let target = match kind { "movie" => &mut settings.movie_paths, "tv" => &mut settings.tv_paths, _ => &mut settings.special_paths };
    target.retain(|value| Path::new(value) != Path::new(path));
    if kind == "movie" { settings.movie_path = target.first().cloned(); } else if kind == "tv" { settings.tv_path = target.first().cloned(); }
    drop(settings);
    persist_settings(state)?;
    scan(state, None)?;
    Ok(())
}

#[tauri::command]
pub fn configure_library_root(kind: String, path: String, add: bool, state: TauriState<'_, Shared>) -> Result<(), String> {
    if !matches!(kind.as_str(), "movie" | "tv" | "special") { return Err("Unknown library type".into()); }
    if add { validate_folder(&path)?; }
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    let target = match kind.as_str() { "movie" => &mut settings.movie_paths, "tv" => &mut settings.tv_paths, _ => &mut settings.special_paths };
    if add {
        if !target.iter().any(|existing| Path::new(existing) == Path::new(&path)) { target.push(path); }
    } else {
        target.retain(|existing| Path::new(existing) != Path::new(&path));
    }
    target.sort(); target.dedup();
    if kind == "movie" { settings.movie_path = target.first().cloned(); } else if kind == "tv" { settings.tv_path = target.first().cloned(); }
    drop(settings);
    persist_settings(&state)
}

#[tauri::command]
pub fn setup_status(state: TauriState<'_, Shared>) -> Result<SetupStatus, String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let movie_paths = settings.effective_movie_paths();
    let tv_paths = settings.effective_tv_paths();
    let special_paths = settings.effective_special_paths();
    Ok(SetupStatus {
        complete: settings.setup_complete,
        movie_path: movie_paths.first().cloned(),
        tv_path: tv_paths.first().cloned(),
        movie_paths,
        tv_paths,
        special_paths,
        ibroadcast_client_id: settings.ibroadcast_client_id.clone(),
        users: database::list_users(&state.database_path)?,
    })
}

#[tauri::command]
pub fn complete_setup(state: TauriState<'_, Shared>) -> Result<(), String> {
    state.settings.write().map_err(|_| "Settings lock poisoned")?.setup_complete = true;
    persist_settings(&state)
}

#[tauri::command]
pub fn set_ibroadcast_client_id(client_id: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    let value = client_id.trim().to_string();
    state.settings.write().map_err(|_| "Settings lock poisoned")?.ibroadcast_client_id = if value.is_empty() { None } else { Some(value) };
    persist_settings(&state)
}

#[tauri::command]
pub async fn set_library_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        validate_folder(&path)?;
        shared.settings.write().map_err(|_| "Settings lock poisoned")?.library_path = Some(path);
        persist_settings(&shared)?;
        scan(&shared,None)?;
        Ok(())
    }).await.map_err(|error| format!("Library worker failed: {error}"))?
}

async fn update_root_async(state: TauriState<'_, Shared>, kind: &'static str, path: String, add: bool) -> Result<(), String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || update_root(&shared, kind, path, add))
        .await.map_err(|error| format!("Library worker failed: {error}"))?
}

async fn remove_root_async(state: TauriState<'_, Shared>, kind: &'static str, path: String) -> Result<(), String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || remove_root(&shared, kind, &path))
        .await.map_err(|error| format!("Library worker failed: {error}"))?
}

#[tauri::command] pub async fn set_movie_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { update_root_async(state, "movie", path, false).await }
#[tauri::command] pub async fn set_tv_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { update_root_async(state, "tv", path, false).await }
#[tauri::command] pub async fn add_movie_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { update_root_async(state, "movie", path, true).await }
#[tauri::command] pub async fn add_tv_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { update_root_async(state, "tv", path, true).await }
#[tauri::command] pub async fn remove_movie_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { remove_root_async(state, "movie", path).await }
#[tauri::command] pub async fn remove_tv_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { remove_root_async(state, "tv", path).await }
#[tauri::command] pub async fn add_special_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { update_root_async(state, "special", path, true).await }
#[tauri::command] pub async fn remove_special_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { remove_root_async(state, "special", path).await }

#[tauri::command]pub async fn collection_source_save(input:crate::collection_sources::CollectionSourceInput,state:TauriState<'_,Shared>)->Result<Vec<crate::collection_sources::CollectionSource>,String>{let shared=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{crate::collection_sources::save(&shared.provider_path,input)?;scan(&shared,None)?;crate::collection_sources::public_list(&shared.provider_path)}).await.map_err(|e|format!("Collection worker failed: {e}"))?}
#[tauri::command]pub async fn collection_source_delete(source_id:String,state:TauriState<'_,Shared>)->Result<Vec<crate::collection_sources::CollectionSource>,String>{let shared=state.inner().clone();tauri::async_runtime::spawn_blocking(move||{crate::collection_sources::delete(&shared.provider_path,&source_id)?;scan(&shared,None)?;crate::collection_sources::public_list(&shared.provider_path)}).await.map_err(|e|format!("Collection worker failed: {e}"))?}

pub(crate) fn set_access_password_for_state(password: String, state: &Shared) -> Result<(), String> {
    if password.chars().count() < 8 { return Err("Access password must be at least 8 characters".into()); }
    let hash = hash_password(&password)?;
    state.settings.write().map_err(|_| "Settings lock poisoned")?.access_password_hash = Some(hash);
    state.sessions.write().map_err(|_| "Session lock poisoned")?.clear();
    persist_settings(&state)
}

#[tauri::command]
pub fn set_access_password(password: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    set_access_password_for_state(password, state.inner())
}

pub(crate) fn clear_access_password_for_state(state: &Shared) -> Result<(), String> {
    if read_funnel_status(true).enabled { return Err("Turn off Tailscale Funnel before removing its password.".into()); }
    state.settings.write().map_err(|_| "Settings lock poisoned")?.access_password_hash = None;
    state.sessions.write().map_err(|_| "Session lock poisoned")?.clear();
    persist_settings(&state)
}

#[tauri::command]
pub fn clear_access_password(state: TauriState<'_, Shared>) -> Result<(), String> {
    clear_access_password_for_state(state.inner())
}

#[tauri::command]
pub fn library_scan_progress(state: TauriState<'_, Shared>) -> Result<ScanProgress, String> {
    state.scan_progress.read().map(|progress| progress.clone()).map_err(|_| "Scan progress lock poisoned".into())
}

#[tauri::command]
pub async fn scan_library(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || scan(&shared, None))
        .await.map_err(|error| format!("Library worker failed: {error}"))?
}
#[tauri::command]
pub async fn scan_library_kind(kind:String,state:TauriState<'_,Shared>)->Result<Vec<MediaItem>,String>{let shared=state.inner().clone();tauri::async_runtime::spawn_blocking(move||scan(&shared,Some(&kind))).await.map_err(|error|format!("Library worker failed: {error}"))?}
#[tauri::command] pub fn list_users(state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::list_users(&state.database_path) }
#[tauri::command] pub fn create_user(name: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::create_user(&state.database_path, &name)?; database::list_users(&state.database_path) }
#[tauri::command] pub fn rename_user(user_id: String, name: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::rename_user(&state.database_path, &user_id, &name)?; database::list_users(&state.database_path) }
#[tauri::command] pub fn delete_user(user_id: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::delete_user(&state.database_path, &user_id) }
#[tauri::command]
pub fn get_user_preferences(user_id: String, state: TauriState<'_, Shared>) -> Result<UserPreferences, String> { ensure_user(&state, &user_id)?; database::get_preferences(&state.database_path, &user_id) }
#[tauri::command]
pub fn set_user_theme(user_id: String, theme: String, state: TauriState<'_, Shared>) -> Result<UserPreferences, String> { ensure_user(&state, &user_id)?; database::set_theme(&state.database_path, &user_id, &theme) }
#[tauri::command]
pub fn set_split_continue_watching(user_id: String, split: bool, state: TauriState<'_, Shared>) -> Result<UserPreferences, String> { ensure_user(&state, &user_id)?; database::set_split_continue_watching(&state.database_path, &user_id, split) }
#[tauri::command]
pub fn user_analytics(user_id: String, state: TauriState<'_, Shared>) -> Result<EnrichedAnalyticsSummary, String> {
    ensure_user(&state, &user_id)?;
    let core = database::analytics(&state.database_path, &user_id)?;
    let genres = metadata::genre_watch_totals(&state.database_path, &user_id).unwrap_or_default();
    Ok(EnrichedAnalyticsSummary::from_core(core, genres))
}
#[tauri::command]
pub async fn list_media(user_id: String, include_hidden: Option<bool>, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let shared=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
        let started=Instant::now();
        ensure_user(&shared,&user_id)?;
        let result=enrich(&shared,database::load_library_for_user(&shared.database_path,&user_id,include_hidden.unwrap_or(false))?);
        let elapsed=started.elapsed().as_millis();if elapsed>200{crate::activity::warn("Performance",format!("list_media took {elapsed} ms for {} items",result.as_ref().map(|items|items.len()).unwrap_or(0)));}result
    }).await.map_err(|error|format!("Library worker failed: {error}"))?
}
#[tauri::command]
pub fn save_progress(user_id: String, id: String, seconds: u64, watched_seconds: Option<u64>, state: TauriState<'_, Shared>) -> Result<(), String> {
    ensure_user(&state, &user_id)?;
    database::save_progress(&state.database_path, &user_id, &id, seconds, watched_seconds.unwrap_or(0))
}
#[tauri::command]
pub fn reset_watch_status(user_id: String, ids: Vec<String>, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    ensure_user(&state, &user_id)?;
    database::reset_progress(&state.database_path, &user_id, &ids)?;
    enrich(&state, database::load_library_for_user(&state.database_path, &user_id, false)?)
}
#[tauri::command]
pub fn set_hidden(user_id: String, target_type: String, target_key: String, hidden: bool, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    ensure_user(&state, &user_id)?;
    database::set_hidden(&state.database_path, &user_id, &target_type, &target_key, hidden)?;
    enrich(&state, database::load_library_for_user(&state.database_path, &user_id, false)?)
}
#[tauri::command]
pub fn identify_item(id: String, identity: IdentityInput, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let value = database::IdentityOverride {
        title: identity.title.filter(|value| !value.trim().is_empty()),
        year: identity.year,
        kind: identity.kind.filter(|value| value == "movie" || value == "episode"),
        show_title: identity.show_title.filter(|value| !value.trim().is_empty()),
        season: identity.season,
        episode: identity.episode,
    };
    database::save_identity_override(&state.database_path, &id, &value)?;
    scan(&state,None)
}
#[tauri::command]
pub fn reset_identification(id: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    database::clear_identity_override(&state.database_path, &id)?;
    scan(&state,None)
}
#[tauri::command]
pub fn identify_show(id: String, show_title: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let title = show_title.trim();
    if title.is_empty() { return Err("Show title cannot be empty".into()); }
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|media| media.id == id).cloned().ok_or("Media item not found")?;
    if item.kind != "episode" { return Err("Selected item is not a TV episode".into()); }
    database::save_show_override(&state.database_path, &show_root(&item).to_string_lossy(), title)?;
    scan(&state,None)
}

#[tauri::command] pub fn list_playlists(user_id: String, state: TauriState<'_, Shared>) -> Result<Vec<Playlist>, String> { ensure_user(&state, &user_id)?; database::list_playlists(&state.database_path, &user_id) }
#[tauri::command]
pub fn create_playlist(user_id: String, name: String, state: TauriState<'_, Shared>) -> Result<Vec<Playlist>, String> {
    ensure_user(&state, &user_id)?;
    database::create_playlist(&state.database_path, &user_id, &name)?;
    database::list_playlists(&state.database_path, &user_id)
}
#[tauri::command]
pub fn add_to_playlist(user_id: String, playlist_id: String, media_id: String, state: TauriState<'_, Shared>) -> Result<Vec<Playlist>, String> {
    ensure_user(&state, &user_id)?;
    database::add_playlist_item(&state.database_path, &user_id, &playlist_id, &media_id)?;
    database::list_playlists(&state.database_path, &user_id)
}
#[tauri::command]
pub fn remove_from_playlist(user_id: String, playlist_id: String, media_id: String, state: TauriState<'_, Shared>) -> Result<Vec<Playlist>, String> {
    ensure_user(&state, &user_id)?;
    database::remove_playlist_item(&state.database_path, &user_id, &playlist_id, &media_id)?;
    database::list_playlists(&state.database_path, &user_id)
}
#[tauri::command]
pub fn delete_playlist(user_id: String, playlist_id: String, state: TauriState<'_, Shared>) -> Result<Vec<Playlist>, String> {
    ensure_user(&state, &user_id)?;
    database::delete_playlist(&state.database_path, &user_id, &playlist_id)?;
    database::list_playlists(&state.database_path, &user_id)
}

#[tauri::command] pub fn ibroadcast_status(user_id: String, state: TauriState<'_, Shared>) -> Result<ibroadcast::IbConnectionStatus, String> { ensure_user(&state, &user_id)?; ibroadcast::status(&state, &user_id) }
#[tauri::command] pub async fn ibroadcast_device_start(state: TauriState<'_, Shared>) -> Result<ibroadcast::DeviceCodeResponse, String> { ibroadcast::device_start(&state).await }
#[tauri::command]
pub async fn ibroadcast_device_poll(user_id: String, device_code: String, state: TauriState<'_, Shared>) -> Result<ibroadcast::DevicePollResponse, String> {
    ensure_user(&state, &user_id)?;
    ibroadcast::device_poll(&state, &user_id, &device_code).await
}
#[tauri::command]
pub async fn ibroadcast_sync(user_id: String, state: TauriState<'_, Shared>) -> Result<ibroadcast::IbLibrary, String> {
    ensure_user(&state, &user_id)?;
    ibroadcast::sync_library(&state, &user_id).await
}
#[tauri::command]
pub fn ibroadcast_library(user_id: String, state: TauriState<'_, Shared>) -> Result<ibroadcast::IbLibrary, String> {
    ensure_user(&state, &user_id)?;
    ibroadcast::load_library(&state.provider_path, &user_id)
}
#[tauri::command]
pub fn ibroadcast_disconnect(user_id: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    ensure_user(&state, &user_id)?;
    ibroadcast::disconnect(&state, &user_id)
}

#[tauri::command]
pub fn metadata_provider_status() -> Vec<MetadataProviderStatus> {
    vec![
        metadata::tmdb::status(),
        MetadataProviderStatus {
            provider: "tvdb".into(),
            configured: false,
            enabled: false,
            primary: false,
            attribution: "TheTVDB integration is optional and not configured in this build.".into(),
        },
    ]
}
#[tauri::command] pub fn set_tmdb_token(token: String) -> Result<(), String> { metadata::tmdb::save_token(&token) }
#[tauri::command] pub fn clear_tmdb_token() -> Result<(), String> { metadata::tmdb::clear_token() }
#[tauri::command] pub async fn test_tmdb() -> Result<(), String> { metadata::tmdb::test_connection().await }
#[tauri::command]
pub async fn metadata_search(id: String, query: Option<String>, state: TauriState<'_, Shared>) -> Result<Vec<MetadataSearchResult>, String> {
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|media| media.id == id).cloned().ok_or("Media item not found")?;
    let search_query = query
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| if item.kind == "episode" { item.show_title.clone().unwrap_or(item.title.clone()) } else { item.title.clone() });
    let kinds = if item.kind == "special" { vec!["movie", "series"] } else if item.kind == "episode" { vec!["series"] } else { vec!["movie"] };
    if let Some(results) = metadata::tmdb::lookup_reference(&search_query, &kinds).await? { return Ok(results); }
    if item.kind == "special" {
        let (movies, series) = tokio::join!(metadata::tmdb::search("movie", &search_query, None), metadata::tmdb::search("series", &search_query, None));
        let mut results = movies?; results.extend(series?); return Ok(results);
    }
    metadata::tmdb::search(kinds[0], &search_query, None).await
}
#[tauri::command]
pub async fn metadata_apply_match(id: String, provider_id: String, entity_type: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|media| media.id == id).cloned().ok_or("Media item not found")?;
    let allowed = match item.kind.as_str() { "special" => entity_type == "movie" || entity_type == "series", "episode" => entity_type == "series", _ => entity_type == "movie" };
    if !allowed { return Err("That TMDB result type cannot be applied to this library item".into()); }
    metadata::tmdb::apply_match_as(&state.database_path, &id, &provider_id, &entity_type, "manual", true).await?;
    enrich(&state, database::load_library_for_user(&state.database_path, database::DEFAULT_USER_ID, true)?)
}
#[tauri::command]
pub async fn metadata_auto_match_all(state: TauriState<'_, Shared>) -> Result<u32, String> {
    if !metadata::tmdb::configured() { return Err("TMDB is not configured".into()); }
    let media = state.media.read().map_err(|_| "Media lock poisoned")?.clone();
    let mut ids = Vec::new();
    let mut shows = HashSet::new();
    for item in media {
        if item.kind == "movie" || item.kind == "special" { let special=item.kind=="special";ids.push((item.id,special)); }
        else if item.kind == "episode" && shows.insert(item.show_title.unwrap_or_default()) { ids.push((item.id,false)); }
    }
    let mut matched = 0;
    for (id,special) in ids {
        let result=if special{metadata::tmdb::auto_match_special(&state.database_path,&id).await}else{metadata::tmdb::auto_match(&state.database_path,&id).await};
        if result.unwrap_or(false) { matched += 1; }
    }
    Ok(matched)
}

#[tauri::command]
pub fn clear_thumbnail_cache(state: TauriState<'_, Shared>) -> Result<(), String> {
    artwork::clear_generated_thumbnails(&state.artwork_path)
}

#[tauri::command]
pub async fn server_status(state: TauriState<'_, Shared>) -> Result<ServerStatus, String> {
    let shared=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||server_status_inner(&shared)).await.map_err(|error|format!("Status worker failed: {error}"))?
}

fn server_status_inner(state:&crate::AppState)->Result<ServerStatus,String>{
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let item_count = state.media.read().map_err(|_| "Media lock poisoned")?.len();
    let movie_paths = settings.effective_movie_paths();
    let tv_paths = settings.effective_tv_paths();
    let special_paths = settings.effective_special_paths();
    Ok(ServerStatus {
        running: true,
        local_url: lan_url(),
        library_path: settings.library_path.clone(),
        movie_path: movie_paths.first().cloned(),
        tv_path: tv_paths.first().cloned(),
        movie_paths,
        tv_paths,
        special_paths,
        item_count,
        ffprobe_available: command_available("ffprobe"),
        ffmpeg_available: command_available("ffmpeg"),
        access_password_set: settings.access_password_hash.is_some(),
        artwork_cache_bytes: artwork::cache_size(&state.artwork_path)+artwork::cache_size(&state.provider_path.join("metadata-images")),
        setup_complete: settings.setup_complete,
        ibroadcast_client_id: settings.ibroadcast_client_id.clone(),
        scan_progress: state.scan_progress.read().map_err(|_| "Scan progress lock poisoned")?.clone(),
    })
}
