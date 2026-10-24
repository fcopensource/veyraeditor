// Runs inside VS Code with the sample files made by run.mjs. Typing goes through VS Code's own "type" command, like a keyboard.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return; await wait(50); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-auto-rename-tag");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  const open = async name => { const editor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(folder, name))); await wait(300); return editor; };
  const typeText = async text => { for (const ch of text) { await vscode.commands.executeCommand("type", { text: ch }); await wait(20); } };
  const line = (editor, n) => editor.document.lineAt(n).text;
  const expectLine = async (editor, n, want) => until(() => line(editor, n) === want, `line ${n + 1} to be ${JSON.stringify(want)}, it is ${JSON.stringify(line(editor, n))}`);
  const settings = vscode.workspace.getConfiguration();

  step("HTML: retyping the opening tag renames the closing one");
  let editor = await open("page.html");
  editor.selection = new vscode.Selection(0, 1, 0, 4); // "div"
  await typeText("section");
  await expectLine(editor, 0, "<section>hello</section>");

  step("Undo takes both tags back together, a step at a time");
  for (let i = 0; i < 10 && line(editor, 0) !== "<div>hello</div>"; i++) {
    await vscode.commands.executeCommand("undo");
    await wait(60);
    const m = /^<(\w*)>hello<\/(\w*)>$/.exec(line(editor, 0));
    assert.ok(m && m[1] === m[2], `the tags stay in step after each undo: ${line(editor, 0)}`);
  }
  await expectLine(editor, 0, "<div>hello</div>");

  step("Backspace in the closing tag");
  editor.selection = new vscode.Selection(1, 13, 1, 13); // after "</li"
  await vscode.commands.executeCommand("deleteLeft");
  await expectLine(editor, 1, "<ul><l>a</l></ul>");
  await typeText("i");
  await expectLine(editor, 1, "<ul><li>a</li></ul>");

  step("With VS Code's own linked editing on, tags are renamed once, not twice");
  await settings.update("editor.linkedEditing", true, vscode.ConfigurationTarget.Global);
  await wait(500);
  editor.selection = new vscode.Selection(0, 4, 0, 4);
  await typeText("x");
  await expectLine(editor, 0, "<divx>hello</divx>");
  await wait(400);
  assert.equal(line(editor, 0), "<divx>hello</divx>", "still renamed once");
  await vscode.commands.executeCommand("undo");
  await expectLine(editor, 0, "<div>hello</div>");
  await settings.update("editor.linkedEditing", undefined, vscode.ConfigurationTarget.Global);

  step("Turned off, nothing is renamed");
  await vscode.commands.executeCommand("veyraRename.toggle");
  editor.selection = new vscode.Selection(0, 4, 0, 4);
  await typeText("y");
  await wait(300);
  assert.equal(line(editor, 0), "<divy>hello</div>");
  await vscode.commands.executeCommand("undo");
  await vscode.commands.executeCommand("veyraRename.toggle");
  await expectLine(editor, 0, "<div>hello</div>");

  step("JSX: a component with a > inside its attributes");
  editor = await open("App.tsx");
  editor.selection = new vscode.Selection(0, 30, 0, 30); // after "<Card"
  await typeText("s");
  await expectLine(editor, 0, "export const App = () => <Cards title={a > b ? 1 : 2}><>x</></Cards>;");

  step("JSX: a fragment becomes an element");
  const fragment = line(editor, 0).indexOf("<>") + 1;
  editor.selection = new vscode.Selection(0, fragment, 0, fragment);
  await typeText("div");
  await expectLine(editor, 0, "export const App = () => <Cards title={a > b ? 1 : 2}><div>x</div></Cards>;");

  step("Other languages are left alone");
  editor = await open("notes.txt");
  editor.selection = new vscode.Selection(0, 4, 0, 4);
  await typeText("z");
  await wait(300);
  assert.equal(line(editor, 0), "<divz>not code</div>");

  await vscode.commands.executeCommand("workbench.action.files.revert");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
