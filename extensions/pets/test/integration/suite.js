// Runs inside VS Code. The webview answers "probe" with its world, so the test can see what the pets are doing.
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
  const extension = vscode.extensions.getExtension("flightcoders.veyra-pets");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();
  const probe = () => Promise.race([api.probe(), wait(1500).then(() => undefined)]);

  step("The Explorer view opens with a first pet, Mochi the cat");
  await vscode.commands.executeCommand("veyraPets.view.focus");
  await until(() => api.webviewCount() >= 1, "the pets view");
  let state = await until(async () => { const s = await probe(); return s?.pets.length && s; }, "the view to show its pets");
  assert.deepEqual(state.pets.map(p => `${p.name} the ${p.kind}`), ["Mochi the cat"]);

  step("Adding a pet");
  await vscode.commands.executeCommand("veyraPets.addPet", { kind: "dog", color: "golden", name: "Biscuit" });
  assert.equal(api.pets().length, 2);
  state = await until(async () => { const s = await probe(); return s?.pets.length === 2 && s; }, "two pets in the view");
  assert.ok(state.pets.some(p => p.name === "Biscuit" && p.kind === "dog"));

  step("A bigger panel shows the same pets");
  await vscode.commands.executeCommand("veyraPets.openPanel");
  await until(() => api.webviewCount() === 2, "the panel");

  step("Throwing a ball");
  await vscode.commands.executeCommand("veyraPets.throwBall");
  await until(async () => (await probe())?.ball, "a ball");

  step("Saving a file makes them cheer");
  await until(async () => !(await probe())?.ball, "the ball game to end", 20000);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(folder, "notes.txt")));
  const editor = await vscode.window.showTextDocument(doc);
  await editor.edit(b => b.insert(new vscode.Position(0, 0), "hi "));
  await doc.save();
  await until(async () => (await probe())?.effects.includes("star"), "stars after saving");

  step("New errors worry them; fixing the last one starts a party");
  const problems = vscode.languages.createDiagnosticCollection("test");
  problems.set(doc.uri, [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 2), "Broken", vscode.DiagnosticSeverity.Error)]);
  await until(async () => { const s = await probe(); return s?.pets.every(p => p.mood === "worried") && s.effects.includes("bang"); }, "worried pets");
  problems.clear();
  await until(async () => { const s = await probe(); return s?.pets.every(p => p.mood === "happy"); }, "a party");
  problems.dispose();

  step("Changing the background");
  await vscode.workspace.getConfiguration("veyraPets").update("background", "night", vscode.ConfigurationTarget.Global);
  await until(async () => (await probe())?.background === "night", "the night sky");
  await vscode.workspace.getConfiguration("veyraPets").update("background", undefined, vscode.ConfigurationTarget.Global);

  step("Saying goodbye to a pet");
  const biscuit = api.pets().find(p => p.name === "Biscuit");
  await vscode.commands.executeCommand("veyraPets.removePet", biscuit.id);
  await until(async () => (await probe())?.pets.length === 1, "one pet left");
  await vscode.commands.executeCommand("workbench.action.files.revert");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
