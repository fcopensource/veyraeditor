// Runs inside VS Code with the fake home folder made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = check(); if (value) return value; await wait(200); }
  throw new Error(`Timed out waiting for ${what}`);
}

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const home = process.env.VEYRA_TEST_HOME;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-mcp-studio");
  assert.ok(extension, "extension is loaded");
  const { configs } = await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  for (const id of ["addServer", "openCatalog", "testAll", "refresh", "inspect", "test", "copyTo", "openConfig", "remove"])
    assert.ok(commands.includes(`veyraMcp.${id}`), `veyraMcp.${id} is registered`);

  console.log("[suite] It finds the apps in the home folder, and reads Cursor's file with its comment.");
  // It finds the apps in the home folder, and reads Cursor's file with its comment.
  const all = configs.all();
  const cursor = all.find(l => l.target.id === "cursor:user");
  const claude = all.find(l => l.target.id === "claude-code:user");
  assert.ok(cursor && claude, `found Cursor and Claude Code, got ${all.map(l => l.target.id)}`);
  assert.equal(cursor.target.file, path.join(home, ".cursor", "mcp.json"));
  assert.deepEqual(cursor.servers.map(s => s.name), ["fixture", "missing-program"]);
  assert.ok(!all.some(l => l.target.app === "claude-desktop"), "Claude Desktop is not installed here");
  const node = (located, name) => ({ kind: "server", located, def: located.servers.find(s => s.name === name) });
  const status = name => configs.status.get(`cursor:user::${name}`);

  console.log("[suite] Test Server: a real MCP server starts, with ${env:...} filled in the way Cursor does.");
  // Test Server: a real MCP server starts, with ${env:...} filled in the way Cursor does.
  await vscode.commands.executeCommand("veyraMcp.test", node(cursor, "fixture"));
  assert.equal(status("fixture")?.state, "ok", JSON.stringify(status("fixture")));
  assert.equal(status("fixture").detail, "3 tools");

  console.log("[suite] A program that is not installed is explained.");
  // A program that is not installed is explained.
  await vscode.commands.executeCommand("veyraMcp.test", node(cursor, "missing-program"));
  assert.equal(status("missing-program")?.state, "error");
  assert.match(status("missing-program").detail, /"definitely-not-a-program-veyra" was not found/);

  console.log("[suite] Check All runs both again.");
  // Check All runs both again.
  configs.status.clear();
  await vscode.commands.executeCommand("veyraMcp.testAll");
  assert.equal(status("fixture")?.state, "ok");
  assert.equal(status("missing-program")?.state, "error");

  console.log("[suite] Adding a server to Claude Code keeps its other settings and makes a backup.");
  // Adding a server to Claude Code keeps its other settings and makes a backup.
  const { upsertServer, translate } = require("../../out/model.js");
  const copied = translate(node(cursor, "fixture").def, "cursor", "claude-code");
  assert.equal(copied.def.env.TEST_VALUE, "${VEYRA_TEST_VALUE}", "variable syntax converted for Claude Code");
  await configs.edit(claude.target, text => upsertServer(text, "claude-code", copied.def));
  const saved = JSON.parse(fs.readFileSync(claude.target.file, "utf8"));
  assert.equal(saved.numStartups, 7);
  assert.equal(saved.theme, "dark");
  assert.equal(saved.mcpServers.fixture.type, "stdio");
  assert.ok(fs.existsSync(`${claude.target.file}.veyra-backup`), "backup kept");
  const claudeNow = configs.all().find(l => l.target.id === "claude-code:user");
  await vscode.commands.executeCommand("veyraMcp.test", node(claudeNow, "fixture"));
  assert.equal(configs.status.get("claude-code:user::fixture")?.state, "ok", "copied server works in Claude Code's format");

  console.log("[suite] Editing a file by hand shows up in the sidebar.");
  // Editing a file by hand shows up in the sidebar.
  let changed = false;
  const sub = configs.onDidChange(() => (changed = true));
  fs.writeFileSync(cursor.target.file, fs.readFileSync(cursor.target.file, "utf8").replace("// my servers", "// my servers, edited"));
  await until(() => changed, "the file watcher");
  sub.dispose();

  console.log("[suite] Open Config File jumps to the server.");
  // Open Config File jumps to the server.
  await vscode.commands.executeCommand("veyraMcp.openConfig", node(cursor, "missing-program"));
  const editor = vscode.window.activeTextEditor;
  assert.equal(editor.document.uri.fsPath.toLowerCase(), cursor.target.file.toLowerCase());
  assert.match(editor.document.lineAt(editor.selection.active.line).text, /missing-program/);

  console.log("[suite] The Inspector opens a panel and connects.");
  // The Inspector opens a panel and connects.
  configs.status.clear();
  await vscode.commands.executeCommand("veyraMcp.inspect", node(cursor, "fixture"));
  const tabs = () => vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label);
  await until(() => tabs().includes("MCP: fixture"), "the Inspector tab");
  await until(() => status("fixture")?.state === "ok", "the Inspector to connect");

  console.log("[suite] The Add Server page opens.");
  // The Add Server page opens.
  await vscode.commands.executeCommand("veyraMcp.addServer");
  await until(() => tabs().includes("Add MCP Server"), "the Add Server tab");

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
