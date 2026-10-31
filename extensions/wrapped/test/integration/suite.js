// Runs inside VS Code on the repository made by run.mjs.
const assert = require("node:assert/strict");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await check(); if (v) return v; await wait(150); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const extension = vscode.extensions.getExtension("flightcoders.veyra-wrapped");
  assert.ok(extension, "extension is loaded");
  const api = await extension.activate();

  step("my Wrapped counts only my commits");
  const mine = await vscode.commands.executeCommand("veyraWrapped.open");
  assert.equal(mine.team, false);
  assert.equal(mine.who, "Ada");
  assert.equal(mine.commits, 6);
  assert.equal(mine.added, 210);
  assert.equal(mine.activeDays, 6);
  assert.equal(mine.longestStreak, 6);
  assert.equal(mine.peakHour, 23, "hours are the author's local hours");
  assert.equal(mine.languages[0].name, "TypeScript");
  assert.equal(mine.personality.id, "night-owl");

  step("the story renders in the panel");
  const slides = await until(() => api.rendered(), "the story to render");
  assert.ok(slides >= 10, `rendered ${slides} slides`);
  assert.ok(api.panelOpen());

  step("the team's Wrapped includes everyone");
  const team = await vscode.commands.executeCommand("veyraWrapped.openTeam");
  assert.equal(team.team, true);
  assert.equal(team.commits, 7);
  assert.deepEqual(team.contributors.map(c => c.name).sort(), ["Ada Lovelace", "Bob"]);
  await until(() => api.rendered() > slides, "the team story to render");
}
