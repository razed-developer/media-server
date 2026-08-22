use crate::{activity, Shared};
use chrono::Utc;
use keyring::Entry;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, RANGE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, fs, path::{Path, PathBuf}};

const OAUTH_BASE: &str = "https://oauth.ibroadcast.com";
const API_BASE: &str = "https://api.ibroadcast.com";
const LIBRARY_BASE: &str = "https://library.ibroadcast.com";
const DEFAULT_ARTWORK_BASE: &str = "https://artwork.ibroadcast.com";
const DEFAULT_STREAMING_BASE: &str = "https://streaming.ibroadcast.com";
const APP_VERSION: &str = "0.1.0";
const APP_CLIENT: &str = "onyx";
const DEVICE_NAME: &str = "Onyx Media Server";
const USER_AGENT_VALUE: &str = "Onyx/0.1.0";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub album: String,
    pub album_id: Option<String>,
    pub duration_seconds: u64,
    pub artwork_url: Option<String>,
    pub source_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbAlbum {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub artist_id: Option<String>,
    pub year: Option<u16>,
    pub track_ids: Vec<String>,
    pub artwork_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbArtist {
    pub id: String,
    pub name: String,
    pub artwork_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbPlaylist {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<String>,
    pub artwork_url: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbLibrary {
    pub tracks: Vec<IbTrack>,
    pub albums: Vec<IbAlbum>,
    pub artists: Vec<IbArtist>,
    pub playlists: Vec<IbPlaylist>,
    pub synced_at: Option<i64>,
    pub streaming_server: Option<String>,
    pub provider_user_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IbConnectionStatus {
    pub configured: bool,
    pub connected: bool,
    pub provider_user: Option<String>,
    pub last_sync_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePollResponse {
    pub pending: bool,
    pub connected: bool,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct TokenRecord {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
    provider_user: Option<String>,
}

fn keyring_entry(user_id: &str) -> Result<Entry, String> {
    Entry::new("Onyx iBroadcast", &format!("{}:profile:{user_id}", crate::app_state::credential_scope()))
        .map_err(|e| format!("Could not open secure credential store: {e}"))
}

fn save_token(user_id: &str, token: &TokenRecord) -> Result<(), String> {
    let raw = serde_json::to_string(token).map_err(|e| e.to_string())?;
    keyring_entry(user_id)?.set_password(&raw).map_err(|e| format!("Could not save iBroadcast credentials: {e}"))
}

fn load_token(user_id: &str) -> Result<Option<TokenRecord>, String> {
    match keyring_entry(user_id)?.get_password() {
        Ok(raw) => serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string()),
        Err(keyring::Error::NoEntry) if !crate::app_state::portable_mode() => {
            let legacy = Entry::new("Onyx iBroadcast", &format!("profile:{user_id}")).map_err(|e| e.to_string())?;
            match legacy.get_password() {
                Ok(raw) => { keyring_entry(user_id)?.set_password(&raw).map_err(|e| e.to_string())?; serde_json::from_str(&raw).map(Some).map_err(|e| e.to_string()) }
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(format!("Could not read iBroadcast credentials: {e}")),
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read iBroadcast credentials: {e}")),
    }
}
pub(crate) fn export_token(user_id:&str)->Option<String>{let token=load_token(user_id).ok().flatten()?;serde_json::to_string(&token).ok()}
pub(crate) fn import_token(user_id:&str,raw:&str)->Result<(),String>{let _:TokenRecord=serde_json::from_str(raw).map_err(|_|"Invalid iBroadcast credentials in backup".to_string())?;keyring_entry(user_id)?.set_password(raw).map_err(|e|format!("Could not restore iBroadcast credentials: {e}"))}

fn delete_token(user_id: &str) -> Result<(), String> {
    match keyring_entry(user_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove iBroadcast credentials: {e}")),
    }
}

fn profile_dir(root: &Path, user_id: &str) -> PathBuf { root.join("ibroadcast").join(user_id) }
fn cache_path(root: &Path, user_id: &str) -> PathBuf { profile_dir(root, user_id).join("library.json") }

fn save_library(root: &Path, user_id: &str, library: &IbLibrary) -> Result<(), String> {
    let path = cache_path(root, user_id);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(path, serde_json::to_vec(library).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn load_library(root: &Path, user_id: &str) -> Result<IbLibrary, String> {
    let path = cache_path(root, user_id);
    if !path.is_file() { return Ok(IbLibrary::default()); }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn client_id(state: &crate::app_state::AppState) -> Result<String, String> {
    state.settings.read().map_err(|_| "Settings lock poisoned".to_string())?
        .ibroadcast_client_id.clone().filter(|v| !v.trim().is_empty())
        .ok_or_else(|| "Set the iBroadcast client ID in Settings → Music before connecting.".to_string())
}

fn common_body(mode: &str) -> Value {
    json!({
        "client": APP_CLIENT,
        "version": APP_VERSION,
        "device_name": DEVICE_NAME,
        "user_agent": USER_AGENT_VALUE,
        "mode": mode,
    })
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent(USER_AGENT_VALUE).build().map_err(|e| e.to_string())
}

async fn refresh_if_needed(state: &crate::app_state::AppState, user_id: &str) -> Result<TokenRecord, String> {
    let mut token = load_token(user_id)?.ok_or_else(|| "iBroadcast is not connected for this profile.".to_string())?;
    let should_refresh = token.expires_at.is_some_and(|expires| expires <= Utc::now().timestamp() + 60);
    if !should_refresh { return Ok(token); }
    let refresh = token.refresh_token.clone().ok_or_else(|| "iBroadcast session expired. Reconnect this profile.".to_string())?;
    let id = client_id(state)?;
    let response = http()?.post(format!("{OAUTH_BASE}/token"))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", id.as_str()),
            ("redirect_uri", crate::ibroadcast_oauth::REDIRECT_URI),
        ])
        .send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("iBroadcast token refresh failed ({status}): {}", value.get("error_description").and_then(Value::as_str).or_else(|| value.get("error").and_then(Value::as_str)).unwrap_or("unknown error"))); }
    token.access_token = value.get("access_token").and_then(Value::as_str).ok_or("iBroadcast refresh response did not include an access token")?.to_string();
    token.refresh_token = value.get("refresh_token").and_then(Value::as_str).map(str::to_string).or(token.refresh_token);
    token.expires_at = value.get("expires_in").and_then(Value::as_i64).map(|seconds| Utc::now().timestamp() + seconds);
    save_token(user_id, &token)?;
    Ok(token)
}

async fn api_post(token: &str, endpoint: &str, mode: &str) -> Result<Value, String> {
    let response = http()?.post(endpoint)
        .header(CONTENT_TYPE, "application/json")
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .json(&common_body(mode))
        .send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() || value.get("result").and_then(Value::as_bool) == Some(false) {
        return Err(value.get("message").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("iBroadcast request failed ({status})")));
    }
    Ok(value)
}

pub async fn device_start(state: &crate::app_state::AppState) -> Result<DeviceCodeResponse, String> {
    let id = client_id(state)?;
    let scopes = "user.account:read user.library:read offline_access";
    let client = http()?;
    let url = reqwest::Url::parse_with_params(&format!("{OAUTH_BASE}/device/code"), &[("client_id", id.as_str()), ("scope", scopes)]).map_err(|e| e.to_string())?;
    let mut response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        response = client.post(format!("{OAUTH_BASE}/device/code")).header(CONTENT_TYPE, "application/x-www-form-urlencoded").form(&[("client_id", id.as_str()), ("scope", scopes)]).send().await.map_err(|e| e.to_string())?;
    }
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Could not start iBroadcast authorization ({status}): {}", value.get("error_description").and_then(Value::as_str).or_else(|| value.get("error").and_then(Value::as_str)).unwrap_or("unknown error"))); }
    Ok(DeviceCodeResponse {
        device_code: value.get("device_code").and_then(Value::as_str).ok_or("Missing device_code")?.to_string(),
        user_code: value.get("user_code").and_then(Value::as_str).ok_or("Missing user_code")?.to_string(),
        verification_uri: value.get("verification_uri").and_then(Value::as_str).ok_or("Missing verification_uri")?.to_string(),
        verification_uri_complete: value.get("verification_uri_complete").and_then(Value::as_str).map(str::to_string),
        interval: value.get("interval").and_then(Value::as_u64).unwrap_or(5),
        expires_in: value.get("expires_in").and_then(Value::as_u64).unwrap_or(600),
    })
}

pub async fn device_poll(state: &crate::app_state::AppState, user_id: &str, device_code: &str) -> Result<DevicePollResponse, String> {
    let id = client_id(state)?;
    let response = http()?.post(format!("{OAUTH_BASE}/token"))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&[("grant_type", "device_code"), ("device_code", device_code), ("client_id", id.as_str())])
        .send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let code = value.get("error").and_then(Value::as_str).unwrap_or("authorization_pending");
        if code == "authorization_pending" || code == "slow_down" {
            return Ok(DevicePollResponse { pending: true, connected: false, message: Some(code.replace('_', " ")) });
        }
        return Err(value.get("error_description").and_then(Value::as_str).unwrap_or(code).to_string());
    }
    let mut token = TokenRecord {
        access_token: value.get("access_token").and_then(Value::as_str).ok_or("Missing access_token")?.to_string(),
        refresh_token: value.get("refresh_token").and_then(Value::as_str).map(str::to_string),
        expires_at: value.get("expires_in").and_then(Value::as_i64).map(|s| Utc::now().timestamp() + s),
        provider_user: None,
    };
    if let Ok(status_value) = api_post(&token.access_token, &format!("{API_BASE}/status"), "status").await {
        token.provider_user = provider_user_label(&status_value);
    }
    save_token(user_id, &token)?;
    Ok(DevicePollResponse { pending: false, connected: true, message: token.provider_user.clone() })
}

fn provider_user_label(value: &Value) -> Option<String> {
    let user = value.get("user").or_else(|| value.get("status").and_then(|s| s.get("user")))?;
    user.get("email").or_else(|| user.get("username")).or_else(|| user.get("name")).and_then(Value::as_str).map(str::to_string)
}

fn provider_user_id(value: &Value) -> Option<String> {
    let user = value.get("user").or_else(|| value.get("status").and_then(|s| s.get("user"))).cloned().unwrap_or_else(|| json!({}));
    for key in ["user_id", "userid", "id"] {
        if let Some(v) = user.get(key).or_else(|| value.get("status").and_then(|s| s.get(key))) {
            if let Some(s) = v.as_str() { return Some(s.to_string()); }
            if let Some(n) = v.as_i64() { return Some(n.to_string()); }
            if let Some(n) = v.as_u64() { return Some(n.to_string()); }
        }
    }
    None
}

pub async fn sync_library(state: &crate::app_state::AppState, user_id: &str) -> Result<IbLibrary, String> {
    let token = refresh_if_needed(state, user_id).await?;
    activity::info("iBroadcast", format!("Syncing music library for profile {user_id}"));
    let status = api_post(&token.access_token, &format!("{API_BASE}/status"), "status").await?;
    let library_response = api_post(&token.access_token, LIBRARY_BASE, "library").await?;
    let mut library = parse_library(&library_response, &status);
    library.synced_at = Some(Utc::now().timestamp());
    library.provider_user_id = provider_user_id(&status);
    library.streaming_server = status.get("settings")
        .or_else(|| status.get("status").and_then(|s| s.get("settings")))
        .and_then(|s| s.get("streaming_server")).and_then(Value::as_str).map(str::to_string)
        .or_else(|| status.get("streaming_server").and_then(Value::as_str).map(str::to_string))
        .or_else(|| Some(DEFAULT_STREAMING_BASE.to_string()));
    let missing_paths = library.tracks.iter().filter(|track| track.source_path.is_none()).count();
    activity::info("iBroadcast", format!("Music library synced: {} tracks, {} albums, {} artists; {} tracks missing stream paths", library.tracks.len(), library.albums.len(), library.artists.len(), missing_paths));
    save_library(&state.provider_path, user_id, &library)?;
    Ok(library)
}

pub fn status(state: &crate::app_state::AppState, user_id: &str) -> Result<IbConnectionStatus, String> {
    let configured = state.settings.read().map_err(|_| "Settings lock poisoned")?.ibroadcast_client_id.as_ref().is_some_and(|v| !v.trim().is_empty());
    let token = load_token(user_id)?;
    let cache = load_library(&state.provider_path, user_id).unwrap_or_default();
    Ok(IbConnectionStatus { configured, connected: token.is_some(), provider_user: token.and_then(|t| t.provider_user), last_sync_at: cache.synced_at })
}

pub fn disconnect(state: &crate::app_state::AppState, user_id: &str) -> Result<(), String> {
    delete_token(user_id)?;
    let path = profile_dir(&state.provider_path, user_id);
    if path.exists() { let _ = fs::remove_dir_all(path); }
    Ok(())
}

pub async fn stream_response(state: Shared, user_id: String, track_id: String, range: Option<String>) -> Result<reqwest::Response, String> {
    let token = refresh_if_needed(&state, &user_id).await?;
    let mut library = load_library(&state.provider_path, &user_id)?;
    let needs_resync = library.tracks.iter().find(|t| t.id == track_id).and_then(|track| track.source_path.as_ref()).is_none()
        || library.provider_user_id.is_none() || library.streaming_server.is_none();
    if needs_resync {
        activity::info("iBroadcast", format!("Refreshing cached library before streaming track {track_id}"));
        library = sync_library(&state, &user_id).await?;
    }
    let track = library.tracks.iter().find(|t| t.id == track_id).ok_or("Track not found in cached iBroadcast library")?;
    let source = track.source_path.as_ref().ok_or("Track has no iBroadcast streaming path after a fresh sync")?;
    let user = library.provider_user_id.as_ref().ok_or("iBroadcast status did not provide a user ID")?;
    let server = library.streaming_server.as_deref().unwrap_or(DEFAULT_STREAMING_BASE).trim_end_matches('/');
    let base = format!("{server}/{}", source.trim_start_matches('/'));
    let url = reqwest::Url::parse_with_params(&base, &[
        ("Expires", Utc::now().timestamp_millis().to_string()),
        ("Signature", token.access_token.clone()),
        ("file_id", track.id.clone()),
        ("user_id", user.clone()),
        ("platform", APP_CLIENT.to_string()),
        ("version", APP_VERSION.to_string()),
    ]).map_err(|e| e.to_string())?;
    activity::info("iBroadcast", format!("Requesting audio for “{}” from stream path {}", track.title, source));
    let client = http()?;
    let mut request = client.get(url);
    if let Some(value) = range { request = request.header(RANGE, value); }
    let response = request.send().await.map_err(|e| {
        activity::error("iBroadcast", format!("Stream request failed for track {track_id}: {e}"));
        e.to_string()
    })?;
    let status = response.status();
    let content_type = response.headers().get(CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or("").to_string();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        let message = format!("iBroadcast stream failed ({status}, {content_type}): {}", detail.chars().take(300).collect::<String>());
        activity::error("iBroadcast", message.clone());
        return Err(message);
    }
    if content_type.starts_with("text/") || content_type.contains("json") || content_type.contains("html") {
        let detail = response.text().await.unwrap_or_default();
        let message = format!("iBroadcast returned non-audio content ({content_type}): {}", detail.chars().take(300).collect::<String>());
        activity::error("iBroadcast", message.clone());
        return Err(message);
    }
    activity::info("iBroadcast", format!("Audio stream ready for “{}” ({status}, {})", track.title, if content_type.is_empty(){"content type not supplied"}else{&content_type}));
    Ok(response)
}

fn map_index(section: &Value, names: &[&str]) -> Option<usize> {
    let map = section.get("map")?.as_object()?;
    names.iter().find_map(|name| map.get(*name).and_then(Value::as_u64).map(|v| v as usize))
}
fn value_id(v: Option<&Value>) -> Option<String> { v.and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string()))) }
fn value_text(v: Option<&Value>, fallback: &str) -> String { v.and_then(Value::as_str).unwrap_or(fallback).to_string() }
fn value_ids(v: Option<&Value>) -> Vec<String> { v.and_then(Value::as_array).map(|a| a.iter().filter_map(|v| value_id(Some(v))).collect()).unwrap_or_default() }
fn artwork_url(base: &str, id: Option<String>) -> Option<String> { id.map(|id| format!("{}/artwork/{}-300", base.trim_end_matches('/'), id)) }

fn parse_library(response: &Value, status: &Value) -> IbLibrary {
    let root = response.get("library").unwrap_or(response);
    let artwork_base = response.get("settings").and_then(|s| s.get("artwork_server")).or_else(|| status.get("settings").and_then(|s| s.get("artwork_server"))).and_then(Value::as_str).unwrap_or(DEFAULT_ARTWORK_BASE);
    let artists_section = root.get("artists").unwrap_or(&Value::Null);
    let albums_section = root.get("albums").unwrap_or(&Value::Null);
    let tracks_section = root.get("tracks").unwrap_or(&Value::Null);
    let playlists_section = root.get("playlists").unwrap_or(&Value::Null);

    let artist_name_idx = map_index(artists_section, &["name", "title"]).unwrap_or(0);
    let artist_art_idx = map_index(artists_section, &["artwork_id", "artworkId"]);
    let mut artist_names = HashMap::new();
    let mut artists = Vec::new();
    if let Some(obj) = artists_section.as_object() {
        for (id, raw) in obj { if id == "map" { continue; } let arr = raw.as_array(); let name = value_text(arr.and_then(|a| a.get(artist_name_idx)), "Unknown Artist"); let art = artist_art_idx.and_then(|i| arr.and_then(|a| value_id(a.get(i)))); artist_names.insert(id.clone(), name.clone()); artists.push(IbArtist { id:id.clone(), name, artwork_url:artwork_url(artwork_base, art) }); }
    }

    let album_name_idx = map_index(albums_section, &["name", "title"]).unwrap_or(0);
    let album_tracks_idx = map_index(albums_section, &["tracks"]).unwrap_or(1);
    let album_artist_idx = map_index(albums_section, &["artist_id", "artistId"]);
    let album_year_idx = map_index(albums_section, &["year"]);
    let album_art_idx = map_index(albums_section, &["artwork_id", "artworkId"]);
    let mut album_names = HashMap::new();
    let mut album_artist_ids = HashMap::new();
    let mut albums = Vec::new();
    if let Some(obj) = albums_section.as_object() {
        for (id, raw) in obj { if id == "map" { continue; } let arr = raw.as_array(); let name=value_text(arr.and_then(|a|a.get(album_name_idx)),"Unknown Album"); let artist_id=album_artist_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i)))); let artist=artist_id.as_ref().and_then(|i|artist_names.get(i)).cloned().unwrap_or_else(||"Unknown Artist".into()); let year=album_year_idx.and_then(|i|arr.and_then(|a|a.get(i))).and_then(Value::as_u64).and_then(|v|u16::try_from(v).ok()); let tracks=value_ids(arr.and_then(|a|a.get(album_tracks_idx))); let art=album_art_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i)))); album_names.insert(id.clone(),name.clone()); if let Some(v)=artist_id.clone(){album_artist_ids.insert(id.clone(),v);} albums.push(IbAlbum{id:id.clone(),name,artist,artist_id,year,track_ids:tracks,artwork_url:artwork_url(artwork_base,art)}); }
    }

    let title_idx = map_index(tracks_section, &["title", "name"]).unwrap_or(2);
    let track_artist_idx = map_index(tracks_section, &["artist_id", "artistId"]);
    let track_album_idx = map_index(tracks_section, &["album_id", "albumId"]);
    let duration_idx = map_index(tracks_section, &["length", "duration"]);
    let art_idx = map_index(tracks_section, &["artwork_id", "artworkId"]);
    let file_idx = map_index(tracks_section, &["file", "url", "path", "location"]).unwrap_or(16);
    let mut tracks=Vec::new();
    if let Some(obj)=tracks_section.as_object(){for(id,raw)in obj{if id=="map"{continue}let arr=raw.as_array();let title=value_text(arr.and_then(|a|a.get(title_idx)),"Unknown Track");let album_id=track_album_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i))));let artist_id=track_artist_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i)))).or_else(||album_id.as_ref().and_then(|a|album_artist_ids.get(a).cloned()));let artist=artist_id.as_ref().and_then(|a|artist_names.get(a)).cloned().unwrap_or_else(||"Unknown Artist".into());let album=album_id.as_ref().and_then(|a|album_names.get(a)).cloned().unwrap_or_else(||"Unknown Album".into());let duration=duration_idx.and_then(|i|arr.and_then(|a|a.get(i))).and_then(Value::as_u64).unwrap_or(0);let art=art_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i))));let source=arr.and_then(|a|a.get(file_idx)).and_then(Value::as_str).map(str::to_string);tracks.push(IbTrack{id:id.clone(),title,artist,artist_id,album,album_id,duration_seconds:duration,artwork_url:artwork_url(artwork_base,art),source_path:source});}}

    let playlist_name_idx=map_index(playlists_section,&["name","title"]).unwrap_or(0);let playlist_tracks_idx=map_index(playlists_section,&["tracks"]).unwrap_or(1);let playlist_art_idx=map_index(playlists_section,&["artwork_id","artworkId"]);let mut playlists=Vec::new();if let Some(obj)=playlists_section.as_object(){for(id,raw)in obj{if id=="map"{continue}let arr=raw.as_array();let name=value_text(arr.and_then(|a|a.get(playlist_name_idx)),"Playlist");let track_ids=value_ids(arr.and_then(|a|a.get(playlist_tracks_idx)));let art=playlist_art_idx.and_then(|i|arr.and_then(|a|value_id(a.get(i))));playlists.push(IbPlaylist{id:id.clone(),name,track_ids,artwork_url:artwork_url(artwork_base,art)});}}

    artists.sort_by(|a,b|a.name.to_lowercase().cmp(&b.name.to_lowercase()));albums.sort_by(|a,b|a.artist.to_lowercase().cmp(&b.artist.to_lowercase()).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));tracks.sort_by(|a,b|a.artist.to_lowercase().cmp(&b.artist.to_lowercase()).then(a.album.to_lowercase().cmp(&b.album.to_lowercase())).then(a.title.to_lowercase().cmp(&b.title.to_lowercase())));playlists.sort_by(|a,b|a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    IbLibrary{tracks,albums,artists,playlists,synced_at:None,streaming_server:None,provider_user_id:None}
}
