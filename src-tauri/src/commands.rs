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

fn scan(state: &crate::app_state::AppState) -> Result<Vec<MediaItem>, String> {
    crate::activity::info("Library", "Scanning configured media libraries");
    let (legacy_path, movie_path, tv_path) = {
        let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
        (settings.library_path.clone(), settings.movie_path.clone(), settings.tv_path.clone())
    };
    let mut media = Vec::new();
    if movie_path.is_none() && tv_path.is_none() {
        if let Some(root) = legacy_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, None)?); }
    } else {
        if let Some(root) = movie_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("movie"))?); }
        if let Some(root) = tv_path { media.extend(library::scan(&PathBuf::from(root), &state.database_path, Some("episode"))?); }
    }
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

#[tauri::command]
pub fn setup_status(state: TauriState<'_, Shared>) -> Result<SetupStatus, String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    Ok(SetupStatus {
        complete: settings.setup_complete,
        movie_path: settings.movie_path.clone(),
        tv_path: settings.tv_path.clone(),
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
pub fn set_access_password(password: String, state: TauriState<'_, Shared>) -> Result<(), String> {
    if password.chars().count() < 8 { return Err("Access password must be at least 8 characters".into()); }
    let hash = hash_password(&password)?;
    state.settings.write().map_err(|_| "Settings lock poisoned")?.access_password_hash = Some(hash);
    state.sessions.write().map_err(|_| "Session lock poisoned")?.clear();
    persist_settings(&state)
}

#[tauri::command]
pub fn clear_access_password(state: TauriState<'_, Shared>) -> Result<(), String> {
    state.settings.write().map_err(|_| "Settings lock poisoned")?.access_password_hash = None;
    state.sessions.write().map_err(|_| "Session lock poisoned")?.clear();
    persist_settings(&state)
}

#[tauri::command]
pub fn scan_library(state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> { scan(&state) }
#[tauri::command] pub fn list_users(state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::list_users(&state.database_path) }
#[tauri::command] pub fn create_user(name: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::create_user(&state.database_path, &name)?; database::list_users(&state.database_path) }
#[tauri::command] pub fn rename_user(user_id: String, name: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::rename_user(&state.database_path, &user_id, &name)?; database::list_users(&state.database_path) }
#[tauri::command] pub fn delete_user(user_id: String, state: TauriState<'_, Shared>) -> Result<Vec<UserProfile>, String> { database::delete_user(&state.database_path, &user_id) }
#[tauri::command]
pub fn get_user_preferences(user_id: String, state: TauriState<'_, Shared>) -> Result<UserPreferences, String> { ensure_user(&state, &user_id)?; database::get_preferences(&state.database_path, &user_id) }
#[tauri::command]
pub fn set_user_theme(user_id: String, theme: String, state: TauriState<'_, Shared>) -> Result<UserPreferences, String> { ensure_user(&state, &user_id)?; database::set_theme(&state.database_path, &user_id, &theme) }
#[tauri::command]
pub fn user_analytics(user_id: String, state: TauriState<'_, Shared>) -> Result<EnrichedAnalyticsSummary, String> {
    ensure_user(&state, &user_id)?;
    let core = database::analytics(&state.database_path, &user_id)?;
    let genres = metadata::genre_watch_totals(&state.database_path, &user_id).unwrap_or_default();
    Ok(EnrichedAnalyticsSummary::from_core(core, genres))
}
#[tauri::command]
pub fn list_media(user_id: String, include_hidden: Option<bool>, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    ensure_user(&state, &user_id)?;
    enrich(&state, database::load_library_for_user(&state.database_path, &user_id, include_hidden.unwrap_or(false))?)
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
    scan(&state)
}
#[tauri::command]
pub fn reset_identification(id: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    database::clear_identity_override(&state.database_path, &id)?;
    scan(&state)
}
#[tauri::command]
pub fn identify_show(id: String, show_title: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    let title = show_title.trim();
    if title.is_empty() { return Err("Show title cannot be empty".into()); }
    let item = state.media.read().map_err(|_| "Media lock poisoned")?.iter().find(|media| media.id == id).cloned().ok_or("Media item not found")?;
    if item.kind != "episode" { return Err("Selected item is not a TV episode".into()); }
    database::save_show_override(&state.database_path, &show_root(&item).to_string_lossy(), title)?;
    scan(&state)
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
    // Manual Fix Match searches intentionally do not send a year filter to TMDB.
    // Years can be wrong in local filenames/folders, and TMDB's year parameter is a hard
    // filter that can hide the correct result entirely. The returned year is still shown
    // to the user, while automatic matching continues to use year as a confidence hint.
    metadata::tmdb::search(if item.kind == "episode" { "series" } else { "movie" }, &search_query, None).await
}
#[tauri::command]
pub async fn metadata_apply_match(id: String, provider_id: String, state: TauriState<'_, Shared>) -> Result<Vec<MediaItem>, String> {
    metadata::tmdb::apply_match(&state.database_path, &id, &provider_id, "manual", true).await?;
    enrich(&state, database::load_library_for_user(&state.database_path, database::DEFAULT_USER_ID, true)?)
}
#[tauri::command]
pub async fn metadata_auto_match_all(state: TauriState<'_, Shared>) -> Result<u32, String> {
    if !metadata::tmdb::configured() { return Err("TMDB is not configured".into()); }
    let media = state.media.read().map_err(|_| "Media lock poisoned")?.clone();
    let mut ids = Vec::new();
    let mut shows = HashSet::new();
    for item in media {
        if item.kind == "movie" { ids.push(item.id); }
        else if shows.insert(item.show_title.unwrap_or_default()) { ids.push(item.id); }
    }
    let mut matched = 0;
    for id in ids {
        if metadata::tmdb::auto_match(&state.database_path, &id).await.unwrap_or(false) { matched += 1; }
    }
    Ok(matched)
}

#[tauri::command]
pub fn clear_thumbnail_cache(state: TauriState<'_, Shared>) -> Result<(), String> {
    artwork::clear_generated_thumbnails(&state.artwork_path)
}

#[tauri::command]
pub fn server_status(state: TauriState<'_, Shared>) -> Result<ServerStatus, String> {
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let item_count = state.media.read().map_err(|_| "Media lock poisoned")?.len();
    Ok(ServerStatus {
        running: true,
        local_url: lan_url(),
        library_path: settings.library_path.clone(),
        movie_path: settings.movie_path.clone(),
        tv_path: settings.tv_path.clone(),
        item_count,
        ffprobe_available: command_available("ffprobe"),
        ffmpeg_available: command_available("ffmpeg"),
        access_password_set: settings.access_password_hash.is_some(),
        artwork_cache_bytes: artwork::cache_size(&state.artwork_path),
        setup_complete: settings.setup_complete,
        ibroadcast_client_id: settings.ibroadcast_client_id.clone(),
    })
}
