use regex::Regex;
use std::path::Path;

pub struct ParsedName {
    pub title: String,
    pub year: Option<u16>,
    pub kind: String,
    pub show_title: Option<String>,
    pub season: Option<u16>,
    pub episode: Option<u16>,
}

fn clean(raw: &str) -> String {
    raw.replace(['.', '_'], " ")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn year(raw: &str) -> Option<u16> {
    Regex::new(r"(?:\(|\b)((?:19|20)\d{2})(?:\)|\b)")
        .ok()?
        .captures(raw)?
        .get(1)?
        .as_str()
        .parse()
        .ok()
}

fn episode_title(raw: &str) -> String {
    let value = clean(raw);
    if value.is_empty() { "Episode".into() } else { value }
}

pub fn parse(path: &Path) -> ParsedName {
    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");

    let patterns = [
        r"(?i)^(.*?)[ ._-]+S(\d{1,2})E(\d{1,3})(?:[ ._-]+(.*))?$",
        r"(?i)^(.*?)[ ._-]+(\d{1,2})x(\d{1,3})(?:[ ._-]+(.*))?$",
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(c) = re.captures(raw) {
                return ParsedName {
                    title: episode_title(c.get(4).map(|m| m.as_str()).unwrap_or("")),
                    year: None,
                    kind: "episode".into(),
                    show_title: Some(clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"))),
                    season: c.get(2).and_then(|m| m.as_str().parse().ok()),
                    episode: c.get(3).and_then(|m| m.as_str().parse().ok()),
                };
            }
        }
    }

    if let Ok(re) = Regex::new(r"(?i)^(.*?)[ ._-]+((?:19|20)\d{2})[._-](\d{1,2})[._-](\d{1,2})(?:[ ._-]+(.*))?$") {
        if let Some(c) = re.captures(raw) {
            let date_title = format!(
                "{}-{:0>2}-{:0>2}{}",
                c.get(2).map(|m| m.as_str()).unwrap_or(""),
                c.get(3).map(|m| m.as_str()).unwrap_or(""),
                c.get(4).map(|m| m.as_str()).unwrap_or(""),
                c.get(5).map(|m| format!(" · {}", episode_title(m.as_str()))).unwrap_or_default()
            );
            return ParsedName {
                title: date_title,
                year: c.get(2).and_then(|m| m.as_str().parse().ok()),
                kind: "episode".into(),
                show_title: Some(clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"))),
                season: None,
                episode: None,
            };
        }
    }

    // If the path contains a conventional "Season 2" directory and the filename begins
    // with an episode number, infer the series from the directory above the season folder.
    if let Some(parent) = path.parent() {
        let season_dir = parent.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if let Ok(season_re) = Regex::new(r"(?i)^season[ ._-]*(\d{1,2})$") {
            if let Some(sc) = season_re.captures(season_dir) {
                if let Ok(ep_re) = Regex::new(r"(?i)^(?:e(?:pisode)?[ ._-]*)?(\d{1,3})[ ._-]+(.*)$") {
                    if let Some(ec) = ep_re.captures(raw) {
                        let show = parent.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("Show");
                        return ParsedName {
                            title: episode_title(ec.get(2).map(|m| m.as_str()).unwrap_or("")),
                            year: None,
                            kind: "episode".into(),
                            show_title: Some(clean(show)),
                            season: sc.get(1).and_then(|m| m.as_str().parse().ok()),
                            episode: ec.get(1).and_then(|m| m.as_str().parse().ok()),
                        };
                    }
                }
            }
        }
    }

    let movie_year = year(raw);
    let title = if let Some(y) = movie_year {
        clean(&raw.replace(&y.to_string(), "").replace(['(', ')'], " "))
    } else {
        clean(raw)
    };

    ParsedName {
        title,
        year: movie_year,
        kind: "movie".into(),
        show_title: None,
        season: None,
        episode: None,
    }
}
