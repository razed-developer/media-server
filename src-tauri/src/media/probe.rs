use crate::library::models::SubtitleTrack;
use serde_json::Value;
use std::{path::Path, process::Command};

#[derive(Default)]
pub struct ProbeInfo {
    pub duration_seconds: Option<u64>,
    pub container: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub subtitles: Vec<SubtitleTrack>,
}

pub fn available() -> bool {
    Command::new("ffprobe").arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}

pub fn probe(path: &Path) -> ProbeInfo {
    let output = match Command::new("ffprobe")
        .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return ProbeInfo::default(),
    };

    let value: Value = match serde_json::from_slice(&output.stdout) {
        Ok(value) => value,
        Err(_) => return ProbeInfo::default(),
    };

    let mut info = ProbeInfo::default();
    info.container = value.get("format").and_then(|f| f.get("format_name")).and_then(Value::as_str).map(|s| s.split(',').next().unwrap_or(s).to_string());
    info.duration_seconds = value.get("format").and_then(|f| f.get("duration")).and_then(Value::as_str).and_then(|s| s.parse::<f64>().ok()).map(|v| v.round() as u64);

    if let Some(streams) = value.get("streams").and_then(Value::as_array) {
        for stream in streams {
            match stream.get("codec_type").and_then(Value::as_str) {
                Some("video") if info.video_codec.is_none() => {
                    info.video_codec = stream.get("codec_name").and_then(Value::as_str).map(str::to_string);
                    info.width = stream.get("width").and_then(Value::as_u64).map(|v| v as u32);
                    info.height = stream.get("height").and_then(Value::as_u64).map(|v| v as u32);
                }
                Some("audio") if info.audio_codec.is_none() => {
                    info.audio_codec = stream.get("codec_name").and_then(Value::as_str).map(str::to_string);
                }
                Some("subtitle") => {
                    let index = stream.get("index").and_then(Value::as_u64).map(|v| v as u32);
                    let format = stream.get("codec_name").and_then(Value::as_str).unwrap_or("subtitle").to_string();
                    let tags = stream.get("tags");
                    let language = tags.and_then(|t| t.get("language")).and_then(Value::as_str).unwrap_or("und").to_string();
                    let label = tags.and_then(|t| t.get("title")).and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| language.to_uppercase());
                    info.subtitles.push(SubtitleTrack {
                        label,
                        language,
                        url: None,
                        source: "embedded".into(),
                        format,
                        stream_index: index,
                    });
                }
                _ => {}
            }
        }
    }

    info
}
