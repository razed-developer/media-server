use crate::{database, library, models::MediaItem, Shared};
use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    io::SeekFrom,
    net::SocketAddr,
    path::{Path, PathBuf},
    process::Stdio,
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt},
    process::Command,
};
use tokio_util::io::ReaderStream;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserStatus {
    running: bool,
    item_count: usize,
    ffprobe_available: bool,
    ffmpeg_available: bool,
}

#[derive(Deserialize)]
struct ProgressPayload {
    seconds: u64,
}

pub async fn api_library(State(state): State<Shared>) -> Json<Vec<MediaItem>> {
    Json(state.media.read().map(|m| m.clone()).unwrap_or_default())
}

fn command_available(name: &str) -> bool {
    std::process::Command::new(name)
        .arg("-version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

async fn api_status(State(state): State<Shared>) -> Json<BrowserStatus> {
    let item_count = state.media.read().map(|m| m.len()).unwrap_or(0);
    Json(BrowserStatus {
        running: true,
        item_count,
        ffprobe_available: command_available("ffprobe"),
        ffmpeg_available: command_available("ffmpeg"),
    })
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

fn parse_range(headers: &HeaderMap, total: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = headers.get(header::RANGE).and_then(|value| value.to_str().ok()) else {
        return Ok(None);
    };
    let Some(value) = value.strip_prefix("bytes=") else { return Err(()); };
    if value.contains(',') { return Err(()); }
    let (start_text, end_text) = value.split_once('-').ok_or(())?;

    if start_text.is_empty() {
        let suffix = end_text.parse::<u64>().map_err(|_| ())?;
        if suffix == 0 { return Err(()); }
        let start = total.saturating_sub(suffix);
        return Ok(Some((start, total.saturating_sub(1))));
    }

    let start = start_text.parse::<u64>().map_err(|_| ())?;
    if start >= total { return Err(()); }
    let end = if end_text.is_empty() {
        total - 1
    } else {
        end_text.parse::<u64>().map_err(|_| ())?.min(total - 1)
    };
    if start > end { return Err(()); }
    Ok(Some((start, end)))
}

fn range_error(total: u64) -> Response {
    Response::builder()
        .status(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(header::CONTENT_RANGE, format!("bytes */{total}"))
        .body(Body::empty())
        .unwrap()
}

async fn direct_stream(item: &MediaItem, headers: &HeaderMap) -> Response {
    let Ok(metadata) = tokio::fs::metadata(&item.path).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let total = metadata.len();
    if total == 0 { return StatusCode::NO_CONTENT.into_response(); }

    let range = match parse_range(headers, total) {
        Ok(range) => range,
        Err(()) => return range_error(total),
    };
    let (status, start, end) = match range {
        Some((start, end)) => (StatusCode::PARTIAL_CONTENT, start, end),
        None => (StatusCode::OK, 0, total - 1),
    };

    let Ok(mut file) = File::open(&item.path).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if start > 0 && file.seek(SeekFrom::Start(start)).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let length = end - start + 1;
    let body = Body::from_stream(ReaderStream::new(file.take(length)));
    let mime = mime_guess::from_path(&item.path).first_or_octet_stream().to_string();
    let mut builder = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, length.to_string())
        .header(header::ACCEPT_RANGES, "bytes");
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{total}"));
    }
    builder.body(body).unwrap()
}

async fn ffmpeg_playback(item: &MediaItem, transcode: bool) -> Response {
    let mut command = Command::new("ffmpeg");
    command
        .kill_on_drop(true)
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(&item.path)
        .args(["-map", "0:v:0", "-map", "0:a:0?"]);

    if transcode {
        command.args([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
        ]);
    } else {
        command.args(["-c:v", "copy", "-c:a", "copy"]);
    }

    command
        .args([
            "-movflags", "frag_keyframe+empty_moov+default_base_moof",
            "-f", "mp4",
            "pipe:1",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    let Ok(mut child) = command.spawn() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "FFmpeg is required for this file but was not found or could not be started.",
        ).into_response();
    };
    let Some(stdout) = child.stdout.take() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from_stream(ReaderStream::new(stdout)))
        .unwrap()
}

pub async fn play_media(
    State(state): State<Shared>,
    AxumPath(id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    match item.playback_mode.as_str() {
        "directPlay" => direct_stream(&item, &headers).await,
        "remux" => ffmpeg_playback(&item, false).await,
        _ => ffmpeg_playback(&item, true).await,
    }
}

pub async fn stream_media(
    State(state): State<Shared>,
    AxumPath(id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    direct_stream(&item, &headers).await
}

pub async fn artwork(
    State(state): State<Shared>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let Some(path) = library::find_poster(Path::new(&item.path)) else { return StatusCode::NOT_FOUND.into_response(); };
    let Ok(bytes) = tokio::fs::read(&path).await else { return StatusCode::NOT_FOUND.into_response(); };
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(bytes))
        .unwrap()
}

fn srt_to_vtt(raw: &str) -> String {
    let converted = raw
        .lines()
        .map(|line| if line.contains("-->") { line.replace(',', ".") } else { line.to_string() })
        .collect::<Vec<_>>()
        .join("\n");
    format!("WEBVTT\n\n{converted}")
}

pub async fn subtitle(
    State(state): State<Shared>,
    AxumPath((id, filename)): AxumPath<(String, String)>,
) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let decoded = urlencoding::decode(&filename).map(|v| v.into_owned()).unwrap_or(filename);
    if decoded.contains('/') || decoded.contains('\\') || decoded == ".." { return StatusCode::FORBIDDEN.into_response(); }
    let Some(parent) = Path::new(&item.path).parent() else { return StatusCode::NOT_FOUND.into_response(); };
    let path = parent.join(decoded);
    let Ok(raw) = tokio::fs::read_to_string(&path).await else { return StatusCode::NOT_FOUND.into_response(); };
    let content = if path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("srt")).unwrap_or(false) {
        srt_to_vtt(&raw)
    } else { raw };
    let mut response = content.into_response();
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static("text/vtt; charset=utf-8"));
    response
}

pub async fn embedded_subtitle(
    State(state): State<Shared>,
    AxumPath((id, stream_index)): AxumPath<(String, u32)>,
) -> Response {
    let Some(item) = find_media(&state, &id) else { return StatusCode::NOT_FOUND.into_response(); };
    let allowed = item.subtitles.iter().any(|track| track.embedded && track.stream_index == Some(stream_index));
    if !allowed { return StatusCode::NOT_FOUND.into_response(); }

    let mut command = Command::new("ffmpeg");
    command
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(&item.path)
        .arg("-map")
        .arg(format!("0:{stream_index}"))
        .args(["-f", "webvtt", "pipe:1"]);
    let output = command.output().await;
    let Ok(output) = output else {
        return (StatusCode::SERVICE_UNAVAILABLE, "FFmpeg is required to extract embedded subtitles.").into_response();
    };
    if !output.status.success() { return StatusCode::UNPROCESSABLE_ENTITY.into_response(); }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/vtt; charset=utf-8")
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(output.stdout))
        .unwrap()
}

async fn dev_browser_redirect() -> Html<&'static str> {
    Html(r#"<!doctype html><meta charset=\"utf-8\"><title>Home Media</title><script>location.replace('http://'+location.hostname+':1420'+location.pathname+location.search+location.hash)</script><p>Opening Home Media…</p>"#)
}

pub async fn start(state: Shared, port: u16, web_root: Option<PathBuf>) {
    let router = Router::new()
        .route("/api/library", get(api_library))
        .route("/api/status", get(api_status))
        .route("/api/progress/{id}", post(api_save_progress))
        .route("/play/{id}", get(play_media))
        .route("/stream/{id}", get(stream_media))
        .route("/art/{id}/poster", get(artwork))
        .route("/subtitle/{id}/embedded/{stream_index}", get(embedded_subtitle))
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

#[cfg(test)]
mod tests {
    use super::parse_range;
    use axum::http::{header, HeaderMap, HeaderValue};

    fn range(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(header::RANGE, HeaderValue::from_str(value).unwrap());
        headers
    }

    #[test]
    fn parses_normal_range() {
        assert_eq!(parse_range(&range("bytes=100-199"), 1000), Ok(Some((100, 199))));
    }

    #[test]
    fn parses_open_ended_range() {
        assert_eq!(parse_range(&range("bytes=900-"), 1000), Ok(Some((900, 999))));
    }

    #[test]
    fn parses_suffix_range() {
        assert_eq!(parse_range(&range("bytes=-100"), 1000), Ok(Some((900, 999))));
    }

    #[test]
    fn rejects_range_past_end() {
        assert!(parse_range(&range("bytes=1000-"), 1000).is_err());
    }
}
