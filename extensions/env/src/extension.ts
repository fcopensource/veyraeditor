import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import * as m from "./model";
import { ComparePanel } from "./compare";

/* Veyra Env: .env files that are checked, hidden on screen, kept out of git and in sync with .env.example. */

const config = () => vscode.workspace.getConfiguration("veyraEnv");
const ENV_GLOB = "**/{.env,.env.*,*.env}";
const EXCLUDE = "**/{node_modules,.git,dist,build,out,.next,.nuxt,.svelte-kit,venv,.venv,vendor,target,coverage}/**";

// ---------- Env files in the workspace ----------

export interface EnvFile {
  uri: vscode.Uri; name: string; dir: string; text: string; parsed: m.Parsed; template: boolean;
  /** true: git ignores it · false: git would commit it · undefined: not in a git repository, or not checked yet */
  ignored?: boolean;
  tracked?: boolean;
}

export class Index implements vscode.Disposable {
  readonly files = new Map<string, EnvFile>();
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;
  private subs: vscode.Disposable[] = [];
  private gitTimer?: NodeJS.Timeout;
  ready: Promise<void>;

  constructor() {
    this.ready = this.scan();
    const watcher = vscode.workspace.createFileSystemWatcher(ENV_GLOB);
    const gitignores = vscode.workspace.createFileSystemWatcher("**/.gitignore");
    this.subs.push(
      watcher, gitignores,
      watcher.onDidCreate(uri => this.load(uri)), watcher.onDidChange(uri => this.load(uri)),
      watcher.onDidDelete(uri => { this.files.delete(key(uri)); this.emitter.fire(); }),
      gitignores.onDidChange(() => this.checkGitSoon()), gitignores.onDidCreate(() => this.checkGitSoon()), gitignores.onDidDelete(() => this.checkGitSoon()),
      vscode.workspace.onDidChangeTextDocument(e => { if (this.has(e.document.uri)) this.update(e.document.uri, e.document.getText()); }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => { this.ready = this.scan(); }),
    );
  }
  has(uri: vscode.Uri) { return uri.scheme === "file" && m.isEnvFile(path.basename(uri.fsPath)) && !isExcluded(uri.fsPath); }

  async scan() {
    const uris = await vscode.workspace.findFiles(ENV_GLOB, EXCLUDE, 1000);
    this.files.clear();
    await Promise.all(uris.filter(u => this.has(u)).map(u => this.load(u, false)));
    this.emitter.fire();
    await this.checkGit();
  }
  private async load(uri: vscode.Uri, fire = true) {
    if (!this.has(uri)) return;
    const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
    let text: string;
    try { text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8"); } catch { return; }
    this.update(uri, text, fire);
    if (fire) this.checkGitSoon();
  }
  private update(uri: vscode.Uri, text: string, fire = true) {
    const before = this.files.get(key(uri));
    const name = path.basename(uri.fsPath);
    this.files.set(key(uri), { uri, name, dir: path.dirname(uri.fsPath), text, parsed: m.parseEnv(text), template: m.isTemplate(name), ignored: before?.ignored, tracked: before?.tracked });
    if (fire) this.emitter.fire();
  }
  get(uri: vscode.Uri) { return this.files.get(key(uri)); }
  list() { return [...this.files.values()].sort((a, b) => a.dir.localeCompare(b.dir) || rank(a) - rank(b) || a.name.localeCompare(b.name)); }

  /** The env files that apply to a code file: in its folder or a folder above it. Nearest first. */
  forCode(fsPath: string) {
    return this.list().filter(f => m.appliesTo(f.dir, fsPath)).sort((a, b) => b.dir.length - a.dir.length || rank(a) - rank(b));
  }
  /** Where a new variable should go: the nearest .env (not a template), or a new .env next to the nearest template or in the workspace folder. */
  targetFor(fsPath: string): vscode.Uri | undefined {
    const files = this.forCode(fsPath);
    const env = files.find(f => !f.template);
    if (env) return env.uri;
    const dir = files[0]?.dir ?? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath))?.uri.fsPath;
    return dir ? vscode.Uri.file(path.join(dir, ".env")) : undefined;
  }
  templateFor(file: EnvFile) {
    return this.list().find(f => f.template && f.dir === file.dir && /^\.env\./i.test(f.name)) ?? this.list().find(f => f.template && f.dir === file.dir);
  }

  private checkGitSoon() { clearTimeout(this.gitTimer); this.gitTimer = setTimeout(() => void this.checkGit(), 400); }
  /** Asks git whether each env file is ignored, and whether it is already committed. */
  async checkGit() {
    await Promise.all(this.list().map(async f => {
      const [ignored, tracked] = await Promise.all([gitIgnored(f.uri.fsPath), gitTracked(f.uri.fsPath)]);
      f.ignored = ignored; f.tracked = tracked;
    }));
    this.emitter.fire();
  }
  dispose() { this.subs.forEach(s => s.dispose()); this.emitter.dispose(); clearTimeout(this.gitTimer); }
}
const key = (uri: vscode.Uri) => uri.fsPath.toLowerCase();
const rank = (f: { name: string; template: boolean }) => (f.template ? 3 : f.name === ".env" ? 0 : /local/i.test(f.name) ? 1 : 2);
const isExcluded = (fsPath: string) => /[\\/](node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|venv|\.venv|vendor|target|coverage)[\\/]/.test(fsPath);

// ---------- git ----------

function git(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    execFile("git", args, { cwd, timeout: 10000, windowsHide: true }, (error, stdout) => {
      const code = error ? (typeof (error as any).code === "number" ? (error as any).code : -1) : 0;
      resolve({ code, out: String(stdout) });
    });
  });
}
/** true, false, or undefined when the file is not in a git repository (or git is missing and no .gitignore says so). */
async function gitIgnored(file: string): Promise<boolean | undefined> {
  const { code } = await git(["check-ignore", "-q", "--", path.basename(file)], path.dirname(file));
  if (code === 0) return true;
  if (code === 1) return false;
  if (code === 128) return undefined; // not a repository
  // git is not installed: read .gitignore files ourselves, from the file's folder up to the workspace folder.
  const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath;
  if (!root || !fs.existsSync(path.join(root, ".git"))) return undefined;
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    try { if (m.gitignoreIgnores(fs.readFileSync(path.join(dir, ".gitignore"), "utf8"), path.relative(dir, file))) return true; } catch { /* none here */ }
    if (dir === root || path.dirname(dir) === dir) break;
  }
  return false;
}
async function gitTracked(file: string): Promise<boolean | undefined> {
  const { code } = await git(["ls-files", "--error-unmatch", "--", path.basename(file)], path.dirname(file));
  return code === 0 ? true : code === 1 ? false : undefined;
}

// ---------- Problems ----------

class Problems implements vscode.CodeActionProvider, vscode.Disposable {
  readonly env = vscode.languages.createDiagnosticCollection("veyra-env");
  readonly code = vscode.languages.createDiagnosticCollection("veyra-env-code");
  private fixes = new Map<string, Map<string, m.Fix>>();
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(private index: Index) {}

  checkEnvFiles() {
    this.env.clear();
    for (const f of this.index.list()) {
      const fixes = new Map<string, m.Fix>();
      const diags = f.parsed.problems.map(p => {
        const d = new vscode.Diagnostic(new vscode.Range(p.line, p.start, p.line, Math.max(p.end, p.start + 1)), p.message, severity(p.severity));
        d.source = "Veyra Env"; d.code = p.code;
        if (p.fix) fixes.set(`${p.code}:${p.line}`, p.fix);
        return d;
      });
      const top = new vscode.Range(0, 0, 0, Math.max(1, f.text.split(/\r?\n/)[0]?.length ?? 1));
      const hasValues = f.parsed.entries.some(e => e.value);
      if (config().get<boolean>("gitignoreCheck", true) && !f.template && hasValues) {
        if (f.tracked) {
          const d = new vscode.Diagnostic(top, `${f.name} is already committed to git, so its secrets are in your history. Stop tracking it (the file stays on your disk), add it to .gitignore, and change any real secrets in it.`, vscode.DiagnosticSeverity.Error);
          d.source = "Veyra Env"; d.code = "committed"; diags.unshift(d);
        } else if (f.ignored === false) {
          const d = new vscode.Diagnostic(top, `${f.name} is not in .gitignore, so its values could be committed. Add it to .gitignore.`, vscode.DiagnosticSeverity.Warning);
          d.source = "Veyra Env"; d.code = "not-ignored"; diags.unshift(d);
        }
      }
      const template = f.template ? undefined : this.index.templateFor(f);
      if (template) {
        const { missingInEnv } = m.compareKeys(f.parsed.entries, template.parsed.entries);
        if (missingInEnv.length) {
          const d = new vscode.Diagnostic(top, `${template.name} lists ${missingInEnv.length === 1 ? "a variable" : `${missingInEnv.length} variables`} this file does not set: ${missingInEnv.join(", ")}.`, vscode.DiagnosticSeverity.Information);
          d.source = "Veyra Env"; d.code = "missing-from-template"; diags.push(d);
        }
      }
      if (f.template) {
        const siblings = this.index.list().filter(s => !s.template && s.dir === f.dir);
        const missing = [...new Set(siblings.flatMap(s => m.compareKeys(s.parsed.entries, f.parsed.entries).missingInExample))];
        if (missing.length) {
          const d = new vscode.Diagnostic(top, `Not listed here yet: ${missing.join(", ")}. Add ${missing.length === 1 ? "it" : "them"} so others know ${missing.length === 1 ? "it is" : "they are"} needed.`, vscode.DiagnosticSeverity.Information);
          d.source = "Veyra Env"; d.code = "template-missing"; diags.push(d);
        }
      }
      this.fixes.set(key(f.uri), fixes);
      this.env.set(f.uri, diags);
    }
  }

  checkCode(doc: vscode.TextDocument, delay = 300) {
    if (!m.CODE_LANGUAGES.includes(doc.languageId) || doc.uri.scheme !== "file") return;
    clearTimeout(this.timers.get(doc.uri.toString()));
    this.timers.set(doc.uri.toString(), setTimeout(() => {
      const level = config().get<string>("missingVariables", "warning");
      const files = this.index.forCode(doc.uri.fsPath);
      const envs = files.filter(f => !f.template);
      if (level === "off" || !envs.length) { this.code.delete(doc.uri); return; }
      const defined = new Set(envs.flatMap(f => f.parsed.entries.map(e => e.key)));
      const templates = files.filter(f => f.template);
      const ignore = config().get<string[]>("ignore", []);
      const diags: vscode.Diagnostic[] = [];
      for (let i = 0; i < doc.lineCount; i++) {
        for (const u of m.findUsages(doc.lineAt(i).text, doc.languageId)) {
          if (defined.has(u.name) || m.isBuiltIn(u.name, ignore)) continue;
          const nearest = envs[0];
          const inTemplate = templates.find(t => t.parsed.entries.some(e => e.key === u.name));
          const message = inTemplate ? `${u.name} is listed in ${inTemplate.name} but not set in ${nearest.name}.` : `${u.name} is not set in ${nearest.name}${envs.length > 1 ? " or the other .env files" : ""}.`;
          const d = new vscode.Diagnostic(new vscode.Range(i, u.start, i, u.end), message, level === "information" ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning);
          d.source = "Veyra Env"; d.code = "missing-variable";
          diags.push(d);
        }
      }
      this.code.set(doc.uri, diags);
    }, delay));
  }
  checkAllCode() { vscode.workspace.textDocuments.forEach(d => this.checkCode(d, 0)); }

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const d of context.diagnostics) {
      if (d.source !== "Veyra Env") continue;
      const name = doc.getText(d.range);
      switch (d.code) {
        case "missing-variable": {
          const target = this.index.targetFor(doc.uri.fsPath);
          if (!target) break;
          const a = new vscode.CodeAction(`Add ${name} to ${path.basename(target.fsPath)}`, vscode.CodeActionKind.QuickFix);
          a.command = { command: "veyraEnv.addVariable", title: a.title, arguments: [target, name] };
          a.diagnostics = [d]; a.isPreferred = true;
          actions.push(a);
          const ignore = new vscode.CodeAction(`Never report ${name} (it is set somewhere else)`, vscode.CodeActionKind.QuickFix);
          ignore.command = { command: "veyraEnv.ignoreVariable", title: ignore.title, arguments: [name] };
          ignore.diagnostics = [d];
          actions.push(ignore);
          break;
        }
        case "not-ignored": case "committed": {
          const f = this.index.get(doc.uri);
          if (!f) break;
          if (d.code === "committed") {
            const a = new vscode.CodeAction(`Stop tracking ${f.name} in git and ignore it`, vscode.CodeActionKind.QuickFix);
            a.command = { command: "veyraEnv.untrack", title: a.title, arguments: [f.uri] };
            a.diagnostics = [d]; a.isPreferred = true; actions.push(a);
          } else {
            const a = new vscode.CodeAction(`Add ${f.name} to .gitignore`, vscode.CodeActionKind.QuickFix);
            a.command = { command: "veyraEnv.addToGitignore", title: a.title, arguments: [f.uri] };
            a.diagnostics = [d]; a.isPreferred = true; actions.push(a);
          }
          break;
        }
        case "missing-from-template": {
          const f = this.index.get(doc.uri);
          const template = f && this.index.templateFor(f);
          if (!f || !template) break;
          const keys = m.compareKeys(f.parsed.entries, template.parsed.entries).missingInEnv;
          const a = new vscode.CodeAction(`Add ${keys.join(", ")} (empty)`, vscode.CodeActionKind.QuickFix);
          a.edit = new vscode.WorkspaceEdit();
          a.edit.replace(doc.uri, fullRange(doc), keys.reduce((text, k) => m.appendEntry(text, k), doc.getText()));
          a.diagnostics = [d]; actions.push(a);
          break;
        }
        case "template-missing": {
          const a = new vscode.CodeAction("Add the missing names (without values)", vscode.CodeActionKind.QuickFix);
          a.command = { command: "veyraEnv.syncExample", title: a.title, arguments: [doc.uri] };
          a.diagnostics = [d]; actions.push(a);
          break;
        }
        default: {
          const fix = this.fixes.get(key(doc.uri))?.get(`${d.code}:${d.range.start.line}`);
          if (!fix) break;
          const a = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
          a.edit = new vscode.WorkspaceEdit();
          a.edit.replace(doc.uri, doc.lineAt(d.range.start.line).range, fix.text);
          a.diagnostics = [d]; a.isPreferred = true; actions.push(a);
        }
      }
    }
    return actions;
  }
  dispose() { this.env.dispose(); this.code.dispose(); this.timers.forEach(clearTimeout); }
}
const severity = (s: m.Severity) => (s === "error" ? vscode.DiagnosticSeverity.Error : s === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
const fullRange = (doc: vscode.TextDocument) => new vscode.Range(0, 0, doc.lineCount, 0);

// ---------- Code: completion, hover, go to definition ----------

function showValue(e: m.Entry): string {
  const mode = config().get<string>("hideValues", "secrets");
  if (!e.value) return "(empty)";
  return mode === "all" || (mode === "secrets" && m.isSecret(e.key, e.value)) ? m.mask(e.value) : e.value.length > 80 ? e.value.slice(0, 80) + "…" : e.value;
}

class CodeFeatures implements vscode.CompletionItemProvider, vscode.HoverProvider, vscode.DefinitionProvider {
  constructor(private index: Index) {}
  provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position): vscode.CompletionItem[] | undefined {
    const ctx = m.completionContext(doc.lineAt(pos.line).text.slice(0, pos.character), doc.languageId);
    if (!ctx) return undefined;
    const seen = new Map<string, { entry: m.Entry; file: EnvFile }[]>();
    for (const file of this.index.forCode(doc.uri.fsPath)) for (const entry of file.parsed.entries) seen.set(entry.key, [...(seen.get(entry.key) ?? []), { entry, file }]);
    const range = new vscode.Range(pos.line, pos.character - ctx.prefix.length, pos.line, pos.character);
    return [...seen.entries()].map(([name, where]) => {
      const item = new vscode.CompletionItem({ label: name, description: where.map(w => w.file.name).join(", ") }, vscode.CompletionItemKind.Variable);
      item.range = range;
      item.detail = showValue(where[0].entry);
      item.documentation = new vscode.MarkdownString(where.map(w => `\`${w.file.name}\`: ${w.entry.value ? `\`${showValue(w.entry).replace(/`/g, "'")}\`` : "*empty*"}`).join("  \n"));
      item.sortText = (where.some(w => !w.file.template) ? "0" : "1") + name;
      return item;
    });
  }
  private usageAt(doc: vscode.TextDocument, pos: vscode.Position) {
    return m.findUsages(doc.lineAt(pos.line).text, doc.languageId).find(u => pos.character >= u.start && pos.character <= u.end);
  }
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const u = this.usageAt(doc, pos);
    if (!u) return undefined;
    const files = this.index.forCode(doc.uri.fsPath);
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: ["veyraEnv.reveal", "veyraEnv.copyValue", "veyraEnv.addVariable"] };
    md.appendMarkdown(`**${u.name}**${m.isBuiltIn(u.name) ? " · set by your system or platform" : ""}\n\n`);
    const rows = files.flatMap(f => f.parsed.entries.filter(e => e.key === u.name).map(e => ({ f, e })));
    if (rows.length) {
      for (const { f, e } of rows) {
        const reveal = `command:veyraEnv.reveal?${encodeURIComponent(JSON.stringify([f.uri.toString(), e.line]))}`;
        const copy = `command:veyraEnv.copyValue?${encodeURIComponent(JSON.stringify([f.uri.toString(), e.key]))}`;
        md.appendMarkdown(`[\`${f.name}\`](${reveal}) \`${showValue(e).replace(/`/g, "'")}\`${e.value ? ` · [Copy](${copy})` : ""}  \n`);
      }
    } else if (!m.isBuiltIn(u.name)) {
      const target = this.index.targetFor(doc.uri.fsPath);
      md.appendMarkdown(`Not set in any .env file.${target ? ` [Add it to ${path.basename(target.fsPath)}](command:veyraEnv.addVariable?${encodeURIComponent(JSON.stringify([target.toString(), u.name]))})` : ""}`);
    }
    return new vscode.Hover(md, new vscode.Range(pos.line, u.start, pos.line, u.end));
  }
  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.Location[] | undefined {
    const u = this.usageAt(doc, pos);
    if (!u) return undefined;
    return this.index.forCode(doc.uri.fsPath).flatMap(f => f.parsed.entries.filter(e => e.key === u.name).map(e => new vscode.Location(f.uri, new vscode.Range(e.line, e.keyStart, e.line, e.keyEnd))));
  }
}

// ---------- Hiding values on screen ----------

class Hider implements vscode.Disposable {
  /** Shown for this session after "Show values"; the setting decides what is hidden otherwise. */
  revealAll = false;
  private hidden = vscode.window.createTextEditorDecorationType({ opacity: "0", letterSpacing: "-0.6em" });
  private dots = vscode.window.createTextEditorDecorationType({});
  private timer?: NodeJS.Timeout;
  constructor(private index: Index) {}
  mode() { return this.revealAll ? "off" : config().get<string>("hideValues", "secrets"); }
  /** What each env editor is hiding right now (for the tests and the status bar). */
  readonly state = new Map<string, number>();
  refresh(editors = vscode.window.visibleTextEditors) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => editors.forEach(e => this.apply(e)), 15);
  }
  apply(editor: vscode.TextEditor) {
    const file = this.index.has(editor.document.uri) ? m.parseEnv(editor.document.getText()) : undefined;
    if (!file) return;
    const mode = this.mode();
    const cursorLines = new Set(editor.selections.flatMap(s => range(s.start.line, s.end.line)));
    const hide: vscode.DecorationOptions[] = [], dots: vscode.DecorationOptions[] = [];
    const lines = editor.document.getText().split(/\r?\n/);
    for (const e of file.entries) {
      if (!e.value || mode === "off" || (mode === "secrets" && !m.isSecret(e.key, e.value))) continue;
      if (range(e.line, e.endLine).some(l => cursorLines.has(l))) continue; // the line being edited stays visible
      const first = new vscode.Range(e.line, e.valueStart, e.line, e.endLine === e.line ? e.valueEnd : lines[e.line].length);
      hide.push({ range: first });
      dots.push({ range: new vscode.Range(e.line, e.valueStart, e.line, e.valueStart), renderOptions: { before: { contentText: m.mask(e.value), color: new vscode.ThemeColor("descriptionForeground") } }, hoverMessage: "Hidden by Veyra Env. Put the cursor on this line to see it." });
      for (let l = e.line + 1; l <= e.endLine; l++) hide.push({ range: new vscode.Range(l, 0, l, lines[l].length) });
    }
    editor.setDecorations(this.hidden, hide);
    editor.setDecorations(this.dots, dots);
    this.state.set(editor.document.uri.toString(), dots.length);
  }
  dispose() { this.hidden.dispose(); this.dots.dispose(); clearTimeout(this.timer); }
}
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------- Sidebar ----------

type Node = { kind: "file"; file: EnvFile } | { kind: "variable"; file: EnvFile; entry: m.Entry };
class Tree implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private index: Index) { index.onDidChange(() => this.emitter.fire()); }
  refresh() { this.emitter.fire(); }
  getChildren(node?: Node): Node[] {
    if (!node) return this.index.list().map(file => ({ kind: "file", file }));
    if (node.kind === "file") return node.file.parsed.entries.map(entry => ({ kind: "variable", file: node.file, entry }));
    return [];
  }
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "file") {
      const f = node.file;
      const rel = vscode.workspace.asRelativePath(f.uri);
      const item = new vscode.TreeItem(f.name, vscode.TreeItemCollapsibleState.Collapsed);
      const exposed = !f.template && f.parsed.entries.some(e => e.value) && (f.tracked || f.ignored === false);
      const errors = f.parsed.problems.filter(p => p.severity === "error").length;
      item.description = [rel.includes("/") ? path.dirname(rel) : "", `${f.parsed.entries.length} variable${f.parsed.entries.length === 1 ? "" : "s"}`, f.template ? "template" : "", f.tracked ? "committed to git!" : exposed ? "not in .gitignore" : ""].filter(Boolean).join(" · ");
      item.iconPath = exposed ? new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground")) : errors ? new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground")) : new vscode.ThemeIcon(f.template ? "file-text" : "lock");
      item.resourceUri = f.uri;
      item.contextValue = exposed ? "file-exposed" : "file";
      item.tooltip = new vscode.MarkdownString(`**${rel}**\n\n${f.template ? "A template, meant to be committed. It lists the names, not the values." : f.tracked ? "⚠ Committed to git: its values are in your history." : f.ignored === false ? "⚠ Not in .gitignore: its values could be committed." : f.ignored ? "Ignored by git ✓" : "Not in a git repository."}`);
      item.command = { command: "vscode.open", title: "Open", arguments: [f.uri] };
      item.id = `file:${f.uri.toString()}`;
      return item;
    }
    const { entry: e, file } = node;
    const item = new vscode.TreeItem(e.key, vscode.TreeItemCollapsibleState.None);
    item.description = e.value ? showValue(e) : file.template ? "" : "empty";
    item.iconPath = new vscode.ThemeIcon(m.isSecret(e.key, e.value) ? "key" : "symbol-variable");
    item.contextValue = "variable";
    item.command = { command: "veyraEnv.reveal", title: "Show", arguments: [file.uri.toString(), e.line] };
    item.id = `var:${file.uri.toString()}:${e.line}`;
    return item;
  }
}

// ---------- Code lenses on env files ----------

class Lenses implements vscode.CodeLensProvider {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  constructor(private index: Index) { index.onDidChange(() => this.emitter.fire()); }
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const f = this.index.get(doc.uri);
    if (!f) return [];
    const top = new vscode.Range(0, 0, 0, 0);
    const lenses: vscode.CodeLens[] = [];
    if (f.template) {
      const env = path.join(f.dir, ".env");
      if (!fs.existsSync(env)) lenses.push(new vscode.CodeLens(top, { title: "Create .env from this file", command: "veyraEnv.createEnv", arguments: [f.uri] }));
    }
    if (this.index.list().length > 1) lenses.push(new vscode.CodeLens(top, { title: "Compare with other env files", command: "veyraEnv.compare" }));
    lenses.push(new vscode.CodeLens(top, { title: this.hiddenTitle(), command: "veyraEnv.toggleHide" }));
    return lenses;
  }
  hiddenTitle = () => "Show or hide values";
  fire() { this.emitter.fire(); }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const index = new Index();
  const problems = new Problems(index);
  const code = new CodeFeatures(index);
  const hider = new Hider(index);
  const tree = new Tree(index);
  const lenses = new Lenses(index);
  lenses.hiddenTitle = () => (hider.mode() === "off" ? "Values shown · Hide" : `Values hidden (${hider.mode() === "all" ? "all" : "secrets"}) · Show`);
  const view = vscode.window.createTreeView("veyraEnv.files", { treeDataProvider: tree, showCollapseAll: true });

  const status = vscode.window.createStatusBarItem("veyraEnv.status", vscode.StatusBarAlignment.Right, 100);
  status.name = "Veyra Env";
  status.command = "veyraEnv.toggleHide";
  const updateStatus = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !index.has(editor.document.uri)) { status.hide(); return; }
    const off = hider.mode() === "off";
    status.text = off ? "$(eye) Values shown" : "$(eye-closed) Values hidden";
    status.tooltip = off ? "Click to hide values in .env files" : "Values are hidden until you put the cursor on their line. Click to show them.";
    status.show();
  };

  index.onDidChange(() => { problems.checkEnvFiles(); problems.checkAllCode(); hider.refresh(); });
  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...args: any[]) => {
    try { return await fn(...args); } catch (error) { vscode.window.showErrorMessage(`Veyra Env: ${(error as Error).message ?? error}`); return undefined; }
  }));
  const asUri = (u: unknown) => (u instanceof vscode.Uri ? u : typeof u === "string" ? vscode.Uri.parse(u) : undefined);
  const fileOf = (arg: unknown): EnvFile | undefined => {
    const node = arg as Node | undefined;
    if (node && typeof node === "object" && "kind" in node) return node.file;
    const uri = asUri(arg) ?? vscode.window.activeTextEditor?.document.uri;
    return uri ? index.get(uri) : undefined;
  };
  const entryOf = (args: unknown[]): { file: EnvFile; entry: m.Entry } | undefined => {
    const node = args[0] as Node | undefined;
    if (node && typeof node === "object" && "kind" in node && node.kind === "variable") return { file: node.file, entry: node.entry };
    const uri = asUri(args[0]);
    const file = uri && index.get(uri);
    const entry = file?.parsed.entries.find(e => e.key === args[1]);
    return file && entry ? { file, entry } : undefined;
  };
  /** Changes a file through VS Code, so an open editor updates and Undo works. */
  const editFile = async (uri: vscode.Uri, change: (text: string) => string) => {
    const doc = await vscode.workspace.openTextDocument(uri).then(d => d, () => undefined);
    if (doc) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, fullRange(doc), change(doc.getText()));
      await vscode.workspace.applyEdit(edit);
      await doc.save();
      return doc;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(change(""), "utf8"));
    return vscode.workspace.openTextDocument(uri);
  };

  register("veyraEnv.refresh", () => index.scan());
  register("veyraEnv.toggleHide", () => {
    if (config().get<string>("hideValues", "secrets") === "off" && !hider.revealAll) {
      void config().update("hideValues", "secrets", vscode.ConfigurationTarget.Global);
    } else hider.revealAll = !hider.revealAll;
    hider.refresh(); tree.refresh(); lenses.fire(); updateStatus();
  });
  register("veyraEnv.reveal", async (uriArg: unknown, line: number) => {
    const uri = asUri(uriArg);
    if (!uri) return;
    const editor = await vscode.window.showTextDocument(uri, { preview: false });
    const pos = new vscode.Position(line ?? 0, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  });
  register("veyraEnv.copyValue", async (...args: unknown[]) => {
    const found = entryOf(args);
    if (!found) return;
    await vscode.env.clipboard.writeText(found.entry.value);
    vscode.window.setStatusBarMessage(`Copied the value of ${found.entry.key}`, 2500);
  });
  register("veyraEnv.copyKey", async (...args: unknown[]) => {
    const found = entryOf(args);
    if (found) { await vscode.env.clipboard.writeText(found.entry.key); vscode.window.setStatusBarMessage(`Copied ${found.entry.key}`, 2500); }
  });
  register("veyraEnv.copyLine", async (...args: unknown[]) => {
    const found = entryOf(args);
    if (found) { await vscode.env.clipboard.writeText(m.formatLine(found.entry.key, found.entry.value)); vscode.window.setStatusBarMessage(`Copied ${found.entry.key}=…`, 2500); }
  });
  register("veyraEnv.addVariable", async (uriArg: unknown, name: string) => {
    const uri = asUri(uriArg);
    if (!uri || !name) return;
    const doc = await editFile(uri, text => (m.parseEnv(text).entries.some(e => e.key === name) ? text : m.appendEntry(text, name)));
    const entry = m.parseEnv(doc.getText()).entries.find(e => e.key === name);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    if (entry) { const pos = new vscode.Position(entry.line, doc.lineAt(entry.line).text.length); editor.selection = new vscode.Selection(pos, pos); editor.revealRange(new vscode.Range(pos, pos)); }
    await index.scan();
  });
  register("veyraEnv.ignoreVariable", async (name: string) => {
    const list = config().get<string[]>("ignore", []);
    if (!list.includes(name)) await config().update("ignore", [...list, name], vscode.ConfigurationTarget.Workspace);
    problems.checkAllCode();
  });
  register("veyraEnv.addToGitignore", async (arg?: unknown) => {
    const f = fileOf(arg);
    if (!f) return;
    const root = vscode.workspace.getWorkspaceFolder(f.uri)?.uri.fsPath ?? f.dir;
    const gitRoot = (await git(["rev-parse", "--show-toplevel"], f.dir)).out.trim() || root;
    const gitignore = vscode.Uri.file(path.join(gitRoot, ".gitignore"));
    const rel = path.relative(gitRoot, f.uri.fsPath).replace(/\\/g, "/");
    // ".env" in the root ignores every .env in the repository; other names are written as they are.
    const pattern = f.name === ".env" || /^\.env\.[\w-]*local$/.test(f.name) ? f.name : rel;
    await editFile(gitignore, text => {
      if (text.split(/\r?\n/).some(l => l.trim() === pattern)) return text;
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const base = text.replace(/[\r\n]*$/, "");
      const header = /^#.*env/im.test(text) ? "" : `${base ? eol : ""}# Env files with secrets (Veyra Env)${eol}`;
      return (base ? base + eol : "") + header + pattern + eol;
    });
    vscode.window.showInformationMessage(`Added ${pattern} to .gitignore.`);
    await index.checkGit();
  });
  register("veyraEnv.untrack", async (arg?: unknown) => {
    const f = fileOf(arg);
    if (!f) return;
    const ok = await vscode.window.showWarningMessage(`Stop tracking ${f.name} in git?`, { modal: true, detail: `It is removed from git (git rm --cached) and added to .gitignore. The file stays on your disk. It is still in your git history, so change any real passwords or keys in it.` }, "Stop Tracking");
    if (ok !== "Stop Tracking") return;
    const result = await git(["rm", "--cached", "--quiet", "--", f.name], f.dir);
    if (result.code !== 0) { vscode.window.showErrorMessage(`git could not stop tracking ${f.name}.`); return; }
    await vscode.commands.executeCommand("veyraEnv.addToGitignore", f.uri);
  });
  register("veyraEnv.syncExample", async (arg?: unknown) => {
    let f = fileOf(arg);
    if (!f) {
      const envs = index.list().filter(x => !x.template);
      if (!envs.length) { vscode.window.showInformationMessage("There is no .env file to take names from."); return; }
      f = envs.length === 1 ? envs[0] : (await vscode.window.showQuickPick(envs.map(x => ({ label: vscode.workspace.asRelativePath(x.uri), file: x })), { placeHolder: "Update the example from which file?" }))?.file;
      if (!f) return;
    }
    const sources = f.template ? index.list().filter(x => !x.template && x.dir === f!.dir) : [f];
    const template = f.template ? f : index.templateFor(f);
    const target = template?.uri ?? vscode.Uri.file(path.join(f.dir, ".env.example"));
    const existing = template?.parsed.entries ?? [];
    const missing = [...new Set(sources.flatMap(s => m.compareKeys(s.parsed.entries, existing).missingInExample))];
    if (!missing.length) { vscode.window.showInformationMessage(`${path.basename(target.fsPath)} already lists every variable.`); return; }
    const source = sources.find(s => missing.some(k => s.parsed.entries.some(e => e.key === k)))?.text;
    const doc = await editFile(target, text => m.addToExample(text, missing, source));
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.showInformationMessage(`Added ${missing.length} name${missing.length === 1 ? "" : "s"} to ${path.basename(target.fsPath)}, without values: ${missing.join(", ")}.`);
    await index.scan();
  });
  register("veyraEnv.createEnv", async (arg?: unknown) => {
    const from = fileOf(arg) ?? index.list().find(x => x.template);
    const folder = from?.dir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) { vscode.window.showInformationMessage("Open a folder first."); return; }
    const target = vscode.Uri.file(path.join(folder, ".env"));
    if (fs.existsSync(target.fsPath)) { await vscode.window.showTextDocument(target); return; }
    const text = from?.template ? from.text : "# Values for this computer. Keep this file out of git.\n";
    await vscode.workspace.fs.writeFile(target, Buffer.from(text, "utf8"));
    await vscode.window.showTextDocument(target, { preview: false });
    await index.scan();
    const f = index.get(target);
    if (f && f.ignored === false) {
      const pick = await vscode.window.showWarningMessage(".env is not in .gitignore yet.", "Add to .gitignore");
      if (pick) await vscode.commands.executeCommand("veyraEnv.addToGitignore", target);
    }
  });
  register("veyraEnv.compare", () => ComparePanel.show(context, index, {
    mask: (e: m.Entry) => showValue(e),
    secret: (e: m.Entry) => m.isSecret(e.key, e.value),
    add: async (uri: vscode.Uri, name: string, value: string) => { await editFile(uri, text => m.appendEntry(text, name, value)); await index.scan(); },
    open: (uri: vscode.Uri, line: number) => vscode.commands.executeCommand("veyraEnv.reveal", uri.toString(), line),
  }));

  const envSelector: vscode.DocumentSelector = [{ language: "dotenv" }, { pattern: ENV_GLOB }];
  const codeSelector = m.CODE_LANGUAGES.map(language => ({ language, scheme: "file" }));
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider([...codeSelector, ...(envSelector as vscode.DocumentFilter[])], problems, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    vscode.languages.registerCompletionItemProvider(codeSelector, code, ".", '"', "'", "`"),
    vscode.languages.registerHoverProvider(codeSelector, code),
    vscode.languages.registerDefinitionProvider(codeSelector, code),
    vscode.languages.registerCodeLensProvider(envSelector, lenses),
    vscode.workspace.onDidOpenTextDocument(doc => problems.checkCode(doc, 0)),
    vscode.workspace.onDidChangeTextDocument(e => { problems.checkCode(e.document); if (index.has(e.document.uri)) hider.refresh(vscode.window.visibleTextEditors.filter(x => x.document === e.document)); }),
    vscode.workspace.onDidCloseTextDocument(doc => problems.code.delete(doc.uri)),
    vscode.window.onDidChangeVisibleTextEditors(editors => hider.refresh(editors)),
    vscode.window.onDidChangeTextEditorSelection(e => { if (index.has(e.textEditor.document.uri)) hider.apply(e.textEditor); }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("veyraEnv")) return;
      problems.checkEnvFiles(); problems.checkAllCode(); hider.refresh(); tree.refresh(); lenses.fire(); updateStatus();
    }),
    index, problems, hider, view, status,
  );
  void index.ready.then(() => { problems.checkEnvFiles(); problems.checkAllCode(); hider.refresh(); updateStatus(); });
  return { index, hider, problems, ready: () => index.ready }; // for the integration tests
}

export function deactivate() {}
