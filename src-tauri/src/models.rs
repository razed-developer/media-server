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
    #[serde(default)] pub metadata_entity_id: Option<String>,
    #[serde(default)] pub overview: Option<String>,
    #[serde(default)] pub genres: Vec<String>,
    #[serde(default)] pub rating: Option<f64>,
    #[serde(default)] pub release_date: Option<String>,
    #[serde(default)] pub provider: Option<String>,
    #[serde(default)] pub provider_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile { pub id: String, pub name: String, pub is_admin: bool }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences { pub theme: String }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist { pub id: String, pub name: String, pub media_ids: Vec<String> }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsEntry { pub label: String, pub seconds: u64 }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsSummary {
    pub total_seconds: u64,
    pub movie_seconds: u64,
    pub tv_seconds: u64,
    pub shows: Vec<AnalyticsEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichedAnalyticsSummary {
    pub total_seconds: u64,
    pub movie_seconds: u64,
    pub tv_seconds: u64,
    pub shows: Vec<AnalyticsEntry>,
    pub genres: Vec<AnalyticsEntry>,
}
impl EnrichedAnalyticsSummary {
    pub fn from_core(core: AnalyticsSummary, genres: Vec<AnalyticsEntry>) -> Self {
        Self { total_seconds: core.total_seconds, movie_seconds: core.movie_seconds, tv_seconds: core.tv_seconds, shows: core.shows, genres }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEntity {
    pub id: String,
    pub entity_type: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<u16>,
    pub overview: Option<String>,
    pub release_date: Option<String>,
    pub runtime_minutes: Option<u32>,
    pub season_number: Option<u16>,
    pub episode_number: Option<u16>,
    pub genres: Vec<String>,
    pub rating: Option<f64>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub still_path: Option<String>,
    pub metadata_json: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMatch {
    pub entity_id: String,
    pub provider: String,
    pub provider_id: String,
    pub matched_by: String,
    pub confidence: Option<f64>,
    pub locked: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSearchResult {
    pub provider: String,
    pub provider_id: String,
    pub entity_type: String,
    pub title: String,
    pub year: Option<u16>,
    pub overview: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub rating: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataProviderStatus {
    pub provider: String,
    pub configured: bool,
    pub enabled: bool,
    pub primary: bool,
    pub attribution: String,
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
