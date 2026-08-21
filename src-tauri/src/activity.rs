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

fn store() -> &'static RwLock<VecDeque<ActivityEntry>> { ENTRIES.get_or_init(|| RwLock::new(VecDeque::with_capacity(MAX_ENTRIES))) }

pub fn push(level: &str, category: &str, message: impl ToString) {
    let entry = ActivityEntry { timestamp: Utc::now().timestamp(), level: level.to_string(), category: category.to_string(), message: message.to_string() };
    if let Ok(mut entries) = store().write() { entries.push_back(entry); while entries.len() > MAX_ENTRIES { entries.pop_front(); } }
}

pub fn info(category: &str, message: impl ToString) { push("info", category, message); }
pub fn warn(category: &str, message: impl ToString) { push("warning", category, message); }
pub fn error(category: &str, message: impl ToString) { push("error", category, message); }

#[tauri::command]
pub fn activity_entries() -> Vec<ActivityEntry> { store().read().map(|entries| entries.iter().rev().cloned().collect()).unwrap_or_default() }

#[tauri::command]
pub fn clear_activity() { if let Ok(mut entries) = store().write() { entries.clear(); } info("Activity", "Activity console cleared"); }

#[tauri::command]
pub fn record_client_activity(level: Option<String>, category: String, message: String) {
    let category = category.trim().chars().take(48).collect::<String>();
    let message = message.trim().chars().take(300).collect::<String>();
    if category.is_empty() || message.is_empty() { return; }
    let level = match level.as_deref() { Some("error") => "error", Some("warning") => "warning", _ => "info" };
    push(level, &category, message);
}
