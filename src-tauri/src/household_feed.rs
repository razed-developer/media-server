use crate::Shared;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HouseholdFeedEntry {
    pub id: String,
    pub kind: String,
    pub user_id: String,
    pub user_name: String,
    pub avatar_id: String,
    pub custom_avatar_url: Option<String>,
    pub reaction: Option<String>,
    pub title: String,
    pub media_type: Option<String>,
    pub created_at: i64,
}

pub fn list(path: &std::path::Path, limit: usize) -> Result<Vec<HouseholdFeedEntry>, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();

    let mut reactions = conn.prepare(
        "SELECT r.user_id,u.name,COALESCE(x.avatar_id,'onyx'),x.custom_avatar_path,r.target_type,r.target_key,r.reaction,r.updated_at,
         COALESCE(
           CASE WHEN r.target_type='show' THEN (
             WITH RECURSIVE ancestors(id,parent_id,title,entity_type) AS (
               SELECT id,parent_id,title,entity_type FROM metadata_entities WHERE id=r.target_key
               UNION ALL SELECT m.id,m.parent_id,m.title,m.entity_type FROM metadata_entities m JOIN ancestors a ON m.id=a.parent_id
             ) SELECT title FROM ancestors WHERE entity_type='series' LIMIT 1
           ) END,
           (SELECT title FROM metadata_entities WHERE id=r.target_key),
           r.target_key
         )
         FROM user_reactions r
         JOIN users u ON u.id=r.user_id
         LEFT JOIN user_profile_extras x ON x.user_id=r.user_id
         ORDER BY r.updated_at DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    let rows = reactions.query_map(params![limit as i64], |r| {
        let user_id: String = r.get(0)?;
        let custom: Option<String> = r.get(3)?;
        Ok(HouseholdFeedEntry {
            id: format!("reaction:{}:{}:{}", user_id, r.get::<_, String>(5)?, r.get::<_, i64>(7)?),
            kind: "reaction".into(),
            user_id: user_id.clone(),
            user_name: r.get(1)?,
            avatar_id: r.get(2)?,
            custom_avatar_url: custom.as_ref().map(|_| format!("/api/users/{}/avatar", urlencoding::encode(&user_id))),
            reaction: Some(r.get(6)?),
            title: r.get(8)?,
            media_type: Some(r.get(4)?),
            created_at: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    for row in rows { out.push(row.map_err(|e| e.to_string())?); }

    let mut requests = conn.prepare(
        "SELECT w.id,w.user_id,u.name,COALESCE(x.avatar_id,'onyx'),x.custom_avatar_path,w.media_type,w.title,w.requested_at
         FROM user_wishlist w
         JOIN users u ON u.id=w.user_id
         LEFT JOIN user_profile_extras x ON x.user_id=w.user_id
         ORDER BY w.requested_at DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    let rows = requests.query_map(params![limit as i64], |r| {
        let user_id: String = r.get(1)?;
        let custom: Option<String> = r.get(4)?;
        Ok(HouseholdFeedEntry {
            id: format!("request:{}", r.get::<_, String>(0)?),
            kind: "request".into(),
            user_id: user_id.clone(),
            user_name: r.get(2)?,
            avatar_id: r.get(3)?,
            custom_avatar_url: custom.as_ref().map(|_| format!("/api/users/{}/avatar", urlencoding::encode(&user_id))),
            reaction: None,
            title: r.get(6)?,
            media_type: Some(r.get(5)?),
            created_at: r.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    for row in rows { out.push(row.map_err(|e| e.to_string())?); }

    out.sort_by(|a,b| b.created_at.cmp(&a.created_at));
    out.truncate(limit);
    Ok(out)
}

#[tauri::command]
pub fn household_feed(state: State<'_, Shared>, limit: Option<usize>) -> Result<Vec<HouseholdFeedEntry>, String> {
    list(&state.database_path, limit.unwrap_or(24).clamp(1, 100))
}
