use crate::{database, models::MediaItem, Shared};
use axum::{
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{net::SocketAddr, path::{Path, PathBuf}};
use tower_http::{cors::CorsLayer, services::{ServeDir, ServeFile}};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserStatus {
    running: bool,
    item_count: usize,
    ffprobe_available: bool,
}

#[derive(Deserialize)]
struct ProgressPayload {
    seconds: u64,
}

pub async fn api_library(State(state): State<Shared>) -> Json<Vec<MediaItem>> {
    Json(state.media.read().map(|m| m.clone()).unwrap_or_default())
}

async fn api_status(State(state): State<Shared>) -> Json<BrowserStatus> {
    let item_count = state.media.read().map(|m| m.len()).unwrap_or(0);
    let ffprobe_available = std::process::Command::new("ffprobe")
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    Json(BrowserStatus { running: true, item_count, ffprobe_available })
}

async fn api_save_progress(
    State(state): State<Shared>,
    AxumPath(id): AxumPath<String>,
    Json(payload): Json<ProgressPayload>,
) -> StatusCode {
    if database::save_progress(&state.database_path, &id, payload.seconds).is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR;
    }
    if let Ok(mut media) = state.media.write() {
        if let Some(item) = media.iter_mut().find(|item| item.id == id) {
            item.progress_seconds = payload.seconds;
        }
    }
    StatusCode::NO_CONTENT
}

fn find_media(state: &crate::AppState, id: &str) -> Option<MediaItem> {
    state.media.read().ok()?.iter().find(|item| item.id == id).cloned()
}

pub async fn stream_media(State(state): State<Shared>, AxumPath(id): AxumPath<String>, headers: HeaderMap) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let Ok(bytes) = tokio::fs::read(&item.path).await else { return StatusCode::NOT_FOUND.into_response(); };
    let total = bytes.len();
    if total == 0 { return StatusCode::NO_CONTENT.into_response(); }
    let mime = mime_guess::from_path(&item.path).first_or_octet_stream().to_string();

    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("bytes=")) {
        let mut parts = range.split('-');
        let start = parts.next().and_then(|v| v.parse::<usize>().ok()).unwrap_or(0).min(total - 1);
        let end = parts.next().and_then(|v| if v.is_empty() { None } else { v.parse::<usize>().ok() }).unwrap_or(total - 1).min(total - 1);
        if start > end { return StatusCode::RANGE_NOT_SATISFIABLE.into_response(); }
        let body = bytes[start..=end].to_vec();
        let mut response = (StatusCode::PARTIAL_CONTENT, body).into_response();
        response.headers_mut().insert(header::CONTENT_RANGE, HeaderValue::from_str(&format!("bytes {start}-{end}/{total}")).unwrap());
        response.headers_mut().insert(header::CONTENT_LENGTH, HeaderValue::from_str(&(end - start + 1).to_string()).unwrap());
        response.headers_mut().insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
        response
    } else {
        let mut response = bytes.into_response();
        response.headers_mut().insert(header::CONTENT_LENGTH, HeaderValue::from_str(&total.to_string()).unwrap());
        response.headers_mut().insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_str(&mime).unwrap());
        response
    }
}

pub async fn subtitle(State(state): State<Shared>, AxumPath((id, filename)): AxumPath<(String, String)>) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let decoded = urlencoding::decode(&filename).map(|v| v.into_owned()).unwrap_or(filename);
    if decoded.contains('/') || decoded.contains('\\') || decoded == ".." { return StatusCode::FORBIDDEN.into_response(); }
    let Some(parent) = Path::new(&item.path).parent() else { return StatusCode::NOT_FOUND.into_response(); };
    let path = parent.join(decoded);
    let Ok(raw) = tokio::fs::read_to_string(&path).await else { return StatusCode::NOT_FOUND.into_response(); };
    let content = if path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("srt")).unwrap_or(false) {
        format!("WEBVTT\n\n{}", raw.replace(',', "."))
    } else { raw };
    let mut response = content.into_response();
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/vtt; charset=utf-8"));
    response
}

async fn dev_browser_redirect() -> Html<&'static str> {
    Html(r#"<!doctype html><meta charset=\"utf-8\"><title>Home Media</title><script>location.replace('http://'+location.hostname+':1420'+location.pathname+location.search+location.hash)</script><p>Opening Home Media…</p>"#)
}

pub async fn start(state: Shared, port: u16, web_root: Option<PathBuf>) {
    let router = Router::new()
        .route("/api/library", get(api_library))
        .route("/api/status", get(api_status))
        .route("/api/progress/{id}", post(api_save_progress))
        .route("/stream/{id}", get(stream_media))
        .route("/subtitle/{id}/{filename}", get(subtitle))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let router = if let Some(root) = web_root.filter(|path| path.join("index.html").is_file()) {
        router.fallback_service(
            ServeDir::new(&root)
                .append_index_html_on_directories(true)
                .not_found_service(ServeFile::new(root.join("index.html")))
        )
    } else {
        router.fallback(dev_browser_redirect)
    };

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            println!("Home Media browser server listening on http://0.0.0.0:{port}");
            if let Err(error) = axum::serve(listener, router).await { eprintln!("Media server stopped: {error}"); }
        }
        Err(error) => eprintln!("Could not start media server on {addr}: {error}"),
    }
}
