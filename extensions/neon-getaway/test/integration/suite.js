// Runs inside VS Code: the game opens and starts, saving a file pays the player, and progress is saved.
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
  const ext = vscode.extensions.getExtension("flightcoders.neon-getaway");
  assert.ok(ext, "extension is loaded");
  const api = await ext.activate();

  step("Commands are registered");
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["neonGetaway.play", "neonGetaway.reset"]) assert.ok(commands.includes(c), c);

  step("Saving a file while the game is closed earns $25, waiting in the status bar");
  const cart = await vscode.workspace.openTextDocument(path.join(folder, "src", "cart.js"));
  const editor = await vscode.window.showTextDocument(cart);
  await editor.edit(e => e.insert(new vscode.Position(0, 0), "// pay day\n"));
  await cart.save();
  const firstSave = Date.now();
  await until(() => api.pending() === 25, "a $25 paycheck pending");

  step("The game opens in a tab, its scripts run under the content security policy, and it says it's ready");
  await vscode.commands.executeCommand("neonGetaway.play");
  assert.ok(api.isOpen());
  await until(() => api.isReady(), "the game to start", 45000);

  step("The game collects the paycheck and saves the new cash");
  await until(() => api.pending() === 0, "the paycheck collected");
  const save = await until(() => api.save(), "a save");
  assert.equal(save.cash, 300 + 25, "starting cash plus the paycheck");
  assert.equal(save.stats.paychecks, 25);

  step("A save while playing pays straight into the open game, and a second save seconds later doesn't pay again");
  await wait(Math.max(0, 5300 - (Date.now() - firstSave)));
  const saveAgain = async line => {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(cart.uri, new vscode.Position(0, 0), line);
    await vscode.workspace.applyEdit(edit);
    await cart.save();
  };
  await saveAgain("// again\n");
  await saveAgain("// and again\n");
  await until(() => api.save().cash === 350 && api.pending() === 0, "the second paycheck in the game");
  await wait(800);
  assert.equal(api.save().cash, 350, "only one of the two quick saves paid");
  assert.equal(api.save().stats.paychecks, 50);

  step("Running the command again shows the same game instead of a second one");
  await vscode.commands.executeCommand("neonGetaway.play");
  assert.ok(api.isOpen());

  step("Closing the tab and opening it again keeps the progress");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  await until(() => !api.isOpen(), "the game to close");
  await vscode.commands.executeCommand("neonGetaway.play");
  await until(() => api.isReady(), "the game to start again", 45000);
  assert.equal(api.save().cash, 350);
}
