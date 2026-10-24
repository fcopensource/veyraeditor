// Runs inside VS Code with the sample repository made by run.mjs.
const assert = require("node:assert/strict");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await wait(200); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const extension = vscode.extensions.getExtension("flightcoders.veyra-git-graph");
  assert.ok(extension, "extension is loaded");
  const { GraphPanel, ui } = await extension.activate();
  const git = vscode.extensions.getExtension("vscode.git").exports.getAPI(1);
  await until(() => git.repositories.length > 0, "VS Code's git to find the repository");

  step("View Git Graph opens a panel with every commit and the uncommitted changes");
  const panel = await vscode.commands.executeCommand("veyraGit.view");
  assert.ok(panel, "the command returns the panel");
  await until(() => panel.rendered === 11, `11 rows (got ${panel.rendered})`);
  const { commits, refs, head } = panel.lastData;
  assert.equal(commits[0].subject, "Uncommitted changes (2)");
  assert.equal(head.branch, "main");
  const main = refs.find(r => r.kind === "head" && r.name === "main");
  assert.equal(main.ahead, 1, "one commit to push");
  assert.equal(main.behind, 1, "one commit to pull");
  assert.ok(refs.some(r => r.kind === "tag" && r.name === "v1.0"));

  step("Running the command again shows the same panel");
  assert.equal(await vscode.commands.executeCommand("veyraGit.view"), panel);

  step("A commit's files, and its diff opens in VS Code");
  const rename = commits.find(c => c.subject === "Rename the guide and drop the old readme");
  const files = await panel.git.changes(rename.hash);
  assert.deepEqual(files.map(f => `${f.status} ${f.path}`).sort(), ["D README.md", "R docs/handbook.md"]);
  const bump = commits.find(c => c.subject === "Bump app version again");
  const [appFile] = await panel.git.changes(bump.hash);
  await panel.onMessage({ type: "diff", hash: bump.hash, file: appFile });
  await until(() => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff, "the diff editor");
  const diff = vscode.window.tabGroups.activeTabGroup.activeTab.input;
  const [left, right] = await Promise.all([vscode.workspace.openTextDocument(diff.original), vscode.workspace.openTextDocument(diff.modified)]);
  assert.equal(left.getText().trim(), "export const app = 2;");
  assert.equal(right.getText().trim(), "export const app = 3;");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

  // Answer the dialogs the actions show.
  const answers = [];
  ui.input = async () => answers.shift();
  ui.pick = async () => answers.shift();
  ui.confirm = async () => answers.shift();
  const refNames = () => panel.lastData.refs.map(r => `${r.kind}:${r.name}`);

  step("Create a branch and a tag at a commit");
  const login = commits.find(c => c.subject === "Add login page");
  answers.push("release/2.0", "Create");
  await panel.action("createBranch", { hash: login.hash });
  answers.push("v2.0", "");
  await panel.action("createTag", { hash: login.hash });
  await until(() => refNames().includes("head:release/2.0") && refNames().includes("tag:v2.0"), "the new branch and tag in the graph");
  assert.equal(panel.lastData.refs.find(r => r.name === "release/2.0").hash, login.hash);
  assert.equal(panel.lastData.head.branch, "main", "Create (without checking out) stays on main");

  step("Cherry-pick a commit onto main");
  const idea = commits.find(c => c.subject === "Try a new idea");
  answers.push(true);
  await panel.action("cherryPick", { hash: idea.hash, subject: idea.subject });
  await until(() => panel.lastData.commits[1]?.subject === "Try a new idea" && panel.lastData.commits[1].hash !== idea.hash, "the cherry-picked commit on top of main");

  step("Saying no to a dialog changes nothing");
  answers.push(false);
  await panel.action("deleteBranch", { ref: "release/2.0" });
  await wait(500);
  assert.ok(refNames().includes("head:release/2.0"));

  step("Delete a branch and a tag");
  answers.push(true);
  await panel.action("deleteBranch", { ref: "release/2.0" });
  answers.push(true);
  await panel.action("deleteTag", { ref: "v2.0" });
  await until(() => !refNames().includes("head:release/2.0") && !refNames().includes("tag:v2.0"), "the branch and tag to go");

  step("A merged branch is deleted after one yes");
  answers.push(true);
  await panel.action("deleteBranch", { ref: "feature/search" });
  await until(() => !refNames().includes("head:feature/search"), "feature/search to be deleted");

  step("An unmerged branch asks again before it's deleted");
  answers.push(true, false);
  await panel.action("deleteBranch", { ref: "experiment" });
  await wait(500);
  assert.ok(refNames().includes("head:experiment"), "a no the second time keeps it");
  answers.push(true, true);
  await panel.action("deleteBranch", { ref: "experiment" });
  await until(() => !refNames().includes("head:experiment"), "experiment to be deleted after the second yes");
  assert.equal(answers.length, 0, "every question was asked");

  step("Showing one branch only");
  await panel.onMessage({ type: "branch", branch: "origin/main" });
  await until(() => panel.lastData.commits[0]?.subject === "Start a changelog", "the branch's commits");
  assert.ok(!panel.lastData.commits.some(c => c.subject.startsWith("Uncommitted")));
  await panel.onMessage({ type: "branch", branch: "" });

  step("Closing the panel lets it go");
  panel.panel.dispose();
  await until(() => GraphPanel.panels.size === 0, "the panel to be forgotten");
}
