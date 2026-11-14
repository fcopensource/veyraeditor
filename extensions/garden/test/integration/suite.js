// Runs inside VS Code. The webview answers "probe" with what it's showing, so the test can see the garden.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await check(); if (last) return last; await wait(150); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-garden");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();
  const probe = () => Promise.race([api.probe(), wait(1500).then(() => undefined)]);

  step("The Explorer view opens with a daisy seed in the soil");
  await vscode.commands.executeCommand("veyraGarden.view.focus");
  await until(() => api.webviewCount() >= 1, "the garden view");
  let state = await until(async () => { const s = await probe(); return s?.plants.length && s; }, "the view to show the garden");
  assert.deepEqual(state.plants, [{ species: "daisy", stage: 0 }]);
  assert.match(state.hud, /🔥/);

  step("Coding grows the daisy and sprouts new seeds");
  const events = api.codeMinutes(60);
  assert.ok(events.some(e => e.type === "sprout"), "a seed sprouted");
  state = await until(async () => { const s = await probe(); return s?.plants.length >= 3 && s; }, "new plants in the view");
  assert.ok(state.plants.some(p => p.stage >= 3), `something is budding or blooming: ${JSON.stringify(state.plants)}`);
  assert.ok(state.effects.includes("sprout"), "the sprout was celebrated");

  step("Saving a file waters the garden");
  api.garden().moisture = 0.1;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder, "notes.txt")));
  const editor = await vscode.window.showTextDocument(doc);
  await editor.edit(b => b.insert(new vscode.Position(0, 0), "hi "));
  await doc.save();
  await until(() => api.garden().moisture === 1, "the soil to be watered");
  await until(async () => (await probe())?.effects.includes("rain"), "rain on a dry garden");
  assert.equal(api.garden().totals.saves, 1);

  step("Fixing the last error brings butterflies");
  const problems = vscode.languages.createDiagnosticCollection("test");
  problems.set(doc.uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 2), "Broken", vscode.DiagnosticSeverity.Error)]);
  await wait(400);
  problems.clear();
  await until(() => api.garden().totals.fixes >= 1, "the fix to count");
  await until(async () => (await probe())?.butterflies > 0, "butterflies in the garden");

  step("A commit makes the most grown plant bloom");
  const before = api.garden().plants.filter(p => p.growth >= 0).map(p => p.id);
  api.commit();
  assert.equal(api.garden().totals.commits, 1);
  await until(async () => (await probe())?.effects.includes("bloom"), "a bloom");
  assert.equal(api.garden().plants.length, before.length);

  step("Choosing the next seed only allows unlocked species");
  await vscode.commands.executeCommand("veyraGarden.chooseSeed", "cherry");
  assert.equal(api.garden().nextSeed, undefined, "the cherry is still locked");
  await vscode.commands.executeCommand("veyraGarden.chooseSeed", "daisy");
  assert.equal(api.garden().nextSeed, "daisy");

  step("A snapshot is a real PNG picture of the garden");
  const png = await api.snapshot();
  assert.ok(png && png.startsWith("data:image/png;base64,"), "a PNG data URL");
  const bytes = Buffer.from(png.slice(22), "base64");
  assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47], "PNG signature");
  assert.ok(bytes.length > 5000, `a real picture (${bytes.length} bytes)`);

  step("A bigger panel shows the same garden");
  await vscode.commands.executeCommand("veyraGarden.openPanel");
  await until(() => api.webviewCount() === 2, "the panel");

  step("The garden is saved in VS Code's state");
  const saved = extension.exports.garden();
  assert.ok(saved.plants.length >= 3);
  assert.ok(saved.totals.minutes >= 60);

  problems.dispose();
}
