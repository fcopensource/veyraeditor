import * as vscode from "vscode";
import * as path from "node:path";
import { Mongo, redact, isLocalUri, databaseOf, type Analysis } from "./db";
import { findQueries, findModels, type ModelInfo, type Query, type Language } from "./queries";
import { shapeOf, verdict, lensTitle, indexCode, keysText, type Verdict, type IndexKeys } from "./advice";
import { findSchemas, compare, type Drift } from "./schema";
import { QueryPanel, DoctorPanel } from "./panels";

/* Veyra Query Lens for MongoDB: how every query in your code performs, the index that fixes it, and schema drift. */

const config = () => vscode.workspace.getConfiguration("veyraMongo");
const CODE_GLOB = "**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,py}";
const EXCLUDE = "**/{node_modules,.git,dist,build,out,.next,.nuxt,coverage,venv,.venv,__pycache__,site-packages,bundle,vendor}/**";
const LANGS: Record<string, Language> = { javascript: "js", typescript: "js", javascriptreact: "js", typescriptreact: "js", python: "py" };
const langOf = (doc: { languageId: string; fileName: string }): Language | undefined => LANGS[doc.languageId] ?? (/\.py$/i.test(doc.fileName) ? "py" : /\.[cm]?[jt]sx?$/i.test(doc.fileName) ? "js" : undefined);

// ---------- Queries in the workspace ----------

export interface Found { uri: vscode.Uri; query: Query }
export class Workspace implements vscode.Disposable {
  readonly files = new Map<string, { uri: vscode.Uri; queries: Query[]; models: ModelInfo[]; text: string }>();
  models: ModelInfo[] = [];
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private subs: vscode.Disposable[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  ready: Promise<void>;
  constructor() {
    this.ready = this.scan();
    const watcher = vscode.workspace.createFileSystemWatcher(CODE_GLOB);
    this.subs.push(watcher,
      watcher.onDidCreate(u => this.load(u)), watcher.onDidChange(u => this.load(u)),
      watcher.onDidDelete(u => { this.files.delete(u.toString()); this.relink(); }),
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!langOf(e.document) || e.document.uri.scheme !== "file") return;
        clearTimeout(this.timers.get(e.document.uri.toString()));
        this.timers.set(e.document.uri.toString(), setTimeout(() => this.update(e.document.uri, e.document.getText(), langOf(e.document)!), 400));
      }));
  }
  async scan() {
    const uris = await vscode.workspace.findFiles(CODE_GLOB, EXCLUDE, 5000);
    this.files.clear();
    // Only files that talk to MongoDB are kept, which keeps big workspaces fast.
    await Promise.all(uris.map(u => this.load(u, false)));
    this.relink();
  }
  private async load(uri: vscode.Uri, fire = true) {
    if (/[\\/](node_modules|\.git|dist|build|out|\.next|coverage|venv|\.venv|__pycache__|site-packages)[\\/]/.test(uri.fsPath)) return;
    const lang: Language = /\.py$/i.test(uri.fsPath) ? "py" : "js";
    try {
      const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
      const text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      if (text.length > 1_500_000) return;
      this.update(uri, text, lang, fire);
    } catch { /* deleted while reading */ }
  }
  private update(uri: vscode.Uri, text: string, lang: Language, fire = true) {
    const relevant = /mongo|\.collection\(|\.model\(|Schema\(|\.find\(|\.aggregate\(|veyra-collection|find_one|count_documents/i.test(text);
    if (!relevant) { if (this.files.delete(uri.toString()) && fire) this.relink(); return; }
    const models = lang === "js" ? findModels(text) : [];
    this.files.set(uri.toString(), { uri, queries: [], models, text });
    if (fire) this.relink(); else this.files.get(uri.toString())!.queries = findQueries(text, lang, this.models);
  }
  /** Models can be defined in one file and used in another, so queries are read again when models change. */
  private relink() {
    this.models = [...this.files.values()].flatMap(f => f.models);
    for (const f of this.files.values()) f.queries = findQueries(f.text, /\.py$/i.test(f.uri.fsPath) ? "py" : "js", this.models);
    this.emitter.fire();
  }
  queriesIn(uri: vscode.Uri): Query[] { return this.files.get(uri.toString())?.queries ?? []; }
  all(): Found[] { return [...this.files.values()].flatMap(f => f.queries.map(query => ({ uri: f.uri, query }))); }
  dispose() { this.subs.forEach(s => s.dispose()); this.timers.forEach(clearTimeout); this.emitter.dispose(); }
}

// ---------- Results ----------

export interface Result { analysis?: Analysis; verdict?: Verdict; error?: string; at: number }
export const resultKey = (q: Query) => `${q.collection}|${q.method}|${JSON.stringify(q.filter ?? null, (k, v) => (k === "start" || k === "end" || k === "keyStart" ? undefined : v))}|${JSON.stringify(q.sort)}|${q.limit ?? ""}`;

export class Lens implements vscode.Disposable {
  mongo?: Mongo;
  readonly results = new Map<string, Result>();
  private pending = new Map<string, Promise<Result>>();
  private queue: (() => Promise<void>)[] = [];
  private active = 0;
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  readonly problems = vscode.languages.createDiagnosticCollection("veyra-mongodb");
  readonly drift = vscode.languages.createDiagnosticCollection("veyra-mongodb-schema");
  constructor(readonly workspace: Workspace) {}

  get auto() {
    const mode = config().get<string>("analyze", "local");
    return !!this.mongo && (mode === "always" || (mode === "local" && this.mongo.local));
  }
  /** Runs explain() for a query (two at a time), or returns the cached result. */
  check(q: Query, force = false): Promise<Result> {
    const key = resultKey(q);
    if (!force && this.results.has(key)) return Promise.resolve(this.results.get(key)!);
    if (this.pending.has(key)) return this.pending.get(key)!;
    const job = new Promise<Result>(resolve => {
      this.queue.push(async () => {
        const mongo = this.mongo;
        let result: Result;
        if (!mongo) result = { error: "Not connected.", at: Date.now() };
        else {
          try {
            const analysis = await mongo.analyze(q, config().get<number>("maxTimeMS", 3000));
            result = { analysis, verdict: verdict(q, shapeOf(q.filter), analysis.plan, analysis.indexes), at: Date.now() };
          } catch (error) {
            const e = error as { codeName?: string; message?: string };
            result = { error: e.codeName === "MaxTimeMSExpired" ? `Stopped after ${config().get<number>("maxTimeMS", 3000)} ms (veyraMongo.maxTimeMS). The query is very slow on this data.` : e.message ?? String(error), at: Date.now() };
          }
        }
        this.results.set(key, result);
        this.pending.delete(key);
        resolve(result);
        this.emitter.fire();
      });
      this.pump();
    });
    this.pending.set(key, job);
    return job;
  }
  private pump() {
    while (this.active < 2 && this.queue.length) {
      const next = this.queue.shift()!;
      this.active++;
      void next().finally(() => { this.active--; this.pump(); });
    }
  }
  forget() { this.results.clear(); this.emitter.fire(); }

  /** Slow queries in the Problems panel, with quick fixes. */
  updateProblems() {
    this.problems.clear();
    if (!config().get<boolean>("problems", true)) return;
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const { uri, query } of this.workspace.all()) {
      const r = this.results.get(resultKey(query));
      if (!r?.verdict || r.verdict.level !== "warning") continue;
      const d = new vscode.Diagnostic(new vscode.Range(query.line, query.character, query.line, query.character + query.method.length), `${r.verdict.title} on ${query.collection}: ${r.verdict.detail}`, vscode.DiagnosticSeverity.Warning);
      d.source = "MongoDB Query Lens"; d.code = "slow-query";
      byFile.set(uri.toString(), [...(byFile.get(uri.toString()) ?? []), d]);
    }
    for (const [uri, diags] of byFile) this.problems.set(vscode.Uri.parse(uri), diags);
  }
  dispose() { this.problems.dispose(); this.drift.dispose(); this.emitter.dispose(); void this.mongo?.close(); }
}

// ---------- Lenses above queries ----------

class Lenses implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  constructor(private lens: Lens, private ws: Workspace) {
    lens.onDidChange(() => this.emitter.fire());
    ws.onDidChange(() => this.emitter.fire());
  }
  refresh() { this.emitter.fire(); }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const queries = this.ws.queriesIn(doc.uri);
    if (!queries.length) return [];
    const out: vscode.CodeLens[] = [];
    queries.forEach((q, i) => {
      const range = new vscode.Range(q.line, 0, q.line, 0);
      const args = [doc.uri.toString(), q.offset];
      if (!this.lens.mongo) {
        if (i === 0) out.push(new vscode.CodeLens(range, { title: "$(database) MongoDB: connect to see how these queries perform", command: "veyraMongo.connect" }));
        return;
      }
      if (q.unsupported) { out.push(new vscode.CodeLens(range, { title: `ℹ Not checked: ${q.unsupported}`, command: "veyraMongo.showQuery", arguments: args })); return; }
      const r = this.lens.results.get(resultKey(q));
      if (r?.verdict && r.analysis) {
        out.push(new vscode.CodeLens(range, { title: lensTitle(r.verdict, r.analysis.plan), command: "veyraMongo.showQuery", arguments: args, tooltip: r.verdict.detail }));
        if (r.verdict.suggestion) out.push(new vscode.CodeLens(range, { title: `Create index ${keysText(r.verdict.suggestion)}`, command: "veyraMongo.createIndex", arguments: [q.collection, r.verdict.suggestion, ...args] }));
        return;
      }
      if (r?.error) { out.push(new vscode.CodeLens(range, { title: `⚠ Couldn't check: ${r.error.slice(0, 90)}`, command: "veyraMongo.showQuery", arguments: args })); return; }
      if (this.lens.auto) {
        out.push(new vscode.CodeLens(range, { title: `$(sync~spin) Checking ${q.collection}…`, command: "" }));
        void this.lens.check(q);
      } else out.push(new vscode.CodeLens(range, { title: `▶ Check this query on ${q.collection}`, command: "veyraMongo.checkQuery", arguments: args }));
    });
    return out;
  }
}

// ---------- Sidebar ----------

type QNode = { kind: "collection"; name: string; items: Found[] } | { kind: "query"; found: Found };
class QueriesTree implements vscode.TreeDataProvider<QNode> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private ws: Workspace, private lens: Lens) { ws.onDidChange(() => this.emitter.fire()); lens.onDidChange(() => this.emitter.fire()); }
  getChildren(node?: QNode): QNode[] {
    if (node?.kind === "collection") return node.items.map(found => ({ kind: "query", found }));
    if (node) return [];
    const groups = new Map<string, Found[]>();
    for (const f of this.ws.all()) groups.set(f.query.collection!, [...(groups.get(f.query.collection!) ?? []), f]);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, items]) => ({ kind: "collection", name, items }));
  }
  getTreeItem(node: QNode): vscode.TreeItem {
    if (node.kind === "collection") {
      const warnings = node.items.filter(f => this.lens.results.get(resultKey(f.query))?.verdict?.level === "warning").length;
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.items.length} quer${node.items.length === 1 ? "y" : "ies"}${warnings ? ` · ${warnings} slow` : ""}`;
      item.iconPath = new vscode.ThemeIcon("database", warnings ? new vscode.ThemeColor("problemsWarningIcon.foreground") : undefined);
      return item;
    }
    const { uri, query: q } = node.found;
    const r = this.lens.results.get(resultKey(q));
    const item = new vscode.TreeItem(`${q.method}(${summary(q)})`, vscode.TreeItemCollapsibleState.None);
    item.description = `${vscode.workspace.asRelativePath(uri)}:${q.line + 1}${r?.verdict ? ` · ${r.verdict.title}` : ""}`;
    item.iconPath = q.unsupported ? new vscode.ThemeIcon("circle-slash") : !r ? new vscode.ThemeIcon("circle-outline")
      : r.error ? new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground"))
      : r.verdict!.level === "good" ? new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"))
      : r.verdict!.level === "warning" ? new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"))
      : new vscode.ThemeIcon("info");
    item.command = { command: "veyraMongo.reveal", title: "Show", arguments: [uri.toString(), q.line, q.character] };
    item.tooltip = r?.verdict ? `${r.verdict.title}: ${r.verdict.detail}` : q.unsupported ?? "Not checked yet";
    return item;
  }
}
/** "status, createdAt ↓" — the fields a query filters and sorts on. */
function summary(q: Query): string {
  if (q.unsupported) return "…";
  const fields = shapeOf(q.filter).conditions.map(c => c.path);
  const sort = q.sort.map(s => `${s.path} ${s.dir === 1 ? "↑" : "↓"}`);
  return [...new Set(fields)].concat(sort).join(", ") || "all";
}

type CNode = { kind: "collection"; name: string } | { kind: "index"; collection: string; name: string; keys: IndexKeys };
class CollectionsTree implements vscode.TreeDataProvider<CNode> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private lens: Lens) {}
  refresh() { this.emitter.fire(); }
  async getChildren(node?: CNode): Promise<CNode[]> {
    const mongo = this.lens.mongo;
    if (!mongo) return [];
    try {
      if (!node) return (await mongo.collections()).map(name => ({ kind: "collection", name }));
      if (node.kind === "collection") return (await mongo.indexes(node.name)).map(i => ({ kind: "index", collection: node.name, name: i.name, keys: i.keys }));
    } catch { /* connection lost: the status bar says so */ }
    return [];
  }
  getTreeItem(node: CNode): vscode.TreeItem {
    if (node.kind === "collection") {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon("symbol-class");
      return item;
    }
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.description = keysText(node.keys);
    item.iconPath = new vscode.ThemeIcon("list-ordered");
    return item;
  }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const ws = new Workspace();
  const lens = new Lens(ws);
  const lenses = new Lenses(lens, ws);
  const queriesTree = new QueriesTree(ws, lens);
  const collectionsTree = new CollectionsTree(lens);
  const status = vscode.window.createStatusBarItem("veyraMongo.status", vscode.StatusBarAlignment.Left, 40);
  status.name = "MongoDB Query Lens";
  const showStatus = () => {
    if (lens.mongo) {
      status.text = `$(database) ${lens.mongo.host}/${lens.mongo.db.databaseName}`;
      status.tooltip = `MongoDB Query Lens is connected to ${redact(lens.mongo.uri)}, database ${lens.mongo.db.databaseName}${lens.mongo.local ? "" : "\nNot on this computer: queries are checked when you click their lens."}\nClick to change the connection.`;
      status.command = "veyraMongo.connect";
      status.show();
    } else if (ws.all().length) {
      status.text = "$(database) Connect MongoDB";
      status.tooltip = "Connect to a development database to see how your queries perform";
      status.command = "veyraMongo.connect";
      status.show();
    } else status.hide();
  };
  ws.onDidChange(showStatus);
  lens.onDidChange(() => { lens.updateProblems(); });

  const secretKey = () => `uri:${vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? "global"}`;
  const setConnected = (on: boolean) => vscode.commands.executeCommand("setContext", "veyraMongo.connected", on);
  const connect = async (uri: string, database?: string, quiet = false) => {
    const mongo = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Connecting to ${redact(uri)}…` }, () => Mongo.connect(uri, database));
    await lens.mongo?.close().catch(() => undefined);
    lens.mongo = mongo;
    if (!database && !databaseOf(uri)) {
      const names = await mongo.databases();
      const saved = context.workspaceState.get<string>("veyraMongo.database");
      const pick = saved && names.includes(saved) ? saved : names.length === 1 ? names[0] : quiet ? names[0] : await vscode.window.showQuickPick(names, { placeHolder: "Which database does your app use?" });
      if (pick) mongo.use(pick);
    }
    await context.workspaceState.update("veyraMongo.database", mongo.db.databaseName);
    await context.secrets.store(secretKey(), uri);
    lens.forget();
    await setConnected(true);
    showStatus(); collectionsTree.refresh(); lenses.refresh();
    if (!quiet) vscode.window.setStatusBarMessage(`$(check) Connected to ${mongo.host}/${mongo.db.databaseName}`, 4000);
  };

  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...args: any[]) => {
    try { return await fn(...args); } catch (error) { vscode.window.showErrorMessage(`MongoDB Query Lens: ${(error as Error).message ?? error}`); return undefined; }
  }));
  const queryAt = (uriText: string, offset: number) => {
    const uri = vscode.Uri.parse(uriText);
    const q = ws.queriesIn(uri).find(x => x.offset === offset);
    return q ? { uri, q } : undefined;
  };
  const schemaVariableFor = (collection: string) => ws.models.find(m => m.collection === collection)?.schemaVariable ?? "schema";

  register("veyraMongo.connect", async () => {
    const found = vscode.workspace.isTrusted ? await envUris() : [];
    type Pick = vscode.QuickPickItem & { uri?: string; manual?: boolean; database?: boolean };
    const picks: Pick[] = [
      ...found.map(f => ({ label: `$(file) ${f.key}`, description: redact(f.uri), detail: `From ${f.file}${isLocalUri(f.uri) ? " · on this computer" : ""}`, uri: f.uri })),
      { label: "$(edit) Enter a connection string…", description: "mongodb://localhost:27017/myapp", manual: true },
      ...(lens.mongo ? [{ label: "$(database) Use another database…", description: `now ${lens.mongo.db.databaseName}`, database: true }] : []),
    ];
    const pick = picks.length === 1 ? picks[0] : await vscode.window.showQuickPick(picks, { placeHolder: "Connect to a development database. Its connection string is kept in VS Code's secret storage." });
    if (!pick) return;
    if (pick.database && lens.mongo) {
      const name = await vscode.window.showQuickPick(await lens.mongo.databases(), { placeHolder: "Which database?" });
      if (name) { lens.mongo.use(name); await context.workspaceState.update("veyraMongo.database", name); lens.forget(); showStatus(); collectionsTree.refresh(); }
      return;
    }
    const uri = pick.uri ?? (await vscode.window.showInputBox({ title: "Connect to MongoDB", prompt: "A connection string to a development database. Use a copy of real data if you can: plans depend on the data.", placeHolder: "mongodb://localhost:27017/myapp", password: false, ignoreFocusOut: true, validateInput: v => (/^mongodb(\+srv)?:\/\//.test(v.trim()) ? undefined : "It starts with mongodb:// or mongodb+srv://") }))?.trim();
    if (!uri) return;
    await connect(uri);
  });
  register("veyraMongo.disconnect", async () => {
    await lens.mongo?.close().catch(() => undefined);
    lens.mongo = undefined;
    await context.secrets.delete(secretKey());
    lens.forget(); lens.problems.clear(); lens.drift.clear();
    await setConnected(false);
    showStatus(); collectionsTree.refresh(); lenses.refresh();
  });
  register("veyraMongo.openGuide", () => vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.joinPath(context.extensionUri, "docs", "GUIDE.md")));
  register("veyraMongo.refresh", async () => { await ws.scan(); lens.forget(); collectionsTree.refresh(); });
  register("veyraMongo.reveal", async (uriText: string, line: number, character: number) => {
    const editor = await vscode.window.showTextDocument(vscode.Uri.parse(uriText), { preview: true });
    const pos = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  });
  register("veyraMongo.checkQuery", async (uriText: string, offset: number) => {
    const found = queryAt(uriText, offset);
    if (found) await lens.check(found.q, true);
  });
  register("veyraMongo.showQuery", async (uriText: string, offset: number) => {
    const found = queryAt(uriText, offset);
    if (!found) return;
    const result = found.q.unsupported || !lens.mongo ? undefined : await lens.check(found.q);
    QueryPanel.show(context, {
      file: vscode.workspace.asRelativePath(found.uri), line: found.q.line + 1, query: found.q, source: textOf(found.uri, found.q), result,
      host: lens.mongo ? `${lens.mongo.host}/${lens.mongo.db.databaseName}` : undefined,
      code: result?.verdict?.suggestion ? indexCode(found.q.collection!, result.verdict.suggestion, schemaVariableFor(found.q.collection!)) : undefined,
      readOnly: config().get<boolean>("readOnly", false),
    }, {
      recheck: async () => (await lens.check(found.q, true)),
      create: (keys: IndexKeys) => vscode.commands.executeCommand("veyraMongo.createIndex", found.q.collection, keys, uriText, offset),
    });
  });
  register("veyraMongo.createIndex", async (collection: string, keys: IndexKeys, uriText?: string, offset?: number) => {
    const mongo = lens.mongo;
    if (!mongo || !collection || !keys) return;
    if (config().get<boolean>("readOnly", false)) { vscode.window.showInformationMessage("Read-only mode is on (veyraMongo.readOnly), so indexes are not created from VS Code. Copy the index as code instead."); return; }
    const where = `${mongo.host}/${mongo.db.databaseName}`;
    const ok = await vscode.window.showWarningMessage(`Create the index ${keysText(keys)} on ${collection}?`, {
      modal: true,
      detail: `Database: ${where}${mongo.local ? "" : " (NOT on this computer)"}\n\nBuilding an index reads the whole collection and uses CPU and disk while it runs. To add it in production, put it in your code (schema.index(...) or a migration) and deploy it, rather than creating it here.`,
    }, "Create Index");
    if (ok !== "Create Index") return;
    const started = Date.now();
    const name = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Building ${keysText(keys)} on ${collection}…` }, () => mongo.createIndex(collection, keys));
    lens.forget(); collectionsTree.refresh();
    let after = "";
    const found = uriText !== undefined && offset !== undefined ? queryAt(uriText, offset) : undefined;
    if (found) {
      const r = await lens.check(found.q, true);
      if (r.analysis) after = ` The query now reads ${r.analysis.plan.docsExamined.toLocaleString("en-US")} document${r.analysis.plan.docsExamined === 1 ? "" : "s"} to return ${r.analysis.plan.returned.toLocaleString("en-US")}.`;
    }
    const code = indexCode(collection, keys, schemaVariableFor(collection));
    const pick = await vscode.window.showInformationMessage(`Created ${name} in ${((Date.now() - started) / 1000).toFixed(1)} s.${after} Add it to your code too, so production gets it.`, "Copy Mongoose Code", "Copy Node.js Code", "Copy Python Code");
    if (pick) await vscode.env.clipboard.writeText(pick.includes("Mongoose") ? code.mongoose : pick.includes("Node") ? code.node : code.python);
  });
  register("veyraMongo.copyIndex", async (collection: string, keys: IndexKeys) => {
    const code = indexCode(collection, keys, schemaVariableFor(collection));
    const pick = await vscode.window.showQuickPick([{ label: "Mongoose", code: code.mongoose }, { label: "Node.js driver", code: code.node }, { label: "Python (PyMongo)", code: code.python }, { label: "mongosh", code: code.mongosh }].map(x => ({ ...x, description: x.code })), { placeHolder: "Copy the index as…" });
    if (pick) { await vscode.env.clipboard.writeText(pick.code); vscode.window.setStatusBarMessage(`Copied: ${pick.code}`, 3000); }
  });
  register("veyraMongo.analyzeWorkspace", async () => {
    if (!lens.mongo) { await vscode.commands.executeCommand("veyraMongo.connect"); if (!lens.mongo) return; }
    const all = ws.all().filter(f => !f.query.unsupported);
    if (!all.length) { vscode.window.showInformationMessage("No MongoDB queries were found in this workspace."); return; }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Checking MongoDB queries", cancellable: false }, async progress => {
      let done = 0;
      await Promise.all(all.map(f => lens.check(f.query, true).then(() => progress.report({ message: `${++done} of ${all.length}`, increment: 100 / all.length }))));
    });
    const slow = all.filter(f => lens.results.get(resultKey(f.query))?.verdict?.level === "warning").length;
    const choice = await vscode.window.showInformationMessage(slow ? `${slow} of ${all.length} queries need an index.` : `All ${all.length} queries use an index or are fine at this size.`, "Open Index Doctor");
    if (choice) await vscode.commands.executeCommand("veyraMongo.indexDoctor");
  });
  register("veyraMongo.checkSchema", async () => {
    if (!lens.mongo) { await vscode.commands.executeCommand("veyraMongo.connect"); if (!lens.mongo) return; }
    const results = await checkSchemas(lens, ws);
    const count = results.reduce((n, r) => n + r.drift.length, 0);
    if (!results.length) { vscode.window.showInformationMessage("No Mongoose schemas with a model were found in this workspace."); return; }
    vscode.window.showInformationMessage(count ? `Found ${count} difference${count === 1 ? "" : "s"} between your Mongoose schemas and the data. They're in the Problems panel.` : `Your ${results.length} Mongoose schema${results.length === 1 ? " matches" : "s match"} the data.`);
    return results;
  });
  register("veyraMongo.indexDoctor", () => DoctorPanel.show(context, {
    lens, ws,
    schemas: () => checkSchemas(lens, ws),
    analyzeAll: () => vscode.commands.executeCommand("veyraMongo.analyzeWorkspace"),
    connect: () => vscode.commands.executeCommand("veyraMongo.connect"),
    create: (collection: string, keys: IndexKeys) => vscode.commands.executeCommand("veyraMongo.createIndex", collection, keys),
    drop: async (collection: string, name: string) => {
      const mongo = lens.mongo;
      if (!mongo) return false;
      if (config().get<boolean>("readOnly", false)) { vscode.window.showInformationMessage("Read-only mode is on (veyraMongo.readOnly)."); return false; }
      const ok = await vscode.window.showWarningMessage(`Drop the index ${name} on ${collection}?`, { modal: true, detail: `Database: ${mongo.host}/${mongo.db.databaseName}${mongo.local ? "" : " (NOT on this computer)"}\n\nQueries that use it get slower until it's created again. Usage counts start from the last server restart, so an index can look unused when it's needed monthly.` }, "Drop Index");
      if (ok !== "Drop Index") return false;
      await mongo.dropIndex(collection, name);
      lens.forget(); collectionsTree.refresh();
      return true;
    },
    copy: (text: string) => vscode.env.clipboard.writeText(text),
    reveal: (uriText: string, line: number, character: number) => vscode.commands.executeCommand("veyraMongo.reveal", uriText, line, character),
  }));

  // Quick fixes on slow-query problems.
  const fixes: vscode.CodeActionProvider = {
    provideCodeActions(doc, _range, ctx) {
      const actions: vscode.CodeAction[] = [];
      for (const d of ctx.diagnostics) {
        if (d.source !== "MongoDB Query Lens" || d.code !== "slow-query") continue;
        const q = ws.queriesIn(doc.uri).find(x => x.line === d.range.start.line && x.character === d.range.start.character);
        const suggestion = q && lens.results.get(resultKey(q))?.verdict?.suggestion;
        if (!q || !suggestion) continue;
        const create = new vscode.CodeAction(`Create index ${keysText(suggestion)} on ${q.collection}`, vscode.CodeActionKind.QuickFix);
        create.command = { command: "veyraMongo.createIndex", title: create.title, arguments: [q.collection, suggestion, doc.uri.toString(), q.offset] };
        create.diagnostics = [d]; create.isPreferred = true;
        const copy = new vscode.CodeAction("Copy the index as code", vscode.CodeActionKind.QuickFix);
        copy.command = { command: "veyraMongo.copyIndex", title: copy.title, arguments: [q.collection, suggestion] };
        copy.diagnostics = [d];
        actions.push(create, copy);
      }
      return actions;
    },
  };

  const selector = ["javascript", "typescript", "javascriptreact", "typescriptreact", "python"].map(language => ({ language, scheme: "file" }));
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, lenses),
    vscode.languages.registerCodeActionsProvider(selector, fixes, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.window.createTreeView("veyraMongo.queries", { treeDataProvider: queriesTree, showCollapseAll: true }),
    vscode.window.createTreeView("veyraMongo.collections", { treeDataProvider: collectionsTree }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraMongo")) { lens.updateProblems(); lenses.refresh(); } }),
    status, ws, lens,
  );

  // Reconnect to the last database, or to a local one named in .env, without asking.
  void (async () => {
    await ws.ready;
    showStatus();
    const saved = await context.secrets.get(secretKey());
    const fromEnv = !saved && vscode.workspace.isTrusted ? (await envUris()).find(f => isLocalUri(f.uri)) : undefined;
    const uri = saved ?? fromEnv?.uri;
    if (!uri) return;
    try {
      await connect(uri, undefined, true);
      if (fromEnv) vscode.window.setStatusBarMessage(`$(database) Query Lens connected to ${lens.mongo!.host}/${lens.mongo!.db.databaseName} (${fromEnv.key} in ${fromEnv.file})`, 6000);
    } catch { showStatus(); }
  })();
  return { ws, lens, connect, ready: () => ws.ready }; // for the integration tests
}

/** The source text of a query call, for the details panel. */
function textOf(uri: vscode.Uri, q: Query): string {
  const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  if (!doc) return "";
  const lines: string[] = [];
  for (let i = q.line; i < Math.min(doc.lineCount, q.line + 12); i++) { lines.push(doc.lineAt(i).text); if (/[;)]\s*$/.test(doc.lineAt(i).text) && i > q.line) break; }
  return lines.join("\n");
}

/** MONGODB_URI and friends in the workspace's .env files. */
async function envUris(): Promise<{ key: string; uri: string; file: string }[]> {
  const files = await vscode.workspace.findFiles("**/{.env,.env.*,*.env}", "**/{node_modules,.git}/**", 50);
  const out: { key: string; uri: string; file: string }[] = [];
  for (const f of files) {
    if (/example|sample|template/i.test(path.basename(f.fsPath))) continue;
    const text = Buffer.from(await vscode.workspace.fs.readFile(f)).toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*["']?(mongodb(?:\+srv)?:\/\/[^"'\s#]+)/.exec(line);
      if (m && !out.some(o => o.uri === m[2])) out.push({ key: m[1], uri: m[2], file: vscode.workspace.asRelativePath(f) });
    }
  }
  return out.sort((a, b) => Number(/mongo/i.test(b.key)) - Number(/mongo/i.test(a.key)));
}

export interface SchemaResult { model: string; collection: string; uri: vscode.Uri; drift: Drift[]; sampled: number }
/** Compares every Mongoose schema that has a model with a sample of its collection, and lists the drift in Problems. */
async function checkSchemas(lens: Lens, ws: Workspace): Promise<SchemaResult[]> {
  const mongo = lens.mongo;
  if (!mongo) return [];
  lens.drift.clear();
  const results: SchemaResult[] = [];
  const size = config().get<number>("sampleSize", 1000);
  for (const file of ws.files.values()) {
    if (/\.py$/i.test(file.uri.fsPath)) continue;
    const schemas = findSchemas(file.text);
    const diags: vscode.Diagnostic[] = [];
    for (const schema of schemas) {
      const model = file.models.find(m => m.schemaVariable && m.schemaVariable === schema.variable);
      if (!model) continue;
      const docs = await mongo.sampleDocuments(model.collection, size).catch(() => []);
      const drift = compare(schema, docs as Record<string, unknown>[]);
      results.push({ model: model.name, collection: model.collection, uri: file.uri, drift, sampled: docs.length });
      const doc = await vscode.workspace.openTextDocument(file.uri);
      for (const d of drift) {
        const at = doc.positionAt(d.offset ?? schema.offset);
        const diag = new vscode.Diagnostic(new vscode.Range(at, at.translate(0, Math.max(1, d.offset !== undefined ? d.path.split(".").pop()!.length : 10))), `${model.name}: ${d.message}`, d.kind === "never-present" ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning);
        diag.source = "MongoDB Query Lens"; diag.code = `schema-${d.kind}`;
        diags.push(diag);
      }
    }
    if (diags.length && config().get<boolean>("problems", true)) lens.drift.set(file.uri, diags);
  }
  return results;
}

export function deactivate() {}
