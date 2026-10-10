//! What Veyra will never pick automatically as AI context: secret-looking files (by name), files whose content
//! contains a high-confidence credential, hidden files, and files the project's .gitignore excludes.
//! The user can still attach any file explicitly; the editor asks for confirmation before sending a sensitive one.
use std::{collections::HashSet, io::Write, path::Path, process::{Command, Stdio}, sync::OnceLock};

/// File names (lower case) that hold secrets or credentials.
const SECRET_NAMES: &[&str] = &[
    "credentials", "credentials.json", "credentials.yml", "credentials.yaml", "secrets.json", "secrets.yml", "secrets.yaml", "secrets.toml",
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "authorized_keys", "known_hosts", "kubeconfig", "htpasswd", "netrc", "_netrc",
    "terraform.tfstate", "terraform.tfstate.backup", "keystore.jks", "service-account.json", "serviceaccount.json",
];
/// Extensions of key, certificate and keystore files.
const SECRET_EXTENSIONS: &[&str] = &["pem", "key", "p12", "pfx", "jks", "keystore", "ppk", "kdbx", "tfvars", "ovpn", "asc", "gpg", "der", "crt", "cer"];

/// True for paths that should never be chosen automatically: hidden files and folders (.env, .ssh, .aws…),
/// key and certificate files, and well-known credential files.
pub fn is_sensitive_path(relative: &str) -> bool {
    let parts: Vec<&str> = relative.split(['/', '\\']).filter(|part| !part.is_empty()).collect();
    if parts.iter().any(|part| part.starts_with('.') && *part != ".github") { return true; }
    let Some(name) = parts.last().map(|name| name.to_lowercase()) else { return false };
    if SECRET_NAMES.contains(&name.as_str()) || name.starts_with("id_rsa") || name.starts_with("id_ed25519") { return true; }
    if name.contains("secret") || name.contains("service-account") || name.contains("serviceaccount") || name.contains("private-key") || name.contains("private_key") { return true; }
    // .env files are hidden (caught above); this catches "production.env" style names.
    if name == "env" || name.ends_with(".env") { return true; }
    Path::new(&name).extension().and_then(|ext| ext.to_str()).is_some_and(|ext| SECRET_EXTENSIONS.contains(&ext))
}

/// High-confidence credential patterns: private keys and well-known API token formats.
fn patterns() -> &'static [regex::Regex] {
    static PATTERNS: OnceLock<Vec<regex::Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| [
        r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----",
        r"\bAKIA[0-9A-Z]{16}\b",                         // AWS access key id
        r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b",  // GitHub tokens
        r"\bgithub_pat_[A-Za-z0-9_]{60,}\b",
        r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b",              // Slack
        r"\bsk-ant-[A-Za-z0-9_-]{20,}\b",                 // Anthropic
        r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b",           // OpenAI
        r"\bAIza[0-9A-Za-z_-]{35}\b",                     // Google API key
        r"\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b",           // Stripe
        r"\bnpm_[A-Za-z0-9]{36}\b",                       // npm
        r#""private_key"\s*:\s*"-----BEGIN"#,             // service-account JSON
    ].iter().filter_map(|pattern| regex::Regex::new(pattern).ok()).collect())
}
/// True when the text contains something that looks like a real credential.
pub fn looks_like_secret(text: &str) -> bool { patterns().iter().any(|pattern| pattern.is_match(text)) }

/// The candidates that the project's .gitignore excludes (empty when this is not a Git repository or Git is missing).
pub fn git_ignored(root: &Path, candidates: &[String]) -> HashSet<String> {
    if candidates.is_empty() || !root.join(".git").exists() { return HashSet::new(); }
    let mut command = Command::new("git");
    command.args(["check-ignore", "--stdin"]).current_dir(root).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x0800_0000); }
    let Ok(mut child) = command.spawn() else { return HashSet::new() };
    if let Some(mut stdin) = child.stdin.take() {
        let list = candidates.join("\n") + "\n";
        std::thread::spawn(move || { let _ = stdin.write_all(list.as_bytes()); });
    }
    child.wait_with_output().map(|output| String::from_utf8_lossy(&output.stdout).lines().map(|line| line.trim().replace('\\', "/")).collect()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn secret_files_are_sensitive() {
        for path in [".env", ".env.local", "config/.env.production", "app/production.env", ".ssh/id_rsa", "keys/id_ed25519.pub", "certs/server.pem", "deploy/tls.key",
            "android/release.keystore", "gcp/service-account.json", "config/secrets.yml", "my-secret-notes.txt", "infra/terraform.tfstate", "prod.tfvars",
            ".aws/credentials", ".npmrc", ".git/config", "src/.hidden/file.ts", "credentials.json"] {
            assert!(is_sensitive_path(path), "{path} should be sensitive");
        }
    }
    #[test] fn ordinary_source_is_not_sensitive() {
        for path in ["src/main.rs", "src/App.tsx", "README.md", "package.json", ".github/workflows/release.yml", "docs/environment.md", "src/keyboard.ts", "src/env.d.ts", "tests/auth.spec.ts"] {
            assert!(!is_sensitive_path(path), "{path} should be allowed");
        }
    }
    #[test] fn credential_contents_are_detected() {
        assert!(looks_like_secret("-----BEGIN RSA PRIVATE KEY-----\nMIIE..."));
        assert!(looks_like_secret("-----BEGIN OPENSSH PRIVATE KEY-----"));
        assert!(looks_like_secret("aws_access_key_id = AKIAIOSFODNN7EXAMPLE"));
        assert!(looks_like_secret("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
        assert!(looks_like_secret("OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD"));
        assert!(looks_like_secret("ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz"));
        assert!(looks_like_secret("key=AIzaSyA1234567890abcdefghijklmnopqrstuv"));
        assert!(looks_like_secret("{\"type\":\"service_account\",\"private_key\": \"-----BEGIN PRIVATE KEY-----\"}"));
    }
    #[test] fn gitignored_files_are_excluded() {
        let dir = std::env::temp_dir().join(format!("veyra-privacy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap();
        if !Command::new("git").arg("init").arg("-q").current_dir(&dir).status().is_ok_and(|s| s.success()) { return; } // Git not installed
        std::fs::write(dir.join(".gitignore"), "private/\n*.log\n").unwrap();
        let candidates = ["private/notes.md", "debug.log", "src/main.ts"].map(String::from);
        let ignored = git_ignored(&dir, &candidates);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(ignored, HashSet::from(["private/notes.md".to_string(), "debug.log".to_string()]));
    }
    #[test] fn ordinary_code_is_not_flagged() {
        assert!(!looks_like_secret("const apiKey = process.env.OPENAI_API_KEY;"));
        assert!(!looks_like_secret("function skip() { return 'sk-'; }"));
        assert!(!looks_like_secret("// set AWS_ACCESS_KEY_ID in your environment"));
    }
}
