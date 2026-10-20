// The parts of Veyra MCP Studio that do not need VS Code: where each AI app keeps its MCP servers, reading and
// writing each app's format, variable expansion, secret checks and error explanations. Unit-tested.
import * as jsonc from "jsonc-parser";
import * as path from "node:path";

export type Transport = "stdio" | "http" | "sse";
/** One MCP server, in a shape shared by every app. `raw` keeps the app's own entry, so unknown fields survive edits. */
export interface ServerDef {
  name: string; transport: Transport;
  command?: string; args?: string[]; env?: Record<string, string>; cwd?: string;
  url?: string; headers?: Record<string, string>;
  disabled?: boolean;
  raw?: Record<string, unknown>;
}

export type AppId = "claude-desktop" | "claude-code" | "cursor" | "vscode" | "copilot" | "windsurf";
export type Scope = "user" | "project";
/**
 * How a config file stores servers:
 * - claude-desktop: mcpServers, local servers only ({command, args, env})
 * - claude-code: mcpServers with "type" (.mcp.json, and the top level of ~/.claude.json)
 * - cursor: mcpServers ({command, args, env} or {url, headers})
 * - vscode: servers with "type" (mcp.json); keeps "inputs"
 * - windsurf: mcpServers ({command, args, env} or {serverUrl, headers})
 * - copilot: mcpServers in the portable Copilot format; shown, not edited
 */
export type Format = "claude-desktop" | "claude-code" | "cursor" | "vscode" | "windsurf" | "copilot";
export interface ConfigTarget { id: string; app: AppId; scope: Scope; file: string; format: Format; label: string; writable: boolean; folder?: string }

export const APP_NAMES: Record<AppId, string> = {
  "claude-desktop": "Claude Desktop", "claude-code": "Claude Code", cursor: "Cursor", vscode: "VS Code", copilot: "GitHub Copilot", windsurf: "Windsurf",
};
const ROOT_KEY: Record<Format, string> = { "claude-desktop": "mcpServers", "claude-code": "mcpServers", cursor: "mcpServers", vscode: "servers", windsurf: "mcpServers", copilot: "mcpServers" };

/** Every config file an app may read, for this computer and the open folders. */
export function configTargets(o: { platform: NodeJS.Platform; home: string; appData?: string; vscodeUserDir?: string; workspaceFolders: string[] }): ConfigTarget[] {
  const join = o.platform === "win32" ? path.win32.join : path.posix.join;
  const appSupport = o.platform === "darwin" ? join(o.home, "Library", "Application Support") : o.platform === "win32" ? (o.appData ?? join(o.home, "AppData", "Roaming")) : join(o.home, ".config");
  const user = (app: AppId, file: string, format: Format, writable = true): ConfigTarget => ({ id: `${app}:user`, app, scope: "user", file, format, label: APP_NAMES[app], writable });
  const list: ConfigTarget[] = [
    user("claude-desktop", join(appSupport, "Claude", "claude_desktop_config.json"), "claude-desktop"),
    user("claude-code", join(o.home, ".claude.json"), "claude-code"),
    user("cursor", join(o.home, ".cursor", "mcp.json"), "cursor"),
    ...(o.vscodeUserDir ? [user("vscode", join(o.vscodeUserDir, "mcp.json"), "vscode")] : []),
    user("copilot", join(o.home, ".copilot", "mcp-config.json"), "copilot", false),
    user("windsurf", join(o.home, ".codeium", "windsurf", "mcp_config.json"), "windsurf"),
  ];
  for (const folder of o.workspaceFolders) {
    const name = path.basename(folder);
    const project = (app: AppId, file: string, format: Format): ConfigTarget => ({ id: `${app}:project:${folder}`, app, scope: "project", file, format, label: `${APP_NAMES[app]} · ${name}`, writable: true, folder });
    list.push(
      project("claude-code", join(folder, ".mcp.json"), "claude-code"),
      project("cursor", join(folder, ".cursor", "mcp.json"), "cursor"),
      ...(o.vscodeUserDir ? [project("vscode", join(folder, ".vscode", "mcp.json"), "vscode")] : []),
    );
  }
  return list;
}

// ---------- Reading ----------

const strings = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
};

/** One app entry as a ServerDef. Returns null for entries that are not servers. */
export function fromEntry(name: string, entry: unknown, format: Format): ServerDef | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const e = entry as Record<string, any>;
  const url = typeof e.url === "string" ? e.url : typeof e.serverUrl === "string" ? e.serverUrl : undefined;
  const declared = typeof e.type === "string" ? e.type.toLowerCase() : "";
  let transport: Transport;
  if (declared === "sse") transport = "sse";
  else if (declared === "http" || declared === "streamable-http" || declared === "streamablehttp") transport = "http";
  else if (declared === "stdio" || declared === "local") transport = "stdio";
  else transport = url && !e.command ? (/\/sse\/?(\?|$)/.test(url) ? "sse" : "http") : "stdio";
  const def: ServerDef = { name, transport, raw: e };
  if (transport === "stdio") {
    if (typeof e.command !== "string" || !e.command) return { ...def, command: "" };
    def.command = e.command;
    if (Array.isArray(e.args)) def.args = e.args.map(String);
    const env = strings(e.env);
    if (env && Object.keys(env).length) def.env = env;
    if (typeof e.cwd === "string") def.cwd = e.cwd;
  } else {
    def.url = url ?? "";
    const headers = strings(e.headers);
    if (headers && Object.keys(headers).length) def.headers = headers;
  }
  if (e.disabled === true) def.disabled = true;
  void format;
  return def;
}

/** The servers in a config file's text. A broken file reports where, instead of throwing. */
export function readServers(text: string, format: Format): { servers: ServerDef[]; error?: string } {
  if (!text.trim()) return { servers: [] };
  const errors: jsonc.ParseError[] = [];
  const json = jsonc.parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length || !json || typeof json !== "object") {
    const at = errors[0] ? lineOf(text, errors[0].offset) : 1;
    return { servers: [], error: `The file is not valid JSON (line ${at}: ${errors[0] ? jsonc.printParseErrorCode(errors[0].error) : "not an object"}).` };
  }
  const root = json[ROOT_KEY[format]];
  if (!root || typeof root !== "object") return { servers: [] };
  const servers = Object.entries(root).map(([name, entry]) => fromEntry(name, entry, format)).filter((s): s is ServerDef => !!s);
  return { servers };
}
const lineOf = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

// ---------- Writing ----------

/** A ServerDef in an app's own format, keeping fields of the existing entry this app understands. */
export function toEntry(def: ServerDef, format: Format): Record<string, unknown> {
  const keep = { ...(def.raw ?? {}) };
  for (const key of ["type", "command", "args", "env", "cwd", "url", "serverUrl", "headers"]) delete keep[key];
  const nonEmpty = (o?: Record<string, string>) => (o && Object.keys(o).length ? o : undefined);
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  if (def.transport === "stdio") {
    const base = { command: def.command, args: def.args?.length ? def.args : undefined, env: nonEmpty(def.env), ...(def.cwd && (format === "vscode" || format === "claude-code") ? { cwd: def.cwd } : {}) };
    if (format === "vscode" || format === "claude-code") return clean({ type: "stdio", ...base, ...keep });
    return clean({ ...base, ...keep });
  }
  if (format === "claude-desktop") throw new Error("Claude Desktop's config file holds only local servers. Add remote servers in Claude Desktop under Settings → Connectors.");
  if (format === "windsurf") return clean({ serverUrl: def.url, headers: nonEmpty(def.headers), ...keep });
  if (format === "cursor") return clean({ url: def.url, headers: nonEmpty(def.headers), ...keep });
  return clean({ type: def.transport, url: def.url, headers: nonEmpty(def.headers), ...keep });
}

const FORMATTING: jsonc.FormattingOptions = { insertSpaces: true, tabSize: 2, eol: "\n" };
/** The file's text with one server added or replaced. Comments and every other setting are left as they are. */
export function upsertServer(text: string, format: Format, def: ServerDef): string {
  const base = text.trim() ? text : "{}\n";
  const errors: jsonc.ParseError[] = [];
  jsonc.parse(base, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`The file is not valid JSON (line ${lineOf(base, errors[0].offset)}). Fix it, then try again.`);
  const formatting = { ...FORMATTING, eol: base.includes("\r\n") ? "\r\n" : "\n" };
  return jsonc.applyEdits(base, jsonc.modify(base, [ROOT_KEY[format], def.name], toEntry(def, format), { formattingOptions: formatting }));
}
/** The file's text without one server. */
export function removeServer(text: string, format: Format, name: string): string {
  if (!text.trim()) return text;
  const formatting = { ...FORMATTING, eol: text.includes("\r\n") ? "\r\n" : "\n" };
  return jsonc.applyEdits(text, jsonc.modify(text, [ROOT_KEY[format], name], undefined, { formattingOptions: formatting }));
}
/** Where a server's entry starts in the file, for opening it in the editor. */
export function entryOffset(text: string, format: Format, name: string): number | undefined {
  const tree = jsonc.parseTree(text);
  const node = tree && jsonc.findNodeAtLocation(tree, [ROOT_KEY[format], name]);
  return node?.parent?.offset ?? node?.offset;
}

// ---------- Names and validation ----------

export const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
export function validateDef(def: ServerDef): string | null {
  if (!NAME_RULE.test(def.name)) return "Use a name of letters, numbers, dashes, dots or underscores, starting with a letter or number.";
  if (def.transport === "stdio") {
    if (!def.command?.trim()) return "Enter the command that starts the server, such as npx, uvx, node or python.";
    if (/\s/.test(def.command.trim()) && !/^["'].*["']$/.test(def.command.trim()) && !/[\\/]/.test(def.command)) return `Put only the program in Command ("${def.command.trim().split(/\s+/)[0]}") and the rest in Arguments.`;
  } else {
    if (!def.url?.trim()) return "Enter the server's URL.";
    // A variable may hold the start of the address, as in ${API_BASE}/mcp.
    const probe = def.url.trim().replace(/^\$\{[^}]+\}/, "https://example.com").replace(/\$\{[^}]+\}/g, "x");
    try { const u = new URL(probe); if (!/^https?:$/.test(u.protocol)) return "The URL must start with http:// or https://."; }
    catch { return "Enter a full URL, like https://example.com/mcp."; }
  }
  return null;
}

/** Split an argument line the way a shell would, so `--dir "My Files"` stays one argument. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "", quote: string | null = null, has = false;
  for (const c of line) {
    if (quote) { if (c === quote) quote = null; else cur += c; continue; }
    if (c === '"' || c === "'") { quote = c; has = true; continue; }
    if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ""; has = false; } continue; }
    cur += c;
  }
  if (has || cur) out.push(cur);
  return out;
}
export const joinArgs = (args: string[] = []) => args.map(a => (/[\s"]/.test(a) || !a ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");

// ---------- Variables ----------

export interface ExpandContext { env: Record<string, string | undefined>; home: string; workspaceFolder?: string; inputs?: Record<string, string>; pathSeparator: string }
/**
 * Fill in the variables each app understands, so a server can be started the way that app would start it.
 * Returns which variables had no value, and which ${input:…} prompts are needed (VS Code).
 */
export function expand(def: ServerDef, format: Format, ctx: ExpandContext): { def: ServerDef; missing: string[]; inputs: string[] } {
  const missing = new Set<string>(), inputs = new Set<string>();
  const one = (s: string): string => {
    let out = s;
    if (format === "claude-code") {
      out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name: string, fallback?: string) => {
        const v = ctx.env[name];
        if (v !== undefined && v !== "") return v;
        if (fallback !== undefined) return fallback;
        missing.add(name); return whole;
      });
    }
    if (format === "cursor" || format === "windsurf" || format === "vscode") {
      out = out.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => { const v = ctx.env[name]; if (v === undefined) { missing.add(name); return whole; } return v; });
      out = out.replace(/\$\{userHome\}/g, ctx.home).replace(/\$\{pathSeparator\}/g, ctx.pathSeparator);
      if (ctx.workspaceFolder) out = out.replace(/\$\{workspaceFolder\}/g, ctx.workspaceFolder);
    }
    if (format === "vscode") {
      out = out.replace(/\$\{input:([\w.-]+)\}/g, (whole, id: string) => { if (ctx.inputs?.[id] !== undefined) return ctx.inputs[id]; inputs.add(id); return whole; });
    }
    if (format === "windsurf") out = out.replace(/\$\{file:([^}]+)\}/g, whole => { missing.add(whole); return whole; });
    return out;
  };
  const map = (o?: Record<string, string>) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, one(v)])) : undefined);
  const out: ServerDef = { ...def, command: def.command !== undefined ? one(def.command) : undefined, args: def.args?.map(one), env: map(def.env), cwd: def.cwd !== undefined ? one(def.cwd) : undefined, url: def.url !== undefined ? one(def.url) : undefined, headers: map(def.headers) };
  return { def: out, missing: [...missing], inputs: [...inputs] };
}

/**
 * The same server for another app: environment variables are rewritten in that app's syntax
 * (Claude Code writes ${VAR}; Cursor, Windsurf and VS Code write ${env:VAR}). Anything the other app
 * cannot use is reported, so a copied server never breaks silently.
 */
export function translate(def: ServerDef, from: Format, to: Format): { def: ServerDef; warnings: string[] } {
  const warnings = new Set<string>();
  const dollar = from === "claude-code", envStyle = from === "cursor" || from === "windsurf" || from === "vscode";
  const one = (s: string): string => {
    let out = s;
    if (dollar && to !== "claude-code") out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
      if (fallback !== undefined) warnings.add(`${APP_NAMES[appOf(to)]} has no default values for variables, so \${${name}:-…} became \${env:${name}}.`);
      return to === "claude-desktop" ? (warnings.add(`Claude Desktop does not fill in variables: set ${name} in the file after copying.`), `\${${name}}`) : `\${env:${name}}`;
    });
    if (envStyle && to === "claude-code") out = out.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, "${$1}");
    if (envStyle && to === "claude-desktop" && /\$\{env:/.test(out)) warnings.add("Claude Desktop does not fill in variables: put the values in the file after copying.");
    if (from === "vscode" && to !== "vscode" && /\$\{input:/.test(out)) warnings.add("VS Code's ${input:…} prompts only work in VS Code: enter those values in the copied server.");
    if (envStyle && to !== from && to !== "cursor" && to !== "windsurf" && to !== "vscode" && /\$\{(workspaceFolder|userHome|pathSeparator)\}/.test(out)) warnings.add(`${APP_NAMES[appOf(to)]} does not understand \${workspaceFolder} or \${userHome}: use full paths.`);
    return out;
  };
  const map = (o?: Record<string, string>) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, one(v)])) : undefined);
  const out: ServerDef = { ...def, command: def.command !== undefined ? one(def.command) : undefined, args: def.args?.map(one), env: map(def.env), cwd: def.cwd !== undefined ? one(def.cwd) : undefined, url: def.url !== undefined ? one(def.url) : undefined, headers: map(def.headers), raw: undefined };
  if (def.cwd && to !== "vscode" && to !== "claude-code") warnings.add(`${APP_NAMES[appOf(to)]} has no working-directory setting, so "cwd" was left out.`);
  if (def.transport !== "stdio" && to === "claude-desktop") warnings.add("Claude Desktop's file holds only local servers. Add remote servers in Claude Desktop under Settings → Connectors.");
  return { def: out, warnings: [...warnings] };
}
const appOf = (format: Format): AppId => (format === "claude-desktop" ? "claude-desktop" : format === "claude-code" ? "claude-code" : format === "cursor" ? "cursor" : format === "windsurf" ? "windsurf" : format === "copilot" ? "copilot" : "vscode");

// ---------- Secrets ----------

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS$|AUTH|CREDENTIAL|PRIVATE|BEARER|COOKIE|SESSION)/i;
const SECRET_VALUE = /^(sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|glpat-[A-Za-z0-9_-]{16,}|ntn_[A-Za-z0-9]{20,}|secret_[A-Za-z0-9]{20,})$/;
const isReference = (v: string) => /\$\{[^}]+\}|^\$[A-Z_]+$/.test(v);

export interface SecretFinding { where: "env" | "headers" | "args"; key: string; value: string }
/** Secrets written straight into the file, rather than taken from an environment variable or a prompt. */
export function plainSecrets(def: ServerDef): SecretFinding[] {
  const found: SecretFinding[] = [];
  for (const [key, value] of Object.entries(def.env ?? {})) if (value && !isReference(value) && (SECRET_NAME.test(key) || SECRET_VALUE.test(value))) found.push({ where: "env", key, value });
  for (const [key, value] of Object.entries(def.headers ?? {})) {
    const token = value.replace(/^(Bearer|Basic|Token)\s+/i, "");
    if (value && !isReference(token) && (SECRET_NAME.test(key) || SECRET_VALUE.test(token))) found.push({ where: "headers", key, value });
  }
  (def.args ?? []).forEach((arg, i, all) => {
    const [flag, inline] = arg.split(/=(.*)/s);
    if (inline && /^--?[\w-]*(key|token|secret|password)/i.test(flag) && !isReference(inline)) found.push({ where: "args", key: flag, value: inline });
    else if (/^--?[\w-]*(key|token|secret|password)$/i.test(arg) && all[i + 1] && !all[i + 1].startsWith("-") && !isReference(all[i + 1])) found.push({ where: "args", key: arg, value: all[i + 1] });
    else if (SECRET_VALUE.test(arg)) found.push({ where: "args", key: `argument ${i + 1}`, value: arg });
  });
  return found;
}
/** Show only the start and end of a secret: "ghp_…9f2A". */
export const mask = (value: string) => (value.length <= 8 ? "••••" : `${value.slice(0, 4)}…${value.slice(-4)}`);
/** A copy safe to show on screen, with secret values masked. */
export function masked(def: ServerDef): ServerDef {
  const secrets = plainSecrets(def);
  const hide = (where: SecretFinding["where"], o?: Record<string, string>) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, secrets.some(s => s.where === where && s.key === k) ? mask(v) : v]));
  return { ...def, env: hide("env", def.env), headers: hide("headers", def.headers), args: def.args?.map(a => (secrets.some(s => s.where === "args" && (s.value === a || a.endsWith("=" + s.value))) ? a.replace(/[^=]+$/, m => mask(m)) : a)) };
}

// ---------- Explaining failures ----------

/** A clear reason, and what to do, for the usual ways a server fails to start or connect. */
export function explainFailure(error: unknown, def: ServerDef, stderr: string): { title: string; detail: string } {
  const message = String((error as any)?.message ?? error ?? "");
  const code = (error as any)?.code ?? (error as any)?.cause?.code;
  const tail = stderr.trim().split(/\r?\n/).slice(-12).join("\n");
  const cmd = def.command ?? "";
  if (def.transport === "stdio") {
    if (code === "ENOENT" || /ENOENT|not recognized as an internal or external command|command not found/i.test(message + tail)) {
      const tool = /^npx|^npm|^node/i.test(cmd) ? "Node.js (https://nodejs.org)" : /^uvx|^uv$/i.test(cmd) ? "uv (https://docs.astral.sh/uv/)" : /^docker/i.test(cmd) ? "Docker Desktop" : /^python/i.test(cmd) ? "Python (https://python.org)" : `the program "${cmd}"`;
      return { title: `"${cmd}" was not found`, detail: `Install ${tool}, then restart VS Code so it sees the new program. If it is installed, use its full path in Command.` };
    }
    if (/EACCES/i.test(code ?? message)) return { title: `"${cmd}" cannot be started`, detail: "The file is not executable, or you do not have permission to run it." };
    if (/E404|404 Not Found|is not in this registry|No matching distribution|not found in the package registry/i.test(tail)) return { title: "The package was not found", detail: `Check the package name in Arguments.\n\n${tail}` };
    if (/Connection closed|exited|closed/i.test(message)) return { title: "The server stopped before it was ready", detail: tail ? `It printed:\n\n${tail}` : "It printed nothing. Check the command and arguments, and that any required environment variables are set." };
    if (/timed out|timeout/i.test(message)) return { title: "The server did not answer in time", detail: `The first start can be slow while ${cmd === "npx" || cmd === "uvx" ? "the package downloads" : "it loads"}. Try again.${tail ? `\n\nIt printed:\n\n${tail}` : ""}` };
  } else {
    if (/\b401\b|Unauthorized|invalid_token|authorization/i.test(message)) return { title: "This server needs you to sign in", detail: "It uses OAuth sign-in or a token. Your AI app signs you in the first time it connects; to test it here, add an Authorization header with a token." };
    if (/\b403\b|Forbidden/i.test(message)) return { title: "Access denied", detail: "The token was accepted but does not allow this. Check its permissions or scopes." };
    if (/\b404\b|Not Found/i.test(message)) return { title: "No MCP server at this URL", detail: "Check the address. Many servers end in /mcp; older ones in /sse." };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message + code)) return { title: "The server's address could not be found", detail: "Check the URL and your internet connection." };
    if (/ECONNREFUSED/i.test(message + code)) return { title: "Nothing is answering at this address", detail: "If it is a local server, start it first." };
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(message + code)) return { title: "The server's certificate is not trusted", detail: message };
    if (/timed out|timeout|aborted/i.test(message)) return { title: "The server did not answer in time", detail: "It may be busy or unreachable. Try again." };
  }
  return { title: "Could not connect", detail: [message, tail].filter(Boolean).join("\n\n") || "No details were given." };
}

/** The same server, written as one line, for lists and tooltips. */
export const summary = (def: ServerDef) => (def.transport === "stdio" ? [def.command, ...(def.args ?? [])].filter(Boolean).join(" ") : `${def.transport.toUpperCase()} ${def.url}`);
