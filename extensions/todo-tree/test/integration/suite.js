// Runs inside VS Code with the sample project made by run.mjs.
const assert = require("node:assert/strict");
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
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => vscode.Uri.file(path.join(folder, rel));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-todo-tree");
  assert.ok(extension, "extension is loaded");
  const { index, tree, view, highlights } = await extension.activate();
  const config = () => vscode.workspace.getConfiguration("veyraTodo");
  const labels = nodes => nodes.map(n => { const item = tree.getTreeItem(n); return typeof item.label === "string" ? item.label : item.label?.label ?? path.basename(item.resourceUri.fsPath); });

  step("Finds the tags in comments, and skips node_modules, dist and binary files");
  await until(() => index.count === 4, `4 tags (have ${index.count})`);
  assert.deepEqual([...index.files.values()].map(e => e.path).sort(), ["README.md", "src/app.ts", "src/lib/util.py"]);
  assert.equal(view.badge?.value, 4, "the count on the icon");

  step("Grouped by file: folders, then files, then each tag");
  const roots = tree.getChildren();
  assert.deepEqual(labels(roots), ["src", "README.md"]);
  const src = tree.getChildren(roots[0]);
  assert.deepEqual(labels(src), ["lib", "app.ts"]);
  const todos = tree.getChildren(src[1]);
  assert.deepEqual(labels(todos), ["remember the user", "handle a wrong password"]);
  const fixme = tree.getTreeItem(todos[1]);
  assert.equal(fixme.description, "FIXME · line 3 · @ada");
  assert.equal(fixme.command.command, "vscode.open");
  assert.equal(fixme.command.arguments[1].selection.start.line, 2);

  step("Clicking a tag opens its line");
  await vscode.commands.executeCommand(fixme.command.command, ...fixme.command.arguments);
  await until(() => vscode.window.activeTextEditor?.selection.start.line === 2, "the cursor on the FIXME line");
  await until(() => highlights.shown.get(file("src/app.ts").toString()) === 2, "both tags highlighted in the editor");

  step("Grouped by tag");
  await config().update("groupBy", "tag", vscode.ConfigurationTarget.Global);
  await until(() => same(labels(tree.getChildren()), ["TODO", "FIXME", "HACK"]), "tag groups");
  const todoGroup = tree.getChildren()[0];
  assert.equal(tree.getTreeItem(todoGroup).description, "2");
  assert.deepEqual(tree.getChildren(todoGroup).map(n => tree.getTreeItem(n).description), ["README.md:3", "app.ts:2"]);
  await config().update("groupBy", undefined, vscode.ConfigurationTarget.Global);

  step("Filtering by owner, and clearing it");
  await vscode.commands.executeCommand("veyraTodo.filter", "@ada");
  assert.equal(tree.shownCount, 1);
  assert.match(view.message, /Showing 1 of 4/);
  await vscode.commands.executeCommand("veyraTodo.clearFilter");
  assert.equal(tree.shownCount, 4);
  assert.equal(view.message, undefined);

  step("Typing a new tag shows up without saving");
  const editor = vscode.window.activeTextEditor;
  await editor.edit(b => b.insert(new vscode.Position(3, 1), "\n// BUG: logs the password"));
  await until(() => index.count === 5, "the new BUG");
  await until(() => highlights.shown.get(editor.document.uri.toString()) === 3, "three highlights");

  step("New and deleted files");
  await vscode.workspace.fs.writeFile(file("docs/plan.md"), Buffer.from("<!-- NOTE: ship on Friday -->\n"));
  await until(() => index.count === 6, "the NOTE in a new file");
  await vscode.workspace.fs.delete(file("docs/plan.md"));
  await until(() => index.count === 5, "the deleted file to go");

  step("Copy as a Markdown checklist");
  await vscode.env.clipboard.writeText("");
  const exported = vscode.commands.executeCommand("veyraTodo.exportMarkdown");
  await until(async () => (await vscode.env.clipboard.readText()).length > 0, "the checklist");
  const md = await vscode.env.clipboard.readText();
  assert.ok(md.startsWith("## TODO (2)\n\n- [ ] write the intro — `README.md:3`"), md);
  assert.ok(md.includes("- [ ] handle a wrong password (@ada) — `src/app.ts:3`"), md);
  assert.ok(md.includes("## BUG (1)"), md);
  void exported;

  step("Custom tags");
  await config().update("tags", ["HACK"], vscode.ConfigurationTarget.Global);
  await until(() => index.count === 1, "only HACK");
  await config().update("tags", undefined, vscode.ConfigurationTarget.Global);
  await until(() => index.count === 5, "all tags back");
  await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
