import * as vscode from "vscode";
import { buildTree, colorKey, countIn, excludedBy, filterTodos, findTodos, globToRegExp, toMarkdown, type FileTodos, type Folder, type Todo } from "./model";

/* Todo Tree Veyra: every tag in the workspace's comments, in a tree, kept up to date, and highlighted in the editor. */

const config = () => vscode.workspace.getConfiguration("veyraTodo");
const tags = () => config().get<string[]>("tags", ["TODO", "FIXME", "BUG", "HACK", "XXX", "NOTE"]);
const MAX_BYTES = 1024 * 1024;

interface Entry { uri: vscode.Uri; path: string; todos: Todo[] }

/** Every file's tags, by URI. Reads files through VS Code, so it works in remote and virtual workspaces too. */
class Index {
  readonly files = new Map<string, Entry>();
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  scanning = false;
  private excludes: RegExp[] = [];

  /** The path shown in the tree: relative to its folder, with the folder's name first when there are several. */
  relative(uri: vscode.Uri): string | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return undefined;
    const rel = vscode.workspace.asRelativePath(uri, false);
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 1 ? `${folder.name}/${rel}` : rel;
  }

  private excludeGlobs(): string[] {
    const fromSettings = (key: string) => Object.entries(vscode.workspace.getConfiguration().get<Record<string, unknown>>(key, {}) ?? {}).filter(([, on]) => on === true).map(([glob]) => glob);
    return [...config().get<string[]>("exclude", []), ...fromSettings("files.exclude"), ...fromSettings("search.exclude")];
  }
  excluded(uri: vscode.Uri): boolean {
    const rel = vscode.workspace.asRelativePath(uri, false);
    return excludedBy(rel, this.excludes) || !globToRegExp(config().get<string>("include", "**/*")).test(rel);
  }

  async scanAll() {
    this.scanning = true;
    vscode.commands.executeCommand("setContext", "veyraTodo.scanning", true);
    const globs = this.excludeGlobs();
    this.excludes = globs.map(globToRegExp);
    try {
      const uris = await vscode.workspace.findFiles(config().get<string>("include", "**/*"), globs.length ? `{${globs.join(",")}}` : null, config().get<number>("maxFiles", 5000));
      const next = new Map<string, Entry>();
      const words = tags();
      const open = new Map(vscode.workspace.textDocuments.map(d => [d.uri.toString(), d]));
      for (let i = 0; i < uris.length; i += 32) {
        await Promise.all(uris.slice(i, i + 32).map(async uri => {
          const text = open.get(uri.toString())?.getText() ?? await read(uri);
          if (text === undefined) return;
          const todos = findTodos(text, words);
          const path = this.relative(uri);
          if (todos.length && path) next.set(uri.toString(), { uri, path, todos });
        }));
      }
      this.files.clear();
      next.forEach((v, k) => this.files.set(k, v));
    } finally {
      this.scanning = false;
      vscode.commands.executeCommand("setContext", "veyraTodo.scanning", false);
      this.changed.fire();
    }
  }

  /** Re-reads one file (from the editor when it's open, so unsaved edits count). */
  async update(uri: vscode.Uri, text?: string) {
    const key = uri.toString();
    const path = this.relative(uri);
    if (!path || this.excluded(uri)) { if (this.files.delete(key)) this.changed.fire(); return; }
    const content = text ?? vscode.workspace.textDocuments.find(d => d.uri.toString() === key)?.getText() ?? await read(uri);
    const todos = content === undefined ? [] : findTodos(content, tags());
    const before = JSON.stringify(this.files.get(key)?.todos ?? []);
    if (todos.length) this.files.set(key, { uri, path, todos }); else this.files.delete(key);
    if (before !== JSON.stringify(todos)) this.changed.fire();
  }
  remove(uri: vscode.Uri) { if (this.files.delete(uri.toString())) this.changed.fire(); }
  get count() { let n = 0; this.files.forEach(f => (n += f.todos.length)); return n; }
}

async function read(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > MAX_BYTES || bytes.subarray(0, 8000).includes(0)) return undefined; // too big, or binary
    return new TextDecoder("utf-8").decode(bytes);
  } catch { return undefined; }
}

// ---------- Tree ----------

type Node =
  | { kind: "folder"; folder: Folder }
  | { kind: "file"; entry: Entry }
  | { kind: "tag"; tag: string; items: { entry: Entry; todo: Todo }[] }
  | { kind: "todo"; entry: Entry; todo: Todo; byTag: boolean };

class Tree implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  filter = "";
  constructor(private readonly index: Index) {}
  refresh() { this.changed.fire(undefined); }

  private visible(): Entry[] {
    const all = [...this.index.files.values()];
    if (!this.filter) return all;
    const kept = new Map(filterTodos(all.map(e => ({ path: e.path, todos: e.todos })), this.filter).map(f => [f.path, f.todos]));
    return all.filter(e => kept.has(e.path)).map(e => ({ ...e, todos: kept.get(e.path)! }));
  }
  get shownCount() { return this.visible().reduce((n, e) => n + e.todos.length, 0); }

  getChildren(node?: Node): Node[] {
    const entries = this.visible();
    const byPath = new Map(entries.map(e => [e.path, e]));
    const folderChildren = (f: Folder): Node[] => [
      ...f.folders.sort((a, b) => a.name.localeCompare(b.name)).map(folder => ({ kind: "folder" as const, folder })),
      ...f.files.map(file => ({ kind: "file" as const, entry: byPath.get(file.path)! })),
    ];
    if (!node) {
      if (config().get<string>("groupBy", "file") === "tag") {
        const order = [...new Set([...tags(), ...entries.flatMap(e => e.todos.map(t => t.tag))])];
        return order.map(tag => ({ kind: "tag" as const, tag, items: entries.flatMap(entry => entry.todos.filter(t => t.tag === tag).map(todo => ({ entry, todo }))) })).filter(n => n.items.length);
      }
      return folderChildren(buildTree(entries.map(e => ({ path: e.path, todos: e.todos }))));
    }
    if (node.kind === "folder") return folderChildren(node.folder);
    if (node.kind === "file") return node.entry.todos.map(todo => ({ kind: "todo" as const, entry: node.entry, todo, byTag: false }));
    if (node.kind === "tag") return node.items.map(i => ({ kind: "todo" as const, entry: i.entry, todo: i.todo, byTag: true }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "folder") {
      const item = new vscode.TreeItem(node.folder.name, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = vscode.ThemeIcon.Folder;
      item.description = String(countIn(node.folder));
      item.id = `folder:${node.folder.path}:${this.filter}`;
      return item;
    }
    if (node.kind === "file") {
      const item = new vscode.TreeItem(node.entry.uri, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = vscode.ThemeIcon.File; // the file icon theme picks the icon from the file name
      item.description = String(node.entry.todos.length);
      item.id = `file:${node.entry.uri}:${this.filter}`;
      item.tooltip = node.entry.path;
      return item;
    }
    if (node.kind === "tag") {
      const item = new vscode.TreeItem(node.tag, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon("tag", new vscode.ThemeColor(`veyraTodo.${colorKey(node.tag)}`));
      item.description = String(node.items.length);
      item.id = `tag:${node.tag}:${this.filter}`;
      return item;
    }
    const { todo, entry } = node;
    const item = new vscode.TreeItem(todo.text || todo.tag, vscode.TreeItemCollapsibleState.None);
    const where = node.byTag ? `${entry.path.split("/").pop()}:${todo.line + 1}` : `line ${todo.line + 1}`;
    item.description = [node.byTag ? "" : todo.text ? todo.tag : "", where, todo.owner ? `@${todo.owner}` : ""].filter(Boolean).join(" · ");
    item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(`veyraTodo.${colorKey(todo.tag)}`));
    item.tooltip = new vscode.MarkdownString(`**${todo.tag}**${todo.owner ? ` for @${todo.owner}` : ""}\n\n${(todo.text || "(no text)").replace(/[\\`*_[\]<>]/g, "\\$&")}\n\n\`${entry.path}:${todo.line + 1}\``);
    item.contextValue = "todo";
    item.id = `todo:${entry.uri}:${todo.line}:${node.byTag}:${this.filter}`;
    const at = new vscode.Range(todo.line, todo.column, todo.line, todo.column + todo.length);
    item.command = { command: "vscode.open", title: "Open", arguments: [entry.uri, { selection: at, preview: true }] };
    return item;
  }
}

// ---------- Editor highlights ----------

class Highlights {
  private types = new Map<string, vscode.TextEditorDecorationType>();
  build() {
    this.types.forEach(t => t.dispose());
    this.types.clear();
    for (const key of ["todo", "fixme", "hack", "note"]) {
      const color = new vscode.ThemeColor(`veyraTodo.${key}`);
      this.types.set(key, vscode.window.createTextEditorDecorationType({ color, fontWeight: "bold", overviewRulerColor: color, overviewRulerLane: vscode.OverviewRulerLane.Right }));
    }
  }
  /** For tests: what each document has highlighted. */
  readonly shown = new Map<string, number>();
  update(editor: vscode.TextEditor) {
    const mode = config().get<string>("highlight", "tag");
    const ranges = new Map<string, vscode.Range[]>([["todo", []], ["fixme", []], ["hack", []], ["note", []]]);
    let n = 0;
    if (mode !== "none" && editor.document.lineCount < 100000) {
      for (const t of findTodos(editor.document.getText(), tags())) {
        const end = mode === "text" ? editor.document.lineAt(t.line).range.end.character : t.column + t.length;
        ranges.get(colorKey(t.tag))!.push(new vscode.Range(t.line, t.column, t.line, end));
        n++;
      }
    }
    this.types.forEach((type, key) => editor.setDecorations(type, ranges.get(key) ?? []));
    this.shown.set(editor.document.uri.toString(), n);
  }
  dispose() { this.types.forEach(t => t.dispose()); }
}

export function activate(context: vscode.ExtensionContext) {
  const index = new Index();
  const tree = new Tree(index);
  const view = vscode.window.createTreeView("veyraTodo.tree", { treeDataProvider: tree, showCollapseAll: true });
  const highlights = new Highlights();
  highlights.build();

  const setContext = () => {
    vscode.commands.executeCommand("setContext", "veyraTodo.groupBy", config().get("groupBy", "file"));
    vscode.commands.executeCommand("setContext", "veyraTodo.filtered", !!tree.filter);
  };
  const render = () => {
    tree.refresh();
    const total = index.count, shown = tree.shownCount;
    view.badge = config().get("showCount", true) && total ? { value: total, tooltip: `${total} tag${total === 1 ? "" : "s"} in comments` } : undefined;
    view.message = tree.filter ? `Showing ${shown} of ${total} matching "${tree.filter}"` : undefined;
    view.description = undefined;
  };
  index.onDidChange(render);

  // Keep up with edits (after a short pause), saves, new and deleted files.
  const timers = new Map<string, NodeJS.Timeout>();
  const soon = (uri: vscode.Uri, run: () => void) => { clearTimeout(timers.get(uri.toString())); timers.set(uri.toString(), setTimeout(run, 300)); };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  context.subscriptions.push(
    view, highlights, watcher,
    watcher.onDidCreate(uri => soon(uri, () => index.update(uri))),
    watcher.onDidChange(uri => soon(uri, () => index.update(uri))),
    watcher.onDidDelete(uri => index.remove(uri)),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme !== "file" && e.document.uri.scheme !== "vscode-remote" && e.document.uri.scheme !== "vscode-vfs") return;
      soon(e.document.uri, () => {
        index.update(e.document.uri, e.document.getText());
        vscode.window.visibleTextEditors.filter(ed => ed.document === e.document).forEach(ed => highlights.update(ed));
      });
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(e => highlights.update(e))),
    vscode.workspace.onDidChangeWorkspaceFolders(() => index.scanAll()),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("veyraTodo") && !e.affectsConfiguration("files.exclude") && !e.affectsConfiguration("search.exclude")) return;
      setContext();
      if (["tags", "include", "exclude", "maxFiles"].some(k => e.affectsConfiguration(`veyraTodo.${k}`)) || !e.affectsConfiguration("veyraTodo")) index.scanAll();
      else render();
      vscode.window.visibleTextEditors.forEach(ed => highlights.update(ed));
    }),
    vscode.commands.registerCommand("veyraTodo.refresh", () => index.scanAll()),
    vscode.commands.registerCommand("veyraTodo.groupByTag", () => config().update("groupBy", "tag", vscode.ConfigurationTarget.Global)),
    vscode.commands.registerCommand("veyraTodo.groupByFile", () => config().update("groupBy", "file", vscode.ConfigurationTarget.Global)),
    vscode.commands.registerCommand("veyraTodo.filter", async (value?: string) => {
      const text = typeof value === "string" ? value : await vscode.window.showInputBox({ prompt: "Show tags whose text, tag, owner or file contains", value: tree.filter, placeHolder: "e.g. login, FIXME, @ada, src/api" });
      if (text === undefined) return;
      tree.filter = text.trim().replace(/^@/, "");
      setContext();
      render();
    }),
    vscode.commands.registerCommand("veyraTodo.clearFilter", () => { tree.filter = ""; setContext(); render(); }),
    vscode.commands.registerCommand("veyraTodo.exportMarkdown", async () => {
      const files: FileTodos[] = [...index.files.values()].sort((a, b) => a.path.localeCompare(b.path)).map(e => ({ path: e.path, todos: e.todos }));
      const filtered = tree.filter ? filterTodos(files, tree.filter) : files;
      if (!filtered.length) { vscode.window.showInformationMessage("There are no tags to copy."); return; }
      await vscode.env.clipboard.writeText(toMarkdown(filtered, tags()));
      const n = filtered.reduce((s, f) => s + f.todos.length, 0);
      const open = await vscode.window.showInformationMessage(`Copied a checklist of ${n} item${n === 1 ? "" : "s"}. Paste it into an issue or a note.`, "Open as Document");
      if (open) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: "markdown", content: toMarkdown(filtered, tags()) }));
    }),
    vscode.commands.registerCommand("veyraTodo.copyText", async (node?: Node) => {
      if (node?.kind !== "todo") return;
      await vscode.env.clipboard.writeText(`${node.todo.tag}: ${node.todo.text}`);
    }),
  );
  setContext();
  vscode.window.visibleTextEditors.forEach(e => highlights.update(e));
  // Look through the workspace once VS Code has settled.
  const start = setTimeout(() => index.scanAll(), 1200);
  context.subscriptions.push({ dispose: () => clearTimeout(start) });
  return { index, tree, view, highlights }; // for the integration tests
}

export function deactivate() {}
