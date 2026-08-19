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
    let root = {
        let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
        let Some(root) = settings.library_path.clone() else {
            *state.media.write().map_err(|_| "Media lock poisoned")? = vec![];
            return Ok(vec![]);
        };
        PathBuf::from(root)
    };
    let media = library::scan(&root, &state.database_path, PORT)?;
    *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone();
    Ok(media)
}

#[tauri::command]
pub fn set_library_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    if !Path::new(&path).is_dir() { return Err("Selected path is not a folder".into()); }
    state.settings.write().map_err(|_| "Settings lock poisoned")?.library_path = Some(path);
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
        item_count,
        ffprobe_available: command_available("ffprobe"),
        ffmpeg_available: command_available("ffmpeg"),
    })
}
