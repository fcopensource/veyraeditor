// Runs inside VS Code with the git project made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
  const ext = vscode.extensions.getExtension("flightcoders.veyra-aura");
  assert.ok(ext, "extension is loaded");
  const api = await ext.activate();
  const ids = () => api.state().events.map(e => e.id);
  const has = (id, n = 1) => ids().filter(x => x === id).length >= n;

  step("Starts at 0 aura in the status bar");
  assert.equal(api.state().total, 0);
  assert.match(api.statusText(), /\$\(sparkle\) 0 aura/);

  step("Clearing every error in a file earns aura");
  api.options.errorAgeMs = 0;
  const cart = await vscode.workspace.openTextDocument(file("src/cart.ts"));
  await vscode.window.showTextDocument(cart);
  const diagnostics = vscode.languages.createDiagnosticCollection("aura-test");
  diagnostics.set(cart.uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), "Type 'string' is not assignable to type 'number'.", vscode.DiagnosticSeverity.Error)]);
  await wait(100);
  diagnostics.set(cart.uri, []);
  await until(() => has("clearedErrors"), "clearedErrors");
  const cleared = api.state().events.find(e => e.id === "clearedErrors");
  assert.equal(cleared.text, "Cleared every error in cart.ts");
  assert.equal(cleared.aura, 15);
  assert.match(api.statusText(), /\+15 aura 🧹/, "the status bar flashes the move");

  step("A clean save earns aura");
  const editor = vscode.window.activeTextEditor;
  await editor.edit(b => b.insert(new vscode.Position(1, 0), "export const tax = 0.2;\n"));
  await cart.save();
  await until(() => has("cleanSave"), "cleanSave");

  step("Deleting 50+ lines earns aura");
  const legacy = await vscode.workspace.openTextDocument(file("src/legacy.ts"));
  const legacyEditor = await vscode.window.showTextDocument(legacy);
  await legacyEditor.edit(b => b.delete(new vscode.Range(10, 0, 70, 0)));
  await legacy.save();
  await until(() => has("deletedLines"), "deletedLines");
  assert.equal(api.state().events.find(e => e.id === "deletedLines").text, "Deleted 60 lines from legacy.ts. Less code, more aura.");

  step("A leftover debugger costs aura, once per file per day");
  const debug = await vscode.workspace.openTextDocument(file("src/debug.js"));
  const debugEditor = await vscode.window.showTextDocument(debug);
  await debugEditor.edit(b => b.insert(new vscode.Position(1, 0), "  debugger;\n"));
  await debug.save();
  await until(() => has("debuggerLeft"), "debuggerLeft");
  await debugEditor.edit(b => b.insert(new vscode.Position(0, 0), "// again\n"));
  await debug.save();
  await wait(300);
  assert.equal(ids().filter(x => x === "debuggerLeft").length, 1);

  step("Real git commits are noticed, and the message is judged");
  const git = args => execFileSync("git", args, { cwd: folder, stdio: "pipe" });
  git(["add", "-A"]); git(["commit", "-q", "-m", "feat: add tax to the cart total"]);
  await until(() => has("commit") && has("goodCommitMessage"), "a commit with a good message", 45000);
  git(["commit", "-q", "--allow-empty", "-m", "wip"]);
  await until(() => has("commit", 2) && has("badCommitMessage"), "a commit with a bad message", 45000);
  assert.equal(api.state().events.find(e => e.id === "badCommitMessage").text, "Commit message “wip” is giving nothing");

  step("Tests, builds and force pushes from the terminal");
  api.onCommand("npm test", 0);
  api.onCommand("npx vitest run", 1);
  api.onCommand("npm run build", 0);
  api.onCommand("git push --force", 0);
  api.onCommand("git status", 0);
  for (const id of ["testsPassed", "testsFailed", "buildPassed", "forcePush"]) assert.ok(has(id), id);

  step("Roast mode off: no aura is taken");
  await vscode.workspace.getConfiguration("veyraAura").update("roast", false, vscode.ConfigurationTarget.Global);
  const before = api.state().total;
  api.onCommand("git push -f", 0);
  assert.equal(api.state().total, before);
  await vscode.workspace.getConfiguration("veyraAura").update("roast", undefined, vscode.ConfigurationTarget.Global);

  step("The total adds up, and you rank up");
  // Everything so far (night owl too, if this runs after midnight) is under 100: still an NPC.
  assert.ok(api.state().total < 100, `total ${api.state().total}`);
  assert.equal(api.snapshot().rank.name, "NPC");
  api.onCommand("npm test", 0);
  api.onCommand("pnpm test", 0);
  const total = api.state().events.reduce((s, e) => s + e.aura, 0);
  assert.equal(api.state().total, total);
  assert.ok(total >= 100, `total ${total}`);
  assert.equal(api.snapshot().rank.name, "Side Character");

  step("The Aura panel shows it");
  await vscode.commands.executeCommand("veyraAura.open");
  await until(() => api.panel()?.rendered.total === api.state().total, "the panel to render");

  step("Share My Aura Card saves a PNG and copies the caption");
  const out = path.join(os.tmpdir(), `aura-card-${Date.now()}.png`);
  api.setSavePath(out);
  await vscode.commands.executeCommand("veyraAura.share");
  await until(() => fs.existsSync(out) && fs.statSync(out).size > 20000, "the card file");
  const png = fs.readFileSync(out);
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47], "it is a PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.match(await vscode.env.clipboard.readText(), /^My code aura: \d+ \(Side Character 🎭\)/);
  if (process.env.KEEP_CARD) fs.copyFileSync(out, process.env.KEEP_CARD);
  fs.unlinkSync(out);

  step("Turning it off stops aura");
  await vscode.workspace.getConfiguration("veyraAura").update("enabled", false, vscode.ConfigurationTarget.Global);
  const frozen = api.state().total;
  api.onCommand("npm test", 0);
  assert.equal(api.state().total, frozen);
  await vscode.workspace.getConfiguration("veyraAura").update("enabled", undefined, vscode.ConfigurationTarget.Global);
}
