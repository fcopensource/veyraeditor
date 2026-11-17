// Runs inside VS Code with the sample git project made by run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 20000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await check(); if (last) return last; } catch (e) { last = e.message; } await wait(150); }
  throw new Error(`Timed out waiting for ${what}${last ? ` (last: ${JSON.stringify(last)})` : ""}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = rel => vscode.Uri.file(path.join(folder, rel));
  const extension = vscode.extensions.getExtension("flightcoders.veyra-blast-radius");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();
  const first = () => api.results()[0]?.radius;
  const files = r => r.hits.map(h => h.file).sort();
  const label = n => { const item = api.tree.getTreeItem(n); return typeof item.label === "string" ? item.label : item.label?.label ?? path.basename(item.resourceUri.fsPath); };

  step("Finds the uncommitted change through git and follows every importer, through the @/ alias");
  const r = await until(() => first()?.changed.length === 1 && first(), "the radius of src/lib/db.ts");
  assert.deepEqual(r.changed, ["src/lib/db.ts"]);
  assert.deepEqual(files(r), ["app/api/orders/route.ts", "app/users/page.tsx", "src/components/UserCard.tsx", "src/lib/db.ts", "src/lib/orders.ts", "src/lib/users.ts", "tests/users.test.ts"]);
  assert.ok(!files(r).includes("src/unused.ts"), "a commented-out import is not an import");
  assert.ok(!files(r).some(f => f.startsWith("node_modules/")), "node_modules is ignored");
  assert.equal(r.hits.find(h => h.file === "app/users/page.tsx").depth, 3);

  step("The tree groups the files, and the view shows the count");
  const groups = api.tree.getChildren();
  assert.deepEqual(groups.map(label), ["Changed", "Tests to run", "Routes, pages & APIs", "Components", "Other code"]);
  assert.deepEqual(groups.map(g => api.tree.getTreeItem(g).description), ["1", "1", "2", "1", "2"]);
  assert.deepEqual(api.tree.getChildren(groups[2]).map(label).sort(), ["page.tsx", "route.ts"]);
  const pageItem = api.tree.getTreeItem(api.tree.getChildren(groups[2]).find(n => label(n) === "page.tsx"));
  assert.match(pageItem.description, /app\/users · 3 hops/);
  assert.match(pageItem.tooltip.value, /src\/lib\/db\.ts`.*→.*`app\/users\/page\.tsx`/s);
  assert.equal(api.view.badge?.value, 6, "6 affected files on the view");

  step("CodeLens says who uses a file");
  await vscode.window.showTextDocument(file("src/lib/db.ts"));
  const lenses = await until(async () => { const l = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", file("src/lib/db.ts")); return l?.find(x => /Used by/.test(x.command?.title ?? "")) && l; }, "a code lens on db.ts");
  assert.match(lenses.find(x => /Used by/.test(x.command.title)).command.title, /Used by 2 files · blast radius 6/);
  assert.deepEqual(api.usage(file("src/lib/format.ts")), { direct: 0, total: 0 });

  step("Updates live when a file starts importing a changed file");
  fs.writeFileSync(path.join(folder, "src/lib/format.ts"), `import { db } from "./db";\nexport const money = (n: number) => "$" + n + db;\n`);
  await until(() => api.usage(file("src/lib/db.ts"))?.direct === 3, "db.ts to have 3 importers");
  await until(() => first()?.changed.includes("src/lib/format.ts"), "format.ts to show as changed too");

  step("Current-file mode works for Python, through relative and absolute imports");
  await vscode.commands.executeCommand("veyraBlast.forFile", file("backend/app/models.py"));
  const py = await until(() => api.mode() === "file" && first()?.changed[0] === "backend/app/models.py" && first(), "the radius of models.py");
  assert.deepEqual(files(py), ["backend/app/api.py", "backend/app/models.py", "backend/tests/test_api.py"]);
  assert.deepEqual(py.byKind.test.map(h => h.file), ["backend/tests/test_api.py"]);

  step("A deleted file still shows everything that imported it");
  await vscode.commands.executeCommand("veyraBlast.modeChanges");
  fs.rmSync(path.join(folder, "src/lib/orders.ts"));
  const del = await until(() => first()?.changed.includes("src/lib/orders.ts") && first().hits.some(h => h.file === "app/api/orders/route.ts" && h.via === "src/lib/orders.ts") && first(), "route.ts affected by the deleted orders.ts");
  assert.ok(del.byKind.route.some(h => h.file === "app/api/orders/route.ts"));

  step("Copies an impact report with the right test command");
  await vscode.commands.executeCommand("veyraBlast.copyReport");
  const report = await vscode.env.clipboard.readText();
  assert.match(report, /^## Blast radius/);
  assert.match(report, /npx vitest run tests\/users\.test\.ts/);

  step("Opens the graph");
  await vscode.commands.executeCommand("veyraBlast.showGraph");
  await until(() => vscode.window.tabGroups.all.some(g => g.tabs.some(t => t.label === "Blast Radius")), "the graph tab");
}
