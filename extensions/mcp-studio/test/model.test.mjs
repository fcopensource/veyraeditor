// Unit tests for everything that does not need VS Code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const m = require("../out/model.js");
const { CATALOG, fromCatalog, missingField } = require("../out/catalog.js");

test("finds every app's config file on Windows, macOS and Linux", () => {
  const win = m.configTargets({ platform: "win32", home: "C:\\Users\\ana", appData: "C:\\Users\\ana\\AppData\\Roaming", vscodeUserDir: "C:\\Users\\ana\\AppData\\Roaming\\Code\\User", workspaceFolders: ["C:\\work\\shop"] });
  const file = id => win.find(t => t.id === id)?.file;
  assert.equal(file("claude-desktop:user"), "C:\\Users\\ana\\AppData\\Roaming\\Claude\\claude_desktop_config.json");
  assert.equal(file("claude-code:user"), "C:\\Users\\ana\\.claude.json");
  assert.equal(file("cursor:user"), "C:\\Users\\ana\\.cursor\\mcp.json");
  assert.equal(file("vscode:user"), "C:\\Users\\ana\\AppData\\Roaming\\Code\\User\\mcp.json");
  assert.equal(file("windsurf:user"), "C:\\Users\\ana\\.codeium\\windsurf\\mcp_config.json");
  assert.equal(file("copilot:user"), "C:\\Users\\ana\\.copilot\\mcp-config.json");
  assert.equal(file("claude-code:project:C:\\work\\shop"), "C:\\work\\shop\\.mcp.json");
  assert.equal(file("vscode:project:C:\\work\\shop"), "C:\\work\\shop\\.vscode\\mcp.json");
  assert.equal(win.find(t => t.app === "copilot").writable, false);
  const mac = m.configTargets({ platform: "darwin", home: "/Users/ana", workspaceFolders: [] });
  assert.equal(mac.find(t => t.app === "claude-desktop").file, "/Users/ana/Library/Application Support/Claude/claude_desktop_config.json");
  assert.ok(!mac.some(t => t.app === "vscode"), "VS Code only when its user folder is known");
  const linux = m.configTargets({ platform: "linux", home: "/home/ana", workspaceFolders: [] });
  assert.equal(linux.find(t => t.app === "claude-desktop").file, "/home/ana/.config/Claude/claude_desktop_config.json");
});

test("reads every app's format", () => {
  const desktop = m.readServers(JSON.stringify({ mcpServers: { files: { command: "npx", args: ["-y", "pkg", "C:\\x"], env: { A: "1", N: 2 } } }, other: 1 }), "claude-desktop").servers;
  assert.deepEqual(desktop[0], { name: "files", transport: "stdio", command: "npx", args: ["-y", "pkg", "C:\\x"], env: { A: "1", N: "2" }, raw: { command: "npx", args: ["-y", "pkg", "C:\\x"], env: { A: "1", N: 2 } } });
  const code = m.readServers(JSON.stringify({ mcpServers: { gh: { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: "Bearer ${GH}" } }, legacy: { type: "sse", url: "https://x.dev/sse" }, local: { type: "stdio", command: "node", args: ["s.js"] } } }), "claude-code").servers;
  assert.deepEqual(code.map(s => [s.name, s.transport]), [["gh", "http"], ["legacy", "sse"], ["local", "stdio"]]);
  const vs = m.readServers(`{
    // personal servers
    "inputs": [{ "type": "promptString", "id": "key", "password": true }],
    "servers": { "pw": { "type": "stdio", "command": "npx", "args": ["@playwright/mcp@latest"], "envFile": "\${workspaceFolder}/.env" }, },
  }`, "vscode").servers;
  assert.equal(vs[0].command, "npx");
  assert.equal(vs[0].raw.envFile, "${workspaceFolder}/.env");
  const wind = m.readServers(JSON.stringify({ mcpServers: { r: { serverUrl: "https://x.dev/mcp" }, old: { serverUrl: "https://x.dev/sse" } } }), "windsurf").servers;
  assert.deepEqual(wind.map(s => [s.transport, s.url]), [["http", "https://x.dev/mcp"], ["sse", "https://x.dev/sse"]]);
  const cursor = m.readServers(JSON.stringify({ mcpServers: { a: { url: "https://x.dev/mcp", headers: { "X-Key": "${env:KEY}" } }, off: { command: "x", disabled: true } } }), "cursor").servers;
  assert.equal(cursor[0].transport, "http");
  assert.equal(cursor[1].disabled, true);
  assert.deepEqual(m.readServers("", "cursor"), { servers: [] });
  assert.match(m.readServers('{ "mcpServers": { "a": }', "cursor").error, /not valid JSON \(line 1/);
});

test("writes each app's format, keeping comments, other settings and unknown fields", () => {
  const stdio = { name: "files", transport: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } };
  const remote = { name: "docs", transport: "http", url: "https://learn.microsoft.com/api/mcp", headers: { Authorization: "Bearer t" } };
  assert.deepEqual(m.toEntry(stdio, "claude-desktop"), { command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } });
  assert.deepEqual(m.toEntry(stdio, "claude-code"), { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } });
  assert.deepEqual(m.toEntry(stdio, "vscode"), { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } });
  assert.deepEqual(m.toEntry(remote, "cursor"), { url: "https://learn.microsoft.com/api/mcp", headers: { Authorization: "Bearer t" } });
  assert.deepEqual(m.toEntry(remote, "windsurf"), { serverUrl: "https://learn.microsoft.com/api/mcp", headers: { Authorization: "Bearer t" } });
  assert.deepEqual(m.toEntry(remote, "claude-code"), { type: "http", url: "https://learn.microsoft.com/api/mcp", headers: { Authorization: "Bearer t" } });
  assert.throws(() => m.toEntry(remote, "claude-desktop"), /only local servers/);
  // Fields this tool does not manage stay as they were.
  assert.deepEqual(m.toEntry({ ...stdio, raw: { command: "old", tools: ["*"], disabled: true, envFile: ".env" } }, "cursor"), { command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" }, tools: ["*"], disabled: true, envFile: ".env" });

  // ~/.claude.json holds much more than servers: only the server changes.
  const claudeJson = JSON.stringify({ numStartups: 42, projects: { "C:/work": { allowedTools: [] } }, mcpServers: { old: { type: "stdio", command: "x" } }, userID: "abc" }, null, 2);
  const updated = JSON.parse(m.upsertServer(claudeJson, "claude-code", remote));
  assert.equal(updated.numStartups, 42);
  assert.deepEqual(updated.projects, { "C:/work": { allowedTools: [] } });
  assert.deepEqual(Object.keys(updated.mcpServers), ["old", "docs"]);
  // Comments survive in VS Code's mcp.json.
  const vs = `{\n  // keep me\n  "inputs": [],\n  "servers": {}\n}\n`;
  const out = m.upsertServer(vs, "vscode", stdio);
  assert.match(out, /\/\/ keep me/);
  assert.equal(m.readServers(out, "vscode").servers[0].command, "npx");
  // New and empty files, Windows line endings, removing.
  assert.deepEqual(JSON.parse(m.upsertServer("", "cursor", stdio)), { mcpServers: { files: { command: "npx", args: ["-y", "pkg"], env: { TOKEN: "x" } } } });
  assert.ok(m.upsertServer('{\r\n  "mcpServers": {}\r\n}', "cursor", stdio).includes("\r\n"));
  assert.deepEqual(m.readServers(m.removeServer(out, "vscode", "files"), "vscode").servers, []);
  assert.match(m.removeServer(out, "vscode", "files"), /\/\/ keep me/);
  assert.throws(() => m.upsertServer('{ "mcpServers": ', "cursor", stdio), /not valid JSON/);
  assert.ok(m.entryOffset(out, "vscode", "files") > out.indexOf('"servers"'));
});

test("checks names, commands and URLs before saving", () => {
  assert.equal(m.validateDef({ name: "ok-name_1.2", transport: "stdio", command: "npx" }), null);
  assert.match(m.validateDef({ name: "bad name", transport: "stdio", command: "npx" }), /letters, numbers/);
  assert.match(m.validateDef({ name: "a", transport: "stdio", command: "" }), /command that starts/);
  assert.match(m.validateDef({ name: "a", transport: "stdio", command: "npx -y pkg" }), /only the program in Command \("npx"\)/);
  assert.equal(m.validateDef({ name: "a", transport: "stdio", command: "C:\\Program Files\\nodejs\\node.exe" }), null);
  assert.match(m.validateDef({ name: "a", transport: "http", url: "mcp.example.com" }), /full URL/);
  assert.match(m.validateDef({ name: "a", transport: "http", url: "ftp://x.dev" }), /http:\/\/ or https:\/\//);
  assert.equal(m.validateDef({ name: "a", transport: "http", url: "${BASE}/mcp" }), null);
  assert.deepEqual(m.splitArgs(`-y pkg --dir "My Files" --flag='a b' ""`), ["-y", "pkg", "--dir", "My Files", "--flag=a b", ""]);
  assert.equal(m.joinArgs(["-y", "My Files", ""]), `-y "My Files" ""`);
});

test("fills in each app's variables the way that app does", () => {
  const ctx = { env: { API_KEY: "k1", HOME_DIR: "/h" }, home: "/home/ana", workspaceFolder: "/work/shop", pathSeparator: "/" };
  const def = { name: "a", transport: "http", url: "${BASE:-https://api.dev}/mcp", headers: { Authorization: "Bearer ${API_KEY}", X: "${NOPE}" } };
  const code = m.expand(def, "claude-code", ctx);
  assert.equal(code.def.url, "https://api.dev/mcp");
  assert.equal(code.def.headers.Authorization, "Bearer k1");
  assert.deepEqual(code.missing, ["NOPE"]);
  const cursor = m.expand({ name: "c", transport: "stdio", command: "node", args: ["${workspaceFolder}${pathSeparator}s.js", "${userHome}"], env: { K: "${env:API_KEY}", M: "${env:MISSING}" } }, "cursor", ctx);
  assert.deepEqual(cursor.def.args, ["/work/shop/s.js", "/home/ana"]);
  assert.deepEqual(cursor.def.env, { K: "k1", M: "${env:MISSING}" });
  assert.deepEqual(cursor.missing, ["MISSING"]);
  const vs = m.expand({ name: "v", transport: "stdio", command: "npx", env: { KEY: "${input:perplexity-key}" } }, "vscode", ctx);
  assert.deepEqual(vs.inputs, ["perplexity-key"]);
  assert.equal(m.expand({ name: "v", transport: "stdio", command: "npx", env: { KEY: "${input:k}" } }, "vscode", { ...ctx, inputs: { k: "secret" } }).def.env.KEY, "secret");
  // Claude Desktop does no expansion.
  assert.equal(m.expand({ name: "d", transport: "stdio", command: "x", args: ["${HOME_DIR}"] }, "claude-desktop", ctx).def.args[0], "${HOME_DIR}");
});

test("copies servers between apps in each app's variable syntax", () => {
  const code = { name: "api", transport: "http", url: "${BASE:-https://api.dev}/mcp", headers: { Authorization: "Bearer ${API_KEY}" }, raw: { type: "http", custom: 1 } };
  const toCursor = m.translate(code, "claude-code", "cursor");
  assert.equal(toCursor.def.headers.Authorization, "Bearer ${env:API_KEY}");
  assert.equal(toCursor.def.url, "${env:BASE}/mcp");
  assert.equal(toCursor.def.raw, undefined, "the other app's fields are not carried over");
  assert.match(toCursor.warnings[0], /no default values/);
  const back = m.translate({ name: "x", transport: "stdio", command: "npx", env: { K: "${env:KEY}" }, args: ["${workspaceFolder}"] }, "cursor", "claude-code");
  assert.deepEqual(back.def.env, { K: "${KEY}" });
  assert.match(back.warnings.join(" "), /full paths/);
  assert.match(m.translate({ name: "v", transport: "stdio", command: "npx", env: { K: "${input:key}" } }, "vscode", "cursor").warnings[0], /input/);
  assert.match(m.translate(code, "claude-code", "claude-desktop").warnings.join(" "), /only local servers/);
  assert.deepEqual(m.translate({ name: "p", transport: "stdio", command: "npx", args: ["-y", "pkg"] }, "cursor", "windsurf").warnings, []);
});

test("finds secrets written into config files, and masks them", () => {
  const def = {
    name: "s", transport: "stdio", command: "npx",
    args: ["-y", "pkg", "--api-key", "abc123def456", "--token=tok_9876543210", "ghp_abcdefghijklmnopqrstuvwxyz0123"],
    env: { GITHUB_TOKEN: "ghp_123", DEBUG: "1", OPENAI_API_KEY: "${OPENAI_API_KEY}", PATHS: "sk-abcdefghijklmnopqrstuvwx" },
  };
  const found = m.plainSecrets(def).map(s => `${s.where}:${s.key}`);
  assert.deepEqual(found, ["env:GITHUB_TOKEN", "env:PATHS", "args:--api-key", "args:--token", "args:argument 6"]);
  assert.deepEqual(m.plainSecrets({ name: "h", transport: "http", url: "x", headers: { Authorization: "Bearer ${env:T}" } }), []);
  assert.equal(m.plainSecrets({ name: "h", transport: "http", url: "x", headers: { Authorization: "Bearer eyJabcdefghijk.eyJabcdefghijk.sigsigsig" } }).length, 1);
  const shown = m.masked(def);
  assert.equal(shown.env.GITHUB_TOKEN, m.mask("ghp_123"));
  assert.equal(shown.env.DEBUG, "1");
  assert.equal(shown.args[3], m.mask("abc123def456"));
  assert.equal(shown.args[4], `--token=${m.mask("tok_9876543210")}`);
  assert.equal(m.mask("ghp_abcdefghijklmnop"), "ghp_…mnop");
});

test("explains why a server did not start or connect", () => {
  const npx = { name: "a", transport: "stdio", command: "npx", args: ["-y", "pkg"] };
  assert.match(m.explainFailure(Object.assign(new Error("spawn npx ENOENT"), { code: "ENOENT" }), npx, "").detail, /Install Node\.js/);
  assert.match(m.explainFailure(new Error("spawn uvx ENOENT"), { ...npx, command: "uvx" }, "").detail, /Install uv/);
  assert.match(m.explainFailure(new Error("MCP error -32000: Connection closed"), npx, "Error: Missing BRAVE_API_KEY\n").detail, /Missing BRAVE_API_KEY/);
  assert.match(m.explainFailure(new Error("Connection closed"), npx, "npm error 404 Not Found - GET https://registry.npmjs.org/nope").title, /package was not found/);
  const http = { name: "h", transport: "http", url: "https://mcp.notion.com/mcp" };
  assert.match(m.explainFailure(new Error("Error POSTing to endpoint (HTTP 401): Unauthorized"), http, "").title, /sign in/);
  assert.match(m.explainFailure(new Error("fetch failed"), http, "").title, /Could not connect/);
  assert.match(m.explainFailure(Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }), http, "").title, /address could not be found/);
  assert.equal(m.summary(npx), "npx -y pkg");
  assert.equal(m.summary(http), "HTTP https://mcp.notion.com/mcp");
});

test("the catalog is complete and builds valid servers", () => {
  const ids = new Set();
  for (const entry of CATALOG) {
    assert.ok(!ids.has(entry.id), `duplicate ${entry.id}`); ids.add(entry.id);
    assert.ok(entry.description.length > 20 && entry.homepage.startsWith("https://"), entry.id);
    const answers = Object.fromEntries((entry.fields ?? []).map(f => [f.key, f.target === "arg" ? "/work/shop" : "value123"]));
    const def = fromCatalog(entry, entry.id, answers);
    assert.equal(m.validateDef(def), null, `${entry.id}: ${m.validateDef(def)}`);
    if (def.transport === "stdio") assert.ok(["npx", "uvx"].includes(def.command), entry.id);
    if (entry.runtime === "Remote") assert.ok(def.url.startsWith("https://"), entry.id);
  }
  const fs = CATALOG.find(e => e.id === "filesystem");
  assert.equal(missingField(fs, {}).key, "folder");
  assert.deepEqual(fromCatalog(fs, "files", { folder: "C:\\work" }).args, ["-y", "@modelcontextprotocol/server-filesystem", "C:\\work"]);
  const gh = CATALOG.find(e => e.id === "github");
  assert.deepEqual(fromCatalog(gh, "github", { Authorization: "ghp_x" }).headers, { Authorization: "Bearer ghp_x" });
  assert.equal(fromCatalog(gh, "github", {}).headers, undefined);
});
