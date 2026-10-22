// Runs inside VS Code with the sample app made by run.mjs.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 60000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await check(); if (last) return last; await wait(300); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);
const titles = async uri => ((await vscode.commands.executeCommand("vscode.executeCodeLensProvider", uri, 50)) ?? []).map(l => l.command?.title ?? "");
const tabs = () => vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => vscode.Uri.file(path.join(folder, rel));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-mongodb");
  assert.ok(extension, "extension is loaded");
  step("activating");
  const api = await extension.activate();
  step("activated");
  await api.ready();
  step("scanned");

  step("Finds the queries in JavaScript and Python, with their collections");
  const found = api.ws.all().map(f => `${path.basename(f.uri.fsPath)}:${f.query.method}:${f.query.collection}`).sort();
  assert.deepEqual(found, ["app.py:find:orders", "orders.js:aggregate:orders", "orders.js:find:orders", "orders.js:find:orders"]);
  assert.equal(api.ws.models.find(m => m.name === "Product").collection, "products");

  const commands = await vscode.commands.getCommands(true);
  for (const id of ["connect", "disconnect", "analyzeWorkspace", "indexDoctor", "checkSchema", "refresh"]) assert.ok(commands.includes(`veyraMongo.${id}`), id);
  const orders = file("src/orders.js");
  await vscode.window.showTextDocument(orders);

  if (!process.env.VEYRA_EXPECT_MONGO) {
    step("Without a database, the lens offers to connect");
    const lenses = await until(async () => { const t = await titles(orders); return t.length && t; }, "the connect lens");
    assert.deepEqual(lenses, ["$(database) MongoDB: connect to see how these queries perform"]);
    await vscode.commands.executeCommand("veyraMongo.indexDoctor");
    await until(() => tabs().includes("Index Doctor"), "the Index Doctor tab");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    return;
  }

  step("Connects by itself to the local database in .env");
  await until(() => api.lens.mongo, "the connection");
  assert.equal(api.lens.mongo.db.databaseName, "lens_it");

  step("Lenses show how each query performs");
  const lenses = await until(async () => { const t = await titles(orders); return t.some(x => x.startsWith("⚠")) && t.some(x => x.startsWith("✓")) && t; }, "checked lenses");
  const slow = lenses.find(x => x.startsWith("⚠"));
  assert.match(slow, /^⚠ Full collection scan · 5,000 read → \d+ returned · \d+ ms$/);
  assert.ok(lenses.some(x => x.startsWith("✓ Uses index region_1")), lenses.join(" | "));
  assert.ok(lenses.includes("Create index { customerId: 1, createdAt: -1 }"), lenses.join(" | "));
  assert.ok(lenses.some(x => x.startsWith("ℹ Not checked: The pipeline is built at run time")));

  step("The slow query is in Problems, with quick fixes");
  const diag = await until(() => vscode.languages.getDiagnostics(orders).find(d => d.code === "slow-query"), "the slow-query problem");
  assert.equal(diag.range.start.line, 2);
  const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", orders, diag.range);
  assert.ok(actions.some(a => a.title === "Create index { customerId: 1, createdAt: -1 } on orders"), actions.map(a => a.title).join(" | "));
  assert.ok(actions.some(a => a.title === "Copy the index as code"));

  step("Python queries are checked too");
  const py = file("app.py");
  await vscode.workspace.openTextDocument(py);
  const pyLenses = await until(async () => { const t = await titles(py); return t.some(x => /^[⚠ℹ✓]/.test(x)) && t; }, "the Python lens");
  assert.ok(pyLenses.some(x => x.includes("Full collection scan")), pyLenses.join(" | "));

  step("After adding the index, the lens turns good");
  await api.lens.mongo.createIndex("orders", { customerId: 1, createdAt: -1 });
  api.lens.forget();
  const fixed = await until(async () => { const t = await titles(orders); return t.filter(x => x.startsWith("✓")).length >= 2 && t; }, "the fixed lens");
  assert.ok(fixed.some(x => x.startsWith("✓ Uses index customerId_1_createdAt_-1")), fixed.join(" | "));
  assert.ok(!fixed.some(x => x.startsWith("Create index")));
  await until(() => !vscode.languages.getDiagnostics(orders).some(d => d.code === "slow-query"), "the problem to go");

  step("Schema drift shows on the Mongoose model");
  const results = await vscode.commands.executeCommand("veyraMongo.checkSchema");
  const product = results.find(r => r.model === "Product");
  const kinds = product.drift.map(d => `${d.kind}:${d.path}`).sort();
  assert.deepEqual(kinds, ["never-present:discontinued", "not-in-schema:color", "wrong-type:price"]);
  const productDiags = vscode.languages.getDiagnostics(file("models/product.js"));
  const price = productDiags.find(d => d.message.includes("price should be a number"));
  assert.ok(price, productDiags.map(d => d.message).join(" | "));
  assert.equal(price.range.start.line, 3, "on the schema line for price");

  step("Index Doctor opens");
  await vscode.commands.executeCommand("veyraMongo.indexDoctor");
  await until(() => tabs().includes("Index Doctor"), "the Index Doctor tab");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
