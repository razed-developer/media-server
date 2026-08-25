use crate::models::MediaItem;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::{Arc, RwLock}};

#[derive(Clone)]pub struct CollectionUnlock{pub source_id:String,pub user_id:String,pub last_active:i64}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)] pub library_path: Option<String>,
    // Legacy single-root fields are retained for backward compatibility.
    #[serde(default)] pub movie_path: Option<String>,
    #[serde(default)] pub tv_path: Option<String>,
    #[serde(default)] pub movie_paths: Vec<String>,
    #[serde(default)] pub tv_paths: Vec<String>,
    #[serde(default)] pub special_paths: Vec<String>,
    #[serde(default)] pub access_password_hash: Option<String>,
    #[serde(default)] pub setup_complete: bool,
    #[serde(default)] pub ibroadcast_client_id: Option<String>,
    #[serde(default)] pub captions_enabled: bool,
    #[serde(default)] pub captions_auto_new: bool,
    #[serde(default = "default_caption_language")] pub caption_language: String,
    #[serde(default)] pub caption_executable: Option<String>,
    #[serde(default)] pub caption_model_path: Option<String>,
    #[serde(default)] pub sleep_video_path: Option<String>,
}

fn default_caption_language() -> String { "en".into() }

impl Settings {
    pub fn effective_movie_paths(&self) -> Vec<String> {
        let mut values = self.movie_paths.clone();
        if values.is_empty() {
            if let Some(path) = self.movie_path.clone().filter(|value| !value.trim().is_empty()) { values.push(path); }
        }
        values.sort(); values.dedup(); values
    }
    pub fn effective_tv_paths(&self) -> Vec<String> {
        let mut values = self.tv_paths.clone();
        if values.is_empty() {
            if let Some(path) = self.tv_path.clone().filter(|value| !value.trim().is_empty()) { values.push(path); }
        }
        values.sort(); values.dedup(); values
    }
    pub fn effective_special_paths(&self) -> Vec<String> {
        let mut values = self.special_paths.clone();
        values.sort(); values.dedup(); values
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub active: bool,
    pub phase: String,
    pub discovered: usize,
    pub inspected: usize,
    pub current_path: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub settings_path: PathBuf,
    pub database_path: PathBuf,
    pub artwork_path: PathBuf,
    pub provider_path: PathBuf,
    pub settings: Arc<RwLock<Settings>>,
    pub media: Arc<RwLock<Vec<MediaItem>>>,
    pub sessions: Arc<RwLock<HashMap<String, u64>>>,
    pub collection_unlocks: Arc<RwLock<HashMap<String,CollectionUnlock>>>,
    pub scan_progress: Arc<RwLock<ScanProgress>>,
    pub captions: crate::captions::CaptionRuntime,
}

pub type Shared = Arc<AppState>;

pub fn portable_mode() -> bool {
    let portable_env = std::env::var("ONYX_PORTABLE").ok().is_some_and(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"));
    let portable_flag = std::env::current_exe().ok().as_ref().and_then(|exe| exe.parent()).map(|dir| dir.join("onyx-portable.flag")).is_some_and(|flag| flag.is_file());
    portable_env || portable_flag
}

pub fn credential_scope() -> String {
    use sha2::{Digest, Sha256};
    let path = app_data_dir().to_string_lossy().to_ascii_lowercase();
    let digest = hex::encode(Sha256::digest(path.as_bytes()));
    format!("instance:{}", &digest[..16])
}

/// Portable mode is enabled by setting ONYX_PORTABLE=1 or placing an
/// `onyx-portable.flag` file beside the executable. Portable state then lives
/// in an `OnyxData` folder beside the executable, including the first-run flag.
pub fn app_data_dir() -> PathBuf {
    let executable = std::env::current_exe().ok();
    if portable_mode() {
        if let Some(dir) = executable.as_ref().and_then(|exe| exe.parent()) { return dir.join("OnyxData"); }
    }
    // Keep the original data directory name so existing Home Media installs migrate into Onyx without losing state.
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("home-media")
}

pub fn load_settings(path: &Path) -> Settings {
    let mut settings: Settings = fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default();
    // Migrate old single-root installs in memory; the next settings write persists the arrays.
    if settings.movie_paths.is_empty() { if let Some(path) = settings.movie_path.clone() { settings.movie_paths.push(path); } }
    if settings.tv_paths.is_empty() { if let Some(path) = settings.tv_path.clone() { settings.tv_paths.push(path); } }
    settings.movie_paths.sort(); settings.movie_paths.dedup();
    settings.tv_paths.sort(); settings.tv_paths.dedup();
    settings.special_paths.sort(); settings.special_paths.dedup();
    settings
}

pub fn persist_settings(state: &AppState) -> Result<(), String> {
    if let Some(parent) = state.settings_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let contents = serde_json::to_vec_pretty(&*settings).map_err(|e| e.to_string())?;
    fs::write(&state.settings_path, contents).map_err(|e| e.to_string())
}
