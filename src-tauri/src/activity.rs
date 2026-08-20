use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, sync::{OnceLock, RwLock}};

const MAX_ENTRIES: usize = 600;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub timestamp: i64,
    pub level: String,
    pub category: String,
    pub message: String,
}

static ENTRIES: OnceLock<RwLock<VecDeque<ActivityEntry>>> = OnceLock::new();

fn store() -> &'static RwLock<VecDeque<ActivityEntry>> {
    ENTRIES.get_or_init(|| RwLock::new(VecDeque::with_capacity(MAX_ENTRIES)))
}

pub fn push(level: &str, category: &str, message: impl Into<String>) {
    let entry = ActivityEntry {
        timestamp: Utc::now().timestamp(),
        level: level.to_string(),
        category: category.to_string(),
        message: message.into(),
    };
    if let Ok(mut entries) = store().write() {
        entries.push_back(entry);
        while entries.len() > MAX_ENTRIES { entries.pop_front(); }
    }
}

pub fn info(category: &str, message: impl Into<String>) { push("info", category, message); }
pub fn warn(category: &str, message: impl Into<String>) { push("warning", category, message); }
pub fn error(category: &str, message: impl Into<String>) { push("error", category, message); }

#[tauri::command]
pub fn activity_entries() -> Vec<ActivityEntry> {
    store().read().map(|entries| entries.iter().rev().cloned().collect()).unwrap_or_default()
}

#[tauri::command]
pub fn clear_activity() {
    if let Ok(mut entries) = store().write() { entries.clear(); }
    info("Activity", "Activity console cleared");
}
