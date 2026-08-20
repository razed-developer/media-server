use crate::{
    app_state::persist_settings, artwork, database, ibroadcast, library, metadata, metadata_view,
    models::{EnrichedAnalyticsSummary, MediaItem, MetadataProviderStatus, MetadataSearchResult, Playlist, UserPreferences, UserProfile},
    Shared, PORT,
};
use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, net::UdpSocket, path::{Path, PathBuf}};
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
    item_count: usize,
    ffprobe_available: bool,
    ffmpeg_available: bool,
    access_password_set: bool,
    artwork_cache_bytes: u64,
    setup_complete: bool,
    ibroadcast_client_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    complete: bool,
    movie_path: Option<String>,
    tv_path: Option<String>,
    movie_paths: Vec<String>,
    tv_paths: Vec<String>,
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
    std::process::Command::new(name)
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

pub(crate) fn scan(state: &crate::app_state::AppState) -> Result<Vec<MediaItem>, String> {
    crate::activity::info("Library", "Scanning configured media libraries");
    let (legacy_path, movie_paths, tv_paths) = {
        let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
        (settings.library_path.clone(), settings.effective_movie_paths(), settings.effective_tv_paths())
    };
    let mut media = Vec::new();
    if movie_paths.is_empty() && tv_paths.is_empty() {
        if let Some(root) = legacy_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, None)?); }
    } else {
        for root in movie_paths { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("movie"))?); }
        for root in tv_paths { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("episode"))?); }
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
    database::replace_library(&state.database_path, &media)?;
    metadata::reconcile_local_entities(&state.database_path, &media)?;
    *state.media.write().map_err(|_| "Media lock poisoned")? = media.clone();
    crate::activity::info("Library", format!("Library scan complete: {} media files", media.len()));
    Ok(media)
}

fn update_root(state: &crate::app_state::AppState, kind: &str, path: String, add: bool) -> Result<(), String> {
    validate_folder(&path)?;
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    let target = if kind == "movie" { &mut settings.movie_paths } else { &mut settings.tv_paths };
    if add {
        if !target.iter().any(|existing| Path::new(existing) == Path::new(&path)) { target.push(path.clone()); }
    } else {
        target.clear();
        target.push(path.clone());
    }
    target.sort(); target.dedup();
    if kind == "movie" { settings.movie_path = target.first().cloned(); } else { settings.tv_path = target.first().cloned(); }
    drop(settings);
    persist_settings(state)?;
    scan(state)?;
    Ok(())
}

fn remove_root(state: &crate::app_state::AppState, kind: &str, path: &str) -> Result<(), String> {
    let mut settings = state.settings.write().map_err(|_| "Settings lock poisoned")?;
    let target = if kind == "movie" { &mut settings.movie_paths } else { &mut settings.tv_paths };
    target.retain(|value| Path::new(value) != Path::new(path));
    if kind == "movie" { settings.movie_path = target.first().cloned(); } else { settings.tv_path = target.first().cloned(); }
    drop(settings);
    persist_settings(state)?;
    scan(state)?;
    Ok(())
}

#[tauri::command]
pub fn setup_status(state: TauriState<'_, Shared>) -> Result<SetupStatus, String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let movie_paths = settings.effective_movie_paths();
    let tv_paths = settings.effective_tv_paths();
    Ok(SetupStatus {
        complete: settings.setup_complete,
        movie_path: movie_paths.first().cloned(),
        tv_path: tv_paths.first().cloned(),
        movie_paths,
        tv_paths,
        ibroadcast_client_id: settings.ibroadcast_client_id.clone(),
        users: database::list_users(&state.database_path)?,
    })
}

// Remaining commands are unchanged from the repository version below this point.
