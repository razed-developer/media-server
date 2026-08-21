use crate::{database, household_feed, models::MetadataSearchResult, user_features, Shared};
use axum::{extract::State, http::HeaderMap, routing::{get, post}, Json, Router};
use serde::Deserialize;

const USER_HEADER:&str="x-home-media-user";
fn request_user(state:&crate::AppState,headers:&HeaderMap)->String{let requested=headers.get(USER_HEADER).and_then(|v|v.to_str().ok()).unwrap_or(database::DEFAULT_USER_ID);if database::user_exists(&state.database_path,requested){requested.to_string()}else{database::DEFAULT_USER_ID.to_string()}}

#[derive(Deserialize)]struct SearchPayload{kind:String,query:String}
#[derive(Deserialize)]struct AddPayload{item:MetadataSearchResult}

async fn feed(State(state):State<Shared>)->Result<Json<Vec<household_feed::HouseholdFeedEntry>>,(axum::http::StatusCode,String)>{household_feed::list(&state.database_path,28).map(Json).map_err(|e|(axum::http::StatusCode::INTERNAL_SERVER_ERROR,e))}
async fn search(Json(payload):Json<SearchPayload>)->Result<Json<Vec<MetadataSearchResult>>,(axum::http::StatusCode,String)>{user_features::wishlist_search(&payload.kind,&payload.query).await.map(Json).map_err(|e|(axum::http::StatusCode::BAD_REQUEST,e))}
async fn add(State(state):State<Shared>,headers:HeaderMap,Json(payload):Json<AddPayload>)->Result<axum::http::StatusCode,(axum::http::StatusCode,String)>{let user=request_user(&state,&headers);user_features::wishlist_add(&state.database_path,&user,&payload.item).map(|_|axum::http::StatusCode::NO_CONTENT).map_err(|e|(axum::http::StatusCode::BAD_REQUEST,e))}

pub fn router()->Router<Shared>{Router::new().route("/api/user-features/feed",get(feed)).route("/api/user-features/wishlist/search",post(search)).route("/api/user-features/wishlist/add",post(add))}
