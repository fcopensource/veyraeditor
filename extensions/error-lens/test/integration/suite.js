// Runs inside VS Code with the sample folder made by run.mjs. Problems come from a test diagnostic collection.
const assert = require("node:assert/strict");
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-error-lens");
  assert.ok(extension, "extension is loaded");
  const { lens } = await extension.activate();
  const config = () => vscode.workspace.getConfiguration("veyraLens");
  const set = (key, value) => config().update(key, value, vscode.ConfigurationTarget.Global);

  const uri = vscode.Uri.file(path.join(folder, "notes.txt"));
  const editor = await vscode.window.showTextDocument(uri);
  const shown = () => (lens.shown.get(uri.toString()) ?? []).map(s => `${s.line}:${s.severity}:${s.text}`);
  const expect = async (want, what) => { await until(() => same(shown(), want), `${what}: want ${JSON.stringify(want)}, have ${JSON.stringify(shown())}`); };

  const problems = vscode.languages.createDiagnosticCollection("test");
  const diag = (line, severity, message, source, code) => Object.assign(new vscode.Diagnostic(new vscode.Range(line, 0, line, 5), message, severity), { source, code });
  const E = vscode.DiagnosticSeverity;

  step("Each line shows its most severe problem at its end");
  problems.set(uri, [
    diag(0, E.Warning, "Unexpected var", "eslint", "no-var"),
    diag(0, E.Error, "Cannot find name 'x'.", "ts", 2304),
    diag(2, E.Information, "Consider a shorter line", "style"),
    diag(3, E.Hint, "Unused value", "ts"),
    diag(4, E.Warning, "Unknown word (teh)", "cSpell"),
  ]);
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "2:2:Consider a shorter line", "4:1:Unknown word (teh)"], "default view (hints hidden)");

  step("The message template");
  await set("messageTemplate", "{source}: {message} ({code})");
  await expect(["0:0:ts: Cannot find name 'x'. (2304)  (+1 more)", "2:2:style: Consider a shorter line", "4:1:cSpell: Unknown word (teh)"], "template");
  await set("messageTemplate", undefined);

  step("Choosing severities, and the toggle commands");
  await vscode.commands.executeCommand("veyraLens.toggleWarnings");
  await expect(["0:0:Cannot find name 'x'.", "2:2:Consider a shorter line"], "warnings hidden (and not counted)");
  await vscode.commands.executeCommand("veyraLens.toggleWarnings");
  await vscode.commands.executeCommand("veyraLens.toggleInfo");
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "4:1:Unknown word (teh)"], "info hidden");
  await vscode.commands.executeCommand("veyraLens.toggleInfo");
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "2:2:Consider a shorter line", "3:3:Unused value", "4:1:Unknown word (teh)"], "info and hints back");
  await set("severities", undefined);

  step("Hiding a source");
  await set("excludeSources", ["cspell"]);
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "2:2:Consider a shorter line"], "cSpell hidden");
  await set("excludeSources", undefined);
  await set("excludeMessages", ["^consider"]);
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "4:1:Unknown word (teh)"], "message pattern hidden");
  await set("excludeMessages", undefined);

  step("Following the cursor");
  await set("followCursor", "activeLine");
  editor.selection = new vscode.Selection(2, 0, 2, 0);
  await expect(["2:2:Consider a shorter line"], "only the cursor's line");
  editor.selection = new vscode.Selection(1, 0, 1, 0);
  await expect([], "a line without a problem");
  await set("followCursor", "closestProblem");
  await expect(["0:0:Cannot find name 'x'.  (+1 more)"], "the nearest problem");
  await set("followCursor", undefined);

  step("The status bar and copying follow the cursor");
  editor.selection = new vscode.Selection(0, 3, 0, 3);
  await wait(200);
  await vscode.env.clipboard.writeText("");
  await vscode.commands.executeCommand("veyraLens.copyMessage");
  assert.equal(await vscode.env.clipboard.readText(), "error: Cannot find name 'x'. (ts 2304)\nwarning: Unexpected var (eslint no-var)");

  step("The line you're typing on waits for a pause");
  await set("typingDelay", 800);
  await editor.edit(b => b.insert(new vscode.Position(0, 0), "a"));
  await expect(["2:2:Consider a shorter line", "4:1:Unknown word (teh)"], "line 0 hidden while typing");
  await expect(["0:0:Cannot find name 'x'.  (+1 more)", "2:2:Consider a shorter line", "4:1:Unknown word (teh)"], "line 0 back after the pause");
  await set("typingDelay", undefined);

  step("Updates as problems change, and turns off");
  problems.set(uri, [diag(1, E.Error, "New problem")]);
  await expect(["1:0:New problem"], "new diagnostics");
  await vscode.commands.executeCommand("veyraLens.toggle");
  await expect([], "off");
  await vscode.commands.executeCommand("veyraLens.toggle");
  await expect(["1:0:New problem"], "on again");

  step("Files in node_modules are left alone");
  const vendored = vscode.Uri.file(path.join(folder, "node_modules", "lib", "index.txt"));
  await vscode.window.showTextDocument(vendored);
  problems.set(vendored, [diag(0, E.Error, "Vendored problem")]);
  await wait(400);
  assert.deepEqual(lens.shown.get(vendored.toString()), []);

  problems.dispose();
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
