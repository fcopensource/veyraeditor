import * as vscode from "vscode";
import { scan, ruleList, summarize, type Finding, type Severity } from "./scanner";

const SOURCE = "Veyra Code Guard";
const EXCLUDE = "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/bundle/**,**/.next/**,**/coverage/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/target/**}";
const LEVEL: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error, high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning, low: vscode.DiagnosticSeverity.Information,
};

// How a line comment starts in each language, for "accept this line" (no entry: the language has no line comments).
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

function toDiagnostics(findings: Finding[]) {
  return findings.map(f => {
    const d = new vscode.Diagnostic(new vscode.Range(f.line - 1, f.column - 1, f.line - 1, f.endColumn - 1), `${f.severity.toUpperCase()}: ${f.title}\n${f.message}\n\n${f.why}`, LEVEL[f.severity]);
    d.source = SOURCE;
    d.code = f.rule;
    return d;
  });
}

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection("veyra-code-guard");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "veyraGuard.scanWorkspace";
  const timers = new Map<string, NodeJS.Timeout>();
  context.subscriptions.push(diagnostics, status);

  const relPath = (uri: vscode.Uri) => vscode.workspace.asRelativePath(uri, false);
  const check = (doc: vscode.TextDocument) => {
    if (!["file", "untitled", "vscode-vfs"].includes(doc.uri.scheme)) return;
    const s = settings();
    if (!s.enabled) { diagnostics.delete(doc.uri); return; }
    diagnostics.set(doc.uri, toDiagnostics(scan(doc.getText(), relPath(doc.uri), { minSeverity: s.minSeverity, disabled: s.disabled })));
    updateStatus();
  };
  const updateStatus = () => {
    const doc = vscode.window.activeTextEditor?.document;
    const here = doc ? (diagnostics.get(doc.uri) ?? []).filter(d => d.source === SOURCE) : [];
    let total = 0; diagnostics.forEach((_, ds) => { total += ds.length; });
    status.text = here.length ? `$(shield) ${here.length} suspicious` : "$(shield) Code Guard";
    status.tooltip = here.length ? `Veyra Code Guard: ${here.length} suspicious line(s) in this file, ${total} in all checked files.\nClick to scan the whole workspace.` : `Veyra Code Guard: nothing suspicious in this file.${total ? ` ${total} in other files.` : ""}\nClick to scan the whole workspace.`;
    status.backgroundColor = here.some(d => d.severity === vscode.DiagnosticSeverity.Error) ? new vscode.ThemeColor("statusBarItem.errorBackground") : here.length ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    status.show();
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidSaveTextDocument(check),
    vscode.workspace.onDidCloseTextDocument(doc => { if (doc.uri.scheme === "untitled") diagnostics.delete(doc.uri); }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (!settings().scanWhileTyping) return;
      const key = e.document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { timers.delete(key); check(e.document); }, 400));
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
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
      const s = settings();
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Veyra Code Guard", cancellable: true }, async (progress, token) => {
        const files = await vscode.workspace.findFiles("**/*", EXCLUDE, 50000, token);
        const all: Finding[] = []; let flagged = 0, done = 0;
        for (const uri of files) {
          if (token.isCancellationRequested) break;
          if (++done % 50 === 0) progress.report({ message: `Checked ${done} of ${files.length} files…`, increment: (50 / files.length) * 100 });
          let text: string;
          try { const bytes = await vscode.workspace.fs.readFile(uri); if (bytes.byteLength > 5_000_000) continue; text = new TextDecoder().decode(bytes); } catch { continue; }
          const found = scan(text, relPath(uri), { minSeverity: s.minSeverity, disabled: s.disabled });
          diagnostics.set(uri, toDiagnostics(found));
          if (found.length) { flagged++; all.push(...found); }
        }
        return { all, flagged, done };
      });
      updateStatus();
      const c = summarize(result.all);
      if (!result.all.length) { void vscode.window.showInformationMessage(`Veyra Code Guard checked ${result.done} files: nothing suspicious found.`); return result; }
      // Not awaited, so the command finishes without waiting for a click.
      void vscode.window.showWarningMessage(`Veyra Code Guard found ${result.all.length} suspicious line(s) in ${result.flagged} file(s): ${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low.`, "Show Problems")
        .then(pick => { if (pick) void vscode.commands.executeCommand("workbench.actions.view.problems"); });
      return result;
    }),

    vscode.commands.registerCommand("veyraGuard.clear", () => { diagnostics.clear(); updateStatus(); }),

    vscode.commands.registerCommand("veyraGuard.listRules", async () => {
      const pick = await vscode.window.showQuickPick(ruleList().map(r => ({ label: r.title, description: `${r.id} · ${r.severity}`, detail: r.why })), { title: "What Veyra Code Guard looks for", matchOnDetail: true });
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
            clean.edit.replace(doc.uri, line.range, line.text.replace(/[\u202a-\u202e\u2066-\u2069\u200b-\u200d\u2060-\u2064\u180e\u00ad]|(?<!^)\ufeff/g, ""));
            clean.diagnostics = [d]; clean.isPreferred = true;
            actions.push(clean);
          }
          return actions;
        });
      },
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
  );

  vscode.workspace.textDocuments.forEach(check);
  updateStatus();
  return { diagnostics, scan };
}

export function deactivate() {}
