use crate::models::MediaItem;
use std::{fs, path::{Path, PathBuf}, process::Command};

const IMAGE_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

fn safe_key(value: &str) -> String {
    value.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' }).collect::<String>().split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-")
}

fn show_key(item: &MediaItem) -> String { safe_key(item.show_title.as_deref().unwrap_or(&item.title)) }

pub fn cache_path(cache_root: &Path, item: &MediaItem, kind: &str) -> PathBuf {
    match (item.kind.as_str(), kind) {
        ("episode", "thumbnail") => cache_root.join("tv").join(show_key(item)).join("episodes").join(format!("{}.webp", item.id)),
        ("episode", _) => cache_root.join("tv").join(show_key(item)).join(format!("{kind}.webp")),
        (_, _) => cache_root.join("movies").join(&item.id).join(format!("{kind}.webp")),
    }
}

fn local_image(item: &MediaItem, kind: &str) -> Option<PathBuf> {
    let path = Path::new(&item.path);
    let parent = path.parent()?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let mut candidates = Vec::new();
    if kind == "poster" {
        for ext in IMAGE_EXTENSIONS { candidates.push(parent.join(format!("{stem}.{ext}"))); }
        for name in ["poster", "folder", "cover"] { for ext in IMAGE_EXTENSIONS { candidates.push(parent.join(format!("{name}.{ext}"))); } }
        if item.kind == "episode" {
            let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
            let show_root = if parent_name.starts_with("season") || (parent_name.starts_with('s') && parent_name[1..].chars().all(|c| c.is_ascii_digit())) { parent.parent() } else { Some(parent) };
            if let Some(show_root) = show_root { for name in ["poster", "folder", "cover"] { for ext in IMAGE_EXTENSIONS { candidates.push(show_root.join(format!("{name}.{ext}"))); } } }
        }
    } else if kind == "backdrop" {
        for name in ["backdrop", "fanart", "background"] { for ext in IMAGE_EXTENSIONS { candidates.push(parent.join(format!("{name}.{ext}"))); } }
        if item.kind == "episode" {
            let parent_name = parent.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
            let show_root = if parent_name.starts_with("season") || (parent_name.starts_with('s') && parent_name[1..].chars().all(|c| c.is_ascii_digit())) { parent.parent() } else { Some(parent) };
            if let Some(show_root) = show_root { for name in ["backdrop", "fanart", "background"] { for ext in IMAGE_EXTENSIONS { candidates.push(show_root.join(format!("{name}.{ext}"))); } } }
        }
    } else if kind == "thumbnail" && item.kind == "episode" {
        for ext in IMAGE_EXTENSIONS { candidates.push(parent.join(format!("{stem}-thumb.{ext}"))); candidates.push(parent.join(format!("{stem}.thumb.{ext}"))); }
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn ffmpeg_available() -> bool { Command::new("ffmpeg").arg("-version").output().map(|output| output.status.success()).unwrap_or(false) }

fn normalize(source: &Path, destination: &Path, width: u32, height: u32) -> bool {
    if !ffmpeg_available() { return false; }
    if let Some(parent) = destination.parent() { let _ = fs::create_dir_all(parent); }
    Command::new("ffmpeg").args(["-hide_banner", "-loglevel", "error", "-y", "-i"]).arg(source)
        .args(["-vf", &format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"), "-frames:v", "1", "-c:v", "libwebp", "-quality", "76"])
        .arg(destination).status().map(|status| status.success()).unwrap_or(false)
}

fn seek_seconds(item: &MediaItem) -> f64 {
    item.duration_seconds.map(|duration| ((duration as f64 * 0.25).max(30.0)).min(duration.saturating_sub(5) as f64)).unwrap_or(300.0)
}

fn generate_frame(item: &MediaItem, destination: &Path, width: u32, height: u32, quality: u8) -> bool {
    if !ffmpeg_available() { return false; }
    if let Some(parent) = destination.parent() { let _ = fs::create_dir_all(parent); }
    Command::new("ffmpeg")
        .args(["-hide_banner", "-loglevel", "error", "-y", "-ss", &format!("{:.1}", seek_seconds(item)), "-i"])
        .arg(&item.path)
        .args(["-vf", &format!("scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"), "-frames:v", "1", "-c:v", "libwebp", "-quality", &quality.to_string()])
        .arg(destination).status().map(|status| status.success()).unwrap_or(false)
}

pub fn ensure(cache_root: &Path, item: &MediaItem, kind: &str) -> Option<PathBuf> {
    let destination = cache_path(cache_root, item, kind);
    if destination.is_file() { return Some(destination); }
    if let Some(source) = local_image(item, kind) {
        let (width, height) = match kind { "poster" => (400, 600), "backdrop" => (1280, 720), _ => (480, 270) };
        if normalize(&source, &destination, width, height) { return Some(destination); }
        return Some(source);
    }
    if item.kind == "episode" {
        if kind == "thumbnail" && generate_frame(item, &destination, 480, 270, 72) { return Some(destination); }
        if kind == "poster" && generate_frame(item, &destination, 400, 600, 72) { return Some(destination); }
        if kind == "backdrop" && generate_frame(item, &destination, 1280, 720, 72) { return Some(destination); }
    }
    None
}

pub fn cache_size(cache_root: &Path) -> u64 { walkdir::WalkDir::new(cache_root).into_iter().flatten().filter(|entry| entry.file_type().is_file()).filter_map(|entry| entry.metadata().ok().map(|meta| meta.len())).sum() }

pub fn clear_generated_thumbnails(cache_root: &Path) -> Result<(), String> {
    let tv_root = cache_root.join("tv"); if !tv_root.exists() { return Ok(()); }
    for entry in walkdir::WalkDir::new(&tv_root).into_iter().flatten().filter(|entry| entry.file_type().is_file()) {
        if entry.path().parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()) == Some("episodes") { fs::remove_file(entry.path()).map_err(|e| e.to_string())?; }
    }
    Ok(())
}
