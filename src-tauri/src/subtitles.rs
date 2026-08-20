use crate::{activity, models::MediaItem, Shared};
use keyring::Entry;
use reqwest::{header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT}, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::Path};
use tauri::State;

const API_ROOT: &str = "https://api.opensubtitles.com/api/v1";
const KEYRING_SERVICE: &str = "onyx-subtitles";
const KEYRING_USER: &str = "opensubtitles";
const APP_USER_AGENT: &str = "Onyx v0.1.0";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase")]
struct Credentials { api_key:String, username:String, password:String }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct SubtitleProviderStatus { pub configured:bool, pub provider:String, pub account:String }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct SubtitleSearchResult {
    pub file_id:i64,
    pub file_name:String,
    pub language:String,
    pub release:String,
    pub hearing_impaired:bool,
    pub download_count:u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DownloadedSubtitle { pub file_name:String, pub language:String, pub label:String, pub url:String }

fn entry()->Result<Entry,String>{Entry::new(KEYRING_SERVICE,KEYRING_USER).map_err(|e|format!("Could not open subtitle credential store: {e}"))}
fn load()->Result<Credentials,String>{let raw=entry()?.get_password().map_err(|_|"OpenSubtitles is not configured. Add your API key and account in Settings → Subtitles.".to_string())?;serde_json::from_str(&raw).map_err(|e|e.to_string())}
fn client()->Client{Client::builder().user_agent(APP_USER_AGENT).build().unwrap_or_else(|_|Client::new())}

pub fn status()->SubtitleProviderStatus{match load(){Ok(c)=>SubtitleProviderStatus{configured:true,provider:"OpenSubtitles".into(),account:c.username},Err(_)=>SubtitleProviderStatus{configured:false,provider:"OpenSubtitles".into(),account:String::new()}}}
pub fn save(api_key:&str,username:&str,password:&str)->Result<(),String>{let c=Credentials{api_key:api_key.trim().to_string(),username:username.trim().to_string(),password:password.to_string()};if c.api_key.is_empty()||c.username.is_empty()||c.password.is_empty(){return Err("API key, username, and password are required".into())}entry()?.set_password(&serde_json::to_string(&c).map_err(|e|e.to_string())?).map_err(|e|format!("Could not save OpenSubtitles credentials: {e}"))?;activity::info("Subtitles","OpenSubtitles credentials saved securely");Ok(())}
pub fn clear()->Result<(),String>{let _=entry()?.delete_credential();activity::info("Subtitles","OpenSubtitles credentials removed");Ok(())}

async fn login(c:&Credentials)->Result<(String,String),String>{
 let response=client().post(format!("{API_ROOT}/login")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(CONTENT_TYPE,"application/json").json(&json!({"username":c.username,"password":c.password})).send().await.map_err(|e|e.to_string())?;
 let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;if !code.is_success(){return Err(format!("OpenSubtitles login failed ({code}): {}",value.get("message").and_then(Value::as_str).unwrap_or("check your API key and account")))}
 let token=value.get("token").and_then(Value::as_str).ok_or("OpenSubtitles did not return a login token")?.to_string();let host=value.get("base_url").and_then(Value::as_str).unwrap_or("api.opensubtitles.com");let base=if host.starts_with("http") {format!("{}/api/v1",host.trim_end_matches('/'))}else{format!("https://{host}/api/v1")};Ok((token,base))
}

pub async fn test()->Result<(),String>{let c=load()?;let _=login(&c).await?;activity::info("Subtitles","OpenSubtitles connection test succeeded");Ok(())}

fn find_media(state:&crate::app_state::AppState,id:&str)->Result<MediaItem,String>{state.media.read().map_err(|_|"Media lock poisoned".to_string())?.iter().find(|m|m.id==id).cloned().ok_or_else(||"Media item not found".into())}

pub async fn search(state:&crate::app_state::AppState,media_id:&str,language:&str)->Result<Vec<SubtitleSearchResult>,String>{
 let c=load()?;let item=find_media(state,media_id)?;let (token,base)=login(&c).await?;
 let mut params:Vec<(&str,String)>=vec![("languages",language.to_string()),("order_by","download_count".into()),("order_direction","desc".into())];
 if let Some(tmdb)=item.provider_id.as_ref(){if item.kind=="episode"{params.push(("parent_tmdb_id",tmdb.clone()));if let Some(s)=item.season{params.push(("season_number",s.to_string()));}if let Some(e)=item.episode{params.push(("episode_number",e.to_string()));}}else{params.push(("tmdb_id",tmdb.clone()));}}
 else {params.push(("query",if item.kind=="episode"{item.show_title.clone().unwrap_or(item.title.clone())}else{item.title.clone()}));}
 activity::info("Subtitles",format!("Searching OpenSubtitles for “{}” ({language})",item.title));
 let response=client().get(format!("{base}/subtitles")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(AUTHORIZATION,format!("Bearer {token}")).query(&params).send().await.map_err(|e|e.to_string())?;let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;if !code.is_success(){return Err(format!("OpenSubtitles search failed ({code})"))}
 let mut out=vec![];for row in value.get("data").and_then(Value::as_array).into_iter().flatten().take(30){let a=row.get("attributes").unwrap_or(row);let Some(file)=a.get("files").and_then(Value::as_array).and_then(|v|v.first()) else{continue};let Some(file_id)=file.get("file_id").and_then(Value::as_i64) else{continue};out.push(SubtitleSearchResult{file_id,file_name:file.get("file_name").and_then(Value::as_str).unwrap_or("subtitle.srt").to_string(),language:a.get("language").and_then(Value::as_str).unwrap_or(language).to_string(),release:a.get("release").and_then(Value::as_str).or_else(||a.get("feature_details").and_then(|v|v.get("title")).and_then(Value::as_str)).unwrap_or("").to_string(),hearing_impaired:a.get("hearing_impaired").and_then(Value::as_bool).unwrap_or(false),download_count:a.get("download_count").and_then(Value::as_u64).unwrap_or(0)});}
 activity::info("Subtitles",format!("OpenSubtitles returned {} candidates",out.len()));Ok(out)
}

pub async fn download(state:&crate::app_state::AppState,media_id:&str,file_id:i64,language:&str)->Result<DownloadedSubtitle,String>{
 let c=load()?;let item=find_media(state,media_id)?;let (token,base)=login(&c).await?;let response=client().post(format!("{base}/download")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(AUTHORIZATION,format!("Bearer {token}")).json(&json!({"file_id":file_id,"sub_format":"srt"})).send().await.map_err(|e|e.to_string())?;let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;if !code.is_success(){return Err(format!("OpenSubtitles download request failed ({code}): {}",value.get("message").and_then(Value::as_str).unwrap_or("download unavailable")))}let link=value.get("link").and_then(Value::as_str).ok_or("OpenSubtitles did not return a download link")?;
 let bytes=client().get(link).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.bytes().await.map_err(|e|e.to_string())?;let video=Path::new(&item.path);let parent=video.parent().ok_or("Media file has no parent folder")?;let stem=video.file_stem().and_then(|v|v.to_str()).ok_or("Media filename is invalid")?;let safe_lang=language.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-').collect::<String>();let mut destination=parent.join(format!("{stem}.{safe_lang}.srt"));let mut n=2;while destination.exists(){destination=parent.join(format!("{stem}.{safe_lang}.{n}.srt"));n+=1;}fs::write(&destination,&bytes).map_err(|e|format!("Could not save subtitle next to the media file: {e}"))?;let file_name=destination.file_name().and_then(|v|v.to_str()).unwrap_or("subtitle.srt").to_string();let url=format!("/subtitle/{}/{}",urlencoding::encode(media_id),urlencoding::encode(&file_name));activity::info("Subtitles",format!("Saved {language} subtitle next to “{}” as {file_name}",item.title));Ok(DownloadedSubtitle{file_name,language:language.to_string(),label:format!("{} · OpenSubtitles",language.to_uppercase()),url})
}

#[tauri::command]pub fn subtitle_provider_status()->SubtitleProviderStatus{status()}
#[tauri::command]pub fn subtitle_provider_save(api_key:String,username:String,password:String)->Result<(),String>{save(&api_key,&username,&password)}
#[tauri::command]pub fn subtitle_provider_clear()->Result<(),String>{clear()}
#[tauri::command]pub async fn subtitle_provider_test()->Result<(),String>{test().await}
#[tauri::command]pub async fn subtitle_search(state:State<'_,Shared>,media_id:String,language:String)->Result<Vec<SubtitleSearchResult>,String>{search(&state,&media_id,&language).await}
#[tauri::command]pub async fn subtitle_download(state:State<'_,Shared>,media_id:String,file_id:i64,language:String)->Result<DownloadedSubtitle,String>{download(&state,&media_id,file_id,&language).await}
