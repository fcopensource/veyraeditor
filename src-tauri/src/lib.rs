use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{fs, io::{Read, Write}, path::{Component, Path, PathBuf}, process::Command, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{Emitter, Manager, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE: u64 = 5 * 1024 * 1024;
#[derive(Default)]
struct Workspace { root: Mutex<Option<PathBuf>>, dirty: AtomicBool, terminal: Mutex<Option<TerminalSession>> }
struct TerminalSession { master: Box<dyn portable_pty::MasterPty + Send>, writer: Box<dyn Write + Send>, child: Box<dyn portable_pty::Child + Send + Sync> }
impl Drop for TerminalSession { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
#[derive(Serialize)]
struct Entry { path: String, name: String, directory: bool }
#[derive(Serialize)]
struct Match { path: String, line: usize, text: String }
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn root(state: &Workspace) -> Result<PathBuf> { state.root.lock().map_err(err)?.clone().ok_or("Open a folder first".into()) }
fn checked(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Invalid workspace path".into()); }
    let path = root.join(rel);
    let canonical = path.canonicalize().map_err(err)?;
    if !canonical.starts_with(root) { return Err("Symbolic link points outside this workspace".into()); }
    Ok(canonical)
}
fn destination(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.is_empty() || Path::new(relative).components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Enter a relative path without ..".into()); }
    let path = root.join(relative);
    let parent = path.parent().ok_or("Invalid parent")?.canonicalize().map_err(err)?;
    if !parent.starts_with(root) { return Err("Destination is outside this workspace".into()); }
    if path.exists() || path.symlink_metadata().is_ok() { return Err("A file with that name already exists".into()); }
    Ok(path)
}
fn text_file(path: &Path) -> Result<String> {
    if fs::metadata(path).map_err(err)?.len() > MAX_FILE { return Err("File exceeds the 5 MB editing limit".into()); }
    let text = fs::read_to_string(path).map_err(|_| "This file is not UTF-8 text".to_string())?;
    if text.contains('\0') { return Err("Binary files cannot be edited as text".into()); }
    Ok(text)
}
fn save_checked(path: &Path, content: &str, original: &str) -> Result<()> {
    if text_file(path)? != original { return Err("File changed on disk. Reload it before saving; your edits are still in the editor.".into()); }
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid parent")?).map_err(err)?;
    temp.as_file().set_permissions(fs::metadata(path).map_err(err)?.permissions()).map_err(err)?;
    temp.write_all(content.as_bytes()).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle, state: State<'_, Workspace>) -> Result<Option<String>> {
    let selected = app.dialog().file().blocking_pick_folder();
    if let Some(selected) = selected {
        let selected = selected.into_path().map_err(err)?.canonicalize().map_err(err)?;
        state.terminal.lock().map_err(err)?.take();
        *state.root.lock().map_err(err)? = Some(selected.clone());
        Ok(Some(selected.to_string_lossy().into_owned()))
    } else { Ok(None) }
}
#[tauri::command]
fn list_directory(state: State<Workspace>, path: String) -> Result<Vec<Entry>> {
    let root = root(&state)?;
    let dir = if path.is_empty() { root.clone() } else { checked(&root, &path)? };
    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(err)? {
        let item = item.map_err(err)?;
        if item.file_type().map_err(err)?.is_symlink() { continue; }
        let name = item.file_name().to_string_lossy().into_owned();
        if name == ".git" { continue; }
        entries.push(Entry { path: item.path().strip_prefix(&root).map_err(err)?.to_string_lossy().into_owned(), name, directory: item.file_type().map_err(err)?.is_dir() });
    }
    entries.sort_by_key(|e| (!e.directory, e.name.to_lowercase()));
    Ok(entries)
}
#[tauri::command]
fn read_file(state: State<Workspace>, path: String) -> Result<String> { text_file(&checked(&root(&state)?, &path)?) }
#[tauri::command]
fn save_file(state: State<Workspace>, path: String, content: String, original: String) -> Result<()> {
    save_checked(&checked(&root(&state)?, &path)?, &content, &original)
}
#[tauri::command]
fn create_entry(state: State<Workspace>, path: String, directory: bool) -> Result<()> {
    let path = destination(&root(&state)?, &path)?;
    if directory { fs::create_dir(path).map_err(err) } else { fs::OpenOptions::new().write(true).create_new(true).open(path).map(|_| ()).map_err(err) }
}
#[tauri::command]
fn rename_file(state: State<Workspace>, path: String, next: String) -> Result<()> {
    let root = root(&state)?;
    fs::rename(checked(&root, &path)?, destination(&root, &next)?).map_err(err)
}
#[tauri::command]
fn trash_file(state: State<Workspace>, path: String) -> Result<()> {
    let file = checked(&root(&state)?, &path)?;
    if !file.is_file() { return Err("Only individual files can be moved to Trash".into()); }
    trash::delete(file).map_err(err)
}
fn index(dir: &Path, base: &Path, files: &mut Vec<String>, depth: usize) {
    if depth > 25 || files.len() >= 10000 { return; }
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        if files.len() >= 10000 { break; }
        let Ok(kind) = entry.file_type() else { continue; };
        if kind.is_symlink() { continue; }
        let name = entry.file_name().to_string_lossy().into_owned();
        if [".git","node_modules","target","dist","build",".next",".venv","venv"].contains(&name.as_str()) { continue; }
        if kind.is_dir() { index(&entry.path(), base, files, depth + 1); }
        else if kind.is_file() { if let Ok(path) = entry.path().strip_prefix(base) { files.push(path.to_string_lossy().into_owned()); } }
    }
}
#[tauri::command]
async fn project_files(state: State<'_, Workspace>) -> Result<Vec<String>> {
    let root = root(&state)?;
    tauri::async_runtime::spawn_blocking(move || { let mut files = Vec::new(); index(&root, &root, &mut files, 0); files.sort(); files }).await.map_err(err)
}
#[tauri::command]
async fn search_workspace(state: State<'_, Workspace>, query: String) -> Result<Vec<Match>> {
    let root = root(&state)?;
    if query.trim().is_empty() { return Ok(Vec::new()); }
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new(); index(&root, &root, &mut files, 0);
        let query = query.to_lowercase(); let mut matches = Vec::new();
        for path in files {
            if let Ok(text) = text_file(&root.join(&path)) {
                for (i, line) in text.lines().enumerate() {
                    if line.to_lowercase().contains(&query) {
                        matches.push(Match { path: path.clone(), line: i + 1, text: line.chars().take(240).collect() });
                        if matches.len() >= 500 { return matches; }
                    }
                }
            }
        }
        matches
    }).await.map_err(err)
}
#[tauri::command]
async fn git_status(state: State<'_, Workspace>) -> Result<String> {
    let root = root(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git").args(["--no-optional-locks", "status", "--short", "--branch"]).current_dir(root).output().map_err(err)?;
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
    }).await.map_err(err)?
}
#[tauri::command]
async fn git_diff(state: State<'_, Workspace>, path: String) -> Result<String> {
    let root = root(&state)?; checked(&root, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git").args(["diff", "HEAD", "--", &path]).current_dir(root).output().map_err(err)?;
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
    }).await.map_err(err)?
}
#[tauri::command]
fn terminal_start(state: State<Workspace>, output: Channel<Vec<u8>>) -> Result<()> {
    let root = root(&state)?;
    let mut session = state.terminal.lock().map_err(err)?;
    session.take();
    let pair = native_pty_system().openpty(PtySize { rows: 24, cols: 100, pixel_width: 0, pixel_height: 0 }).map_err(err)?;
    let mut command = CommandBuilder::new(std::env::var("SHELL").unwrap_or("/bin/zsh".into()));
    command.arg("-l"); command.cwd(root); command.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(command).map_err(err)?;
    let mut reader = pair.master.try_clone_reader().map_err(err)?;
    let writer = pair.master.take_writer().map_err(err)?;
    *session = Some(TerminalSession { master: pair.master, writer, child });
    std::thread::spawn(move || { let mut buf = [0; 8192]; while let Ok(n) = reader.read(&mut buf) { if n == 0 || output.send(buf[..n].to_vec()).is_err() { break; } } });
    Ok(())
}
#[tauri::command]
fn terminal_write(state: State<Workspace>, data: String) -> Result<()> {
    if let Some(session) = state.terminal.lock().map_err(err)?.as_mut() { session.writer.write_all(data.as_bytes()).map_err(err)?; session.writer.flush().map_err(err)?; }
    Ok(())
}
#[tauri::command]
fn terminal_resize(state: State<Workspace>, rows: u16, cols: u16) -> Result<()> {
    if let Some(session) = state.terminal.lock().map_err(err)?.as_mut() { session.master.resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }).map_err(err)?; }
    Ok(())
}
#[tauri::command]
fn terminal_stop(state: State<Workspace>) { if let Ok(mut session) = state.terminal.lock() { session.take(); } }
#[tauri::command]
fn set_dirty(state: State<Workspace>, dirty: bool) { state.dirty.store(dirty, Ordering::SeqCst); }
#[tauri::command]
fn quit(app: tauri::AppHandle, state: State<Workspace>) { state.dirty.store(false, Ordering::SeqCst); app.exit(0); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().manage(Workspace::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![choose_folder, list_directory, read_file, save_file, create_entry, rename_file, trash_file, project_files, search_workspace, git_status, git_diff, terminal_start, terminal_write, terminal_resize, terminal_stop, set_dirty, quit])
        .on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { if window.state::<Workspace>().dirty.load(Ordering::SeqCst) { api.prevent_close(); let _ = window.emit("confirm-quit", ()); } } })
        .build(tauri::generate_context!()).expect("error while running Veyra")
        .run(|app, event| { if let tauri::RunEvent::ExitRequested { api, .. } = event { if app.state::<Workspace>().dirty.load(Ordering::SeqCst) { api.prevent_exit(); let _ = app.emit("confirm-quit", ()); } } });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn traversal_and_overwrite_are_rejected() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().canonicalize().unwrap();
        fs::write(base.join("keep.txt"), "original").unwrap();
        assert!(destination(&base, "../escape").is_err());
        assert!(destination(&base, "/tmp/escape").is_err());
        assert!(destination(&base, "keep.txt").is_err());
        assert!(checked(&base, "../escape").is_err());
    }
    #[test] fn save_preserves_external_changes() {
        let dir = tempfile::tempdir().unwrap(); let file = dir.path().join("a.ts");
        fs::write(&file, "original").unwrap();
        save_checked(&file, "updated", "original").unwrap();
        assert_eq!(text_file(&file).unwrap(), "updated");
        assert!(save_checked(&file, "stale edit", "original").is_err());
        assert_eq!(text_file(&file).unwrap(), "updated");
    }
    #[cfg(unix)]
    #[test] fn symlink_escape_rejected() {
        let a = tempfile::tempdir().unwrap(); let b = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(b.path(), a.path().join("escape")).unwrap();
        let base = a.path().canonicalize().unwrap();
        assert!(destination(&base, "escape/file").is_err());
        assert!(checked(&base, "escape").is_err());
    }
}
