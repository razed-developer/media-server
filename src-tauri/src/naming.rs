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

pub fn parse(path: &Path) -> ParsedName {
    let raw = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Untitled");

    let patterns = [
        r"(?i)^(.*?)[ ._-]+S(\d{1,2})E(\d{1,3})(?:[-E](\d{1,3}))?[ ._-]*(.*)$",
        r"(?i)^(.*?)[ ._-]+(\d{1,2})x(\d{1,3})(?:-(\d{1,3}))?[ ._-]*(.*)$",
    ];

    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(c) = re.captures(raw) {
                let show = clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"));
                let season = c.get(2).and_then(|m| m.as_str().parse().ok());
                let episode = c.get(3).and_then(|m| m.as_str().parse().ok());
                let episode_end = c.get(4).and_then(|m| m.as_str().parse().ok());
                let tail = clean(c.get(5).map(|m| m.as_str()).unwrap_or(""));
                return ParsedName {
                    title: if tail.is_empty() { format!("Episode {}", episode.unwrap_or(0)) } else { tail },
                    year: None,
                    show_title: Some(show),
                    season,
                    episode,
                    episode_end,
                    kind: "episode".into(),
                };
            }
        }
    }

    if let Ok(date_re) = Regex::new(r"(?i)^(.*?)[ ._-]+((?:19|20)\d{2})[.-](\d{1,2})[.-](\d{1,2})[ ._-]*(.*)$") {
        if let Some(c) = date_re.captures(raw) {
            let show = clean(c.get(1).map(|m| m.as_str()).unwrap_or("Show"));
            let date = format!("{}-{:0>2}-{:0>2}", c.get(2).map(|m| m.as_str()).unwrap_or("0000"), c.get(3).map(|m| m.as_str()).unwrap_or("0"), c.get(4).map(|m| m.as_str()).unwrap_or("0"));
            let tail = clean(c.get(5).map(|m| m.as_str()).unwrap_or(""));
            return ParsedName {
                title: if tail.is_empty() { date } else { tail },
                show_title: Some(show),
                kind: "episode".into(),
                ..Default::default()
            };
        }
    }

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
