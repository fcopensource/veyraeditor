import * as vscode from "vscode";
import { BSON } from "mongodb";
import { covers, keysText, indexCode, type IndexKeys } from "./advice";
import type { Query } from "./queries";
import type { Lens, Result, SchemaResult, Workspace } from "./extension";
import { resultKey } from "./extension";

/* The Query details panel and Index Doctor, both webviews running media/panel.js. */

function page(context: vscode.ExtensionContext, webview: vscode.Webview, mode: "query" | "doctor") {
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", file));
  const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${media("panel.css")}"></head>
<body data-mode="${mode}" data-logo="${media("icon.png")}"><div id="app"></div><script nonce="${nonce}" src="${media("panel.js")}"></script></body></html>`;
}
const options = (context: vscode.ExtensionContext) => ({ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] });
/** Dates, ObjectIds and regexes in a readable form (MongoDB's relaxed Extended JSON). */
const show = (value: unknown) => BSON.EJSON.stringify(value, undefined, 2, { relaxed: true });

// ---------- Query details ----------

export interface QueryData { file: string; line: number; query: Query; source: string; result?: Result; host?: string; code?: ReturnType<typeof indexCode>; readOnly: boolean }
export class QueryPanel {
  private static current?: QueryPanel;
  static show(context: vscode.ExtensionContext, data: QueryData, actions: { recheck(): Promise<Result>; create(keys: IndexKeys): Thenable<unknown> }) {
    if (!QueryPanel.current) QueryPanel.current = new QueryPanel(context);
    QueryPanel.current.data = data;
    QueryPanel.current.actions = actions;
    QueryPanel.current.panel.title = `Query: ${data.query.collection}.${data.query.method}`;
    QueryPanel.current.panel.reveal(undefined, true);
    QueryPanel.current.send();
  }
  private readonly panel: vscode.WebviewPanel;
  private data!: QueryData;
  private actions!: { recheck(): Promise<Result>; create(keys: IndexKeys): Thenable<unknown> };
  private constructor(context: vscode.ExtensionContext) {
    this.panel = vscode.window.createWebviewPanel("veyraMongo.query", "Query", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, options(context));
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(context, this.panel.webview, "query");
    this.panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case "ready": this.send(); break;
        case "recheck": this.panel.webview.postMessage({ type: "busy" }); this.data.result = await this.actions.recheck(); this.send(); break;
        case "create": await this.actions.create(msg.keys); this.data.result = await this.actions.recheck(); this.send(); break;
        case "copy": await vscode.env.clipboard.writeText(String(msg.text)); this.panel.webview.postMessage({ type: "toast", text: "Copied" }); break;
      }
    });
    this.panel.onDidDispose(() => (QueryPanel.current = undefined));
  }
  private send() {
    const { query: q, result: r } = this.data;
    this.panel.webview.postMessage({
      type: "query",
      file: this.data.file, line: this.data.line, source: this.data.source, host: this.data.host, readOnly: this.data.readOnly, code: this.data.code,
      query: { method: q.method, collection: q.collection, via: q.via, model: q.model, sort: q.sort, limit: q.limit, unsupported: q.unsupported },
      result: r && {
        error: r.error, verdict: r.verdict,
        plan: r.analysis?.plan, filter: r.analysis && show(r.analysis.filter), sort: r.analysis?.sort && show(r.analysis.sort), sampled: r.analysis?.sampled,
        indexes: r.analysis?.indexes.map(keysText),
      },
    });
  }
}

// ---------- Index Doctor ----------

export interface DoctorActions {
  lens: Lens; ws: Workspace;
  schemas(): Promise<SchemaResult[]>;
  analyzeAll(): Thenable<unknown>;
  connect(): Thenable<unknown>;
  create(collection: string, keys: IndexKeys): Thenable<unknown>;
  drop(collection: string, name: string): Promise<boolean>;
  copy(text: string): Thenable<void>;
  reveal(uri: string, line: number, character: number): Thenable<unknown>;
}
export class DoctorPanel {
  private static current?: DoctorPanel;
  static show(context: vscode.ExtensionContext, actions: DoctorActions) {
    if (DoctorPanel.current) { DoctorPanel.current.panel.reveal(); void DoctorPanel.current.load(); return; }
    DoctorPanel.current = new DoctorPanel(context, actions);
  }
  private readonly panel: vscode.WebviewPanel;
  private schemaResults?: SchemaResult[];
  private subs: vscode.Disposable[] = [];
  private loading = false;
  private constructor(context: vscode.ExtensionContext, private actions: DoctorActions) {
    this.panel = vscode.window.createWebviewPanel("veyraMongo.doctor", "Index Doctor", vscode.ViewColumn.Active, options(context));
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(context, this.panel.webview, "doctor");
    let timer: NodeJS.Timeout | undefined;
    this.subs.push(
      this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg).catch(error => this.panel.webview.postMessage({ type: "toast", kind: "error", text: (error as Error).message }))),
      actions.lens.onDidChange(() => { clearTimeout(timer); timer = setTimeout(() => void this.load(), 600); }),
    );
    this.panel.onDidDispose(() => { DoctorPanel.current = undefined; this.subs.forEach(s => s.dispose()); clearTimeout(timer); });
  }
  private async onMessage(msg: any) {
    const a = this.actions;
    switch (msg.type) {
      case "ready": case "refresh": await this.load(); break;
      case "connect": await a.connect(); await this.load(); break;
      case "analyzeAll": await a.analyzeAll(); await this.load(); break;
      case "create": await a.create(msg.collection, msg.keys); await this.load(); break;
      case "drop": if (await a.drop(msg.collection, msg.name)) await this.load(); break;
      case "copy": await a.copy(String(msg.text)); this.panel.webview.postMessage({ type: "toast", text: "Copied" }); break;
      case "reveal": await a.reveal(msg.uri, msg.line, msg.character); break;
      case "schemas": this.panel.webview.postMessage({ type: "busy", what: "schemas" }); this.schemaResults = await a.schemas(); await this.load(); break;
    }
  }

  /** Collections with their indexes, what the code needs, and what nothing uses. */
  async load() {
    if (this.loading) return;
    this.loading = true;
    try {
      const { lens, ws } = this.actions;
      const mongo = lens.mongo;
      if (!mongo) { this.panel.webview.postMessage({ type: "doctor", connected: false }); return; }
      const found = ws.all();
      const names = new Set([...(await mongo.collections()).slice(0, 60), ...found.map(f => f.query.collection!).filter(Boolean)]);
      const collections = [];
      for (const name of [...names].sort()) {
        const info = await mongo.collectionInfo(name).catch(() => undefined);
        if (!info) continue;
        const queries = found.filter(f => f.query.collection === name);
        const results = queries.map(f => ({ f, r: lens.results.get(resultKey(f.query)) }));
        const missing = new Map<string, { keys: IndexKeys; queries: { uri: string; line: number; character: number; file: string; title: string }[] }>();
        for (const { f, r } of results) {
          const s = r?.verdict?.suggestion;
          if (!s) continue;
          const key = keysText(s);
          const entry = missing.get(key) ?? { keys: s, queries: [] };
          entry.queries.push({ uri: f.uri.toString(), line: f.query.line, character: f.query.character, file: `${vscode.workspace.asRelativePath(f.uri)}:${f.query.line + 1}`, title: r!.verdict!.title });
          missing.set(key, entry);
        }
        const indexes = info.indexes.map(i => {
          const usedBy = results.filter(({ r }) => r?.analysis?.plan.index === i.name).map(({ f }) => `${vscode.workspace.asRelativePath(f.uri)}:${f.query.line + 1}`);
          const special = i.name === "_id_" || i.unique || i.ttl !== undefined || i.partial;
          const redundantWith = special ? undefined : info.indexes.find(o => o.name !== i.name && Object.keys(o.keys).length > Object.keys(i.keys).length && covers(o.keys, i.keys))?.name;
          return {
            name: i.name, keys: keysText(i.keys), size: i.size, ops: i.ops, since: i.since?.toISOString(), unique: i.unique, ttl: i.ttl, partial: i.partial, sparse: i.sparse, usedBy,
            unused: info.statsAvailable && !special && i.ops === 0 && !usedBy.length,
            redundantWith,
            drop: `db.getCollection(${JSON.stringify(name)}).dropIndex(${JSON.stringify(i.name)})`,
          };
        });
        collections.push({
          name, count: info.count, size: info.size, statsAvailable: info.statsAvailable, indexes, queries: queries.length,
          checked: results.filter(x => x.r?.verdict).length,
          missing: [...missing.values()].map(m => ({ ...m, keysText: keysText(m.keys), code: indexCode(name, m.keys, ws.models.find(x => x.collection === name)?.schemaVariable ?? "schema") })),
        });
      }
      this.panel.webview.postMessage({
        type: "doctor", connected: true, host: `${mongo.host}/${mongo.db.databaseName}`, local: mongo.local, readOnly: vscode.workspace.getConfiguration("veyraMongo").get<boolean>("readOnly", false),
        queries: found.length, unchecked: found.filter(f => !f.query.unsupported && !lens.results.has(resultKey(f.query))).length, collections,
        schemas: this.schemaResults?.map(s => ({ model: s.model, collection: s.collection, file: vscode.workspace.asRelativePath(s.uri), uri: s.uri.toString(), sampled: s.sampled, drift: s.drift })),
      });
    } finally { this.loading = false; }
  }
}
