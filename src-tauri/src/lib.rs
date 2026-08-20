mod activity;
mod app_state;
mod artwork;
mod assets;
mod commands;
mod database;
mod ibroadcast;
mod library;
mod metadata;
mod metadata_view;
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
    let provider_path = data_dir.join("providers");
    activity::info("Server", format!("Onyx starting with data directory {}", data_dir.display()));
    if let Err(error) = database::init(&database_path) { activity::error("Database", format!("Database initialization failed: {error}")); }
    if let Err(error) = metadata::init(&database_path) { activity::error("Metadata", format!("Metadata initialization failed: {error}")); }
    let initial_media = database::load_library(&database_path).unwrap_or_default();
    let _ = metadata::reconcile_local_entities(&database_path, &initial_media);
    activity::info("Library", format!("Loaded {} media items from the library database", initial_media.len()));
    let shared = Arc::new(AppState {
        settings_path: settings_path.clone(), database_path, artwork_path, provider_path,
        settings: Arc::new(RwLock::new(load_settings(&settings_path))),
        media: Arc::new(RwLock::new(initial_media)), sessions: Arc::new(RwLock::new(HashMap::new())),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shared.clone())
        .setup(move |app| {
            let server_state = shared.clone();
            let web_root = if cfg!(debug_assertions) { None } else { app.path().resolve("web", BaseDirectory::Resource).ok() };
            activity::info("Server", format!("Starting browser server on port {PORT}"));
            tauri::async_runtime::spawn(async move { server::start(server_state, PORT, web_root).await; });
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_title("Onyx"); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            activity::activity_entries, activity::clear_activity, assets::save_ibroadcast_logo,
            commands::setup_status, commands::complete_setup, commands::set_ibroadcast_client_id,
            commands::set_library_path, commands::set_movie_path, commands::set_tv_path,
            commands::set_access_password, commands::clear_access_password,
            commands::scan_library, commands::list_users, commands::create_user, commands::rename_user, commands::delete_user,
            commands::get_user_preferences, commands::set_user_theme, commands::user_analytics,
            commands::list_media, commands::save_progress, commands::reset_watch_status, commands::set_hidden,
            commands::server_status, commands::clear_thumbnail_cache, commands::identify_item,
            commands::identify_show, commands::reset_identification, commands::list_playlists,
            commands::create_playlist, commands::add_to_playlist, commands::remove_from_playlist,
            commands::delete_playlist, commands::ibroadcast_status, commands::ibroadcast_device_start,
            commands::ibroadcast_device_poll, commands::ibroadcast_sync, commands::ibroadcast_library,
            commands::ibroadcast_disconnect, commands::metadata_provider_status,
            commands::set_tmdb_token, commands::clear_tmdb_token, commands::test_tmdb,
            commands::metadata_search, commands::metadata_apply_match, commands::metadata_auto_match_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running Onyx");
}
