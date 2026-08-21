use crate::{activity, database, live_channels, metadata, metadata_view, models::MediaItem, Shared};
use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use std::process::Stdio;
use tokio::process::Command;
use tokio_util::io::ReaderStream;

const USER_HEADER: &str = "x-home-media-user";

fn request_user(state: &crate::AppState, headers: &HeaderMap) -> String {
    let requested = headers.get(USER_HEADER).and_then(|value| value.to_str().ok()).unwrap_or(database::DEFAULT_USER_ID);
    if database::user_exists(&state.database_path, requested) { requested.to_string() } else { database::DEFAULT_USER_ID.to_string() }
}

fn enriched_media(state: &crate::AppState, user_id: &str) -> Result<Vec<MediaItem>, String> {
    let mut items = database::load_library_for_user(&state.database_path, user_id, false)?;
    metadata::enrich_media(&state.database_path, &mut items)?;
    metadata_view::canonicalize(&state.database_path, &mut items)?;
    Ok(items)
}

async fn guide(State(state): State<Shared>, headers: HeaderMap) -> Result<Json<Vec<live_channels::GuideChannel>>, (StatusCode, String)> {
    let user = request_user(&state, &headers);
    let media = enriched_media(&state, &user).map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    let playlists = database::list_playlists(&state.database_path, &user).map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))?;
    live_channels::guide(&state.provider_path, &user, &media, &playlists, None)
        .map(Json)
        .map_err(|error| (StatusCode::INTERNAL_SERVER_ERROR, error))
}

async fn artwork(State(state): State<Shared>, AxumPath(channel_id): AxumPath<String>) -> Response {
    let Some(path) = live_channels::artwork(&state.provider_path, &channel_id) else { return StatusCode::NOT_FOUND.into_response(); };
    let Ok(bytes) = tokio::fs::read(&path).await else { return StatusCode::NOT_FOUND.into_response(); };
    let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "private, max-age=86400")
        .body(Body::from(bytes))
        .unwrap()
}

fn find_item(state:&crate::AppState,media_id:&str)->Option<MediaItem>{state.media.read().ok().and_then(|items|items.iter().find(|item|item.id==media_id).cloned())}
async fn ffmpeg_offset(item:MediaItem,offset:u64,preserve_timeline:bool,category:&str)->Response{
    activity::info(category, format!("Opening {} at {} seconds", item.title, offset));
    let offset_arg=offset.to_string();
    let mut command=crate::child_process::async_command("ffmpeg");
    command.kill_on_drop(true).args(["-hide_banner","-loglevel","error","-ss"]).arg(&offset_arg).arg("-i").arg(&item.path).args(["-map","0:v:0","-map","0:a:0?"]);
    if item.playback_mode=="transcode"{command.args(["-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","192k"]);}else{command.args(["-c:v","copy","-c:a","copy"]);}
    if preserve_timeline{command.args(["-output_ts_offset"]).arg(&offset_arg);}
    command.args(["-movflags","frag_keyframe+empty_moov+default_base_moof","-f","mp4","pipe:1"]).stdout(Stdio::piped()).stderr(Stdio::null());
    let Ok(mut child)=command.spawn() else{return(StatusCode::SERVICE_UNAVAILABLE,"FFmpeg is required for this playback mode.").into_response();};
    let Some(stdout)=child.stdout.take() else{return StatusCode::INTERNAL_SERVER_ERROR.into_response();};tokio::spawn(async move{let _=child.wait().await;});
    Response::builder().status(StatusCode::OK).header(header::CONTENT_TYPE,"video/mp4").header(header::CACHE_CONTROL,"no-store").body(Body::from_stream(ReaderStream::new(stdout))).unwrap()
}

async fn play(State(state): State<Shared>, AxumPath((media_id, offset)): AxumPath<(String, u64)>) -> Response {
    let Some(item)=find_item(&state,&media_id) else{return StatusCode::NOT_FOUND.into_response();};
    ffmpeg_offset(item,offset,false,"Live TV").await
}

async fn resume(State(state): State<Shared>, AxumPath((media_id, offset)): AxumPath<(String, u64)>) -> Response {
    let Some(item)=find_item(&state,&media_id) else{return StatusCode::NOT_FOUND.into_response();};
    ffmpeg_offset(item,offset,true,"Playback").await
}

pub fn router() -> Router<Shared> {
    Router::new()
        .route("/api/live-channels/guide", get(guide))
        .route("/api/live-channels/art/{channel_id}", get(artwork))
        .route("/api/live-channels/play/{media_id}/{offset}", get(play))
        .route("/api/playback/resume/{media_id}/{offset}", get(resume))
        .merge(crate::user_features_server::router())
}