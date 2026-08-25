use crate::{database, models::{MediaItem, ParsedName, SubtitleTrack}, naming, probe};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};
use walkdir::WalkDir;

const VIDEO_EXTENSIONS:[&str;6]=["mp4","mkv","webm","m4v","avi","mov"];
const IMAGE_EXTENSIONS:[&str;4]=["jpg","jpeg","png","webp"];
fn make_id(path:&Path)->String{let mut h=Sha256::new();h.update(path.to_string_lossy().as_bytes());hex::encode(h.finalize())[..20].to_string()}
pub fn find_poster(path:&Path)->Option<PathBuf>{let parent=path.parent()?;let stem=path.file_stem().and_then(|s|s.to_str()).unwrap_or_default();let mut c=Vec::new();for e in IMAGE_EXTENSIONS{c.push(parent.join(format!("{stem}.{e}")));}for n in ["poster","folder","cover"]{for e in IMAGE_EXTENSIONS{c.push(parent.join(format!("{n}.{e}")));}}if let Some(root)=parent.parent(){for n in ["poster","folder","cover"]{for e in IMAGE_EXTENSIONS{c.push(root.join(format!("{n}.{e}")));}}}c.into_iter().find(|p|p.is_file())}
fn external_subtitles(path:&Path,id:&str)->Vec<SubtitleTrack>{let Some(parent)=path.parent()else{return vec![]};let stem=path.file_stem().and_then(|s|s.to_str()).unwrap_or_default();let mut tracks=vec![];if let Ok(entries)=fs::read_dir(parent){for entry in entries.flatten(){let candidate=entry.path();let extension=candidate.extension().and_then(|s|s.to_str()).unwrap_or_default().to_lowercase();let candidate_stem=candidate.file_stem().and_then(|s|s.to_str()).unwrap_or_default();if !["vtt","srt"].contains(&extension.as_str())||!candidate_stem.starts_with(stem){continue}let raw_language=candidate_stem.strip_prefix(stem).unwrap_or("").trim_matches('.').to_string();let generated=raw_language.ends_with(".ai");let language=raw_language.strip_suffix(".ai").unwrap_or(&raw_language).to_string();let filename=candidate.file_name().and_then(|s|s.to_str()).unwrap_or_default();tracks.push(SubtitleTrack{label:if generated{format!("{} · AI generated",if language=="en"{"English".into()}else{language.to_uppercase()})}else if language.is_empty(){"Subtitles".into()}else{language.to_uppercase()},language:if language.is_empty(){"und".into()}else{language},url:Some(format!("/subtitle/{id}/{}",urlencoding::encode(filename))),stream_index:None,embedded:false,format:Some(extension),forced:false,default:false});}}tracks.sort_by(|a,b|a.label.cmp(&b.label));tracks}
pub fn refresh_external_subtitles(item:&mut MediaItem){let mut tracks=external_subtitles(Path::new(&item.path),&item.id);tracks.extend(item.subtitles.iter().filter(|track|track.embedded).cloned());item.subtitles=tracks;}
fn apply_override(mut parsed:ParsedName,id:&str,path:&Path,item_overrides:&std::collections::HashMap<String,database::IdentityOverride>,show_overrides:&[(String,String)])->ParsedName{if parsed.kind=="episode"{let path_text=path.to_string_lossy();if let Some((_,title))=show_overrides.iter().find(|(root,_)|path_text.starts_with(root)){parsed.show_title=Some(title.clone());}}if let Some(value)=item_overrides.get(id){if let Some(v)=&value.title{parsed.title=v.clone()}if let Some(v)=value.year{parsed.year=Some(v)}if let Some(v)=&value.kind{parsed.kind=v.clone()}if let Some(v)=&value.show_title{parsed.show_title=Some(v.clone())}if let Some(v)=value.season{parsed.season=Some(v)}if let Some(v)=value.episode{parsed.episode=Some(v)}}parsed}
pub fn scan(
    root: &Path,
    database_path: &Path,
    kind_hint: Option<&str>,
    progress: &mut dyn FnMut(&str, usize, usize, Option<&Path>),
) -> Result<Vec<MediaItem>, String> {
    let item_overrides = database::identity_overrides(database_path).unwrap_or_default();
    let show_overrides = database::show_overrides(database_path).unwrap_or_default();
    // Reuse IDs for paths already known to the database. This preserves watch
    // history, playlists, matches, and Onyx-managed subtitles after a restored
    // library root has been remapped to a new drive or parent directory.
    let existing: std::collections::HashMap<String, MediaItem> = database::load_library(database_path)
        .unwrap_or_default().into_iter().map(|item| (item.path.clone(), item)).collect();
    let mut video_paths = Vec::new();

    progress("discovering", 0, 0, Some(root));
    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten().filter(|entry| entry.file_type().is_file()) {
        let path = entry.path();
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
        if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
            video_paths.push(path.to_path_buf());
            progress("discovering", video_paths.len(), 0, Some(path));
        }
    }

    let discovered = video_paths.len();
    let mut media = Vec::with_capacity(discovered);
    for (index, path) in video_paths.iter().enumerate() {
        progress("inspecting", discovered, index, Some(path));
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
        if !VIDEO_EXTENSIONS.contains(&extension.as_str()) { continue; }
        let path_text = path.to_string_lossy().to_string();
        if let Some(previous) = existing.get(&path_text) {
            // Directory discovery is cheap; ffprobe is not. Reuse complete records
            // for paths already in the library so ordinary scans only inspect new files.
            if previous.duration_seconds.is_some() && previous.container.is_some() {
                let mut item = previous.clone();
                if item.kind == "special" && item.thumbnail_url.is_none() {
                    item.thumbnail_url = Some(format!("/art/{}/thumbnail", item.id));
                }
                media.push(item);
                progress("inspecting", discovered, index + 1, Some(path));
                continue;
            }
        }
        let id = existing.get(&path_text).map(|item| item.id.clone()).unwrap_or_else(|| make_id(path));
        let parsed = match kind_hint {
            Some("movie") => naming::parse_movie(path),
            Some("episode") => naming::parse_tv(path),
            Some("special") => { let mut value = naming::parse_movie(path); value.kind = "special".into(); value.year = None; value },
            _ => naming::parse(path),
        };
        let parsed = apply_override(parsed, &id, path, &item_overrides, &show_overrides);
        let info = probe::inspect(path);
        let playback_mode = probe::playback_mode(info.container.as_deref(), info.video_codec.as_deref(), info.audio_codec.as_deref());
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
        let is_episode = parsed.kind == "episode";
        let is_special = parsed.kind == "special";
        media.push(MediaItem {
            id: id.clone(),
            title: parsed.title,
            year: parsed.year,
            kind: parsed.kind,
            show_title: parsed.show_title,
            season: parsed.season,
            episode: parsed.episode,
            episode_end: parsed.episode_end,
            path: path_text,
            stream_url: format!("/play/{id}"),
            poster_url: (!is_special).then(|| format!("/art/{id}/poster")),
            backdrop_url: (!is_special).then(|| format!("/art/{id}/backdrop")),
            thumbnail_url: (is_episode || is_special).then(|| format!("/art/{id}/thumbnail")),
            subtitles,
            progress_seconds: 0,
            duration_seconds: info.duration_seconds,
            container: info.container.clone(),
            video_codec: info.video_codec.clone(),
            audio_codec: info.audio_codec.clone(),
            width: info.width,
            height: info.height,
            playback_mode,
            added_at: None,
            last_watched_at: None,
            metadata_entity_id: None,
            overview: None,
            genres: vec![],
            rating: None,
            release_date: None,
            provider: None,
            provider_id: None,
        });
        progress("inspecting", discovered, index + 1, Some(path));
    }

    media.sort_by(|a, b| {
        let a_key = (a.show_title.as_deref().unwrap_or(&a.title).to_lowercase(), a.season.unwrap_or(0), a.episode.unwrap_or(0), a.title.to_lowercase());
        let b_key = (b.show_title.as_deref().unwrap_or(&b.title).to_lowercase(), b.season.unwrap_or(0), b.episode.unwrap_or(0), b.title.to_lowercase());
        a_key.cmp(&b_key)
    });
    Ok(media)
}
