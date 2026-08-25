use crate::{
    artwork, database, ibroadcast, metadata, metadata_view,
    models::{EnrichedAnalyticsSummary, MediaItem, Playlist, UserPreferences, UserProfile},
    Shared,
};
use argon2::{password_hash::{PasswordHash, PasswordVerifier}, Argon2};
use axum::{
    body::Body,
    extract::{Path as AxumPath, Query, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap,io::SeekFrom, net::SocketAddr, path::{Path, PathBuf}, process::Stdio, time::{SystemTime, UNIX_EPOCH}};
use tokio::{fs::File, io::{AsyncReadExt, AsyncSeekExt}};
use tokio_util::io::ReaderStream;
use tower_http::{cors::{AllowOrigin, CorsLayer}, services::{ServeDir, ServeFile}};
use uuid::Uuid;

const SESSION_COOKIE: &str = "onyx_session";
const SESSION_SECONDS: u64 = 60 * 60 * 24 * 30;
const USER_HEADER: &str = "x-home-media-user";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserStatus { running: bool, item_count: usize, ffprobe_available: bool, ffmpeg_available: bool, access_password_set: bool, artwork_cache_bytes: u64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthStatus { required: bool, authenticated: bool }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload { seconds: u64, watched_seconds: Option<u64> }
#[derive(Deserialize)] struct ResetPayload { ids: Vec<String> }
#[derive(Deserialize)] struct LoginPayload { password: String }
#[derive(Deserialize)] struct PlaylistNamePayload { name: String }
#[derive(Deserialize)] #[serde(rename_all = "camelCase")] struct PlaylistItemPayload { media_id: String }
#[derive(Deserialize)] #[serde(rename_all = "camelCase")] struct HiddenPayload { target_type: String, target_key: String, hidden: bool }
#[derive(Deserialize)] struct ThemePayload { theme: String }
#[derive(Deserialize)] struct ContinueWatchingPayload { split: bool }
#[derive(Deserialize)] #[serde(rename_all = "camelCase")] struct DevicePollPayload { device_code: String }
#[derive(Deserialize)] struct FunnelTogglePayload { enabled: bool }

fn now_seconds() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').map(str::trim).find_map(|part| part.strip_prefix(&format!("{SESSION_COOKIE}=")).map(str::to_string))
}
fn password_required(state: &crate::AppState) -> bool { state.settings.read().ok().and_then(|s| s.access_password_hash.clone()).is_some() }
fn valid_session(state: &crate::AppState, headers: &HeaderMap) -> bool {
    let Some(token) = cookie_token(headers) else { return false; };
    let now = now_seconds();
    let Ok(mut sessions) = state.sessions.write() else { return false; };
    sessions.retain(|_, expiry| *expiry > now);
    sessions.get(&token).is_some_and(|expiry| *expiry > now)
}
fn request_user(state: &crate::AppState, headers: &HeaderMap) -> String {
    let requested = headers.get(USER_HEADER).and_then(|v| v.to_str().ok()).unwrap_or(database::DEFAULT_USER_ID);
    if database::user_exists(&state.database_path, requested) { requested.to_string() } else { database::DEFAULT_USER_ID.to_string() }
}
async fn require_funnel_auth(State(state): State<Shared>, request: Request, next: Next) -> Response {
    if !password_required(&state) || valid_session(&state, request.headers()) { return next.run(request).await; }
    StatusCode::UNAUTHORIZED.into_response()
}
async fn direct_auth_status() -> Json<AuthStatus> {
    Json(AuthStatus { required: false, authenticated: true })
}
async fn funnel_auth_status(State(state): State<Shared>, headers: HeaderMap) -> Json<AuthStatus> {
    let required = password_required(&state);
    Json(AuthStatus { required, authenticated: !required || valid_session(&state, &headers) })
}
async fn direct_login() -> StatusCode { StatusCode::NO_CONTENT }
async fn funnel_login(State(state): State<Shared>, Json(payload): Json<LoginPayload>) -> Response {
    if !password_required(&state) { return StatusCode::NO_CONTENT.into_response(); }
    let hash = state.settings.read().ok().and_then(|s| s.access_password_hash.clone());
    let Some(hash) = hash else { return StatusCode::NO_CONTENT.into_response(); };
    let Ok(parsed) = PasswordHash::new(&hash) else { return StatusCode::INTERNAL_SERVER_ERROR.into_response(); };
    if Argon2::default().verify_password(payload.password.as_bytes(), &parsed).is_err() { return (StatusCode::UNAUTHORIZED, "Incorrect password").into_response(); }
    let token = Uuid::new_v4().to_string(); let expires = now_seconds() + SESSION_SECONDS;
    if state.sessions.write().map(|mut s| s.insert(token.clone(), expires)).is_err() { return StatusCode::INTERNAL_SERVER_ERROR.into_response(); }
    Response::builder().status(StatusCode::NO_CONTENT).header(header::SET_COOKIE, format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={SESSION_SECONDS}")).body(Body::empty()).unwrap()
}
async fn logout(State(state): State<Shared>, headers: HeaderMap) -> Response {
    if let Some(token) = cookie_token(&headers) { if let Ok(mut sessions) = state.sessions.write() { sessions.remove(&token); } }
    Response::builder().status(StatusCode::NO_CONTENT).header(header::SET_COOKIE, format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")).body(Body::empty()).unwrap()
}

fn enriched_library(state: &crate::AppState, user: &str, include_hidden: bool) -> Result<Vec<MediaItem>, String> {
    let mut items = database::load_library_for_user(&state.database_path, user, include_hidden)?;
    metadata::enrich_media(&state.database_path, &mut items)?;
    metadata_view::canonicalize(&state.database_path, &mut items)?;
    Ok(items)
}
async fn api_users(State(state): State<Shared>) -> Result<Json<Vec<UserProfile>>, StatusCode> { database::list_users(&state.database_path).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR) }
async fn api_library(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<Vec<MediaItem>>, StatusCode> {
    enriched_library(&state, &request_user(&state, &headers), false).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_preferences(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<UserPreferences>, StatusCode> {
    database::get_preferences(&state.database_path, &request_user(&state, &headers)).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_set_theme(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<ThemePayload>) -> Result<Json<UserPreferences>, StatusCode> {
    database::set_theme(&state.database_path, &request_user(&state, &headers), &payload.theme).map(Json).map_err(|_| StatusCode::BAD_REQUEST)
}
async fn api_set_continue_watching(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<ContinueWatchingPayload>) -> Result<Json<UserPreferences>, StatusCode> {
    database::set_split_continue_watching(&state.database_path, &request_user(&state, &headers), payload.split).map(Json).map_err(|_| StatusCode::BAD_REQUEST)
}
async fn api_analytics(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<EnrichedAnalyticsSummary>, StatusCode> {
    let user = request_user(&state, &headers);
    let core = database::analytics(&state.database_path, &user).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let genres = metadata::genre_watch_totals(&state.database_path, &user).unwrap_or_default();
    Ok(Json(EnrichedAnalyticsSummary::from_core(core, genres)))
}
fn command_available(name: &str) -> bool { crate::child_process::command(name).arg("-version").output().map(|o| o.status.success()).unwrap_or(false) }
async fn api_status(State(state): State<Shared>) -> Json<BrowserStatus> {
    let access_password_set = state.settings.read().ok().is_some_and(|settings| settings.access_password_hash.is_some());
    Json(BrowserStatus { running: true, item_count: state.media.read().map(|m| m.len()).unwrap_or(0), ffprobe_available: command_available("ffprobe"), ffmpeg_available: command_available("ffmpeg"), access_password_set, artwork_cache_bytes: artwork::cache_size(&state.artwork_path)+artwork::cache_size(&state.provider_path.join("metadata-images")) })
}

fn require_owner(state: &crate::AppState, headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    if database::is_admin(&state.database_path, &request_user(state, headers)) { Ok(()) }
    else { Err((StatusCode::FORBIDDEN, "Only the Owner profile can manage Funnel access.".into())) }
}
async fn api_funnel_status(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<crate::commands::FunnelStatus>, (StatusCode, String)> {
    require_owner(&state, &headers)?;
    let password_set = state.settings.read().map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Settings are unavailable.".into()))?.access_password_hash.is_some();
    Ok(Json(crate::commands::read_funnel_status(password_set)))
}
async fn api_set_funnel(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<FunnelTogglePayload>) -> Result<Json<crate::commands::FunnelStatus>, (StatusCode, String)> {
    require_owner(&state, &headers)?;
    crate::commands::set_funnel_enabled_for_state(payload.enabled, &state).map(Json).map_err(|error| (StatusCode::BAD_REQUEST, error))
}
async fn api_set_funnel_password(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<LoginPayload>) -> Result<StatusCode, (StatusCode, String)> {
    require_owner(&state, &headers)?;
    crate::commands::set_access_password_for_state(payload.password, &state).map(|_| StatusCode::NO_CONTENT).map_err(|error| (StatusCode::BAD_REQUEST, error))
}
async fn api_clear_funnel_password(State(state): State<Shared>, headers: HeaderMap) -> Result<StatusCode, (StatusCode, String)> {
    require_owner(&state, &headers)?;
    crate::commands::clear_access_password_for_state(&state).map(|_| StatusCode::NO_CONTENT).map_err(|error| (StatusCode::BAD_REQUEST, error))
}
async fn api_save_progress(State(state): State<Shared>, headers: HeaderMap, AxumPath(id): AxumPath<String>, Json(payload): Json<ProgressPayload>) -> StatusCode {
    let user = request_user(&state, &headers);
    if database::save_progress(&state.database_path, &user, &id, payload.seconds, payload.watched_seconds.unwrap_or(0)).is_err() { StatusCode::INTERNAL_SERVER_ERROR } else { StatusCode::NO_CONTENT }
}
async fn api_reset_progress(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<ResetPayload>) -> Result<Json<Vec<MediaItem>>, StatusCode> {
    let user = request_user(&state, &headers); database::reset_progress(&state.database_path, &user, &payload.ids).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    enriched_library(&state, &user, false).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_set_hidden(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<HiddenPayload>) -> Result<Json<Vec<MediaItem>>, StatusCode> {
    let user = request_user(&state, &headers); database::set_hidden(&state.database_path, &user, &payload.target_type, &payload.target_key, payload.hidden).map_err(|_| StatusCode::BAD_REQUEST)?;
    enriched_library(&state, &user, false).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_playlists(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<Vec<Playlist>>, StatusCode> { database::list_playlists(&state.database_path, &request_user(&state, &headers)).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR) }
async fn api_create_playlist(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<PlaylistNamePayload>) -> Result<Json<Vec<Playlist>>, StatusCode> {
    let user = request_user(&state, &headers); database::create_playlist(&state.database_path, &user, &payload.name).map_err(|_| StatusCode::BAD_REQUEST)?; database::list_playlists(&state.database_path, &user).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_add_playlist(State(state): State<Shared>, headers: HeaderMap, AxumPath(id): AxumPath<String>, Json(payload): Json<PlaylistItemPayload>) -> Result<Json<Vec<Playlist>>, StatusCode> {
    let user = request_user(&state, &headers); database::add_playlist_item(&state.database_path, &user, &id, &payload.media_id).map_err(|_| StatusCode::BAD_REQUEST)?; database::list_playlists(&state.database_path, &user).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_remove_playlist(State(state): State<Shared>, headers: HeaderMap, AxumPath(id): AxumPath<String>, Json(payload): Json<PlaylistItemPayload>) -> Result<Json<Vec<Playlist>>, StatusCode> {
    let user = request_user(&state, &headers); database::remove_playlist_item(&state.database_path, &user, &id, &payload.media_id).map_err(|_| StatusCode::BAD_REQUEST)?; database::list_playlists(&state.database_path, &user).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
async fn api_delete_playlist(State(state): State<Shared>, headers: HeaderMap, AxumPath(id): AxumPath<String>) -> Result<Json<Vec<Playlist>>, StatusCode> {
    let user = request_user(&state, &headers); database::delete_playlist(&state.database_path, &user, &id).map_err(|_| StatusCode::BAD_REQUEST)?; database::list_playlists(&state.database_path, &user).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn api_ibroadcast_status(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<ibroadcast::IbConnectionStatus>, StatusCode> { ibroadcast::status(&state, &request_user(&state, &headers)).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR) }
async fn api_ibroadcast_device_start(State(state): State<Shared>) -> Result<Json<ibroadcast::DeviceCodeResponse>, (StatusCode, String)> { ibroadcast::device_start(&state).await.map(Json).map_err(|e| (StatusCode::BAD_REQUEST, e)) }
async fn api_ibroadcast_device_poll(State(state): State<Shared>, headers: HeaderMap, Json(payload): Json<DevicePollPayload>) -> Result<Json<ibroadcast::DevicePollResponse>, (StatusCode, String)> { ibroadcast::device_poll(&state, &request_user(&state, &headers), &payload.device_code).await.map(Json).map_err(|e| (StatusCode::BAD_REQUEST, e)) }
async fn api_ibroadcast_sync(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<ibroadcast::IbLibrary>, (StatusCode, String)> { ibroadcast::sync_library(&state, &request_user(&state, &headers)).await.map(Json).map_err(|e| (StatusCode::BAD_GATEWAY, e)) }
async fn api_ibroadcast_library(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<ibroadcast::IbLibrary>, StatusCode> { ibroadcast::load_library(&state.provider_path, &request_user(&state, &headers)).map(Json).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR) }
async fn api_ibroadcast_disconnect(State(state): State<Shared>, headers: HeaderMap) -> Result<StatusCode, (StatusCode, String)> { ibroadcast::disconnect(&state, &request_user(&state, &headers)).map(|_| StatusCode::NO_CONTENT).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e)) }
async fn api_ibroadcast_stream(State(state): State<Shared>, headers: HeaderMap, AxumPath(track_id): AxumPath<String>) -> Response {
    let user = request_user(&state, &headers); let range = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).map(str::to_string);
    let upstream = match ibroadcast::stream_response(state, user, track_id, range).await { Ok(v) => v, Err(e) => return (StatusCode::BAD_GATEWAY, e).into_response() };
    let status = upstream.status(); let mut builder = Response::builder().status(status);
    for name in [header::CONTENT_TYPE, header::CONTENT_LENGTH, header::CONTENT_RANGE, header::ACCEPT_RANGES, header::CACHE_CONTROL] { if let Some(value) = upstream.headers().get(&name) { builder = builder.header(name, value); } }
    builder.body(Body::from_stream(upstream.bytes_stream())).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

async fn metadata_image(State(state): State<Shared>, AxumPath((size, file)): AxumPath<(String, String)>) -> Response {
    if !["w342", "w500", "w780", "w1280", "original"].contains(&size.as_str()) { return StatusCode::BAD_REQUEST.into_response(); }
    let decoded = urlencoding::decode(&file).map(|v| v.into_owned()).unwrap_or(file);
    if !decoded.starts_with('/') || decoded.contains("..") || decoded.contains('\\') { return StatusCode::BAD_REQUEST.into_response(); }
    let mut hasher = Sha256::new(); hasher.update(format!("{size}:{decoded}").as_bytes()); let key = hex::encode(hasher.finalize());
    let cache = state.provider_path.join("metadata-images").join(&size).join(format!("{key}.img"));
    if let Ok(bytes) = tokio::fs::read(&cache).await { return Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, "image/jpeg").header(header::CACHE_CONTROL, "private, max-age=2592000").body(Body::from(bytes)).unwrap(); }
    let response = match reqwest::Client::new().get(format!("https://image.tmdb.org/t/p/{size}{decoded}")).send().await { Ok(r) if r.status().is_success() => r, _ => return StatusCode::BAD_GATEWAY.into_response() };
    let mime = response.headers().get(header::CONTENT_TYPE).cloned().unwrap_or_else(|| HeaderValue::from_static("image/jpeg"));
    let bytes = match response.bytes().await { Ok(b) => b, Err(_) => return StatusCode::BAD_GATEWAY.into_response() };
    if let Some(parent) = cache.parent() { let _ = tokio::fs::create_dir_all(parent).await; } let _ = tokio::fs::write(&cache, &bytes).await;
    Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, mime).header(header::CACHE_CONTROL, "private, max-age=2592000").body(Body::from(bytes)).unwrap()
}

fn find_media(state: &crate::AppState, id: &str) -> Option<MediaItem> { state.media.read().ok()?.iter().find(|item| item.id == id).cloned() }
fn parse_range(headers: &HeaderMap, total: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) else { return Ok(None); };
    let Some(value) = value.strip_prefix("bytes=") else { return Err(()); }; if value.contains(',') { return Err(()); }
    let (start_text, end_text) = value.split_once('-').ok_or(())?;
    if start_text.is_empty() { let suffix = end_text.parse::<u64>().map_err(|_| ())?; if suffix == 0 { return Err(()); } return Ok(Some((total.saturating_sub(suffix), total.saturating_sub(1)))); }
    let start = start_text.parse::<u64>().map_err(|_| ())?; if start >= total { return Err(()); }
    let end = if end_text.is_empty() { total - 1 } else { end_text.parse::<u64>().map_err(|_| ())?.min(total - 1) }; if start > end { return Err(()); }
    Ok(Some((start, end)))
}
fn range_error(total: u64) -> Response { Response::builder().status(StatusCode::RANGE_NOT_SATISFIABLE).header(header::CONTENT_RANGE, format!("bytes */{total}")).body(Body::empty()).unwrap() }
async fn direct_file(path: &Path, headers: &HeaderMap) -> Response {
    let Ok(metadata) = tokio::fs::metadata(path).await else { return StatusCode::NOT_FOUND.into_response(); }; let total = metadata.len(); if total == 0 { return StatusCode::NO_CONTENT.into_response(); }
    let range = match parse_range(headers, total) { Ok(r) => r, Err(()) => return range_error(total) }; let (status, start, end) = match range { Some((s, e)) => (StatusCode::PARTIAL_CONTENT, s, e), None => (StatusCode::OK, 0, total - 1) };
    let Ok(mut file) = File::open(path).await else { return StatusCode::NOT_FOUND.into_response(); }; if start > 0 && file.seek(SeekFrom::Start(start)).await.is_err() { return StatusCode::INTERNAL_SERVER_ERROR.into_response(); }
    let length = end - start + 1; let body = Body::from_stream(ReaderStream::new(file.take(length))); let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
    let mut builder = Response::builder().status(status).header(header::CONTENT_TYPE, mime).header(header::CONTENT_LENGTH, length.to_string()).header(header::ACCEPT_RANGES, "bytes"); if status == StatusCode::PARTIAL_CONTENT { builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{total}")); } builder.body(body).unwrap()
}
async fn direct_stream(item: &MediaItem, headers: &HeaderMap) -> Response { direct_file(Path::new(&item.path),headers).await }
async fn api_sleep_videos(State(state):State<Shared>)->Json<crate::sleep_videos::SleepVideoStatus>{Json(crate::sleep_videos::status(&state))}
async fn sleep_video(State(state):State<Shared>,AxumPath(id):AxumPath<String>,headers:HeaderMap)->Response{let Some(path)=crate::sleep_videos::path_for_id(&state,&id)else{return StatusCode::NOT_FOUND.into_response()};direct_file(&path,&headers).await}
async fn ffmpeg_playback(item: &MediaItem, transcode: bool) -> Response {
    let mut command = crate::child_process::async_command("ffmpeg"); command.kill_on_drop(true).args(["-hide_banner", "-loglevel", "error", "-i"]).arg(&item.path).args(["-map", "0:v:0", "-map", "0:a:0?"]);
    if transcode { if item.height.is_some_and(|height|height>1080){command.args(["-vf","scale=-2:1080"]);} command.args(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "256k"]); } else { command.args(["-c:v", "copy", "-c:a", "copy"]); }
    command.args(["-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "pipe:1"]).stdout(Stdio::piped()).stderr(Stdio::null());
    let Ok(mut child) = command.spawn() else { return (StatusCode::SERVICE_UNAVAILABLE, "FFmpeg is required for this file but was not found or could not be started.").into_response(); }; let Some(stdout) = child.stdout.take() else { return StatusCode::INTERNAL_SERVER_ERROR.into_response(); }; tokio::spawn(async move { let _ = child.wait().await; });
    Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, "video/mp4").header(header::CACHE_CONTROL, "no-store").body(Body::from_stream(ReaderStream::new(stdout))).unwrap()
}
fn collection_allowed(state:&crate::AppState,item:&MediaItem,query:&HashMap<String,String>)->bool{!item.collection_protected||item.collection_source_id.as_deref().is_some_and(|id|crate::collection_sources::authorized(state,id,query.get("unlock").map(String::as_str)))}
pub async fn play_media(State(state): State<Shared>, AxumPath(id): AxumPath<String>,Query(query):Query<HashMap<String,String>>, headers: HeaderMap) -> Response { let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };if !collection_allowed(&state,&item,&query){return(StatusCode::UNAUTHORIZED,"This collection is locked").into_response()}match item.playback_mode.as_str() { "directPlay" => direct_stream(&item, &headers).await, "remux" => ffmpeg_playback(&item, false).await, _ => ffmpeg_playback(&item, true).await } }
pub async fn stream_media(State(state): State<Shared>, AxumPath(id): AxumPath<String>,Query(query):Query<HashMap<String,String>>, headers: HeaderMap) -> Response { let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };if !collection_allowed(&state,&item,&query){return(StatusCode::UNAUTHORIZED,"This collection is locked").into_response()}direct_stream(&item, &headers).await }
pub async fn artwork_route(State(state): State<Shared>, AxumPath((id, kind)): AxumPath<(String, String)>) -> Response {
    if !["poster", "backdrop", "thumbnail"].contains(&kind.as_str()) { return StatusCode::NOT_FOUND.into_response(); } let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let cache_root = state.artwork_path.clone(); let item_for_work = item.clone(); let kind_for_work = kind.clone(); let path = tokio::task::spawn_blocking(move || artwork::ensure(&cache_root, &item_for_work, &kind_for_work)).await.ok().flatten(); let Some(path) = path else { return StatusCode::NOT_FOUND.into_response(); }; let Ok(bytes) = tokio::fs::read(&path).await else { return StatusCode::NOT_FOUND.into_response(); }; let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string(); Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, mime).header(header::CACHE_CONTROL, "private, max-age=604800").body(Body::from(bytes)).unwrap()
}
fn srt_to_vtt(raw: &str) -> String { let converted = raw.lines().map(|line| if line.contains("-->") { line.replace(',', ".") } else { line.to_string() }).collect::<Vec<_>>().join("\n"); format!("WEBVTT\n\n{converted}") }
pub async fn subtitle(State(state): State<Shared>, AxumPath((id, filename)): AxumPath<(String, String)>) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); }; let decoded = urlencoding::decode(&filename).map(|v| v.into_owned()).unwrap_or(filename); if decoded.contains('/') || decoded.contains('\\') || decoded == ".." { return StatusCode::FORBIDDEN.into_response(); } let Some(parent) = Path::new(&item.path).parent() else { return StatusCode::NOT_FOUND.into_response(); }; let path = parent.join(decoded); let Ok(raw) = tokio::fs::read_to_string(&path).await else { return StatusCode::NOT_FOUND.into_response(); }; let content = if path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("srt")).unwrap_or(false) { srt_to_vtt(&raw) } else { raw }; let mut response = content.into_response(); response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/vtt; charset=utf-8")); response
}
pub async fn embedded_subtitle(State(state): State<Shared>, AxumPath((id, stream_index)): AxumPath<(String, u32)>) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); }; if !item.subtitles.iter().any(|track| track.embedded && track.stream_index == Some(stream_index)) { return StatusCode::NOT_FOUND.into_response(); }
    let output = crate::child_process::async_command("ffmpeg").args(["-hide_banner", "-loglevel", "error", "-i"]).arg(&item.path).arg("-map").arg(format!("0:{stream_index}")).args(["-f", "webvtt", "pipe:1"]).output().await; let Ok(output) = output else { return (StatusCode::SERVICE_UNAVAILABLE, "FFmpeg is required to extract embedded subtitles.").into_response(); }; if !output.status.success() { return StatusCode::UNPROCESSABLE_ENTITY.into_response(); } Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE, "text/vtt; charset=utf-8").header(header::CACHE_CONTROL, "private, max-age=3600").body(Body::from(output.stdout)).unwrap()
}
async fn dev_browser_redirect() -> Html<&'static str> { Html(r#"<!doctype html><meta charset=\"utf-8\"><title>Onyx</title><script>location.replace('http://'+location.hostname+':1420'+location.pathname+location.search+location.hash)</script><p>Opening Onyx…</p>"#) }

fn protected_router() -> Router<Shared> {
    Router::new()
        .route("/api/users", get(api_users)).route("/api/library", get(api_library))
        .route("/api/preferences", get(api_preferences)).route("/api/preferences/theme", post(api_set_theme)).route("/api/preferences/continue-watching", post(api_set_continue_watching))
        .route("/api/analytics", get(api_analytics)).route("/api/progress/{id}", post(api_save_progress))
        .route("/api/progress/reset", post(api_reset_progress)).route("/api/hidden", post(api_set_hidden))
        .route("/api/playlists", get(api_playlists).post(api_create_playlist)).route("/api/playlists/{id}/add", post(api_add_playlist))
        .route("/api/playlists/{id}/remove", post(api_remove_playlist)).route("/api/playlists/{id}/delete", post(api_delete_playlist))
        .route("/api/ibroadcast/status", get(api_ibroadcast_status)).route("/api/ibroadcast/device/start", post(api_ibroadcast_device_start))
        .route("/api/ibroadcast/device/poll", post(api_ibroadcast_device_poll)).route("/api/ibroadcast/library", get(api_ibroadcast_library))
        .route("/api/ibroadcast/sync", post(api_ibroadcast_sync)).route("/api/ibroadcast/disconnect", post(api_ibroadcast_disconnect))
        .route("/api/ibroadcast/stream/{track_id}", get(api_ibroadcast_stream)).route("/api/metadata/image/{size}/{file}", get(metadata_image))
        .route("/play/{id}", get(play_media)).route("/stream/{id}", get(stream_media)).route("/art/{id}/{kind}", get(artwork_route))
        .route("/subtitle/{id}/embedded/{stream_index}", get(embedded_subtitle)).route("/subtitle/{id}/{filename}", get(subtitle))
        .route("/api/sleep-videos",get(api_sleep_videos)).route("/sleep-video/{id}",get(sleep_video))
        .merge(crate::live_server::router())
}

fn finish_router(router: Router<Shared>, state: Shared, web_root: Option<PathBuf>) -> Router {
    let user_header = HeaderName::from_static(USER_HEADER);
    let cors = CorsLayer::new().allow_origin(AllowOrigin::mirror_request()).allow_methods([Method::GET, Method::POST, Method::DELETE]).allow_headers([header::CONTENT_TYPE, header::RANGE, user_header]).allow_credentials(true);
    let router = router.layer(cors).with_state(state);
    let router = if let Some(root) = web_root.filter(|p| p.join("index.html").is_file()) { router.fallback_service(ServeDir::new(&root).append_index_html_on_directories(true).not_found_service(ServeFile::new(root.join("index.html")))) } else { router.fallback(dev_browser_redirect) };
    router
}

pub async fn start(state: Shared, port: u16, funnel_port: u16, web_root: Option<PathBuf>) {
    let direct = Router::new().route("/api/status", get(api_status)).route("/api/auth/status", get(direct_auth_status)).route("/api/auth/login", post(direct_login)).route("/api/auth/logout", post(logout))
        .route("/api/admin/funnel", get(api_funnel_status).post(api_set_funnel))
        .route("/api/admin/funnel/password", post(api_set_funnel_password).delete(api_clear_funnel_password))
        .merge(protected_router());
    let direct = finish_router(direct, state.clone(), web_root.clone());
    let funnel_protected = protected_router().route_layer(middleware::from_fn_with_state(state.clone(), require_funnel_auth));
    let funnel = Router::new().route("/api/status", get(api_status)).route("/api/auth/status", get(funnel_auth_status)).route("/api/auth/login", post(funnel_login)).route("/api/auth/logout", post(logout)).merge(funnel_protected);
    let funnel = finish_router(funnel, state, web_root);

    let funnel_address = SocketAddr::from(([127, 0, 0, 1], funnel_port));
    tokio::spawn(async move {
        match tokio::net::TcpListener::bind(funnel_address).await {
            Ok(listener) => { println!("Onyx Funnel gateway listening on http://{funnel_address}"); if let Err(error) = axum::serve(listener, funnel.into_make_service_with_connect_info::<SocketAddr>()).await { eprintln!("Funnel gateway stopped: {error}"); } }
            Err(error) => eprintln!("Could not start Funnel gateway on {funnel_address}: {error}"),
        }
    });
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    match tokio::net::TcpListener::bind(address).await {
        Ok(listener) => { println!("Onyx browser server listening on http://0.0.0.0:{port}"); if let Err(error) = axum::serve(listener, direct.into_make_service_with_connect_info::<SocketAddr>()).await { eprintln!("Media server stopped: {error}"); } }
        Err(error) => eprintln!("Could not start media server on {address}: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_range;
    use axum::http::{header, HeaderMap, HeaderValue};
    fn range(value: &str) -> HeaderMap { let mut headers = HeaderMap::new(); headers.insert(header::RANGE, HeaderValue::from_str(value).unwrap()); headers }
    #[test] fn parses_normal_range() { assert_eq!(parse_range(&range("bytes=100-199"), 1000), Ok(Some((100, 199)))) }
    #[test] fn parses_open_ended_range() { assert_eq!(parse_range(&range("bytes=900-"), 1000), Ok(Some((900, 999)))) }
    #[test] fn parses_suffix_range() { assert_eq!(parse_range(&range("bytes=-100"), 1000), Ok(Some((900, 999)))) }
    #[test] fn rejects_range_past_end() { assert!(parse_range(&range("bytes=1000-"), 1000).is_err()) }
}
