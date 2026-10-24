// Runs inside VS Code with the sample files made by run.mjs.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await wait(200); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);
const activeViewType = () => { const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input; return input instanceof vscode.TabInputCustom ? input.viewType : undefined; };

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = name => vscode.Uri.file(path.join(folder, name));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-document-viewer");
  assert.ok(extension, "extension is loaded");
  const { viewer } = await extension.activate();

  // The webview reports back once the file is on screen, with an error message if it couldn't be shown.
  const rendered = async uri => {
    await until(() => viewer.rendered.has(uri.toString()), `${path.basename(uri.fsPath)} to render`);
    return viewer.rendered.get(uri.toString());
  };

  for (const name of ["report.docx", "plan.pptx", "sales.xlsx"]) {
    step(`${name} opens in the viewer by default`);
    const uri = file(name);
    await vscode.commands.executeCommand("vscode.open", uri);
    await until(() => activeViewType() === "veyraDocs.viewer", `${name} to open in the viewer`);
    const error = await rendered(uri);
    assert.equal(error, undefined, `${name} renders without an error, got: ${error}`);
  }

  step("Old binary .doc opens with an explanation instead of an error");
  await vscode.commands.executeCommand("vscode.open", file("old.doc"));
  assert.equal(await rendered(file("old.doc")), undefined);

  step("CSV stays a text file until asked, then opens as a table");
  const csv = file("customers.csv");
  await vscode.window.showTextDocument(csv);
  assert.equal(activeViewType(), undefined, "CSV opens as text by default");
  await vscode.commands.executeCommand("veyraDocs.openTable", csv);
  await until(() => activeViewType() === "veyraDocs.table", "the table view");
  assert.equal(await rendered(csv), undefined);

  step("Closing a file forgets it");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await until(() => viewer.rendered.size === 0, "the viewer to let go of closed files");
}
