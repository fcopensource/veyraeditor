// Runs inside VS Code with the sample project made by run.mjs. With Docker running, it also drives real containers.
const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, what, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await check(); if (value) return value; await wait(250); }
  throw new Error(`Timed out waiting for ${what}`);
}
const step = name => console.log(`[suite] ${name}`);

exports.run = async function run() {
  try { await steps(); console.log("[suite] all steps passed"); }
  catch (error) { console.error("[suite] FAILED:", error); throw error; }
};

async function steps() {
  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension("flightcoders.veyra-docker");
  assert.ok(extension, "extension is loaded");
  const { store, docker } = await extension.activate();
  await until(() => store.loaded, "the first Docker read");

  step("Commands are registered");
  const commands = await vscode.commands.getCommands(true);
  for (const id of ["refresh", "dashboard", "cleanup", "logs", "shell", "start", "stop", "restart", "remove", "runImage", "pullImage", "composeUp", "composeDown", "composeLogs", "buildImage", "buildRun"])
    assert.ok(commands.includes(`veyraDocker.${id}`), `veyraDocker.${id} is registered`);

  step("Dockerfile checks show up as problems, with quick fixes");
  const dockerfile = await vscode.workspace.openTextDocument(path.join(folder, "Dockerfile"));
  await vscode.window.showTextDocument(dockerfile);
  const diagnostics = await until(() => { const d = vscode.languages.getDiagnostics(dockerfile.uri).filter(x => x.source === "Veyra Docker"); return d.length >= 5 && d; }, "Dockerfile problems");
  const codes = diagnostics.map(d => d.code);
  for (const code of ["pin-version", "maintainer", "apt-yes", "use-copy", "npm-ci", "dockerignore", "root-user"]) assert.ok(codes.includes(code), `finds ${code}, got ${codes}`);
  const maintainer = diagnostics.find(d => d.code === "maintainer");
  const actions = await vscode.commands.executeCommand("vscode.executeCodeActionProvider", dockerfile.uri, maintainer.range);
  const fix = actions.find(a => a.title === "Use LABEL maintainer");
  assert.ok(fix, `quick fix offered, got ${actions.map(a => a.title)}`);
  await vscode.workspace.applyEdit(fix.edit);
  assert.equal(dockerfile.lineAt(1).text, 'LABEL maintainer="Ana <ana@example.com>"');
  await until(() => !vscode.languages.getDiagnostics(dockerfile.uri).some(d => d.code === "maintainer"), "the fixed problem to go away");

  step("Buttons above the Dockerfile and the compose file");
  const fileLenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", dockerfile.uri);
  assert.deepEqual(fileLenses.map(l => l.command.title), ["▶ Build and Run", "Build Image"]);
  const compose = await vscode.workspace.openTextDocument(path.join(folder, "compose.yaml"));
  const composeLenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", compose.uri);
  assert.deepEqual(composeLenses.map(l => l.command.title), ["▶ Compose Up", "Rebuild", "■ Down", "Logs", "▶ Up web", "▶ Up cache"]);
  assert.equal(composeLenses[4].range.start.line, 1);

  const running = !store.error;
  if (process.env.VEYRA_EXPECT_DOCKER) assert.ok(running, `Docker should be running here: ${JSON.stringify(store.error)}`);
  if (!running) {
    step(`No Docker here: the views explain it ("${store.error.title}")`);
    assert.match(store.error.title, /Docker is not (installed|running)/);
    assert.ok(store.error.detail.length > 20);
    await vscode.commands.executeCommand("veyraDocker.dashboard");
    await until(() => tabs().includes("Docker Dashboard"), "the Dashboard tab");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    return;
  }

  step(`Docker ${store.version.server} is running: drive a real container`);
  await docker.run(["rm", "-f", "veyra-it-web"]).catch(() => {});
  await docker.run(["run", "-d", "--name", "veyra-it-web", "-p", "18091:80", "nginx:alpine"], { timeoutMs: 180000 });
  const find = () => store.containers.find(c => c.name === "veyra-it-web");
  await until(() => find()?.state === "running", "the sidebar to see the new container (docker events)");
  const node = () => ({ kind: "container", container: find() });

  step("Stop and Start from the sidebar");
  await vscode.commands.executeCommand("veyraDocker.stop", node());
  await until(() => find()?.state === "exited", "the container to stop");
  await vscode.commands.executeCommand("veyraDocker.start", node());
  await until(() => find()?.state === "running", "the container to start");

  step("Logs and the Dashboard open");
  await vscode.commands.executeCommand("veyraDocker.logs", node());
  await until(() => tabs().includes("Logs: veyra-it-web"), "the Logs tab");
  await vscode.commands.executeCommand("veyraDocker.dashboard");
  await until(() => tabs().includes("Docker Dashboard"), "the Dashboard tab");

  step("Images and volumes are listed");
  assert.ok(store.images.some(i => i.repository === "nginx" && i.tag === "alpine"));
  await docker.run(["rm", "-f", "veyra-it-web"]);
  await until(() => !find(), "the removed container to leave the sidebar");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}
const tabs = () => vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label);
