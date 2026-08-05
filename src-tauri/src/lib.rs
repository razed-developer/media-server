use axum::{extract::{Path as AxumPath, State}, http::{header, HeaderMap, HeaderValue, StatusCode}, response::{IntoResponse, Response}, routing::get, Json, Router};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, net::SocketAddr, path::{Path, PathBuf}, sync::{Arc, RwLock}};
use tauri::{Manager, State as TauriState};
use tower_http::cors::CorsLayer;
use walkdir::WalkDir;

const PORT: u16 = 8765;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubtitleTrack { label: String, language: String, url: String }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaItem {
  id: String,
  title: String,
  year: Option<u16>,
  kind: String,
  show_title: Option<String>,
  season: Option<u16>,
  episode: Option<u16>,
  path: String,
  stream_url: String,
  subtitles: Vec<SubtitleTrack>,
  progress_seconds: u64,
  duration_seconds: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerStatus { running: bool, local_url: String, library_path: Option<String>, item_count: usize }

#[derive(Default, Serialize, Deserialize)]
struct Settings { library_path: Option<String>, progress: HashMap<String, u64> }

#[derive(Clone)]
struct AppState { settings_path: PathBuf, settings: Arc<RwLock<Settings>>, media: Arc<RwLock<Vec<MediaItem>>> }

type Shared = Arc<AppState>;

fn app_data_dir() -> PathBuf {
  dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("home-media")
}

fn load_settings(path: &Path) -> Settings {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

fn persist(state: &AppState) -> Result<(), String> {
  if let Some(parent) = state.settings_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
  let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
  fs::write(&state.settings_path, serde_json::to_vec_pretty(&*settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn clean_title(raw: &str) -> String {
  raw.replace(['.', '_'], " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

fn make_id(path: &Path) -> String {
  let mut hasher = Sha256::new();
  hasher.update(path.to_string_lossy().as_bytes());
  hex::encode(hasher.finalize())[..20].to_string()
}

fn discover_subtitles(path: &Path, id: &str) -> Vec<SubtitleTrack> {
  let Some(parent) = path.parent() else { return vec![]; };
  let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
  let mut tracks = vec![];
  if let Ok(entries) = fs::read_dir(parent) {
    for entry in entries.flatten() {
      let candidate = entry.path();
      let extension = candidate.extension().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
      let candidate_stem = candidate.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
      if ["vtt", "srt"].contains(&extension.as_str()) && candidate_stem.starts_with(stem) {
        let language = candidate_stem.strip_prefix(stem).unwrap_or("").trim_matches('.').to_string();
        let label = if language.is_empty() { "Subtitles".into() } else { language.to_uppercase() };
        tracks.push(SubtitleTrack { label, language: if language.is_empty() { "und".into() } else { language }, url: format!("http://127.0.0.1:{PORT}/subtitle/{id}/{}", urlencoding::encode(candidate.file_name().and_then(|s| s.to_str()).unwrap_or_default())) });
      }
    }
  }
  tracks
}

fn scan(state: &AppState) -> Result<Vec<MediaItem>, String> {
  let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
  let Some(root) = settings.library_path.as_ref() else { return Ok(vec![]); };
  let progress = settings.progress.clone();
  drop(settings);
  let episode_re = Regex::new(r"(?i)^(.*?)[ ._-]+S(\d{1,2})E(\d{1,3})[ ._-]*(.*)$").unwrap();
  let year_re = Regex::new(r"(?:\(|\b)((?:19|20)\d{2})(?:\)|\b)").unwrap();
  let extensions = ["mp4", "mkv", "webm", "m4v", "avi", "mov"];
  let mut media = vec![];
  for entry in WalkDir::new(root).follow_links(false).into_iter().flatten().filter(|e| e.file_type().is_file()) {
    let path = entry.path();
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
    if !extensions.contains(&extension.as_str()) { continue; }
    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    let id = make_id(path);
    let (kind, show_title, season, episode, title) = if let Some(captures) = episode_re.captures(raw) {
      let show = clean_title(captures.get(1).map(|m| m.as_str()).unwrap_or("Show"));
      let episode_title = clean_title(captures.get(4).map(|m| m.as_str()).unwrap_or("Episode"));
      ("episode".into(), Some(show), captures.get(2).and_then(|m| m.as_str().parse().ok()), captures.get(3).and_then(|m| m.as_str().parse().ok()), if episode_title.is_empty() { "Episode".into() } else { episode_title })
    } else {
      ("movie".into(), None, None, None, clean_title(raw))
    };
    let year = year_re.captures(raw).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse().ok());
    media.push(MediaItem { id: id.clone(), title, year, kind, show_title, season, episode, path: path.to_string_lossy().to_string(), stream_url: format!("http://127.0.0.1:{PORT}/stream/{id}"), subtitles: discover_subtitles(path, &id), progress_seconds: *progress.get(&id).unwrap_or(&0), duration_seconds: None });
  }
  media.sort_by(|a, b| a.show_title.as_ref().unwrap_or(&a.title).to_lowercase().cmp(&b.show_title.as_ref().unwrap_or(&b.title).to_lowercase()));
  *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone();
  Ok(media)
}

#[tauri::command]
fn set_library_path(path: String, state: TauriState<'_, Shared>) -> Result<(), String> {
  if !Path::new(&path).is_dir() { return Err("Selected path is not a folder".into()); }
  state.settings.write().map_err(|_| "Settings lock poisoned")?.library_path = Some(path);
  persist(&state)?;
  scan(&state)?;
  Ok(())
}

#[tauri::command]
fn scan_library(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { scan(&state) }

#[tauri::command]
fn list_media(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { Ok(state.media.read().map_err(|_| "Media lock poisoned")?.clone()) }

#[tauri::command]
fn save_progress(id: String, seconds: u64, state: TauriState<'_, Shared>) -> Result<(), String> {
  state.settings.write().map_err(|_| "Settings lock poisoned")?.progress.insert(id.clone(), seconds);
  if let Ok(mut media) = state.media.write() { if let Some(item) = media.iter_mut().find(|item| item.id == id) { item.progress_seconds = seconds; } }
  persist(&state)
}

#[tauri::command]
fn server_status(state: TauriState<'_, Shared>) -> Result<ServerStatus, String> {
  let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
  Ok(ServerStatus { running: true, local_url: format!("http://127.0.0.1:{PORT}"), library_path: settings.library_path.clone(), item_count: state.media.read().map_err(|_| "Media lock poisoned")?.len() })
}

async fn api_library(State(state): State<Shared>) -> Json<Vec<MediaItem>> { Json(state.media.read().map(|m| m.clone()).unwrap_or_default()) }

fn find_media(state: &AppState, id: &str) -> Option<MediaItem> { state.media.read().ok()?.iter().find(|item| item.id == id).cloned() }

async fn stream_media(State(state): State<Shared>, AxumPath(id): AxumPath<String>, headers: HeaderMap) -> Response {
  let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
  let Ok(bytes) = tokio::fs::read(&item.path).await else { return StatusCode::NOT_FOUND.into_response(); };
  let total = bytes.len();
  let mime = mime_guess::from_path(&item.path).first_or_octet_stream().to_string();
  if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("bytes=")) {
    let mut parts = range.split('-');
    let start = parts.next().and_then(|v| v.parse::<usize>().ok()).unwrap_or(0).min(total.saturating_sub(1));
    let end = parts.next().and_then(|v| if v.is_empty() { None } else { v.parse::<usize>().ok() }).unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));
    if start > end { return StatusCode::RANGE_NOT_SATISFIABLE.into_response(); }
    let body = bytes[start..=end].to_vec();
    let mut response = (StatusCode::PARTIAL_CONTENT, body).into_response();
    response.headers_mut().insert(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")).unwrap());
    response.headers_mut().insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
    response
  } else {
    let mut response = bytes.into_response();
    response.headers_mut().insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
    response
  }
}

async fn subtitle(State(state): State<Shared>, AxumPath((id, filename)): AxumPath<(String, String)>) -> Response {
  let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
  let decoded = urlencoding::decode(&filename).map(|v| v.into_owned()).unwrap_or(filename);
  let Some(parent) = Path::new(&item.path).parent() else { return StatusCode::NOT_FOUND.into_response(); };
  let path = parent.join(decoded);
  if !path.starts_with(parent) { return StatusCode::FORBIDDEN.into_response(); }
  let Ok(raw) = tokio::fs::read_to_string(&path).await else { return StatusCode::NOT_FOUND.into_response(); };
  let content = if path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("srt")).unwrap_or(false) {
    format!("WEBVTT\n\n{}", raw.replace(',', "."))
  } else { raw };
  let mut response = content.into_response();
  response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/vtt; charset=utf-8"));
  response
}

async fn start_http(state: Shared) {
  let router = Router::new().route("/api/library", get(api_library)).route("/stream/{id}", get(stream_media)).route("/subtitle/{id}/{filename}", get(subtitle)).layer(CorsLayer::permissive()).with_state(state);
  let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
  if let Ok(listener) = tokio::net::TcpListener::bind(addr).await { let _ = axum::serve(listener, router).await; }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let data_dir = app_data_dir();
  let settings_path = data_dir.join("settings.json");
  let shared = Arc::new(AppState { settings_path: settings_path.clone(), settings: Arc::new(RwLock::new(load_settings(&settings_path))), media: Arc::new(RwLock::new(vec![])) });
  let _ = scan(&shared);
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(shared.clone())
    .setup(move |app| {
      let server_state = shared.clone();
      tauri::async_runtime::spawn(async move { start_http(server_state).await; });
      if let Some(window) = app.get_webview_window("main") { let _ = window.set_title("Home Media"); }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![set_library_path, scan_library, list_media, save_progress, server_status])
    .run(tauri::generate_context!())
    .expect("error while running Home Media");
}
