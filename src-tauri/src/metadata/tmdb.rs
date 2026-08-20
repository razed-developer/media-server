use super::{children, entity_for_media, provider_match, replace_entity_metadata, series_for_media, series_local_seasons, set_provider_match};
use crate::models::{MetadataEntity, MetadataProviderStatus, MetadataSearchResult, ProviderMatch};
use keyring::Entry;
use reqwest::Client;
use serde_json::Value;
use std::{collections::HashMap, path::Path};

const API:&str="https://api.themoviedb.org/3";
const KEYRING_SERVICE:&str="onyx-metadata";
const KEYRING_USER:&str="tmdb-read-token";

fn token_entry()->Result<Entry,String>{Entry::new(KEYRING_SERVICE,KEYRING_USER).map_err(|e|e.to_string())}
pub fn configured()->bool{token_entry().ok().and_then(|e|e.get_password().ok()).is_some()}
pub fn save_token(token:&str)->Result<(),String>{let token=token.trim();if token.is_empty(){return Err("TMDB read access token cannot be empty".into())}token_entry()?.set_password(token).map_err(|e|e.to_string())}
pub fn clear_token()->Result<(),String>{let entry=token_entry()?;let _=entry.delete_credential();Ok(())}
fn token()->Result<String,String>{token_entry()?.get_password().map_err(|_|"TMDB is not configured. Add an API Read Access Token in Settings → Metadata.".to_string())}
fn client()->Client{Client::builder().user_agent("Onyx/0.1 metadata-provider").build().unwrap_or_else(|_|Client::new())}
async fn get_json(url:&str,params:&[(&str,String)])->Result<Value,String>{let t=token()?;let response=client().get(url).bearer_auth(t).query(params).send().await.map_err(|e|e.to_string())?;if !response.status().is_success(){return Err(format!("TMDB request failed ({})",response.status()))}response.json::<Value>().await.map_err(|e|e.to_string())}

pub fn status()->MetadataProviderStatus{MetadataProviderStatus{provider:"tmdb".into(),configured:configured(),enabled:configured(),primary:true,attribution:"This product uses the TMDB API but is not endorsed or certified by TMDB.".into()}}
pub async fn test_connection()->Result<(),String>{get_json(&format!("{API}/configuration"),&[]).await.map(|_|())}

fn year_from(date:Option<&str>)->Option<u16>{date.and_then(|d|d.get(..4)).and_then(|y|y.parse().ok())}
fn image_url(path:Option<&str>,size:&str)->Option<String>{path.filter(|p|!p.is_empty()).map(|p|format!("https://image.tmdb.org/t/p/{size}{p}"))}

pub async fn search(kind:&str,query:&str,year:Option<u16>)->Result<Vec<MetadataSearchResult>,String>{
 let query=query.trim();if query.is_empty(){return Ok(vec![])}
 let endpoint=if kind=="series"||kind=="episode"{"tv"}else{"movie"};
 let mut params=vec![("query",query.to_string()),("include_adult","false".into()),("language","en-US".into()),("page","1".into())];
 if let Some(y)=year{params.push((if endpoint=="movie"{"primary_release_year"}else{"first_air_date_year"},y.to_string()));}
 let json=get_json(&format!("{API}/search/{endpoint}"),&params).await?;let mut out=vec![];
 for item in json.get("results").and_then(Value::as_array).into_iter().flatten().take(20){let title=item.get(if endpoint=="movie"{"title"}else{"name"}).and_then(Value::as_str).unwrap_or("Untitled").to_string();let date=item.get(if endpoint=="movie"{"release_date"}else{"first_air_date"}).and_then(Value::as_str);out.push(MetadataSearchResult{provider:"tmdb".into(),provider_id:item.get("id").and_then(Value::as_i64).unwrap_or_default().to_string(),entity_type:if endpoint=="movie"{"movie".into()}else{"series".into()},title,year:year_from(date),overview:item.get("overview").and_then(Value::as_str).map(str::to_string),poster_url:image_url(item.get("poster_path").and_then(Value::as_str),"w342"),backdrop_url:image_url(item.get("backdrop_path").and_then(Value::as_str),"w780"),rating:item.get("vote_average").and_then(Value::as_f64)});}
 Ok(out)
}

fn genres(v:&Value)->Vec<String>{v.get("genres").and_then(Value::as_array).into_iter().flatten().filter_map(|g|g.get("name").and_then(Value::as_str).map(str::to_string)).collect()}
fn detail_entity(base:&MetadataEntity,v:&Value,kind:&str)->MetadataEntity{let title=v.get(if kind=="movie"{"title"}else{"name"}).and_then(Value::as_str).unwrap_or(&base.title).to_string();let date=v.get(if kind=="movie"{"release_date"}else{"first_air_date"}).and_then(Value::as_str).map(str::to_string);MetadataEntity{id:base.id.clone(),entity_type:base.entity_type.clone(),parent_id:base.parent_id.clone(),title,original_title:v.get(if kind=="movie"{"original_title"}else{"original_name"}).and_then(Value::as_str).map(str::to_string),year:year_from(date.as_deref()).or(base.year),overview:v.get("overview").and_then(Value::as_str).filter(|s|!s.is_empty()).map(str::to_string),release_date:date,runtime_minutes:if kind=="movie"{v.get("runtime").and_then(Value::as_u64).map(|n|n as u32)}else{v.get("episode_run_time").and_then(Value::as_array).and_then(|a|a.first()).and_then(Value::as_u64).map(|n|n as u32)},season_number:base.season_number,episode_number:base.episode_number,genres:genres(v),rating:v.get("vote_average").and_then(Value::as_f64),poster_path:v.get("poster_path").and_then(Value::as_str).map(str::to_string),backdrop_path:v.get("backdrop_path").and_then(Value::as_str).map(str::to_string),still_path:base.still_path.clone(),metadata_json:v.clone()}}

pub async fn apply_match(db:&Path,media_id:&str,provider_id:&str,matched_by:&str,locked:bool)->Result<(),String>{
 let entity=entity_for_media(db,media_id)?.ok_or("No metadata entity exists for this media item")?;
 if entity.entity_type=="movie"{
  let detail=get_json(&format!("{API}/movie/{provider_id}"),&[("language","en-US".into()),("append_to_response","credits,images,keywords".into()),("include_image_language","en,null".into())]).await?;
  let updated=detail_entity(&entity,&detail,"movie");replace_entity_metadata(db,&updated)?;set_provider_match(db,&ProviderMatch{entity_id:entity.id,provider:"tmdb".into(),provider_id:provider_id.into(),matched_by:matched_by.into(),confidence:None,locked})?;return Ok(())
 }
 let series=series_for_media(db,media_id)?.ok_or("TV series entity not found")?;
 let detail=get_json(&format!("{API}/tv/{provider_id}"),&[("language","en-US".into()),("append_to_response","credits,images,keywords".into()),("include_image_language","en,null".into())]).await?;
 let updated=detail_entity(&series,&detail,"series");replace_entity_metadata(db,&updated)?;set_provider_match(db,&ProviderMatch{entity_id:series.id.clone(),provider:"tmdb".into(),provider_id:provider_id.into(),matched_by:matched_by.into(),confidence:None,locked})?;
 hydrate_series_children(db,&series.id,provider_id).await
}

pub async fn hydrate_series_children(db:&Path,series_id:&str,provider_id:&str)->Result<(),String>{
 let local=series_local_seasons(db,series_id)?;
 for (season_no,episodes) in local{let season_json=get_json(&format!("{API}/tv/{provider_id}/season/{season_no}"),&[("language","en-US".into())]).await?;if let Some(season)=children(db,series_id,"season")?.into_iter().find(|s|s.season_number==Some(season_no)){let mut updated=season.clone();updated.title=season_json.get("name").and_then(Value::as_str).unwrap_or(&season.title).to_string();updated.overview=season_json.get("overview").and_then(Value::as_str).filter(|s|!s.is_empty()).map(str::to_string);updated.release_date=season_json.get("air_date").and_then(Value::as_str).map(str::to_string);updated.poster_path=season_json.get("poster_path").and_then(Value::as_str).map(str::to_string);updated.metadata_json=season_json.clone();replace_entity_metadata(db,&updated)?;
   let provider_eps:HashMap<u16,&Value>=season_json.get("episodes").and_then(Value::as_array).into_iter().flatten().filter_map(|e|e.get("episode_number").and_then(Value::as_u64).map(|n|(n as u16,e))).collect();for ep in episodes{if let Some(source)=provider_eps.get(&ep.episode_number.unwrap_or(0)){let mut e=ep.clone();e.title=source.get("name").and_then(Value::as_str).unwrap_or(&ep.title).to_string();e.overview=source.get("overview").and_then(Value::as_str).filter(|s|!s.is_empty()).map(str::to_string);e.release_date=source.get("air_date").and_then(Value::as_str).map(str::to_string);e.runtime_minutes=source.get("runtime").and_then(Value::as_u64).map(|v|v as u32);e.rating=source.get("vote_average").and_then(Value::as_f64);e.still_path=source.get("still_path").and_then(Value::as_str).map(str::to_string);e.metadata_json=(*source).clone();replace_entity_metadata(db,&e)?;}}}}
 Ok(())
}

fn normalize(s:&str)->String{s.to_lowercase().chars().map(|c|if c.is_alphanumeric(){c}else{' '}).collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")}
fn confidence(query:&str,year:Option<u16>,result:&MetadataSearchResult)->f64{let a=normalize(query);let b=normalize(&result.title);let title=if a==b{0.88}else if a.contains(&b)||b.contains(&a){0.72}else{0.45};let y=match(year,result.year){(Some(a),Some(b))if a==b=>0.1,(Some(a),Some(b))if a.abs_diff(b)<=1=>0.04,(None,_)=>0.02,_=>0.0};(title+y).min(0.98)}

pub async fn auto_match(db:&Path,media_id:&str)->Result<bool,String>{
 let entity=entity_for_media(db,media_id)?.ok_or("Metadata entity missing")?;let target=if entity.entity_type=="movie"{entity.clone()}else{series_for_media(db,media_id)?.ok_or("Series entity missing")?};
 if provider_match(db,&target.id,"tmdb")?.is_some(){return Ok(false)}
 let results=search(&target.entity_type,&target.title,target.year).await?;let Some(best)=results.into_iter().map(|r|{let c=confidence(&target.title,target.year,&r);(r,c)}).max_by(|a,b|a.1.total_cmp(&b.1)) else{return Ok(false)};
 if best.1<0.9{return Ok(false)}
 apply_match(db,media_id,&best.0.provider_id,"automatic",false).await?;let updated=if target.entity_type=="movie"{entity_for_media(db,media_id)?.unwrap()}else{series_for_media(db,media_id)?.unwrap()};set_provider_match(db,&ProviderMatch{entity_id:updated.id,provider:"tmdb".into(),provider_id:best.0.provider_id,matched_by:"automatic".into(),confidence:Some(best.1),locked:false})?;Ok(true)
}
