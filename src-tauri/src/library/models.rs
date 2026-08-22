use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub label: String,
    pub language: String,
    pub url: Option<String>,
    pub source: String,
    pub format: String,
    pub stream_index: Option<u32>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub year: Option<u16>,
    pub kind: String,
    pub show_title: Option<String>,
    pub season: Option<u16>,
    pub episode: Option<u16>,
    pub path: String,
    pub stream_url: String,
    pub subtitles: Vec<SubtitleTrack>,
    pub progress_seconds: u64,
    pub duration_seconds: Option<u64>,
    pub container: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub playback_mode: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub local_url: String,
    pub library_path: Option<String>,
    pub item_count: usize,
    pub ffprobe_available: bool,
}
