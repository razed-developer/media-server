use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub label: String,
    pub language: String,
    pub url: Option<String>,
    pub stream_index: Option<u32>,
    pub embedded: bool,
    pub format: Option<String>,
    pub forced: bool,
    pub default: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub year: Option<u16>,
    pub kind: String,
    pub show_title: Option<String>,
    pub season: Option<u16>,
    pub episode: Option<u16>,
    pub episode_end: Option<u16>,
    pub path: String,
    pub stream_url: String,
    #[serde(default)] pub poster_url: Option<String>,
    #[serde(default)] pub backdrop_url: Option<String>,
    #[serde(default)] pub thumbnail_url: Option<String>,
    pub subtitles: Vec<SubtitleTrack>,
    pub progress_seconds: u64,
    pub duration_seconds: Option<u64>,
    pub container: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub playback_mode: String,
    #[serde(default)] pub added_at: Option<i64>,
    #[serde(default)] pub last_watched_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: String,
    pub name: String,
    pub is_admin: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub theme: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub media_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEntry {
    pub label: String,
    pub seconds: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSummary {
    pub total_seconds: u64,
    pub movie_seconds: u64,
    pub tv_seconds: u64,
    pub shows: Vec<AnalyticsEntry>,
}

#[derive(Debug, Default)]
pub struct ParsedName {
    pub title: String,
    pub year: Option<u16>,
    pub show_title: Option<String>,
    pub season: Option<u16>,
    pub episode: Option<u16>,
    pub episode_end: Option<u16>,
    pub kind: String,
}

#[derive(Debug, Default)]
pub struct ProbeResult {
    pub duration_seconds: Option<u64>,
    pub container: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub subtitles: Vec<ProbeSubtitle>,
}

#[derive(Debug, Default)]
pub struct ProbeSubtitle {
    pub index: u32,
    pub codec: Option<String>,
    pub language: String,
    pub title: Option<String>,
    pub forced: bool,
    pub default: bool,
}
