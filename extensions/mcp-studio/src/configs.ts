import * as vscode from "vscode";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as m from "./model";

/* Reading and editing the MCP config files of every AI app. */

export interface Located { target: m.ConfigTarget; text: string; servers: m.ServerDef[]; error?: string; exists: boolean }
export type Status = { state: "checking" | "ok" | "error"; detail: string; at: number };
export const keyOf = (target: m.ConfigTarget, name: string) => `${target.id}::${name}`;

export class Configs {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  readonly status = new Map<string, Status>();
  private watchers: vscode.Disposable[] = [];
  constructor(private context: vscode.ExtensionContext) {}

  /** The editor this extension runs in: Cursor and Windsurf keep MCP servers in their own files, not VS Code's. */
  private get hostIsVsCode() { return !/cursor|windsurf|trae|kiro/i.test(vscode.env.appName); }
  targets(): m.ConfigTarget[] {
    const userDir = path.dirname(path.dirname(this.context.globalStorageUri.fsPath));
    return m.configTargets({
      platform: process.platform, home: os.homedir(), appData: process.env.APPDATA,
      vscodeUserDir: this.hostIsVsCode ? userDir : undefined,
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).filter(f => f.uri.scheme === "file").map(f => f.uri.fsPath),
    }).map(t => (t.app === "vscode" ? { ...t, label: t.scope === "user" ? vscode.env.appName.replace(/^Visual Studio Code/, "VS Code") : t.label } : t));
  }
  /** Whether an app is on this computer: its config file or its own folder exists. */
  installed(target: m.ConfigTarget): boolean {
    if (fs.existsSync(target.file)) return true;
    if (target.scope === "project") return false;
    const home = os.homedir();
    switch (target.app) {
      case "claude-desktop": return fs.existsSync(path.dirname(target.file));
      case "claude-code": return fs.existsSync(path.join(home, ".claude"));
      case "cursor": return fs.existsSync(path.join(home, ".cursor"));
      case "windsurf": return fs.existsSync(path.join(home, ".codeium", "windsurf"));
      case "vscode": return true;
      default: return false;
    }
  }
  read(target: m.ConfigTarget): Located {
    let text = "", exists = false;
    try { text = fs.readFileSync(target.file, "utf8"); exists = true; } catch { /* not created yet */ }
    const { servers, error } = m.readServers(text, target.format);
    return { target, text, servers, error, exists };
  }
  /** Every app found on this computer, and the project files that exist, with their servers. */
  all(): Located[] {
    return this.targets().filter(t => this.installed(t)).map(t => this.read(t));
  }

  /** Change one config file. The previous version is kept next to it as <file>.veyra-backup. */
  async edit(target: m.ConfigTarget, change: (text: string) => string) {
    if (!target.writable) throw new Error(`${target.label} is shown here, but edited in its own app.`);
    let before = "";
    try { before = fs.readFileSync(target.file, "utf8"); } catch { /* new file */ }
    const after = change(before);
    if (after === before) return;
    await fs.promises.mkdir(path.dirname(target.file), { recursive: true });
    if (before) await fs.promises.writeFile(`${target.file}.veyra-backup`, before, "utf8");
    // Write next to the file, then swap it in, so the app never reads half a file.
    const temp = `${target.file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, after, "utf8");
    try { await fs.promises.rename(temp, target.file); }
    catch { await fs.promises.copyFile(temp, target.file); await fs.promises.rm(temp, { force: true }); }
    this.refresh();
  }

  refresh() {
    this.watch();
    this.emitter.fire();
  }
  /** Edits made in the apps, or by hand, show up straight away. */
  watch() {
    this.watchers.forEach(w => w.dispose());
    this.watchers = this.targets().map(t => {
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(path.dirname(t.file)), path.basename(t.file)));
      const fire = () => this.emitter.fire();
      w.onDidChange(fire); w.onDidCreate(fire); w.onDidDelete(fire);
      return w;
    });
  }
  setStatus(key: string, status: Status | undefined) { if (status) this.status.set(key, status); else this.status.delete(key); this.emitter.fire(); }
  dispose() { this.watchers.forEach(w => w.dispose()); }
}

export const RESTRICTED = "This folder is in Restricted Mode, so MCP Studio does not start servers: starting one runs its command on your computer. Trust the folder to test and inspect servers.";
/** Starting a server runs its command, so nothing is started in Restricted Mode. */
export async function canStart(): Promise<boolean> {
  if (vscode.workspace.isTrusted) return true;
  if (await vscode.window.showWarningMessage(RESTRICTED, "Manage Workspace Trust")) await vscode.commands.executeCommand("workbench.trust.manage");
  return false;
}

/** The values a server needs to start the way its app starts it: variables filled in, VS Code inputs asked for. */
export async function runnable(target: m.ConfigTarget, def: m.ServerDef): Promise<{ def: m.ServerDef; missing: string[] } | undefined> {
  const workspaceFolder = target.folder ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const ctx: m.ExpandContext = { env: { ...process.env }, home: os.homedir(), workspaceFolder, pathSeparator: path.sep, inputs: {} };
  let result = m.expand(def, target.format, ctx);
  for (const id of result.inputs) {
    const value = await vscode.window.showInputBox({ title: `${def.name}: ${id}`, prompt: `This server asks for "${id}" when it starts.`, password: /key|token|secret|password/i.test(id), ignoreFocusOut: true });
    if (value === undefined) return undefined;
    ctx.inputs![id] = value;
  }
  if (result.inputs.length) result = m.expand(def, target.format, ctx);
  return { def: result.def, missing: result.missing };
}
