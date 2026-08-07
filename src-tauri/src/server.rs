use crate::{models::MediaItem, Shared};
use axum::{extract::{Path as AxumPath, State}, http::{header, HeaderMap, HeaderValue, StatusCode}, response::{IntoResponse, Response}, routing::get, Json, Router};
use std::{net::SocketAddr, path::Path};
use tower_http::cors::CorsLayer;

pub async fn api_library(State(state): State<Shared>) -> Json<Vec<MediaItem>> {
    Json(state.media.read().map(|m| m.clone()).unwrap_or_default())
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

pub async fn start(state: Shared, port: u16) {
    let router = Router::new()
        .route("/api/library", get(api_library))
        .route("/stream/{id}", get(stream_media))
        .route("/subtitle/{id}/{filename}", get(subtitle))
        .layer(CorsLayer::permissive())
        .with_state(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            if let Err(error) = axum::serve(listener, router).await { eprintln!("Media server stopped: {error}"); }
        }
        Err(error) => eprintln!("Could not start media server on {addr}: {error}"),
    }
}
