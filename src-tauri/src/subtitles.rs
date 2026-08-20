use crate::{activity, database, metadata, models::{MediaItem, SubtitleTrack}, Shared};
use keyring::Entry;
use reqwest::{header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT}, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashSet, fs, path::{Path, PathBuf}};
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
    pub direct_match:bool,
    pub match_rank:u8,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct DownloadedSubtitle {
    pub file_name:String,
    pub language:String,
    pub label:String,
    pub url:Option<String>,
    pub local_path:Option<String>,
}

fn entry()->Result<Entry,String>{Entry::new(KEYRING_SERVICE,KEYRING_USER).map_err(|e|format!("Could not open subtitle credential store: {e}"))}
fn load()->Result<Credentials,String>{let raw=entry()?.get_password().map_err(|_|"OpenSubtitles is not configured. Add your API key and account in Settings → Subtitles.".to_string())?;serde_json::from_str(&raw).map_err(|e|e.to_string())}
fn client()->Client{Client::builder().user_agent(APP_USER_AGENT).build().unwrap_or_else(|_|Client::new())}

pub fn status()->SubtitleProviderStatus{match load(){Ok(c)=>SubtitleProviderStatus{configured:true,provider:"OpenSubtitles".into(),account:c.username},Err(_)=>SubtitleProviderStatus{configured:false,provider:"OpenSubtitles".into(),account:String::new()}}}
pub fn save(api_key:&str,username:&str,password:&str)->Result<(),String>{let c=Credentials{api_key:api_key.trim().to_string(),username:username.trim().to_string(),password:password.to_string()};if c.api_key.is_empty()||c.username.is_empty()||c.password.is_empty(){return Err("API key, username, and password are required".into())}let raw=serde_json::to_string(&c).map_err(|e|e.to_string())?;let e=entry()?;e.set_password(&raw).map_err(|e|format!("Could not save OpenSubtitles credentials: {e}"))?;let verified=e.get_password().map_err(|e|format!("OpenSubtitles credentials were written but could not be read back: {e}"))?;if verified!=raw{return Err("OpenSubtitles credential verification failed after saving.".into())}activity::info("Subtitles","OpenSubtitles credentials saved and verified securely");Ok(())}
pub fn clear()->Result<(),String>{let _=entry()?.delete_credential();activity::info("Subtitles","OpenSubtitles credentials removed");Ok(())}

async fn login(c:&Credentials)->Result<(String,String),String>{
 activity::info("Subtitles",format!("Signing in to OpenSubtitles as {}",c.username));
 let response=client().post(format!("{API_ROOT}/login")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(CONTENT_TYPE,"application/json").json(&json!({"username":c.username,"password":c.password})).send().await.map_err(|e|{activity::error("Subtitles",format!("OpenSubtitles login request failed: {e}"));e.to_string()})?;
 let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;if !code.is_success(){let message=value.get("message").and_then(Value::as_str).unwrap_or("check your API key and account");activity::error("Subtitles",format!("OpenSubtitles login failed ({code}): {message}"));return Err(format!("OpenSubtitles login failed ({code}): {message}"))}
 let token=value.get("token").and_then(Value::as_str).ok_or("OpenSubtitles did not return a login token")?.to_string();let host=value.get("base_url").and_then(Value::as_str).unwrap_or("api.opensubtitles.com");let base=if host.starts_with("http") {format!("{}/api/v1",host.trim_end_matches('/'))}else{format!("https://{host}/api/v1")};Ok((token,base))
}

pub async fn test()->Result<(),String>{let c=load()?;let _=login(&c).await?;activity::info("Subtitles","OpenSubtitles connection test succeeded");Ok(())}

fn find_media(state:&crate::app_state::AppState,id:&str)->Result<MediaItem,String>{state.media.read().map_err(|_|"Media lock poisoned".to_string())?.iter().find(|m|m.id==id).cloned().ok_or_else(||"Media item not found".into())}
fn filename_hint(item:&MediaItem)->String{Path::new(&item.path).file_stem().and_then(|v|v.to_str()).unwrap_or(&item.title).to_string()}
fn compact(value:&str)->String{value.chars().filter(|c|c.is_ascii_alphanumeric()).flat_map(char::to_lowercase).collect()}
fn looks_like_file_match(hint:&str,file_name:&str,release:&str)->bool{let h=compact(hint);if h.len()<6{return false}let f=compact(file_name);let r=compact(release);f.contains(&h)||r.contains(&h)||h.contains(&f)}
fn contains_full_title(title:&str,file_name:&str,release:&str,parent_title:&str)->bool{let wanted=compact(title);if wanted.len()<4{return true}compact(file_name).contains(&wanted)||compact(release).contains(&wanted)||compact(parent_title).contains(&wanted)}

fn tmdb_search_id(state:&crate::app_state::AppState,item:&MediaItem)->Option<String>{
 if item.kind!="episode" { return item.provider_id.clone(); }
 let series=metadata::series_for_media(&state.database_path,&item.id).ok().flatten()?;
 metadata::provider_match(&state.database_path,&series.id,"tmdb").ok().flatten().map(|m|m.provider_id)
}

fn parse_results(value:&Value,language:&str,file_hint:&str,show_title:Option<&str>,match_rank:u8,strict_show:bool)->Vec<SubtitleSearchResult>{
 let mut out=vec![];
 for row in value.get("data").and_then(Value::as_array).into_iter().flatten().take(50){
  let a=row.get("attributes").unwrap_or(row);
  let feature=a.get("feature_details");
  let release=a.get("release").and_then(Value::as_str).or_else(||feature.and_then(|v|v.get("title")).and_then(Value::as_str)).unwrap_or("").to_string();
  let parent_title=feature.and_then(|v|v.get("parent_title")).and_then(Value::as_str).or_else(||feature.and_then(|v|v.get("parentTitle")).and_then(Value::as_str)).unwrap_or("");
  let hash_match=a.get("moviehash_match").and_then(Value::as_bool).unwrap_or(false);
  let Some(files)=a.get("files").and_then(Value::as_array) else{continue};
  for file in files.iter().take(2){
   let Some(file_id)=file.get("file_id").and_then(Value::as_i64) else{continue};
   let file_name=file.get("file_name").and_then(Value::as_str).unwrap_or("subtitle.srt").to_string();
   if strict_show&&show_title.is_some_and(|show|!contains_full_title(show,&file_name,&release,parent_title)){continue}
   out.push(SubtitleSearchResult{file_id,file_name:file_name.clone(),language:a.get("language").and_then(Value::as_str).unwrap_or(language).to_string(),release:release.clone(),hearing_impaired:a.get("hearing_impaired").and_then(Value::as_bool).unwrap_or(false),download_count:a.get("download_count").and_then(Value::as_u64).unwrap_or(0),direct_match:hash_match||looks_like_file_match(file_hint,&file_name,&release),match_rank});
  }
 }
 out
}

async fn search_request(c:&Credentials,token:&str,base:&str,params:&[(&str,String)],language:&str,file_hint:&str,show_title:Option<&str>,match_rank:u8,strict_show:bool)->Result<Vec<SubtitleSearchResult>,String>{
 let response=client().get(format!("{base}/subtitles")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(AUTHORIZATION,format!("Bearer {token}")).query(params).send().await.map_err(|e|e.to_string())?;
 let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;
 if !code.is_success(){let message=value.get("message").and_then(Value::as_str).unwrap_or("search unavailable");return Err(format!("OpenSubtitles search failed ({code}): {message}"))}
 Ok(parse_results(&value,language,file_hint,show_title,match_rank,strict_show))
}

pub async fn search(state:&crate::app_state::AppState,media_id:&str,language:&str)->Result<Vec<SubtitleSearchResult>,String>{
 let c=load()?;let item=find_media(state,media_id)?;let (token,base)=login(&c).await?;let file_hint=filename_hint(&item);let show_title=item.show_title.as_deref();
 let mut searches:Vec<(Vec<(&str,String)>,u8,bool)>=vec![];
 let common=||vec![("languages",language.to_string()),("order_by","download_count".into()),("order_direction","desc".into())];
 if let Some(tmdb)=tmdb_search_id(state,&item){
  let mut p=common();
  if item.kind=="episode"{p.push(("parent_tmdb_id",tmdb));if let Some(s)=item.season{p.push(("season_number",s.to_string()));}if let Some(e)=item.episode{p.push(("episode_number",e.to_string()));}}
  else{p.push(("tmdb_id",tmdb));}
  searches.push((p,3,false));
 }
 let mut exact_name=common();exact_name.push(("query",file_hint.clone()));searches.push((exact_name,2,item.kind=="episode"));
 let mut title_search=common();title_search.push(("query",if item.kind=="episode"{format!("{} S{:02}E{:02}",item.show_title.clone().unwrap_or_default(),item.season.unwrap_or(0),item.episode.unwrap_or(0))}else{match item.year{Some(y)=>format!("{} {y}",item.title),None=>item.title.clone()}}));searches.push((title_search,1,item.kind=="episode"));
 let search_label=if item.kind=="episode"{item.show_title.as_deref().unwrap_or(&item.title)}else{&item.title};
 activity::info("Subtitles",format!("Searching OpenSubtitles for “{search_label}” with exact identity before fallback matches ({language})"));
 let mut out=vec![];let mut seen=HashSet::new();let mut last_error=None;
 for (params,rank,strict_show) in searches{
  match search_request(&c,&token,&base,&params,language,&file_hint,show_title,rank,strict_show).await{
   Ok(rows)=>for row in rows{if seen.insert(row.file_id){out.push(row);}},
   Err(e)=>last_error=Some(e),
  }
  if out.len()>=40{break;}
 }
 if out.is_empty(){if let Some(error)=last_error{activity::error("Subtitles",&error);return Err(error)}}
 out.sort_by(|a,b|b.direct_match.cmp(&a.direct_match).then_with(||b.match_rank.cmp(&a.match_rank)).then_with(||b.download_count.cmp(&a.download_count)));
 out.truncate(30);activity::info("Subtitles",format!("OpenSubtitles returned {} candidates, ranked by exact episode/show identity before popularity",out.len()));Ok(out)
}

fn destination_for(video:&Path,language:&str,index:u32)->Result<PathBuf,String>{let parent=video.parent().ok_or("Media file has no parent folder")?;let stem=video.file_stem().and_then(|v|v.to_str()).ok_or("Media filename is invalid")?;let safe_lang=language.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-').collect::<String>();let suffix=if index<=1{String::new()}else{format!(".{index}")};Ok(parent.join(format!("{stem}.{safe_lang}{suffix}.srt")))}

fn remember_download(state:&crate::app_state::AppState,media_id:&str,track:SubtitleTrack){
 let snapshot=match state.media.write(){
  Ok(mut media)=>{if let Some(item)=media.iter_mut().find(|m|m.id==media_id){if !item.subtitles.iter().any(|existing|existing.url==track.url){item.subtitles.push(track);}}media.clone()},
  Err(_)=>{activity::warn("Subtitles","Downloaded subtitle was saved, but the in-memory library could not be updated");return;}
 };
 if let Err(error)=database::replace_library(&state.database_path,&snapshot){activity::warn("Subtitles",format!("Downloaded subtitle was saved, but its library record could not be persisted: {error}"));}
}

pub async fn download(state:&crate::app_state::AppState,media_id:&str,file_id:i64,language:&str)->Result<DownloadedSubtitle,String>{
 let c=load()?;let item=find_media(state,media_id)?;let (token,base)=login(&c).await?;activity::info("Subtitles",format!("Requesting OpenSubtitles download for “{}”",item.title));
 let response=client().post(format!("{base}/download")).header("Api-Key",&c.api_key).header(USER_AGENT,APP_USER_AGENT).header(AUTHORIZATION,format!("Bearer {token}")).json(&json!({"file_id":file_id,"sub_format":"srt"})).send().await.map_err(|e|e.to_string())?;let code=response.status();let value:Value=response.json().await.map_err(|e|e.to_string())?;if !code.is_success(){let message=value.get("message").and_then(Value::as_str).unwrap_or("download unavailable");activity::error("Subtitles",format!("OpenSubtitles download request failed ({code}): {message}"));return Err(format!("OpenSubtitles download failed ({code}): {message}"))}let link=value.get("link").and_then(Value::as_str).ok_or("OpenSubtitles did not return a download link")?;
 let bytes=client().get(link).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.bytes().await.map_err(|e|e.to_string())?;
 let video=Path::new(&item.path);let mut index=1;let mut destination=destination_for(video,language,index)?;while destination.exists(){index+=1;destination=destination_for(video,language,index)?;}
 if fs::write(&destination,&bytes).is_ok(){
  let file_name=destination.file_name().and_then(|v|v.to_str()).unwrap_or("subtitle.srt").to_string();let url=format!("/subtitle/{}/{}",urlencoding::encode(media_id),urlencoding::encode(&file_name));let label=format!("{} · OpenSubtitles",language.to_uppercase());
  remember_download(state,media_id,SubtitleTrack{label:label.clone(),language:language.to_string(),url:Some(url.clone()),stream_index:None,embedded:false,format:Some("srt".into()),forced:false,default:false});
  activity::info("Subtitles",format!("Saved {language} subtitle next to “{}” as {file_name}",item.title));return Ok(DownloadedSubtitle{file_name,language:language.to_string(),label,url:Some(url),local_path:None})
 }
 let fallback_dir=state.provider_path.join("downloaded-subtitles").join(media_id);fs::create_dir_all(&fallback_dir).map_err(|e|format!("Could not create Onyx subtitle storage: {e}"))?;let file_name=format!("{}.{}.srt",file_id,language.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-').collect::<String>());let fallback=fallback_dir.join(&file_name);fs::write(&fallback,&bytes).map_err(|e|format!("Could not save subtitle in the media folder or Onyx subtitle storage: {e}"))?;activity::warn("Subtitles",format!("Media folder was not writable; saved subtitle for “{}” in Onyx-managed storage",item.title));Ok(DownloadedSubtitle{file_name,language:language.to_string(),label:format!("{} · OpenSubtitles",language.to_uppercase()),url:None,local_path:Some(fallback.to_string_lossy().to_string())})
}

#[tauri::command]pub fn subtitle_provider_status()->SubtitleProviderStatus{status()}
#[tauri::command]pub fn subtitle_provider_save(api_key:String,username:String,password:String)->Result<(),String>{save(&api_key,&username,&password)}
#[tauri::command]pub fn subtitle_provider_clear()->Result<(),String>{clear()}
#[tauri::command]pub async fn subtitle_provider_test()->Result<(),String>{test().await}
#[tauri::command]pub async fn subtitle_search(state:State<'_,Shared>,media_id:String,language:String)->Result<Vec<SubtitleSearchResult>,String>{search(&state,&media_id,&language).await}
#[tauri::command]pub async fn subtitle_download(state:State<'_,Shared>,media_id:String,file_id:i64,language:String)->Result<DownloadedSubtitle,String>{download(&state,&media_id,file_id,&language).await}
