use crate::models::MediaItem;
use rusqlite::{params, Connection};
use std::{collections::HashMap, path::Path};

#[derive(Clone, Debug, Default)]
pub struct IdentityOverride {
    pub title: Option<String>,
    pub year: Option<u16>,
    pub kind: Option<String>,
    pub show_title: Option<String>,
    pub season: Option<u16>,
    pub episode: Option<u16>,
}

pub fn init(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS media (
           id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, show_title TEXT, season INTEGER, episode INTEGER,
           metadata_json TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS progress (
           media_id TEXT PRIMARY KEY, seconds INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS identity_overrides (
           media_id TEXT PRIMARY KEY,
           title TEXT,
           year INTEGER,
           kind TEXT,
           show_title TEXT,
           season INTEGER,
           episode INTEGER,
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );
         CREATE TABLE IF NOT EXISTS show_overrides (
           root_path TEXT PRIMARY KEY,
           show_title TEXT NOT NULL,
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
    for row in rows { let (id, seconds) = row.map_err(|e| e.to_string())?; values.insert(id, seconds); }
    Ok(values)
}

pub fn identity_overrides(path: &Path) -> Result<HashMap<String, IdentityOverride>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT media_id, title, year, kind, show_title, season, episode FROM identity_overrides").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((
        row.get::<_, String>(0)?,
        IdentityOverride { title: row.get(1)?, year: row.get(2)?, kind: row.get(3)?, show_title: row.get(4)?, season: row.get(5)?, episode: row.get(6)? }
    ))).map_err(|e| e.to_string())?;
    let mut values = HashMap::new();
    for row in rows { let (id, value) = row.map_err(|e| e.to_string())?; values.insert(id, value); }
    Ok(values)
}

pub fn show_overrides(path: &Path) -> Result<Vec<(String, String)>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT root_path, show_title FROM show_overrides ORDER BY length(root_path) DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
    let mut values = Vec::new();
    for row in rows { values.push(row.map_err(|e| e.to_string())?); }
    Ok(values)
}

pub fn save_identity_override(path: &Path, id: &str, value: &IdentityOverride) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO identity_overrides (media_id,title,year,kind,show_title,season,episode,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,unixepoch())
         ON CONFLICT(media_id) DO UPDATE SET title=excluded.title,year=excluded.year,kind=excluded.kind,show_title=excluded.show_title,season=excluded.season,episode=excluded.episode,updated_at=unixepoch()",
        params![id, value.title, value.year, value.kind, value.show_title, value.season, value.episode]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_identity_override(path: &Path, id: &str) -> Result<(), String> {
    Connection::open(path).map_err(|e| e.to_string())?.execute("DELETE FROM identity_overrides WHERE media_id=?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_show_override(path: &Path, root_path: &str, show_title: &str) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO show_overrides (root_path,show_title,updated_at) VALUES (?1,?2,unixepoch())
         ON CONFLICT(root_path) DO UPDATE SET show_title=excluded.show_title,updated_at=unixepoch()",
        params![root_path, show_title]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn replace_library(path: &Path, items: &[MediaItem]) -> Result<(), String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM media", []).map_err(|e| e.to_string())?;
    { let mut stmt = tx.prepare("INSERT INTO media (id,path,kind,show_title,season,episode,metadata_json,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,unixepoch())").map_err(|e| e.to_string())?;
      for item in items { let json=serde_json::to_string(item).map_err(|e| e.to_string())?; stmt.execute(params![&item.id,&item.path,&item.kind,item.show_title.as_deref(),item.season,item.episode,json]).map_err(|e| e.to_string())?; } }
    tx.commit().map_err(|e| e.to_string())
}

pub fn load_library(path: &Path) -> Result<Vec<MediaItem>, String> {
    let conn=Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt=conn.prepare("SELECT m.metadata_json,COALESCE(p.seconds,0) FROM media m LEFT JOIN progress p ON p.media_id=m.id ORDER BY COALESCE(m.show_title,''),COALESCE(m.season,0),COALESCE(m.episode,0),m.path").map_err(|e| e.to_string())?;
    let rows=stmt.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,u64>(1)?))).map_err(|e| e.to_string())?;
    let mut items=Vec::new(); for row in rows { let(json,progress)=row.map_err(|e| e.to_string())?; let mut item:MediaItem=serde_json::from_str(&json).map_err(|e| e.to_string())?; item.progress_seconds=progress; items.push(item); } Ok(items)
}

pub fn save_progress(path:&Path,id:&str,seconds:u64)->Result<(),String>{let conn=Connection::open(path).map_err(|e|e.to_string())?;conn.execute("INSERT INTO progress (media_id,seconds,updated_at) VALUES (?1,?2,unixepoch()) ON CONFLICT(media_id) DO UPDATE SET seconds=excluded.seconds,updated_at=unixepoch()",params![id,seconds]).map_err(|e|e.to_string())?;Ok(())}
