// Runs inside VS Code with the sample project made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await check(); if (last) return last; await wait(200); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);
const label = i => (typeof i.label === "string" ? i.label : i.label.label);
const ours = uri => vscode.languages.getDiagnostics(uri).filter(d => d.source === "Path IntelliSense Veyra");

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => vscode.Uri.file(path.join(folder, rel));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-path-intellisense");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  const complete = async (uri, line, character) => {
    const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", uri, new vscode.Position(line, character), undefined, 200);
    return list.items.filter(i => i.kind === vscode.CompletionItemKind.File || i.kind === vscode.CompletionItemKind.Folder);
  };

  const app = file("src/app.tsx");
  const appDoc = await vscode.workspace.openTextDocument(app);
  await vscode.window.showTextDocument(appDoc);

  step("Relative import: files without their extension, as a bundler project expects");
  let items = await complete(app, 0, 37);
  const names = items.map(label).sort();
  assert.deepEqual(names, ["Button", "Header", "index"], names.join(", "));
  assert.equal(items.find(i => label(i) === "Button").label.description, "Button.tsx");

  step("Alias from tsconfig (with comments and trailing commas): folders first, with a slash");
  const aliasLine = 'import x from "@/';
  const edit = new vscode.WorkspaceEdit();
  edit.insert(app, new vscode.Position(7, 0), `${aliasLine}";\n`);
  await vscode.workspace.applyEdit(edit);
  items = await complete(app, 7, aliasLine.length);
  const folders = items.filter(i => i.kind === vscode.CompletionItemKind.Folder).map(label).sort();
  assert.deepEqual(folders, ["components", "styles", "utils"]);
  assert.equal(items.find(i => label(i) === "components").insertText, "components/");
  assert.match(items.find(i => label(i) === "components").detail, /^@\/\* → src$/);

  step("Node ESM project: imports of .ts files are written with .js");
  const main = file("server/src/main.ts");
  await vscode.workspace.openTextDocument(main);
  items = await complete(main, 0, 22);
  assert.ok(items.some(i => label(i) === "db.js"), items.map(label).join(", "));

  step("HTML: paths relative to the page");
  const page = file("src/page.html");
  const pageDoc = await vscode.workspace.openTextDocument(page);
  items = await complete(page, 3, 15);
  assert.ok(items.some(i => label(i) === "styles"), items.map(label).join(", "));

  step("Broken paths are flagged, with a fix; packages, routes and URLs are not");
  const appDiags = await until(() => { const d = ours(app); return d.length >= 3 && d; }, "path problems in app.tsx");
  const flagged = appDiags.map(d => appDoc.getText(d.range)).sort();
  assert.deepEqual(flagged, ["./utils/helpr", "./utils/later", "@/utils/dat"]);
  assert.equal(appDiags.find(d => appDoc.getText(d.range) === "./utils/helpr").message, 'Can\'t find "./utils/helpr". Did you mean "./utils/helper"?');
  assert.match(appDiags.find(d => appDoc.getText(d.range) === "@/utils/dat").message, /Did you mean "@\/utils\/date"\?/);
  const helpr = appDiags.find(d => appDoc.getText(d.range) === "./utils/helpr");
  const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", app, helpr.range);
  const fix = actions.find(a => a.title === 'Change to "./utils/helper"');
  assert.ok(fix, actions.map(a => a.title).join(" | "));
  await vscode.workspace.applyEdit(fix.edit);
  assert.equal(appDoc.lineAt(1).text, 'import { helper } from "./utils/helper";');
  await until(() => !ours(app).some(d => d.message.includes("helpr")), "the fixed path to stop being flagged");

  const pageDiags = await until(() => { const d = ours(page); return d.length && d; }, "path problems in page.html");
  assert.deepEqual(pageDiags.map(d => pageDoc.getText(d.range)), ["./styles/mian.css"], "/logo.png is in public/, /about is a route");
  assert.match(pageDiags[0].message, /Did you mean "\.\/styles\/main\.css"\?/);

  const readme = file("README.md");
  const readmeDoc = await vscode.workspace.openTextDocument(readme);
  const mdDiags = await until(() => { const d = ours(readme); return d.length && d; }, "path problems in README.md");
  assert.deepEqual(mdDiags.map(d => readmeDoc.getText(d.range)), ["docs/gide.md"]);
  assert.match(mdDiags[0].message, /Did you mean "docs\/guide\.md"\?/);

  const mainDiags = ours(main);
  assert.equal(mainDiags.length, 0, "./db.js finds db.ts, like TypeScript does, and the unfinished ./ is not flagged");

  step("Creating the missing file clears the warning");
  fs.writeFileSync(path.join(folder, "src/utils/later.ts"), "export default 1;\n");
  await until(() => !ours(app).some(d => d.message.includes("later")), "the warning for ./utils/later to clear");

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
