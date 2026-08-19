use crate::{database, models::{MediaItem, SubtitleTrack}, naming, probe};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};
use walkdir::WalkDir;

const VIDEO_EXTENSIONS: [&str; 6] = ["mp4", "mkv", "webm", "m4v", "avi", "mov"];
const IMAGE_EXTENSIONS: [&str; 3] = ["jpg", "png", "webp"];

fn make_id(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hex::encode(hasher.finalize())[..20].to_string()
}

pub fn find_poster(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let mut candidates = Vec::new();

    for extension in IMAGE_EXTENSIONS {
        candidates.push(parent.join(format!("{stem}.{extension}")));
    }
    for name in ["poster", "folder", "cover"] {
        for extension in IMAGE_EXTENSIONS {
            candidates.push(parent.join(format!("{name}.{extension}")));
        }
    }
    if let Some(show_root) = parent.parent() {
        for name in ["poster", "folder", "cover"] {
            for extension in IMAGE_EXTENSIONS {
                candidates.push(show_root.join(format!("{name}.{extension}")));
            }
        }
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn external_subtitles(path: &Path, id: &str) -> Vec<SubtitleTrack> {
    let Some(parent) = path.parent() else { return vec![]; };
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let mut tracks = vec![];

    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            let candidate = entry.path();
            let extension = candidate.extension().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
            let candidate_stem = candidate.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
            if !["vtt", "srt"].contains(&extension.as_str()) || !candidate_stem.starts_with(stem) { continue; }

            let language = candidate_stem.strip_prefix(stem).unwrap_or("").trim_matches('.').to_string();
            let filename = candidate.file_name().and_then(|s| s.to_str()).unwrap_or_default();
            tracks.push(SubtitleTrack {
                label: if language.is_empty() { "Subtitles".into() } else { language.to_uppercase() },
                language: if language.is_empty() { "und".into() } else { language },
                url: Some(format!("/subtitle/{id}/{}", urlencoding::encode(filename))),
                stream_index: None,
                embedded: false,
                format: Some(extension),
                forced: false,
                default: false,
            });
        }
    }
    tracks
}

pub fn scan(root: &Path, database_path: &Path, _port: u16) -> Result<Vec<MediaItem>, String> {
    let progress = database::progress_map(database_path).unwrap_or_default();
    let mut media = vec![];

    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten().filter(|e| e.file_type().is_file()) {
        let path = entry.path();
        let extension = path.extension().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
        if !VIDEO_EXTENSIONS.contains(&extension.as_str()) { continue; }

        let id = make_id(path);
        let parsed = naming::parse(path);
        let info = probe::inspect(path);
        let playback_mode = probe::playback_mode(
            info.container.as_deref(),
            info.video_codec.as_deref(),
            info.audio_codec.as_deref(),
        );
        let mut subtitles = external_subtitles(path, &id);
        subtitles.extend(info.subtitles.iter().map(|track| SubtitleTrack {
            label: track.title.clone().unwrap_or_else(|| track.language.to_uppercase()),
            language: track.language.clone(),
            url: Some(format!("/subtitle/{id}/embedded/{}", track.index)),
            stream_index: Some(track.index),
            embedded: true,
            format: track.codec.clone(),
            forced: track.forced,
            default: track.default,
        }));
        let poster_url = find_poster(path).map(|_| format!("/art/{id}/poster"));

        media.push(MediaItem {
            id: id.clone(),
            title: parsed.title,
            year: parsed.year,
            kind: parsed.kind,
            show_title: parsed.show_title,
            season: parsed.season,
            episode: parsed.episode,
            episode_end: parsed.episode_end,
            path: path.to_string_lossy().to_string(),
            stream_url: format!("/play/{id}"),
            poster_url,
            subtitles,
            progress_seconds: *progress.get(&id).unwrap_or(&0),
            duration_seconds: info.duration_seconds,
            container: info.container.clone(),
            video_codec: info.video_codec.clone(),
            audio_codec: info.audio_codec.clone(),
            width: info.width,
            height: info.height,
            playback_mode,
        });
    }

    media.sort_by(|a, b| {
        let a_key = (a.show_title.as_deref().unwrap_or(&a.title).to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
        let b_key = (b.show_title.as_deref().unwrap_or(&b.title).to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase());
        a_key.cmp(&b_key)
    });

    database::replace_library(database_path, &media)?;
    Ok(media)
}
