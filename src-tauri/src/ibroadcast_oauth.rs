use crate::{activity, database, Shared};
use chrono::Utc;
use keyring::Entry;
use reqwest::header::CONTENT_TYPE;
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::State as TauriState;
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};
use uuid::Uuid;

const OAUTH_BASE: &str = "https://oauth.ibroadcast.com";
pub const REDIRECT_URI: &str = "http://127.0.0.1:8770/oauth/ibroadcast/callback";
const SCOPES: &str = "user.account:read user.library:read offline_access";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationStart {
    pub authorization_url: String,
    pub redirect_uri: String,
}

fn client_id(state: &crate::app_state::AppState) -> Result<String, String> {
    state.settings.read().map_err(|_| "Settings lock poisoned".to_string())?
        .ibroadcast_client_id.clone().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Set the iBroadcast Client ID in Settings → Music before connecting.".to_string())
}

fn base64url(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | bytes[i + 2] as u32;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(TABLE[((n >> 6) & 63) as usize] as char);
        out.push(TABLE[(n & 63) as usize] as char);
        i += 3;
    }
    match bytes.len() - i {
        1 => {
            let n = (bytes[i] as u32) << 16;
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
        }
        2 => {
            let n = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
            out.push(TABLE[((n >> 18) & 63) as usize] as char);
            out.push(TABLE[((n >> 12) & 63) as usize] as char);
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        }
        _ => {}
    }
    out
}

fn verifier() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn state_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn challenge(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

fn error_detail(status: reqwest::StatusCode, value: &Value) -> String {
    value.get("error_description").and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .or_else(|| value.get("error").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| format!("HTTP {status}"))
}

async fn exchange_code(client_id: &str, code: &str, code_verifier: &str) -> Result<Value, String> {
    let response = reqwest::Client::new().post(format!("{OAUTH_BASE}/token"))
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", client_id),
            ("redirect_uri", REDIRECT_URI),
            ("code_verifier", code_verifier),
        ])
        .send().await.map_err(|error| format!("Could not exchange iBroadcast authorization code: {error}"))?;
    let status = response.status();
    let raw = response.text().await.map_err(|error| error.to_string())?;
    let value: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({"error_description": raw}));
    if !status.is_success() { return Err(format!("iBroadcast authorization failed: {}", error_detail(status, &value))); }
    Ok(value)
}

async fn provider_user(access_token: &str) -> Option<String> {
    let body = json!({
        "client":"onyx",
        "version":"0.1.0",
        "device_name":"Onyx Media Server",
        "user_agent":"Onyx/0.1.0",
        "mode":"status"
    });
    let response = reqwest::Client::new().post("https://api.ibroadcast.com/status")
        .header("User-Agent", "Onyx/0.1.0")
        .bearer_auth(access_token).json(&body).send().await.ok()?;
    let value: Value = response.json().await.ok()?;
    let user = value.get("user").or_else(|| value.get("status").and_then(|status| status.get("user")))?;
    user.get("email").or_else(|| user.get("username")).or_else(|| user.get("name")).and_then(Value::as_str).map(str::to_string)
}

async fn store_token(user_id: &str, value: &Value) -> Result<(), String> {
    let access_token = value.get("access_token").and_then(Value::as_str).ok_or("Missing access_token in iBroadcast OAuth response")?;
    let refresh_token = value.get("refresh_token").and_then(Value::as_str);
    let expires_at = value.get("expires_in")
        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|text| text.parse::<i64>().ok())))
        .map(|seconds| Utc::now().timestamp() + seconds);
    let provider_user = provider_user(access_token).await;
    let raw = json!({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "provider_user": provider_user
    }).to_string();
    Entry::new("Onyx iBroadcast", &format!("profile:{user_id}"))
        .map_err(|error| format!("Could not open secure credential store: {error}"))?
        .set_password(&raw)
        .map_err(|error| format!("Could not save iBroadcast credentials: {error}"))
}

async fn respond(mut stream: tokio::net::TcpStream, success: bool, message: &str) {
    let title = if success { "iBroadcast connected" } else { "iBroadcast connection failed" };
    let body = format!(r#"<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>body{{font-family:system-ui;background:#080b0e;color:#eef2f4;display:grid;place-items:center;min-height:100vh;margin:0}}main{{max-width:560px;padding:40px;border:1px solid #273038;background:#101419}}h1{{margin-top:0}}p{{color:#aab4bd;line-height:1.55}}</style></head><body><main><h1>{title}</h1><p>{message}</p><p>You can close this tab and return to Onyx.</p></main></body></html>"#);
    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

async fn handle_callback(listener: TcpListener, shared: Shared, user_id: String, expected_state: String, code_verifier: String, client_id: String) {
    let result: Result<(), String> = async {
        let (mut stream, _) = tokio::time::timeout(std::time::Duration::from_secs(300), listener.accept())
            .await.map_err(|_| "iBroadcast authorization timed out".to_string())?
            .map_err(|error| format!("Could not receive iBroadcast callback: {error}"))?;
        let mut buffer = vec![0u8; 16384];
        let count = stream.read(&mut buffer).await.map_err(|error| error.to_string())?;
        let request = String::from_utf8_lossy(&buffer[..count]);
        let target = request.lines().next().and_then(|line| line.split_whitespace().nth(1)).ok_or("Invalid OAuth callback request")?;
        let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|error| error.to_string())?;
        let params: std::collections::HashMap<String, String> = url.query_pairs().map(|(k,v)|(k.into_owned(),v.into_owned())).collect();
        if let Some(error) = params.get("error") {
            let detail = params.get("error_description").cloned().unwrap_or_else(|| error.clone());
            respond(stream, false, &detail).await;
            return Err(detail);
        }
        let state = params.get("state").ok_or("iBroadcast callback did not include state")?;
        if state != &expected_state {
            respond(stream, false, "The OAuth state did not match. Please try connecting again.").await;
            return Err("iBroadcast OAuth state mismatch".into());
        }
        let code = params.get("code").ok_or("iBroadcast callback did not include an authorization code")?;
        let token = exchange_code(&client_id, code, &code_verifier).await?;
        store_token(&user_id, &token).await?;
        respond(stream, true, "Authorization completed successfully.").await;
        activity::info("iBroadcast", format!("Authorization Code + PKCE completed for Onyx profile {user_id}"));
        Ok(())
    }.await;
    if let Err(error) = result {
        activity::error("iBroadcast", error);
    }
    drop(shared);
}

#[tauri::command]
pub async fn ibroadcast_authorization_start(user_id: String, state: TauriState<'_, Shared>) -> Result<AuthorizationStart, String> {
    if !database::user_exists(&state.database_path, &user_id) { return Err("Unknown Onyx user".into()); }
    let client_id = client_id(&state)?;
    let listener = TcpListener::bind("127.0.0.1:8770").await.map_err(|error| format!("Could not open the local iBroadcast callback listener on port 8770: {error}"))?;
    let code_verifier = verifier();
    let code_challenge = challenge(&code_verifier);
    let oauth_state = state_token();
    let authorization_url = reqwest::Url::parse_with_params(
        &format!("{OAUTH_BASE}/authorize"),
        &[
            ("client_id", client_id.as_str()),
            ("state", oauth_state.as_str()),
            ("response_type", "code"),
            ("redirect_uri", REDIRECT_URI),
            ("code_challenge", code_challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("scope", SCOPES),
        ],
    ).map_err(|error| error.to_string())?.to_string();

    let shared = state.inner().clone();
    tauri::async_runtime::spawn(handle_callback(listener, shared, user_id, oauth_state, code_verifier, client_id));
    activity::info("iBroadcast", format!("Authorization Code + PKCE flow started; callback {REDIRECT_URI}"));
    Ok(AuthorizationStart { authorization_url, redirect_uri: REDIRECT_URI.to_string() })
}
