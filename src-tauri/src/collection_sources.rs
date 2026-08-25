use crate::{app_state::CollectionUnlock, Shared};
use argon2::{password_hash::{PasswordHash,PasswordHasher,PasswordVerifier,SaltString},Argon2};
use chrono::Utc;
use argon2::password_hash::rand_core::OsRng;
use serde::{Deserialize,Serialize};
use std::{fs,path::{Path,PathBuf}};
use tauri::State;
use uuid::Uuid;

const FILE:&str="collection-sources.json";
pub const IDLE_SECONDS:i64=30*60;

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CollectionSource{pub id:String,pub name:String,pub path:String,pub protected:bool,#[serde(default,skip_serializing_if="Option::is_none")]pub pin_hash:Option<String>}

#[derive(Deserialize)]#[serde(rename_all="camelCase")]
pub struct CollectionSourceInput{pub id:Option<String>,pub name:String,pub path:String,pub protected:bool,pub pin:Option<String>}

fn file(root:&Path)->PathBuf{root.join(FILE)}
pub fn list(root:&Path)->Result<Vec<CollectionSource>,String>{let path=file(root);if !path.is_file(){return Ok(vec![])}serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
fn persist(root:&Path,values:&[CollectionSource])->Result<(),String>{fs::create_dir_all(root).map_err(|e|e.to_string())?;fs::write(file(root),serde_json::to_vec_pretty(values).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
fn hash(pin:&str)->Result<String,String>{if pin.len()<4||pin.len()>12||!pin.chars().all(|c|c.is_ascii_digit()){return Err("PIN must contain 4 to 12 numbers".into())}Argon2::default().hash_password(pin.as_bytes(),&SaltString::generate(&mut OsRng)).map(|v|v.to_string()).map_err(|e|e.to_string())}
pub fn save(root:&Path,input:CollectionSourceInput)->Result<Vec<CollectionSource>,String>{let name=input.name.trim();if name.is_empty(){return Err("Source name cannot be empty".into())}if !Path::new(&input.path).is_dir(){return Err("Selected source folder does not exist".into())}let mut values=list(root)?;let id=input.id.unwrap_or_else(||Uuid::new_v4().to_string());let previous=values.iter().find(|v|v.id==id).cloned();let pin_hash=if input.protected{match input.pin.as_deref().filter(|v|!v.is_empty()){Some(pin)=>Some(hash(pin)?),None=>Some(previous.as_ref().and_then(|v|v.pin_hash.clone()).ok_or("Enter a PIN for this protected source")?)}}else{None};let next=CollectionSource{id:id.clone(),name:name.into(),path:input.path,protected:input.protected,pin_hash};if let Some(index)=values.iter().position(|v|v.id==id){values[index]=next}else{values.push(next)}persist(root,&values)?;Ok(values)}
pub fn delete(root:&Path,id:&str)->Result<Vec<CollectionSource>,String>{let mut values=list(root)?;values.retain(|v|v.id!=id);persist(root,&values)?;Ok(values)}
pub fn public_list(root:&Path)->Result<Vec<CollectionSource>,String>{let mut values=list(root)?;for value in &mut values{value.pin_hash=None}Ok(values)}

#[tauri::command]pub fn collection_sources_list(state:State<'_,Shared>)->Result<Vec<CollectionSource>,String>{public_list(&state.provider_path)}
#[tauri::command]pub fn collection_source_unlock(source_id:String,user_id:String,pin:String,state:State<'_,Shared>)->Result<String,String>{let source=list(&state.provider_path)?.into_iter().find(|v|v.id==source_id).ok_or("Collection source not found")?;if source.protected{let stored=source.pin_hash.ok_or("This source has no PIN configured")?;let parsed=PasswordHash::new(&stored).map_err(|_|"Stored PIN is invalid")?;Argon2::default().verify_password(pin.as_bytes(),&parsed).map_err(|_|"Incorrect PIN")?;}let token=Uuid::new_v4().to_string();state.collection_unlocks.write().map_err(|_|"Unlock session lock poisoned")?.insert(token.clone(),CollectionUnlock{source_id,user_id,last_active:Utc::now().timestamp()});Ok(token)}
#[tauri::command]pub fn collection_source_touch(token:String,state:State<'_,Shared>)->Result<(),String>{let mut values=state.collection_unlocks.write().map_err(|_|"Unlock session lock poisoned")?;let now=Utc::now().timestamp();let last_active=values.get(&token).ok_or("Source is locked")?.last_active;if now-last_active>IDLE_SECONDS{values.remove(&token);return Err("Source relocked after 30 minutes of inactivity".into())}values.get_mut(&token).ok_or("Source is locked")?.last_active=now;Ok(())}
#[tauri::command]pub fn collection_source_lock(token:String,state:State<'_,Shared>)->Result<(),String>{state.collection_unlocks.write().map_err(|_|"Unlock session lock poisoned")?.remove(&token);Ok(())}
pub fn authorized(state:&crate::AppState,source_id:&str,token:Option<&str>)->bool{let Some(token)=token else{return false};let Ok(mut values)=state.collection_unlocks.write()else{return false};let now=Utc::now().timestamp();values.retain(|_,v|now-v.last_active<=IDLE_SECONDS);values.get_mut(token).filter(|v|v.source_id==source_id).map(|v|{v.last_active=now;true}).unwrap_or(false)}
