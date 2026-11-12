//! The Veyra account behind the title bar's "Sign in" button. Veyra Studio has no AI features; this module only
//! signs in to veyraeditor.com, shows who is signed in, and signs out.
//!
//! The sign-in token is stored in a private file in Veyra's app data folder, not in the OS keychain: on macOS the
//! keychain asks for permission again after every update of an unsigned build, which users saw as repeated popups.
use serde::Serialize;
use serde_json::{json, Value};
use std::{path::{Path, PathBuf}, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, State};

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct AccountState {
    /// The signed-in token once read from disk: None = not loaded yet, Some(None) = signed out.
    token: Mutex<Option<Option<String>>>,
}

/// The website's account API; VEYRA_API_BASE points a development build at a local website instead.
const VEYRA_API: &str = "https://veyraeditor.com/api/ai/v1";
const ACCOUNT_FILE: &str = "veyra-account.json";

fn veyra_api() -> String { std::env::var("VEYRA_API_BASE").ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| VEYRA_API.into()) }
/// The website's origin, from the API address (.../api/ai/v1).
fn veyra_site() -> String { veyra_api().trim_end_matches('/').trim_end_matches("/api/ai/v1").to_string() }
fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).no_proxy()
        .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(30))
        .build().map_err(|_| "Could not connect to veyraeditor.com".into())
}
const OFFLINE: &str = "Cannot reach veyraeditor.com. Check your internet connection.";

/* ---------- Sign-in token file ---------- */
fn account_file(app: &AppHandle) -> Result<PathBuf> {
    app.path().app_data_dir().map(|dir| dir.join(ACCOUNT_FILE)).map_err(|_| "Veyra's app folder is unavailable".into())
}
fn read_token(file: &Path) -> Option<String> {
    let data: Value = serde_json::from_slice(&std::fs::read(file).ok()?).ok()?;
    data["token"].as_str().filter(|t| t.starts_with("vey_") && t.len() < 200).map(str::to_owned)
}
/// Saves (or, with None, deletes) the token. Written to a temporary file first; readable only by this user.
fn write_token(file: &Path, token: Option<&str>) -> Result<()> {
    let Some(token) = token else {
        return match std::fs::remove_file(file) { Ok(()) => Ok(()), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(e) => Err(format!("Could not sign out: {e}")) };
    };
    let dir = file.parent().ok_or("Veyra's app folder is unavailable")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Could not save your sign-in: {e}"))?;
    let temp = file.with_extension("tmp");
    let body = serde_json::to_vec(&json!({ "token": token })).map_err(|e| e.to_string())?;
    {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        use std::io::Write;
        let mut handle = options.open(&temp).map_err(|e| format!("Could not save your sign-in: {e}"))?;
        handle.write_all(&body).and_then(|_| handle.sync_all()).map_err(|e| format!("Could not save your sign-in: {e}"))?;
    }
    std::fs::rename(&temp, file).map_err(|e| format!("Could not save your sign-in: {e}"))
}
fn token(app: &AppHandle, state: &AccountState) -> Result<Option<String>> {
    let mut cached = state.token.lock().map_err(|_| "Account unavailable")?;
    if cached.is_none() { *cached = Some(read_token(&account_file(app)?)); }
    Ok(cached.clone().flatten())
}
fn set_token(app: &AppHandle, state: &AccountState, token: Option<String>) -> Result<()> {
    write_token(&account_file(app)?, token.as_deref())?;
    *state.token.lock().map_err(|_| "Account unavailable")? = Some(token);
    Ok(())
}

/// The website explains its own errors: show them as they are.
async fn response_json(response: reqwest::Response) -> Result<Value> {
    let status = response.status();
    let data: Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        return Err(data["error"]["message"].as_str().or(data["error"].as_str()).filter(|m| !m.is_empty() && m.len() < 300).map(str::to_owned)
            .unwrap_or_else(|| format!("veyraeditor.com returned HTTP {}. Please try again.", status.as_u16())));
    }
    Ok(data)
}

/* ---------- Veyra account ---------- */
#[derive(Serialize)]
pub struct VeyraAccount { name: String, email: String }

/// Sign in with a Veyra account; the app keeps only a device token, never the password.
#[tauri::command]
pub async fn veyra_sign_in(app: AppHandle, state: State<'_, AccountState>, email: String, password: String) -> Result<VeyraAccount> {
    if email.len() > 254 || password.len() > 256 { return Err("Check your email address and password.".into()); }
    let device = format!("Veyra Studio on {}", std::env::consts::OS);
    let response = client()?.post(format!("{}/api/auth/token", veyra_site()))
        .json(&json!({"email": email.trim(), "password": password, "device": device})).send().await.map_err(|_| OFFLINE.to_string())?;
    let status = response.status();
    let data: Value = response.json().await.unwrap_or_default();
    if !status.is_success() { return Err(data["error"].as_str().unwrap_or("Sign-in failed. Please try again.").to_string()); }
    let token = data["token"].as_str().filter(|t| t.starts_with("vey_") && t.len() < 200).ok_or("Sign-in failed. Please try again.")?.to_string();
    set_token(&app, &state, Some(token))?;
    veyra_account(app, state).await?.ok_or_else(|| "Signed in, but veyraeditor.com could not be reached.".into())
}

/// The signed-in account, or None when signed out (or the sign-in was revoked).
#[tauri::command]
pub async fn veyra_account(app: AppHandle, state: State<'_, AccountState>) -> Result<Option<VeyraAccount>> {
    let Some(token) = token(&app, &state)? else { return Ok(None) };
    let response = client()?.get(format!("{}/usage", veyra_api())).bearer_auth(token).timeout(Duration::from_secs(20)).send().await
        .map_err(|_| OFFLINE.to_string())?;
    if response.status().as_u16() == 401 { set_token(&app, &state, None)?; return Ok(None); }
    let data = response_json(response).await?;
    Ok(Some(VeyraAccount { name: data["user"]["name"].as_str().unwrap_or("").into(), email: data["user"]["email"].as_str().unwrap_or("").into() }))
}

/// Sign out: revoke the token on the server (best effort) and delete it from this device.
#[tauri::command]
pub async fn veyra_sign_out(app: AppHandle, state: State<'_, AccountState>) -> Result<()> {
    if let Some(token) = token(&app, &state)? {
        let _ = client()?.delete(format!("{}/api/auth/token", veyra_site())).bearer_auth(token).timeout(Duration::from_secs(10)).send().await;
    }
    set_token(&app, &state, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn token_file_round_trip_and_sign_out() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("nested").join(ACCOUNT_FILE);
        assert_eq!(read_token(&file), None);
        write_token(&file, Some("vey_abc123")).unwrap();
        assert_eq!(read_token(&file).as_deref(), Some("vey_abc123"));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600); }
        std::fs::write(&file, r#"{"token":"not-a-veyra-token"}"#).unwrap();
        assert_eq!(read_token(&file), None, "only Veyra tokens are accepted");
        write_token(&file, None).unwrap();
        assert!(!file.exists());
        write_token(&file, None).unwrap(); // signing out twice is fine
    }
}
