use crate::{activity, app_state::persist_settings, Shared};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::State;

const EXTENSIONS: &[&str] = &["mp4", "m4v", "mov", "webm", "ogv"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepVideo { pub id: String, pub name: String, pub url: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepVideoStatus { pub folder: Option<String>, pub videos: Vec<SleepVideo> }

fn id(path: &Path) -> String { let mut hash=Sha256::new();hash.update(path.to_string_lossy().as_bytes());hex::encode(hash.finalize())[..20].into() }
fn files(state: &crate::AppState) -> Vec<(String,PathBuf)> {
    let folder=state.settings.read().ok().and_then(|settings|settings.sleep_video_path.clone()).map(PathBuf::from);
    let Some(folder)=folder.filter(|path|path.is_dir())else{return vec![]};
    let mut values=walkdir::WalkDir::new(folder).max_depth(4).into_iter().filter_map(Result::ok).filter(|entry|entry.file_type().is_file()).filter_map(|entry|{
        let path=entry.into_path();let extension=path.extension()?.to_str()?.to_ascii_lowercase();
        EXTENSIONS.contains(&extension.as_str()).then(||(id(&path),path))
    }).collect::<Vec<_>>();
    values.sort_by(|a,b|a.1.cmp(&b.1));values
}
pub fn status(state:&crate::AppState)->SleepVideoStatus{
    let folder=state.settings.read().ok().and_then(|settings|settings.sleep_video_path.clone());
    let videos=files(state).into_iter().map(|(id,path)|SleepVideo{id:id.clone(),name:path.file_name().and_then(|name|name.to_str()).unwrap_or("Sleep video").into(),url:format!("/sleep-video/{id}")}).collect();
    SleepVideoStatus{folder,videos}
}
pub fn path_for_id(state:&crate::AppState,wanted:&str)->Option<PathBuf>{files(state).into_iter().find(|(id,_)|id==wanted).map(|(_,path)|path)}

#[tauri::command]
pub fn sleep_video_status(state:State<'_,Shared>)->SleepVideoStatus{status(&state)}

#[tauri::command]
pub fn sleep_video_configure(path:Option<String>,state:State<'_,Shared>)->Result<SleepVideoStatus,String>{
    let path=path.filter(|value|!value.trim().is_empty());
    if path.as_ref().is_some_and(|value|!Path::new(value).is_dir()){return Err("Choose an existing folder containing sleep videos.".into())}
    state.settings.write().map_err(|_|"Settings lock poisoned")?.sleep_video_path=path.clone();persist_settings(&state)?;
    activity::info("Sleep",match &path{Some(value)=>format!("Sleep video folder set to {value}"),None=>"Sleep video folder cleared".into()});Ok(status(&state))
}
