// Runs inside VS Code with the project made by run.mjs.
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await check(); if (last) return last; } catch (e) { last = e.message; } await wait(200); }
  throw new Error(`Timed out waiting for ${what}${last ? ` (last: ${JSON.stringify(last)})` : ""}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => path.join(folder, rel);
  const ext = vscode.extensions.getExtension("flightcoders.veyra-live-values");
  assert.ok(ext, "extension is loaded");
  const api = await ext.activate();
  // Node started the way a VS Code terminal starts it: with the extension's environment.
  const node = (rel, extraEnv = {}) => {
    const childEnv = { ...process.env, ...api.env(), ...extraEnv };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    return spawnSync(process.platform === "win32" ? "node.exe" : "node", [file(rel)], { cwd: folder, encoding: "utf8", env: childEnv });
  };

  step("Terminals get the hook");
  const env = api.env();
  assert.match(env.NODE_OPTIONS, /^--require ".+hook\.js"$/);
  assert.equal(env.VEYRA_LIVE_ROOTS, folder);
  assert.ok(env.VEYRA_LIVE_FILE.endsWith(".jsonl"));

  step("A run shows each value at the end of its line");
  const out = node("src/cart.js");
  assert.equal(out.status, 0, out.stderr);
  const doc = await vscode.workspace.openTextDocument(file("src/cart.js"));
  const editor = await vscode.window.showTextDocument(doc);
  const shown = await until(() => { api.poll(); const d = api.decorations(doc); return d.length === 3 && d; }, "three values in cart.js");
  assert.deepEqual(shown.map(s => [s.line, s.level, s.text]), [
    [4, "log", "▸ running total 7.5   ×2"],
    [6, "log", "▸ cart { count: 2, total: 7.5 }"],
    [7, "warn", "⚠ big order: 7.5"],
  ]);

  step("Hovering the line shows the full value, a chart and history");
  const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", doc.uri, new vscode.Position(4, 4));
  const text = hovers.flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value))).join("\n");
  assert.match(text, /printed 2 times/);
  assert.match(text, /running total 7\.5/);
  assert.match(text, /min \*\*4\.50\*\* · max \*\*7\.50\*\*/);
  assert.match(text, /Copy value/);

  step("Values follow their lines while you edit");
  await editor.edit(b => b.insert(new vscode.Position(0, 0), "// header\n// more\n"));
  assert.deepEqual(api.decorations(doc).map(s => s.line), [6, 8, 9]);
  await editor.edit(b => b.delete(new vscode.Range(0, 0, 2, 0)));
  assert.deepEqual(api.decorations(doc).map(s => s.line), [4, 6, 7]);

  step("The Live Values view lists files and lines");
  const files = api.tree.getChildren();
  assert.equal(files.length, 1);
  assert.equal(path.basename(files[0].file), "cart.js");
  const items = api.tree.getChildren(files[0]).map(n => api.tree.getTreeItem(n));
  assert.deepEqual(items.map(i => i.label), ["running total 7.5   ×2", "cart { count: 2, total: 7.5 }", "big order: 7.5"]);
  assert.match(items[0].description, /^line 5 · /);
  assert.equal(items[0].command.command, "veyraLiveValues.reveal");

  step("Copy Value copies the full value");
  editor.selection = new vscode.Selection(6, 0, 6, 0);
  await vscode.commands.executeCommand("veyraLiveValues.copyValue");
  assert.equal(await vscode.env.clipboard.readText(), "cart { count: 2, total: 7.5 }");

  step("A crash is marked at the line that threw");
  const crashed = node("src/crash.js");
  assert.equal(crashed.status, 1);
  const crashDoc = await vscode.workspace.openTextDocument(file("src/crash.js"));
  await vscode.window.showTextDocument(crashDoc, vscode.ViewColumn.Beside);
  const crash = await until(() => { api.poll(); return api.decorations(crashDoc).find(s => s.level === "crash"); }, "the crash");
  assert.equal(crash.line, 2);
  assert.match(crash.text, /^💥 Crashed: TypeError: Cannot read properties of undefined \(reading 'name'\)/);

  step("Running again replaces the previous run's values");
  node("src/cart.js");
  await until(() => { api.poll(); return api.store.at(file("src/cart.js"), 4)?.count === 2 && api.store.at(file("src/cart.js"), 4).history.length === 2; }, "a fresh run");

  step("Pause stops collecting; Resume starts again");
  await vscode.commands.executeCommand("veyraLiveValues.clear");
  assert.equal(api.store.size, 0);
  await vscode.commands.executeCommand("veyraLiveValues.pause");
  assert.equal(api.isPaused(), true);
  node("src/cart.js");
  await wait(400); api.poll();
  assert.equal(api.store.size, 0);
  await vscode.commands.executeCommand("veyraLiveValues.resume");
  node("src/cart.js");
  await until(() => { api.poll(); return api.store.size === 3; }, "values after resume");

  step("Clear Values in This File");
  await vscode.commands.executeCommand("veyraLiveValues.clearFile", { file: file("src/cart.js") });
  assert.equal(api.decorations(doc).length, 0);

  step("Node debug sessions get the hook, keeping their own NODE_OPTIONS");
  const config = await api.debugProvider.resolveDebugConfiguration(vscode.workspace.workspaceFolders[0], {
    type: "node", request: "launch", name: "app", program: file("src/cart.js"), env: { NODE_OPTIONS: "--max-old-space-size=2048", PORT: "3000" },
  });
  assert.match(config.env.NODE_OPTIONS, /^--require ".+hook\.js" --max-old-space-size=2048$/);
  assert.equal(config.env.PORT, "3000");
  assert.equal(config.env.VEYRA_LIVE_FILE, env.VEYRA_LIVE_FILE);

  step("Run This File runs it in the Live Values terminal, end to end");
  const runDoc = await vscode.workspace.openTextDocument(file("src/run.js"));
  await vscode.window.showTextDocument(runDoc);
  await vscode.commands.executeCommand("veyraLiveValues.runFile");
  assert.ok(vscode.window.terminals.some(t => t.name === "Live Values"), "the Live Values terminal opened");
  const fromTerminal = await until(() => { api.poll(); return api.decorations(runDoc)[0]; }, "a value from the real terminal", 45000);
  assert.deepEqual([fromTerminal.line, fromTerminal.text], [0, "▸ from the terminal 42"]);

  step("Turning it off hides values and leaves Node alone");
  await vscode.workspace.getConfiguration("veyraLiveValues").update("enabled", false, vscode.ConfigurationTarget.Global);
  await wait(200);
  assert.equal(api.decorations(runDoc).length, 0);
  const off = await api.debugProvider.resolveDebugConfiguration(undefined, { type: "node", request: "launch", name: "x" });
  assert.equal(off.env, undefined);
  await vscode.workspace.getConfiguration("veyraLiveValues").update("enabled", undefined, vscode.ConfigurationTarget.Global);
}
