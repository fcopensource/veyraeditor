// Runs inside VS Code (Extension Development Host): activates the extension, goes live on a sample
// folder, and checks pages, the injected script and live CSS updates through VS Code's file watcher.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vscode = require("vscode");

const get = url => new Promise((done, fail) => http.get(url, res => { let body = ""; res.setEncoding("utf8"); res.on("data", c => body += c); res.on("end", () => done({ status: res.statusCode, body })); }).on("error", fail));
const nextEvent = url => new Promise((done, fail) => {
  const req = http.get(url, res => { let buffer = ""; res.setEncoding("utf8"); res.on("data", text => { buffer += text; const m = buffer.match(/event: (\w+)\n/); if (m) { req.destroy(); done(m[1]); } }); });
  req.on("error", error => { if (!req.destroyed) fail(error); });
  setTimeout(() => { req.destroy(); fail(new Error("no live reload event within 10 s")); }, 10000);
});

exports.run = async function run() {
  const extension = vscode.extensions.getExtension("flightcoders.live-server");
  assert.ok(extension, "extension is loaded");
  await extension.activate();
  const settings = vscode.workspace.getConfiguration("veyraLiveServer");
  await settings.update("openBrowser", false, vscode.ConfigurationTarget.Global);
  await settings.update("port", 0, vscode.ConfigurationTarget.Global);

  const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const page = await vscode.commands.executeCommand("veyraLiveServer.goLive", vscode.Uri.file(path.join(folder, "pages", "about me.html")));
  assert.match(page, /^http:\/\/127\.0\.0\.1:\d+\/pages\/about%20me\.html$/);
  const base = new URL("/", page).href;

  const about = await get(page);
  assert.equal(about.status, 200);
  assert.ok(about.body.includes('<script src="/__veyra_live/client.js"></script></body>'), about.body);
  assert.ok((await get(base)).body.includes("<h1>Home</h1>"));

  const event = nextEvent(base + "__veyra_live/events");
  await new Promise(r => setTimeout(r, 500));
  fs.writeFileSync(path.join(folder, "style.css"), "h1 { color: blue }");
  assert.equal(await event, "css");

  await vscode.commands.executeCommand("veyraLiveServer.goOffline");
  await assert.rejects(get(base), "server stopped");
  console.log("Veyra Live Server integration test passed");
};
