// Veyra Port Manager for VS Code: the Ports in Use view, status bar, notifications and commands around
// the Scanner (system.ts) and the data model (model.ts).
import * as vscode from "vscode";
import { diffSnapshots, groupEntries, isBrowsable, pageUrl, type Group, type GroupId, type PortEntry, type Snapshot } from "./model";
import { Scanner, isAlive, stopProcess } from "./system";

const settings = () => vscode.workspace.getConfiguration("veyraPorts");
const BACKGROUND_REFRESH_MS = 20_000;

/* ---------- Tree ---------- */

type Node =
  | { type: "group"; group: Group }
  | { type: "entry"; entry: PortEntry }
  | { type: "message"; text: string; icon: string };

const KIND_ICONS: Record<string, [string, string]> = {
  web: ["globe", "charts.blue"], database: ["database", "charts.orange"], runtime: ["server-process", "charts.green"],
  tool: ["tools", "descriptionForeground"], editor: ["code", "descriptionForeground"],
};
const GROUP_ICONS: Record<GroupId, string> = { workspace: "root-folder", apps: "rocket", editors: "code", system: "shield" };

function entryItem(entry: PortEntry): vscode.TreeItem {
  const item = new vscode.TreeItem(`${entry.port}`, vscode.TreeItemCollapsibleState.None);
  const what = entry.framework?.label ?? entry.process.name;
  item.description = entry.framework && entry.framework.label !== entry.process.name ? `${what} · ${entry.process.name}` : what;
  const [icon, color] = entry.workspace ? ["star-full", "charts.purple"] : KIND_ICONS[entry.framework?.kind ?? ""] ?? ["plug", "descriptionForeground"];
  item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
  item.contextValue = ["port", isBrowsable(entry) ? "browsable" : "", entry.protected ? "" : "stoppable", entry.process.cwd ? "hasFolder" : ""].filter(Boolean).join(" ");
  item.tooltip = tooltip(entry);
  item.id = entry.key;
  if (isBrowsable(entry)) item.command = { command: "veyraPorts.openInBrowser", title: "Open in Browser", arguments: [entry] };
  item.accessibilityInformation = { label: `Port ${entry.port}, ${what}, process ${entry.pid}${entry.protected ? ", protected" : ""}` };
  return item;
}

function tooltip(entry: PortEntry): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`### $(plug) Port ${entry.port}\n\n`);
  md.appendMarkdown(`**${entry.framework?.label ?? entry.process.name}** · \`${entry.process.name}\` · PID ${entry.pid}\n\n`);
  md.appendMarkdown(`Listening on ${entry.addresses.map(a => `\`${a || "*"}\``).join(", ")}${entry.localOnly ? " (this computer only)" : " (reachable from your network)"}\n\n`);
  if (entry.workspace) md.appendMarkdown(`$(root-folder) Runs from this workspace\n\n`);
  if (entry.process.cwd) md.appendMarkdown(`$(folder) \`${entry.process.cwd}\`\n\n`);
  if (entry.process.command) md.appendCodeblock(entry.process.command.length > 400 ? entry.process.command.slice(0, 400) + "…" : entry.process.command, "shell");
  if (entry.protected) md.appendMarkdown(`\n$(shield) ${entry.framework?.kind === "editor" ? "Part of your code editor, so it can't be stopped from here." : "A system or another user's program, so it can't be stopped from here."}`);
  return md;
}

class PortsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private nodes: Node[] = [];

  show(snapshot: Snapshot | undefined, error?: string) {
    if (error) this.nodes = [{ type: "message", text: `Couldn't read ports: ${error}`, icon: "warning" }];
    else if (!snapshot) this.nodes = [{ type: "message", text: "Looking for ports in use…", icon: "loading~spin" }];
    else {
      const groups = groupEntries(snapshot.entries);
      // One section only: show its ports directly, without a heading.
      this.nodes = groups.length === 1 ? groups[0].entries.map(entry => ({ type: "entry", entry })) : groups.map(group => ({ type: "group", group }));
    }
    this.changed.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === "entry") return entryItem(node.entry);
    if (node.type === "message") { const item = new vscode.TreeItem(node.text); item.iconPath = new vscode.ThemeIcon(node.icon); return item; }
    const collapsed = node.group.id === "editors" || node.group.id === "system";
    const item = new vscode.TreeItem(node.group.label, collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
    item.id = `group:${node.group.id}`;
    item.description = `${node.group.entries.length}`;
    item.iconPath = new vscode.ThemeIcon(GROUP_ICONS[node.group.id]);
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) return this.nodes;
    return node.type === "group" ? node.group.entries.map(entry => ({ type: "entry", entry })) : [];
  }
}

/** Commands get a PortEntry from item clicks and other callers, and a tree Node from the view's menus. */
function entryOf(arg: unknown): PortEntry | undefined {
  const value = arg as Partial<Node> & Partial<PortEntry> | undefined;
  if (value?.type === "entry") return (value as { entry: PortEntry }).entry;
  return typeof value?.key === "string" && typeof value.port === "number" ? value as PortEntry : undefined;
}

/* ---------- Extension ---------- */

class PortManager implements vscode.Disposable {
  private readonly scanner = new Scanner();
  private readonly provider = new PortsProvider();
  private readonly view: vscode.TreeView<Node>;
  private readonly status = vscode.window.createStatusBarItem("veyraPorts.status", vscode.StatusBarAlignment.Right, 99);
  private readonly disposables: vscode.Disposable[] = [];
  private snapshot: Snapshot | undefined;
  /** Changes when what the view shows changes, so unchanged scans don't redraw it. */
  private signature = "";
  /** Dev servers already announced this session. */
  private readonly announced = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor() {
    this.view = vscode.window.createTreeView("veyraPorts.list", { treeDataProvider: this.provider, showCollapseAll: false });
    this.status.name = "Veyra Port Manager";
    this.status.command = "veyraPorts.show";
    this.provider.show(undefined);
    this.disposables.push(
      this.view, this.status,
      this.view.onDidChangeVisibility(() => this.refresh()),
      vscode.window.onDidChangeWindowState(state => { if (state.focused) void this.refresh(); }),
      vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration("veyraPorts")) { this.signature = ""; void this.refresh(); } }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => { this.signature = ""; void this.refresh(); }),
      vscode.commands.registerCommand("veyraPorts.refresh", () => this.refresh()),
      vscode.commands.registerCommand("veyraPorts.show", () => vscode.commands.executeCommand("veyraPorts.list.focus")),
      vscode.commands.registerCommand("veyraPorts.openInBrowser", (arg?: unknown) => { const entry = entryOf(arg); return entry && this.open(entry); }),
      vscode.commands.registerCommand("veyraPorts.copyAddress", (arg?: unknown) => { const entry = entryOf(arg); return entry && this.copy(entry); }),
      vscode.commands.registerCommand("veyraPorts.stop", (arg?: unknown, options?: { confirm?: boolean }) => { const entry = entryOf(arg); return entry && this.stop(entry, options?.confirm ?? true); }),
      vscode.commands.registerCommand("veyraPorts.revealFolder", (arg?: unknown) => { const cwd = entryOf(arg)?.process.cwd; return cwd && vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(cwd)); }),
      vscode.commands.registerCommand("veyraPorts.freePort", (port?: unknown) => this.freePort(typeof port === "number" ? port : undefined)),
      vscode.commands.registerCommand("veyraPorts.toggleSystem", () => settings().update("showSystemPorts", !settings().get<boolean>("showSystemPorts"), vscode.ConfigurationTarget.Global)),
      // For tests and other extensions: the current ports, freshly scanned.
      vscode.commands.registerCommand("veyraPorts.list", async () => (await this.refresh())?.entries ?? []),
    );
    void this.refresh();
  }

  private options() {
    return {
      workspaces: (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),
      includeSystem: settings().get<boolean>("showSystemPorts", false),
      hidden: new Set(settings().get<number[]>("hiddenPorts", [])),
    };
  }

  /** Scans now, updates the view and status bar, and schedules the next scan. */
  async refresh(): Promise<Snapshot | undefined> {
    if (this.disposed) return undefined;
    clearTimeout(this.timer);
    try {
      const next = await this.scanner.scan(this.options());
      const previous = this.snapshot;
      this.snapshot = next;
      const signature = next.entries.map(e => `${e.key}|${e.process.name}|${e.framework?.id ?? ""}|${e.workspace ?? ""}|${e.protected}`).join("\n");
      if (signature !== this.signature) { this.signature = signature; this.provider.show(next); }
      this.updateStatus(next);
      this.announce(diffSnapshots(previous, next).added);
      return next;
    } catch (error) {
      this.signature = "";
      this.provider.show(undefined, error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      this.schedule();
    }
  }

  /** Every few seconds while the view is visible; every 20 seconds otherwise; never while VS Code is in the background. */
  private schedule() {
    clearTimeout(this.timer); // two overlapping refreshes must not start two timers
    if (this.disposed) return;
    const visible = this.view.visible && vscode.window.state.focused;
    const delay = visible ? Math.max(1, settings().get<number>("refreshInterval", 3)) * 1000 : BACKGROUND_REFRESH_MS;
    this.timer = setTimeout(() => { if (vscode.window.state.focused) void this.refresh(); else this.schedule(); }, delay);
  }

  private updateStatus(snapshot: Snapshot) {
    const yours = snapshot.entries.filter(entry => !entry.protected);
    this.view.badge = yours.length ? { value: yours.length, tooltip: `${yours.length} of your programs use ports` } : undefined;
    this.view.description = snapshot.entries.length ? `${snapshot.entries.length} in use` : "";
    if (!settings().get<boolean>("statusBar", true) || !yours.length) { this.status.hide(); return; }
    this.status.text = `$(plug) ${yours.length}`;
    const md = new vscode.MarkdownString(`**Veyra Port Manager** · ${yours.length} port${yours.length === 1 ? "" : "s"} in use\n\n`, true);
    for (const entry of yours.slice(0, 8)) md.appendMarkdown(`- \`${entry.port}\` ${entry.framework?.label ?? entry.process.name}\n`);
    if (yours.length > 8) md.appendMarkdown(`- …and ${yours.length - 8} more\n`);
    md.appendMarkdown(`\nClick to show them all.`);
    this.status.tooltip = md;
    this.status.show();
  }

  /** A web dev server just started in this workspace: offer to open it. */
  private announce(added: PortEntry[]) {
    if (!settings().get<boolean>("notifyNewServers", true)) return;
    for (const entry of added) {
      if (!entry.workspace || entry.framework?.kind !== "web" || this.announced.has(entry.key)) continue;
      this.announced.add(entry.key);
      void vscode.window.showInformationMessage(`${entry.framework.label} is running on port ${entry.port}.`, "Open in Browser", "Don't Show Again").then(choice => {
        if (choice === "Open in Browser") void this.open(entry);
        if (choice === "Don't Show Again") void settings().update("notifyNewServers", false, vscode.ConfigurationTarget.Global);
      });
    }
  }

  /** Remote SSH, WSL, Codespaces: asExternalUri forwards the port so the page opens in the local browser. */
  private async open(entry: PortEntry) {
    await vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(pageUrl(entry))));
  }

  private async copy(entry: PortEntry) {
    const address = (await vscode.env.asExternalUri(vscode.Uri.parse(pageUrl(entry)))).toString();
    await vscode.env.clipboard.writeText(address);
    vscode.window.setStatusBarMessage(`$(copy) Copied ${address}`, 3000);
  }

  /** Stops the program behind a port, after confirming and re-checking it still holds that port. */
  async stop(entry: PortEntry, confirm = true): Promise<boolean> {
    if (entry.protected) { void vscode.window.showWarningMessage(`${entry.process.name} is protected and can't be stopped from here.`); return false; }
    if (confirm) {
      const what = entry.framework?.label ?? entry.process.name;
      const others = (this.snapshot?.byPid.get(entry.pid) ?? []).filter(e => e.port !== entry.port).map(e => e.port);
      const detail = `${entry.process.command ?? entry.process.name}\n\nProcess ID ${entry.pid}${others.length ? `. It also uses port${others.length > 1 ? "s" : ""} ${others.join(", ")}.` : "."} Unsaved work in that program may be lost.`;
      const choice = await vscode.window.showWarningMessage(`Stop ${what} on port ${entry.port}?`, { modal: true, detail }, "Stop");
      if (choice !== "Stop") return false;
    }
    // The process may have ended and its ID been reused since the last scan: check with a fresh, uncached scan.
    const current = await this.scanner.scan(this.options(), true);
    const still = current.byPid.get(entry.pid)?.find(e => e.port === entry.port);
    if (!still || still.process.name !== entry.process.name) { void this.refresh(); vscode.window.setStatusBarMessage(`Port ${entry.port} is already free`, 3000); return true; }
    try {
      let gone = await stopProcess(entry.pid);
      if (!gone && isAlive(entry.pid)) {
        const force = await vscode.window.showWarningMessage(`${entry.process.name} didn't close. Force it to stop?`, { modal: true }, "Force Stop");
        if (force === "Force Stop") gone = await stopProcess(entry.pid, true);
      }
      if (gone) vscode.window.setStatusBarMessage(`$(check) Stopped ${entry.process.name}: port ${entry.port} is free`, 4000);
      return gone;
    } catch (error) {
      void vscode.window.showErrorMessage(`Couldn't stop ${entry.process.name}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      void this.refresh();
    }
  }

  /** "Port 3000 is already in use": find what holds a port and free it. */
  private async freePort(given?: number) {
    const input = given ?? Number(await vscode.window.showInputBox({
      title: "Free a Port", prompt: "Which port is busy? For example 3000, 5173 or 8080.", placeHolder: "3000",
      validateInput: value => /^\d{1,5}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 65535 ? undefined : "Enter a port number from 1 to 65535.",
    }) ?? NaN);
    if (!Number.isInteger(input)) return;
    const snapshot = await this.scanner.scan({ ...this.options(), includeSystem: true, hidden: new Set() }, true);
    const holders = snapshot.byPort.get(input) ?? [];
    if (!holders.length) { void vscode.window.showInformationMessage(`Port ${input} is free. Nothing is using it.`); return; }
    const stoppable = holders.filter(entry => !entry.protected);
    if (!stoppable.length) {
      const holder = holders[0];
      void vscode.window.showWarningMessage(`Port ${input} is used by ${holder.framework?.label ?? holder.process.name} (${holder.process.name}, PID ${holder.pid}), which is ${holder.framework?.kind === "editor" ? "part of your code editor" : "a system program"} and can't be stopped from here.`);
      return;
    }
    const target = stoppable.length === 1 ? stoppable[0] : (await vscode.window.showQuickPick(
      stoppable.map(entry => ({ label: `$(debug-stop) ${entry.framework?.label ?? entry.process.name}`, description: `${entry.process.name} · PID ${entry.pid}`, detail: entry.process.command, entry })),
      { title: `Port ${input} is used by ${stoppable.length} programs`, placeHolder: "Choose one to stop" }))?.entry;
    if (target) await this.stop(target);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    for (const disposable of this.disposables) disposable.dispose();
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new PortManager());
}

export function deactivate() { /* PortManager is disposed through the extension context */ }
