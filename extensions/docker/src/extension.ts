import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import * as m from "./model";
import { Docker, DockerError, type Stream } from "./docker";
import { DashboardPanel, LogsPanel } from "./panels";

/* Veyra Container Studio: Docker containers, images, volumes, networks and Compose in VS Code. */

const config = () => vscode.workspace.getConfiguration("veyraDocker");

// ---------- What Docker has ----------

export class Store {
  containers: m.Container[] = [];
  images: m.Image[] = [];
  volumes: m.Volume[] = [];
  networks: m.Network[] = [];
  version?: { client: string; server: string; os: string; context: string };
  error?: m.Explanation;
  loaded = false;
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private running?: Promise<void>;
  private again = false;

  constructor(readonly docker: Docker) {}

  /** Reads everything again. Calls made while one is running are folded into one more read. */
  refresh(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      try {
        if (!this.version || this.error) this.version = await this.docker.version();
        const [containers, images, volumes, networks] = await Promise.all([this.docker.containers(), this.docker.images(), this.docker.volumes(), this.docker.networks()]);
        Object.assign(this, { containers, images, volumes, networks, error: undefined });
      } catch (error) {
        this.error = error instanceof DockerError ? error.explained : m.explainError(String((error as Error)?.message ?? error));
        Object.assign(this, { containers: [], images: [], volumes: [], networks: [], version: undefined });
      } finally {
        this.loaded = true;
        this.running = undefined;
        this.emitter.fire();
        if (this.again) { this.again = false; void this.refresh(); }
      }
    })();
    return this.running;
  }
  get runningContainers() { return this.containers.filter(c => c.state === "running"); }
  dispose() { this.emitter.dispose(); }
}

/** Keeps the views current: follows `docker events`, and checks every few seconds while Docker is off. */
class Watcher implements vscode.Disposable {
  private stream?: Stream;
  private timer?: NodeJS.Timeout;
  private debounce?: NodeJS.Timeout;
  private disposed = false;
  constructor(private store: Store) {}
  start() {
    if (this.disposed) return;
    this.stop();
    if (this.store.error) { this.timer = setTimeout(async () => { await this.store.refresh(); this.start(); }, 5000); return; }
    this.stream = this.store.docker.stream(["events", "--format", "{{json .}}"], () => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.store.refresh(), 350);
    });
    this.stream.done.then(async () => { if (this.disposed) return; await this.store.refresh(); this.timer = setTimeout(() => this.start(), 3000); });
  }
  private stop() { this.stream?.stop(); this.stream = undefined; clearTimeout(this.timer); }
  dispose() { this.disposed = true; this.stop(); clearTimeout(this.debounce); }
}

// ---------- Sidebar ----------

type Node =
  | { kind: "problem"; error: m.Explanation }
  | { kind: "project"; group: m.ContainerGroup; files: string[] }
  | { kind: "other"; group: m.ContainerGroup }
  | { kind: "container"; container: m.Container }
  | { kind: "image"; image: m.Image }
  | { kind: "volume"; volume: m.Volume }
  | { kind: "network"; network: m.Network };

const color = (id: string) => new vscode.ThemeColor(id);
function problemItem(error: m.Explanation): vscode.TreeItem {
  const item = new vscode.TreeItem(error.title, vscode.TreeItemCollapsibleState.None);
  item.description = error.action === "startDocker" ? "click to start it" : error.action === "install" ? "click to get it" : "";
  item.tooltip = new vscode.MarkdownString(`**${error.title}**\n\n${error.detail}`);
  item.iconPath = new vscode.ThemeIcon("warning", color("problemsWarningIcon.foreground"));
  item.command = error.action === "startDocker" ? { command: "veyraDocker.startDocker", title: "Start Docker" }
    : error.action === "install" ? { command: "vscode.open", title: "Get Docker", arguments: [vscode.Uri.parse("https://docs.docker.com/get-started/get-docker/")] }
    : { command: "veyraDocker.refresh", title: "Try again" };
  return item;
}

abstract class Tree implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(protected store: Store) { store.onDidChange(() => this.emitter.fire()); }
  getChildren(node?: Node): Node[] {
    if (!this.store.loaded) return [];
    if (!node && this.store.error) return [{ kind: "problem", error: this.store.error }];
    return this.children(node);
  }
  abstract children(node?: Node): Node[];
  abstract item(node: Node): vscode.TreeItem;
  getTreeItem(node: Node) { return node.kind === "problem" ? problemItem(node.error) : this.item(node); }
}

class ContainersTree extends Tree {
  children(node?: Node): Node[] {
    if (node?.kind === "project" || node?.kind === "other") return node.group.containers.map(container => ({ kind: "container", container }));
    if (node) return [];
    const groups = m.groupContainers(this.store.containers);
    if (groups.length === 1 && !groups[0].project) return groups[0].containers.map(container => ({ kind: "container", container }));
    return groups.map(group => (group.project ? { kind: "project", group, files: (group.configFiles ?? []).filter(f => fs.existsSync(f)) } : { kind: "other", group }));
  }
  item(node: Node): vscode.TreeItem {
    if (node.kind === "project" || node.kind === "other") {
      const g = node.group;
      const item = new vscode.TreeItem(g.project ?? "Other containers", vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${g.running} of ${g.containers.length} running`;
      item.iconPath = new vscode.ThemeIcon(node.kind === "project" ? "layers" : "folder", g.running ? color("charts.green") : undefined);
      if (node.kind === "project") {
        item.contextValue = `project${node.files.length ? "-files" : ""}`;
        item.tooltip = new vscode.MarkdownString(`**${g.project}** · Docker Compose project\n\n${node.files.map(f => `\`${f}\``).join("\n\n") || "Its compose file is not on this computer."}`);
      }
      return item;
    }
    if (node.kind !== "container") return new vscode.TreeItem("");
    const c = node.container;
    const item = new vscode.TreeItem(c.service ?? c.name, vscode.TreeItemCollapsibleState.None);
    const ports = c.ports.filter((p, i, all) => all.findIndex(q => q.hostPort === p.hostPort) === i).map(p => `${p.hostPort}→${p.containerPort}`);
    item.description = [m.shortStatus(c), ports.join(" ")].filter(Boolean).join(" · ");
    const exitedBadly = c.state === "exited" && !/^Exited \(0\)/.test(c.status);
    item.iconPath = c.health === "unhealthy" ? new vscode.ThemeIcon("warning", color("charts.red"))
      : c.state === "running" ? new vscode.ThemeIcon("vm-running", color(c.health === "starting" ? "charts.yellow" : "charts.green"))
      : c.state === "paused" ? new vscode.ThemeIcon("debug-pause", color("charts.yellow"))
      : c.state === "restarting" ? new vscode.ThemeIcon("sync~spin", color("charts.yellow"))
      : exitedBadly || c.state === "dead" ? new vscode.ThemeIcon("error", color("charts.red"))
      : new vscode.ThemeIcon("vm-outline");
    const group = c.state === "running" ? "running" : c.state === "paused" ? "paused" : c.state === "restarting" ? "running" : "stopped";
    item.contextValue = `container-${group}${c.ports.length ? "-ports" : ""}`;
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${c.name}** ${c.health ? `· ${c.health}` : ""}\n\n`);
    md.appendMarkdown(`Image: \`${c.image}\`\n\nStatus: ${c.status}\n\n`);
    if (c.ports.length) md.appendMarkdown(`Ports: ${c.ports.map(p => `[${p.hostPort}](${m.portUrl(p)}) → ${p.containerPort}/${p.protocol}`).join(", ")}\n\n`);
    if (c.project) md.appendMarkdown(`Compose: ${c.project} / ${c.service}\n\n`);
    md.appendMarkdown(`ID: \`${c.id}\``);
    item.tooltip = md;
    item.id = `container:${c.id}`;
    return item;
  }
}

class ImagesTree extends Tree {
  children(node?: Node): Node[] {
    if (node) return [];
    return [...this.store.images].sort((a, b) => Number(a.dangling) - Number(b.dangling) || a.repository.localeCompare(b.repository) || a.tag.localeCompare(b.tag)).map(image => ({ kind: "image", image }));
  }
  item(node: Node): vscode.TreeItem {
    if (node.kind !== "image") return new vscode.TreeItem("");
    const i = node.image;
    const used = this.store.containers.filter(c => c.image === `${i.repository}:${i.tag}` || (i.tag === "latest" && c.image === i.repository) || c.image === i.id || i.id.startsWith(c.image));
    const item = new vscode.TreeItem(i.dangling ? `untagged ${i.id.replace(/^sha256:/, "").slice(0, 12)}` : `${i.repository}:${i.tag}`, vscode.TreeItemCollapsibleState.None);
    item.description = [i.size, i.created, used.length ? `used by ${used.length}` : ""].filter(Boolean).join(" · ");
    item.iconPath = new vscode.ThemeIcon(i.dangling ? "file-binary" : "package", used.some(c => c.state === "running") ? color("charts.green") : undefined);
    item.contextValue = i.dangling ? "image-dangling" : "image-tagged";
    item.tooltip = new vscode.MarkdownString(`**${i.dangling ? "Untagged image" : `${i.repository}:${i.tag}`}**\n\nSize: ${i.size}\n\nCreated: ${i.created}\n\nID: \`${i.id}\`${used.length ? `\n\nUsed by: ${used.map(c => c.name).join(", ")}` : ""}${i.dangling ? "\n\nLeft over from an older build. Safe to remove when nothing uses it." : ""}`);
    item.id = `image:${i.id}:${i.repository}:${i.tag}`;
    return item;
  }
}

class VolumesTree extends Tree {
  children(node?: Node): Node[] { return node ? [] : [...this.store.volumes].sort((a, b) => a.name.localeCompare(b.name)).map(volume => ({ kind: "volume", volume })); }
  item(node: Node): vscode.TreeItem {
    if (node.kind !== "volume") return new vscode.TreeItem("");
    const v = node.volume;
    const anonymous = /^[0-9a-f]{64}$/.test(v.name);
    const item = new vscode.TreeItem(anonymous ? `${v.name.slice(0, 12)}…` : v.name, vscode.TreeItemCollapsibleState.None);
    item.description = [v.project ? `compose: ${v.project}` : anonymous ? "anonymous" : "", v.driver !== "local" ? v.driver : ""].filter(Boolean).join(" · ");
    item.iconPath = new vscode.ThemeIcon("database");
    item.contextValue = "volume";
    item.tooltip = new vscode.MarkdownString(`**${v.name}**\n\nDriver: ${v.driver}${v.project ? `\n\nCompose project: ${v.project}` : ""}`);
    item.id = `volume:${v.name}`;
    return item;
  }
}

class NetworksTree extends Tree {
  children(node?: Node): Node[] { return node ? [] : [...this.store.networks].sort((a, b) => Number(a.builtIn) - Number(b.builtIn) || a.name.localeCompare(b.name)).map(network => ({ kind: "network", network })); }
  item(node: Node): vscode.TreeItem {
    if (node.kind !== "network") return new vscode.TreeItem("");
    const n = node.network;
    const item = new vscode.TreeItem(n.name, vscode.TreeItemCollapsibleState.None);
    item.description = `${n.driver}${n.builtIn ? " · built in" : ""}`;
    item.iconPath = new vscode.ThemeIcon("type-hierarchy");
    item.contextValue = n.builtIn ? "network-builtin" : "network-custom";
    item.id = `network:${n.id}`;
    return item;
  }
}

// ---------- Running docker in a terminal ----------

let taskCounter = 0;
/** Runs docker in VS Code's terminal so its output stays visible. Resolves with the exit code. */
async function runTask(docker: Docker, title: string, args: string[], cwd?: string): Promise<number | undefined> {
  const folder = (cwd && vscode.workspace.getWorkspaceFolder(vscode.Uri.file(cwd))) || vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    // Tasks need a folder: fall back to a plain terminal.
    const terminal = vscode.window.createTerminal({ name: `Docker: ${title}`, shellPath: docker.command, shellArgs: args, cwd, iconPath: new vscode.ThemeIcon("package") });
    terminal.show();
    return undefined;
  }
  const task = new vscode.Task({ type: "veyra-docker", run: `${title} ${++taskCounter}` }, folder, title, "Docker", new vscode.ProcessExecution(docker.command, args, { cwd: cwd ?? folder.uri.fsPath }));
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, showReuseMessage: false, echo: true };
  const execution = await vscode.tasks.executeTask(task);
  return new Promise(resolve => {
    const sub = vscode.tasks.onDidEndTaskProcess(e => { if (e.execution === execution) { sub.dispose(); resolve(e.exitCode); } });
  });
}

// ---------- Compose files and Dockerfiles ----------

interface ComposeTarget { files: string[]; project?: string; cwd: string; label: string }
async function composeTarget(arg: unknown, store: Store): Promise<ComposeTarget | undefined> {
  const node = arg as Node | undefined;
  if (node?.kind === "project") {
    const files = node.files;
    return { files, project: node.group.project, cwd: files[0] ? path.dirname(files[0]) : process.cwd(), label: node.group.project! };
  }
  const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
  if (uri && m.COMPOSE_FILE.test(path.basename(uri.fsPath))) return { files: [uri.fsPath], cwd: path.dirname(uri.fsPath), label: path.basename(path.dirname(uri.fsPath)) };
  const found = await vscode.workspace.findFiles("**/{docker-compose,compose}*.{yml,yaml}", "**/node_modules/**", 20);
  const projects = m.groupContainers(store.containers).filter(g => g.project);
  if (!found.length && !projects.length) { vscode.window.showInformationMessage("No compose file was found in this folder."); return undefined; }
  const picks = [
    ...found.map(f => ({ label: vscode.workspace.asRelativePath(f), description: "compose file", target: { files: [f.fsPath], cwd: path.dirname(f.fsPath), label: path.basename(path.dirname(f.fsPath)) } as ComposeTarget })),
    ...projects.filter(g => !found.some(f => g.configFiles?.includes(f.fsPath))).map(g => ({ label: g.project!, description: `running project · ${g.running} of ${g.containers.length} up`, target: { files: (g.configFiles ?? []).filter(f => fs.existsSync(f)), project: g.project, cwd: process.cwd(), label: g.project! } as ComposeTarget })),
  ];
  if (picks.length === 1) return picks[0].target;
  return (await vscode.window.showQuickPick(picks, { placeHolder: "Which Compose project?" }))?.target;
}
const composeArgs = (t: ComposeTarget, ...rest: string[]) => ["compose", ...(t.project ? ["-p", t.project] : []), ...t.files.flatMap(f => ["-f", f]), ...rest];

function dockerfileFor(arg: unknown): vscode.Uri | undefined {
  const uri = arg instanceof vscode.Uri ? arg : vscode.window.activeTextEditor?.document.uri;
  return uri && isDockerfile(uri.fsPath) ? uri : undefined;
}
const isDockerfile = (file: string) => /(^|\.)(Dockerfile|Containerfile)$|^(Dockerfile|Containerfile)\.|\.dockerfile$/i.test(path.basename(file));
const isCompose = (doc: vscode.TextDocument) => m.COMPOSE_FILE.test(path.basename(doc.fileName));
function hasDockerignore(dockerfile: string) {
  const dir = path.dirname(dockerfile);
  return fs.existsSync(path.join(dir, ".dockerignore")) || fs.existsSync(`${dockerfile}.dockerignore`);
}
function trusted(what: string): boolean {
  if (vscode.workspace.isTrusted) return true;
  vscode.window.showWarningMessage(`${what} is turned off in Restricted Mode, because it runs code from this folder. Trust the folder to use it.`, "Manage Workspace Trust")
    .then(pick => { if (pick) vscode.commands.executeCommand("workbench.trust.manage"); });
  return false;
}

class Lenses implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  constructor(store: Store) { store.onDidChange(() => this.emitter.fire()); vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration("veyraDocker.codeLens") && this.emitter.fire()); }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!config().get<boolean>("codeLens", true)) return [];
    const top = new vscode.Range(0, 0, 0, 0);
    if (isCompose(doc)) {
      const services = m.composeServices(doc.getText());
      if (!services.length) return [];
      const lenses = [
        new vscode.CodeLens(top, { title: "▶ Compose Up", command: "veyraDocker.composeUp", arguments: [doc.uri] }),
        new vscode.CodeLens(top, { title: "Rebuild", command: "veyraDocker.composeBuild", arguments: [doc.uri] }),
        new vscode.CodeLens(top, { title: "■ Down", command: "veyraDocker.composeDown", arguments: [doc.uri] }),
        new vscode.CodeLens(top, { title: "Logs", command: "veyraDocker.composeLogs", arguments: [doc.uri] }),
      ];
      for (const s of services) lenses.push(new vscode.CodeLens(new vscode.Range(s.line, 0, s.line, 0), { title: `▶ Up ${s.name}`, command: "veyraDocker.composeUp", arguments: [doc.uri, s.name] }));
      return lenses;
    }
    if (isDockerfile(doc.fileName) || doc.languageId === "dockerfile") {
      const from = m.instructions(doc.getText()).find(i => i.keyword === "FROM");
      if (!from) return [];
      const at = new vscode.Range(from.line, 0, from.line, 0);
      return [
        new vscode.CodeLens(at, { title: "▶ Build and Run", command: "veyraDocker.buildRun", arguments: [doc.uri] }),
        new vscode.CodeLens(at, { title: "Build Image", command: "veyraDocker.buildImage", arguments: [doc.uri] }),
      ];
    }
    return [];
  }
}

class Checks implements vscode.CodeActionProvider {
  readonly collection = vscode.languages.createDiagnosticCollection("veyra-docker");
  private findings = new Map<string, m.Finding[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  check(doc: vscode.TextDocument, delay = 250) {
    if (!(doc.languageId === "dockerfile" || isDockerfile(doc.fileName)) || doc.uri.scheme === "output") return;
    clearTimeout(this.timers.get(doc.uri.toString()));
    this.timers.set(doc.uri.toString(), setTimeout(() => {
      if (!config().get<boolean>("dockerfile.checks", true)) { this.collection.delete(doc.uri); return; }
      const findings = m.lintDockerfile(doc.getText(), { hasDockerignore: doc.uri.scheme === "file" ? hasDockerignore(doc.fileName) : undefined });
      this.findings.set(doc.uri.toString(), findings);
      this.collection.set(doc.uri, findings.map(f => {
        const d = new vscode.Diagnostic(new vscode.Range(f.line, f.start, f.line, f.end), f.message, f.severity === "error" ? vscode.DiagnosticSeverity.Error : f.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
        d.source = "Veyra Docker";
        d.code = f.code;
        return d;
      }));
    }, delay));
  }
  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const d of context.diagnostics) {
      if (d.source !== "Veyra Docker") continue;
      const fix = (this.findings.get(doc.uri.toString()) ?? []).find(f => f.code === d.code && f.line === d.range.start.line && f.start === d.range.start.character)?.fix;
      if (!fix) continue;
      const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(doc.uri, doc.lineAt(d.range.start.line).range, fix.text);
      action.diagnostics = [d];
      action.isPreferred = true;
      actions.push(action);
    }
    return actions;
  }
  forget(uri: vscode.Uri) { this.collection.delete(uri); this.findings.delete(uri.toString()); }
  dispose() { this.collection.dispose(); this.timers.forEach(clearTimeout); }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const docker = new Docker(config().get<string>("command") || "docker");
  const store = new Store(docker);
  const watcher = new Watcher(store);
  const trees = { containers: new ContainersTree(store), images: new ImagesTree(store), volumes: new VolumesTree(store), networks: new NetworksTree(store) };
  const views = Object.entries(trees).map(([id, tree]) => vscode.window.createTreeView(`veyraDocker.${id}`, { treeDataProvider: tree, showCollapseAll: id === "containers", canSelectMany: id !== "networks" }));
  const [containersView] = views;
  const update = () => {
    containersView.badge = store.runningContainers.length ? { value: store.runningContainers.length, tooltip: `${store.runningContainers.length} running` } : undefined;
  };
  store.onDidChange(update);

  // Status bar
  const status = vscode.window.createStatusBarItem("veyraDocker.status", vscode.StatusBarAlignment.Left, 50);
  status.name = "Docker";
  status.command = "veyraDocker.dashboard";
  const showStatus = () => {
    if (!config().get<boolean>("statusBar", true) || !store.loaded) { status.hide(); return; }
    const running = store.runningContainers.length;
    status.text = store.error ? "$(vm-outline) Docker off" : `$(vm-running) ${running}`;
    status.tooltip = store.error ? `${store.error.title}. ${store.error.detail}` : `${running} running container${running === 1 ? "" : "s"} · Docker ${store.version?.server ?? ""}${store.version?.context && store.version.context !== "default" ? ` (${store.version.context})` : ""}\nClick to open the Docker Dashboard`;
    status.show();
  };
  store.onDidChange(showStatus);

  const ensureRunning = () => {
    if (!store.error) return true;
    const action = store.error.action === "startDocker" ? "Start Docker" : undefined;
    vscode.window.showErrorMessage(`${store.error.title}. ${store.error.detail}`, ...(action ? [action] : [])).then(pick => pick && vscode.commands.executeCommand("veyraDocker.startDocker"));
    return false;
  };
  const report = (error: unknown, what: string) => {
    const why = error instanceof DockerError ? error.explained : m.explainError(String((error as Error)?.message ?? error));
    const actions = why.action === "cleanup" ? ["Open Dashboard"] : why.action === "login" ? ["Sign In"] : why.action === "startDocker" ? ["Start Docker"] : [];
    vscode.window.showErrorMessage(`${what}: ${why.title}. ${why.detail}`, ...actions).then(pick => {
      if (pick === "Open Dashboard") vscode.commands.executeCommand("veyraDocker.cleanup");
      if (pick === "Sign In") vscode.commands.executeCommand("veyraDocker.login");
      if (pick === "Start Docker") vscode.commands.executeCommand("veyraDocker.startDocker");
    });
  };
  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...args: any[]) => {
    try { await fn(...args); } catch (error) { report(error, "Docker"); }
  }));

  /** The nodes a command acts on: the clicked one, or every selected one when it was part of the selection. */
  const picked = <K extends Node["kind"]>(kind: K, node: Node | undefined, selected?: Node[]): Extract<Node, { kind: K }>[] => {
    const list = selected?.length && node && selected.includes(node) ? selected : node ? [node] : views.flatMap(v => [...v.selection] as Node[]);
    return list.filter((n): n is Extract<Node, { kind: K }> => n.kind === kind);
  };
  const containersOf = (node?: Node, selected?: Node[]) => picked("container", node, selected).map(n => n.container);

  const withProgress = <T>(title: string, work: () => Promise<T>) => vscode.window.withProgress({ location: { viewId: "veyraDocker.containers" }, title }, work);
  const act = async (action: "start" | "stop" | "restart" | "pause" | "unpause", node?: Node, selected?: Node[]) => {
    const list = containersOf(node, selected);
    if (!list.length || !ensureRunning()) return;
    try { await withProgress(`${action} ${list.map(c => c.name).join(", ")}`, () => docker.containerAction(action, list.map(c => c.id))); }
    catch (error) { report(error, `Could not ${action} ${list.length === 1 ? list[0].name : `${list.length} containers`}`); }
    await store.refresh();
  };
  for (const action of ["start", "stop", "restart", "pause", "unpause"] as const) register(`veyraDocker.${action}`, (node?: Node, selected?: Node[]) => act(action, node, selected));

  register("veyraDocker.refresh", () => store.refresh());
  register("veyraDocker.startDocker", async () => {
    const tried = await startDockerDesktop();
    if (tried) vscode.window.setStatusBarMessage("$(sync~spin) Starting Docker…", 20000);
    else vscode.window.showInformationMessage(process.platform === "linux" ? "Start Docker with: sudo systemctl start docker" : "Start Docker Desktop from your applications.", "Get Docker")
      .then(pick => pick && vscode.env.openExternal(vscode.Uri.parse("https://docs.docker.com/get-started/get-docker/")));
  });
  register("veyraDocker.dashboard", () => DashboardPanel.show(context, store));
  register("veyraDocker.cleanup", () => DashboardPanel.show(context, store, true));

  register("veyraDocker.logs", (node?: Node) => {
    const [c] = containersOf(node);
    if (c) LogsPanel.show(context, docker, { kind: "container", id: c.id, name: c.name });
  });
  register("veyraDocker.shell", async (node?: Node) => {
    const [c] = containersOf(node);
    if (!c || !ensureRunning()) return;
    const windows = store.version?.os.startsWith("windows");
    const args = windows ? ["exec", "-it", c.id, "powershell"] : ["exec", "-it", c.id, "sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"];
    const terminal = vscode.window.createTerminal({ name: `${c.service ?? c.name} (container)`, shellPath: docker.command, shellArgs: args, iconPath: new vscode.ThemeIcon("vm-running") });
    terminal.show();
  });
  register("veyraDocker.openPort", async (node?: Node) => {
    const [c] = containersOf(node);
    if (!c?.ports.length) return;
    const unique = c.ports.filter((p, i, all) => all.findIndex(q => q.hostPort === p.hostPort) === i);
    const port = unique.length === 1 ? unique[0] : (await vscode.window.showQuickPick(unique.map(p => ({ label: m.portUrl(p), description: `container port ${p.containerPort}/${p.protocol}`, port: p })), { placeHolder: "Which port?" }))?.port;
    if (port) await vscode.env.openExternal(vscode.Uri.parse(m.portUrl(port)));
  });
  register("veyraDocker.inspect", async (node?: Node) => {
    if (!node || !ensureRunning()) return;
    const [kind, id] = node.kind === "container" ? ["container", node.container.id] : node.kind === "image" ? ["image", node.image.id] : node.kind === "volume" ? ["volume", node.volume.name] : node.kind === "network" ? ["network", node.network.id] : [];
    if (!kind || !id) return;
    const data = await docker.inspect(id, kind as any);
    const doc = await vscode.workspace.openTextDocument({ language: "json", content: JSON.stringify(data, null, 2) });
    await vscode.window.showTextDocument(doc, { preview: true });
  });
  register("veyraDocker.copyId", async (node?: Node) => {
    const id = node?.kind === "container" ? node.container.id : node?.kind === "image" ? node.image.id : node?.kind === "network" ? node.network.id : undefined;
    if (id) { await vscode.env.clipboard.writeText(id); vscode.window.setStatusBarMessage(`Copied ${id}`, 2500); }
  });
  register("veyraDocker.copyName", async (node?: Node) => {
    const name = node?.kind === "container" ? node.container.name : node?.kind === "image" ? (node.image.dangling ? node.image.id : `${node.image.repository}:${node.image.tag}`) : node?.kind === "volume" ? node.volume.name : node?.kind === "network" ? node.network.name : undefined;
    if (name) { await vscode.env.clipboard.writeText(name); vscode.window.setStatusBarMessage(`Copied ${name}`, 2500); }
  });

  register("veyraDocker.remove", async (node?: Node, selected?: Node[]) => {
    if (!ensureRunning()) return;
    const containers = containersOf(node, selected);
    if (containers.length) {
      const running = containers.filter(c => c.state === "running" || c.state === "paused" || c.state === "restarting");
      const names = containers.length === 1 ? `"${containers[0].name}"` : `${containers.length} containers`;
      const ok = await vscode.window.showWarningMessage(`Remove ${names}?`, { modal: true, detail: `${running.length ? `${running.length === containers.length ? (containers.length === 1 ? "It is" : "They are") : `${running.length} of them are`} running and will be stopped first. ` : ""}Anonymous volumes they created are removed too. Named volumes are kept.` }, running.length ? "Stop and Remove" : "Remove");
      if (!ok) return;
      try { await withProgress(`Removing ${names}`, () => docker.removeContainers(containers.map(c => c.id), running.length > 0)); }
      catch (error) { report(error, `Could not remove ${names}`); }
      return store.refresh();
    }
    const images = picked("image", node, selected).map(n => n.image);
    if (images.length) {
      const label = (i: m.Image) => (i.dangling ? i.id.replace(/^sha256:/, "").slice(0, 12) : `${i.repository}:${i.tag}`);
      const names = images.length === 1 ? `"${label(images[0])}"` : `${images.length} images`;
      const ok = await vscode.window.showWarningMessage(`Remove ${names}?`, { modal: true, detail: "You can download or build it again later." }, "Remove");
      if (!ok) return;
      for (const i of images) {
        try { await docker.removeImage(i.dangling ? i.id : label(i)); }
        catch (error) {
          const why = error instanceof DockerError ? error.explained : undefined;
          if (why?.title === "The image is in use") {
            const force = await vscode.window.showWarningMessage(`${label(i)}: ${why.title}. ${why.detail}`, { modal: true }, "Remove Anyway");
            if (force) await docker.removeImage(i.dangling ? i.id : label(i), true).catch(e => report(e, `Could not remove ${label(i)}`));
          } else report(error, `Could not remove ${label(i)}`);
        }
      }
      return store.refresh();
    }
    const volumes = picked("volume", node, selected).map(n => n.volume);
    if (volumes.length) {
      const names = volumes.length === 1 ? `"${volumes[0].name}"` : `${volumes.length} volumes`;
      const ok = await vscode.window.showWarningMessage(`Delete ${names}?`, { modal: true, detail: "The data in it is deleted permanently. This cannot be undone." }, "Delete");
      if (!ok) return;
      for (const v of volumes) await docker.removeVolume(v.name).catch(e => report(e, `Could not delete ${v.name}`));
      return store.refresh();
    }
    const network = picked("network", node, selected)[0]?.network;
    if (network && !network.builtIn) {
      const ok = await vscode.window.showWarningMessage(`Remove the network "${network.name}"?`, { modal: true }, "Remove");
      if (ok) await docker.removeNetwork(network.id).catch(e => report(e, `Could not remove ${network.name}`));
      return store.refresh();
    }
  });

  // Images
  register("veyraDocker.pullImage", async () => {
    if (!ensureRunning()) return;
    const name = await vscode.window.showInputBox({ title: "Pull an image", prompt: "Image name, with a tag if you want a specific version", placeHolder: "nginx:alpine, postgres:16, node:22-slim", validateInput: v => (/^[\w][\w.\-/:@]*$/.test(v.trim()) ? undefined : "Use a name like nginx:alpine") });
    if (name) await runTask(docker, `pull ${name.trim()}`, ["pull", name.trim()]);
  });
  register("veyraDocker.runImage", async (node?: Node) => {
    if (!ensureRunning()) return;
    let image = node?.kind === "image" ? (node.image.dangling ? node.image.id : `${node.image.repository}:${node.image.tag}`) : undefined;
    if (!image) {
      const choices = store.images.filter(i => !i.dangling).map(i => ({ label: `${i.repository}:${i.tag}`, description: i.size }));
      const pick = await vscode.window.showQuickPick([...choices, { label: "$(cloud-download) Another image…", description: "from Docker Hub or a registry" }], { placeHolder: "Which image?" });
      if (!pick) return;
      image = pick.label.startsWith("$(") ? (await vscode.window.showInputBox({ prompt: "Image name", placeHolder: "nginx:alpine" }))?.trim() : pick.label;
      if (!image) return;
    }
    let exposed: number[] = [];
    try { exposed = Object.keys((await docker.inspect(image, "image"))?.Config?.ExposedPorts ?? {}).map(p => Number(p.split("/")[0])).filter(Boolean); } catch { /* not pulled yet */ }
    const ports = await vscode.window.showInputBox({
      title: `Run ${image}`, prompt: "Ports to publish, as host:container (leave empty for none)", value: exposed.map(p => `${p}:${p}`).join(" "), placeHolder: "8080:80 5432:5432",
      validateInput: v => (v.trim() === "" || v.trim().split(/[\s,]+/).every(p => /^(\d+:)?\d+(\/(tcp|udp))?$/.test(p)) ? undefined : "Use host:container, like 8080:80"),
    });
    if (ports === undefined) return;
    const detached = await vscode.window.showQuickPick([{ label: "In the background", description: "docker run -d", detached: true }, { label: "In a terminal", description: "see its output, Ctrl+C stops it", detached: false }], { placeHolder: "How should it run?" });
    if (!detached) return;
    const args = ["run", ...(detached.detached ? ["-d"] : ["--rm", "-it"]), ...ports.trim().split(/[\s,]+/).filter(Boolean).flatMap(p => ["-p", p.includes(":") ? p : `${p}:${p}`]), image];
    await runTask(docker, `run ${image}`, args);
  });
  register("veyraDocker.tagImage", async (node?: Node) => {
    if (node?.kind !== "image") return;
    const source = node.image.dangling ? node.image.id : `${node.image.repository}:${node.image.tag}`;
    const target = await vscode.window.showInputBox({ title: `Tag ${source}`, prompt: "New name, for example to push it: your-name/app:1.0 or ghcr.io/you/app:1.0", value: node.image.dangling ? "" : source, validateInput: v => (/^[a-z0-9][\w.\-/:]*$/.test(v.trim()) ? undefined : "Names use lowercase letters, digits and . _ - / :") });
    if (target) { await docker.tag(source, target.trim()); await store.refresh(); }
  });
  register("veyraDocker.pushImage", async (node?: Node) => {
    if (node?.kind !== "image" || node.image.dangling) return;
    await runTask(docker, `push ${node.image.repository}:${node.image.tag}`, ["push", `${node.image.repository}:${node.image.tag}`]);
  });
  register("veyraDocker.login", async () => {
    const registry = await vscode.window.showInputBox({ title: "Sign in to a registry", prompt: "Registry address. Leave empty for Docker Hub.", placeHolder: "ghcr.io, registry.gitlab.com, myregistry.azurecr.io" });
    if (registry === undefined) return;
    const terminal = vscode.window.createTerminal({ name: "Docker: sign in", shellPath: docker.command, shellArgs: ["login", ...(registry.trim() ? [registry.trim()] : [])] });
    terminal.show();
  });

  // Compose
  const compose = (title: string, rest: (t: ComposeTarget, service?: string) => string[], needsFiles: boolean, refreshAfter = true) => async (arg?: unknown, service?: string) => {
    if (!ensureRunning()) return;
    const target = await composeTarget(arg, store);
    if (!target) return;
    if (needsFiles && !target.files.length) { vscode.window.showWarningMessage(`The compose file for "${target.label}" is not on this computer, so it cannot be started from here.`); return; }
    if (needsFiles && !trusted("Starting Compose projects")) return;
    const code = await runTask(docker, `${title} ${service ?? target.label}`, composeArgs(target, ...rest(target, service)), target.cwd);
    if (refreshAfter) void store.refresh();
    if (code === 0 && title === "up") {
      vscode.window.showInformationMessage(`${service ? `"${service}"` : `"${target.label}"`} is up.`, "View Logs").then(pick => pick && LogsPanel.show(context, docker, { kind: "project", name: target.project ?? target.label, args: composeArgs(target), service }));
    }
  };
  register("veyraDocker.composeUp", compose("up", (_t, service) => ["up", "-d", "--remove-orphans", ...(service ? [service] : [])], true));
  register("veyraDocker.composeBuild", compose("up --build", (_t, service) => ["up", "-d", "--build", "--remove-orphans", ...(service ? [service] : [])], true));
  register("veyraDocker.composeDown", compose("down", () => ["down"], false));
  register("veyraDocker.composeRestart", compose("restart", () => ["restart"], false));
  register("veyraDocker.composePull", compose("pull", () => ["pull"], true));
  register("veyraDocker.composeLogs", async (arg?: unknown) => {
    const target = await composeTarget(arg, store);
    if (target) LogsPanel.show(context, docker, { kind: "project", name: target.project ?? target.label, args: composeArgs(target) });
  });

  // Dockerfiles
  const build = async (arg: unknown, thenRun: boolean) => {
    if (!ensureRunning()) return;
    const uri = dockerfileFor(arg) ?? (await vscode.workspace.findFiles("**/{Dockerfile,*.Dockerfile,Containerfile}", "**/node_modules/**", 20).then(async files => {
      if (files.length <= 1) return files[0];
      return (await vscode.window.showQuickPick(files.map(f => ({ label: vscode.workspace.asRelativePath(f), uri: f })), { placeHolder: "Which Dockerfile?" }))?.uri;
    }));
    if (!uri) { vscode.window.showInformationMessage("No Dockerfile was found in this folder."); return; }
    if (!trusted("Building images")) return;
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    if (doc?.isDirty) await doc.save();
    const context_ = path.dirname(uri.fsPath); // the build context: the Dockerfile's folder, as with "docker build ."
    const name = `${m.imageNameFor(path.basename(context_))}:latest`;
    const code = await runTask(docker, `build ${name}`, ["build", "-t", name, "-f", uri.fsPath, context_], context_);
    void store.refresh();
    if (!thenRun) {
      if (code === 0) vscode.window.showInformationMessage(`Built ${name}.`, "Run It").then(pick => pick && vscode.commands.executeCommand("veyraDocker.buildRun", uri));
      return;
    }
    if (code !== 0 && code !== undefined) return;
    const text = fs.readFileSync(uri.fsPath, "utf8");
    const containerName = m.imageNameFor(path.basename(context_));
    const existing = store.containers.find(c => c.name === containerName);
    if (existing) await docker.removeContainers([existing.id], true).catch(() => undefined);
    await runTask(docker, `run ${name}`, m.runArgs(name, m.exposedPorts(text), containerName), context_);
  };
  register("veyraDocker.buildImage", (arg?: unknown) => build(arg, false));
  register("veyraDocker.buildRun", (arg?: unknown) => build(arg, true));

  // Editors
  const checks = new Checks();
  const lenses = new Lenses(store);
  const selector: vscode.DocumentSelector = [{ language: "dockerfile" }, { pattern: "**/{Dockerfile,Containerfile,*.Dockerfile,Dockerfile.*}" }, { pattern: "**/{docker-compose,compose}*.{yml,yaml}" }];
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, lenses),
    vscode.languages.registerCodeActionsProvider([{ language: "dockerfile" }, { pattern: "**/{Dockerfile,Containerfile,*.Dockerfile,Dockerfile.*}" }], checks, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(doc => checks.check(doc, 0)),
    vscode.workspace.onDidChangeTextDocument(e => checks.check(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => checks.forget(doc.uri)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("veyraDocker.command")) { docker.command = config().get<string>("command") || "docker"; store.version = undefined; void store.refresh().then(() => watcher.start()); }
      if (e.affectsConfiguration("veyraDocker.dockerfile.checks")) vscode.workspace.textDocuments.forEach(d => checks.check(d, 0));
      if (e.affectsConfiguration("veyraDocker.statusBar")) showStatus();
    }),
    checks, status, watcher, store, ...views,
  );
  vscode.workspace.textDocuments.forEach(doc => checks.check(doc, 0));

  void store.refresh().then(() => watcher.start());
  return { store, docker }; // for the integration tests
}

/** Opens Docker Desktop where it is installed. Returns false when it is not found. */
async function startDockerDesktop(): Promise<boolean> {
  const { spawn } = await import("node:child_process");
  const launch = (cmd: string, args: string[]) => { const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: false }); child.on("error", () => undefined); child.unref(); };
  if (process.platform === "win32") {
    const exe = [process.env.ProgramFiles, process.env.ProgramW6432, "C:\\Program Files"].filter(Boolean).map(p => path.join(p!, "Docker", "Docker", "Docker Desktop.exe")).find(p => fs.existsSync(p));
    if (!exe) return false;
    launch(exe, []);
    return true;
  }
  if (process.platform === "darwin") {
    if (!fs.existsSync("/Applications/Docker.app")) return false;
    launch("open", ["-a", "Docker"]);
    return true;
  }
  if (fs.existsSync("/opt/docker-desktop/bin/docker-desktop") || fs.existsSync("/usr/lib/systemd/user/docker-desktop.service")) { launch("systemctl", ["--user", "start", "docker-desktop"]); return true; }
  return false;
}

export function deactivate() { LogsPanel.closeAll(); }
