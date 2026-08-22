use crate::{library, metadata, models::MediaItem};
use std::path::{Path, PathBuf};

const IMAGE_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

fn art_url(size: &str, path: &str) -> String {
    format!("/api/metadata/image/{size}/{}", urlencoding::encode(path))
}

fn local_backdrop(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let mut roots = vec![parent.to_path_buf()];
    if let Some(show_root) = parent.parent() { roots.push(show_root.to_path_buf()); }
    for root in roots {
        for name in ["backdrop", "fanart", "background"] {
            for extension in IMAGE_EXTENSIONS {
                let candidate = root.join(format!("{name}.{extension}"));
                if candidate.is_file() { return Some(candidate); }
            }
        }
    }
    None
}

fn local_thumbnail(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_str()?;
    for extension in IMAGE_EXTENSIONS {
        for name in [format!("{stem}-thumb.{extension}"), format!("{stem}.thumb.{extension}")] {
            let candidate = parent.join(name);
            if candidate.is_file() { return Some(candidate); }
        }
    }
    None
}

pub fn canonicalize(path: &Path, items: &mut [MediaItem]) -> Result<(), String> {
    for item in items.iter_mut() {
        let media_path = Path::new(&item.path);
        let has_local_poster = library::find_poster(media_path).is_some();
        let has_local_backdrop = local_backdrop(media_path).is_some();
        let has_local_thumbnail = local_thumbnail(media_path).is_some();

        if let Some(entity) = metadata::entity_for_media(path, &item.id)? {
            let direct_match = metadata::provider_match(path, &entity.id, "tmdb")?;
            let series = if item.kind == "episode" { metadata::series_for_media(path, &item.id)? } else { None };
            let series_match = if let Some(series) = series.as_ref() { metadata::provider_match(path, &series.id, "tmdb")? } else { None };
            let provider_matched = direct_match.is_some() || series_match.is_some();

            if provider_matched {
                if !entity.title.trim().is_empty() { item.title = entity.title.clone(); }
                if entity.year.is_some() { item.year = entity.year; }
            }
            if entity.overview.is_some() { item.overview = entity.overview.clone(); }
            if !entity.genres.is_empty() { item.genres = entity.genres.clone(); }
            if entity.rating.is_some() { item.rating = entity.rating; }
            if entity.release_date.is_some() { item.release_date = entity.release_date.clone(); }
            if !has_local_poster {
                if let Some(provider_path) = entity.poster_path.as_deref() { item.poster_url = Some(art_url("w500", provider_path)); }
            }
            if !has_local_backdrop {
                if let Some(provider_path) = entity.backdrop_path.as_deref() { item.backdrop_url = Some(art_url("w1280", provider_path)); }
            }
            if !has_local_thumbnail {
                if let Some(provider_path) = entity.still_path.as_deref() { item.thumbnail_url = Some(art_url("w500", provider_path)); }
            }

            if let Some(series) = series {
                if series_match.is_some() && !series.title.trim().is_empty() { item.show_title = Some(series.title.clone()); }
                if item.genres.is_empty() { item.genres = series.genres.clone(); }
                if !has_local_poster {
                    if let Some(provider_path) = series.poster_path.as_deref() { item.poster_url = Some(art_url("w500", provider_path)); }
                }
                if !has_local_backdrop {
                    if let Some(provider_path) = series.backdrop_path.as_deref() { item.backdrop_url = Some(art_url("w1280", provider_path)); }
                }
                if item.provider_id.is_none() {
                    if let Some(matched) = series_match { item.provider = Some(matched.provider); item.provider_id = Some(matched.provider_id); }
                }
            }
        }
        library::refresh_external_subtitles(item);
    }
    Ok(())
}
