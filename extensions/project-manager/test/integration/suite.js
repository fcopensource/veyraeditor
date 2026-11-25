// Runs inside VS Code, with the sample repositories made by run.mjs and the sample "workspace" folder open.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await wait(150); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const code = process.env.VEYRA_PM_CODE, storage = process.env.VEYRA_PM_STORE;
  const here = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-project-manager");
  assert.ok(extension, "extension is loaded");
  const { store, tree, ready } = await extension.activate();
  await ready;
  const label = node => { const item = tree.getTreeItem(node); return typeof item.label === "string" ? item.label : item.label.label; };
  const section = id => tree.getChildren().find(n => n.id === id);

  step("Three sections: Saved, Git Repositories, Recent");
  assert.deepEqual(tree.getChildren().map(label), ["Saved", "Git Repositories", "Recent"]);

  step("With nothing saved, Saved offers to save this folder");
  const empty = tree.getChildren(section("saved"));
  assert.equal(empty.length, 1);
  assert.equal(tree.getTreeItem(empty[0]).command.command, "veyraProjects.save");

  step("Finds the Git repositories, skipping node_modules, and knows their kind");
  await until(() => tree.repos.length === 3, `3 repositories (have ${tree.repos.length})`);
  const repos = tree.getChildren(section("git"));
  assert.deepEqual(repos.map(label), ["api", "cli", "shop"]);
  const shop = tree.getTreeItem(repos[2]);
  assert.equal(shop.iconPath.id, "json", "a Node project");
  assert.equal(tree.getTreeItem(repos[0]).iconPath.id, "snake", "a Python project");
  assert.equal(shop.contextValue, "project-unsaved");
  assert.equal(shop.command.command, "veyraProjects.openProject");

  step("Saving the open folder writes projects.json and shows it in Saved");
  const box = vscode.window.showInputBox;
  vscode.window.showInputBox = async options => { assert.equal(options.value, "workspace"); return "My Workspace"; };
  try { await vscode.commands.executeCommand("veyraProjects.save"); } finally { vscode.window.showInputBox = box; }
  const file = path.join(storage, "projects.json");
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(saved.map(p => [p.name, p.rootPath]), [["My Workspace", here]]);
  const savedNodes = tree.getChildren(section("saved"));
  assert.deepEqual(savedNodes.map(label), ["My Workspace"]);
  const savedItem = tree.getTreeItem(savedNodes[0]);
  assert.ok(savedItem.description.startsWith("● "), "the open project is marked");
  assert.equal(savedItem.contextValue, "project-saved");

  step("Saving a found repository from its node keeps its name");
  vscode.window.showInputBox = async options => options.value;
  try { await vscode.commands.executeCommand("veyraProjects.save", repos[2]); } finally { vscode.window.showInputBox = box; }
  assert.deepEqual(tree.getChildren(section("saved")).map(label), ["My Workspace", "shop"]);

  step("Tags, and grouping by tag");
  const { setTags } = require(path.join(extension.extensionPath, "out", "model.js"));
  await store.save(setTags(store.projects, path.join(code, "shop"), ["work"]));
  await vscode.workspace.getConfiguration("veyraProjects").update("groupByTag", true, vscode.ConfigurationTarget.Global);
  await until(() => tree.getChildren(section("saved")).length === 2, "two tag groups");
  assert.deepEqual(tree.getChildren(section("saved")).map(label), ["work", "No tag"]);
  await vscode.workspace.getConfiguration("veyraProjects").update("groupByTag", false, vscode.ConfigurationTarget.Global);

  step("Editing projects.json by hand reloads the list");
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  const editor = await vscode.window.showTextDocument(doc);
  const all = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  await editor.edit(e => e.replace(all, JSON.stringify([{ name: "Renamed", rootPath: here }, { name: "Gone", rootPath: path.join(code, "deleted") }], null, 2)));
  await doc.save();
  await until(() => store.projects.length === 2 && store.projects[0].name === "Renamed", "the edited file to load");
  const nodes = tree.getChildren(section("saved"));
  assert.deepEqual(nodes.map(label), ["Gone", "Renamed"]);
  assert.equal(tree.getTreeItem(nodes[0]).iconPath.id, "warning", "a folder that no longer exists is flagged");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  step("A broken projects.json is reported, not lost");
  fs.writeFileSync(file, "{ not json");
  await store.load();
  const hint = tree.getChildren(section("saved"))[0];
  assert.match(label(hint), /isn't valid JSON/);
  assert.equal(tree.getTreeItem(hint).command.command, "veyraProjects.editProjects");
  assert.equal(fs.readFileSync(file, "utf8"), "{ not json", "the file is left alone");

  step("Removing a project");
  await store.save([{ name: "A", rootPath: here, tags: [] }, { name: "B", rootPath: path.join(code, "api"), tags: [] }]);
  const warn = vscode.window.showWarningMessage;
  vscode.window.showWarningMessage = async () => "Remove";
  try { await vscode.commands.executeCommand("veyraProjects.remove", tree.getChildren(section("saved"))[1]); } finally { vscode.window.showWarningMessage = warn; }
  assert.deepEqual(store.projects.map(p => p.name), ["A"]);

  step("Every command is registered");
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["list", "listNewWindow", "save", "openHere", "openNewWindow", "rename", "editTags", "remove", "toggleGroupByTag", "sortBy", "editProjects", "addScanFolder", "refresh", "revealInOS", "copyPath", "openTerminal"]) {
    assert.ok(commands.includes("veyraProjects." + c), c);
  }
}
