use crate::activity;
use std::{fs, path::PathBuf};

#[tauri::command]
pub fn save_ibroadcast_logo(path: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("The generated iBroadcast logo was not a valid PNG.".into());
    }
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    activity::info("Assets", format!("Saved 128×128 iBroadcast developer logo to {}", path.display()));
    Ok(path.to_string_lossy().to_string())
}
