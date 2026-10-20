import * as vscode from "vscode";
import * as m from "./model";
import { RequestPanels, EnvironmentPanel } from "./panels";

/* Veyra API Client: collections, environments and history in the sidebar; requests in editor panels. */

export interface StoredCollection { collection: m.Collection; file: vscode.Uri }
export interface HistoryItem { id: string; at: number; request: m.ApiRequest; status?: number; ms?: number; error?: string }
const decoder = new TextDecoder(), encoder = new TextEncoder();

// ---------- Storage: .veyra-api in the workspace, so collections travel with the code ----------

export class Store {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private cache: Promise<StoredCollection[]> | null = null;
  constructor(private context: vscode.ExtensionContext) {}

  /** .veyra-api in the first workspace folder, or the extension's own storage when no folder is open. */
  get root(): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder && folder.uri.scheme === "file" ? vscode.Uri.joinPath(folder.uri, ".veyra-api") : vscode.Uri.joinPath(this.context.globalStorageUri, "store");
  }
  get inWorkspace() { return !!vscode.workspace.workspaceFolders?.[0] && vscode.workspace.workspaceFolders[0].uri.scheme === "file"; }
  private get memento() { return this.inWorkspace ? this.context.workspaceState : this.context.globalState; }

  private async read(uri: vscode.Uri): Promise<any> {
    try { return JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(uri))); } catch { return undefined; }
  }
  private async write(uri: vscode.Uri, data: unknown) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, ".."));
    await vscode.workspace.fs.writeFile(uri, encoder.encode(JSON.stringify(data, null, 2) + "\n"));
  }
  /** Private values never go into git: .veyra-api/.gitignore ignores the *.local.json files. */
  private async ensureGitignore() {
    const file = vscode.Uri.joinPath(this.root, ".gitignore");
    try { await vscode.workspace.fs.stat(file); } catch {
      await vscode.workspace.fs.createDirectory(this.root);
      await vscode.workspace.fs.writeFile(file, encoder.encode("# Private environment values stay on this computer.\n*.local.json\n"));
    }
  }
  refresh() { this.cache = null; this.emitter.fire(); }

  collections(): Promise<StoredCollection[]> {
    this.cache ??= (async () => {
      const dir = vscode.Uri.joinPath(this.root, "collections");
      let entries: [string, vscode.FileType][] = [];
      try { entries = await vscode.workspace.fs.readDirectory(dir); } catch { return []; }
      const list: StoredCollection[] = [];
      for (const [name, type] of entries) {
        if (type !== vscode.FileType.File || !name.endsWith(".json")) continue;
        const file = vscode.Uri.joinPath(dir, name), data = await this.read(file);
        if (!data || !Array.isArray(data.requests)) continue;
        list.push({ file, collection: { id: String(data.id || m.newId()), name: String(data.name || name.replace(/\.json$/, "")), requests: data.requests.map(m.normalizeRequest) } });
      }
      return list.sort((a, b) => a.collection.name.localeCompare(b.collection.name));
    })();
    return this.cache;
  }
  async saveCollection(collection: m.Collection, file?: vscode.Uri): Promise<vscode.Uri> {
    const existing = (await this.collections()).find(c => c.collection.id === collection.id);
    let target = file ?? existing?.file;
    if (!target) {
      const taken = new Set((await this.collections()).map(c => c.file.path.split("/").pop()));
      let name = `${m.slug(collection.name)}.json`;
      for (let i = 2; taken.has(name); i++) name = `${m.slug(collection.name)}-${i}.json`;
      target = vscode.Uri.joinPath(this.root, "collections", name);
    }
    await this.write(target, { id: collection.id, name: collection.name, requests: collection.requests });
    this.refresh();
    return target;
  }
  async deleteCollection(id: string) {
    const found = (await this.collections()).find(c => c.collection.id === id);
    if (found) { await vscode.workspace.fs.delete(found.file); this.refresh(); }
  }
  async locate(requestId: string) {
    for (const stored of await this.collections()) {
      const request = stored.collection.requests.find(r => r.id === requestId);
      if (request) return { stored, request };
    }
    return undefined;
  }
  /** Add or replace a request in a collection. */
  async putRequest(collectionId: string, request: m.ApiRequest) {
    const stored = (await this.collections()).find(c => c.collection.id === collectionId);
    if (!stored) throw new Error("That collection no longer exists.");
    const requests = stored.collection.requests;
    const at = requests.findIndex(r => r.id === request.id);
    if (at >= 0) requests[at] = request; else requests.push(request);
    await this.saveCollection(stored.collection);
  }
  async removeRequest(requestId: string) {
    const found = await this.locate(requestId);
    if (!found) return;
    found.stored.collection.requests = found.stored.collection.requests.filter(r => r.id !== requestId);
    await this.saveCollection(found.stored.collection);
  }

  // Environments: names and shared values in environments.json, private values in environments.local.json.
  async environments(): Promise<m.Environment[]> {
    const shared = await this.read(vscode.Uri.joinPath(this.root, "environments.json"));
    const local = (await this.read(vscode.Uri.joinPath(this.root, "environments.local.json"))) ?? {};
    return (Array.isArray(shared?.environments) ? shared.environments : []).map((e: any) => ({
      id: String(e.id || m.newId()), name: String(e.name || "Environment"),
      variables: (Array.isArray(e.variables) ? e.variables : []).map((v: any) => ({
        key: String(v.key ?? ""), enabled: v.enabled !== false, secret: !!v.secret,
        value: v.secret ? String(local[e.id]?.[v.key] ?? "") : String(v.value ?? ""),
      })),
    }));
  }
  async saveEnvironments(environments: m.Environment[]) {
    const local: Record<string, Record<string, string>> = {};
    const shared = environments.map(e => ({
      id: e.id, name: e.name,
      variables: e.variables.map(v => {
        if (v.secret) (local[e.id] ??= {})[v.key] = v.value;
        return { key: v.key, value: v.secret ? "" : v.value, enabled: v.enabled, ...(v.secret ? { secret: true } : {}) };
      }),
    }));
    await this.write(vscode.Uri.joinPath(this.root, "environments.json"), { environments: shared });
    await this.ensureGitignore();
    await this.write(vscode.Uri.joinPath(this.root, "environments.local.json"), local);
    this.refresh();
  }
  get activeEnvironmentId(): string | undefined { return this.memento.get("veyraApi.activeEnvironment"); }
  async setActiveEnvironment(id: string | undefined) { await this.memento.update("veyraApi.activeEnvironment", id); this.emitter.fire(); }
  async activeEnvironment() { const id = this.activeEnvironmentId; return (await this.environments()).find(e => e.id === id); }
  async variables(): Promise<Record<string, string>> { return m.variableMap((await this.activeEnvironment())?.variables); }

  // History, per workspace.
  history(): HistoryItem[] { return this.memento.get<HistoryItem[]>("veyraApi.history", []); }
  async addHistory(item: HistoryItem) {
    const limit = vscode.workspace.getConfiguration("veyraApi").get<number>("historyLimit", 100);
    await this.memento.update("veyraApi.history", [item, ...this.history()].slice(0, Math.max(0, limit)));
    this.emitter.fire();
  }
  async clearHistory() { await this.memento.update("veyraApi.history", []); this.emitter.fire(); }
}

// ---------- Sidebar trees ----------

const METHOD_COLORS: Record<string, string> = { GET: "charts.green", POST: "charts.yellow", PUT: "charts.blue", PATCH: "charts.purple", DELETE: "charts.red", HEAD: "charts.foreground", OPTIONS: "charts.foreground" };
const methodIcon = (method: string) => new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(METHOD_COLORS[method] ?? "charts.foreground"));
const pathOf = (url: string) => url.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/^\{\{[^}]+\}\}/, "") || "/";

type Node =
  | { kind: "collection"; stored: StoredCollection }
  | { kind: "folder"; stored: StoredCollection; folder: string }
  | { kind: "request"; stored: StoredCollection; request: m.ApiRequest };

class CollectionsTree implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private store: Store) { store.onDidChange(() => this.emitter.fire()); }
  async getChildren(node?: Node): Promise<Node[]> {
    if (!node) return (await this.store.collections()).map(stored => ({ kind: "collection", stored }));
    if (node.kind === "request") return [];
    const requests = node.stored.collection.requests;
    if (node.kind === "folder") return requests.filter(r => r.folder === node.folder).map(request => ({ kind: "request", stored: node.stored, request }));
    const folders = [...new Set(requests.map(r => r.folder).filter((f): f is string => !!f))].sort();
    return [...folders.map(folder => ({ kind: "folder" as const, stored: node.stored, folder })), ...requests.filter(r => !r.folder).map(request => ({ kind: "request" as const, stored: node.stored, request }))];
  }
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "collection") {
      const item = new vscode.TreeItem(node.stored.collection.name, vscode.TreeItemCollapsibleState.Expanded);
      item.id = node.stored.collection.id;
      item.contextValue = "collection";
      item.iconPath = new vscode.ThemeIcon("library");
      item.description = `${node.stored.collection.requests.length}`;
      item.tooltip = vscode.workspace.asRelativePath(node.stored.file);
      return item;
    }
    if (node.kind === "folder") {
      const item = new vscode.TreeItem(node.folder, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${node.stored.collection.id}/${node.folder}`;
      item.contextValue = "folder";
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    }
    const r = node.request;
    const item = new vscode.TreeItem(r.name, vscode.TreeItemCollapsibleState.None);
    item.id = r.id;
    item.contextValue = "request";
    item.description = r.method;
    item.iconPath = methodIcon(r.method);
    item.tooltip = new vscode.MarkdownString(`**${r.method}** \`${m.urlWithParams(r.url, r.params) || "(no URL)"}\``);
    item.command = { command: "veyraApi.open", title: "Open", arguments: [r.id] };
    return item;
  }
}

class EnvironmentsTree implements vscode.TreeDataProvider<m.Environment> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private store: Store) { store.onDidChange(() => this.emitter.fire()); }
  getChildren(node?: m.Environment) { return node ? [] : this.store.environments(); }
  getTreeItem(env: m.Environment): vscode.TreeItem {
    const active = env.id === this.store.activeEnvironmentId;
    const item = new vscode.TreeItem(env.name);
    item.id = env.id;
    item.contextValue = active ? "environmentActive" : "environment";
    item.iconPath = new vscode.ThemeIcon(active ? "pass-filled" : "circle-large-outline", active ? new vscode.ThemeColor("charts.green") : undefined);
    item.description = `${active ? "active · " : ""}${env.variables.length} variable${env.variables.length === 1 ? "" : "s"}`;
    item.command = { command: "veyraApi.useEnvironment", title: "Use", arguments: [env] };
    return item;
  }
}

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
};
class HistoryTree implements vscode.TreeDataProvider<HistoryItem> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private store: Store) { store.onDidChange(() => this.emitter.fire()); }
  getChildren(node?: HistoryItem) { return node ? [] : this.store.history(); }
  getTreeItem(h: HistoryItem): vscode.TreeItem {
    const item = new vscode.TreeItem(`${h.request.method} ${pathOf(h.request.url)}`);
    item.id = h.id;
    item.contextValue = "history";
    const ok = h.status !== undefined && h.status < 400;
    item.iconPath = new vscode.ThemeIcon(h.error ? "error" : "circle-filled", new vscode.ThemeColor(h.error || !ok ? "charts.red" : "charts.green"));
    item.description = `${h.error ? "failed" : h.status} · ${h.ms !== undefined ? m.formatDuration(h.ms) + " · " : ""}${ago(h.at)}`;
    item.tooltip = new vscode.MarkdownString(`**${h.request.method}** \`${m.urlWithParams(h.request.url, h.request.params)}\`${h.error ? `\n\n${h.error}` : ""}`);
    item.command = { command: "veyraApi.openHistory", title: "Open", arguments: [h] };
    return item;
  }
}

// ---------- .http files ----------

class HttpLens implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument) {
    return m.parseHttpFile(document.getText()).requests.map(({ line, request }) => new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
      title: "$(play) Send Request", command: "veyraApi.sendHttpRequest", arguments: [document.uri, line], tooltip: `${request.method} ${request.url}`,
    }));
  }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const store = new Store(context);
  const panels = new RequestPanels(context, store);
  const environmentPanel = new EnvironmentPanel(context, store);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = "veyraApi.switchEnvironment";
  const showStatus = async () => {
    const env = await store.activeEnvironment();
    status.text = `$(server-environment) ${env ? env.name : "No environment"}`;
    status.tooltip = "Veyra API environment: click to switch";
    status.show();
  };
  store.onDidChange(() => { showStatus(); panels.broadcastVariables(); });
  showStatus();

  // Edits made outside VS Code (a git pull, another window) show up straight away.
  let timer: NodeJS.Timeout | undefined;
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(store.root, "**/*.json"));
  const changed = () => { clearTimeout(timer); timer = setTimeout(() => store.refresh(), 300); };
  watcher.onDidChange(changed); watcher.onDidCreate(changed); watcher.onDidDelete(changed);

  const pickCollection = async (placeHolder: string): Promise<m.Collection | undefined> => {
    const collections = await store.collections();
    const NEW = "$(add) New collection…";
    const picked = await vscode.window.showQuickPick([...collections.map(c => ({ label: c.collection.name, description: `${c.collection.requests.length} requests`, collection: c.collection })), { label: NEW, collection: undefined }], { placeHolder });
    if (!picked) return;
    if (picked.collection) return picked.collection;
    const name = await vscode.window.showInputBox({ prompt: "Collection name", placeHolder: "Shop API", validateInput: v => (v.trim() ? null : "Enter a name") });
    if (!name) return;
    const collection: m.Collection = { id: m.newId(), name: name.trim(), requests: [] };
    await store.saveCollection(collection);
    return collection;
  };

  panels.pickCollection = pickCollection;
  const target = (node?: Node) => node ?? undefined;
  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register("veyraApi.newRequest", () => panels.open(m.newRequest(), undefined));
  register("veyraApi.open", async (id: string) => {
    const found = await store.locate(id);
    if (found) panels.open(found.request, found.stored.collection.id);
  });
  register("veyraApi.openHistory", (h: HistoryItem) => panels.open({ ...h.request, id: m.newId() }, undefined));
  register("veyraApi.newCollection", async () => {
    const name = await vscode.window.showInputBox({ prompt: "Collection name", placeHolder: "Shop API", validateInput: v => (v.trim() ? null : "Enter a name") });
    if (!name) return;
    await store.saveCollection({ id: m.newId(), name: name.trim(), requests: [] });
    if (store.inWorkspace) vscode.window.showInformationMessage(`Saved in ${vscode.workspace.asRelativePath(vscode.Uri.joinPath(store.root, "collections"))}. Commit it to share it with your team.`);
  });
  register("veyraApi.addRequest", async (node?: Node) => {
    const n = target(node);
    const collection = n && n.kind !== "request" ? n.stored.collection : await pickCollection("Add the request to which collection?");
    if (!collection) return;
    const request = m.newRequest({ ...(n?.kind === "folder" ? { folder: n.folder } : {}) });
    await store.putRequest(collection.id, request);
    panels.open(request, collection.id);
  });
  register("veyraApi.rename", async (node?: Node) => {
    if (!node || node.kind === "folder") return;
    const current = node.kind === "collection" ? node.stored.collection.name : node.request.name;
    const name = await vscode.window.showInputBox({ prompt: "New name", value: current, validateInput: v => (v.trim() ? null : "Enter a name") });
    if (!name || name === current) return;
    if (node.kind === "collection") { node.stored.collection.name = name.trim(); await store.saveCollection(node.stored.collection); }
    else { await store.putRequest(node.stored.collection.id, { ...node.request, name: name.trim() }); panels.renamed(node.request.id, name.trim()); }
  });
  register("veyraApi.duplicate", async (node?: Node) => {
    if (node?.kind !== "request") return;
    const copy = { ...structuredClone(node.request), id: m.newId(), name: `${node.request.name} copy` };
    await store.putRequest(node.stored.collection.id, copy);
    panels.open(copy, node.stored.collection.id);
  });
  register("veyraApi.delete", async (node?: Node) => {
    if (!node || node.kind === "folder") return;
    const label = node.kind === "collection" ? `the collection "${node.stored.collection.name}" and its ${node.stored.collection.requests.length} requests` : `"${node.request.name}"`;
    const ok = await vscode.window.showWarningMessage(`Delete ${label}?`, { modal: true }, "Delete");
    if (ok !== "Delete") return;
    if (node.kind === "collection") await store.deleteCollection(node.stored.collection.id);
    else { await store.removeRequest(node.request.id); panels.close(node.request.id); }
  });
  register("veyraApi.refresh", () => store.refresh());

  register("veyraApi.copyAsCurl", async (item?: Node | HistoryItem) => {
    const request = item && "kind" in item ? (item.kind === "request" ? item.request : undefined) : item?.request;
    if (!request) return;
    await vscode.env.clipboard.writeText(m.toCurl(m.prepare(request, await store.variables())));
    vscode.window.setStatusBarMessage("$(check) Copied as cURL", 2500);
  });
  register("veyraApi.saveHistoryItem", async (h?: HistoryItem) => {
    if (!h) return;
    const collection = await pickCollection("Save to which collection?");
    if (!collection) return;
    const name = await vscode.window.showInputBox({ prompt: "Request name", value: m.nameFor(h.request.method, h.request.url) });
    if (!name) return;
    await store.putRequest(collection.id, { ...structuredClone(h.request), id: m.newId(), name });
  });
  register("veyraApi.clearHistory", () => store.clearHistory());

  register("veyraApi.importCurl", async () => {
    const clip = (await vscode.env.clipboard.readText()).trim();
    const command = /^curl(\.exe)?\s/i.test(clip) ? clip : await vscode.window.showInputBox({ prompt: "Paste a cURL command", placeHolder: "curl https://api.example.com/users -H 'Authorization: Bearer …'", ignoreFocusOut: true });
    if (!command) return;
    try { panels.open(m.parseCurl(command), undefined); }
    catch (error) { vscode.window.showErrorMessage((error as Error).message); }
  });
  register("veyraApi.importPostman", async () => {
    const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "Postman collection": ["json"] }, title: "Import a Postman collection (exported as v2.1)" });
    if (!files?.[0]) return;
    try {
      const { collection, environment } = m.parsePostman(JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(files[0]))));
      await store.saveCollection(collection);
      if (environment) await store.saveEnvironments([...(await store.environments()), environment]);
      vscode.window.showInformationMessage(`Imported ${collection.requests.length} requests into "${collection.name}"${environment ? `, and its variables as the environment "${environment.name}"` : ""}.`);
    } catch (error) { vscode.window.showErrorMessage(error instanceof SyntaxError ? "That file is not valid JSON." : (error as Error).message); }
  });
  register("veyraApi.exportPostman", async (node?: Node) => {
    const collection = node?.kind === "collection" ? node.stored.collection : await pickCollection("Export which collection?");
    if (!collection) return;
    const file = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? store.root, `${m.slug(collection.name)}.postman_collection.json`), filters: { JSON: ["json"] } });
    if (!file) return;
    await vscode.workspace.fs.writeFile(file, encoder.encode(JSON.stringify(m.toPostman(collection), null, 2)));
    vscode.window.showInformationMessage(`Exported "${collection.name}". In Postman, choose Import and select this file.`);
  });

  register("veyraApi.newEnvironment", async () => {
    const name = await vscode.window.showInputBox({ prompt: "Environment name", placeHolder: "Development", validateInput: v => (v.trim() ? null : "Enter a name") });
    if (!name) return;
    const env: m.Environment = { id: m.newId(), name: name.trim(), variables: [{ key: "baseUrl", value: "http://localhost:3000", enabled: true }] };
    await store.saveEnvironments([...(await store.environments()), env]);
    if (!store.activeEnvironmentId) await store.setActiveEnvironment(env.id);
    environmentPanel.show(env.id);
  });
  register("veyraApi.editEnvironments", (env?: m.Environment) => environmentPanel.show(env?.id));
  register("veyraApi.useEnvironment", async (env?: m.Environment) => { if (env) await store.setActiveEnvironment(env.id); });
  register("veyraApi.switchEnvironment", async () => {
    const envs = await store.environments();
    const picked = await vscode.window.showQuickPick([
      { label: "$(circle-slash) No environment", id: undefined as string | undefined },
      ...envs.map(e => ({ label: `${e.id === store.activeEnvironmentId ? "$(pass-filled) " : ""}${e.name}`, description: `${e.variables.length} variables`, id: e.id as string | undefined })),
      { label: "$(edit) Edit environments…", id: "__edit" },
    ], { placeHolder: "Use which environment?" });
    if (!picked) return;
    if (picked.id === "__edit") environmentPanel.show();
    else await store.setActiveEnvironment(picked.id);
  });

  register("veyraApi.sendHttpRequest", async (uri: vscode.Uri, line: number) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const { requests, variables } = m.parseHttpFile(document.getText());
    const found = requests.find(r => r.line === line);
    if (!found) return;
    // File variables can use environment variables, and are used by the request.
    const env = await store.variables();
    const fileVars = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, m.resolve(v, { ...env, ...variables }).text]));
    panels.open(found.request, undefined, { send: true, extraVariables: fileVars });
  });

  context.subscriptions.push(
    status, watcher,
    vscode.window.registerTreeDataProvider("veyraApi.collections", new CollectionsTree(store)),
    vscode.window.registerTreeDataProvider("veyraApi.environments", new EnvironmentsTree(store)),
    vscode.window.registerTreeDataProvider("veyraApi.history", new HistoryTree(store)),
    vscode.languages.registerCodeLensProvider({ language: "http" }, new HttpLens()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => store.refresh()),
  );
}

export function deactivate() {}
