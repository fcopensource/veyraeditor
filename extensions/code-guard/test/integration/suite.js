// Runs inside VS Code with the sample folder made by run.mjs.
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

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-code-guard");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  const uri = name => vscode.Uri.file(path.join(folder, name));
  const ours = u => vscode.languages.getDiagnostics(u).filter(d => d.source === "Veyra Code Guard");
  const codes = u => ours(u).map(d => `${d.range.start.line + 1}:${d.code}`).sort();
  const config = () => vscode.workspace.getConfiguration("veyraGuard");

  step("Opening a file flags each suspicious line, with the reason");
  const danger = uri("danger.js");
  const editor = await vscode.window.showTextDocument(danger);
  await until(() => codes(danger).join() === "1:trojan-source,3:eval-decoded", `flags in danger.js, have ${codes(danger)}`);
  const evalDiag = ours(danger).find(d => d.code === "eval-decoded");
  assert.equal(evalDiag.severity, vscode.DiagnosticSeverity.Error);
  assert.match(evalDiag.message, /CRITICAL: Running decoded or obfuscated code/);
  assert.match(evalDiag.message, /malware/, "the message explains why it matters");

  step("A quick fix removes the hidden character");
  const bidi = ours(danger).find(d => d.code === "trojan-source");
  // Quick fixes are computed in VS Code's main process, whose copy of the diagnostics arrives a moment after ours.
  // A request is cancelled when a newer one starts (the lightbulb asks too): treat that as "not yet".
  const actionsAt = range => Promise.resolve(vscode.commands.executeCommand("vscode.executeCodeActionProvider", danger, range)).catch(() => []);
  const remove = await until(async () => (await actionsAt(bidi.range)).find(a => a.title === "Remove the hidden characters on this line"), "the remove-hidden-characters quick fix");
  await vscode.workspace.applyEdit(remove.edit);
  assert.equal(editor.document.lineAt(0).text, "const access = 'user';");
  await until(() => codes(danger).join() === "3:eval-decoded", `only eval left, have ${codes(danger)}`);

  step("Marking a line as reviewed adds a comment and clears it");
  const fix = await until(async () => (await actionsAt(ours(danger)[0].range)).find(a => a.title.startsWith("Mark as reviewed")), "the mark-as-reviewed quick fix");
  await vscode.commands.executeCommand(fix.command.command, ...fix.command.arguments);
  assert.equal(editor.document.lineAt(2).text, "// veyra-guard-ignore: eval-decoded (reviewed: safe)");
  await until(() => ours(danger).length === 0, `danger.js clear, have ${codes(danger)}`);

  step("Scanning the workspace checks unopened files and skips node_modules");
  const result = await vscode.commands.executeCommand("veyraGuard.scanWorkspace");
  assert.ok(result.done >= 3, `checked ${result.done} files`);
  assert.deepEqual(codes(uri("client.py")), ["1:raw-ip-url"]);
  assert.deepEqual(codes(uri("safe.ts")), [], "ordinary code is not flagged");
  assert.deepEqual(codes(uri("node_modules/lib/index.js")), [], "node_modules is skipped");

  step("Minimum severity and disabled rules are honoured");
  await vscode.window.showTextDocument(uri("client.py"));
  await config().update("minSeverity", "high", vscode.ConfigurationTarget.Global);
  await until(() => ours(uri("client.py")).length === 0, "medium finding hidden at minSeverity high");
  await config().update("minSeverity", undefined, vscode.ConfigurationTarget.Global);
  await until(() => ours(uri("client.py")).length === 1, "finding back");
  await config().update("disabledRules", ["raw-ip-url"], vscode.ConfigurationTarget.Global);
  await until(() => ours(uri("client.py")).length === 0, "rule turned off");
  await config().update("disabledRules", undefined, vscode.ConfigurationTarget.Global);

  step("Typing new suspicious code is flagged without saving");
  const doc = await vscode.workspace.openTextDocument({ language: "javascript", content: "let x = 1;\n" });
  const ed = await vscode.window.showTextDocument(doc);
  await ed.edit(e => e.insert(new vscode.Position(1, 0), ["fetch('http://198.51", ".100.7/c');"].join("")));
  await until(() => ours(doc.uri).some(d => d.code === "raw-ip-url"), "flag while typing");
}
