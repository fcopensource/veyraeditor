import * as vscode from "vscode";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CONFIG_FILE, globMatcher, grade, languageCounts, parseConfig, removeHiddenCharacters, ruleList, scan, SEVERITIES, severityRank, type CustomRule, type Finding, type GuardConfig, type Severity } from "./scanner";
import { buildReport } from "./report";
import { VERSION } from "./version";

const SOURCE = "Veyra Code Guard";
const EXCLUDE = "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/bundle/**,**/.next/**,**/coverage/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/target/**}";
// The same folders, for paths reported by the file watcher.
const EXCLUDED = /(^|\/)(node_modules|\.git|dist|out|build|bundle|\.next|coverage|\.venv|venv|__pycache__|target)\//;
const HOOK_MARK = "# veyra-code-guard";
const LEVEL: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error, high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning, low: vscode.DiagnosticSeverity.Information,
};
const COLOR: Record<Severity, string> = { critical: "charts.red", high: "charts.orange", medium: "charts.yellow", low: "charts.blue" };
const GRADE_COLOR: Record<string, string> = { A: "charts.green", B: "charts.green", C: "charts.yellow", D: "charts.orange", F: "charts.red" };

// How a line comment starts in each language, for "mark as reviewed" (no entry: the language has no line comments).
const COMMENT: Record<string, [string, string?]> = {
  python: ["#"], shellscript: ["#"], yaml: ["#"], dockerfile: ["#"], makefile: ["#"], ruby: ["#"], perl: ["#"], perl6: ["#"], r: ["#"], powershell: ["#"], toml: ["#"], ini: [";"], properties: ["#"],
  elixir: ["#"], nim: ["#"], julia: ["#"], coffeescript: ["#"], tcl: ["#"], crystal: ["#"], gdscript: ["#"], cmake: ["#"], terraform: ["#"], hcl: ["#"], nix: ["#"], graphql: ["#"], dotenv: ["#"], ignore: ["#"],
  sql: ["--"], lua: ["--"], haskell: ["--"], ada: ["--"], elm: ["--"], purescript: ["--"], vhdl: ["--"], bat: ["REM"], vb: ["'"], vbscript: ["'"],
  erlang: ["%"], matlab: ["%"], latex: ["%"], tex: ["%"], prolog: ["%"], clojure: [";"], lisp: [";"], scheme: [";"], racket: [";"], asm: [";"], nasm: [";"], fortran: ["!"], "fortran-modern": ["!"],
  html: ["<!--", "-->"], xml: ["<!--", "-->"], xsl: ["<!--", "-->"], markdown: ["<!--", "-->"], vue: ["<!--", "-->"], svelte: ["<!--", "-->"], astro: ["<!--", "-->"],
  razor: ["@*", "*@"], handlebars: ["{{!--", "--}}"], jinja: ["{#", "#}"], twig: ["{#", "#}"],
  css: ["/*", "*/"], scss: ["//"], less: ["//"], ocaml: ["(*", "*)"],
};
const commentFor = (languageId: string): [string, string?] | undefined => languageId === "json" ? undefined : COMMENT[languageId] ?? ["//"];

/** The project's .veyra-guard.json, shared with the command line, the git hook and the GitHub Action. */
let project: { config: GuardConfig; error?: string } = { config: {} };

function settings() {
  const c = vscode.workspace.getConfiguration("veyraGuard"), p = project.config;
  const ignorePaths = [...c.get<string[]>("ignorePaths", []), ...(p.ignorePaths ?? [])];
  return {
    enabled: c.get<boolean>("enabled", true),
    // The stricter of the editor setting and the project file wins.
    minSeverity: [c.get<Severity>("minSeverity", "low"), p.minSeverity ?? "low"].reduce((a, b) => severityRank(a) >= severityRank(b) ? a : b),
    disabled: [...c.get<string[]>("disabledRules", []), ...(p.disabledRules ?? [])],
    customRules: [...c.get<CustomRule[]>("customRules", []), ...(p.customRules ?? [])],
    ignored: ignorePaths.length ? globMatcher(ignorePaths) : () => false,
    scanWhileTyping: c.get<boolean>("scanWhileTyping", true),
    watchFiles: c.get<boolean>("watchFiles", true),
  };
}
const scanOptions = (s: ReturnType<typeof settings>) => ({ minSeverity: s.minSeverity, disabled: s.disabled, customRules: s.customRules });

interface FileEntry { uri: vscode.Uri; path: string; findings: Finding[]; text: string }
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- The Code Guard panel ----------

type Node = { kind: "grade" } | { kind: "severity"; severity: Severity } | { kind: "finding"; entry: FileEntry; finding: Finding };

class FindingsTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  /** Files checked per language in the last workspace scan. */
  languages: Array<[string, number]> = [];
  constructor(private readonly results: Map<string, FileEntry>) {}
  refresh() { this.changed.fire(); }
  private all() { return [...this.results.values()].flatMap(e => e.findings.map(finding => ({ entry: e, finding }))); }

  getChildren(node?: Node): Node[] {
    const all = this.all();
    if (!node) return all.length ? [{ kind: "grade" }, ...SEVERITIES.filter(s => all.some(x => x.finding.severity === s)).map(severity => ({ kind: "severity" as const, severity }))] : [];
    if (node.kind === "severity") return all.filter(x => x.finding.severity === node.severity)
      .sort((a, b) => a.entry.path.localeCompare(b.entry.path) || a.finding.line - b.finding.line)
      .map(x => ({ kind: "finding" as const, ...x }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "grade") {
      const g = grade(this.all().map(x => x.finding));
      const item = new vscode.TreeItem(`Grade ${g.letter} · ${g.score}/100`);
      item.description = g.verdict;
      item.iconPath = new vscode.ThemeIcon("shield", new vscode.ThemeColor(GRADE_COLOR[g.letter]));
      const langs = this.languages.length ? `\nLanguages checked: ${this.languages.slice(0, 8).map(([l, n]) => `${l} (${n})`).join(", ")}${this.languages.length > 8 ? `, and ${this.languages.length - 8} more` : ""}.` : "";
      item.tooltip = `${g.verdict}\n${g.counts.critical} critical, ${g.counts.high} high, ${g.counts.medium} medium, ${g.counts.low} low.${langs}\nClick to create a PDF report.`;
      item.command = { command: "veyraGuard.createReport", title: "Create Security Report" };
      return item;
    }
    if (node.kind === "severity") {
      const n = this.all().filter(x => x.finding.severity === node.severity).length;
      const item = new vscode.TreeItem(node.severity[0].toUpperCase() + node.severity.slice(1), vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${n}`;
      item.iconPath = new vscode.ThemeIcon(node.severity === "low" ? "info" : node.severity === "medium" ? "warning" : "error", new vscode.ThemeColor(COLOR[node.severity]));
      return item;
    }
    const { entry, finding: f } = node;
    const item = new vscode.TreeItem(f.title);
    item.description = `${entry.path}:${f.line}`;
    item.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor(COLOR[f.severity]));
    item.tooltip = new vscode.MarkdownString(`**${f.title}** · ${f.severity}\n\n${f.message}\n\n${f.why}\n\n**How to fix:** ${f.fix}`);
    item.command = { command: "vscode.open", title: "Open", arguments: [entry.uri, { selection: new vscode.Range(f.line - 1, f.column - 1, f.line - 1, f.endColumn - 1) }] };
    item.contextValue = "finding";
    return item;
  }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection("veyra-code-guard");
  const results = new Map<string, FileEntry>();
  const tree = new FindingsTree(results);
  const view = vscode.window.createTreeView("veyraGuard.findings", { treeDataProvider: tree, showCollapseAll: true });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "veyraGuard.findings.focus";
  const timers = new Map<string, NodeJS.Timeout>();
  context.subscriptions.push(diagnostics, status, view);

  const relPath = (uri: vscode.Uri) => vscode.workspace.asRelativePath(uri, false);
  const forget = (uri: vscode.Uri) => { diagnostics.delete(uri); results.delete(uri.toString()); };
  const record = (uri: vscode.Uri, text: string, findings: Finding[]) => {
    diagnostics.set(uri, findings.map(f => {
      const d = new vscode.Diagnostic(new vscode.Range(f.line - 1, f.column - 1, f.line - 1, f.endColumn - 1), `${f.severity.toUpperCase()}: ${f.title}\n${f.message}\n\nWhy it matters: ${f.why}\nHow to fix: ${f.fix}`, LEVEL[f.severity]);
      d.source = SOURCE; d.code = f.rule;
      return d;
    }));
    if (findings.length) results.set(uri.toString(), { uri, path: relPath(uri), findings, text }); else results.delete(uri.toString());
  };
  const refresh = () => {
    tree.refresh();
    const all = [...results.values()].flatMap(e => e.findings), g = grade(all);
    const doc = vscode.window.activeTextEditor?.document;
    const mine = doc ? results.get(doc.uri.toString())?.findings ?? [] : [];
    view.badge = all.length ? { value: all.length, tooltip: `${plural(all.length, "suspicious line")}` } : undefined;
    status.text = mine.length ? `$(shield) ${mine.length} suspicious` : all.length ? `$(shield) Grade ${g.letter}` : "$(shield) Code Guard";
    status.tooltip = `Veyra Code Guard · Grade ${g.letter} (${g.score}/100)\n${g.verdict}${mine.length ? `\n${plural(mine.length, "suspicious line")} in this file.` : ""}${project.error ? `\n⚠ ${project.error}` : ""}\nClick to open the Code Guard panel.`;
    const worst = mine.reduce<Severity | undefined>((w, f) => (!w || severityRank(f.severity) > severityRank(w) ? f.severity : w), undefined);
    status.backgroundColor = worst === "critical" || worst === "high" ? new vscode.ThemeColor("statusBarItem.errorBackground") : worst ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    status.show();
  };
  const check = (doc: vscode.TextDocument) => {
    if (!["file", "untitled", "vscode-vfs"].includes(doc.uri.scheme)) return;
    const s = settings();
    if (!s.enabled || (doc.uri.scheme !== "untitled" && s.ignored(relPath(doc.uri)))) { forget(doc.uri); refresh(); return; }
    const text = doc.getText();
    record(doc.uri, text, scan(text, relPath(doc.uri), scanOptions(s)));
    refresh();
  };

  /** Check a file again now (after a fix or a deletion) and say what is left, so a removal is confirmed straight away. */
  const rescan = (doc: vscode.TextDocument, before?: number) => {
    clearTimeout(timers.get(doc.uri.toString())); timers.delete(doc.uri.toString());
    check(doc);
    const left = results.get(doc.uri.toString())?.findings.length ?? 0;
    if (before === undefined || left === before) return left;
    vscode.window.setStatusBarMessage(left ? `$(shield) Code Guard rescanned: ${plural(left, "finding")} left in this file` : "$(pass-filled) Code Guard rescanned: this file is clean", 5000);
    return left;
  };

  /** Read the project's .veyra-guard.json again, and recheck open files with it. */
  const loadProjectConfig = async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    let text: string | undefined;
    if (folder) try { text = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, CONFIG_FILE))); } catch { /* no project file */ }
    project = text === undefined ? { config: {} } : parseConfig(text);
    if (project.error) void vscode.window.showWarningMessage(`Veyra Code Guard: ${project.error}`);
    vscode.workspace.textDocuments.forEach(check);
    refresh();
  };

  /** Check every file in the workspace; returns what the PDF report needs. */
  const scanWorkspace = async (token?: vscode.CancellationToken, progress?: vscode.Progress<{ message?: string; increment?: number }>) => {
    const s = settings();
    const files = (await vscode.workspace.findFiles("**/*", EXCLUDE, 50000, token)).filter(uri => !s.ignored(relPath(uri)));
    const open = new Map(vscode.workspace.textDocuments.map(d => [d.uri.toString(), d]));
    let filesScanned = 0, linesScanned = 0;
    for (const uri of files) {
      if (token?.isCancellationRequested) break;
      if (++filesScanned % 50 === 0) progress?.report({ message: `Checked ${filesScanned} of ${files.length} files…`, increment: (50 / files.length) * 100 });
      let text: string;
      // An open file is checked as it is in the editor, unsaved changes (such as removed code) included.
      const doc = open.get(uri.toString());
      if (doc) text = doc.getText();
      else try { const bytes = await vscode.workspace.fs.readFile(uri); if (bytes.byteLength > 5_000_000) continue; text = new TextDecoder().decode(bytes); } catch { continue; }
      linesScanned += text.split("\n").length;
      record(uri, text, scan(text, relPath(uri), scanOptions(s)));
    }
    if (!token?.isCancellationRequested) {
      // Files deleted or newly ignored since they were flagged no longer count.
      const seen = new Set(files.map(u => u.toString()));
      for (const [key, entry] of results) if (entry.uri.scheme === "file" && !seen.has(key) && !open.has(key)) forget(entry.uri);
      tree.languages = languageCounts(files.map(relPath));
    }
    refresh();
    return { filesScanned, linesScanned, files: [...results.values()], languages: tree.languages };
  };

  // ---------- Files changed outside the editor ----------
  // git pull, a package install or another program can add or remove code: check those files too, and forget deleted ones.
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  const onDisk = (uri: vscode.Uri) => {
    const s = settings();
    if (!s.enabled || !s.watchFiles || uri.scheme !== "file" || EXCLUDED.test(uri.path) || s.ignored(relPath(uri))) return;
    if (relPath(uri) === CONFIG_FILE) return void loadProjectConfig();
    // Open files are checked through their editor, which reloads them from disk.
    if (vscode.workspace.textDocuments.some(d => d.uri.toString() === uri.toString())) return;
    const key = `disk:${uri.toString()}`;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(async () => {
      timers.delete(key);
      try {
        if ((await vscode.workspace.fs.stat(uri)).type !== vscode.FileType.File) return;
        const bytes = await vscode.workspace.fs.readFile(uri);
        if (bytes.byteLength > 5_000_000) return;
        const text = new TextDecoder().decode(bytes);
        record(uri, text, scan(text, relPath(uri), scanOptions(settings())));
      } catch { forget(uri); }
      refresh();
    }, 300));
  };
  context.subscriptions.push(watcher,
    watcher.onDidCreate(onDisk),
    watcher.onDidChange(onDisk),
    watcher.onDidDelete(uri => {
      if (relPath(uri) === CONFIG_FILE) return void loadProjectConfig();
      // A deleted folder takes every file inside it with it.
      const prefix = uri.toString() + "/";
      for (const [key, entry] of results) if (key === uri.toString() || key.startsWith(prefix)) forget(entry.uri);
      refresh();
    }),
  );

  const projectName = () => vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0].name : vscode.workspace.name ?? "Workspace";

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidSaveTextDocument(check),
    vscode.workspace.onDidCloseTextDocument(doc => { if (doc.uri.scheme === "untitled") { forget(doc.uri); refresh(); } }),
    vscode.workspace.onDidChangeTextDocument(e => {
      const key = e.document.uri.toString(), flagged = results.get(key)?.findings.length ?? 0;
      // Code was removed from a flagged file: check again at once, so the warning goes as soon as the code does.
      if (flagged && e.contentChanges.some(c => c.rangeLength > 0)) return void rescan(e.document, flagged);
      // A flagged file is always rechecked, even with scanning while typing turned off.
      if (!settings().scanWhileTyping && !flagged) return;
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { timers.delete(key); check(e.document); }, 400));
    }),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraGuard")) { vscode.workspace.textDocuments.forEach(check); refresh(); } }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void loadProjectConfig()),

    vscode.commands.registerCommand("veyraGuard.scanFile", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return void vscode.window.showInformationMessage("Open a file to scan it.");
      check(doc);
      const n = diagnostics.get(doc.uri)?.length ?? 0;
      void vscode.window.showInformationMessage(n ? `Veyra Code Guard: ${plural(n, "suspicious line")} in this file.` : "Veyra Code Guard: nothing suspicious in this file.");
    }),

    vscode.commands.registerCommand("veyraGuard.rescan", async (uri: vscode.Uri, before?: number) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      return rescan(doc, before);
    }),

    vscode.commands.registerCommand("veyraGuard.scanWorkspace", async () => {
      if (!vscode.workspace.workspaceFolders?.length) return void vscode.window.showInformationMessage("Open a folder to scan it.");
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Veyra Code Guard", cancellable: true }, (progress, token) => scanWorkspace(token, progress));
      const all = result.files.flatMap(f => f.findings), g = grade(all);
      const where = `${plural(result.filesScanned, "file")}${result.languages.length ? ` in ${plural(result.languages.length, "language")}` : ""}`;
      if (!all.length) { void vscode.window.showInformationMessage(`Veyra Code Guard checked ${where}: Grade A, nothing suspicious found.`); return { done: result.filesScanned, all, languages: result.languages }; }
      // Not awaited, so the command finishes without waiting for a click.
      void vscode.window.showWarningMessage(`Veyra Code Guard checked ${where}: Grade ${g.letter} (${g.score}/100). ${plural(all.length, "suspicious line")} in ${plural(result.files.length, "file")}: ${g.counts.critical} critical, ${g.counts.high} high, ${g.counts.medium} medium, ${g.counts.low} low.`, "Show Findings", "Create PDF Report")
        .then(pick => { if (pick === "Show Findings") void vscode.commands.executeCommand("veyraGuard.findings.focus"); else if (pick) void vscode.commands.executeCommand("veyraGuard.createReport"); });
      return { done: result.filesScanned, all, languages: result.languages };
    }),

    vscode.commands.registerCommand("veyraGuard.createReport", async (target?: vscode.Uri) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return void vscode.window.showInformationMessage("Open a folder to create a security report for it.");
      const stamp = new Date().toISOString().slice(0, 10);
      const dest = target instanceof vscode.Uri ? target : await vscode.window.showSaveDialog({ title: "Save the security report", defaultUri: vscode.Uri.joinPath(folder.uri, `veyra-code-guard-report-${stamp}.pdf`), filters: { "PDF report": ["pdf"] } });
      if (!dest) return;
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating the security report", cancellable: true }, (progress, token) => scanWorkspace(token, progress));
      const pdf = buildReport({ project: projectName(), scope: "Whole workspace", files: result.files.map(f => ({ path: f.path, findings: f.findings, text: f.text })), filesScanned: result.filesScanned, linesScanned: result.linesScanned, version: VERSION, languages: result.languages });
      await vscode.workspace.fs.writeFile(dest, pdf);
      if (!(target instanceof vscode.Uri)) void vscode.window.showInformationMessage(`Security report saved: ${vscode.workspace.asRelativePath(dest)}`, "Open", "Show in Folder").then(pick => {
        if (pick === "Open") void vscode.env.openExternal(dest);
        else if (pick) void vscode.commands.executeCommand("revealFileInOS", dest);
      });
      return dest;
    }),

    vscode.commands.registerCommand("veyraGuard.removeHiddenCharacters", async (uri?: vscode.Uri) => {
      const doc = uri instanceof vscode.Uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
      if (!doc) return void vscode.window.showInformationMessage("Open a file to clean it.");
      const before = results.get(doc.uri.toString())?.findings.length ?? 0;
      const { text, removed } = removeHiddenCharacters(doc.getText());
      if (!removed) { if (!(uri instanceof vscode.Uri)) void vscode.window.showInformationMessage("Veyra Code Guard: no hidden characters in this file."); return 0; }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), text);
      await vscode.workspace.applyEdit(edit);
      const left = rescan(doc, before);
      if (!(uri instanceof vscode.Uri)) void vscode.window.showInformationMessage(`Veyra Code Guard removed ${plural(removed, "hidden character")} and rescanned the file: ${left ? `${plural(left, "finding")} left.` : "it's clean."}`);
      return removed;
    }),

    vscode.commands.registerCommand("veyraGuard.createConfig", async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return void vscode.window.showInformationMessage("Open a folder to add team settings to it.");
      const uri = vscode.Uri.joinPath(folder.uri, CONFIG_FILE);
      try { await vscode.workspace.fs.stat(uri); } catch {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify({
          minSeverity: "low", failOn: "high", ignorePaths: ["docs/**", "test/fixtures/**"], disabledRules: [],
          customRules: [{ id: "no-internal-hosts", pattern: "internal\\.example\\.com", severity: "medium", title: "Internal host name in code", fix: "Read the address from configuration instead.", files: ["src/**"] }],
        }, null, 2) + "\n"));
      }
      await vscode.window.showTextDocument(uri);
    }),

    vscode.commands.registerCommand("veyraGuard.installHook", async (folderPath?: string) => {
      const folder = typeof folderPath === "string" ? folderPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const hooks = folder && hooksDir(folder);
      if (!hooks) return void vscode.window.showWarningMessage("Veyra Code Guard: this folder isn't a git repository, so there's no commit to guard.");
      writeFileSync(join(hooks, "veyra-code-guard.cjs"), readFileSync(join(context.extensionPath, "bundle", "cli.js")));
      const hook = join(hooks, "pre-commit");
      const line = `node "$(git rev-parse --git-path hooks)/veyra-code-guard.cjs" --staged || exit 1 ${HOOK_MARK}`;
      const existing = existsSync(hook) ? readFileSync(hook, "utf8") : "";
      if (!existing.includes(HOOK_MARK)) writeFileSync(hook, existing ? `${existing.trimEnd()}\n${line}\n` : `#!/bin/sh\n# Checks staged changes with Veyra Code Guard before each commit. Skip once with: git commit --no-verify\n${line}\n`);
      try { chmodSync(hook, 0o755); } catch { /* Windows: git runs hooks without the executable bit */ }
      if (typeof folderPath !== "string") void vscode.window.showInformationMessage("Pre-commit guard installed. Commits with high or critical findings will be stopped before they're made. Skip once with git commit --no-verify.");
      return hook;
    }),

    vscode.commands.registerCommand("veyraGuard.removeHook", async (folderPath?: string) => {
      const folder = typeof folderPath === "string" ? folderPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const hooks = folder && hooksDir(folder);
      const hook = hooks && join(hooks, "pre-commit");
      if (!hook || !existsSync(hook)) return void vscode.window.showInformationMessage("There's no pre-commit guard to remove.");
      const kept = readFileSync(hook, "utf8").split("\n").filter(l => !l.includes(HOOK_MARK) && !l.startsWith("# Checks staged changes with Veyra Code Guard"));
      writeFileSync(hook, kept.join("\n"));
      if (typeof folderPath !== "string") void vscode.window.showInformationMessage("Pre-commit guard removed.");
    }),

    vscode.commands.registerCommand("veyraGuard.clear", () => { diagnostics.clear(); results.clear(); refresh(); }),

    vscode.commands.registerCommand("veyraGuard.listRules", async () => {
      const custom = settings().customRules.map(r => ({ label: r.title || `Custom rule: ${r.id}`, description: `${r.id} · ${r.severity ?? "high"} · custom`, detail: r.why || `Pattern: ${r.pattern}` }));
      const pick = await vscode.window.showQuickPick([...ruleList().map(r => ({ label: r.title, description: `${r.id} · ${r.severity}`, detail: `${r.why} How to fix: ${r.fix}` })), ...custom], { title: `What Veyra Code Guard looks for (${ruleList().length + custom.length} rules)`, matchOnDetail: true });
      if (pick) await vscode.env.clipboard.writeText(pick.description!.split(" · ")[0]);
    }),

    vscode.commands.registerCommand("veyraGuard.acceptLine", async (uri: vscode.Uri, line: number, rule: string) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const tokens = commentFor(doc.languageId);
      if (!tokens) return;
      const target = doc.lineAt(line), indent = target.text.slice(0, target.firstNonWhitespaceCharacterIndex);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(uri, new vscode.Position(line, 0), `${indent}${tokens[0]} veyra-guard-ignore: ${rule} (reviewed: safe)${tokens[1] ? ` ${tokens[1]}` : ""}\n`);
      await vscode.workspace.applyEdit(edit);
    }),

    vscode.languages.registerCodeActionsProvider("*", {
      provideCodeActions(doc, _range, ctx) {
        const tokens = commentFor(doc.languageId);
        const before = results.get(doc.uri.toString())?.findings.length ?? 0;
        // Every fix that removes code is followed by a rescan, which confirms the finding is gone.
        const thenRescan = { command: "veyraGuard.rescan", title: "Rescan", arguments: [doc.uri, before] };
        const ours = ctx.diagnostics.filter(d => d.source === SOURCE);
        const actions = ours.flatMap(d => {
          const rule = String(d.code), line = doc.lineAt(d.range.start.line);
          const out: vscode.CodeAction[] = [];
          if (rule === "trojan-source" || rule === "invisible-character") {
            const clean = new vscode.CodeAction("Remove the hidden characters on this line", vscode.CodeActionKind.QuickFix);
            clean.edit = new vscode.WorkspaceEdit();
            clean.edit.replace(doc.uri, line.range, removeHiddenCharacters(line.text).text);
            clean.diagnostics = [d]; clean.isPreferred = true; clean.command = thenRescan;
            out.push(clean);
          }
          if (rule === "hidden-far-right") {
            const cut = new vscode.CodeAction("Remove the code hidden off-screen", vscode.CodeActionKind.QuickFix);
            cut.edit = new vscode.WorkspaceEdit();
            cut.edit.replace(doc.uri, line.range, line.text.slice(0, d.range.start.character).trimEnd());
            cut.diagnostics = [d]; cut.isPreferred = true; cut.command = thenRescan;
            out.push(cut);
          }
          const remove = new vscode.CodeAction(`Delete line ${d.range.start.line + 1} (the suspicious code) and rescan`, vscode.CodeActionKind.QuickFix);
          remove.edit = new vscode.WorkspaceEdit();
          remove.edit.delete(doc.uri, line.rangeIncludingLineBreak);
          remove.diagnostics = [d]; remove.command = thenRescan;
          out.push(remove);
          if (tokens) {
            const accept = new vscode.CodeAction(`Mark as reviewed and safe (${rule})`, vscode.CodeActionKind.QuickFix);
            accept.command = { command: "veyraGuard.acceptLine", title: accept.title, arguments: [doc.uri, d.range.start.line, rule] };
            accept.diagnostics = [d];
            out.push(accept);
          }
          return out;
        });
        // Several hidden-character findings: one action cleans the whole file.
        const hidden = (results.get(doc.uri.toString())?.findings ?? []).filter(f => f.rule === "trojan-source" || f.rule === "invisible-character");
        if (hidden.length > 1 && ours.some(d => d.code === "trojan-source" || d.code === "invisible-character")) {
          const all = new vscode.CodeAction(`Remove all hidden characters in this file (${hidden.length} lines)`, vscode.CodeActionKind.QuickFix);
          all.command = { command: "veyraGuard.removeHiddenCharacters", title: all.title, arguments: [doc.uri] };
          actions.push(all);
        }
        return actions;
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
  );

  void loadProjectConfig();
  refresh();
  return { diagnostics, results, scan };
}

/** The git hooks folder for a working tree (handles worktrees, where .git is a file pointing elsewhere). */
function hooksDir(folder: string): string | undefined {
  for (let dir = resolve(folder); ; dir = dirname(dir)) {
    const dotGit = join(dir, ".git");
    if (existsSync(dotGit)) {
      let gitDir = dotGit;
      if (statSync(dotGit).isFile()) {
        const m = /gitdir:\s*(.+)/.exec(readFileSync(dotGit, "utf8"));
        if (!m) return undefined;
        gitDir = resolve(dir, m[1].trim());
        const common = join(gitDir, "commondir");
        if (existsSync(common)) gitDir = resolve(gitDir, readFileSync(common, "utf8").trim());
      }
      const hooks = join(gitDir, "hooks");
      return existsSync(hooks) ? hooks : undefined;
    }
    if (dirname(dir) === dir) return undefined;
  }
}

export function deactivate() {}
