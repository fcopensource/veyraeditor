// Runs inside VS Code against the sample project made by run.mjs.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const labelOf = item => (typeof item.label === "string" ? item.label : item.label.label);

exports.run = async function run() {
  const extension = vscode.extensions.getExtension("flightcoders.veyra-npm-intellisense");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  await vscode.workspace.getConfiguration("veyraNpm").update("latestVersion", false, vscode.ConfigurationTarget.Global);

  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const document = await vscode.workspace.openTextDocument(path.join(folder, "src", "app.js"));
  await vscode.window.showTextDocument(document);
  const lineOf = text => document.getText().split("\n").findIndex(line => line.includes(text));

  // Package names, with versions, inside an empty import string.
  const empty = lineOf(`import x from ""`);
  const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", document.uri, new vscode.Position(empty, 15));
  const labels = list.items.map(labelOf);
  for (const name of ["fake-ui", "fake-test", "declared-only", "fs"]) assert.ok(labels.includes(name), `suggests ${name}`);
  const ui = list.items.find(item => labelOf(item) === "fake-ui");
  assert.equal(ui.label.description, "^2.1.0", "shows the declared version");

  // Subpaths from the package's "exports".
  const sub = lineOf(`import y from "fake-ui/"`);
  const subs = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", document.uri, new vscode.Position(sub, 23));
  const subLabels = subs.items.map(labelOf);
  for (const name of ["fake-ui/button", "fake-ui/theme"]) assert.ok(subLabels.includes(name), `suggests ${name}, got ${subLabels.slice(0, 8)}`);

  // Warnings: missing, only installed by another package, declared but not installed. Nothing for good imports.
  let ours = [];
  for (let i = 0; i < 40 && ours.length < 3; i++) { await wait(250); ours = vscode.languages.getDiagnostics(document.uri).filter(d => d.source === "Veyra npm"); }
  const byCode = Object.fromEntries(ours.map(d => [d.code, document.getText(d.range)]));
  assert.deepEqual(byCode, { missing: "ghost-package", transitive: "transitive-lib", "not-installed": "declared-only" });

  // Quick fixes to install.
  const ghost = ours.find(d => d.code === "missing");
  const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", document.uri, ghost.range);
  const titles = actions.map(a => a.title);
  assert.ok(titles.includes("Install ghost-package"), `quick fix offered, got ${titles}`);
  assert.ok(titles.includes("Install ghost-package as a dev dependency"));

  // Hover with the installed package's details.
  const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", document.uri, new vscode.Position(lineOf(`from "fake-ui"`), 18));
  const hoverText = hovers.flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value))).join("\n");
  assert.match(hoverText, /fake-ui\*\* `2\.1\.3` installed/);
  assert.match(hoverText, /A sample UI kit for the test\./);
  assert.match(hoverText, /as a dependency: `\^2\.1\.0`/);
};
