/* Pure logic for Veyra Env: reading .env files, spotting secrets, finding env variables in code. No VS Code here. */

// ---------- Parsing .env files ----------

export interface Entry {
  key: string;
  value: string;
  /** 0-based line of the key, and the last line of the value (multi-line values span lines). */
  line: number; endLine: number;
  keyStart: number; keyEnd: number;
  /** Where the raw value sits on `line`, quotes included, to hide or reveal it. */
  valueStart: number; valueEnd: number;
  quote?: '"' | "'" | "`";
  exported: boolean;
}
export type Severity = "error" | "warning" | "info";
export interface Fix { title: string; text: string }
export interface Problem { line: number; start: number; end: number; severity: Severity; code: string; message: string; fix?: Fix }
export interface Parsed { entries: Entry[]; problems: Problem[] }

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * Reads a .env file the way dotenv does: KEY=value, optional `export`, # comments, inline comments after
 * unquoted values, and single, double or backtick quotes (double and backtick quotes may span lines).
 */
export function parseEnv(text: string): Parsed {
  const lines = text.split(/\r?\n/);
  const entries: Entry[] = [], problems: Problem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const start = i;
    const indent = raw.length - raw.trimStart().length;
    const exportMatch = /^export\s+/.exec(raw.slice(indent));
    const keyAt = indent + (exportMatch ? exportMatch[0].length : 0);
    const eq = raw.indexOf("=", keyAt);
    if (eq < 0) {
      problems.push({ line: i, start: indent, end: raw.length, severity: "error", code: "no-equals", message: 'This line has no "=". Write it as KEY=value, or start it with # to make it a comment.' });
      continue;
    }
    const keyRaw = raw.slice(keyAt, eq);
    const key = keyRaw.trim();
    const keyStart = keyAt + (keyRaw.length - keyRaw.trimStart().length);
    const keyEnd = keyStart + key.length;
    if (!key) { problems.push({ line: i, start: indent, end: eq + 1, severity: "error", code: "no-key", message: "The variable has no name." }); continue; }
    if (!KEY.test(key)) problems.push({ line: i, start: keyStart, end: keyEnd, severity: "warning", code: "bad-key", message: `"${key}" is not a valid variable name. Use letters, digits and _, and don't start with a digit.` });
    if (/\s$/.test(keyRaw) || /^[ \t]/.test(raw.slice(eq + 1)))
      problems.push({ line: i, start: keyStart, end: Math.min(raw.length, eq + 1), severity: "info", code: "spaces", message: 'Spaces around "=" work with dotenv, but break Docker, shells and some other tools. Write KEY=value.', fix: { title: 'Remove the spaces around "="', text: raw.slice(0, keyStart) + key + "=" + raw.slice(eq + 1).trimStart() } });

    const after = raw.slice(eq + 1);
    const lead = after.length - after.trimStart().length;
    const rest = after.trimStart();
    const valueStart = eq + 1 + lead;
    const q = rest[0];
    let value: string, valueEnd: number, quote: Entry["quote"];
    if (q === '"' || q === "'" || q === "`") {
      quote = q;
      const close = closingQuote(rest, q, 1);
      if (close >= 0) {
        value = rest.slice(1, close);
        valueEnd = valueStart + close + 1;
        const tail = rest.slice(close + 1).trim();
        if (tail && !tail.startsWith("#")) problems.push({ line: i, start: valueEnd, end: raw.length, severity: "warning", code: "after-quote", message: "Text after the closing quote is ignored." });
      } else if (q === "'") {
        problems.push({ line: i, start: valueStart, end: raw.length, severity: "error", code: "unclosed", message: "The quote is never closed. Add ' at the end of the value." });
        value = rest.slice(1); valueEnd = raw.length;
      } else {
        // Double and backtick quotes may continue on the next lines.
        const parts = [rest.slice(1)];
        let j = i + 1, closed = -1;
        for (; j < lines.length; j++) {
          closed = closingQuote(lines[j], q, 0);
          if (closed >= 0) { parts.push(lines[j].slice(0, closed)); break; }
          parts.push(lines[j]);
        }
        if (closed < 0) {
          problems.push({ line: i, start: valueStart, end: raw.length, severity: "error", code: "unclosed", message: `The quote is never closed, so every line below is read as part of ${key}. Add ${q} at the end of the value.` });
          value = rest.slice(1); valueEnd = raw.length;
        } else { value = parts.join("\n"); valueEnd = raw.length; i = j; }
      }
      if (q === '"') value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    } else {
      const hash = rest.search(/\s#/);
      value = (hash >= 0 ? rest.slice(0, hash) : rest).trimEnd();
      valueEnd = valueStart + value.length;
      if (/\s/.test(value)) problems.push({ line: i, start: valueStart, end: valueEnd, severity: "info", code: "unquoted-space", message: "This value has spaces. Put it in quotes so shells and Docker read it the same way.", fix: { title: "Put the value in quotes", text: raw.slice(0, valueStart) + JSON.stringify(value) + raw.slice(valueEnd) } });
    }
    entries.push({ key, value, line: start, endLine: i, keyStart, keyEnd, valueStart, valueEnd, quote, exported: !!exportMatch });
  }
  // Duplicates: dotenv keeps the first one, so later ones are ignored.
  const seen = new Map<string, Entry>();
  for (const e of entries) {
    const first = seen.get(e.key);
    if (first) problems.push({ line: e.line, start: e.keyStart, end: e.keyEnd, severity: "warning", code: "duplicate", message: `${e.key} is already set on line ${first.line + 1}. dotenv uses the first one, so this line is ignored.` });
    else seen.set(e.key, e);
  }
  return { entries, problems: problems.sort((a, b) => a.line - b.line || a.start - b.start) };
}
function closingQuote(text: string, q: string, from: number): number {
  for (let k = from; k < text.length; k++) {
    if (text[k] === "\\" && q === '"') { k++; continue; }
    if (text[k] === q) return k;
  }
  return -1;
}

/** Writes one KEY=value line, quoting the value when it needs it. */
export function formatLine(key: string, value: string): string {
  if (value === "") return `${key}=`;
  if (/^[\w@%+=:,./\-~^?!*]+$/.test(value)) return `${key}=${value}`;
  if (!value.includes("'") && !value.includes("\n")) return `${key}='${value}'`;
  return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

// ---------- Env files ----------

/** .env, .env.local, .env.production, production.env … but not folders like .envrc. */
export function isEnvFile(name: string): boolean {
  return /^\.env(\.[\w.\-]+)?$/i.test(name) || /^[\w.\-]+\.env$/i.test(name);
}
/** The shared template files that are meant to be committed. */
export function isTemplate(name: string): boolean {
  return /(^|[.\-_])(example|sample|template|dist|defaults?)(\.env)?$/i.test(name);
}
/** "the .env files that apply to this code file": in its folder and the folders above, up to the root. */
export function appliesTo(envDir: string, codeFile: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
  return norm(codeFile).startsWith(norm(envDir) + "/");
}

// ---------- Secrets ----------

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|PWD|PASS(PHRASE)?$|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|AUTH|SIGNING|SALT|COOKIE|SESSION_KEY|ENCRYPTION|CLIENT_KEY|_KEY$|^KEY$|DSN$|WEBHOOK)/i;
const SECRET_VALUE = [
  /^sk_(live|test)_[\w]{10,}/, /^(pk|rk)_live_/, /^gh[pousr]_[A-Za-z0-9]{20,}/, /^github_pat_/, /^xox[abpr]-/, /^AKIA[0-9A-Z]{16}$/, /^AIza[\w-]{30,}/,
  /^sk-[\w-]{20,}/, /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /^SG\.[\w-]{16,}\.[\w-]{16,}/, /^glpat-/, /^npm_[A-Za-z0-9]{30,}/,
];
/** Connection strings with a password in them: postgres://user:pass@host */
const URL_WITH_PASSWORD = /^[a-z][\w+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/i;
/** Whether a variable probably holds something private, from its name or what its value looks like. */
export function isSecret(key: string, value: string): boolean {
  if (!value) return false;
  if (/^(true|false|yes|no|on|off|\d{1,6}|localhost|development|production|staging|test)$/i.test(value)) return false;
  if (/^(PUBLIC_|NEXT_PUBLIC_|VITE_PUBLIC_|EXPO_PUBLIC_)/i.test(key) && !SECRET_VALUE.some(r => r.test(value))) return false;
  return SECRET_NAME.test(key) || SECRET_VALUE.some(r => r.test(value)) || URL_WITH_PASSWORD.test(value);
}
/** "sk_live_51H…" → "sk_l••••••••" (keeps a hint of which key it is) */
export function mask(value: string): string {
  if (!value) return "";
  const keep = value.length > 12 ? 4 : 0;
  return value.slice(0, keep) + "•".repeat(Math.min(12, Math.max(6, value.length - keep)));
}

// ---------- Env variables in code ----------

export interface Usage { name: string; start: number; end: number; style: string }
interface Pattern { re: RegExp; style: string; languages: string[] }
const JS = ["javascript", "typescript", "javascriptreact", "typescriptreact", "vue", "svelte", "astro", "mdx"];
const PATTERNS: Pattern[] = [
  { re: /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, style: "process.env", languages: JS },
  { re: /\bprocess\.env\[\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g, style: "process.env", languages: JS },
  { re: /\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, style: "import.meta.env", languages: JS },
  { re: /\bBun\.env\.([A-Za-z_][A-Za-z0-9_]*)/g, style: "Bun.env", languages: JS },
  { re: /\bDeno\.env\.get\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1/g, style: "Deno.env", languages: JS },
  { re: /\bos\.environ\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g, style: "os.environ", languages: ["python"] },
  { re: /\bos\.environ\.get\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g, style: "os.environ", languages: ["python"] },
  { re: /\bos\.getenv\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g, style: "os.getenv", languages: ["python"] },
  { re: /\bos\.(?:Getenv|LookupEnv)\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g, style: "os.Getenv", languages: ["go"] },
  { re: /\bENV(?:\[\s*|\.fetch\(\s*)(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g, style: "ENV", languages: ["ruby"] },
  { re: /\b(?:getenv|env)\(\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/g, style: "getenv", languages: ["php"] },
  { re: /\$_(?:ENV|SERVER)\[\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1\s*\]/g, style: "$_ENV", languages: ["php"] },
  { re: /\benv::var(?:_os)?\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g, style: "env::var", languages: ["rust"] },
  { re: /\bSystem\.getenv\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g, style: "System.getenv", languages: ["java", "kotlin"] },
  { re: /\bEnvironment\.GetEnvironmentVariable\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g, style: "Environment", languages: ["csharp"] },
];
export const CODE_LANGUAGES = [...new Set(PATTERNS.flatMap(p => p.languages))];

/** Every env variable a line of code reads. Comment-only lines are skipped. */
export function findUsages(line: string, languageId: string): Usage[] {
  const t = line.trimStart();
  if (t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*")) return [];
  const out: Usage[] = [];
  for (const p of PATTERNS) {
    if (!p.languages.includes(languageId)) continue;
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(line))) {
      const name = m[m.length - 1];
      const start = m.index + m[0].lastIndexOf(name);
      out.push({ name, start, end: start + name.length, style: p.style });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Where autocomplete for names should open: right after `process.env.` or inside `os.getenv("`. */
export function completionContext(before: string, languageId: string): { prefix: string; quoted: boolean } | undefined {
  const js = JS.includes(languageId);
  const m = (js && /(?:\bprocess\.env|\bimport\.meta\.env|\bBun\.env)\.([A-Za-z0-9_]*)$/.exec(before))
    || (js && /(?:\bprocess\.env\[\s*|\bDeno\.env\.get\(\s*)(['"`])([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "python" && /(?:\bos\.environ\[\s*|\bos\.environ\.get\(\s*|\bos\.getenv\(\s*)(['"])([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "go" && /\bos\.(?:Getenv|LookupEnv)\(\s*(")([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "ruby" && /\bENV(?:\[\s*|\.fetch\(\s*)(['"])([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "php" && /(?:\b(?:getenv|env)\(\s*|\$_(?:ENV|SERVER)\[\s*)(['"])([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "rust" && /\benv::var(?:_os)?\(\s*(")([A-Za-z0-9_]*)$/.exec(before))
    || ((languageId === "java" || languageId === "kotlin") && /\bSystem\.getenv\(\s*(")([A-Za-z0-9_]*)$/.exec(before))
    || (languageId === "csharp" && /\bEnvironment\.GetEnvironmentVariable\(\s*(")([A-Za-z0-9_]*)$/.exec(before));
  if (!m) return undefined;
  return { prefix: m[m.length - 1], quoted: m.length > 2 };
}

/** Variables that come from the system, the platform or the framework, never from a .env file. */
export const BUILT_IN = new Set([
  "NODE_ENV", "PATH", "HOME", "USER", "USERNAME", "PWD", "SHELL", "TERM", "LANG", "TZ", "TMPDIR", "TEMP", "TMP", "CI", "HOSTNAME", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "PROGRAMFILES", "SYSTEMROOT", "COMSPEC", "OS",
  "NODE_OPTIONS", "NODE_DEBUG", "NODE_PATH", "npm_package_version", "npm_package_name", "npm_lifecycle_event", "INIT_CWD",
  "MODE", "DEV", "PROD", "SSR", "BASE_URL", "NEXT_RUNTIME", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NETLIFY", "RENDER", "RAILWAY_ENVIRONMENT", "FLY_APP_NAME", "HEROKU_APP_NAME", "AWS_REGION", "AWS_LAMBDA_FUNCTION_NAME", "K_SERVICE",
  "PYTHONPATH", "VIRTUAL_ENV", "GOPATH", "GOROOT", "JAVA_HOME", "CARGO_MANIFEST_DIR", "CARGO_PKG_VERSION", "CARGO_PKG_NAME", "OUT_DIR", "DEBUG",
]);
export function isBuiltIn(name: string, extra: string[] = []): boolean {
  return BUILT_IN.has(name) || /^(GITHUB|RUNNER|npm_config|npm_package|VERCEL_GIT|NETLIFY_|CF_PAGES|CARGO_)/.test(name) || extra.includes(name);
}

// ---------- .env.example ----------

export interface SyncReport { missingInExample: string[]; missingInEnv: string[] }
export function compareKeys(env: Entry[], example: Entry[]): SyncReport {
  const a = new Set(env.map(e => e.key)), b = new Set(example.map(e => e.key));
  return { missingInExample: [...a].filter(k => !b.has(k)), missingInEnv: [...b].filter(k => !a.has(k)) };
}
/**
 * Adds the given keys to a template, without values, keeping its comments and order. A key that was
 * commented in the source file brings its comment along. Non-secret placeholders are kept empty too:
 * the example is for names, not values.
 */
export function addToExample(exampleText: string, keys: string[], source?: string): string {
  if (!keys.length) return exampleText;
  const sourceLines = source?.split(/\r?\n/) ?? [];
  const sourceEntries = source ? parseEnv(source).entries : [];
  const blocks = keys.map(key => {
    const entry = sourceEntries.find(e => e.key === key);
    const comments: string[] = [];
    if (entry) for (let k = entry.line - 1; k >= 0 && /^\s*#/.test(sourceLines[k]); k--) comments.unshift(sourceLines[k]);
    return [...comments, `${key}=`].join("\n");
  });
  const eol = exampleText.includes("\r\n") ? "\r\n" : "\n";
  const base = exampleText.replace(/\s*$/, "");
  return (base ? base + eol + eol : "") + blocks.join(eol).replace(/\n/g, eol) + eol;
}

/** Appends KEY=value to a .env file's text. */
export function appendEntry(text: string, key: string, value = ""): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const base = text.replace(/[\r\n]*$/, "");
  return (base ? base + eol : "") + formatLine(key, value) + eol;
}

// ---------- .gitignore ----------

/**
 * Whether .gitignore lines ignore a file, for when git itself is not available. Handles the patterns people
 * use for env files: ".env", ".env*", "*.env", ".env.local", "/.env", "**\/.env", and "!" exceptions.
 */
export function gitignoreIgnores(gitignore: string, relativePath: string): boolean {
  const path = relativePath.replace(/\\/g, "/");
  const name = path.split("/").pop()!;
  let ignored = false;
  for (const rawLine of gitignore.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const anyFolder = line.startsWith("**/");
    line = line.replace(/^\*\*\//, "");
    const anchored = !anyFolder && (line.startsWith("/") || line.replace(/\/$/, "").includes("/"));
    line = line.replace(/^\//, "");
    const re = new RegExp("^" + line.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
    const hit = anchored ? re.test(path) : re.test(name) || path.split("/").some(seg => re.test(seg));
    if (hit) ignored = !negate;
  }
  return ignored;
}
