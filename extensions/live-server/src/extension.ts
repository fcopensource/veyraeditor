// Veyra Live Server for VS Code: commands, status bar and file watching around ./server.
// The same features are built into Veyra Studio, so a project behaves the same in both editors.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DEFAULT_PORT, LiveServer, urlFor } from "./server";

let server: LiveServer | undefined;
let starting: Promise<LiveServer> | undefined;
let status: vscode.StatusBarItem;
let clientScript = "";

export function activate(context: vscode.ExtensionContext) {
  clientScript = fs.readFileSync(path.join(context.extensionPath, "media", "live-reload.js"), "utf8");
  status = vscode.window.createStatusBarItem("veyraLiveServer.status", vscode.StatusBarAlignment.Right, 100);
  status.name = "Veyra Live Server";
  updateStatus();
  status.show();

  // VS Code's watcher already skips files.watcherExclude (node_modules, .git…).
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  const changed = (uri: vscode.Uri) => server?.notify([uri.fsPath]);
  context.subscriptions.push(
    status, watcher,
    watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed),
    // Returns the page's address (used by the integration tests and other extensions).
    vscode.commands.registerCommand("veyraLiveServer.goLive", (uri?: vscode.Uri) => goLive(uri)),
    vscode.commands.registerCommand("veyraLiveServer.goOffline", goOffline),
    vscode.commands.registerCommand("veyraLiveServer.toggle", () => server ? goOffline() : goLive()),
    { dispose: () => { void server?.close(); server = undefined; } },
  );
}

export function deactivate() { return server?.close(); }

function updateStatus() {
  if (server) {
    status.text = `$(circle-slash) Port : ${server.port}`;
    status.tooltip = `Veyra Live Server is serving ${server.root} at ${server.url}. Click to stop.`;
  } else {
    status.text = "$(broadcast) Go Live";
    status.tooltip = "Start Veyra Live Server and open this page in your browser";
  }
  status.command = "veyraLiveServer.toggle";
}

/** The folder to serve for `target`: its workspace folder (plus the "root" setting), or its own folder. */
function folderFor(target: vscode.Uri | undefined): string | undefined {
  const workspace = (target && vscode.workspace.getWorkspaceFolder(target)) || vscode.workspace.workspaceFolders?.[0];
  if (!workspace) return target?.scheme === "file" ? path.dirname(target.fsPath) : undefined;
  const sub = vscode.workspace.getConfiguration("veyraLiveServer", workspace.uri).get<string>("root", "").replace(/^[\\/]+/, "");
  return path.join(workspace.uri.fsPath, sub);
}

async function goLive(uri?: vscode.Uri): Promise<string | undefined> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  const file = target?.scheme === "file" ? target : undefined;
  const folder = folderFor(file);
  if (!folder) { void vscode.window.showWarningMessage("Open a folder or an HTML file to use Live Server."); return; }
  try {
    if (server && path.relative(server.root, fs.realpathSync(folder)) !== "") { await server.close(); server = undefined; }
    if (!server) {
      const port = vscode.workspace.getConfiguration("veyraLiveServer").get<number>("port", DEFAULT_PORT);
      status.text = "$(loading~spin) Starting…";
      starting ??= LiveServer.start(folder, port, clientScript);
      try { server = await starting; } finally { starting = undefined; updateStatus(); }
      if (port && server.port !== port) void vscode.window.showInformationMessage(`Port ${port} is busy, so Live Server is using port ${server.port}.`);
    }
    updateStatus();
    let page = server.url;
    if (file && /\.html?$/i.test(file.fsPath)) {
      const relative = path.relative(server.root, fs.realpathSync(file.fsPath));
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) page = `http://127.0.0.1:${server.port}${urlFor(relative)}`;
    }
    vscode.window.setStatusBarMessage(`Live Server: ${page}`, 4000);
    // In Remote SSH, WSL, Codespaces and Dev Containers the server runs on the remote machine:
    // asExternalUri forwards the port so the page opens in the local browser.
    if (vscode.workspace.getConfiguration("veyraLiveServer").get<boolean>("openBrowser", true)) await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(page)));
    return page;
  } catch (error) {
    updateStatus();
    void vscode.window.showErrorMessage(`Live Server couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function goOffline() {
  await server?.close();
  server = undefined;
  updateStatus();
  vscode.window.setStatusBarMessage("Live Server stopped", 3000);
}
