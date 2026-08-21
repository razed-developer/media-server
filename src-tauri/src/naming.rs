use crate::models::ParsedName;
use regex::Regex;
use std::path::Path;

fn clean(raw: &str) -> String {
    raw.replace(['.', '_'], " ")
        .replace("  ", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(['-', ' '])
        .trim()
        .to_string()
}

fn year(raw: &str) -> Option<u16> {
    Regex::new(r"(?:\(|\[|\b)((?:19|20)\d{2})(?:\)|\]|\b)")
        .ok()?
        .captures(raw)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

fn looks_like_release_token(value: &str) -> bool {
    let v = value.trim_matches(['-', '.', '_']).to_ascii_lowercase();
    if v.is_empty() { return false; }
    if Regex::new(r"^(?:480|576|720|1080|1440|2160|4320)p$").ok().is_some_and(|re| re.is_match(&v)) { return true; }
    if Regex::new(r"^(?:x|h)[.-]?26[45]$|^hevc$|^av1$|^xvid$").ok().is_some_and(|re| re.is_match(&v)) { return true; }
    matches!(v.as_str(), "hdtv"|"web"|"webdl"|"web-dl"|"webrip"|"bluray"|"bdrip"|"dvdrip"|"remux"|"proper"|"repack"|"aac"|"ac3"|"eac3"|"ddp"|"dts"|"atmos"|"hdr"|"hdr10"|"dv")
}

fn starts_with_release_metadata(value: &str) -> bool {
    let v = value.trim_matches(['-', '.', '_', ' ']).to_ascii_lowercase();
    Regex::new(r"^(?:480|576|720|1080|1440|2160|4320)p(?:$|[-._ ])")
        .ok()
        .is_some_and(|re| re.is_match(&v))
        || Regex::new(r"^(?:hdtv|web(?:-?dl)?|webrip|bluray|bdrip|dvdrip|remux)(?:$|[-._ ])")
            .ok()
            .is_some_and(|re| re.is_match(&v))
}

fn clean_episode_tail(raw: &str, episode: u16) -> String {
    let tail = clean(raw);
    if tail.is_empty() || starts_with_release_metadata(&tail) { return format!("Episode {episode}"); }
    let mut words = tail.split_whitespace().collect::<Vec<_>>();
    if words.first().is_some_and(|token| looks_like_release_token(token)) {
        return format!("Episode {episode}");
    }
    // Keep a human title but stop before the common technical release suffix.
    if let Some(index) = words.iter().position(|token| looks_like_release_token(token) || starts_with_release_metadata(token)) {
        words.truncate(index);
    }
    let title = words.join(" ").trim_matches(['-', ' ']).trim().to_string();
    if title.is_empty() { format!("Episode {episode}") } else { title }
}

pub fn parse_movie(path: &Path) -> ParsedName {
    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    let detected_year = year(raw);
    let mut title = clean(raw);
    if let Some(y) = detected_year {
        title = title
            .replace(&format!("({y})"), "")
            .replace(&format!("[{y}]"), "")
            .replace(&y.to_string(), "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
    }

    ParsedName {
        title: if title.is_empty() { "Untitled".into() } else { title },
        year: detected_year,
        kind: "movie".into(),
        ..Default::default()
    }
}

fn parse_episode_filename(path: &Path) -> Option<ParsedName> {
    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");
    let patterns = [
        r"(?i)^(.*?)[ ._-]+S(\d{1,2})E(\d{1,3})(.*)$",
        r"(?i)^(.*?)[ ._-]+(\d{1,2})x(\d{1,3})(.*)$",
    ];

    for (pattern_index, pattern) in patterns.iter().enumerate() {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(c) = re.captures(raw) {
                let show = clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"));
                let season = c.get(2).and_then(|m| m.as_str().parse::<u16>().ok());
                let episode = c.get(3).and_then(|m| m.as_str().parse::<u16>().ok());
                let episode_no = episode.unwrap_or(0);
                let remainder = c.get(4).map(|m| m.as_str()).unwrap_or("");

                // Parse a genuine multi-episode marker without mistaking `-720p` or
                // `-1080p` for an episode range. S01E05E06 and S01E05-E06 remain valid.
                let multi_pattern = if pattern_index == 0 {
                    r"(?i)^[ ._-]*(?:E(\d{1,3})|[-_ ]E(\d{1,3}))(.*)$"
                } else {
                    r"(?i)^[ ._-]*-(\d{1,3})(.*)$"
                };
                let mut episode_end = None;
                let mut tail = remainder;
                if let Ok(multi) = Regex::new(multi_pattern) {
                    if let Some(mc) = multi.captures(remainder) {
                        let candidate = mc.get(1).or_else(|| mc.get(2)).and_then(|m| m.as_str().parse::<u16>().ok());
                        let rest = if pattern_index == 0 { mc.get(3) } else { mc.get(2) }.map(|m| m.as_str()).unwrap_or("");
                        let immediately_resolution = candidate.is_some_and(|n| matches!(n, 480|576|720|1080|1440|2160|4320))
                            && rest.trim_start_matches(['.', '_', '-', ' ']).to_ascii_lowercase().starts_with('p');
                        if !immediately_resolution {
                            episode_end = candidate;
                            tail = rest;
                        }
                    }
                }

                return Some(ParsedName {
                    title: clean_episode_tail(tail, episode_no),
                    year: None,
                    show_title: Some(show),
                    season,
                    episode,
                    episode_end,
                    kind: "episode".into(),
                });
            }
        }
    }

    if let Ok(date_re) = Regex::new(r"(?i)^(.*?)[ ._-]+((?:19|20)\d{2})[.-](\d{1,2})[.-](\d{1,2})[ ._-]*(.*)$") {
        if let Some(c) = date_re.captures(raw) {
            let show = clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"));
            let date = format!("{}-{:0>2}-{:0>2}", c.get(2).map(|m| m.as_str()).unwrap_or("0000"), c.get(3).map(|m| m.as_str()).unwrap_or("0"), c.get(4).map(|m| m.as_str()).unwrap_or("0"));
            let tail = clean(c.get(5).map(|m| m.as_str()).unwrap_or(""));
            return Some(ParsedName {
                title: if tail.is_empty() { date } else { tail },
                show_title: Some(show),
                kind: "episode".into(),
                ..Default::default()
            });
        }
    }

    None
}

pub fn parse_tv(path: &Path) -> ParsedName {
    if let Some(parsed) = parse_episode_filename(path) {
        return parsed;
    }

    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Episode");
    let parent = path.parent();
    let parent_name = parent
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("TV");
    let season_re = Regex::new(r"(?i)^Season[ ._-]*(\d{1,2})$|^S(\d{1,2})$").ok();
    let season = season_re
        .as_ref()
        .and_then(|re| re.captures(parent_name))
        .and_then(|c| c.get(1).or_else(|| c.get(2)))
        .and_then(|m| m.as_str().parse::<u16>().ok());
    let show_title = if season.is_some() {
        parent
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            .map(clean)
            .unwrap_or_else(|| "TV".into())
    } else {
        clean(parent_name)
    };

    let leading_episode = Regex::new(r"(?i)^(?:E|Episode[ ._-]*)?(\d{1,3})[ ._-]+(.+)$")
        .ok()
        .and_then(|re| re.captures(raw));
    let episode = leading_episode
        .as_ref()
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u16>().ok());
    let title = leading_episode
        .as_ref()
        .and_then(|c| c.get(2))
        .map(|m| clean_episode_tail(m.as_str(), episode.unwrap_or(0)))
        .unwrap_or_else(|| clean(raw));

    ParsedName {
        title: if title.is_empty() { "Episode".into() } else { title },
        show_title: Some(show_title),
        season,
        episode,
        kind: "episode".into(),
        ..Default::default()
    }
}

pub fn parse(path: &Path) -> ParsedName {
    parse_episode_filename(path).unwrap_or_else(|| parse_movie(path))
}

#[cfg(test)]
mod tests {
    use super::{parse, parse_tv};
    use std::path::Path;

    #[test]
    fn parses_standard_episode() {
        let parsed = parse(Path::new("The.Show.S02E07.Episode.Title.mkv"));
        assert_eq!(parsed.kind, "episode");
        assert_eq!(parsed.show_title.as_deref(), Some("The Show"));
        assert_eq!(parsed.season, Some(2));
        assert_eq!(parsed.episode, Some(7));
        assert_eq!(parsed.title, "Episode Title");
    }

    #[test]
    fn parses_x_episode() {
        let parsed = parse(Path::new("The Show - 3x12 - Finale.mp4"));
        assert_eq!(parsed.show_title.as_deref(), Some("The Show"));
        assert_eq!(parsed.season, Some(3));
        assert_eq!(parsed.episode, Some(12));
        assert_eq!(parsed.title, "Finale");
    }

    #[test]
    fn parses_multi_episode() {
        let parsed = parse(Path::new("Show.S01E05-E06.Double.Feature.mkv"));
        assert_eq!(parsed.episode, Some(5));
        assert_eq!(parsed.episode_end, Some(6));
        assert_eq!(parsed.title, "Double Feature");
    }

    #[test]
    fn does_not_treat_720p_as_episode_720() {
        let parsed = parse(Path::new("Abbott.Elementary.S01E07-720p-HDTV-x265-MiNX.mkv"));
        assert_eq!(parsed.show_title.as_deref(), Some("Abbott Elementary"));
        assert_eq!(parsed.episode, Some(7));
        assert_eq!(parsed.episode_end, None);
        assert_eq!(parsed.title, "Episode 7");
    }

    #[test]
    fn strips_release_suffix_after_episode_title() {
        let parsed = parse(Path::new("Abbott.Elementary.S01E07.Art.Teacher.1080p.WEB-DL.x265.mkv"));
        assert_eq!(parsed.title, "Art Teacher");
    }

    #[test]
    fn parses_movie_year() {
        let parsed = parse(Path::new("A.Movie.Title.2024.1080p.mkv"));
        assert_eq!(parsed.kind, "movie");
        assert_eq!(parsed.year, Some(2024));
        assert!(parsed.title.starts_with("A Movie Title"));
    }

    #[test]
    fn parses_date_episode() {
        let parsed = parse(Path::new("Daily Show 2026-08-18 Headline.mkv"));
        assert_eq!(parsed.kind, "episode");
        assert_eq!(parsed.show_title.as_deref(), Some("Daily Show"));
        assert_eq!(parsed.title, "Headline");
    }

    #[test]
    fn infers_show_and_season_from_folders() {
        let parsed = parse_tv(Path::new("TV/Severance/Season 2/03 Who Is Alive.mkv"));
        assert_eq!(parsed.kind, "episode");
        assert_eq!(parsed.show_title.as_deref(), Some("Severance"));
        assert_eq!(parsed.season, Some(2));
        assert_eq!(parsed.episode, Some(3));
        assert_eq!(parsed.title, "Who Is Alive");
    }
}
