// Veyra Hotspots: a living heat map of your codebase, from your own git history.
import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as M from "./model";
import { mapHtml } from "./mapHtml";

const cfg = () => vscode.workspace.getConfiguration("veyraHotspots");
const setContext = (key: string, value: unknown) => vscode.commands.executeCommand("setContext", `veyraHotspots.${key}`, value);
const MAX_FILE_BYTES = 512 * 1024;

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile("git", args, { cwd, maxBuffer: 512 * 1024 * 1024, windowsHide: true }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
}

// ------------------------------------------------------------------------------------------------ analysis of one folder

type Result = { folder: vscode.WorkspaceFolder; analysis: M.Analysis; months: number };

async function analyzeFolder(folder: vscode.WorkspaceFolder, token: { cancelled: boolean }): Promise<Result | "noGit"> {
  const cwd = folder.uri.fsPath;
  try { await git(cwd, ["rev-parse", "--is-inside-work-tree"]); } catch { return "noGit"; }
  const months = cfg().get<number>("months", 12);
  const now = Date.now();
  const since = months > 0 ? now - months * 30.4375 * M.DAY : null;
  const globs = cfg().get<string[]>("exclude", []).map(M.globToRegExp);

  // Files in the repository today, then their shape.
  const tracked = (await git(cwd, ["ls-files", "-z"])).split("\0").filter(p => p && !M.excluded(p, globs));
  const shapes = new Map<string, M.Shape>();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (let i = 0; i < tracked.length; i += 64) {
    if (token.cancelled) throw new Error("cancelled");
    await Promise.all(tracked.slice(i, i + 64).map(async rel => {
      try {
        const uri = vscode.Uri.joinPath(folder.uri, ...rel.split("/"));
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.File || stat.size > MAX_FILE_BYTES) return;
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.subarray(0, 8000).includes(0)) return; // binary
        shapes.set(rel, M.measure(decoder.decode(bytes)));
      } catch { /* deleted meanwhile, or unreadable */ }
    }));
  }

  // History, with paths relative to this folder.
  const args = ["log", "--no-merges", "--no-renames", "--numstat", `--format=${M.GIT_LOG_FORMAT}`, "--relative", `-n${cfg().get<number>("maxCommits", 20000)}`];
  if (since) args.push(`--since=${new Date(since).toISOString()}`);
  let log = "";
  try { log = await git(cwd, [...args, "--", "."]); } catch { log = ""; } // a repository with no commits yet
  // For knowledge risk we also need when each author last committed at all, including before the period.
  let commits = M.parseGitLog(log);
  if (since) {
    try {
      const authors = await git(cwd, ["log", "--no-merges", "--format=%ae%x1f%at", `-n${cfg().get<number>("maxCommits", 20000)}`, "--", "."]);
      const seen = new Map<string, number>();
      for (const line of authors.split("\n")) { const [e, t] = line.split("\x1f"); if (e && t) seen.set(e.toLowerCase(), Math.max(seen.get(e.toLowerCase()) ?? 0, +t * 1000)); }
      // Represent each author's latest commit as an empty commit, so analyze() knows who is still active.
      commits = commits.concat([...seen].map(([email, time]) => ({ hash: "", time, author: "", email, files: [] })));
    } catch { /* fine without */ }
  }
  const analysis = M.analyze(commits, shapes, { now, since });
  // The empty "last seen" commits must not count as commits in the period.
  analysis.commits = new Set(commits.filter(c => c.hash && (since === null || c.time >= since)).map(c => c.hash)).size;
  analysis.authors = new Set(commits.filter(c => c.hash && (since === null || c.time >= since)).map(c => c.email)).size;
  return { folder, analysis, months };
}

// ------------------------------------------------------------------------------------------------ state

class Hotspots implements vscode.Disposable {
  private readonly results = new Map<string, Result>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private running: { cancelled: boolean } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  noGit = false;
  scanning = false;
  current: Result | undefined;

  constructor() { this.pickCurrent(); }

  pickCurrent() {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const f = (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0];
    const next = f ? this.results.get(f.uri.toString()) : undefined;
    if (next !== this.current) { this.current = next; this.emitter.fire(); }
  }

  forUri(uri: vscode.Uri): { result: Result; rel: string; file: M.FileStat } | undefined {
    const f = vscode.workspace.getWorkspaceFolder(uri);
    const result = f && this.results.get(f.uri.toString());
    if (!result) return undefined;
    const rel = path.relative(f.uri.fsPath, uri.fsPath).split(path.sep).join("/");
    const file = result.analysis.byPath.get(rel);
    return file ? { result, rel, file } : undefined;
  }

  schedule(ms = 1500) { clearTimeout(this.timer); this.timer = setTimeout(() => void this.refresh(), ms); }

  async refresh() {
    if (!vscode.workspace.isTrusted) return;
    if (this.running) this.running.cancelled = true;
    const token = { cancelled: false };
    this.running = token;
    this.scanning = this.results.size === 0;
    void setContext("state", this.scanning ? "scanning" : "ready");
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(f => f.uri.scheme === "file");
    let anyGit = false;
    await vscode.window.withProgress({ location: { viewId: "veyraHotspots.top" }, title: "Reading git history" }, async () => {
      for (const folder of folders) {
        try {
          const r = await analyzeFolder(folder, token);
          if (token.cancelled) return;
          if (r === "noGit") { this.results.delete(folder.uri.toString()); continue; }
          anyGit = true;
          this.results.set(folder.uri.toString(), r);
        } catch (e) { if (token.cancelled) return; console.error("[Veyra Hotspots]", e); }
      }
    });
    if (token.cancelled) return;
    this.running = null; this.scanning = false; this.noGit = !anyGit;
    this.current = undefined; this.pickCurrent();
    this.current ??= [...this.results.values()][0];
    void setContext("state", this.noGit ? "noGit" : this.current && this.current.analysis.commits === 0 ? "empty" : "ready");
    this.emitter.fire();
  }

  dispose() { clearTimeout(this.timer); this.emitter.dispose(); }
}

// ------------------------------------------------------------------------------------------------ the three lists

const LEVEL_COLOR: Record<M.Level, string> = { critical: "veyraHotspots.critical", high: "veyraHotspots.high", medium: "veyraHotspots.medium", low: "veyraHotspots.low", none: "disabledForeground" };

function fileItem(result: Result, f: M.FileStat, description?: string): vscode.TreeItem {
  const uri = vscode.Uri.joinPath(result.folder.uri, ...f.path.split("/"));
  const item = new vscode.TreeItem(uri);
  const lv = M.level(f.score);
  item.label = f.path.split("/").pop();
  item.description = description ?? `${f.rank ? `#${f.rank} · ` : ""}${f.commits} commit${f.commits === 1 ? "" : "s"} · ${path.posix.dirname(f.path) === "." ? "" : path.posix.dirname(f.path)}`;
  item.iconPath = new vscode.ThemeIcon("flame", new vscode.ThemeColor(LEVEL_COLOR[lv]));
  const md = new vscode.MarkdownString(`**${f.path}**  \n${M.LEVEL_LABEL[lv]}${f.rank ? ` · rank #${f.rank}` : ""}\n\n${M.explain(f, result.analysis)}\n\nLast changed ${M.ago(f.lastChange, result.analysis.until)}.`);
  item.tooltip = md;
  item.command = { title: "Open", command: "vscode.open", arguments: [uri] };
  item.contextValue = "hotFile";
  item.resourceUri = uri;
  return item;
}

type TopNode = { result: Result; file: M.FileStat };
class TopTree implements vscode.TreeDataProvider<TopNode> {
  private readonly e = new vscode.EventEmitter<void>(); readonly onDidChangeTreeData = this.e.event;
  constructor(private readonly hs: Hotspots) { hs.onDidChange(() => this.e.fire()); }
  getChildren(node?: TopNode): TopNode[] {
    const r = this.hs.current;
    if (node || !r) return [];
    return r.analysis.files.filter(f => f.rank > 0).slice(0, 50).map(file => ({ result: r, file }));
  }
  getTreeItem(n: TopNode) { return fileItem(n.result, n.file); }
}

type PairNode = { result: Result; pair?: M.Coupling; file?: M.FileStat };
class CouplingTree implements vscode.TreeDataProvider<PairNode> {
  private readonly e = new vscode.EventEmitter<void>(); readonly onDidChangeTreeData = this.e.event;
  constructor(private readonly hs: Hotspots) { hs.onDidChange(() => this.e.fire()); }
  getChildren(node?: PairNode): PairNode[] {
    const r = this.hs.current;
    if (!r) return [];
    if (!node) return r.analysis.coupling.slice(0, 40).map(pair => ({ result: r, pair }));
    if (node.pair) return [node.pair.a, node.pair.b].map(p => ({ result: r, file: r.analysis.byPath.get(p)! })).filter(n => n.file);
    return [];
  }
  getTreeItem(n: PairNode): vscode.TreeItem {
    if (n.file) return fileItem(n.result, n.file);
    const p = n.pair!;
    const item = new vscode.TreeItem(`${p.a.split("/").pop()} ↔ ${p.b.split("/").pop()}`, vscode.TreeItemCollapsibleState.Collapsed);
    item.description = `${Math.round(p.degree * 100)}% · ${p.shared} commits`;
    const far = path.posix.dirname(p.a) !== path.posix.dirname(p.b);
    item.iconPath = new vscode.ThemeIcon(far ? "link" : "files", new vscode.ThemeColor(p.degree >= 0.75 ? "veyraHotspots.high" : "veyraHotspots.medium"));
    item.tooltip = new vscode.MarkdownString(`**${p.a}**  \n**${p.b}**\n\nChanged together in ${p.shared} commits: ${Math.round(p.degree * 100)}% of the time one changes, so does the other.${far ? "\n\nThey live in different folders, which often means a hidden dependency." : ""}`);
    return item;
  }
}

type KnowNode = { result: Result; file: M.FileStat };
class KnowledgeTree implements vscode.TreeDataProvider<KnowNode> {
  private readonly e = new vscode.EventEmitter<void>(); readonly onDidChangeTreeData = this.e.event;
  constructor(private readonly hs: Hotspots) { hs.onDidChange(() => this.e.fire()); }
  getChildren(node?: KnowNode): KnowNode[] {
    const r = this.hs.current;
    if (node || !r) return [];
    return r.analysis.files.filter(f => f.knowledge !== "shared" && f.commits >= 3)
      .sort((a, b) => Number(b.knowledge === "lost") - Number(a.knowledge === "lost") || b.score - a.score).slice(0, 40)
      .map(file => ({ result: r, file }));
  }
  getTreeItem(n: KnowNode) {
    const f = n.file;
    const item = fileItem(n.result, f, f.knowledge === "lost" ? `${f.authors[0].name} has left · ${f.commits} commits` : `only ${f.authors[0].name} · ${f.commits} commits`);
    item.iconPath = new vscode.ThemeIcon(f.knowledge === "lost" ? "warning" : "person", new vscode.ThemeColor(f.knowledge === "lost" ? "veyraHotspots.critical" : "veyraHotspots.medium"));
    return item;
  }
}

// ------------------------------------------------------------------------------------------------ explorer flames

class Decorations implements vscode.FileDecorationProvider {
  private readonly e = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>(); readonly onDidChangeFileDecorations = this.e.event;
  constructor(private readonly hs: Hotspots) { hs.onDidChange(() => this.e.fire(undefined)); }
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!cfg().get("explorerBadges", true)) return undefined;
    const hit = this.hs.forUri(uri);
    const top = cfg().get<number>("explorerTop", 10);
    if (!hit || !hit.file.rank || hit.file.rank > top) return undefined;
    // A flame means real heat: in the top N and at least warm, so a tiny project's quiet files aren't flagged.
    const lv = M.level(hit.file.score);
    if (lv === "none" || lv === "low") return undefined;
    const c = hit.file.commits;
    return { badge: "🔥", tooltip: `Hotspot #${hit.file.rank}: ${c} commit${c === 1 ? "" : "s"}, ${hit.file.loc} lines`, color: new vscode.ThemeColor(LEVEL_COLOR[lv]) };
  }
}

// ------------------------------------------------------------------------------------------------ the map

class MapPanel {
  static panel: vscode.WebviewPanel | undefined;
  static ready = false;
  private static pendingReveal: string | undefined;

  static show(ctx: vscode.ExtensionContext, hs: Hotspots, actions: { period(): void; report(): void; history(p: string): void }, reveal?: string) {
    this.pendingReveal = reveal;
    if (this.panel) { this.panel.reveal(); this.post(ctx, hs); return; }
    const bundle = vscode.Uri.joinPath(ctx.extensionUri, "bundle");
    const panel = this.panel = vscode.window.createWebviewPanel("veyraHotspots.map", "Hotspot Map", vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [bundle], retainContextWhenHidden: true });
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "icon.png");
    const nonce = randomBytes(16).toString("base64");
    panel.webview.html = mapHtml(panel.webview.asWebviewUri(vscode.Uri.joinPath(bundle, "map.js")).toString(), nonce, panel.webview.cspSource);
    const sub = hs.onDidChange(() => this.post(ctx, hs));
    panel.onDidDispose(() => { sub.dispose(); this.panel = undefined; this.ready = false; });
    panel.webview.onDidReceiveMessage((m: { type: string; path?: string; mode?: M.ColorMode }) => {
      const r = hs.current;
      if (m.type === "ready") { this.ready = true; this.post(ctx, hs); }
      else if (m.type === "open" && m.path && r) void vscode.window.showTextDocument(vscode.Uri.joinPath(r.folder.uri, ...m.path.split("/")), { viewColumn: vscode.ViewColumn.Beside, preview: true });
      else if (m.type === "history" && m.path) actions.history(m.path);
      else if (m.type === "mode" && m.mode) void ctx.workspaceState.update("veyraHotspots.mode", m.mode);
      else if (m.type === "period") actions.period();
      else if (m.type === "report") actions.report();
    });
  }

  static post(ctx: vscode.ExtensionContext, hs: Hotspots) {
    const r = hs.current;
    if (!this.panel || !this.ready || !r) return;
    const a = r.analysis;
    const files = a.files.map(f => ({ ...f, authors: f.authors.slice(0, 5) }));
    void this.panel.webview.postMessage({
      type: "data",
      payload: {
        project: r.folder.name, periodLabel: M.periodLabel(r.months), months: r.months, files, coupling: a.coupling.slice(0, 2000),
        stats: { commits: a.commits, authors: a.authors, maxCommits: a.maxCommits, maxComplexity: a.maxComplexity, since: a.since, until: a.until },
        mode: ctx.workspaceState.get<M.ColorMode>("veyraHotspots.mode", "hotspot"),
      },
    });
    if (this.pendingReveal) { void this.panel.webview.postMessage({ type: "reveal", path: this.pendingReveal }); this.pendingReveal = undefined; }
  }
}

// ------------------------------------------------------------------------------------------------ activate

export async function activate(context: vscode.ExtensionContext) {
  const hs = new Hotspots();
  const top = vscode.window.createTreeView("veyraHotspots.top", { treeDataProvider: new TopTree(hs) });
  const coupling = vscode.window.createTreeView("veyraHotspots.coupling", { treeDataProvider: new CouplingTree(hs), showCollapseAll: true });
  const knowledge = vscode.window.createTreeView("veyraHotspots.knowledge", { treeDataProvider: new KnowledgeTree(hs) });
  const decorations = new Decorations(hs);

  const status = vscode.window.createStatusBarItem("veyraHotspots.status", vscode.StatusBarAlignment.Right, 200);
  status.name = "Hotspots";
  status.command = "veyraHotspots.explainFile";
  const updateStatus = () => {
    const r = hs.current;
    top.description = r ? `${M.periodLabel(r.months)}` : undefined;
    const uri = vscode.window.activeTextEditor?.document.uri;
    const hit = uri && hs.forUri(uri);
    if (!cfg().get("statusBar", true) || !hit || !hit.file.commits) { status.hide(); return; }
    const lv = M.level(hit.file.score);
    status.text = hit.file.rank && hit.file.rank <= 20 ? `$(flame) Hotspot #${hit.file.rank}` : `$(flame) ${M.LEVEL_LABEL[lv]}`;
    status.tooltip = new vscode.MarkdownString(`**${M.LEVEL_LABEL[lv]}**${hit.file.rank ? ` · rank #${hit.file.rank} of ${hit.result.analysis.files.filter(f => f.rank).length}` : ""}\n\n${M.explain(hit.file, hit.result.analysis)}\n\nClick for details.`);
    status.color = lv === "critical" || lv === "high" ? new vscode.ThemeColor(LEVEL_COLOR[lv]) : undefined;
    status.show();
  };
  hs.onDidChange(updateStatus);

  const pickPeriod = async () => {
    const options = [[1, "Last month"], [3, "Last 3 months"], [6, "Last 6 months"], [12, "Last year"], [24, "Last 2 years"], [0, "All history"]] as const;
    const now = cfg().get<number>("months", 12);
    const pick = await vscode.window.showQuickPick(options.map(([m, label]) => ({ label, description: m === now ? "current" : undefined, m })), { title: "How much git history should Hotspots read?" });
    if (pick && pick.m !== now) await cfg().update("months", pick.m, vscode.ConfigurationTarget.Workspace);
  };
  const copyReport = async () => {
    const r = hs.current;
    if (!r) { void vscode.window.showInformationMessage("Hotspots: nothing to report yet."); return; }
    await vscode.env.clipboard.writeText(M.markdownReport(r.analysis, r.months, r.folder.name));
    void vscode.window.showInformationMessage("Hotspots report copied. Paste it into an issue, a pull request or your team chat.");
  };
  const history = async (rel: string) => {
    const r = hs.current; if (!r) return;
    let out = "";
    try { out = await git(r.folder.uri.fsPath, ["log", "--no-merges", "--format=%h%x1f%s%x1f%an%x1f%at", "-n", "100", "--", rel]); } catch { return; }
    const items = out.split("\n").filter(Boolean).map(l => { const [h, s, a, t] = l.split("\x1f"); return { label: s, description: `${a} · ${M.ago(+t * 1000, Date.now())}`, detail: h, hash: h }; });
    const pick = await vscode.window.showQuickPick(items, { title: `${rel}: the last ${items.length} commits`, matchOnDescription: true, placeHolder: "Pick a commit to see what it changed in this file" });
    if (!pick) return;
    const diff = await git(r.folder.uri.fsPath, ["show", "--format=commit %H%nAuthor: %an <%ae>%nDate:   %ad%n%n    %s%n", pick.hash, "--", rel]).catch(() => "");
    const doc = await vscode.workspace.openTextDocument({ content: diff, language: "diff" });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  };
  const nodeUri = (arg: unknown): vscode.Uri | undefined => {
    if (arg instanceof vscode.Uri) return arg;
    const n = arg as { result?: Result; file?: M.FileStat } | undefined;
    if (n?.result && n.file) return vscode.Uri.joinPath(n.result.folder.uri, ...n.file.path.split("/"));
    return vscode.window.activeTextEditor?.document.uri;
  };
  const showMap = (reveal?: string) => MapPanel.show(context, hs, { period: pickPeriod, report: copyReport, history: p => void history(p) }, reveal);

  context.subscriptions.push(
    hs, top, coupling, knowledge, status,
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.commands.registerCommand("veyraHotspots.showMap", () => showMap()),
    vscode.commands.registerCommand("veyraHotspots.refresh", () => hs.refresh()),
    vscode.commands.registerCommand("veyraHotspots.period", pickPeriod),
    vscode.commands.registerCommand("veyraHotspots.copyReport", copyReport),
    vscode.commands.registerCommand("veyraHotspots.history", (arg?: unknown) => { const u = nodeUri(arg); const hit = u && hs.forUri(u); if (hit) void history(hit.rel); }),
    vscode.commands.registerCommand("veyraHotspots.revealInMap", (arg?: unknown) => { const u = nodeUri(arg); const hit = u && hs.forUri(u); showMap(hit?.rel); }),
    vscode.commands.registerCommand("veyraHotspots.explainFile", async (arg?: unknown) => {
      const u = nodeUri(arg); const hit = u && hs.forUri(u);
      if (!hit) { void vscode.window.showInformationMessage(hs.scanning ? "Hotspots is still reading your git history." : "Hotspots has no history for this file (it may be new, generated or excluded)."); return; }
      const lv = M.level(hit.file.score);
      const together = M.coupledWith(hit.result.analysis, hit.rel);
      const actions = ["Show in Map", "File History", ...(together.length ? [`Open ${together.length} Related File${together.length === 1 ? "" : "s"}`] : [])];
      const pick = await vscode.window.showInformationMessage(`${hit.rel}: ${M.LEVEL_LABEL[lv]}${hit.file.rank ? ` (#${hit.file.rank})` : ""}. ${M.explain(hit.file, hit.result.analysis)}`, ...actions);
      if (pick === "Show in Map") showMap(hit.rel);
      else if (pick === "File History") void history(hit.rel);
      else if (pick) void vscode.commands.executeCommand("veyraHotspots.openTogether", u);
    }),
    vscode.commands.registerCommand("veyraHotspots.openTogether", async (arg?: unknown) => {
      const u = nodeUri(arg); const hit = u && hs.forUri(u);
      const together = hit ? M.coupledWith(hit.result.analysis, hit.rel) : [];
      if (!hit || !together.length) { void vscode.window.showInformationMessage("No files change together with this one often enough to be sure."); return; }
      for (const t of together.slice(0, 5)) await vscode.window.showTextDocument(vscode.Uri.joinPath(hit.result.folder.uri, ...t.path.split("/")), { preview: false, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside });
    }),
    vscode.window.onDidChangeActiveTextEditor(() => { hs.pickCurrent(); updateStatus(); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraHotspots.months") || e.affectsConfiguration("veyraHotspots.exclude") || e.affectsConfiguration("veyraHotspots.maxCommits")) void hs.refresh(); else if (e.affectsConfiguration("veyraHotspots")) { updateStatus(); hs.schedule(0); } }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => hs.refresh()),
    vscode.workspace.onDidGrantWorkspaceTrust(() => hs.refresh()),
  );
  // Refresh after commits, pulls and checkouts (the built-in Git extension tells us).
  const gitExt = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { state: { HEAD?: { commit?: string }; onDidChange: vscode.Event<void> } }[]; onDidOpenRepository: vscode.Event<{ state: { HEAD?: { commit?: string }; onDidChange: vscode.Event<void> } }> } }>("vscode.git");
  const watchRepo = (repo: { state: { HEAD?: { commit?: string }; onDidChange: vscode.Event<void> } }) => {
    let head = repo.state.HEAD?.commit;
    context.subscriptions.push(repo.state.onDidChange(() => { const now = repo.state.HEAD?.commit; if (now && now !== head) { head = now; hs.schedule(); } }));
  };
  if (gitExt) void Promise.resolve(gitExt.isActive ? gitExt.exports : gitExt.activate()).then(exports => {
    try { const api = exports.getAPI(1); api.repositories.forEach(watchRepo); context.subscriptions.push(api.onDidOpenRepository(watchRepo)); } catch { /* git disabled */ }
  }, () => undefined);

  await hs.refresh();
  updateStatus();
  // For tests and other extensions.
  return {
    current: () => hs.current, forUri: (u: vscode.Uri) => hs.forUri(u), refresh: () => hs.refresh(),
    trees: { top: new TopTree(hs), coupling: new CouplingTree(hs), knowledge: new KnowledgeTree(hs) },
    decoration: (u: vscode.Uri) => decorations.provideFileDecoration(u),
    map: () => ({ open: !!MapPanel.panel, ready: MapPanel.ready }),
    status: () => (status as unknown as { text: string }).text,
  };
}

export function deactivate() { /* disposables are cleaned up by VS Code */ }
