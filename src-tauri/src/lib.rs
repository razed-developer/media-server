mod activity;
mod app_state;
mod artwork;
mod assets;
mod backup;
mod commands;
mod child_process;
mod captions;
mod database;
mod household_feed;
mod ibroadcast;
mod ibroadcast_oauth;
mod library;
mod library_health;
mod sleep_videos;
mod live_channels;
mod live_server;
mod metadata;
mod metadata_view;
mod models;
mod naming;
mod probe;
mod server;
mod subtitles;
mod user_features;
mod user_features_server;

use app_state::{app_data_dir, load_settings, AppState, ScanProgress};
use std::{collections::HashMap, process::Command, sync::{Arc, RwLock}, time::Instant};
use tauri::{path::BaseDirectory, Manager};

pub use app_state::Shared;
pub const PORT: u16 = 8765;
pub const FUNNEL_GATEWAY_PORT: u16 = 8766;

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid URL".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") { return Err("Only HTTP and HTTPS links can be opened".into()); }
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32").args(["url.dll,FileProtocolHandler", parsed.as_str()]).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(parsed.as_str()).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(parsed.as_str()).spawn();
    result.map(|_| ()).map_err(|error| format!("Could not open the link: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup = Instant::now();
    let data_dir = app_data_dir();
    let settings_path = data_dir.join("settings.json");
    let database_path = data_dir.join("library.db");
    let artwork_path = data_dir.join("artwork");
    let provider_path = data_dir.join("providers");
    activity::info("Server", format!("Onyx starting with data directory {}", data_dir.display()));
    let phase=Instant::now();if let Err(error) = database::init(&database_path) { activity::error("Database", format!("Database initialization failed: {error}")); }activity::info("Performance",format!("Startup database initialization: {} ms",phase.elapsed().as_millis()));
    let phase=Instant::now();if let Err(error) = metadata::init(&database_path) { activity::error("Metadata", format!("Metadata initialization failed: {error}")); }activity::info("Performance",format!("Startup metadata initialization: {} ms",phase.elapsed().as_millis()));
    let phase=Instant::now();if let Err(error) = user_features::init(&database_path) { activity::error("Users", format!("User feature initialization failed: {error}")); }activity::info("Performance",format!("Startup user-feature initialization: {} ms",phase.elapsed().as_millis()));
    let phase=Instant::now();
    let initial_media = database::load_library(&database_path).unwrap_or_default();
    activity::info("Performance",format!("Startup library load: {} ms for {} items",phase.elapsed().as_millis(),initial_media.len()));
    let metadata_media = initial_media.iter().filter(|item| item.kind != "special").cloned().collect::<Vec<_>>();
    let phase=Instant::now();
    let _ = metadata::reconcile_local_entities(&database_path, &metadata_media);
    activity::info("Performance",format!("Startup metadata reconciliation: {} ms for {} items",phase.elapsed().as_millis(),metadata_media.len()));
    activity::info("Library", format!("Loaded {} media items from the library database", initial_media.len()));
    let shared = Arc::new(AppState {
        settings_path: settings_path.clone(), database_path, artwork_path, provider_path,
        settings: Arc::new(RwLock::new(load_settings(&settings_path))),
        media: Arc::new(RwLock::new(initial_media)), sessions: Arc::new(RwLock::new(HashMap::new())),
        scan_progress: Arc::new(RwLock::new(ScanProgress::default())),
        captions: captions::CaptionRuntime::default(),
    });
    activity::info("Performance",format!("Backend startup preparation total: {} ms",startup.elapsed().as_millis()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shared.clone())
        .setup(move |app| {
            let server_state = shared.clone();
            let web_root = if cfg!(debug_assertions) { None } else { app.path().resolve("web", BaseDirectory::Resource).ok() };
            activity::info("Server", format!("Starting browser server on port {PORT}"));
            tauri::async_runtime::spawn(async move { server::start(server_state, PORT, FUNNEL_GATEWAY_PORT, web_root).await; });
            if let Some(window) = app.get_webview_window("main") { let _ = window.set_title("Onyx"); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            backup::backup_create, backup::backup_preview, backup::backup_restore,
            activity::activity_entries, activity::clear_activity, activity::record_client_activity, assets::save_ibroadcast_logo,
            household_feed::household_feed,
            commands::setup_status, commands::complete_setup, commands::set_ibroadcast_client_id,
            commands::set_library_path, commands::set_movie_path, commands::set_tv_path,
            commands::add_movie_path, commands::add_tv_path, commands::remove_movie_path, commands::remove_tv_path,
            commands::add_special_path, commands::remove_special_path,
            commands::configure_library_root,
            commands::set_access_password, commands::clear_access_password,
            commands::funnel_status, commands::set_funnel_enabled,
            commands::scan_library, commands::library_scan_progress, commands::list_users, commands::create_user, commands::rename_user, commands::delete_user,
            library_health::library_health, library_health::library_health_repair_all, library_health::library_health_repair_item,
            commands::get_user_preferences, commands::set_user_theme, commands::set_split_continue_watching, commands::user_analytics,
            commands::list_media, commands::save_progress, commands::reset_watch_status, commands::set_hidden,
            commands::server_status, commands::clear_thumbnail_cache, commands::identify_item,
            commands::identify_show, commands::reset_identification, commands::list_playlists,
            commands::create_playlist, commands::add_to_playlist, commands::remove_from_playlist,
            commands::delete_playlist, commands::ibroadcast_status,
            ibroadcast_oauth::ibroadcast_authorization_start, commands::ibroadcast_sync, commands::ibroadcast_library,
            commands::ibroadcast_disconnect, commands::metadata_provider_status,
            commands::set_tmdb_token, commands::clear_tmdb_token, commands::test_tmdb,
            commands::metadata_search, commands::metadata_apply_match, commands::metadata_auto_match_all,
            live_channels::live_channels_list, live_channels::live_channels_save,
            live_channels::live_channels_delete, live_channels::live_channels_set_artwork,
            live_channels::live_channels_guide,
            subtitles::subtitle_provider_status, subtitles::subtitle_provider_save,
            subtitles::subtitle_provider_clear, subtitles::subtitle_provider_test,
            subtitles::subtitle_search, subtitles::subtitle_download,
            captions::caption_status, captions::caption_configure,
            captions::caption_generate, captions::caption_generate_missing,
            sleep_videos::sleep_video_status, sleep_videos::sleep_video_configure,
            user_features::user_avatars, user_features::user_avatar_set_builtin,
            user_features::user_avatar_set_custom, user_features::user_reactions,
            user_features::user_reaction_set, user_features::user_recommendation_send,
            user_features::user_recommendations, user_features::user_recommendation_mark_read,
            user_features::user_wishlist_search, user_features::user_wishlist_add,
            user_features::user_wishlist_list, user_features::user_wishlist_set_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Onyx");
}
