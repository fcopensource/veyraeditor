// Veyra Blast Radius: know what your change can break before you commit.
import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as M from "./model";
import { graphHtml, type GraphData, type GraphNode } from "./graphView";

type Mode = "changes" | "file";
const cfg = () => vscode.workspace.getConfiguration("veyraBlast");
const setContext = (key: string, value: unknown) => vscode.commands.executeCommand("setContext", `veyraBlast.${key}`, value);
const decoder = new TextDecoder();

// ------------------------------------------------------------------------------------------------ one folder

/** The import graph of one workspace folder, kept up to date as files change. */
class Project {
  readonly files = new Set<string>();
  readonly specs = new Map<string, string[]>();   // what each file imports, as written
  graph = new M.Graph();
  ctx: M.ResolveContext = { files: this.files, aliases: [], baseUrls: [], pyRoots: [""] };
  ready = false;
  truncatedScan = false;

  constructor(readonly folder: vscode.WorkspaceFolder) {}

  /** The workspace-relative POSIX path of a file in this folder, or null. (path.relative ignores the drive letter's
   *  case on Windows, where VS Code may report "c:" for the folder and "C:" for a file.) */
  rel(uri: vscode.Uri): string | null {
    if (uri.scheme !== this.folder.uri.scheme) return null;
    const r = path.relative(this.folder.uri.fsPath, uri.fsPath);
    if (!r || r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r)) return null;
    return r.split(path.sep).join("/");
  }
  uri(rel: string) { return vscode.Uri.joinPath(this.folder.uri, ...rel.split("/")); }

  private excludeGlob() {
    const list = cfg().get<string[]>("exclude", []);
    return list.length ? `{${list.join(",")}}` : undefined;
  }

  async scan(token?: vscode.CancellationToken) {
    const max = cfg().get<number>("maxFiles", 20000);
    const exclude = this.excludeGlob();
    const [uris, configs] = await Promise.all([
      vscode.workspace.findFiles(new vscode.RelativePattern(this.folder, M.SOURCE_GLOB), exclude, max + 1, token),
      vscode.workspace.findFiles(new vscode.RelativePattern(this.folder, "**/{tsconfig,jsconfig}*.json"), exclude, 200, token),
    ]);
    this.truncatedScan = uris.length > max;
    this.files.clear(); this.specs.clear();
    for (const u of uris.slice(0, max)) { const r = this.rel(u); if (r) this.files.add(r); }
    // Path aliases from every tsconfig/jsconfig (monorepos have several).
    const aliases: M.Alias[] = [], baseUrls: string[] = [];
    for (const u of configs) {
      const r = this.rel(u); if (!r) continue;
      try { const { aliases: a, baseUrl } = M.aliasesFromTsconfig(r, decoder.decode(await vscode.workspace.fs.readFile(u))); aliases.push(...a); if (baseUrl !== null) baseUrls.push(baseUrl); } catch { /* unreadable */ }
    }
    aliases.sort((a, b) => b.prefix.length - a.prefix.length);
    this.ctx = { files: this.files, aliases, baseUrls, pyRoots: M.pythonRoots(this.files) };
    // Read every file's imports, a batch at a time.
    const list = [...this.files];
    for (let i = 0; i < list.length; i += 64) {
      if (token?.isCancellationRequested) return;
      await Promise.all(list.slice(i, i + 64).map(f => this.readSpecs(f)));
    }
    this.resolveAll();
    this.ready = true;
  }

  private async readSpecs(file: string) {
    try { this.specs.set(file, M.importsOf(file, decoder.decode(await vscode.workspace.fs.readFile(this.uri(file))))); }
    catch { this.specs.set(file, []); }
  }

  /** Re-resolves every import (after files were added or removed, which can change what an import points to). */
  resolveAll() {
    const g = new M.Graph();
    for (const [file, list] of this.specs) {
      const out = new Set<string>();
      for (const s of list) { const hit = M.resolveImport(s, file, this.ctx); if (hit) out.add(hit); }
      g.setImports(file, out);
    }
    this.graph = g;
  }

  /** A file was saved or changed on disk. */
  async changed(file: string) {
    if (!this.files.has(file)) return this.created(file);
    await this.readSpecs(file);
    const out = new Set<string>();
    for (const s of this.specs.get(file) ?? []) { const hit = M.resolveImport(s, file, this.ctx); if (hit) out.add(hit); }
    this.graph.setImports(file, out);
  }
  async created(file: string) {
    this.files.add(file);
    if (file.endsWith("__init__.py")) this.ctx.pyRoots = M.pythonRoots(this.files);
    await this.readSpecs(file);
    this.resolveAll();
  }
  deleted(file: string) {
    if (!this.files.delete(file)) return;
    this.specs.delete(file);
    this.resolveAll();
  }

  /** Files that imported `file` before it was deleted. */
  ghostImporters = (file: string) => (this.files.has(file) ? [] : M.importersOfMissing(file, this.specs, this.ctx));

  /** Uncommitted changes in this folder (staged, unstaged and untracked), as folder-relative paths. */
  async gitChanges(): Promise<string[] | null> {
    const cwd = this.folder.uri.fsPath;
    const run = (args: string[]) => new Promise<string>((resolve, reject) =>
      execFile("git", args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
    try {
      const prefix = (await run(["rev-parse", "--show-prefix"])).trim();
      const all = M.parseGitStatus(await run(["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
      return all.filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length));
    } catch { return null; } // not a git repository, or git is not installed
  }

  radius(changed: string[]) {
    const code = changed.filter(f => M.langOf(f)); // deleted files too: their importers break
    return M.blastRadius(this.graph, code, cfg().get<number>("maxDepth", 8), this.ghostImporters);
  }

  async packageJson(): Promise<string | null> {
    try { return decoder.decode(await vscode.workspace.fs.readFile(this.uri("package.json"))); } catch { return null; }
  }
}

// ------------------------------------------------------------------------------------------------ the result

type Result = { project: Project; radius: M.Radius; nonCode: number; subject: string };

class BlastRadius implements vscode.Disposable {
  private readonly projects = new Map<string, Project>();
  private readonly disposables: vscode.Disposable[] = [];
  private mode: Mode = "changes";
  private pinned: vscode.Uri | null = null;      // "Show Blast Radius of This File" on a file that isn't open
  results: Result[] = [];
  private scanning = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this.emitter.event;
  noGit = false;

  constructor() {
    this.mode = vscode.workspace.isTrusted ? "changes" : "file";
    void setContext("mode", this.mode);
  }

  get currentMode() { return this.mode; }
  projectFor(uri: vscode.Uri) { const f = vscode.workspace.getWorkspaceFolder(uri); return f ? this.projects.get(f.uri.toString()) : undefined; }

  async start() {
    const watch = vscode.workspace.createFileSystemWatcher(M.SOURCE_GLOB);
    const onFile = (kind: "change" | "create" | "delete") => async (uri: vscode.Uri) => {
      const p = this.projectFor(uri); const rel = p?.rel(uri);
      if (!p || !rel || !p.ready || /(^|\/)(node_modules|\.git)\//.test(rel)) return;
      if (kind === "delete") p.deleted(rel); else if (kind === "create") await p.created(rel); else await p.changed(rel);
      this.schedule();
    };
    const configs = vscode.workspace.createFileSystemWatcher("**/{tsconfig,jsconfig}*.json");
    this.disposables.push(
      watch, configs, this.emitter,
      watch.onDidChange(onFile("change")), watch.onDidCreate(onFile("create")), watch.onDidDelete(onFile("delete")),
      configs.onDidChange(() => this.rescan()), configs.onDidCreate(() => this.rescan()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.rescan()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => { this.setMode("changes"); }),
      vscode.window.onDidChangeActiveTextEditor(e => { if (this.mode === "file" && e && M.langOf(e.document.uri.path)) { this.pinned = null; this.schedule(50); } }),
      vscode.window.onDidChangeWindowState(s => { if (s.focused && this.mode === "changes") this.schedule(300); }),
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraBlast.exclude") || e.affectsConfiguration("veyraBlast.maxFiles")) this.rescan(); else if (e.affectsConfiguration("veyraBlast")) this.schedule(0); }),
    );
    this.hookGit();
    await this.rescan();
  }

  /** Refresh when the built-in Git extension sees a commit, stage, checkout or stash. */
  private hookGit() {
    const ext = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { state: { onDidChange: vscode.Event<void> } }[]; onDidOpenRepository: vscode.Event<{ state: { onDidChange: vscode.Event<void> } }> } }>("vscode.git");
    if (!ext) return;
    const attach = () => {
      try {
        const api = ext.exports.getAPI(1);
        for (const r of api.repositories) this.disposables.push(r.state.onDidChange(() => this.schedule(400)));
        this.disposables.push(api.onDidOpenRepository(r => this.disposables.push(r.state.onDidChange(() => this.schedule(400)))));
      } catch { /* git extension disabled */ }
    };
    if (ext.isActive) attach(); else ext.activate().then(attach, () => undefined);
  }

  async rescan() {
    this.scanning = true; void setContext("state", "scanning"); this.emitter.fire();
    this.projects.clear();
    for (const f of vscode.workspace.workspaceFolders ?? []) if (f.uri.scheme === "file") this.projects.set(f.uri.toString(), new Project(f));
    await vscode.window.withProgress({ location: { viewId: "veyraBlast.tree" }, title: "Reading imports" }, async () => {
      await Promise.all([...this.projects.values()].map(p => p.scan().catch(() => undefined)));
    });
    this.scanning = false;
    await this.compute();
  }

  schedule(ms = 250) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.compute(), ms);
  }

  setMode(mode: Mode, pinned: vscode.Uri | null = null) {
    this.mode = mode; this.pinned = pinned;
    void setContext("mode", mode);
    void this.compute();
  }

  private async compute() {
    if (this.scanning) return;
    const results: Result[] = [];
    if (this.mode === "changes" && vscode.workspace.isTrusted) {
      this.noGit = true;
      for (const p of this.projects.values()) {
        if (!p.ready) continue;
        const changes = await p.gitChanges();
        if (changes === null) continue;
        this.noGit = false;
        const code = changes.filter(f => M.langOf(f));
        if (!changes.length) continue;
        results.push({ project: p, radius: p.radius(code), nonCode: changes.length - code.length, subject: "your uncommitted changes" });
      }
    } else {
      const uri = this.pinned ?? vscode.window.activeTextEditor?.document.uri;
      const p = uri && this.projectFor(uri); const rel = uri && p?.rel(uri);
      if (p && rel && M.langOf(rel) && p.ready) results.push({ project: p, radius: p.radius([rel]), nonCode: 0, subject: rel.split("/").pop()! });
    }
    this.results = results;
    const any = results.some(r => r.radius.hits.length);
    void setContext("state", this.projects.size === 0 || ![...this.projects.values()].some(p => p.files.size) ? "noProject" : any || results.some(r => r.nonCode) ? "ready" : "empty");
    void setContext("hasTests", results.some(r => r.radius.byKind.test.length) && vscode.workspace.isTrusted);
    this.emitter.fire();
  }

  /** For CodeLens: direct importers and total blast radius of one file. */
  usage(uri: vscode.Uri): { direct: number; total: number } | null {
    const p = this.projectFor(uri); const rel = p?.rel(uri);
    if (!p || !rel || !p.ready || !p.files.has(rel)) return null;
    const r = M.blastRadius(p.graph, [rel], cfg().get<number>("maxDepth", 8));
    return { direct: p.graph.importersOf(rel).size, total: r.hits.length - 1 };
  }

  get isScanning() { return this.scanning; }
  dispose() { clearTimeout(this.timer); for (const d of this.disposables) d.dispose(); }
}

// ------------------------------------------------------------------------------------------------ the tree

type Node =
  | { type: "folder"; result: Result }
  | { type: "group"; result: Result; kind: M.Kind }
  | { type: "file"; result: Result; hit: M.Hit }
  | { type: "note"; text: string; tooltip?: string; command?: vscode.Command };

const KIND_ICON: Record<M.Kind, string> = { changed: "diff-modified", test: "beaker", route: "globe", component: "symbol-class", config: "settings-gear", source: "file-code" };
const KIND_COLOR_ID: Record<M.Kind, string> = { changed: "charts.red", test: "charts.green", route: "charts.yellow", component: "charts.purple", config: "charts.blue", source: "foreground" };

class Tree implements vscode.TreeDataProvider<Node> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  constructor(private readonly br: BlastRadius) { br.onDidUpdate(() => this.changeEmitter.fire()); }

  getChildren(node?: Node): Node[] {
    const results = this.br.results;
    if (!node) {
      if (this.br.isScanning) return [];
      if (this.br.currentMode === "changes" && this.br.noGit && vscode.workspace.isTrusted && results.length === 0) {
        return [{ type: "note", text: "This folder isn't a git repository.", tooltip: "Uncommitted changes come from git. Show the blast radius of the open file instead.", command: { title: "", command: "veyraBlast.modeFile" } }];
      }
      if (results.length > 1) return results.map(result => ({ type: "folder", result }));
      return results.length ? this.groups(results[0]) : [];
    }
    if (node.type === "folder") return this.groups(node.result);
    if (node.type === "group") return node.result.radius.byKind[node.kind].map(hit => ({ type: "file", result: node.result, hit }));
    return [];
  }

  private groups(result: Result): Node[] {
    const out: Node[] = [];
    const r = result.radius;
    if (!r.changed.length && result.nonCode) out.push({ type: "note", text: `${result.nonCode} changed file${result.nonCode === 1 ? "" : "s"}, none of them code`, tooltip: "Blast Radius follows JavaScript, TypeScript, Vue, Svelte, Astro and Python imports." });
    for (const kind of ["changed", "test", "route", "component", "config", "source"] as M.Kind[]) if (r.byKind[kind].length) out.push({ type: "group", result, kind });
    if (r.changed.length && r.hits.length === r.changed.length) out.push({ type: "note", text: "Nothing else imports these files. Safe to change." });
    if (r.truncated) out.push({ type: "note", text: `More files beyond ${cfg().get("maxDepth", 8)} hops`, tooltip: "Raise veyraBlast.maxDepth to follow them." });
    if (result.project.truncatedScan) out.push({ type: "note", text: `Only the first ${cfg().get("maxFiles", 20000)} files were read`, tooltip: "Raise veyraBlast.maxFiles for this project." });
    return out;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === "note") {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon("info");
      item.tooltip = node.tooltip; item.command = node.command;
      return item;
    }
    if (node.type === "folder") {
      const n = node.result.radius.hits.length - node.result.radius.changed.length;
      const item = new vscode.TreeItem(node.result.project.folder.name, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.result.radius.changed.length} changed · ${n} affected`;
      item.iconPath = new vscode.ThemeIcon("root-folder");
      return item;
    }
    if (node.type === "group") {
      const list = node.result.radius.byKind[node.kind];
      const collapsed = node.kind === "source" && list.length > 15 || node.kind === "component" && list.length > 25;
      const item = new vscode.TreeItem(M.KIND_LABEL[node.kind], collapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(list.length);
      item.iconPath = new vscode.ThemeIcon(KIND_ICON[node.kind], new vscode.ThemeColor(KIND_COLOR_ID[node.kind]));
      item.contextValue = `group-${node.kind}`;
      item.id = `${node.result.project.folder.uri}#${node.kind}`;
      return item;
    }
    const { hit, result } = node;
    const uri = result.project.uri(hit.file);
    const item = new vscode.TreeItem(uri);
    const dir = M.dirOf(hit.file);
    const exists = result.project.files.has(hit.file);
    item.description = [dir, hit.depth ? `${hit.depth} hop${hit.depth === 1 ? "" : "s"}` : exists ? "" : "deleted"].filter(Boolean).join(" · ");
    const chain = M.pathTo(result.radius, hit.file);
    item.tooltip = new vscode.MarkdownString(hit.depth
      ? `**${hit.file}**\n\nAffected through ${hit.depth} import${hit.depth === 1 ? "" : "s"}:\n\n${chain.map(f => `\`${f}\``).join(" → ")}`
      : `**${hit.file}**\n\n${exists ? "Changed" : "Deleted: every file that imported it breaks"}`);
    item.contextValue = hit.kind === "changed" ? "changed" : "affected";
    if (exists) item.command = { title: "Open", command: "vscode.open", arguments: [uri] };
    item.id = `${result.project.folder.uri}#${hit.kind}#${hit.file}`;
    return item;
  }
}

// ------------------------------------------------------------------------------------------------ graph panel

class GraphPanel {
  private static panel: vscode.WebviewPanel | undefined;
  static show(br: BlastRadius, actions: { copy(): void; run(): void }) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("veyraBlast.graph", "Blast Radius", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: false });
      const sub = br.onDidUpdate(() => this.render(br));
      this.panel.onDidDispose(() => { sub.dispose(); this.panel = undefined; });
      this.panel.webview.onDidReceiveMessage((m: { type: string; file?: string }) => {
        if (m.type === "open" && m.file) {
          const hit = br.results.find(r => r.radius.hits.some(h => h.file === m.file));
          if (hit) void vscode.window.showTextDocument(hit.project.uri(m.file), { viewColumn: vscode.ViewColumn.One, preview: true });
        } else if (m.type === "copy") actions.copy();
        else if (m.type === "run") actions.run();
      });
    } else this.panel.reveal(undefined, true);
    this.render(br);
  }
  private static render(br: BlastRadius) {
    if (!this.panel) return;
    const r = br.results[0];
    const LIMIT = 220;
    let nodes: GraphNode[] = [], edges: [string, string][] = [], hidden = 0;
    if (r) {
      const hits = r.radius.hits;
      const kept = hits.slice(0, LIMIT);
      hidden = hits.length - kept.length;
      const keep = new Set(kept.map(h => h.file));
      nodes = kept.map(h => ({ id: h.file, label: h.file.split("/").pop()!, dir: M.dirOf(h.file), kind: h.kind, depth: h.depth, via: h.via }));
      for (const h of kept) {
        for (const imp of r.project.graph.importsOf(h.file)) if (keep.has(imp)) edges.push([h.file, imp]);
        if (h.via && !r.project.graph.importsOf(h.file).has(h.via)) edges.push([h.file, h.via]); // deleted-file edges
      }
      if (edges.length > 900) edges = edges.filter(([a, b]) => nodes.find(n => n.id === a)?.via === b);
    }
    const affected = r ? r.radius.hits.length - r.radius.changed.length : 0;
    const data: GraphData = {
      title: r ? `Blast radius of ${r.subject}` : "Blast Radius",
      subtitle: r ? `${r.radius.changed.length} changed · ${affected} affected · ${r.radius.byKind.test.length} test${r.radius.byKind.test.length === 1 ? "" : "s"} to run${br.results.length > 1 ? ` · showing ${r.project.folder.name}` : ""}` : "No changes yet",
      nodes, edges, hidden,
      canRunTests: !!r && r.radius.byKind.test.length > 0 && vscode.workspace.isTrusted,
    };
    this.panel.webview.html = graphHtml(data, randomBytes(16).toString("base64"), this.panel.webview.cspSource);
  }
}

// ------------------------------------------------------------------------------------------------ activate

export async function activate(context: vscode.ExtensionContext) {
  const br = new BlastRadius();
  const tree = new Tree(br);
  const view = vscode.window.createTreeView("veyraBlast.tree", { treeDataProvider: tree, showCollapseAll: true });

  const status = vscode.window.createStatusBarItem("veyraBlast.status", vscode.StatusBarAlignment.Left, 40);
  status.name = "Blast Radius";
  status.command = "veyraBlast.tree.focus";
  const updateStatus = () => {
    const all = br.results.filter(r => r.radius.changed.length);
    const changed = all.reduce((n, r) => n + r.radius.changed.length, 0);
    const affected = all.reduce((n, r) => n + r.radius.hits.length - r.radius.changed.length, 0);
    const tests = all.reduce((n, r) => n + r.radius.byKind.test.length, 0);
    view.badge = br.currentMode === "changes" && affected ? { value: affected, tooltip: `${affected} files affected by your changes` } : undefined;
    view.description = br.currentMode === "changes" ? "uncommitted changes" : br.results[0]?.subject;
    if (!cfg().get("statusBar", true) || br.currentMode !== "changes" || !changed) { status.hide(); return; }
    status.text = `$(flame) ${affected} affected${tests ? ` · $(beaker) ${tests}` : ""}`;
    status.tooltip = `Blast Radius: ${changed} changed file${changed === 1 ? "" : "s"} can affect ${affected} other file${affected === 1 ? "" : "s"}${tests ? `, including ${tests} test${tests === 1 ? "" : "s"}` : ""}. Click to see them.`;
    status.show();
  };
  br.onDidUpdate(updateStatus);

  const copyReport = async () => {
    const r = br.results.find(x => x.radius.hits.length);
    if (!r) { void vscode.window.showInformationMessage("Blast Radius: nothing to report yet. Change a file first."); return; }
    const pkg = await r.project.packageJson();
    const tests = r.radius.byKind.test.map(h => h.file);
    const runner = M.detectRunner(pkg, r.project.files.size > 0 && [...r.project.files].some(f => f.endsWith(".py")), tests);
    await vscode.env.clipboard.writeText(M.markdownReport(r.radius, runner));
    void vscode.window.showInformationMessage("Blast Radius: impact report copied. Paste it into your pull request.");
  };

  const runTests = async () => {
    if (!vscode.workspace.isTrusted) { void vscode.window.showWarningMessage("Blast Radius doesn't run tests in Restricted Mode. Trust this folder to run them."); return; }
    const r = br.results.find(x => x.radius.byKind.test.length);
    if (!r) { void vscode.window.showInformationMessage("Blast Radius: no tests depend on these files."); return; }
    const tests = [...new Set(r.radius.byKind.test.map(h => h.file))];
    const custom = cfg().get<string>("testCommand", "").trim();
    let command: string | null = null;
    if (custom) command = custom.includes("${files}") ? custom.replace("${files}", tests.join(" ")) : `${custom} ${tests.join(" ")}`;
    else {
      const runner = M.detectRunner(await r.project.packageJson(), [...r.project.files].some(f => f.endsWith(".py")), tests);
      command = runner?.command(tests) ?? null;
    }
    if (!command) {
      const pick = await vscode.window.showWarningMessage("Blast Radius couldn't tell which test runner this project uses.", "Set Test Command");
      if (pick) void vscode.commands.executeCommand("workbench.action.openSettings", "veyraBlast.testCommand");
      return;
    }
    const terminal = vscode.window.terminals.find(t => t.name === "Blast Radius tests") ?? vscode.window.createTerminal({ name: "Blast Radius tests", cwd: r.project.folder.uri });
    terminal.show(true);
    terminal.sendText(command);
  };

  const fileArg = (arg: unknown): vscode.Uri | undefined => {
    if (arg instanceof vscode.Uri) return arg;
    const n = arg as Node | undefined;
    if (n && n.type === "file") return n.result.project.uri(n.hit.file);
    return vscode.window.activeTextEditor?.document.uri;
  };

  const codeLensEmitter = new vscode.EventEmitter<void>();
  br.onDidUpdate(() => codeLensEmitter.fire());
  const selector: vscode.DocumentSelector = [{ scheme: "file", pattern: `**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,astro,py}` }];

  context.subscriptions.push(
    br, view, status, codeLensEmitter,
    vscode.commands.registerCommand("veyraBlast.refresh", () => br.rescan()),
    vscode.commands.registerCommand("veyraBlast.modeChanges", () => {
      if (!vscode.workspace.isTrusted) { void vscode.window.showWarningMessage("Uncommitted changes come from git, which Blast Radius doesn't run in Restricted Mode."); return; }
      br.setMode("changes");
    }),
    vscode.commands.registerCommand("veyraBlast.modeFile", () => br.setMode("file")),
    vscode.commands.registerCommand("veyraBlast.forFile", (arg?: unknown) => {
      const uri = fileArg(arg);
      if (!uri || !M.langOf(uri.path)) { void vscode.window.showInformationMessage("Blast Radius works with JavaScript, TypeScript, Vue, Svelte, Astro and Python files."); return; }
      br.setMode("file", uri);
      void vscode.commands.executeCommand("veyraBlast.tree.focus");
    }),
    vscode.commands.registerCommand("veyraBlast.showGraph", () => GraphPanel.show(br, { copy: copyReport, run: runTests })),
    vscode.commands.registerCommand("veyraBlast.runTests", runTests),
    vscode.commands.registerCommand("veyraBlast.copyReport", copyReport),
    vscode.commands.registerCommand("veyraBlast.copyPath", (n?: Node) => { if (n?.type === "file") void vscode.env.clipboard.writeText(n.hit.file); }),
    vscode.commands.registerCommand("veyraBlast.why", async (n?: Node) => {
      if (n?.type !== "file") return;
      const chain = M.pathTo(n.result.radius, n.hit.file);
      const pick = await vscode.window.showQuickPick(
        chain.map((f, i) => ({ label: `${i === 0 ? "$(diff-modified)" : "$(arrow-down)"} ${f.split("/").pop()}`, description: f, detail: i === 0 ? "changed" : `imports ${chain[i - 1].split("/").pop()}`, file: f })),
        { title: `Why is ${n.hit.file.split("/").pop()} affected?`, placeHolder: "Each file imports the one above it. Pick one to open it." });
      if (pick && n.result.project.files.has(pick.file)) void vscode.window.showTextDocument(n.result.project.uri(pick.file));
    }),
    vscode.languages.registerCodeLensProvider(selector, {
      onDidChangeCodeLenses: codeLensEmitter.event,
      provideCodeLenses(doc) {
        if (!cfg().get("codeLens", true)) return [];
        const u = br.usage(doc.uri);
        if (!u) return [];
        const title = u.direct === 0 ? "$(flame) Not imported by any file" : `$(flame) Used by ${u.direct} file${u.direct === 1 ? "" : "s"} · blast radius ${u.total}`;
        return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title, command: "veyraBlast.forFile", arguments: [doc.uri], tooltip: "See every file that depends on this one" })];
      },
    }),
  );
  await br.start();
  // For tests and other extensions.
  return { tree, view, results: () => br.results.map(r => ({ folder: r.project.folder.name, radius: r.radius })), usage: (u: vscode.Uri) => br.usage(u), mode: () => br.currentMode, refresh: () => br.rescan(), whenIdle: () => new Promise<void>(res => { const sub = br.onDidUpdate(() => { if (!br.isScanning) { sub.dispose(); res(); } }); }) };
}

export function deactivate() { /* disposables are cleaned up by VS Code */ }
