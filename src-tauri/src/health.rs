//! Native half of Veyra's health monitor: checks the tools and services the editor depends on.
use super::{default_shell, gh_program, index, plain, Workspace};
use serde::Serialize;
use std::{fs, process::Command, time::{Duration, Instant}};
use tauri::State;

#[derive(Serialize)]
pub struct HealthCheck { id: String, label: String, group: String, status: String, detail: String, hint: String, ms: u64 }

/// Times one check. `status` is ok, warn, fail or info (info never lowers the score).
fn run(id: &str, label: &str, group: &str, check: impl FnOnce() -> (&'static str, String, String)) -> HealthCheck {
    let started = Instant::now();
    let (status, detail, hint) = check();
    HealthCheck { id: id.into(), label: label.into(), group: group.into(), status: status.into(), detail, hint, ms: started.elapsed().as_millis() as u64 }
}
fn command_output(program: &str, args: &[&str], cwd: Option<&std::path::Path>) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = cwd { command.current_dir(plain(cwd)); }
    let output = command.output().ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub(crate) async fn health_check(state: State<'_, Workspace>) -> Result<Vec<HealthCheck>, String> {
    let root = state.root.lock().map_err(|e| e.to_string())?.clone();
    let mut checks = Vec::new();

    // Terminal sessions: a child that already exited means a dead tab the user may still type into.
    checks.push(run("terminals", "Terminal sessions", "Native", || {
        let Ok(mut sessions) = state.terminals.lock() else { return ("fail", "Terminal registry is unavailable".into(), "Restart Veyra.".into()) };
        let total = sessions.len();
        let dead = sessions.values_mut().map(|session| matches!(session.child.try_wait(), Ok(Some(_)))).filter(|exited| *exited).count();
        if dead > 0 { ("warn", format!("{dead} of {total} shells have exited"), "Close the finished terminal tabs or open a new terminal.".into()) }
        else { ("ok", format!("{total} active shell{}", if total == 1 { "" } else { "s" }), String::new()) }
    }));

    let blocking = tauri::async_runtime::spawn_blocking(move || {
        let mut checks = Vec::new();
        checks.push(run("workspace", "Workspace folder", "Native", || match &root {
            None => ("info", "No folder is open".into(), "Open a folder to enable files, search, Git and terminals.".into()),
            Some(root) => match fs::metadata(root) {
                Err(e) => ("fail", format!("Cannot read {}: {e}", plain(root).display()), "The folder may have been moved or deleted. Open it again.".into()),
                Ok(meta) if meta.permissions().readonly() => ("warn", "Folder is read-only".into(), "Saving files will fail until you have write access.".into()),
                Ok(_) => {
                    let mut files = Vec::new(); index(root, root, &mut files, 0);
                    if files.len() >= 10000 { ("warn", "10,000+ files: search and quick open only see the first 10,000".into(), "Open a smaller sub-folder for full coverage.".into()) }
                    else { ("ok", format!("{} indexed files", files.len()), String::new()) }
                }
            },
        }));
        checks.push(run("git", "Git", "Native", || match command_output("git", &["--version"], None) {
            None => ("fail", "Git is not installed or not on PATH".into(), "Install Git from git-scm.com and restart Veyra.".into()),
            Some(version) => match &root {
                Some(root) if command_output("git", &["rev-parse", "--is-inside-work-tree"], Some(root)).as_deref() == Some("true") => ("ok", format!("{version} · repository detected"), String::new()),
                Some(_) => ("info", format!("{version} · this folder is not a Git repository"), "Run `git init` in the terminal to start tracking changes.".into()),
                None => ("ok", version, String::new()),
            },
        }));
        checks.push(run("github", "GitHub CLI", "Native", || match gh_program() {
            Some(path) => ("ok", format!("Found at {}", path.display()), String::new()),
            None => ("info", "Not installed (optional)".into(), "Install from cli.github.com to sign in and open repositories on GitHub.".into()),
        }));
        checks.push(run("shell", "Terminal shell", "Native", || {
            let (shell, _) = default_shell();
            if shell.is_file() || command_output(&shell.to_string_lossy(), &["-c", "exit"], None).is_some() { ("ok", shell.display().to_string(), String::new()) }
            else { ("fail", format!("{} was not found", shell.display()), "Install PowerShell or set your default shell, then restart Veyra.".into()) }
        }));
        checks.push(run("credentials", "Credential store", "Native", || {
            match keyring::Entry::new("Veyra Studio AI", "__veyra_health__").and_then(|entry| entry.get_password()) {
                Ok(_) | Err(keyring::Error::NoEntry) => ("ok", "Available for saving API keys".into(), String::new()),
                Err(e) => ("warn", format!("Unavailable: {e}"), "API keys will only last for the current session.".into()),
            }
        }));
        checks.push(run("storage", "Temporary storage", "Native", || match tempfile::tempfile() {
            Ok(_) => ("ok", "Writable".into(), String::new()),
            Err(e) => ("fail", format!("Cannot write temporary files: {e}"), "Free disk space; safe saves depend on temporary files.".into()),
        }));
        checks
    }).await.map_err(|e| e.to_string())?;
    checks.extend(blocking);

    // Local AI is optional, so an unreachable Ollama is informational only.
    let started = Instant::now();
    let ollama = reqwest::Client::builder().no_proxy().timeout(Duration::from_millis(1500)).build().map_err(|e| e.to_string())?
        .get("http://127.0.0.1:11434/api/tags").send().await;
    let (status, detail, hint) = match ollama {
        Ok(response) if response.status().is_success() => {
            let count = response.json::<serde_json::Value>().await.ok().and_then(|v| v["models"].as_array().map(|m| m.len())).unwrap_or(0);
            ("ok", format!("Running · {count} local model{}", if count == 1 { "" } else { "s" }), if count == 0 { "Run `ollama pull qwen2.5-coder:3b` to download a model.".to_string() } else { String::new() })
        }
        _ => ("info", "Not running (optional)".to_string(), "Start Ollama for private, local AI.".to_string()),
    };
    checks.push(HealthCheck { id: "ollama".into(), label: "Local AI (Ollama)".into(), group: "Native".into(), status: status.into(), detail, hint, ms: started.elapsed().as_millis() as u64 });
    checks.push(HealthCheck { id: "runtime".into(), label: "Veyra runtime".into(), group: "Native".into(), status: "info".into(),
        detail: format!("v{} · {} {}", env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH), hint: String::new(), ms: 0 });
    Ok(checks)
}
