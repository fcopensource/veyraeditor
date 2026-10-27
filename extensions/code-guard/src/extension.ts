import * as vscode from "vscode";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { grade, ruleList, scan, SEVERITIES, severityRank, type Finding, type Severity } from "./scanner";
import { buildReport } from "./report";
import { VERSION } from "./version";

const SOURCE = "Veyra Code Guard";
const EXCLUDE = "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/bundle/**,**/.next/**,**/coverage/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/target/**}";
const HOOK_MARK = "# veyra-code-guard";
const LEVEL: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error, high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning, low: vscode.DiagnosticSeverity.Information,
};
const COLOR: Record<Severity, string> = { critical: "charts.red", high: "charts.orange", medium: "charts.yellow", low: "charts.blue" };
const GRADE_COLOR: Record<string, string> = { A: "charts.green", B: "charts.green", C: "charts.yellow", D: "charts.orange", F: "charts.red" };

// How a line comment starts in each language, for "mark as reviewed" (no entry: the language has no line comments).
const COMMENT: Record<string, [string, string?]> = {
  python: ["#"], shellscript: ["#"], yaml: ["#"], dockerfile: ["#"], makefile: ["#"], ruby: ["#"], perl: ["#"], r: ["#"], powershell: ["#"], toml: ["#"], ini: [";"], properties: ["#"],
  sql: ["--"], lua: ["--"], haskell: ["--"], bat: ["REM"], vb: ["'"],
  html: ["<!--", "-->"], xml: ["<!--", "-->"], markdown: ["<!--", "-->"], vue: ["<!--", "-->"], svelte: ["<!--", "-->"],
  css: ["/*", "*/"], scss: ["//"], less: ["//"],
};
const commentFor = (languageId: string): [string, string?] | undefined => languageId === "json" ? undefined : COMMENT[languageId] ?? ["//"];

function settings() {
  const c = vscode.workspace.getConfiguration("veyraGuard");
  return {
    enabled: c.get<boolean>("enabled", true),
    minSeverity: c.get<Severity>("minSeverity", "low"),
    disabled: c.get<string[]>("disabledRules", []),
    scanWhileTyping: c.get<boolean>("scanWhileTyping", true),
  };
}

interface FileEntry { uri: vscode.Uri; path: string; findings: Finding[]; text: string }

// ---------- The Code Guard panel ----------

type Node = { kind: "grade" } | { kind: "severity"; severity: Severity } | { kind: "finding"; entry: FileEntry; finding: Finding };

class FindingsTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
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
      item.tooltip = `${g.verdict}\n${g.counts.critical} critical, ${g.counts.high} high, ${g.counts.medium} medium, ${g.counts.low} low.\nClick to create a PDF report.`;
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
    view.badge = all.length ? { value: all.length, tooltip: `${all.length} suspicious line(s)` } : undefined;
    status.text = mine.length ? `$(shield) ${mine.length} suspicious` : all.length ? `$(shield) Grade ${g.letter}` : "$(shield) Code Guard";
    status.tooltip = `Veyra Code Guard · Grade ${g.letter} (${g.score}/100)\n${g.verdict}${mine.length ? `\n${mine.length} suspicious line(s) in this file.` : ""}\nClick to open the Code Guard panel.`;
    const worst = mine.reduce<Severity | undefined>((w, f) => (!w || severityRank(f.severity) > severityRank(w) ? f.severity : w), undefined);
    status.backgroundColor = worst === "critical" || worst === "high" ? new vscode.ThemeColor("statusBarItem.errorBackground") : worst ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    status.show();
  };
  const check = (doc: vscode.TextDocument) => {
    if (!["file", "untitled", "vscode-vfs"].includes(doc.uri.scheme)) return;
    const s = settings();
    if (!s.enabled) { diagnostics.delete(doc.uri); results.delete(doc.uri.toString()); refresh(); return; }
    const text = doc.getText();
    record(doc.uri, text, scan(text, relPath(doc.uri), { minSeverity: s.minSeverity, disabled: s.disabled }));
    refresh();
  };

  /** Check every file in the workspace; returns what the PDF report needs. */
  const scanWorkspace = async (token?: vscode.CancellationToken, progress?: vscode.Progress<{ message?: string; increment?: number }>) => {
    const s = settings();
    const files = await vscode.workspace.findFiles("**/*", EXCLUDE, 50000, token);
    let filesScanned = 0, linesScanned = 0;
    for (const uri of files) {
      if (token?.isCancellationRequested) break;
      if (++filesScanned % 50 === 0) progress?.report({ message: `Checked ${filesScanned} of ${files.length} files…`, increment: (50 / files.length) * 100 });
      let text: string;
      try { const bytes = await vscode.workspace.fs.readFile(uri); if (bytes.byteLength > 5_000_000) continue; text = new TextDecoder().decode(bytes); } catch { continue; }
      linesScanned += text.split("\n").length;
      record(uri, text, scan(text, relPath(uri), { minSeverity: s.minSeverity, disabled: s.disabled }));
    }
    refresh();
    return { filesScanned, linesScanned, files: [...results.values()] };
  };

  const projectName = () => vscode.workspace.workspaceFolders?.length === 1 ? vscode.workspace.workspaceFolders[0].name : vscode.workspace.name ?? "Workspace";

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidSaveTextDocument(check),
    vscode.workspace.onDidCloseTextDocument(doc => { if (doc.uri.scheme === "untitled") { diagnostics.delete(doc.uri); results.delete(doc.uri.toString()); refresh(); } }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (!settings().scanWhileTyping) return;
      const key = e.document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { timers.delete(key); check(e.document); }, 400));
    }),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraGuard")) vscode.workspace.textDocuments.forEach(check); }),

    vscode.commands.registerCommand("veyraGuard.scanFile", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return void vscode.window.showInformationMessage("Open a file to scan it.");
      check(doc);
      const n = diagnostics.get(doc.uri)?.length ?? 0;
      void vscode.window.showInformationMessage(n ? `Veyra Code Guard: ${n} suspicious line(s) in this file.` : "Veyra Code Guard: nothing suspicious in this file.");
    }),

    vscode.commands.registerCommand("veyraGuard.scanWorkspace", async () => {
      if (!vscode.workspace.workspaceFolders?.length) return void vscode.window.showInformationMessage("Open a folder to scan it.");
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Veyra Code Guard", cancellable: true }, (progress, token) => scanWorkspace(token, progress));
      const all = result.files.flatMap(f => f.findings), g = grade(all);
      if (!all.length) { void vscode.window.showInformationMessage(`Veyra Code Guard checked ${result.filesScanned} files: Grade A, nothing suspicious found.`); return { done: result.filesScanned, all }; }
      // Not awaited, so the command finishes without waiting for a click.
      void vscode.window.showWarningMessage(`Veyra Code Guard: Grade ${g.letter} (${g.score}/100). ${all.length} suspicious line(s) in ${result.files.length} file(s): ${g.counts.critical} critical, ${g.counts.high} high, ${g.counts.medium} medium, ${g.counts.low} low.`, "Show Findings", "Create PDF Report")
        .then(pick => { if (pick === "Show Findings") void vscode.commands.executeCommand("veyraGuard.findings.focus"); else if (pick) void vscode.commands.executeCommand("veyraGuard.createReport"); });
      return { done: result.filesScanned, all };
    }),

    vscode.commands.registerCommand("veyraGuard.createReport", async (target?: vscode.Uri) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return void vscode.window.showInformationMessage("Open a folder to create a security report for it.");
      const stamp = new Date().toISOString().slice(0, 10);
      const dest = target instanceof vscode.Uri ? target : await vscode.window.showSaveDialog({ title: "Save the security report", defaultUri: vscode.Uri.joinPath(folder.uri, `veyra-code-guard-report-${stamp}.pdf`), filters: { "PDF report": ["pdf"] } });
      if (!dest) return;
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Creating the security report", cancellable: true }, (progress, token) => scanWorkspace(token, progress));
      const pdf = buildReport({ project: projectName(), scope: "Whole workspace", files: result.files.map(f => ({ path: f.path, findings: f.findings, text: f.text })), filesScanned: result.filesScanned, linesScanned: result.linesScanned, version: VERSION });
      await vscode.workspace.fs.writeFile(dest, pdf);
      if (!(target instanceof vscode.Uri)) void vscode.window.showInformationMessage(`Security report saved: ${vscode.workspace.asRelativePath(dest)}`, "Open", "Show in Folder").then(pick => {
        if (pick === "Open") void vscode.env.openExternal(dest);
        else if (pick) void vscode.commands.executeCommand("revealFileInOS", dest);
      });
      return dest;
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
      const pick = await vscode.window.showQuickPick(ruleList().map(r => ({ label: r.title, description: `${r.id} · ${r.severity}`, detail: `${r.why} How to fix: ${r.fix}` })), { title: "What Veyra Code Guard looks for", matchOnDetail: true });
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
        return ctx.diagnostics.filter(d => d.source === SOURCE).flatMap(d => {
          const rule = String(d.code);
          const actions: vscode.CodeAction[] = [];
          if (tokens) {
            const accept = new vscode.CodeAction(`Mark as reviewed and safe (${rule})`, vscode.CodeActionKind.QuickFix);
            accept.command = { command: "veyraGuard.acceptLine", title: accept.title, arguments: [doc.uri, d.range.start.line, rule] };
            accept.diagnostics = [d];
            actions.push(accept);
          }
          if (rule === "trojan-source" || rule === "invisible-character") {
            const clean = new vscode.CodeAction("Remove the hidden characters on this line", vscode.CodeActionKind.QuickFix);
            const line = doc.lineAt(d.range.start.line);
            clean.edit = new vscode.WorkspaceEdit();
            clean.edit.replace(doc.uri, line.range, line.text.replace(/[\u202a-\u202e\u2066-\u2069\u200b-\u200d\u2060-\u2064\u180e\u00ad]/g, ""));
            clean.diagnostics = [d]; clean.isPreferred = true;
            actions.push(clean);
          }
          return actions;
        });
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
  );

  vscode.workspace.textDocuments.forEach(check);
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
