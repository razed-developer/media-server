use crate::{app_state::{persist_settings, Shared}, artwork, database, library, models::MediaItem, PORT};
use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
use serde::Serialize;
use std::{net::UdpSocket, path::{Path, PathBuf}};
use tauri::State as TauriState;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    running: bool, local_url: String, library_path: Option<String>, movie_path: Option<String>, tv_path: Option<String>,
    item_count: usize, ffprobe_available: bool, ffmpeg_available: bool, access_password_set: bool,
    artwork_cache_bytes: u64,
}

fn command_available(name: &str) -> bool { std::process::Command::new(name).arg("-version").output().map(|o| o.status.success()).unwrap_or(false) }
fn lan_url() -> String {
    let ip = UdpSocket::bind("0.0.0.0:0").and_then(|socket| { socket.connect("8.8.8.8:80")?; socket.local_addr() }).map(|a| a.ip().to_string()).unwrap_or_else(|_| "127.0.0.1".into());
    format!("http://{ip}:{PORT}")
}
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::encode_b64(Uuid::new_v4().as_bytes()).map_err(|e| e.to_string())?;
    Argon2::default().hash_password(password.as_bytes(), &salt).map(|h| h.to_string()).map_err(|e| e.to_string())
}
fn scan(state: &crate::app_state::AppState) -> Result<Vec<MediaItem>, String> {
    let (legacy_path, movie_path, tv_path) = { let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?; (settings.library_path.clone(), settings.movie_path.clone(), settings.tv_path.clone()) };
    let mut media = Vec::new();
    if movie_path.is_none() && tv_path.is_none() { if let Some(root) = legacy_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, None)?); } }
    else {
        if let Some(root) = movie_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("movie"))?); }
        if let Some(root) = tv_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("episode"))?); }
    }
    media.sort_by(|a, b| {
        let kind_order = a.kind.cmp(&b.kind); if kind_order != std::cmp::Ordering::Equal { return kind_order; }
        let a_key = (a.show_title.as_deref().unwrap_or(&a.title).to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
        let b_key = (b.show_title.as_deref().unwrap_or(&b.title).to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase()); a_key.cmp(&b_key)
    });
    database::replace_library(&state.database_path, &media)?;
    *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone(); Ok(media)
}
fn validate_folder(path: &str) -> Result<(), String> { if Path::new(path).is_dir() { Ok(()) } else { Err("Selected path is not a folder".into()) } }

#[tauri::command] pub fn set_library_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { validate_folder(&path)?; state.settings.write().map_err(|_| "Settings lock poisoned")?.library_path = Some(path); persist_settings(&state)?; scan(&state)?; Ok(()) }
#[tauri::command] pub fn set_movie_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { validate_folder(&path)?; let mut s=state.settings.write().map_err(|_| "Settings lock poisoned")?; s.movie_path=Some(path); drop(s); persist_settings(&state)?; scan(&state)?; Ok(()) }
#[tauri::command] pub fn set_tv_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> { validate_folder(&path)?; let mut s=state.settings.write().map_err(|_| "Settings lock poisoned")?; s.tv_path=Some(path); drop(s); persist_settings(&state)?; scan(&state)?; Ok(()) }
#[tauri::command] pub fn set_access_password(password: String, state: TauriState<'_, Shared>) -> Result<(), String> { if password.chars().count()<8{return Err("Access password must be at least 8 characters".into())} let hash=hash_password(&password)?; state.settings.write().map_err(|_|"Settings lock poisoned")?.access_password_hash=Some(hash); state.sessions.write().map_err(|_|"Session lock poisoned")?.clear(); persist_settings(&state) }
#[tauri::command] pub fn clear_access_password(state: TauriState<'_, Shared>) -> Result<(), String> { state.settings.write().map_err(|_|"Settings lock poisoned")?.access_password_hash=None; state.sessions.write().map_err(|_|"Session lock poisoned")?.clear(); persist_settings(&state) }
#[tauri::command] pub fn scan_library(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { scan(&state) }
#[tauri::command] pub fn list_media(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { Ok(state.media.read().map_err(|_|"Media lock poisoned")?.clone()) }
#[tauri::command] pub fn save_progress(id:String,seconds:u64,state:TauriState<'_,Shared>)->Result<(),String>{database::save_progress(&state.database_path,&id,seconds)?;if let Ok(mut media)=state.media.write(){if let Some(item)=media.iter_mut().find(|item|item.id==id){item.progress_seconds=seconds;}}Ok(())}
#[tauri::command] pub fn clear_thumbnail_cache(state:TauriState<'_,Shared>)->Result<(),String>{artwork::clear_generated_thumbnails(&state.artwork_path)}
#[tauri::command] pub fn server_status(state:TauriState<'_,Shared>)->Result<ServerStatus,String>{let settings=state.settings.read().map_err(|_|"Settings lock poisoned")?;let item_count=state.media.read().map_err(|_|"Media lock poisoned")?.len();Ok(ServerStatus{running:true,local_url:lan_url(),library_path:settings.library_path.clone(),movie_path:settings.movie_path.clone(),tv_path:settings.tv_path.clone(),item_count,ffprobe_available:command_available("ffprobe"),ffmpeg_available:command_available("ffmpeg"),access_password_set:settings.access_password_hash.is_some(),artwork_cache_bytes:artwork::cache_size(&state.artwork_path)})}
