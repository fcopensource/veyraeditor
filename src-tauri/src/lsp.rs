//! Language servers: installs known npm-distributed servers into Veyra's app-data folder and bridges
//! their stdio JSON-RPC (Language Server Protocol) to the editor through Tauri events.
use super::{find_in_path, plain, root, Workspace};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }

/// A server Veyra knows how to install and start. The editor can only ask for these by key.
struct Spec { key: &'static str, packages: &'static [&'static str], main: &'static str, bin: &'static str, args: &'static [&'static str] }
const SPECS: &[Spec] = &[
    Spec { key: "typescript", packages: &["typescript-language-server@4.4.1", "typescript@5.9.3"], main: "typescript-language-server", bin: "typescript-language-server", args: &["--stdio"] },
    Spec { key: "eslint", packages: &["vscode-langservers-extracted@4.10.0"], main: "vscode-langservers-extracted", bin: "vscode-eslint-language-server", args: &["--stdio"] },
    Spec { key: "tailwind", packages: &["@tailwindcss/language-server@0.16.0"], main: "@tailwindcss/language-server", bin: "tailwindcss-language-server", args: &["--stdio"] },
    Spec { key: "emmet", packages: &["@olrtg/emmet-language-server@2.8.0"], main: "@olrtg/emmet-language-server", bin: "emmet-language-server", args: &["--stdio"] },
    Spec { key: "svelte", packages: &["svelte-language-server@0.18.4", "typescript@5.9.3"], main: "svelte-language-server", bin: "svelteserver", args: &["--stdio"] },
    Spec { key: "vue", packages: &["@vue/language-server@2.2.12", "typescript@5.9.3"], main: "@vue/language-server", bin: "vue-language-server", args: &["--stdio"] },
    // Not a language server: used by the Prettier formatter.
    Spec { key: "prettier", packages: &["prettier@3.9.9"], main: "prettier", bin: "prettier", args: &[] },
];
fn spec(key: &str) -> Result<&'static Spec> { SPECS.iter().find(|s| s.key == key).ok_or_else(|| format!("Unknown language tool: {key}")) }

struct Server { child: Child, stdin: ChildStdin }
impl Drop for Server { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
#[derive(Default)]
pub struct LspState { servers: Mutex<HashMap<u32, Server>> }

#[derive(Serialize, Clone)]
struct Message { id: u32, message: String }
#[derive(Serialize, Clone)]
struct Exit { id: u32, code: Option<i32>, log: String }
#[derive(Serialize)]
pub struct ToolStatus { key: String, installed: bool, version: String }
#[derive(Serialize)]
pub struct Status { node: String, npm: bool, dir: String, tools: Vec<ToolStatus> }

fn no_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); } // CREATE_NO_WINDOW
    command
}
fn node() -> Option<PathBuf> { find_in_path(if cfg!(windows) { "node.exe" } else { "node" }).or_else(|| ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"].iter().map(PathBuf::from).find(|p| p.is_file())) }
fn npm() -> Option<PathBuf> { find_in_path(if cfg!(windows) { "npm.cmd" } else { "npm" }).or_else(|| ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "/usr/bin/npm"].iter().map(PathBuf::from).find(|p| p.is_file())) }
fn tools_dir(app: &AppHandle) -> Result<PathBuf> { Ok(app.path().app_data_dir().map_err(err)?.join("language-tools")) }

/// The JavaScript entry point of a package's executable, read from its package.json `bin` field.
fn entry(dir: &Path, main: &str, bin: &str) -> Option<PathBuf> {
    let package = dir.join("node_modules").join(main);
    let manifest: serde_json::Value = serde_json::from_str(&fs::read_to_string(package.join("package.json")).ok()?).ok()?;
    let relative = match &manifest["bin"] { serde_json::Value::String(path) => path.clone(), value => value[bin].as_str()?.to_string() };
    let path = package.join(relative.trim_start_matches("./")).canonicalize().ok()?;
    path.starts_with(dir.canonicalize().ok()?).then_some(path)
}
fn installed_version(dir: &Path, main: &str) -> Option<String> {
    let manifest: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("node_modules").join(main).join("package.json")).ok()?).ok()?;
    manifest["version"].as_str().map(str::to_string)
}

#[tauri::command]
pub async fn lsp_status(app: AppHandle) -> Result<Status> {
    let dir = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let node = node().and_then(|path| no_window(Command::new(path).arg("--version")).output().ok()).map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string()).unwrap_or_default();
        let tools = SPECS.iter().map(|s| { let d = dir.join(s.key); let version = installed_version(&d, s.main).unwrap_or_default(); ToolStatus { key: s.key.into(), installed: !version.is_empty(), version } }).collect();
        Ok(Status { node, npm: npm().is_some(), dir: plain(&dir).to_string_lossy().into_owned(), tools })
    }).await.map_err(err)?
}

/// Installs a tool with the user's npm into Veyra's app-data folder (never globally, never into the project).
#[tauri::command]
pub async fn lsp_install(app: AppHandle, key: String) -> Result<String> {
    let spec = spec(&key)?;
    let dir = tools_dir(&app)?.join(spec.key);
    let npm = npm().ok_or("npm was not found. Install Node.js 18 or newer from nodejs.org, then restart Veyra.")?;
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&dir).map_err(err)?;
        if !dir.join("package.json").exists() { fs::write(dir.join("package.json"), "{\"name\":\"veyra-language-tool\",\"private\":true}").map_err(err)?; }
        let output = no_window(Command::new(npm).args(["install", "--no-audit", "--no-fund", "--omit=dev", "--loglevel=error", "--prefix"]).arg(&dir).args(spec.packages).current_dir(&dir)).output().map_err(err)?;
        if !output.status.success() {
            let log = String::from_utf8_lossy(&output.stderr);
            return Err(format!("npm could not install {}: {}", spec.key, log.lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ")));
        }
        installed_version(&dir, spec.main).ok_or_else(|| "Installation finished but the tool was not found.".to_string())
    }).await.map_err(err)?
}

#[tauri::command]
pub async fn lsp_uninstall(app: AppHandle, state: State<'_, LspState>, key: String) -> Result<()> {
    let spec = spec(&key)?;
    state.servers.lock().map_err(err)?.clear(); // the editor restarts what it still needs
    let dir = tools_dir(&app)?.join(spec.key);
    tauri::async_runtime::spawn_blocking(move || if dir.exists() { fs::remove_dir_all(dir).map_err(err) } else { Ok(()) }).await.map_err(err)?
}

/// Read one LSP frame (`Content-Length` headers, blank line, JSON body). `Ok(None)` at end of stream.
fn read_frame(reader: &mut impl BufRead) -> std::io::Result<Option<String>> {
    let mut length: Option<usize> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 { return Ok(None); }
        let line = line.trim_end();
        if line.is_empty() { if length.is_some() { break; } continue; }
        if let Some(value) = line.split_once(':').filter(|(name, _)| name.eq_ignore_ascii_case("content-length")).map(|(_, v)| v.trim()) {
            length = value.parse().ok().filter(|n| *n <= 64 * 1024 * 1024);
        }
    }
    let mut body = vec![0; length.unwrap_or(0)];
    reader.read_exact(&mut body)?;
    Ok(Some(String::from_utf8_lossy(&body).into_owned()))
}
fn frame(message: &str) -> Vec<u8> { let mut out = format!("Content-Length: {}\r\n\r\n", message.len()).into_bytes(); out.extend_from_slice(message.as_bytes()); out }

#[tauri::command]
pub async fn lsp_start(app: AppHandle, workspace: State<'_, Workspace>, state: State<'_, LspState>, id: u32, key: String) -> Result<()> {
    let spec = spec(&key)?;
    if spec.args.is_empty() { return Err("This tool is not a language server.".into()); }
    let root = root(&workspace)?;
    let dir = tools_dir(&app)?.join(spec.key);
    let entry = entry(&dir, spec.main, spec.bin).ok_or_else(|| format!("{} is not installed. Install it from the Extensions panel.", spec.key))?;
    let node = node().ok_or("Node.js was not found. Install Node.js 18 or newer from nodejs.org, then restart Veyra.")?;
    let mut child = no_window(Command::new(node).arg(entry).args(spec.args).current_dir(plain(&root)).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())).spawn().map_err(err)?;
    let stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    state.servers.lock().map_err(err)?.insert(id, Server { child, stdin });
    // Keep the tail of stderr so a crash can be explained to the user.
    let log = std::sync::Arc::new(Mutex::new(String::new()));
    let log_writer = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(std::result::Result::ok) {
            if let Ok(mut text) = log_writer.lock() { text.push_str(&line); text.push('\n'); if text.len() > 8000 { let cut = text.len() - 8000; text.drain(..cut); } }
        }
    });
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(Some(message)) = read_frame(&mut reader) { let _ = app.emit("lsp-message", Message { id, message }); }
        let code = app.state::<LspState>().servers.lock().ok().and_then(|mut servers| servers.remove(&id)).and_then(|mut server| server.child.try_wait().ok().flatten()).and_then(|status| status.code());
        let log = log.lock().map(|text| text.clone()).unwrap_or_default();
        let _ = app.emit("lsp-exit", Exit { id, code, log });
    });
    Ok(())
}

#[tauri::command]
pub fn lsp_send(state: State<'_, LspState>, id: u32, message: String) -> Result<()> {
    let mut servers = state.servers.lock().map_err(err)?;
    let server = servers.get_mut(&id).ok_or("Language server is not running")?;
    server.stdin.write_all(&frame(&message)).and_then(|_| server.stdin.flush()).map_err(err)
}

#[tauri::command]
pub fn lsp_stop(state: State<'_, LspState>, id: u32) { if let Ok(mut servers) = state.servers.lock() { servers.remove(&id); } }

/// Format with the project's own Prettier when it has one (respecting its version and config), else Veyra's copy.
#[tauri::command]
pub async fn prettier_format(app: AppHandle, workspace: State<'_, Workspace>, path: String, text: String) -> Result<String> {
    let root = root(&workspace)?;
    if path.is_empty() || Path::new(&path).components().any(|c| !matches!(c, std::path::Component::Normal(_))) { return Err("Invalid path".into()); }
    let bundled = tools_dir(&app)?.join("prettier");
    let node = node().ok_or("Node.js was not found. Install Node.js 18 or newer to use Prettier.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let entry = entry(&root, "prettier", "prettier").or_else(|| entry(&bundled, "prettier", "prettier")).ok_or("Prettier is not installed. Install it from the Extensions panel.")?;
        let mut child = no_window(Command::new(node).arg(entry).arg("--stdin-filepath").arg(plain(&root).join(&path)).current_dir(plain(&root)).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())).spawn().map_err(err)?;
        let mut stdin = child.stdin.take().ok_or("No stdin")?;
        let writer = std::thread::spawn(move || { let _ = stdin.write_all(text.as_bytes()); });
        let output = child.wait_with_output().map_err(err)?;
        let _ = writer.join();
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) }
        else { Err(format!("Prettier: {}", String::from_utf8_lossy(&output.stderr).lines().take(4).collect::<Vec<_>>().join(" "))) }
    }).await.map_err(err)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn frames_round_trip_and_tolerate_extra_headers() {
        let mut stream = Vec::new();
        stream.extend(frame(r#"{"jsonrpc":"2.0","id":1}"#));
        stream.extend(b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\nContent-Length: 2\r\n\r\n{}");
        let mut reader = std::io::Cursor::new(stream);
        assert_eq!(read_frame(&mut reader).unwrap().as_deref(), Some(r#"{"jsonrpc":"2.0","id":1}"#));
        assert_eq!(read_frame(&mut reader).unwrap().as_deref(), Some("{}"));
        assert_eq!(read_frame(&mut reader).unwrap(), None);
    }
    #[test] fn unicode_lengths_are_bytes() { assert!(String::from_utf8(frame("é")).unwrap().starts_with("Content-Length: 2\r\n")); }
    #[test] fn every_server_has_a_known_key() { for s in SPECS { assert!(spec(s.key).is_ok()); assert!(!s.packages.is_empty()); } assert!(spec("rm -rf").is_err()); }
}
