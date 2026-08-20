mod app_state;
mod artwork;
mod commands;
mod database;
mod library;
mod models;
mod naming;
mod probe;
mod server;

use app_state::{app_data_dir, load_settings, AppState};
use std::{collections::HashMap, sync::{Arc, RwLock}};
use tauri::{path::BaseDirectory, Manager};

pub use app_state::Shared;
pub const PORT: u16 = 8765;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = app_data_dir();
    let settings_path = data_dir.join("settings.json");
    let database_path = data_dir.join("library.db");
    let artwork_path = data_dir.join("artwork");
    if let Err(error) = database::init(&database_path) { eprintln!("Database initialization failed: {error}"); }
    let initial_media = database::load_library(&database_path).unwrap_or_default();
    let shared = Arc::new(AppState {
        settings_path: settings_path.clone(), database_path, artwork_path,
        settings: Arc::new(RwLock::new(load_settings(&settings_path))),
        media: Arc::new(RwLock::new(initial_media)), sessions: Arc::new(RwLock::new(HashMap::new())),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shared.clone())
        .setup(move |app| {
            let server_state = shared.clone();
            let web_root = if cfg!(debug_assertions) { None } else { app.path().resolve("web", BaseDirectory::Resource).ok() };
            tauri::async_runtime::spawn(async move { server::start(server_state, PORT, web_root).await; });
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_title("Home Media"); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_library_path, commands::set_movie_path, commands::set_tv_path,
            commands::set_access_password, commands::clear_access_password,
            commands::scan_library, commands::list_media, commands::save_progress, commands::server_status,
            commands::clear_thumbnail_cache, commands::identify_item, commands::identify_show,
            commands::reset_identification
        ])
        .run(tauri::generate_context!())
        .expect("error while running Home Media");
}
