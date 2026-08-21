use crate::models::{ProbeResult, ProbeSubtitle};
use serde_json::Value;
use std::{path::Path, process::Command};

pub fn inspect(path: &Path) -> ProbeResult {
    let output = crate::child_process::command("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .output();

    let Ok(output) = output else { return ProbeResult::default(); };
    if !output.status.success() { return ProbeResult::default(); }
    let Ok(value) = serde_json::from_slice::<Value>(&output.stdout) else { return ProbeResult::default(); };

    let format = value.get("format");
    let duration_seconds = format
        .and_then(|f| f.get("duration"))
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<f64>().ok())
        .map(|v| v.round() as u64);
    let container = format
        .and_then(|f| f.get("format_name"))
        .and_then(Value::as_str)
        .map(|s| s.split(',').next().unwrap_or(s).to_string());

    let mut result = ProbeResult { duration_seconds, container, ..Default::default() };

    if let Some(streams) = value.get("streams").and_then(Value::as_array) {
        for stream in streams {
            let codec_type = stream.get("codec_type").and_then(Value::as_str).unwrap_or_default();
            let codec = stream.get("codec_name").and_then(Value::as_str).map(str::to_string);
            match codec_type {
                "video" if result.video_codec.is_none() => {
                    result.video_codec = codec;
                    result.width = stream.get("width").and_then(Value::as_u64).map(|v| v as u32);
                    result.height = stream.get("height").and_then(Value::as_u64).map(|v| v as u32);
                }
                "audio" if result.audio_codec.is_none() => result.audio_codec = codec,
                "subtitle" => {
                    let tags = stream.get("tags");
                    let disposition = stream.get("disposition");
                    result.subtitles.push(ProbeSubtitle {
                        index: stream.get("index").and_then(Value::as_u64).unwrap_or(0) as u32,
                        codec,
                        language: tags.and_then(|t| t.get("language")).and_then(Value::as_str).unwrap_or("und").to_string(),
                        title: tags.and_then(|t| t.get("title")).and_then(Value::as_str).map(str::to_string),
                        forced: disposition.and_then(|d| d.get("forced")).and_then(Value::as_u64).unwrap_or(0) == 1,
                        default: disposition.and_then(|d| d.get("default")).and_then(Value::as_u64).unwrap_or(0) == 1,
                    });
                }
                _ => {}
            }
        }
    }

    result
}

pub fn playback_mode(container: Option<&str>, video: Option<&str>, audio: Option<&str>) -> String {
    let direct_container = matches!(container, Some("mp4" | "mov" | "webm"));
    let direct_video = matches!(video, None | Some("h264" | "vp8" | "vp9" | "av1"));
    let direct_audio = matches!(audio, None | Some("aac" | "mp3" | "opus" | "vorbis"));

    if direct_container && direct_video && direct_audio {
        "directPlay".into()
    } else if direct_video && direct_audio {
        "remux".into()
    } else {
        "transcode".into()
    }
}

#[cfg(test)]
mod tests {
    use super::playback_mode;

    #[test]
    fn direct_plays_h264_aac_mp4() {
        assert_eq!(playback_mode(Some("mp4"), Some("h264"), Some("aac")), "directPlay");
    }

    #[test]
    fn remuxes_browser_codecs_in_mkv() {
        assert_eq!(playback_mode(Some("matroska"), Some("h264"), Some("aac")), "remux");
    }

    #[test]
    fn transcodes_hevc() {
        assert_eq!(playback_mode(Some("matroska"), Some("hevc"), Some("aac")), "transcode");
    }
}
