use crate::{activity, database, metadata, metadata_view, models::{MediaItem, Playlist}, Shared};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, fs, path::{Path, PathBuf}};
use tauri::State as TauriState;
use uuid::Uuid;

const CHANNEL_DIR: &str = "live-channels";
const DEFAULT_HORIZON_SECONDS: i64 = 4 * 60 * 60;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveChannel {
    pub id: String,
    pub name: String,
    pub criteria_type: String,
    pub criteria_value: String,
    pub order_mode: String,
    pub anchor_time: i64,
    pub created_at: i64,
    #[serde(default)]
    pub art_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveChannelInput {
    pub id: Option<String>,
    pub name: String,
    pub criteria_type: String,
    pub criteria_value: String,
    pub order_mode: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideProgram {
    pub media_id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub starts_at: i64,
    pub ends_at: i64,
    pub offset_seconds: u64,
    pub duration_seconds: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuideChannel {
    pub channel: LiveChannel,
    pub current: Option<GuideProgram>,
    pub programs: Vec<GuideProgram>,
}

fn user_dir(root: &Path, user_id: &str) -> PathBuf { root.join(CHANNEL_DIR).join(user_id) }
fn channels_path(root: &Path, user_id: &str) -> PathBuf { user_dir(root, user_id).join("channels.json") }
fn art_dir(root: &Path) -> PathBuf { root.join(CHANNEL_DIR).join("art") }

fn possible_art(root: &Path, channel_id: &str) -> Option<PathBuf> {
    for extension in ["png", "jpg", "jpeg", "webp"] {
        let path = art_dir(root).join(format!("{channel_id}.{extension}"));
        if path.is_file() { return Some(path); }
    }
    None
}

fn decorate_art(root: &Path, channels: &mut [LiveChannel]) {
    for channel in channels {
        channel.art_url = possible_art(root, &channel.id).map(|_| format!("/api/live-channels/art/{}", channel.id));
    }
}

pub fn list(root: &Path, user_id: &str) -> Result<Vec<LiveChannel>, String> {
    let path = channels_path(root, user_id);
    if !path.is_file() { return Ok(Vec::new()); }
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let mut channels: Vec<LiveChannel> = serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
    decorate_art(root, &mut channels);
    Ok(channels)
}

fn persist(root: &Path, user_id: &str, channels: &[LiveChannel]) -> Result<(), String> {
    let path = channels_path(root, user_id);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let mut stored = channels.to_vec();
    for channel in &mut stored { channel.art_url = None; }
    fs::write(path, serde_json::to_vec_pretty(&stored).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn validate_input(input: &LiveChannelInput) -> Result<(), String> {
    if input.name.trim().is_empty() { return Err("Channel name cannot be empty".into()); }
    if !matches!(input.criteria_type.as_str(), "show" | "genre" | "playlist") { return Err("Channel criteria must be a TV show, genre, or playlist".into()); }
    if input.criteria_value.trim().is_empty() { return Err("Choose content for this channel".into()); }
    if !matches!(input.order_mode.as_str(), "sequential" | "shuffle") { return Err("Channel order must be sequential or shuffle".into()); }
    Ok(())
}

pub fn save(root: &Path, user_id: &str, input: LiveChannelInput) -> Result<Vec<LiveChannel>, String> {
    validate_input(&input)?;
    let mut channels = list(root, user_id)?;
    let now = Utc::now().timestamp();
    let id = input.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
    let next = LiveChannel {
        id: id.clone(),
        name: input.name.trim().to_string(),
        criteria_type: input.criteria_type,
        criteria_value: input.criteria_value,
        order_mode: input.order_mode,
        anchor_time: now,
        created_at: now,
        art_url: possible_art(root, &id).map(|_| format!("/api/live-channels/art/{id}")),
    };
    if let Some(index) = channels.iter().position(|channel| channel.id == id) {
        let created_at = channels[index].created_at;
        channels[index] = LiveChannel { created_at, ..next };
    } else {
        channels.push(next);
    }
    persist(root, user_id, &channels)?;
    activity::info("Live TV", format!("Saved channel “{}”", channels.iter().find(|channel| channel.id == id).map(|channel| channel.name.as_str()).unwrap_or("Channel")));
    decorate_art(root, &mut channels);
    Ok(channels)
}

pub fn delete(root: &Path, user_id: &str, channel_id: &str) -> Result<Vec<LiveChannel>, String> {
    let mut channels = list(root, user_id)?;
    let before = channels.len();
    channels.retain(|channel| channel.id != channel_id);
    if channels.len() == before { return Err("Live channel not found".into()); }
    persist(root, user_id, &channels)?;
    if let Some(path) = possible_art(root, channel_id) { let _ = fs::remove_file(path); }
    activity::info("Live TV", format!("Deleted live channel {channel_id}"));
    decorate_art(root, &mut channels);
    Ok(channels)
}

pub fn set_artwork(root: &Path, user_id: &str, channel_id: &str, source: &Path) -> Result<Vec<LiveChannel>, String> {
    let channels = list(root, user_id)?;
    if !channels.iter().any(|channel| channel.id == channel_id) { return Err("Live channel not found".into()); }
    if !source.is_file() { return Err("Selected artwork file does not exist".into()); }
    let extension = source.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp"].contains(&extension.as_str()) { return Err("Channel artwork must be PNG, JPG, JPEG, or WebP".into()); }
    fs::create_dir_all(art_dir(root)).map_err(|error| error.to_string())?;
    for old in ["png", "jpg", "jpeg", "webp"] {
        let path = art_dir(root).join(format!("{channel_id}.{old}"));
        if path.is_file() { let _ = fs::remove_file(path); }
    }
    fs::copy(source, art_dir(root).join(format!("{channel_id}.{extension}"))).map_err(|error| error.to_string())?;
    activity::info("Live TV", format!("Updated custom artwork for channel {channel_id}"));
    list(root, user_id)
}

pub fn artwork(root: &Path, channel_id: &str) -> Option<PathBuf> { possible_art(root, channel_id) }

fn deterministic_key(channel_id: &str, media_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(channel_id.as_bytes());
    hasher.update(b":");
    hasher.update(media_id.as_bytes());
    hex::encode(hasher.finalize())
}

fn sequential_sort(items: &mut [MediaItem]) {
    items.sort_by(|a, b| {
        let a_key = (a.show_title.as_deref().unwrap_or("").to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
        let b_key = (b.show_title.as_deref().unwrap_or("").to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase());
        a_key.cmp(&b_key)
    });
}

fn candidates(channel: &LiveChannel, media: &[MediaItem], playlists: &[Playlist]) -> Vec<MediaItem> {
    let mut values = match channel.criteria_type.as_str() {
        "show" => media.iter().filter(|item| item.kind == "episode" && item.show_title.as_deref().is_some_and(|title| title.eq_ignore_ascii_case(&channel.criteria_value))).cloned().collect::<Vec<_>>(),
        "genre" => media.iter().filter(|item| item.genres.iter().any(|genre| genre.eq_ignore_ascii_case(&channel.criteria_value))).cloned().collect::<Vec<_>>(),
        "playlist" => {
            let lookup: HashMap<&str, &MediaItem> = media.iter().map(|item| (item.id.as_str(), item)).collect();
            playlists.iter().find(|playlist| playlist.id == channel.criteria_value)
                .map(|playlist| playlist.media_ids.iter().filter_map(|id| lookup.get(id.as_str()).map(|item| (*item).clone())).collect())
                .unwrap_or_default()
        }
        _ => Vec::new(),
    };
    if channel.criteria_type != "playlist" { sequential_sort(&mut values); }
    if channel.order_mode == "shuffle" { values.sort_by_key(|item| deterministic_key(&channel.id, &item.id)); }
    values
}

fn duration(item: &MediaItem) -> u64 { item.duration_seconds.unwrap_or(if item.kind == "movie" { 7_200 } else { 1_800 }).max(1) }

fn subtitle(item: &MediaItem) -> Option<String> {
    if item.kind == "episode" {
        Some(match (item.show_title.as_deref(), item.season, item.episode) {
            (Some(show), Some(season), Some(episode)) => format!("{show} · S{season:02}E{episode:02}"),
            (Some(show), _, _) => show.to_string(),
            _ => "TV".to_string(),
        })
    } else { item.year.map(|year| year.to_string()) }
}

fn build_row(channel: LiveChannel, media: &[MediaItem], playlists: &[Playlist], now: i64, horizon_seconds: i64) -> GuideChannel {
    let queue = candidates(&channel, media, playlists);
    if queue.is_empty() { return GuideChannel { channel, current: None, programs: Vec::new() }; }
    let total: i64 = queue.iter().map(|item| duration(item) as i64).sum();
    if total <= 0 { return GuideChannel { channel, current: None, programs: Vec::new() }; }

    let elapsed = (now - channel.anchor_time).rem_euclid(total);
    let mut consumed = 0_i64;
    let mut current_index = 0_usize;
    let mut within = 0_i64;
    for (index, item) in queue.iter().enumerate() {
        let item_duration = duration(item) as i64;
        if elapsed < consumed + item_duration {
            current_index = index;
            within = elapsed - consumed;
            break;
        }
        consumed += item_duration;
    }

    let mut programs = Vec::new();
    let mut starts_at = now - within;
    let end_horizon = now + horizon_seconds.max(60 * 60);
    let mut index = current_index;
    let mut first = true;
    while starts_at < end_horizon || programs.len() < 8 {
        let item = &queue[index % queue.len()];
        let item_duration = duration(item);
        let ends_at = starts_at + item_duration as i64;
        programs.push(GuideProgram {
            media_id: item.id.clone(),
            title: item.title.clone(),
            subtitle: subtitle(item),
            starts_at,
            ends_at,
            offset_seconds: if first { within.max(0) as u64 } else { 0 },
            duration_seconds: item_duration,
        });
        first = false;
        starts_at = ends_at;
        index += 1;
        if programs.len() > 48 { break; }
    }
    let current = programs.first().cloned();
    GuideChannel { channel, current, programs }
}

pub fn guide(root: &Path, user_id: &str, media: &[MediaItem], playlists: &[Playlist], now: Option<i64>) -> Result<Vec<GuideChannel>, String> {
    let channels = list(root, user_id)?;
    let timestamp = now.unwrap_or_else(|| Utc::now().timestamp());
    Ok(channels.into_iter().map(|channel| build_row(channel, media, playlists, timestamp, DEFAULT_HORIZON_SECONDS)).collect())
}

fn enriched_user_media(state: &crate::app_state::AppState, user_id: &str) -> Result<Vec<MediaItem>, String> {
    if !database::user_exists(&state.database_path, user_id) { return Err("Unknown Onyx user".into()); }
    let mut items = database::load_library_for_user(&state.database_path, user_id, false)?;
    metadata::enrich_media(&state.database_path, &mut items)?;
    metadata_view::canonicalize(&state.database_path, &mut items)?;
    Ok(items)
}

#[tauri::command]
pub fn live_channels_list(user_id: String, state: TauriState<'_, Shared>) -> Result<Vec<LiveChannel>, String> {
    if !database::user_exists(&state.database_path, &user_id) { return Err("Unknown Onyx user".into()); }
    list(&state.provider_path, &user_id)
}

#[tauri::command]
pub fn live_channels_save(user_id: String, input: LiveChannelInput, state: TauriState<'_, Shared>) -> Result<Vec<LiveChannel>, String> {
    if !database::user_exists(&state.database_path, &user_id) { return Err("Unknown Onyx user".into()); }
    save(&state.provider_path, &user_id, input)
}

#[tauri::command]
pub fn live_channels_delete(user_id: String, channel_id: String, state: TauriState<'_, Shared>) -> Result<Vec<LiveChannel>, String> {
    if !database::user_exists(&state.database_path, &user_id) { return Err("Unknown Onyx user".into()); }
    delete(&state.provider_path, &user_id, &channel_id)
}

#[tauri::command]
pub fn live_channels_set_artwork(user_id: String, channel_id: String, path: String, state: TauriState<'_, Shared>) -> Result<Vec<LiveChannel>, String> {
    if !database::user_exists(&state.database_path, &user_id) { return Err("Unknown Onyx user".into()); }
    set_artwork(&state.provider_path, &user_id, &channel_id, Path::new(&path))
}

#[tauri::command]
pub fn live_channels_guide(user_id: String, state: TauriState<'_, Shared>) -> Result<Vec<GuideChannel>, String> {
    let media = enriched_user_media(&state, &user_id)?;
    let playlists = database::list_playlists(&state.database_path, &user_id)?;
    guide(&state.provider_path, &user_id, &media, &playlists, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn media(id: &str, duration_seconds: u64, episode: u16) -> MediaItem {
        MediaItem {
            id: id.into(), title: format!("Episode {episode}"), year: None, kind: "episode".into(), show_title: Some("Demo".into()), season: Some(1), episode: Some(episode), episode_end: None,
            path: String::new(), stream_url: String::new(), poster_url: None, backdrop_url: None, thumbnail_url: None, subtitles: vec![], progress_seconds: 0,
            duration_seconds: Some(duration_seconds), container: None, video_codec: None, audio_codec: None, width: None, height: None, playback_mode: "directPlay".into(), added_at: None,
            last_watched_at: None, metadata_entity_id: None, overview: None, genres: vec![], rating: None, release_date: None, provider: None, provider_id: None,
        }
    }

    #[test]
    fn schedule_advances_while_away() {
        let channel = LiveChannel { id: "c".into(), name: "Demo".into(), criteria_type: "show".into(), criteria_value: "Demo".into(), order_mode: "sequential".into(), anchor_time: 1_000, created_at: 1_000, art_url: None };
        let items = vec![media("a", 600, 1), media("b", 600, 2), media("c", 600, 3)];
        let row = build_row(channel, &items, &[], 2_200, 3_600);
        assert_eq!(row.current.as_ref().unwrap().media_id, "c");
        assert_eq!(row.programs[0].offset_seconds, 0);
        let later = build_row(row.channel, &items, &[], 2_500, 3_600);
        assert_eq!(later.current.unwrap().media_id, "c");
        assert_eq!(later.programs[0].offset_seconds, 300);
    }
}
