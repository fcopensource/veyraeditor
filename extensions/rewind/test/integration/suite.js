// Runs inside VS Code with the sample folder made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await check(); if (last) return last; await wait(100); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-rewind");
  assert.ok(extension, "extension is loaded");
  const { store, panels } = await extension.activate();
  const file = path.join(folder, "cart.js");
  const entries = async () => (await store.history(file)).entries;
  const edit = async (editor, text) => { await editor.edit(b => b.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), text)); };

  step("Opening a file keeps its first snapshot");
  const editor = await vscode.window.showTextDocument(vscode.Uri.file(file));
  await until(async () => (await entries()).length === 1, "the snapshot taken on open");
  assert.equal((await entries())[0].reason, "open");

  step("Every save is kept, with what changed");
  const original = editor.document.getText();
  await edit(editor, original.replace("item.price", "item.price * item.quantity"));
  await editor.document.save();
  await until(async () => (await entries()).length === 2, "the snapshot taken on save");
  const saved = (await entries())[1];
  assert.deepEqual([saved.reason, saved.added, saved.removed], ["save", 1, 1]);

  step("A checkpoint names the current version");
  await store.capture(file, editor.document.getText(), "checkpoint", "Before the refactor");
  assert.equal((await entries()).at(-1).label, "Before the refactor");

  step("The Rewind panel opens beside the file");
  await vscode.commands.executeCommand("veyraRewind.open");
  await until(() => panels.get(file), "the panel");
  assert.match(panels.get(file).panel.title, /Rewind · cart\.js/);

  step("Deleting a function, then restoring the first version (one undo reverts it)");
  await edit(editor, "module.exports = {};\n");
  await editor.document.save();
  await until(async () => (await entries()).length === 4, "the snapshot of the deletion");
  const first = (await entries())[0];
  const contents = await vscode.workspace.openTextDocument(vscode.Uri.from({ scheme: "veyra-rewind", path: `/${first.hash}/cart.js` }));
  assert.equal(contents.getText(), original, "snapshots open as read-only documents for the diff editor");
  const quickPick = vscode.window.showQuickPick;
  vscode.window.showQuickPick = async items => (await items).find(item => item.entry && item.entry.id === first.id);
  try { await vscode.commands.executeCommand("veyraRewind.restore"); } finally { vscode.window.showQuickPick = quickPick; }
  await until(() => editor.document.getText() === original, "the restored text");
  await vscode.commands.executeCommand("undo");
  await until(() => editor.document.getText() === "module.exports = {};\n", "undo of the restore");

  step("Find Deleted Code finds the removed function, not lines still in the file");
  const input = vscode.window.showInputBox, pick = vscode.window.showQuickPick;
  let offered = [];
  vscode.window.showInputBox = async () => "total";
  vscode.window.showQuickPick = async items => { offered = await items; return undefined; };
  try { await vscode.commands.executeCommand("veyraRewind.findDeleted"); } finally { vscode.window.showInputBox = input; vscode.window.showQuickPick = pick; }
  assert.ok(offered.some(item => item.label === "function total(items) {"), `found the deleted function (${offered.map(i => i.label).join(" | ")})`);
  assert.ok(!offered.some(item => item.label.startsWith("module.exports = {}")), "lines still in the file aren't listed");

  step("A deleted file comes back");
  await vscode.window.showTextDocument(vscode.Uri.file(path.join(folder, "notes.md")));
  const notes = path.join(folder, "notes.md");
  await until(async () => (await store.history(notes)).entries.length, "notes.md history");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  const removal = new vscode.WorkspaceEdit(); removal.deleteFile(vscode.Uri.file(notes));
  await vscode.workspace.applyEdit(removal);
  await until(() => !fs.existsSync(notes), "the deletion");
  vscode.window.showQuickPick = async items => (await items).find(item => item.label === "notes.md");
  try { await vscode.commands.executeCommand("veyraRewind.restoreDeletedFile"); } finally { vscode.window.showQuickPick = pick; }
  await until(() => fs.existsSync(notes) && fs.readFileSync(notes, "utf8") === "# Notes\n", "the restored file");

  step("Dependencies are never tracked");
  const dependency = path.join(folder, "node_modules", "lib", "index.js");
  await vscode.window.showTextDocument(vscode.Uri.file(dependency));
  await wait(500);
  assert.equal((await store.history(dependency)).entries.length, 0);
}
