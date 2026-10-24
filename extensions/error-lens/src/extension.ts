import * as vscode from "vscode";
import { SEVERITY_NAMES, byLine, codeText, compilePatterns, describe, filterProblems, formatMessage, hiddenWhileTyping, pickLines, searchQuery, truncate, type LineProblem, type Problem, type Severity } from "./model";

/* Error Lens Veyra: each line's problem shown at its end, the line tinted, and the cursor's problem in the status bar. */

const config = () => vscode.workspace.getConfiguration("veyraLens");
const KEYS = ["error", "warning", "info", "hint"] as const;

class Lens {
  private types: vscode.TextEditorDecorationType[] = [];
  private lastEdit = new Map<string, { line: number; at: number }>();
  private timers = new Map<string, NodeJS.Timeout>();
  private status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -100);
  /** For tests: what each document shows. */
  readonly shown = new Map<string, { line: number; severity: Severity; text: string }[]>();
  private warnedPatterns = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.status.command = "workbench.actions.view.problems";
    this.status.name = "Error Lens Veyra";
    this.buildTypes();
  }

  dispose() { this.types.forEach(t => t.dispose()); this.status.dispose(); this.timers.forEach(t => clearTimeout(t)); }

  /** One decoration type per severity, built from the settings and theme colours. */
  buildTypes() {
    this.types.forEach(t => t.dispose());
    const c = config();
    this.types = KEYS.map(key => vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: c.get("highlightLine", true) ? new vscode.ThemeColor(`veyraLens.${key}Background`) : undefined,
      gutterIconPath: c.get("gutterIcons", false) ? vscode.Uri.joinPath(this.context.extensionUri, "media", `gutter-${key}.svg`) : undefined,
      gutterIconSize: "70%",
      after: { margin: "0 0 0 3ch", color: new vscode.ThemeColor(`veyraLens.${key}Foreground`), fontWeight: "normal", fontStyle: "normal" },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    }));
  }

  private problems(document: vscode.TextDocument): LineProblem[] {
    const c = config();
    const { regexes, invalid } = compilePatterns(c.get<string[]>("excludeMessages", []));
    if (invalid.length && !this.warnedPatterns) {
      this.warnedPatterns = true;
      vscode.window.showWarningMessage(`Error Lens Veyra: these "excludeMessages" patterns aren't valid regular expressions and were skipped: ${invalid.join(", ")}`);
    }
    const all: Problem[] = vscode.languages.getDiagnostics(document.uri).map(d => ({
      line: d.range.start.line, severity: d.severity as number as Severity, message: d.message, source: d.source, code: codeText(d.code),
    }));
    return byLine(filterProblems(all, { severities: new Set(c.get<string[]>("severities", ["error", "warning", "info"])), excludeSources: c.get<string[]>("excludeSources", []), excludeMessages: regexes }));
  }

  private excluded(document: vscode.TextDocument): boolean {
    if (document.uri.scheme === "output" || document.uri.scheme === "vscode-scm") return true;
    return config().get<string[]>("excludeFiles", []).some(glob => vscode.languages.match({ pattern: glob }, document) > 0);
  }

  /** Redraws one editor. */
  update(editor: vscode.TextEditor) {
    const key = editor.document.uri.toString();
    const c = config();
    const empty = () => { this.types.forEach(t => editor.setDecorations(t, [])); this.shown.set(key, []); };
    if (!c.get("enabled", true) || this.excluded(editor.document)) return empty();
    const now = Date.now(), delay = c.get<number>("typingDelay", 600), mode = c.get<string>("whileTyping", "hideCurrentLine");
    const edit = this.lastEdit.get(key);
    if (mode === "wait" && edit && now - edit.at < delay) return this.later(editor, delay - (now - edit.at));
    const lines = pickLines(this.problems(editor.document), c.get("followCursor", "allLines"), editor.selection.active.line);
    const template = c.get<string>("messageTemplate", "{message}"), max = c.get<number>("maxMessageLength", 200);
    const buckets: vscode.DecorationOptions[][] = [[], [], [], []];
    const shown: { line: number; severity: Severity; text: string }[] = [];
    let waiting = false;
    for (const entry of lines) {
      if (entry.line >= editor.document.lineCount) continue;
      if (hiddenWhileTyping(mode, entry.line, edit, now, delay)) { waiting = true; continue; }
      const text = formatMessage(template, entry, max);
      const range = editor.document.lineAt(entry.line).range;
      buckets[entry.top.severity].push({ range, renderOptions: { after: { contentText: text } } });
      shown.push({ line: entry.line, severity: entry.top.severity, text });
    }
    this.types.forEach((t, i) => editor.setDecorations(t, buckets[i]));
    this.shown.set(key, shown);
    if (waiting && edit) this.later(editor, delay - (now - edit.at) + 20);
  }

  private later(editor: vscode.TextEditor, ms: number) {
    const key = editor.document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); this.update(editor); this.updateStatus(); }, Math.max(0, ms)));
  }

  updateAll() { vscode.window.visibleTextEditors.forEach(e => this.update(e)); this.updateStatus(); }

  noteEdit(e: vscode.TextDocumentChangeEvent) {
    if (!e.contentChanges.length) return;
    this.lastEdit.set(e.document.uri.toString(), { line: e.contentChanges[e.contentChanges.length - 1].range.start.line, at: Date.now() });
  }

  /** The problems on the cursor's line, if any. */
  atCursor(editor = vscode.window.activeTextEditor): LineProblem | undefined {
    if (!editor) return undefined;
    const line = editor.selection.active.line;
    return this.problems(editor.document).find(l => l.line === line);
  }

  updateStatus() {
    const entry = config().get("enabled", true) && !this.excludedActive() ? this.atCursor() : undefined;
    vscode.commands.executeCommand("setContext", "veyraLens.lineHasProblem", !!entry);
    if (!entry || !config().get("statusBar", true)) { this.status.hide(); return; }
    const icon = ["$(error)", "$(warning)", "$(info)", "$(lightbulb)"][entry.top.severity];
    this.status.text = `${icon} ${truncate(entry.top.message.replace(/\s+/g, " "), 90)}`;
    this.status.tooltip = new vscode.MarkdownString(`${describe(entry).split("\n").map(l => `- ${l.replace(/[\\`*_[\]<>]/g, "\\$&")}`).join("\n")}\n\nClick to open the Problems panel.`);
    this.status.color = new vscode.ThemeColor(`veyraLens.${KEYS[entry.top.severity]}Foreground`);
    this.status.show();
  }
  private excludedActive() { const e = vscode.window.activeTextEditor; return !e || this.excluded(e.document); }
}

export function activate(context: vscode.ExtensionContext) {
  const lens = new Lens(context);
  let queued: NodeJS.Timeout | undefined;
  const pending = new Set<string>();
  // Diagnostics can arrive many times a second; redraw the affected editors once.
  const onDiagnostics = (uris: readonly vscode.Uri[]) => {
    uris.forEach(u => pending.add(u.toString()));
    if (queued) return;
    queued = setTimeout(() => {
      queued = undefined;
      for (const editor of vscode.window.visibleTextEditors) if (pending.has(editor.document.uri.toString())) lens.update(editor);
      pending.clear();
      lens.updateStatus();
    }, 60);
  };
  const setSeverities = async (change: (list: Set<string>) => void, what: string) => {
    const list = new Set(config().get<string[]>("severities", ["error", "warning", "info"]));
    change(list);
    await config().update("severities", SEVERITY_NAMES.filter(s => list.has(s)), vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`Error Lens Veyra: ${what}`, 2500);
  };
  context.subscriptions.push(
    lens,
    vscode.languages.onDidChangeDiagnostics(e => onDiagnostics(e.uris)),
    vscode.window.onDidChangeVisibleTextEditors(editors => { editors.forEach(e => lens.update(e)); lens.updateStatus(); }),
    vscode.window.onDidChangeActiveTextEditor(() => lens.updateStatus()),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (config().get("followCursor", "allLines") !== "allLines") lens.update(e.textEditor);
      lens.updateStatus();
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      lens.noteEdit(e);
      if (config().get("whileTyping", "hideCurrentLine") === "hideCurrentLine") for (const editor of vscode.window.visibleTextEditors) if (editor.document === e.document) lens.update(editor);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("veyraLens")) return;
      if (["highlightLine", "gutterIcons"].some(k => e.affectsConfiguration(`veyraLens.${k}`))) lens.buildTypes();
      lens.updateAll();
    }),
    vscode.commands.registerCommand("veyraLens.toggle", async () => {
      const on = !config().get("enabled", true);
      await config().update("enabled", on, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(`Error Lens Veyra: ${on ? "on" : "off"}`, 2500);
    }),
    vscode.commands.registerCommand("veyraLens.toggleWarnings", () => setSeverities(l => { if (l.has("warning")) l.delete("warning"); else l.add("warning"); }, "warnings switched")),
    vscode.commands.registerCommand("veyraLens.toggleInfo", () => setSeverities(l => { if (l.has("info") || l.has("hint")) { l.delete("info"); l.delete("hint"); } else { l.add("info"); l.add("hint"); } }, "info and hints switched")),
    vscode.commands.registerCommand("veyraLens.copyMessage", async () => {
      const entry = lens.atCursor();
      if (!entry) { vscode.window.setStatusBarMessage("Error Lens Veyra: no problem on this line", 2500); return; }
      await vscode.env.clipboard.writeText(describe(entry));
      vscode.window.setStatusBarMessage("Error Lens Veyra: copied", 2000);
    }),
    vscode.commands.registerCommand("veyraLens.searchMessage", async () => {
      const entry = lens.atCursor();
      if (!entry) { vscode.window.setStatusBarMessage("Error Lens Veyra: no problem on this line", 2500); return; }
      await vscode.env.openExternal(vscode.Uri.parse(`https://www.bing.com/search?q=${encodeURIComponent(searchQuery(entry.top))}`));
    }),
    vscode.commands.registerCommand("veyraLens.ignoreSource", async () => {
      const editor = vscode.window.activeTextEditor;
      const sources = [...new Set((editor ? vscode.languages.getDiagnostics(editor.document.uri) : vscode.languages.getDiagnostics().flatMap(([, d]) => d)).map(d => d.source).filter((s): s is string => !!s))];
      if (!sources.length) { vscode.window.showInformationMessage("There are no problems with a source to hide."); return; }
      const source = await vscode.window.showQuickPick(sources, { placeHolder: "Hide inline problems from which source? (They stay in the Problems panel.)" });
      if (!source) return;
      const list = config().get<string[]>("excludeSources", []);
      await config().update("excludeSources", [...new Set([...list, source])], vscode.workspace.workspaceFolders ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global);
    }),
  );
  lens.updateAll();
  return { lens }; // for the integration tests
}

export function deactivate() {}
