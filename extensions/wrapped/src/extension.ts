import * as vscode from "vscode";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { LOG_FORMAT, isMe, parseIdent, parseLog, periodFor, summarize, type Wrapped } from "./model";

/* Veyra Wrapped: reads the history of the open repository with git and tells it as a story in a panel. Nothing leaves the computer. */

interface GitApi { git: { path: string }; repositories: { rootUri: vscode.Uri }[] }

async function gitPath(): Promise<string> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  if (!ext) return "git";
  try { return (ext.isActive ? ext.exports : await ext.activate()).getAPI(1).git.path || "git"; } catch { return "git"; }
}

/** Runs git with an argument list (never through a shell) and returns stdout. */
function git(exe: string, cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } });
    const out: Buffer[] = [], err: Buffer[] = [];
    child.stdout.on("data", d => out.push(d));
    child.stderr.on("data", d => err.push(d));
    child.on("error", e => reject(e));
    child.on("close", code => code === 0 ? resolve(Buffer.concat(out).toString("utf8")) : reject(new Error(Buffer.concat(err).toString("utf8").trim() || `git exited with ${code}`)));
    child.stdin.end();
  });
}

async function pickRepository(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  let roots: string[] = [];
  try { if (ext) roots = (ext.isActive ? ext.exports : await ext.activate()).getAPI(1).repositories.map(r => r.rootUri.fsPath); } catch { /* fall back to folders */ }
  if (!roots.length) roots = folders.map(f => f.uri.fsPath);
  if (!roots.length) { vscode.window.showInformationMessage("Open a folder with a Git repository to see its Wrapped."); return; }
  if (roots.length === 1) return roots[0];
  return (await vscode.window.showQuickPick(roots.map(r => ({ label: path.basename(r), description: r, root: r })), { placeHolder: "Which repository?" }))?.root;
}

async function pickPeriod(): Promise<"thisYear" | "last12Months" | "allTime" | undefined> {
  const setting = vscode.workspace.getConfiguration("veyraWrapped").get<string>("period", "ask");
  if (setting === "thisYear" || setting === "last12Months" || setting === "allTime") return setting;
  const year = new Date().getFullYear();
  const pick = await vscode.window.showQuickPick([
    { label: `${year}`, description: "Since 1 January", period: "thisYear" as const },
    { label: "Last 12 months", period: "last12Months" as const },
    { label: "All time", description: "Every commit on this branch", period: "allTime" as const },
  ], { placeHolder: "Wrap which part of your history?" });
  return pick?.period;
}

async function build(team: boolean): Promise<Wrapped | undefined> {
  const root = await pickRepository();
  if (!root) return;
  const kind = await pickPeriod();
  if (!kind) return;
  const period = periodFor(kind);
  const exe = await gitPath();

  return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Wrapping your history…" }, async () => {
    const args = ["-c", "log.showSignature=false", "log", "--no-merges", "--no-color", "--numstat", "-M", `--format=${LOG_FORMAT}`, "--max-count=50000"];
    if (period.since) args.push(`--since=${period.since}`);
    args.push("HEAD", "--");
    let text: string;
    try { text = await git(exe, root, args); }
    catch (e) {
      const msg = (e as Error).message;
      vscode.window.showErrorMessage(/not a git repository/i.test(msg) ? "This folder isn't a Git repository." : /does not have any commits|unknown revision|bad default revision/i.test(msg) ? "This repository has no commits yet." : `Couldn't read the history: ${msg}`);
      return;
    }
    const all = parseLog(text);
    const repo = path.basename(root);
    const meta = (who: string, isTeam: boolean) => ({ repo, who, team: isTeam, period: { label: period.label, from: period.from, to: period.to } });
    if (team) return summarize(all, meta("The team", true));

    const me = parseIdent(await git(exe, root, ["var", "GIT_AUTHOR_IDENT"]).catch(() => ""));
    const mine = all.filter(c => isMe(c, me));
    if (!mine.length && all.length) {
      const choice = await vscode.window.showInformationMessage(
        `None of the ${all.length} commits in ${period.label} match your Git name or email (${me.email || me.name || "not set"}).`, "Show the Team's Wrapped");
      return choice ? summarize(all, meta("The team", true)) : undefined;
    }
    return summarize(mine, meta(me.name.split(" ")[0] || os.userInfo().username, false));
  });
}

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;

  const show = (data: Wrapped) => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel("veyraWrapped.panel", "Veyra Wrapped", vscode.ViewColumn.Active, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "sparkle.svg");
      const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
      const src = (f: string) => panel!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", f));
      panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src blob: data:;">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${src("viewer.css")}"></head>
<body><div id="app"></div><script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;
      panel.webview.onDidReceiveMessage(async m => {
        if (m.type === "ready" && pending) { panel?.webview.postMessage({ type: "data", data: pending, autoPlay: vscode.workspace.getConfiguration("veyraWrapped").get("autoPlay", true) }); }
        if (m.type === "save") await save(m.data, m.name);
        if (m.type === "again") vscode.commands.executeCommand(m.team ? "veyraWrapped.openTeam" : "veyraWrapped.open");
        if (m.type === "rendered") rendered = m.slides;
      }, undefined, context.subscriptions);
      panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
    } else {
      panel.reveal();
      panel.webview.postMessage({ type: "data", data, autoPlay: vscode.workspace.getConfiguration("veyraWrapped").get("autoPlay", true) });
    }
    pending = data;
    rendered = 0;
  };
  let pending: Wrapped | undefined;
  /** For tests: how many slides the panel drew for the latest data. */
  let rendered = 0;

  async function save(base64: string, name: string) {
    const safe = name.replace(/[^\w.-]+/g, "-");
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const target = await vscode.window.showSaveDialog({ defaultUri: folder ? vscode.Uri.joinPath(folder, safe) : vscode.Uri.file(path.join(os.homedir(), safe)), filters: { "PNG image": ["png"] }, title: "Save your Wrapped card" });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(base64, "base64"));
    const open = await vscode.window.showInformationMessage(`Saved ${path.basename(target.fsPath)}. Share it with #VeyraWrapped!`, "Open", "Show in Folder");
    if (open === "Open") vscode.commands.executeCommand("vscode.open", target);
    if (open === "Show in Folder") vscode.commands.executeCommand("revealFileInOS", target);
  }

  const run = (team: boolean) => async () => { const data = await build(team); if (data) show(data); return data; };
  context.subscriptions.push(
    vscode.commands.registerCommand("veyraWrapped.open", run(false)),
    vscode.commands.registerCommand("veyraWrapped.openTeam", run(true)),
  );
  return { rendered: () => rendered, panelOpen: () => !!panel };
}

export function deactivate() {}
