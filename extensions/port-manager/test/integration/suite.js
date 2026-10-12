// Runs inside VS Code: starts a real server from the workspace, finds it in the Ports view's data,
// then stops it through the same command the view's Stop button uses.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.run = async function run() {
  const extension = vscode.extensions.getExtension("flightcoders.veyra-port-manager");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  await vscode.workspace.getConfiguration("veyraPorts").update("notifyNewServers", false, vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand("veyraPorts.show");

  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  // A real Node.js process, like a dev server (VS Code's own executable would rightly be shown as protected).
  const child = spawn("node", [path.join(folder, "server.js")], { cwd: folder, stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => { child.stdout.once("data", data => resolve(Number(String(data).trim()))); child.once("error", reject); });
  try {
    let entry;
    for (let i = 0; i < 40 && !entry; i++) {
      const entries = await vscode.commands.executeCommand("veyraPorts.list");
      entry = entries.find(e => e.port === port && e.pid === child.pid);
      if (!entry) await wait(250);
    }
    assert.ok(entry, `port ${port} appears in Ports in Use`);
    assert.equal(entry.protected, false);
    assert.equal(entry.localOnly, true);
    assert.ok(entry.workspace, "recognised as running from this workspace");

    // The view's menus pass the tree node, not the entry: stop it exactly that way.
    const stopped = await vscode.commands.executeCommand("veyraPorts.stop", { type: "entry", entry }, { confirm: false });
    assert.equal(stopped, true, "stopped");
    const after = await vscode.commands.executeCommand("veyraPorts.list");
    assert.equal(after.some(e => e.port === port), false, "the port is free");

    // Editors are never stoppable: the extension host itself is protected.
    const editor = after.find(e => e.framework?.kind === "editor");
    if (editor) assert.equal(await vscode.commands.executeCommand("veyraPorts.stop", editor, { confirm: false }), false);
  } finally {
    if (child.exitCode === null) child.kill();
  }
  console.log("Veyra Port Manager integration test passed");
};
