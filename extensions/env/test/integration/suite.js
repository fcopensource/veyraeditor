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
const ours = uri => vscode.languages.getDiagnostics(uri).filter(d => d.source === "Veyra Env");
const codes = uri => ours(uri).map(d => d.code);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => vscode.Uri.file(path.join(folder, rel));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-env");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();
  await api.ready();

  step("Finds the env files");
  assert.deepEqual(api.index.list().map(f => f.name).sort(), [".env", ".env.example", ".env.staging"]);

  step(".env: spaces around =, not in .gitignore, and a variable the example lists");
  const env = file(".env");
  await until(() => codes(env).includes("not-ignored"), "the .gitignore warning");
  for (const c of ["spaces", "not-ignored", "missing-from-template"]) assert.ok(codes(env).includes(c), `${c} in ${codes(env)}`);
  assert.match(ours(env).find(d => d.code === "missing-from-template").message, /OLD_ONLY/);

  step("Quick fix: remove the spaces around =");
  const envDoc = await vscode.workspace.openTextDocument(env);
  const spaces = ours(env).find(d => d.code === "spaces");
  let actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", env, spaces.range);
  await vscode.workspace.applyEdit(actions.find(a => a.title.startsWith("Remove the spaces")).edit);
  assert.equal(envDoc.lineAt(4).text, "API_KEY=abc123");
  await envDoc.save();

  step("A committed env file is an error, with a way out");
  const staging = file(".env.staging");
  await vscode.workspace.openTextDocument(staging);
  await until(() => codes(staging).includes("committed"), "the committed error");
  assert.equal(ours(staging).find(d => d.code === "committed").severity, vscode.DiagnosticSeverity.Error);
  actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", staging, ours(staging)[0].range);
  assert.ok(actions.some(a => a.title === "Stop tracking .env.staging in git and ignore it"));

  step("Add .env to .gitignore");
  actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", env, ours(env).find(d => d.code === "not-ignored").range);
  const add = actions.find(a => a.title === "Add .env to .gitignore");
  await vscode.commands.executeCommand(add.command.command, ...add.command.arguments);
  assert.match(fs.readFileSync(path.join(folder, ".gitignore"), "utf8"), /^node_modules\n\n?# Env files with secrets \(Veyra Env\)\n\.env\n$/);
  await until(() => !codes(env).includes("not-ignored"), "the warning to go once git ignores it");

  step("Code: missing variables are reported; set and built-in ones are not");
  const app = await vscode.workspace.openTextDocument(file("src/app.ts"));
  await vscode.window.showTextDocument(app);
  const appDiags = await until(() => { const d = ours(app.uri); return d.length >= 2 && d; }, "code diagnostics");
  assert.deepEqual(appDiags.map(d => app.getText(d.range)).sort(), ["MISSING_ONE", "OLD_ONLY"]);
  assert.match(appDiags.find(d => app.getText(d.range) === "OLD_ONLY").message, /listed in \.env\.example but not set in \.env/);
  assert.equal(appDiags[0].severity, vscode.DiagnosticSeverity.Warning);

  step("Python too");
  const py = await vscode.workspace.openTextDocument(file("api/main.py"));
  const pyDiags = await until(() => { const d = ours(py.uri); return d.length && d; }, "python diagnostics");
  assert.deepEqual(pyDiags.map(d => py.getText(d.range)), ["PY_MISSING"]);

  step("Quick fix: add the missing variable to .env");
  const missing = appDiags.find(d => app.getText(d.range) === "MISSING_ONE");
  actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", app.uri, missing.range);
  const addVar = actions.find(a => a.title === "Add MISSING_ONE to .env");
  assert.ok(addVar, `actions: ${actions.map(a => a.title)}`);
  await vscode.commands.executeCommand(addVar.command.command, ...addVar.command.arguments);
  assert.match(fs.readFileSync(path.join(folder, ".env"), "utf8"), /\nMISSING_ONE=\n$/);
  await until(() => !ours(app.uri).some(d => app.getText(d.range) === "MISSING_ONE"), "the warning to go");

  step("Autocomplete after process.env., with secret values hidden");
  const list = await vscode.commands.executeCommand("vscode.executeCompletionItemProvider", app.uri, new vscode.Position(4, 25));
  const labels = list.items.map(i => (typeof i.label === "string" ? i.label : i.label.label));
  for (const k of ["DATABASE_URL", "STRIPE_SECRET_KEY", "PORT", "OLD_ONLY"]) assert.ok(labels.includes(k), `suggests ${k}: ${labels}`);
  const stripe = list.items.find(i => i.label.label === "STRIPE_SECRET_KEY");
  assert.ok(!String(stripe.detail).includes("abcdefGHIJ") && String(stripe.detail).includes("•"), `masked: ${stripe.detail}`);
  assert.equal(list.items.find(i => i.label.label === "PORT").detail, "3000", "plain values are shown");

  step("Hover and Go to Definition");
  const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", app.uri, new vscode.Position(0, 26));
  const hoverText = hovers.flatMap(h => h.contents.map(c => (typeof c === "string" ? c : c.value))).join("\n");
  assert.match(hoverText, /\*\*DATABASE_URL\*\*/);
  assert.ok(!hoverText.includes("s3cret"), "the password is not shown in the hover");
  const defs = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", app.uri, new vscode.Position(0, 26));
  assert.equal(defs.length, 1);
  assert.equal(path.basename((defs[0].uri ?? defs[0].targetUri).fsPath), ".env");
  assert.equal((defs[0].range ?? defs[0].targetRange).start.line, 1);

  step("Secret values are hidden in the editor, except on the cursor's line");
  const editor = await vscode.window.showTextDocument(envDoc);
  editor.selection = new vscode.Selection(0, 0, 0, 0);
  const hiddenCount = () => api.hider.state.get(env.toString());
  await until(() => hiddenCount() === 3, `3 hidden values (DATABASE_URL, STRIPE_SECRET_KEY, API_KEY), got ${hiddenCount()}`);
  editor.selection = new vscode.Selection(2, 5, 2, 5);
  await until(() => hiddenCount() === 2, "the cursor's line to show its value");
  await vscode.commands.executeCommand("veyraEnv.toggleHide");
  await until(() => hiddenCount() === 0, "Show values to show everything");
  await vscode.commands.executeCommand("veyraEnv.toggleHide");
  await until(() => hiddenCount() === 2, "Hide values to hide them again");

  step("Update .env.example: names only, never values");
  await vscode.commands.executeCommand("veyraEnv.syncExample", env);
  const example = fs.readFileSync(path.join(folder, ".env.example"), "utf8");
  for (const k of ["DATABASE_URL=", "STRIPE_SECRET_KEY=", "API_KEY=", "MISSING_ONE="]) assert.ok(example.includes(`\n${k}\n`) || example.includes(`\n${k}`), `${k} in ${example}`);
  assert.ok(example.includes("# Database"), "the comment above a variable comes along");
  assert.ok(!/s3cret|sk_live|abc123/.test(example), "no values copied");
  assert.ok(example.startsWith("# Copy this file to .env\nPORT=\nOLD_ONLY=\n"), "existing lines are kept");

  step("Compare opens");
  await vscode.commands.executeCommand("veyraEnv.compare");
  await until(() => vscode.window.tabGroups.all.flatMap(g => g.tabs).some(t => t.label === "Compare Env Files"), "the Compare tab");

  step("Ignoring a variable that is set elsewhere");
  const pyMissing = ours(py.uri)[0];
  actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", py.uri, pyMissing.range);
  const ignore = actions.find(a => a.title.startsWith("Never report PY_MISSING"));
  await vscode.commands.executeCommand(ignore.command.command, ...ignore.command.arguments);
  await until(() => !ours(py.uri).length, "PY_MISSING to stop being reported");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
