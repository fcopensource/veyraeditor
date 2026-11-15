// Veyra Live Server for VS Code: commands, status bar and file watching around ./server.
// The same features are built into Veyra Studio, so a project behaves the same in both editors.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DEFAULT_PORT, LiveServer, urlFor, type ConsoleEntry, type ServerOptions } from "./server";

let server: LiveServer | undefined;
let starting: Promise<LiveServer> | undefined;
let status: vscode.StatusBarItem;
let clientScript = "";
let browserConsole: vscode.LogOutputChannel;
/** Errors from the page since Live Server started, shown in the status bar. */
let pageErrors = 0;
/** The file or folder Live Server was last started for, so Restart serves the same thing. */
let lastTarget: vscode.Uri | undefined;
let state: vscode.Memento;

const settings = () => vscode.workspace.getConfiguration("veyraLiveServer");
/** Settings that change how the server runs: changing any of them restarts it. */
const RESTART_ON = ["port", "root", "shareOnNetwork", "spa", "proxy", "ignore", "browserConsole"];

export function activate(context: vscode.ExtensionContext) {
  state = context.globalState;
  clientScript = fs.readFileSync(path.join(context.extensionPath, "media", "live-reload.js"), "utf8");
  browserConsole = vscode.window.createOutputChannel("Veyra Live Server: Browser Console", { log: true });
  status = vscode.window.createStatusBarItem("veyraLiveServer.status", vscode.StatusBarAlignment.Right, 100);
  status.name = "Veyra Live Server";
  updateStatus();
  status.show();

  // VS Code's watcher already skips files.watcherExclude (node_modules, .git…); the server keeps only files
  // inside the folder it serves and not matching veyraLiveServer.ignore.
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  const changed = (uri: vscode.Uri) => server?.notify([uri.fsPath]);
  context.subscriptions.push(
    status, watcher, browserConsole,
    watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed),
    // Returns the page's address (used by the integration tests and other extensions).
    vscode.commands.registerCommand("veyraLiveServer.goLive", (uri?: vscode.Uri) => goLive(uri)),
    vscode.commands.registerCommand("veyraLiveServer.goOffline", goOffline),
    vscode.commands.registerCommand("veyraLiveServer.toggle", () => server ? goOffline() : goLive()),
    vscode.commands.registerCommand("veyraLiveServer.openBrowser", () => server && openInBrowser(server.url)),
    vscode.commands.registerCommand("veyraLiveServer.copyUrl", copyAddress),
    vscode.commands.registerCommand("veyraLiveServer.restart", () => restart(settings().get<boolean>("openBrowser", true))),
    vscode.commands.registerCommand("veyraLiveServer.menu", showMenu),
    vscode.commands.registerCommand("veyraLiveServer.toggleNetwork", toggleNetwork),
    vscode.commands.registerCommand("veyraLiveServer.copyNetworkUrl", copyNetworkAddress),
    vscode.commands.registerCommand("veyraLiveServer.showConsole", () => { pageErrors = 0; updateStatus(); browserConsole.show(true); }),
    // A new setting takes effect right away.
    vscode.workspace.onDidChangeConfiguration(event => {
      if (server && RESTART_ON.some(key => event.affectsConfiguration(`veyraLiveServer.${key}`))) void restart(false);
    }),
    { dispose: () => { void server?.close(); server = undefined; } },
  );
  // For the integration tests: what the page has written to the console.
  return { consoleLines: () => consoleLines.slice(), server: () => server };
}

export function deactivate() { return server?.close(); }

const consoleLines: string[] = [];
function onConsole(entry: ConsoleEntry) {
  const line = `${entry.page}  ${entry.text}`;
  consoleLines.push(`${entry.level}: ${line}`);
  if (consoleLines.length > 500) consoleLines.shift();
  if (entry.level === "error") { browserConsole.error(line); pageErrors++; updateStatus(); }
  else if (entry.level === "warn") browserConsole.warn(line);
  else if (entry.level === "debug") browserConsole.debug(line);
  else browserConsole.info(line);
}

function updateStatus() {
  if (server) {
    const shared = server.networkUrls;
    status.text = `$(radio-tower) Port : ${server.port}${shared.length ? " $(globe)" : ""}${pageErrors ? ` $(error) ${pageErrors}` : ""}`;
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**Veyra Live Server** is serving \`${path.basename(server.root)}\` at ${server.url}\n\n`);
    if (shared.length) md.appendMarkdown(`$(globe) On your network: ${shared.join(", ")}\n\n`);
    if (pageErrors) md.appendMarkdown(`$(error) ${pageErrors} error${pageErrors === 1 ? "" : "s"} in the page: see the Browser Console.\n\n`);
    md.appendMarkdown("Click for Open in Browser, Copy Address, Browser Console, Share on Your Network, Restart or Stop.");
    status.tooltip = md;
    status.command = "veyraLiveServer.menu";
  } else {
    status.text = "$(broadcast) Go Live";
    status.tooltip = "Start Veyra Live Server and open this page in your browser";
    status.command = "veyraLiveServer.toggle";
  }
  void vscode.commands.executeCommand("setContext", "veyraLiveServer.running", !!server);
}

/** The folder to serve for `target`: its workspace folder (plus the "root" setting), or its own folder. */
function folderFor(target: vscode.Uri | undefined): string | undefined {
  const workspace = (target && vscode.workspace.getWorkspaceFolder(target)) || vscode.workspace.workspaceFolders?.[0];
  if (!workspace) return target?.scheme === "file" ? path.dirname(target.fsPath) : undefined;
  const sub = vscode.workspace.getConfiguration("veyraLiveServer", workspace.uri).get<string>("root", "").replace(/^[\\/]+/, "");
  return path.join(workspace.uri.fsPath, sub);
}

/** The server's options, from the settings. */
function serverOptions(): ServerOptions {
  const s = settings();
  return {
    network: s.get<boolean>("shareOnNetwork", false),
    spa: s.get<boolean>("spa", false),
    proxy: s.get<Record<string, string>>("proxy", {}),
    ignore: s.get<string[]>("ignore", []),
    onConsole: s.get<boolean>("browserConsole", true) ? onConsole : undefined,
  };
}

/** In Remote SSH, WSL, Codespaces and Dev Containers the server runs on the remote machine:
    asExternalUri forwards the port so the page opens in the local browser. */
async function openInBrowser(page: string) {
  await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(page)));
}

async function goLive(uri?: vscode.Uri, openBrowser = settings().get<boolean>("openBrowser", true)): Promise<string | undefined> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  const file = target?.scheme === "file" ? target : undefined;
  const folder = folderFor(file);
  if (!folder) { void vscode.window.showWarningMessage("Open a folder or an HTML file to use Live Server."); return; }
  if (!fs.existsSync(folder)) {
    const choice = await vscode.window.showErrorMessage(`The folder to serve doesn't exist: ${folder}. Check the "Veyra Live Server: Root" setting.`, "Open Settings");
    if (choice) void vscode.commands.executeCommand("workbench.action.openSettings", "veyraLiveServer.root");
    return;
  }
  lastTarget = file;
  try {
    if (server && path.relative(server.root, fs.realpathSync(folder)) !== "") { await server.close(); server = undefined; }
    if (!server) {
      const port = settings().get<number>("port", DEFAULT_PORT);
      status.text = "$(loading~spin) Starting…";
      starting ??= LiveServer.start(folder, port, clientScript, serverOptions());
      try { server = await starting; } finally { starting = undefined; updateStatus(); }
      pageErrors = 0;
      if (port && server.port !== port) void vscode.window.showInformationMessage(`Port ${port} is busy, so Live Server is using port ${server.port}.`);
    }
    updateStatus();
    let page = server.url;
    if (file && /\.html?$/i.test(file.fsPath)) {
      const relative = path.relative(server.root, fs.realpathSync(file.fsPath));
      if (!relative.startsWith("..") && !path.isAbsolute(relative)) page = `http://127.0.0.1:${server.port}${urlFor(relative)}`;
    }
    vscode.window.setStatusBarMessage(`$(radio-tower) Live Server: ${page}`, 4000);
    if (openBrowser) await openInBrowser(page);
    return page;
  } catch (error) {
    server = undefined;
    updateStatus();
    void vscode.window.showErrorMessage(`Live Server couldn't start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function goOffline() {
  await server?.close();
  server = undefined;
  pageErrors = 0;
  updateStatus();
  vscode.window.setStatusBarMessage("Live Server stopped", 3000);
}

async function restart(openBrowser: boolean) {
  await server?.close();
  server = undefined;
  updateStatus();
  await goLive(lastTarget, openBrowser);
}

async function copyAddress() {
  if (!server) return;
  const address = (await vscode.env.asExternalUri(vscode.Uri.parse(server.url))).toString();
  await vscode.env.clipboard.writeText(address);
  vscode.window.setStatusBarMessage(`$(copy) Copied ${address}`, 3000);
}

/** Open the page on a phone or tablet: share on the local network (asks the first time), then show the address. */
async function toggleNetwork() {
  const on = settings().get<boolean>("shareOnNetwork", false);
  if (!on && !state.get<boolean>("veyraLiveServer.networkWarned")) {
    const ok = await vscode.window.showWarningMessage(
      "Share Live Server on your network? Phones, tablets and anyone else on the same Wi-Fi or network can then open the served folder while Live Server runs. Use it on networks you trust.",
      { modal: true }, "Share on My Network");
    if (ok !== "Share on My Network") return;
    await state.update("veyraLiveServer.networkWarned", true);
  }
  await settings().update("shareOnNetwork", !on, vscode.ConfigurationTarget.Global);
  if (!on) {
    if (!server) await goLive(undefined, false); else await restart(false);
    void showNetworkAddress();
  } else vscode.window.setStatusBarMessage("Live Server: sharing on your network is off", 3000);
}

async function showNetworkAddress() {
  const urls = server?.networkUrls ?? [];
  if (!urls.length) { void vscode.window.showWarningMessage("Live Server couldn't find a network address. Are you connected to Wi-Fi or Ethernet?"); return; }
  const choice = await vscode.window.showInformationMessage(`Open ${urls[0]} on your phone (same Wi-Fi). If it doesn't load, allow VS Code through your firewall.`, "Copy Address");
  if (choice) await copyNetworkAddress();
}

async function copyNetworkAddress() {
  const url = server?.networkUrls[0];
  if (!url) return;
  await vscode.env.clipboard.writeText(url);
  vscode.window.setStatusBarMessage(`$(copy) Copied ${url}`, 3000);
}

/** The running server's menu: what you usually want next, one click away. */
async function showMenu() {
  if (!server) return goLive();
  const shared = server.networkUrls;
  const items: (vscode.QuickPickItem & { run: () => unknown })[] = [
    { label: "$(link-external) Open in Browser", description: server.url, run: () => openInBrowser(server!.url) },
    { label: "$(copy) Copy Address", run: copyAddress },
    { label: `$(terminal) Browser Console`, description: pageErrors ? `${pageErrors} error${pageErrors === 1 ? "" : "s"}` : "console.log and errors from the page", run: () => vscode.commands.executeCommand("veyraLiveServer.showConsole") },
    shared.length
      ? { label: "$(globe) Copy Network Address", description: shared[0], detail: "Open it on your phone or tablet (same Wi-Fi)", run: copyNetworkAddress }
      : { label: "$(globe) Share on Your Network…", description: "Test the page on your phone or tablet", run: toggleNetwork },
    ...(shared.length ? [{ label: "$(debug-disconnect) Stop Sharing on Your Network", run: toggleNetwork }] : []),
    { label: "$(refresh) Restart", run: () => restart(false) },
    { label: "$(circle-slash) Stop Live Server", run: goOffline },
  ];
  const choice = await vscode.window.showQuickPick(items, { title: `Veyra Live Server · Port ${server.port}`, placeHolder: "Choose an action" });
  await choice?.run();
}
