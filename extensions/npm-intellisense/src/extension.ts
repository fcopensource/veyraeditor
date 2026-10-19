import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { builtinModules } from "node:module";
import * as m from "./model";

/* Veyra npm IntelliSense: completions, hovers and checks for npm packages in import and require. */

const LANGUAGES = ["javascript", "javascriptreact", "typescript", "typescriptreact", "vue", "svelte", "astro"];
const SELECTOR: vscode.DocumentSelector = LANGUAGES.map(language => ({ language, scheme: "file" }));
const BUILTINS = new Set(builtinModules.filter(name => !name.startsWith("_")));
const SOURCE = "Veyra npm";
const config = () => vscode.workspace.getConfiguration("veyraNpm");

// ---------- Reading the project, with small caches ----------

const manifestCache = new Map<string, { mtime: number; manifest: m.Manifest | null }>();
function manifestAt(file: string): m.Manifest | null {
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { manifestCache.delete(file); return null; }
  const cached = manifestCache.get(file);
  if (cached && cached.mtime === stat.mtimeMs) return cached.manifest;
  let manifest: m.Manifest | null = null;
  try { manifest = m.readManifest(fs.readFileSync(file, "utf8"), file); } catch { /* unreadable */ }
  manifestCache.set(file, { mtime: stat.mtimeMs, manifest });
  return manifest;
}

/** Folders from a file's folder up to its workspace folder (or the disk root when outside one). */
function foldersUp(file: string): string[] {
  const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath;
  const folders: string[] = [];
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    folders.push(dir);
    if (dir === root || path.dirname(dir) === dir) break;
  }
  return folders;
}
/** The nearest package.json first, then its parents up to the workspace folder (a monorepo root). */
const manifestsFor = (file: string) => foldersUp(file).map(dir => manifestAt(path.join(dir, "package.json"))).filter((x): x is m.Manifest => !!x);

const shortLived = new Map<string, { at: number; value: unknown }>();
function remember<T>(key: string, compute: () => T, ttl = 15000): T {
  const hit = shortLived.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = compute();
  shortLived.set(key, { at: Date.now(), value });
  return value;
}

/** Where Node would find a package from this folder, if it is installed. */
function packageDir(fromDir: string, pkg: string): string | null {
  return remember(`dir|${fromDir}|${pkg}`, () => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, "node_modules", pkg);
      if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
      if (path.dirname(dir) === dir) return null;
    }
  });
}
function installedPackageJson(fromDir: string, pkg: string): any {
  const dir = packageDir(fromDir, pkg);
  if (!dir) return null;
  return remember(`json|${dir}`, () => { try { return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")); } catch { return null; } });
}
/** Yarn Plug'n'Play has no node_modules, so whether a package is installed cannot be checked there. */
const usesPnp = (file: string) => remember(`pnp|${file}`, () => foldersUp(file).some(dir => fs.existsSync(path.join(dir, ".pnp.cjs"))));

/** Our own ignore list, the built-in aliases and the "paths" of the nearest tsconfig.json or jsconfig.json. */
function ignoreFor(file: string): string[] {
  const aliases = remember(`alias|${path.dirname(file)}`, () => {
    for (const dir of foldersUp(file)) for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const config = path.join(dir, name);
      if (fs.existsSync(config)) { try { return m.aliasPrefixes(m.parseJsonc(fs.readFileSync(config, "utf8"))); } catch { return []; } }
    }
    return [] as string[];
  });
  return [...m.DEFAULT_IGNORE, ...aliases, ...config().get<string[]>("ignore", [])];
}

function packageManagerFor(manifests: m.Manifest[]): m.PackageManager {
  const field = [...manifests].reverse().find(x => x.packageManager)?.packageManager;
  const files = manifests.flatMap(x => { try { return fs.readdirSync(path.dirname(x.path)); } catch { return []; } });
  return m.detectPackageManager(files, field);
}

// ---------- Completions ----------

function inScript(document: vscode.TextDocument, position: vscode.Position) {
  if (!["vue", "svelte", "astro"].includes(document.languageId)) return true;
  const offset = document.offsetAt(position);
  return m.scriptRanges(document.getText(), document.languageId).some(r => offset >= r.start && offset <= r.end);
}

const completions: vscode.CompletionItemProvider = {
  provideCompletionItems(document, position) {
    const context = m.importContextAt(document.lineAt(position.line).text, position.character);
    if (!context || !inScript(document, position) || /^[./]/.test(context.prefix)) return;
    const range = new vscode.Range(position.line, context.start, position.line, context.end);
    const file = document.uri.fsPath, dir = path.dirname(file);
    const pkg = m.packageNameOf(context.prefix);

    // After "package/": the package's own subpaths.
    if (pkg && context.prefix.length > pkg.length) return new vscode.CompletionList(subpathItems(dir, pkg, context.prefix, range), false);

    const items: vscode.CompletionItem[] = [];
    const manifests = manifestsFor(file);
    for (const dep of m.mergeDependencies(manifests)) {
      const item = new vscode.CompletionItem({ label: dep.name, description: dep.version }, vscode.CompletionItemKind.Module);
      item.range = range;
      item.detail = `${m.KIND_LABEL[dep.kind]} · ${vscode.workspace.asRelativePath(dep.manifest)}`;
      item.sortText = `${m.DEP_KINDS.indexOf(dep.kind)}${dep.name}`;
      (item as Detailed).veyra = { dir, pkg: dep.name };
      items.push(item);
    }
    if (config().get("builtins", true)) {
      const style = config().get<string>("nodeProtocol", "auto");
      const prefix = context.prefix.startsWith("node:") || style === "always" || (style === "auto" && m.usesNodeProtocol(document.getText())) ? "node:" : "";
      for (const name of BUILTINS) {
        const text = prefix + name;
        const item = new vscode.CompletionItem({ label: text, description: "Node.js" }, vscode.CompletionItemKind.Module);
        item.range = range;
        item.filterText = text;
        item.detail = "Node.js built-in module";
        item.sortText = `9${name}`;
        item.documentation = new vscode.MarkdownString(`[Node.js documentation](https://nodejs.org/api/${name.split("/")[0]}.html)`);
        items.push(item);
      }
    }
    return new vscode.CompletionList(items, false);
  },
  // Package descriptions are read only for the item the user is looking at.
  resolveCompletionItem(item) {
    const info = (item as Detailed).veyra;
    const json = info && installedPackageJson(info.dir, info.pkg);
    if (json) item.documentation = new vscode.MarkdownString(packageSummary(json, info!.pkg));
    else if (info) item.documentation = new vscode.MarkdownString(`*Not installed yet.* Run your package manager's install.`);
    return item;
  },
};
type Detailed = vscode.CompletionItem & { veyra?: { dir: string; pkg: string } };

function subpathItems(dir: string, pkg: string, typed: string, range: vscode.Range): vscode.CompletionItem[] {
  const json = installedPackageJson(dir, pkg);
  const exported = m.exportedSubpaths(json);
  const items: vscode.CompletionItem[] = [];
  if (exported.length) {
    for (const sub of exported) {
      const item = new vscode.CompletionItem(`${pkg}/${sub}`, vscode.CompletionItemKind.Module);
      item.range = range;
      item.detail = `exported by ${pkg}`;
      items.push(item);
    }
    return items;
  }
  // No "exports": list the package's folders and files, one level at a time.
  const root = packageDir(dir, pkg);
  if (!root) return items;
  const rest = typed.slice(pkg.length + 1), folder = rest.includes("/") ? rest.slice(0, rest.lastIndexOf("/")) : "";
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(path.join(root, folder), { withFileTypes: true }); } catch { return items; }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const isDir = entry.isDirectory();
    if (!isDir && !/\.(c|m)?js$|\.json$|\.d\.ts$|\.css$/.test(entry.name)) continue;
    const spec = `${pkg}/${folder ? folder + "/" : ""}${entry.name}${isDir ? "/" : ""}`;
    const item = new vscode.CompletionItem(spec, isDir ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File);
    item.range = range;
    if (isDir) item.command = { command: "editor.action.triggerSuggest", title: "More" };
    items.push(item);
  }
  return items;
}

// ---------- Hovers ----------

function packageSummary(json: any, pkg: string): string {
  const lines = [`**${pkg}** \`${json.version ?? "?"}\` installed`];
  if (json.description) lines.push("", String(json.description));
  const facts: string[] = [];
  if (json.license) facts.push(`License: ${typeof json.license === "string" ? json.license : json.license.type ?? "see package"}`);
  const deps = Object.keys(json.dependencies ?? {}).length;
  facts.push(deps ? `${deps} dependenc${deps === 1 ? "y" : "ies"}` : "no dependencies");
  if (json.types || json.typings || json.exports?.["."]?.types) facts.push("types included");
  if (facts.length) lines.push("", facts.join(" · "));
  const links = [`[npm](https://www.npmjs.com/package/${pkg})`];
  const repo = typeof json.repository === "string" ? json.repository : json.repository?.url;
  if (typeof json.homepage === "string") links.push(`[Homepage](${json.homepage})`);
  if (typeof repo === "string" && /github\.com/.test(repo)) links.push(`[Repository](${repo.replace(/^git\+/, "").replace(/\.git$/, "")})`);
  lines.push("", links.join(" · "));
  return lines.join("\n");
}

const latestCache = new Map<string, Promise<string | null>>();
function latestVersion(pkg: string): Promise<string | null> {
  if (!latestCache.has(pkg)) {
    const url = `https://registry.npmjs.org/${pkg.replace("/", "%2F")}/latest`;
    latestCache.set(pkg, fetch(url, { signal: AbortSignal.timeout(2500), headers: { Accept: "application/json" } })
      .then(r => (r.ok ? r.json() : null)).then((j: any) => (typeof j?.version === "string" ? j.version : null)).catch(() => null));
    setTimeout(() => latestCache.delete(pkg), 60 * 60 * 1000);
  }
  return latestCache.get(pkg)!;
}

const hovers: vscode.HoverProvider = {
  async provideHover(document, position) {
    const offset = document.offsetAt(position);
    const found = m.findImportsIn(document.getText(), document.languageId).find(f => offset >= f.start && offset <= f.end);
    if (!found) return;
    const range = new vscode.Range(document.positionAt(found.start), document.positionAt(found.end));
    const file = document.uri.fsPath, kind = m.classify(found.spec, BUILTINS, ignoreFor(file));
    if (kind === "builtin") {
      const name = found.spec.replace(/^node:/, "").split("/")[0];
      return new vscode.Hover(new vscode.MarkdownString(`**${found.spec}**: Node.js built-in module\n\n[Documentation](https://nodejs.org/api/${name}.html)`), range);
    }
    if (kind !== "package") return;
    const pkg = m.packageNameOf(found.spec)!;
    const dep = m.mergeDependencies(manifestsFor(file)).find(d => d.name === pkg);
    const json = installedPackageJson(path.dirname(file), pkg);
    const text = [json ? packageSummary(json, pkg) : `**${pkg}**: not installed`];
    text.push("", dep ? `In ${vscode.workspace.asRelativePath(dep.manifest)} as a ${m.KIND_LABEL[dep.kind]}: \`${dep.version}\`` : "Not in package.json");
    if (config().get("latestVersion", true)) {
      const latest = await latestVersion(pkg);
      if (latest) text.push("", json?.version && json.version !== latest ? `**Latest on npm: \`${latest}\`**` : `Latest on npm: \`${latest}\``);
    }
    const markdown = new vscode.MarkdownString(text.join("\n"));
    markdown.isTrusted = false;
    return new vscode.Hover(markdown, range);
  },
};

// ---------- Checks and quick fixes ----------

const diagnostics = vscode.languages.createDiagnosticCollection("veyra-npm");
const MESSAGES: Record<m.Problem["code"], (pkg: string, pm: m.PackageManager) => string> = {
  missing: pkg => `"${pkg}" is not installed and not in package.json.`,
  transitive: pkg => `"${pkg}" is not in package.json. It only works because another package installed it, and can break when that package changes.`,
  "not-installed": (pkg, pm) => `"${pkg}" is in package.json but not installed. Run ${m.installCommand(pm, [])}.`,
};

function check(document: vscode.TextDocument) {
  if (document.uri.scheme !== "file" || !LANGUAGES.includes(document.languageId)) return;
  const file = document.uri.fsPath, manifests = manifestsFor(file);
  if (!config().get("checkImports", true) || !manifests.length || /[\\/]node_modules[\\/]/.test(file)) { diagnostics.delete(document.uri); return; }
  const declared = new Set(m.mergeDependencies(manifests).map(d => d.name));
  const pnp = usesPnp(file), dir = path.dirname(file), pm = packageManagerFor(manifests);
  const problems = m.checkImports(m.findImportsIn(document.getText(), document.languageId), {
    declared, self: manifests[0].name, builtins: BUILTINS, ignore: ignoreFor(file),
    installed: pkg => (pnp ? declared.has(pkg) : !!packageDir(dir, pkg)),
  });
  diagnostics.set(document.uri, problems.map(problem => {
    const diagnostic = new vscode.Diagnostic(new vscode.Range(document.positionAt(problem.start), document.positionAt(problem.end)), MESSAGES[problem.code](problem.pkg, pm), vscode.DiagnosticSeverity.Warning);
    diagnostic.source = SOURCE;
    diagnostic.code = problem.code;
    return diagnostic;
  }));
}

const pending = new Map<string, NodeJS.Timeout>();
function checkSoon(document: vscode.TextDocument, delay = 500) {
  const key = document.uri.toString();
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(() => { pending.delete(key); check(document); }, delay));
}
function recheckAll() {
  shortLived.clear();
  for (const document of vscode.workspace.textDocuments) checkSoon(document, 300);
}

const fixes: vscode.CodeActionProvider = {
  provideCodeActions(document, _range, context) {
    if (!vscode.workspace.isTrusted) return [];
    const actions: vscode.CodeAction[] = [];
    const manifests = manifestsFor(document.uri.fsPath);
    if (!manifests.length) return actions;
    const cwd = path.dirname(manifests[0].path), pm = packageManagerFor(manifests);
    for (const diagnostic of context.diagnostics.filter(d => d.source === SOURCE)) {
      const pkg = /"([^"]+)"/.exec(diagnostic.message)?.[1];
      if (!pkg) continue;
      const add = (title: string, command: string, preferred = false) => {
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.command = { command: "veyraNpm.run", title, arguments: [cwd, command] };
        action.diagnostics = [diagnostic];
        action.isPreferred = preferred;
        actions.push(action);
      };
      if (diagnostic.code === "not-installed") add(`Run ${m.installCommand(pm, [])}`, m.installCommand(pm, []), true);
      else {
        add(`Install ${pkg}`, m.installCommand(pm, [pkg]), true);
        add(`Install ${pkg} as a dev dependency`, m.installCommand(pm, [pkg], true));
      }
    }
    return actions;
  },
};

function run(cwd: string, command: string) {
  if (!vscode.workspace.isTrusted) { vscode.window.showWarningMessage("Installing packages is turned off in Restricted Mode. Trust this folder to install."); return; }
  const terminal = vscode.window.terminals.find(t => t.name === "Veyra npm" && (t.creationOptions as vscode.TerminalOptions).cwd === cwd)
    ?? vscode.window.createTerminal({ name: "Veyra npm", cwd, iconPath: new vscode.ThemeIcon("package") });
  terminal.show();
  terminal.sendText(command);
}

// ---------- Commands ----------

function activeCodeEditor() {
  const editor = vscode.window.activeTextEditor;
  return editor && LANGUAGES.includes(editor.document.languageId) ? editor : undefined;
}

async function addImport() {
  const editor = activeCodeEditor();
  if (!editor) { vscode.window.showInformationMessage("Open a JavaScript or TypeScript file to add an import."); return; }
  const document = editor.document, file = document.uri.fsPath, text = document.getText();
  const deps = m.mergeDependencies(manifestsFor(file));
  const node = config().get<string>("nodeProtocol", "auto");
  const prefix = node === "always" || (node === "auto" && m.usesNodeProtocol(text)) ? "node:" : "";
  const picked = await vscode.window.showQuickPick([
    ...deps.map(d => ({ label: d.name, description: d.version, detail: m.KIND_LABEL[d.kind], spec: d.name })),
    { label: "Node.js built-ins", kind: vscode.QuickPickItemKind.Separator, spec: "" },
    ...[...BUILTINS].map(name => ({ label: prefix + name, description: "Node.js", spec: prefix + name })),
  ], { placeHolder: "Package to import", matchOnDescription: true });
  if (!picked?.spec) return;

  const style = config().get<string>("importStyle", "auto");
  const require = style === "require" || (style === "auto" && m.usesRequire(text, file));
  const name = m.importName(picked.spec), spec = picked.spec;
  const forms = require
    ? [{ label: `const ${name} = require("${spec}")`, snippet: `const \${1:${name}} = require("${spec}");` },
      { label: `const { … } = require("${spec}")`, snippet: `const { $1 } = require("${spec}");` }]
    : [{ label: `import ${name} from "${spec}"`, snippet: `import \${1:${name}} from "${spec}";` },
      { label: `import { … } from "${spec}"`, snippet: `import { $1 } from "${spec}";` },
      { label: `import * as ${name} from "${spec}"`, snippet: `import * as \${1:${name}} from "${spec}";` },
      { label: `import "${spec}"`, snippet: `import "${spec}";` }];
  const form = await vscode.window.showQuickPick(forms, { placeHolder: "How to import it" });
  if (!form) return;

  // In .vue, .svelte and .astro files the import goes inside the script.
  const script = m.scriptRanges(text, document.languageId)[0] ?? { start: 0, end: text.length };
  const scriptStart = document.positionAt(script.start);
  const line = scriptStart.line + (script.start ? 1 : 0) + m.importInsertLine(text.slice(script.start, script.end).replace(/^\r?\n/, ""));
  const at = new vscode.Position(Math.min(line, document.lineCount), 0);
  await editor.insertSnippet(new vscode.SnippetString(form.snippet + "\n"), at);
}

async function install() {
  const manifest = await pickManifest("Install into which package?");
  if (!manifest) return;
  const names = await vscode.window.showInputBox({ prompt: "Packages to install, separated by spaces", placeHolder: "zod @tanstack/react-query", validateInput: v => v.trim().split(/\s+/).every(n => m.packageNameOf(n.replace(/@[^@/]+$/, "")) || /^@?[\w./-]+@[\w.^~<>=*-]+$/.test(n)) ? null : "Enter npm package names, like zod or @scope/name" });
  if (!names?.trim()) return;
  const kind = await vscode.window.showQuickPick([{ label: "Dependency", dev: false }, { label: "Dev dependency", dev: true }], { placeHolder: "Add as" });
  if (!kind) return;
  const manifests = manifestsFor(manifest.path);
  run(path.dirname(manifest.path), m.installCommand(packageManagerFor(manifests), names.trim().split(/\s+/), kind.dev));
}

async function installAll() {
  const manifest = await pickManifest("Install the dependencies of which package?");
  if (manifest) run(path.dirname(manifest.path), m.installCommand(packageManagerFor(manifestsFor(manifest.path)), []));
}

/** The package.json to work on: the one given, the active file's, or one chosen from the workspace. */
async function pickManifest(placeHolder: string, given?: vscode.Uri): Promise<m.Manifest | undefined> {
  if (given?.fsPath.endsWith("package.json")) return manifestAt(given.fsPath) ?? undefined;
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.scheme === "file") {
    const nearest = editor.document.fileName.endsWith("package.json") ? manifestAt(editor.document.fileName) : manifestsFor(editor.document.uri.fsPath)[0];
    if (nearest) return nearest;
  }
  const files = await vscode.workspace.findFiles("**/package.json", "**/node_modules/**", 200);
  const manifests = files.map(f => manifestAt(f.fsPath)).filter((x): x is m.Manifest => !!x);
  if (manifests.length <= 1) return manifests[0] ?? (vscode.window.showInformationMessage("No package.json found in this workspace."), undefined);
  const picked = await vscode.window.showQuickPick(manifests.map(x => ({ label: x.name ?? path.basename(path.dirname(x.path)), description: vscode.workspace.asRelativePath(x.path), manifest: x })), { placeHolder });
  return picked?.manifest;
}

const SKIP = "**/{node_modules,dist,build,out,.next,.nuxt,.output,.svelte-kit,.turbo,.vercel,coverage,.git}/**";
async function findUnused(uri?: vscode.Uri) {
  const manifest = await pickManifest("Check which package?", uri);
  if (!manifest) return;
  const root = path.dirname(manifest.path);
  const used = new Set<string>();
  const scanned = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Checking ${manifest.name ?? "dependencies"}…` }, async () => {
    const pattern = new vscode.RelativePattern(root, "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte,astro}");
    const files = (await vscode.workspace.findFiles(pattern, SKIP, 10000))
      // Files of nested packages in a monorepo belong to their own package.json.
      .filter(f => manifestsFor(f.fsPath)[0]?.path === manifest.path);
    for (let i = 0; i < files.length; i += 50) {
      await Promise.all(files.slice(i, i + 50).map(async f => {
        try {
          const text = await fs.promises.readFile(f.fsPath, "utf8");
          const language = path.extname(f.fsPath).slice(1);
          for (const found of m.findImportsIn(text, ["vue", "svelte", "astro"].includes(language) ? language : "javascript")) {
            const pkg = m.packageNameOf(found.spec);
            if (pkg) used.add(pkg);
          }
        } catch { /* unreadable file */ }
      }));
    }
    // Packages a tsconfig.json pulls in by name count as used.
    try {
      const tsconfig = m.parseJsonc(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
      for (const type of tsconfig?.compilerOptions?.types ?? []) { used.add(String(type)); used.add(`@types/${type}`); }
      const extend = tsconfig?.extends;
      for (const e of Array.isArray(extend) ? extend : [extend]) { const pkg = typeof e === "string" && m.packageNameOf(e); if (pkg) used.add(pkg); }
    } catch { /* no tsconfig */ }
    return files.length;
  });

  const unused = m.unusedDependencies(manifest, used);
  const label = manifest.name ?? vscode.workspace.asRelativePath(manifest.path);
  if (!unused.length) { vscode.window.showInformationMessage(`No unused dependencies in ${label}. Checked ${scanned} files.`); return; }
  const picked = await vscode.window.showQuickPick(unused.map(u => ({ label: u.dep.name, description: `${u.dep.version} · ${m.KIND_LABEL[u.dep.kind]}`, detail: u.reason, picked: u.dep.kind !== "devDependencies", dep: u.dep })), {
    canPickMany: true, title: `${unused.length} possibly unused in ${label} (checked ${scanned} files)`, placeHolder: "Select the packages to uninstall",
  });
  if (!picked?.length) return;
  const names = picked.map(p => p.dep.name);
  const ok = await vscode.window.showWarningMessage(`Uninstall ${names.length} package${names.length === 1 ? "" : "s"} from ${label}?`, { modal: true, detail: names.join(", ") }, "Uninstall");
  if (ok === "Uninstall") run(root, m.uninstallCommand(packageManagerFor(manifestsFor(manifest.path)), names));
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const watchers = ["**/package.json", "**/{package-lock.json,pnpm-lock.yaml,yarn.lock,bun.lock,bun.lockb,tsconfig.json,jsconfig.json}", "**/node_modules/.package-lock.json", "**/node_modules/.modules.yaml"]
    .map(glob => vscode.workspace.createFileSystemWatcher(glob));
  for (const watcher of watchers) { watcher.onDidChange(recheckAll); watcher.onDidCreate(recheckAll); watcher.onDidDelete(recheckAll); }

  context.subscriptions.push(
    diagnostics, ...watchers,
    vscode.languages.registerCompletionItemProvider(SELECTOR, completions, "'", '"', "`", "/", "@", ":"),
    vscode.languages.registerHoverProvider(SELECTOR, hovers),
    vscode.languages.registerCodeActionsProvider(SELECTOR, fixes, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.commands.registerCommand("veyraNpm.addImport", addImport),
    vscode.commands.registerCommand("veyraNpm.install", install),
    vscode.commands.registerCommand("veyraNpm.installAll", installAll),
    vscode.commands.registerCommand("veyraNpm.findUnused", findUnused),
    vscode.commands.registerCommand("veyraNpm.run", run),
    vscode.workspace.onDidOpenTextDocument(document => checkSoon(document, 100)),
    vscode.workspace.onDidChangeTextDocument(event => checkSoon(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration("veyraNpm")) recheckAll(); }),
    vscode.workspace.onDidGrantWorkspaceTrust(recheckAll),
    vscode.window.onDidCloseTerminal(terminal => { if (terminal.name === "Veyra npm") recheckAll(); }),
  );
  for (const document of vscode.workspace.textDocuments) checkSoon(document, 100);
}

export function deactivate() {}
