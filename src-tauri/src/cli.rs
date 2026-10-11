//! Command-line tools Veyra integrates through its terminal, such as Claude Code: detection only.
//! Installing and running them happens in a visible terminal session, so the user sees every step.
use super::{plain, quiet};
use crate::lsp::search_path;
use serde::Serialize;
use std::path::{Path, PathBuf};

type Result<T> = std::result::Result<T, String>;

#[derive(Serialize)]
pub struct CliStatus { installed: bool, version: String, path: String }

/// Where Claude Code lives: PATH, the native installer's ~/.local/bin, and npm's global folder.
fn claude_candidates() -> Vec<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["claude.exe", "claude.cmd"] } else { &["claude"] };
    let mut dirs: Vec<PathBuf> = search_path().to_vec();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) {
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".claude").join("local"));
    }
    if cfg!(windows) { if let Some(appdata) = std::env::var_os("APPDATA") { dirs.push(PathBuf::from(appdata).join("npm")); } }
    dirs.into_iter().flat_map(|dir| names.iter().map(move |name| dir.join(name))).filter(|path| path.is_file()).collect()
}

/// "2.1.296 (Claude Code)" → "2.1.296"
fn parse_version(text: &str) -> String { text.split_whitespace().next().unwrap_or("").trim_start_matches('v').to_string() }

fn version_of(path: &Path) -> Option<String> {
    let output = quiet(path).arg("--version").output().ok()?;
    output.status.success().then(|| parse_version(&String::from_utf8_lossy(&output.stdout))).filter(|v| !v.is_empty())
}

#[tauri::command]
pub async fn claude_code_status() -> Result<CliStatus> {
    tauri::async_runtime::spawn_blocking(|| {
        for path in claude_candidates() {
            if let Some(version) = version_of(&path) { return Ok(CliStatus { installed: true, version, path: plain(&path).to_string_lossy().into_owned() }); }
        }
        Ok(CliStatus { installed: false, version: String::new(), path: String::new() })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn version_is_parsed() {
        assert_eq!(parse_version("2.1.296 (Claude Code)\n"), "2.1.296");
        assert_eq!(parse_version("v2.0.1"), "2.0.1");
        assert_eq!(parse_version(""), "");
    }
}
