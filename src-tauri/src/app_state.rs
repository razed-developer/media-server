use crate::models::MediaItem;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::{Arc, RwLock}};

#[derive(Default, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub library_path: Option<String>,
    #[serde(default)]
    pub movie_path: Option<String>,
    #[serde(default)]
    pub tv_path: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub settings_path: PathBuf,
    pub database_path: PathBuf,
    pub settings: Arc<RwLock<Settings>>,
    pub media: Arc<RwLock<Vec<MediaItem>>>,
}

pub type Shared = Arc<AppState>;

pub fn app_data_dir() -> PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")).join("home-media")
}

pub fn load_settings(path: &Path) -> Settings {
    fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

pub fn persist_settings(state: &AppState) -> Result<(), String> {
    if let Some(parent) = state.settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let settings = state.settings.read().map_err(|_| "Settings lock poisoned")?;
    let contents = serde_json::to_vec_pretty(&*settings).map_err(|e| e.to_string())?;
    fs::write(&state.settings_path, contents).map_err(|e| e.to_string())
}
