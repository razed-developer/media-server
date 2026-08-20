use crate::models::MediaItem;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::{Arc, RwLock}};

#[derive(Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)] pub library_path: Option<String>,
    #[serde(default)] pub movie_path: Option<String>,
    #[serde(default)] pub tv_path: Option<String>,
    #[serde(default)] pub access_password_hash: Option<String>,
    #[serde(default)] pub setup_complete: bool,
    #[serde(default)] pub ibroadcast_client_id: Option<String>,
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
}

pub type Shared = Arc<AppState>;

/// Portable mode is enabled by setting ONYX_PORTABLE=1 or placing an
/// `onyx-portable.flag` file beside the executable. Portable state then lives
/// in an `OnyxData` folder beside the executable, including the first-run flag.
pub fn app_data_dir() -> PathBuf {
    let portable_env = std::env::var("ONYX_PORTABLE").ok().is_some_and(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"));
    let executable = std::env::current_exe().ok();
    let portable_flag = executable.as_ref().and_then(|exe| exe.parent()).map(|dir| dir.join("onyx-portable.flag")).is_some_and(|flag| flag.is_file());
    if portable_env || portable_flag {
        if let Some(dir) = executable.as_ref().and_then(|exe| exe.parent()) { return dir.join("OnyxData"); }
    }
    // Keep the original data directory name so existing Home Media installs migrate into Onyx without losing state.
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("home-media")
}

pub fn load_settings(path: &Path) -> Settings { fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default() }

pub fn persist_settings(state: &AppState) -> Result<(), String> {
    if let Some(parent) = state.settings_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let contents = serde_json::to_vec_pretty(&*settings).map_err(|e| e.to_string())?;
    fs::write(&state.settings_path, contents).map_err(|e| e.to_string())
}
