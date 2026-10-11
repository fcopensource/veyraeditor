//! Debuggers: runs Debug Adapter Protocol (DAP) adapters and bridges their stdio messages to the editor,
//! the same way lsp.rs does for language servers. Python debugging uses debugpy (the engine inside
//! Microsoft's Python Debugger), installed with pip into Veyra's app-data folder.
use super::{plain, quiet, root, Workspace};
use crate::lsp::{frame, read_frame, search_path, tools_dir};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }

/// Pinned so every user runs the version Veyra was tested with.
const DEBUGPY: &str = "debugpy==1.8.22";

struct Adapter { child: Child, stdin: ChildStdin }
impl Drop for Adapter { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
#[derive(Default)]
pub struct DapState { adapters: Mutex<HashMap<u32, Adapter>> }

#[derive(Serialize, Clone)]
struct Message { id: u32, message: String }
#[derive(Serialize, Clone)]
struct Exit { id: u32, code: Option<i32>, log: String }
#[derive(Serialize)]
pub struct Python { path: String, version: String }
#[derive(Serialize)]
pub struct DebugStatus { python: Option<Python>, debugpy: String }

fn debugpy_dir(app: &AppHandle) -> Result<PathBuf> { Ok(tools_dir(app)?.join("debugpy")) }

/// The installed debugpy version, read from its dist-info folder name.
fn debugpy_version(dir: &Path) -> String {
    fs::read_dir(dir).ok().into_iter().flatten().flatten()
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .find_map(|name| name.strip_prefix("debugpy-").and_then(|rest| rest.strip_suffix(".dist-info")).map(str::to_owned))
        .unwrap_or_default()
}

/// "Python 3.12.10" for a working interpreter (3.8+, which debugpy needs), else None.
fn python_version(python: &Path) -> Option<String> {
    let output = quiet(python).args(["-c", "import sys; print('%d.%d.%d' % sys.version_info[:3]) if sys.version_info >= (3, 8) else exit(1)"]).output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string()).filter(|v| !v.is_empty())
}

/// Windows ships "python.exe" placeholders under WindowsApps that open the Microsoft Store instead of running Python.
fn is_store_placeholder(path: &Path) -> bool {
    cfg!(windows) && path.to_string_lossy().to_lowercase().contains("\\microsoft\\windowsapps\\")
}

/// The project's virtual environment interpreter, if it has one (.venv, venv, env).
fn venv_python(root: &Path) -> Option<PathBuf> {
    [".venv", "venv", "env"].iter().map(|name| if cfg!(windows) { root.join(name).join("Scripts").join("python.exe") } else { root.join(name).join("bin").join("python") })
        .find(|path| path.is_file())
}

/// The Python to debug with: the project's venv first, then Python on PATH (skipping Store placeholders),
/// then the Windows `py` launcher, then the standard install folders.
fn find_python(root: Option<&Path>) -> Option<(PathBuf, String)> {
    let mut candidates: Vec<PathBuf> = root.and_then(venv_python).into_iter().collect();
    let names: &[&str] = if cfg!(windows) { &["python.exe", "python3.exe"] } else { &["python3", "python"] };
    for dir in search_path() { for name in names { candidates.push(dir.join(name)); } }
    #[cfg(windows)]
    {
        if let Ok(output) = quiet("py").args(["-3", "-c", "import sys; print(sys.executable)"]).output() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if output.status.success() && !path.is_empty() { candidates.push(PathBuf::from(path)); }
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            let mut installs: Vec<PathBuf> = fs::read_dir(PathBuf::from(local).join("Programs").join("Python")).into_iter().flatten().flatten()
                .map(|entry| entry.path().join("python.exe")).filter(|path| path.is_file()).collect();
            installs.sort(); installs.reverse(); // Python313 before Python312
            candidates.extend(installs);
        }
    }
    candidates.into_iter().filter(|path| path.is_file() && !is_store_placeholder(path))
        .find_map(|path| python_version(&path).map(|version| (path, version)))
}
fn workspace_root(workspace: &State<'_, Workspace>) -> Option<PathBuf> { root(workspace).ok() }

#[tauri::command]
pub async fn dap_status(app: AppHandle, workspace: State<'_, Workspace>) -> Result<DebugStatus> {
    let dir = debugpy_dir(&app)?;
    let project = workspace_root(&workspace);
    tauri::async_runtime::spawn_blocking(move || {
        let python = find_python(project.as_deref()).map(|(path, version)| Python { path: plain(&path).to_string_lossy().into_owned(), version });
        Ok(DebugStatus { python, debugpy: debugpy_version(&dir) })
    }).await.map_err(err)?
}

/// Installs debugpy with pip into Veyra's app folder (never into the project or the user's Python).
#[tauri::command]
pub async fn dap_install(app: AppHandle, workspace: State<'_, Workspace>) -> Result<String> {
    let dir = debugpy_dir(&app)?;
    let project = workspace_root(&workspace);
    tauri::async_runtime::spawn_blocking(move || {
        let (python, _) = find_python(project.as_deref()).ok_or("Python 3.8 or newer was not found. Install it from python.org, then restart Veyra.")?;
        let staging = dir.with_extension("installing");
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging).map_err(err)?;
        let output = quiet(&python).args(["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--no-warn-script-location", "--target"]).arg(&staging).arg(DEBUGPY).output().map_err(err)?;
        if !output.status.success() {
            let _ = fs::remove_dir_all(&staging);
            let log = String::from_utf8_lossy(&output.stderr);
            if log.contains("No module named pip") { return Err("This Python has no pip. Install Python from python.org (pip is included), then try again.".into()); }
            return Err(format!("pip could not install debugpy: {}", log.lines().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ")));
        }
        // Swap in the new install only once it has fully succeeded.
        let _ = fs::remove_dir_all(&dir);
        fs::rename(&staging, &dir).map_err(err)?;
        let version = debugpy_version(&dir);
        if version.is_empty() { Err("Installation finished but debugpy was not found.".into()) } else { Ok(version) }
    }).await.map_err(err)?
}

#[tauri::command]
pub async fn dap_uninstall(app: AppHandle, state: State<'_, DapState>) -> Result<()> {
    state.adapters.lock().map_err(err)?.clear();
    let dir = debugpy_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || if dir.exists() { fs::remove_dir_all(dir).map_err(err) } else { Ok(()) }).await.map_err(err)?
}

#[derive(Serialize)]
pub struct Started { python: String }

/// Starts a debug adapter for the workspace. Only known adapters can be started; the editor then speaks DAP to it.
#[tauri::command]
pub async fn dap_start(app: AppHandle, workspace: State<'_, Workspace>, state: State<'_, DapState>, id: u32, adapter: String) -> Result<Started> {
    if adapter != "python" { return Err("Unknown debugger".into()); }
    let project = root(&workspace)?;
    let dir = debugpy_dir(&app)?;
    if debugpy_version(&dir).is_empty() { return Err("The Python Debugger is not installed. Install it from the Extensions panel.".into()); }
    let found = { let project = project.clone(); tauri::async_runtime::spawn_blocking(move || find_python(Some(&project))).await.map_err(err)? };
    let (python, _) = found.ok_or("Python 3.8 or newer was not found. Install it from python.org, then restart Veyra.")?;
    let mut child = quiet(&python).args(["-m", "debugpy.adapter"]).env("PYTHONPATH", &dir).current_dir(plain(&project))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(err)?;
    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    state.adapters.lock().map_err(err)?.insert(id, Adapter { child, stdin });
    let log = Arc::new(Mutex::new(String::new()));
    let log_writer = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(std::result::Result::ok) {
            if let Ok(mut text) = log_writer.lock() { text.push_str(&line); text.push('\n'); if text.len() > 8000 { let cut = text.len() - 8000; text.drain(..cut); } }
        }
    });
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(Some(message)) = read_frame(&mut reader) { let _ = app.emit("dap-message", Message { id, message }); }
        let code = app.state::<DapState>().adapters.lock().ok().and_then(|mut adapters| adapters.remove(&id)).and_then(|mut adapter| adapter.child.try_wait().ok().flatten()).and_then(|status| status.code());
        let log = log.lock().map(|text| text.clone()).unwrap_or_default();
        let _ = app.emit("dap-exit", Exit { id, code, log });
    });
    Ok(Started { python: plain(&python).to_string_lossy().into_owned() })
}

#[tauri::command]
pub fn dap_send(state: State<'_, DapState>, id: u32, message: String) -> Result<()> {
    let mut adapters = state.adapters.lock().map_err(err)?;
    let adapter = adapters.get_mut(&id).ok_or("The debug session has ended")?;
    adapter.stdin.write_all(&frame(&message)).and_then(|_| adapter.stdin.flush()).map_err(err)
}

#[tauri::command]
pub fn dap_stop(state: State<'_, DapState>, id: u32) { if let Ok(mut adapters) = state.adapters.lock() { adapters.remove(&id); } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn store_placeholders_are_skipped() {
        if cfg!(windows) {
            assert!(is_store_placeholder(Path::new(r"C:\Users\me\AppData\Local\Microsoft\WindowsApps\python.exe")));
            assert!(!is_store_placeholder(Path::new(r"C:\Users\me\AppData\Local\Programs\Python\Python312\python.exe")));
        }
    }
    #[test] fn debugpy_version_comes_from_dist_info() {
        let dir = std::env::temp_dir().join(format!("veyra-dap-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("debugpy-1.8.22.dist-info")).unwrap();
        fs::create_dir_all(dir.join("debugpy")).unwrap();
        assert_eq!(debugpy_version(&dir), "1.8.22");
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(debugpy_version(&dir), "");
    }
    #[test] fn project_venv_is_preferred() {
        let dir = std::env::temp_dir().join(format!("veyra-venv-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let python = if cfg!(windows) { dir.join(".venv").join("Scripts").join("python.exe") } else { dir.join(".venv").join("bin").join("python") };
        fs::create_dir_all(python.parent().unwrap()).unwrap();
        fs::write(&python, "").unwrap();
        assert_eq!(venv_python(&dir), Some(python));
        let _ = fs::remove_dir_all(&dir);
    }
}
