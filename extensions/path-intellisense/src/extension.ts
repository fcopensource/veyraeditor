import * as vscode from "vscode";
import * as path from "node:path";
import * as m from "./model";

/* Path IntelliSense Veyra: file path completions that understand your project, and warnings for paths that don't exist. */

const config = () => vscode.workspace.getConfiguration("veyraPath");
const CHECKED = new Set(["javascript", "typescript", "javascriptreact", "typescriptreact", "vue", "svelte", "astro", "mdx", "css", "scss", "sass", "less", "html", "markdown"]);

// ---------- Reading the file system through VS Code (works in remote and virtual workspaces) ----------

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try { return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"); } catch { return undefined; }
}
/** Whether a path exists; with `fileOnly`, only files count (an import of a folder needs its index file). */
async function exists(fsPath: string, base: vscode.Uri, fileOnly = false): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(base.with({ path: toUriPath(fsPath, base) }));
    return !fileOnly || (stat.type & vscode.FileType.File) !== 0;
  } catch { return false; }
}
/** A file system path in the same scheme as `base` (file:, vscode-remote:, …). */
const uriFor = (fsPath: string, base: vscode.Uri) => (base.scheme === "file" ? vscode.Uri.file(fsPath) : base.with({ path: toUriPath(fsPath, base) }));
const toUriPath = (fsPath: string, base: vscode.Uri) => (base.scheme === "file" ? vscode.Uri.file(fsPath).path : fsPath.replace(/\\/g, "/"));

// ---------- What each file's project looks like ----------

interface Project { config?: m.ProjectConfig; aliases: m.Alias[]; prefixes: string[]; packageType?: string; workspace: string; absoluteRoots: string[] }
class Projects {
  private cache = new Map<string, Promise<Project>>();
  forget() { this.cache.clear(); }
  /** The tsconfig/jsconfig and package.json that apply to a document, found by walking up from its folder. */
  get(doc: vscode.Uri): Promise<Project> {
    const dir = path.dirname(doc.fsPath);
    const key = `${doc.scheme}:${dir}`;
    if (!this.cache.has(key)) this.cache.set(key, this.load(doc, dir));
    return this.cache.get(key)!;
  }
  private async load(doc: vscode.Uri, dir: string): Promise<Project> {
    const folder = vscode.workspace.getWorkspaceFolder(doc);
    const workspace = folder?.uri.fsPath ?? dir;
    const texts = new Map<string, string | undefined>();
    const read = (f: string) => texts.get(path.normalize(f));
    let configFile: string | undefined, pkg: { dir: string; json: any } | undefined;
    for (let d = dir; ; d = path.dirname(d)) {
      if (!configFile) for (const name of ["tsconfig.json", "jsconfig.json"]) {
        const f = path.join(d, name);
        const text = await readText(uriFor(f, doc));
        if (text !== undefined) { texts.set(path.normalize(f), text); configFile = f; break; }
      }
      if (!pkg) { const text = await readText(uriFor(path.join(d, "package.json"), doc)); if (text) { try { pkg = { dir: d, json: JSON.parse(text) }; } catch { /* not JSON yet */ } } }
      if ((configFile && pkg) || d === workspace || path.dirname(d) === d || !d.startsWith(workspace)) break;
    }
    let cfg: m.ProjectConfig | undefined;
    if (configFile) {
      // Load the extends chain (relative files and packages in node_modules) before reading it synchronously.
      const pending = [configFile];
      for (let guard = 0; pending.length && guard < 10; guard++) {
        const f = pending.shift()!;
        let json: any;
        try { json = m.parseJsonc(read(f) ?? ""); } catch { continue; }
        for (const ext of ([] as string[]).concat(json.extends ?? [])) {
          const target = ext.startsWith(".") || path.isAbsolute(ext) ? path.resolve(path.dirname(f), ext.endsWith(".json") ? ext : `${ext}.json`) : path.join(pkg?.dir ?? workspace, "node_modules", ext.endsWith(".json") ? ext : path.join(ext, "tsconfig.json"));
          if (!texts.has(path.normalize(target))) { texts.set(path.normalize(target), await readText(uriFor(target, doc))); pending.push(target); }
        }
      }
      cfg = m.readProjectConfig(configFile, read, (spec, from) => {
        const p = path.join(pkg?.dir ?? from, "node_modules", spec.endsWith(".json") ? spec : path.join(spec, "tsconfig.json"));
        return texts.has(path.normalize(p)) ? p : undefined;
      });
    }
    const mappings = config().get<Record<string, string>>("mappings", {});
    const custom: m.Alias[] = Object.entries(mappings).map(([k, v]) => {
      const target = v.replace(/\$\{workspaceFolder\}/g, workspace).replace(/\$\{workspaceRoot\}/g, workspace);
      return { pattern: `${k.replace(/\/\*?$/, "")}/*`, targets: [path.join(path.resolve(workspace, target), "*")], source: "settings" };
    });
    const aliases = [...custom, ...(cfg?.aliases ?? []), ...(pkg ? m.packageImports(pkg.dir, pkg.json) : [])];
    const absSetting = config().get<string>("absolutePathTo", "").replace(/\$\{workspaceFolder\}/g, workspace);
    const absoluteRoots = absSetting ? [path.resolve(workspace, absSetting)] : [workspace, path.join(workspace, "public"), path.join(workspace, "static")];
    return { config: cfg, aliases, prefixes: m.aliasPrefixes(aliases), packageType: pkg?.json?.type, workspace, absoluteRoots };
  }
}

// ---------- Completions ----------

/**
 * VS Code's own TypeScript and JavaScript support also suggests paths in imports, so every file would be listed
 * twice. The first time it matters, offer to turn the built-in suggestions off. Asked once; nothing changes without a yes.
 */
function offerToTurnOffBuiltIn(context: vscode.ExtensionContext, languageId: string) {
  const section = /^typescript/.test(languageId) ? "typescript" : /^javascript/.test(languageId) ? "javascript" : undefined;
  if (!section || context.globalState.get<boolean>("veyraPath.askedBuiltIn")) return;
  if (!vscode.workspace.getConfiguration(section).get<boolean>("suggest.paths", true)) return;
  void context.globalState.update("veyraPath.askedBuiltIn", true);
  void vscode.window.showInformationMessage("VS Code also suggests paths in imports, so you may see each file twice. Turn off VS Code's own path suggestions and keep Path IntelliSense Veyra's?", "Turn Off", "Keep Both").then(async pick => {
    if (pick !== "Turn Off") return;
    await vscode.workspace.getConfiguration("typescript").update("suggest.paths", false, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration("javascript").update("suggest.paths", false, vscode.ConfigurationTarget.Global);
  });
}

class Completions implements vscode.CompletionItemProvider {
  constructor(private projects: Projects, private context: vscode.ExtensionContext) {}
  async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    const project = await this.projects.get(doc.uri);
    const line = doc.lineAt(pos.line).text;
    const ctx = m.contextAt(line, pos.character, doc.languageId, project.prefixes, !!project.config?.baseUrl);
    if (!ctx) return undefined;
    let typed = ctx.typed;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(typed) || typed.includes("${") || typed.startsWith("#") && !project.prefixes.some(p => p.startsWith("#"))) return undefined;
    // In HTML, CSS and Markdown a bare name is relative to the file, like "img/logo.png".
    const loose = ctx.kind === "html" || ctx.kind === "css" || ctx.kind === "markdown";
    if (loose && !m.looksLikePath(typed, project.prefixes)) typed = `./${typed}`;
    const fileDir = path.dirname(doc.uri.fsPath);
    const lookups: m.Lookup[] = typed.startsWith("/") && !typed.startsWith("//")
      ? project.absoluteRoots.map(root => ({ dir: path.join(root, typed.slice(0, typed.lastIndexOf("/") + 1)), partial: typed.slice(typed.lastIndexOf("/") + 1) }))
      : m.lookup(typed, fileDir, { workspace: project.workspace, aliases: project.aliases, baseUrl: project.config?.baseUrl });
    if (!lookups.length) return undefined;
    const partial = lookups[0].partial;
    const range = new vscode.Range(pos.line, pos.character - partial.length, pos.line, pos.character);
    const style = m.importStyle(project.config, project.packageType, doc.languageId, config().get<"auto" | "always" | "never">("importExtension", "auto"));
    const isImport = ctx.kind === "import" || ctx.kind === "require";
    if (isImport) offerToTurnOffBuiltIn(this.context, doc.languageId);
    const showHidden = config().get<boolean>("showHiddenFiles", false) || partial.startsWith(".");
    const excluded = Object.entries(vscode.workspace.getConfiguration("files", doc.uri).get<Record<string, boolean>>("exclude", {})).filter(([, on]) => on === true).map(([glob]) => glob.replace(/^\*\*\//, ""));
    const respectExclude = config().get<boolean>("respectFilesExclude", true);
    const slash = config().get<boolean>("slashAfterFolder", true);
    const seen = new Map<string, vscode.CompletionItem>();
    for (const l of lookups) {
      let entries: [string, vscode.FileType][];
      try { entries = await vscode.workspace.fs.readDirectory(uriFor(l.dir, doc.uri)); } catch { continue; }
      for (const [name, type] of entries) {
        if (!showHidden && name.startsWith(".")) continue;
        if (respectExclude && excluded.some(g => g === name || (g.startsWith("*.") && name.endsWith(g.slice(1))))) continue;
        if (name === "node_modules" && !partial.startsWith("node")) continue;
        const folder = (type & vscode.FileType.Directory) !== 0;
        const fullPath = path.join(l.dir, name);
        if (fullPath === doc.uri.fsPath && isImport) continue; // don't suggest importing the file into itself
        const insert = folder ? name : isImport ? m.importName(name, style) : name;
        if (seen.has(insert)) continue;
        const item = new vscode.CompletionItem({ label: insert, description: folder ? "folder" : insert !== name ? name : undefined }, folder ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
        item.range = range;
        item.insertText = folder && slash ? `${insert}/` : insert;
        item.filterText = insert;
        item.sortText = `${folder ? "0" : "1"}${insert.toLowerCase()}`;
        if (folder && slash) item.command = { command: "editor.action.triggerSuggest", title: "Show folder contents" };
        item.detail = l.via ? `${l.via.pattern} → ${vscode.workspace.asRelativePath(l.dir)}` : undefined;
        if (!folder && m.IMAGE.test(name)) {
          const uri = uriFor(fullPath, doc.uri);
          item.documentation = new vscode.MarkdownString(`![${name}](${uri.toString()}|width=180)`);
          (item as any).veyraSize = uri;
        }
        seen.set(insert, item);
      }
    }
    return [...seen.values()];
  }
  async resolveCompletionItem(item: vscode.CompletionItem): Promise<vscode.CompletionItem> {
    const uri = (item as any).veyraSize as vscode.Uri | undefined;
    if (uri) { try { const stat = await vscode.workspace.fs.stat(uri); item.detail = [item.detail, m.formatSize(stat.size)].filter(Boolean).join(" · "); } catch { /* gone */ } }
    return item;
  }
}

// ---------- Checking paths ----------

interface Found { line: number; start: number; end: number; typed: string; kind: m.Kind }
/** Every path-like string in a document that should exist on disk. */
export function pathsIn(text: string, languageId: string, prefixes: string[], allowBare: boolean): Found[] {
  const out: Found[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 3000) return;
    const ends: number[] = [];
    for (const m2 of line.matchAll(/(['"`])((?:\\.|(?!\1).)*?)\1/g)) ends.push(m2.index! + 1 + m2[2].length);
    if (languageId === "markdown" || languageId === "mdx") for (const m2 of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)/g)) ends.push(m2.index! + m2[0].length);
    for (const m2 of line.matchAll(/url\(\s*([^'")\s]+)\s*\)/g)) ends.push(m2.index! + m2[0].indexOf(m2[1]) + m2[1].length);
    for (const col of ends) {
      const ctx = m.contextAt(line, col, languageId, prefixes, allowBare);
      if (!ctx || !ctx.typed || ctx.end !== col && ctx.kind !== "markdown" && ctx.kind !== "css") continue;
      const typed = ctx.typed;
      if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#|[${}*<>|]|\s/i.test(typed) || typed.includes("{{")) continue;
      if (typed.endsWith("/") || typed === "." || typed === "..") continue; // still being typed
      const isCode = ctx.kind === "import" || ctx.kind === "require";
      // Web pages link to routes (href="/about"), not just files: only paths with a file extension are checked there.
      const lastSegment = typed.replace(/[?#].*$/, "").split("/").pop() ?? "";
      if (!isCode && !/\.[A-Za-z0-9]{1,6}$/.test(lastSegment)) continue;
      if (ctx.kind === "string") continue; // a loose string may be a URL path or a pattern: don't guess
      out.push({ line: i, start: ctx.start, end: ctx.start + typed.length, typed, kind: ctx.kind });
    }
  });
  return out.slice(0, 400);
}

class Checker implements vscode.CodeActionProvider, vscode.Disposable {
  readonly diagnostics = vscode.languages.createDiagnosticCollection("veyra-path");
  private fixes = new Map<string, Map<string, string[]>>();
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(private projects: Projects) {}

  schedule(doc: vscode.TextDocument, delay = 600) {
    if (!CHECKED.has(doc.languageId) || doc.uri.scheme === "output" || doc.uri.scheme === "git") return;
    clearTimeout(this.timers.get(doc.uri.toString()));
    this.timers.set(doc.uri.toString(), setTimeout(() => void this.check(doc), delay));
  }
  async check(doc: vscode.TextDocument) {
    if (!config().get<boolean>("checkPaths", true)) { this.diagnostics.delete(doc.uri); return; }
    const project = await this.projects.get(doc.uri);
    const version = doc.version;
    const found = pathsIn(doc.getText(), doc.languageId, project.prefixes, !!project.config?.baseUrl);
    const fileDir = path.dirname(doc.uri.fsPath);
    const roots = { workspace: project.workspace, aliases: project.aliases, baseUrl: project.config?.baseUrl };
    const diags: vscode.Diagnostic[] = [];
    const fixes = new Map<string, string[]>();
    const known = new Map<string, Promise<boolean>>();
    const has = (p: string, fileOnly: boolean) => { const key = `${fileOnly}:${p}`; if (!known.has(key)) known.set(key, exists(p, doc.uri, fileOnly)); return known.get(key)!; };
    for (const f of found) {
      // In HTML, CSS and Markdown, "img/logo.png" is relative to the file, like "./img/logo.png".
      const loose = (f.kind === "html" || f.kind === "css" || f.kind === "markdown") && !m.looksLikePath(f.typed, project.prefixes);
      const typed = loose ? `./${f.typed}` : f.typed;
      const targets = typed.startsWith("/") ? project.absoluteRoots.map(r => path.join(r, typed.replace(/[?#].*$/, ""))) : m.resolveTargets(typed, fileDir, roots);
      if (!targets.length) continue; // a package, or an alias we don't know
      let ok = false;
      const fileOnly = f.kind === "import" || f.kind === "require";
      for (const t of targets) { for (const c of m.candidates(t, f.kind)) if (await has(c, fileOnly)) { ok = true; break; } if (ok) break; }
      if (ok) continue;
      const suggestions = await this.suggestions(f, targets[0], doc.uri, project, doc.languageId);
      const d = new vscode.Diagnostic(new vscode.Range(f.line, f.start, f.line, f.end), `Can't find "${f.typed}".${suggestions.length ? ` Did you mean "${suggestions[0]}"?` : ""}`, vscode.DiagnosticSeverity.Warning);
      d.source = "Path IntelliSense Veyra"; d.code = "missing-path";
      diags.push(d);
      if (suggestions.length) fixes.set(`${f.line}:${f.start}`, suggestions);
    }
    if (doc.version !== version) return; // edited meanwhile: the next check will run
    this.fixes.set(doc.uri.toString(), fixes);
    this.diagnostics.set(doc.uri, diags);
  }
  /**
   * Suggests fixes for the first name in the path that doesn't exist, using the closest names in the folder above
   * it. The end of the resolved path mirrors the end of what was typed, so the same segment is replaced there.
   */
  private async suggestions(f: Found, target: string, base: vscode.Uri, project: Project, languageId: string): Promise<string[]> {
    const query = f.typed.match(/[?#].*$/)?.[0] ?? "";
    const typedSegments = f.typed.slice(0, f.typed.length - query.length).split("/");
    const targetSegments = path.resolve(target).split(/[\\/]/);
    // The deepest folder of the target that exists.
    let k = targetSegments.length - 1;
    while (k > 0 && !(await exists(targetSegments.slice(0, k).join(path.sep) || path.sep, base))) k--;
    if (k <= 0) return [];
    const missing = targetSegments[k];
    const j = typedSegments.length - (targetSegments.length - k);
    if (j < 0 || typedSegments[j] !== missing) return [];
    let names: string[];
    try { names = (await vscode.workspace.fs.readDirectory(uriFor(targetSegments.slice(0, k).join(path.sep) || path.sep, base))).map(([n]) => n); } catch { return []; }
    const isLast = j === typedSegments.length - 1;
    const isCode = f.kind === "import" || f.kind === "require";
    const style = m.importStyle(project.config, project.packageType, languageId, config().get<"auto" | "always" | "never">("importExtension", "auto"));
    // An import written without an extension ("./helpr") gets one written the same way ("./helper").
    const write = (name: string) => (isLast && isCode ? (/\.[^./]+$/.test(missing) ? m.importName(name, { ...style, dropExtension: false }) : m.importName(name, { ...style, dropExtension: true, tsToJs: false })) : name);
    return [...new Set(m.suggest(missing, names).map(name => [...typedSegments.slice(0, j), write(name), ...typedSegments.slice(j + 1)].join("/") + query))].filter(s => s !== f.typed);
  }
  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const fixes = this.fixes.get(doc.uri.toString());
    return context.diagnostics.filter(d => d.source === "Path IntelliSense Veyra").flatMap(d => (fixes?.get(`${d.range.start.line}:${d.range.start.character}`) ?? []).map((s, i) => {
      const a = new vscode.CodeAction(`Change to "${s}"`, vscode.CodeActionKind.QuickFix);
      a.edit = new vscode.WorkspaceEdit();
      a.edit.replace(doc.uri, d.range, s);
      a.diagnostics = [d];
      a.isPreferred = i === 0;
      return a;
    }));
  }
  forget(uri: vscode.Uri) { this.diagnostics.delete(uri); this.fixes.delete(uri.toString()); }
  dispose() { this.diagnostics.dispose(); this.timers.forEach(clearTimeout); }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const projects = new Projects();
  const completions = new Completions(projects, context);
  const checker = new Checker(projects);
  const selector: vscode.DocumentSelector = [{ scheme: "file" }, { scheme: "vscode-remote" }, { scheme: "vscode-vfs" }];
  const recheckAll = () => vscode.workspace.textDocuments.forEach(d => checker.schedule(d, 100));
  const watcher = vscode.workspace.createFileSystemWatcher("**/{tsconfig*.json,jsconfig*.json,package.json}");
  // New, deleted and renamed files can fix or break paths in open documents.
  const files = vscode.workspace.createFileSystemWatcher("**/*", false, true, false);
  let filesTimer: NodeJS.Timeout | undefined;
  const filesChanged = () => { clearTimeout(filesTimer); filesTimer = setTimeout(recheckAll, 700); };
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, completions, "/", '"', "'", "`", "(", "."),
    vscode.languages.registerCodeActionsProvider(selector, checker, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.workspace.onDidOpenTextDocument(d => checker.schedule(d, 200)),
    vscode.workspace.onDidChangeTextDocument(e => checker.schedule(e.document)),
    vscode.workspace.onDidCloseTextDocument(d => checker.forget(d.uri)),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraPath") || e.affectsConfiguration("files.exclude")) { projects.forget(); recheckAll(); } }),
    watcher, watcher.onDidChange(() => { projects.forget(); recheckAll(); }), watcher.onDidCreate(() => { projects.forget(); recheckAll(); }), watcher.onDidDelete(() => { projects.forget(); recheckAll(); }),
    files, files.onDidCreate(filesChanged), files.onDidDelete(filesChanged),
    checker,
  );
  recheckAll();
  return { projects, checker }; // for the integration tests
}

export function deactivate() {}
