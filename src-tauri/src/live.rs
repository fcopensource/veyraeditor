//! Live Server commands: serve the open folder with live reload (see live_server.rs).
use super::{root, Workspace};
use crate::live_server::{url_for, LiveServer, DEFAULT_PORT};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

type Result<T> = std::result::Result<T, String>;

#[derive(Default)]
pub struct LiveState(Mutex<Option<LiveServer>>);

#[derive(Serialize)]
pub struct LiveInfo { port: u16, url: String, page: String }

/// `page`: the address of `path` (a file in the open folder), or of the folder itself.
fn info(server: &LiveServer, path: Option<&str>) -> LiveInfo {
    let url = server.url();
    let page = path.filter(|p| !p.is_empty()).map_or_else(|| url.clone(), |p| format!("http://127.0.0.1:{}{}", server.port, url_for(p)));
    LiveInfo { port: server.port, url, page }
}

/// Starts serving the open folder, or returns the server that is already serving it.
/// `path` (relative to the folder) picks the page to open.
#[tauri::command]
pub fn live_start(workspace: State<Workspace>, live: State<LiveState>, path: Option<String>) -> Result<LiveInfo> {
    let folder = root(&workspace)?.canonicalize().map_err(|e| e.to_string())?;
    let mut current = live.0.lock().map_err(|e| e.to_string())?;
    if let Some(server) = current.as_ref().filter(|server| server.root == folder) { return Ok(info(server, path.as_deref())); }
    *current = None; // a different folder: stop the old server first so its port is free
    let server = LiveServer::start(&folder, DEFAULT_PORT)?;
    let result = info(&server, path.as_deref());
    *current = Some(server);
    Ok(result)
}

#[tauri::command]
pub fn live_stop(live: State<LiveState>) -> Result<()> {
    live.0.lock().map_err(|e| e.to_string())?.take();
    Ok(())
}

#[tauri::command]
pub fn live_status(live: State<LiveState>) -> Result<Option<LiveInfo>> {
    Ok(live.0.lock().map_err(|e| e.to_string())?.as_ref().map(|server| info(server, None)))
}
