use crate::models::MediaItem;
use rusqlite::{params, Connection};
use std::{collections::HashMap, path::Path};

pub fn init(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS media (
           id TEXT PRIMARY KEY,
           path TEXT NOT NULL UNIQUE,
           kind TEXT NOT NULL,
           show_title TEXT,
           season INTEGER,
           episode INTEGER,
           metadata_json TEXT NOT NULL,
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS progress (
           media_id TEXT PRIMARY KEY,
           seconds INTEGER NOT NULL DEFAULT 0,
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE INDEX IF NOT EXISTS idx_media_kind ON media(kind);
         CREATE INDEX IF NOT EXISTS idx_media_show ON media(show_title, season, episode);"
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn progress_map(path: &Path) -> Result<HashMap<String, u64>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT media_id, seconds FROM progress").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))).map_err(|e| e.to_string())?;
    let mut values = HashMap::new();
    for row in rows {
        let (id, seconds) = row.map_err(|e| e.to_string())?;
        values.insert(id, seconds);
    }
    Ok(values)
}

pub fn replace_library(path: &Path, items: &[MediaItem]) -> Result<(), String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM media", []).map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO media (id, path, kind, show_title, season, episode, metadata_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())"
        ).map_err(|e| e.to_string())?;
        for item in items {
            let json = serde_json::to_string(item).map_err(|e| e.to_string())?;
            stmt.execute(params![item.id, item.path, item.kind, item.show_title, item.season, item.episode, json]).map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn load_library(path: &Path) -> Result<Vec<MediaItem>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT m.metadata_json, COALESCE(p.seconds, 0)
         FROM media m LEFT JOIN progress p ON p.media_id = m.id
         ORDER BY COALESCE(m.show_title, ''), COALESCE(m.season, 0), COALESCE(m.episode, 0), m.path"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        let (json, progress) = row.map_err(|e| e.to_string())?;
        let mut item: MediaItem = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        item.progress_seconds = progress;
        items.push(item);
    }
    Ok(items)
}

pub fn save_progress(path: &Path, id: &str, seconds: u64) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO progress (media_id, seconds, updated_at) VALUES (?1, ?2, unixepoch())
         ON CONFLICT(media_id) DO UPDATE SET seconds = excluded.seconds, updated_at = unixepoch()",
        params![id, seconds],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
