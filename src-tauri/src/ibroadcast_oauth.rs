use crate::{activity, ibroadcast, Shared};
use chrono::Utc;
use keyring::Entry;
use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};

const OAUTH_TOKEN: &str = "https://oauth.ibroadcast.com/token";
const API_STATUS: &str = "https://api.ibroadcast.com/status";

fn client_id(state: &crate::app_state::AppState) -> Result<String, String> {
    state.settings.read().map_err(|_| "Settings lock poisoned".to_string())?
        .ibroadcast_client_id.clone().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Set the iBroadcast Client ID in Settings → Music before connecting.".to_string())
}

fn error_message(status: reqwest::StatusCode, value: &Value) -> String {
    let detail = value.get("error_description").and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .or_else(|| value.get("error").and_then(Value::as_str))
        .unwrap_or("unknown OAuth error");
    format!("{status}: {detail}")
}

async fn token_attempt(client_id: &str, device_code: &str, grant_type: &str) -> Result<Value, String> {
    let response = reqwest::Client::new().post(OAUTH_TOKEN)
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&[("grant_type", grant_type), ("device_code", device_code), ("client_id", client_id)])
        .send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let raw = response.text().await.map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({"error_description": raw}));
    if status.is_success() { return Ok(value); }
    let code = value.get("error").and_then(Value::as_str).unwrap_or_default();
    if code == "authorization_pending" || code == "slow_down" { return Ok(value); }
    Err(error_message(status, &value))
}

async fn provider_user(access_token: &str) -> Option<String> {
    let body = json!({"client":"onyx","version":"0.1.0","device_name":"Onyx Media Server","user_agent":"Onyx/0.1.0","mode":"status"});
    let response = reqwest::Client::new().post(API_STATUS)
        .header("User-Agent", "Onyx/0.1.0")
        .bearer_auth(access_token).json(&body).send().await.ok()?;
    let value: Value = response.json().await.ok()?;
    let user = value.get("user").or_else(|| value.get("status").and_then(|status| status.get("user")))?;
    user.get("email").or_else(|| user.get("username")).or_else(|| user.get("name")).and_then(Value::as_str).map(str::to_string)
}

fn store_token(user_id: &str, value: &Value, provider_user: Option<String>) -> Result<(), String> {
    let access_token = value.get("access_token").and_then(Value::as_str).ok_or("Missing access_token in iBroadcast OAuth response")?;
    let refresh_token = value.get("refresh_token").and_then(Value::as_str);
    let expires_at = value.get("expires_in").and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|text| text.parse::<i64>().ok()))).map(|seconds| Utc::now().timestamp() + seconds);
    let raw = json!({"access_token":access_token,"refresh_token":refresh_token,"expires_at":expires_at,"provider_user":provider_user}).to_string();
    Entry::new("Onyx iBroadcast", &format!("profile:{user_id}"))
        .map_err(|error| format!("Could not open secure credential store: {error}"))?
        .set_password(&raw).map_err(|error| format!("Could not save iBroadcast credentials: {error}"))
}

pub async fn device_poll(state: Shared, user_id: String, device_code: String) -> Result<ibroadcast::DevicePollResponse, String> {
    let id = client_id(&state)?;

    // iBroadcast's current documentation specifies grant_type=device_code.
    // Some developer apps/production OAuth nodes have returned
    // "Unauthorized client: grant_type is invalid" for that value. Cherry Rise's
    // earlier working implementation used the RFC 8628 URN, so we retain that
    // only as a compatibility fallback.
    let first = token_attempt(&id, &device_code, "device_code").await;
    let value = match first {
        Ok(value) => value,
        Err(first_error) if first_error.to_ascii_lowercase().contains("grant_type") || first_error.to_ascii_lowercase().contains("unauthorized client") => {
            activity::warning("iBroadcast", format!("Documented device_code grant was rejected; trying RFC device grant compatibility mode ({first_error})"));
            token_attempt(&id, &device_code, "urn:ietf:params:oauth:grant-type:device_code").await
                .map_err(|second| format!("iBroadcast rejected both device OAuth grant forms. Documented form: {first_error}. Compatibility form: {second}. Check that the developer app is active/approved and that the Client ID is correct."))?
        }
        Err(error) => return Err(error),
    };

    if let Some(code) = value.get("error").and_then(Value::as_str) {
        if code == "authorization_pending" || code == "slow_down" {
            return Ok(ibroadcast::DevicePollResponse { pending: true, connected: false, message: Some(code.replace('_', " ")) });
        }
        return Err(value.get("error_description").and_then(Value::as_str).unwrap_or(code).to_string());
    }

    let access_token = value.get("access_token").and_then(Value::as_str).ok_or("Missing access_token in iBroadcast OAuth response")?;
    let user = provider_user(access_token).await;
    store_token(&user_id, &value, user.clone())?;
    activity::info("iBroadcast", format!("Connected iBroadcast OAuth for Onyx profile {user_id}"));
    Ok(ibroadcast::DevicePollResponse { pending: false, connected: true, message: user })
}
