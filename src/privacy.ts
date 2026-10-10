/* Mirrors src-tauri/src/privacy.rs: recognise files and text that probably contain secrets. Used to ask for
   confirmation before a user-attached file goes to a cloud AI provider. */
const SECRET_NAMES = new Set(["credentials", "credentials.json", "credentials.yml", "credentials.yaml", "secrets.json", "secrets.yml", "secrets.yaml", "secrets.toml",
  "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "authorized_keys", "known_hosts", "kubeconfig", "htpasswd", "netrc", "_netrc",
  "terraform.tfstate", "terraform.tfstate.backup", "keystore.jks", "service-account.json", "serviceaccount.json"]);
const SECRET_EXTENSIONS = new Set(["pem", "key", "p12", "pfx", "jks", "keystore", "ppk", "kdbx", "tfvars", "ovpn", "asc", "gpg", "der", "crt", "cer"]);
const PATTERNS = [
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/, /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/, /\bgithub_pat_[A-Za-z0-9_]{60,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/, /\bnpm_[A-Za-z0-9]{36}\b/, /"private_key"\s*:\s*"-----BEGIN/,
];

export function isSensitivePath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.some(part => part.startsWith(".") && part !== ".github")) return true;
  const name = (parts.at(-1) || "").toLowerCase();
  if (SECRET_NAMES.has(name) || name.startsWith("id_rsa") || name.startsWith("id_ed25519")) return true;
  if (/secret|service-?account|private[-_]key/.test(name) || name === "env" || name.endsWith(".env")) return true;
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  return SECRET_EXTENSIONS.has(extension);
}
export const looksLikeSecret = (text: string) => PATTERNS.some(pattern => pattern.test(text));
