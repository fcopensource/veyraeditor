// Runs inside VS Code with the file made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await check(); if (v) return v; await wait(150); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-codesnap");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();
  const probe = () => Promise.race([api.probe(), wait(1500).then(() => undefined)]);

  const editor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(folder, "cart.ts")));
  await wait(1500); // let the TypeScript colours arrive

  step("Snapping a selection: its colours, title and real line numbers");
  await vscode.env.clipboard.writeText("something I copied earlier");
  editor.selection = new vscode.Selection(2, 0, 5, 1); // lines 3–6
  const out = path.join(os.tmpdir(), `veyra-snap-${Date.now()}.png`);
  await vscode.commands.executeCommand("veyraSnap.snap", { saveTo: out });
  const state = await until(async () => { const s = await probe(); return s?.lines === 4 && s; }, "the snap in the panel");
  assert.equal(state.firstLine, 3);
  assert.equal(state.title, "cart.ts");
  // VS Code only puts the coloured (HTML) copy on the clipboard when a real key press or click triggers it,
  // which a test can't do, so here the snap uses the plain-text fallback. scratchpad snap-real.mjs checks colours with real keys.
  if (state.paste.html) assert.ok(state.colors >= 3, `colours: ${state.colors}`);
  else console.log("[suite] (no coloured copy without a real key press: plain text fallback used)");

  step("The clipboard is put back");
  await until(async () => (await vscode.env.clipboard.readText()) === "something I copied earlier", "the old clipboard text");

  step("Saving writes a real PNG");
  const saved = await Promise.race([api.save(), wait(10000).then(() => undefined)]);
  assert.ok(saved, "saved");
  const png = fs.readFileSync(out);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  assert.equal(width, state.width);
  assert.equal(height, state.height);
  assert.ok(width > 600 && height > 300, `${width}x${height}`);

  step("Live: changing the selection updates the snap");
  await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn });
  editor.selection = new vscode.Selection(7, 0, 7, 20); // line 8
  await until(async () => { const s = await probe(); return s?.firstLine === 8 && s.lines === 1; }, "the live update");
  await until(async () => (await vscode.env.clipboard.readText()) === "something I copied earlier", "the clipboard after a live update");

  step("Settings reach the panel");
  await vscode.workspace.getConfiguration("veyraSnap").update("background", "forest", vscode.ConfigurationTarget.Global);
  await until(async () => (await probe())?.background === "forest", "the new background");
  await vscode.workspace.getConfiguration("veyraSnap").update("background", undefined, vscode.ConfigurationTarget.Global);
  fs.rmSync(out, { force: true });
}
