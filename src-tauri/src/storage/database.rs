use crate::library::models::MediaItem;
use rusqlite::{params, Connection};
use std::{collections::HashMap, path::Path};

pub fn init(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            year INTEGER,
            kind TEXT NOT NULL,
            show_title TEXT,
            season INTEGER,
            episode INTEGER,
            path TEXT NOT NULL UNIQUE,
            stream_url TEXT NOT NULL,
            subtitles_json TEXT NOT NULL,
            progress_seconds INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER,
            container TEXT,
            video_codec TEXT,
            audio_codec TEXT,
            width INTEGER,
            height INTEGER,
            playback_mode TEXT NOT NULL DEFAULT 'direct'
        );"
    ).map_err(|e| e.to_string())
}

pub fn progress_map(path: &Path) -> HashMap<String, u64> {
    let Ok(conn) = Connection::open(path) else { return HashMap::new(); };
    let Ok(mut stmt) = conn.prepare("SELECT id, progress_seconds FROM media") else { return HashMap::new(); };
    stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?)))
        .ok()
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
}

pub fn sync_catalog(path: &Path, items: &[MediaItem]) -> Result<(), String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM media", []).map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO media (id,title,year,kind,show_title,season,episode,path,stream_url,subtitles_json,progress_seconds,duration_seconds,container,video_codec,audio_codec,width,height,playback_mode)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)"
        ).map_err(|e| e.to_string())?;
        for item in items {
            stmt.execute(params![
                item.id, item.title, item.year, item.kind, item.show_title, item.season, item.episode,
                item.path, item.stream_url, serde_json::to_string(&item.subtitles).map_err(|e| e.to_string())?,
                item.progress_seconds, item.duration_seconds, item.container, item.video_codec, item.audio_codec,
                item.width, item.height, item.playback_mode
            ]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn load_catalog(path: &Path) -> Result<Vec<MediaItem>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id,title,year,kind,show_title,season,episode,path,stream_url,subtitles_json,progress_seconds,duration_seconds,container,video_codec,audio_codec,width,height,playback_mode
         FROM media ORDER BY COALESCE(show_title,title), season, episode, title"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        let subtitles_json: String = row.get(9)?;
        Ok(MediaItem {
            id: row.get(0)?, title: row.get(1)?, year: row.get(2)?, kind: row.get(3)?, show_title: row.get(4)?,
            season: row.get(5)?, episode: row.get(6)?, path: row.get(7)?, stream_url: row.get(8)?,
            subtitles: serde_json::from_str(&subtitles_json).unwrap_or_default(), progress_seconds: row.get(10)?,
            duration_seconds: row.get(11)?, container: row.get(12)?, video_codec: row.get(13)?, audio_codec: row.get(14)?,
            width: row.get(15)?, height: row.get(16)?, playback_mode: row.get(17)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

pub fn save_progress(path: &Path, id: &str, seconds: u64) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute("UPDATE media SET progress_seconds=?1 WHERE id=?2", params![seconds, id])
        .map(|_| ())
        .map_err(|e| e.to_string())
}
