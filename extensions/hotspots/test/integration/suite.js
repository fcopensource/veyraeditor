// Runs inside VS Code with the git project made by run.mjs.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await check(); if (last) return last; } catch (e) { last = e.message; } await wait(200); }
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
  const ext = vscode.extensions.getExtension("flightcoders.veyra-hotspots");
  assert.ok(ext, "extension is loaded");
  const api = await ext.activate();
  const label = (tree, n) => { const item = tree.getTreeItem(n); return typeof item.label === "string" ? item.label : item.label?.label; };

  step("Reads the last year of history and ranks the complex, busy file first");
  const r = await until(() => api.current()?.analysis.files.length && api.current(), "the analysis");
  const a = r.analysis;
  assert.equal(r.months, 12);
  assert.equal(a.files[0].path, "src/billing/billing.ts");
  assert.equal(a.files[0].rank, 1);
  assert.equal(a.files[0].commits, 14);
  assert.ok(!a.byPath.has("node_modules/x/index.js"), "ignored files are not read");
  assert.equal(a.byPath.get("src/legacy/importer.ts").commits, 0, "Carol's work is older than a year");
  assert.equal(a.authors, 3, "Ada, Ben and Dee committed this year");

  step("The Top Hotspots list");
  const tops = api.trees.top.getChildren();
  assert.equal(label(api.trees.top, tops[0]), "billing.ts");
  assert.match(api.trees.top.getTreeItem(tops[0]).description, /^#1 · 14 commits · src\/billing/);

  step("Files that change together");
  const pairs = api.trees.coupling.getChildren();
  assert.equal(label(api.trees.coupling, pairs[0]), "billing.ts ↔ invoice.ts");
  assert.match(api.trees.coupling.getTreeItem(pairs[0]).description, /% · 11 commits/);

  step("Explorer flames on the top hotspots only");
  assert.equal(api.decoration(file("src/billing/billing.ts"))?.badge, "🔥");
  assert.equal(api.decoration(file("src/quiet.ts")), undefined);

  step("Status bar for the open file");
  await vscode.window.showTextDocument(file("src/billing/billing.ts"));
  await until(() => /Hotspot #1/.test(api.status()), "the status bar to say Hotspot #1");

  step("All history shows the knowledge risk of code whose only author left");
  await vscode.workspace.getConfiguration("veyraHotspots").update("months", 0, vscode.ConfigurationTarget.Workspace);
  await until(() => api.current()?.months === 0 && api.current().analysis.byPath.get("src/legacy/importer.ts")?.commits === 6, "all history");
  const legacy = api.current().analysis.byPath.get("src/legacy/importer.ts");
  assert.equal(legacy.knowledge, "lost");
  const risks = api.trees.knowledge.getChildren();
  assert.equal(label(api.trees.knowledge, risks[0]), "importer.ts");
  assert.match(api.trees.knowledge.getTreeItem(risks[0]).description, /Carol has left/);
  assert.equal(api.current().analysis.authors, 4);

  step("Copies a report");
  await vscode.commands.executeCommand("veyraHotspots.copyReport");
  const report = await vscode.env.clipboard.readText();
  assert.match(report, /^## Code hotspots: /);
  assert.match(report, /\| 1 \| `src\/billing\/billing\.ts` \| 14 \|/);
  assert.match(report, /importer\.ts`: written by Carol, who hasn't committed in over 6 months/);

  step("The map opens and its script runs (the webview says it's ready)");
  await vscode.commands.executeCommand("veyraHotspots.showMap");
  await until(() => api.map().open && api.map().ready, "the map to load");

  step("A new commit is picked up on refresh");
  const cp = require("node:child_process");
  require("node:fs").appendFileSync(path.join(folder, "src/quiet.ts"), "export const more = 2;\n");
  cp.execFileSync("git", ["commit", "-qam", "more"], { cwd: folder, env: { ...process.env, GIT_AUTHOR_NAME: "Eve", GIT_AUTHOR_EMAIL: "eve@shop.dev", GIT_COMMITTER_NAME: "Eve", GIT_COMMITTER_EMAIL: "eve@shop.dev" } });
  await api.refresh();
  assert.equal(api.current().analysis.byPath.get("src/quiet.ts").commits, 2);
  assert.equal(api.current().analysis.authors, 5);
}
