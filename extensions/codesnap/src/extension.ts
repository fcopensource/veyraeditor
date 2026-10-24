import * as vscode from "vscode";
import * as os from "node:os";
import * as path from "node:path";
import { imageName, titleFor } from "./model";

/* CodeSnap Veyra: copies the selection with its colours, shows it as an image in a panel, and copies or saves it as PNG. */

const config = () => vscode.workspace.getConfiguration("veyraSnap");
const SETTINGS = ["background", "solidColor", "frame", "padding", "lineNumbers", "shadow", "size", "scale"] as const;
const settings = () => Object.fromEntries(SETTINGS.map(k => [k, config().get(k)]));

export function activate(context: vscode.ExtensionContext) {
  let panel: vscode.WebviewPanel | undefined;
  let ready: Promise<void> | undefined;
  let editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
  let savedClipboard: string | undefined;
  /** For tests: where Save writes without asking, and answers to "probe". */
  let saveTo: vscode.Uri | undefined;
  const probes: ((m: unknown) => void)[] = [];

  const openPanel = () => {
    if (panel) return panel;
    panel = vscode.window.createWebviewPanel("veyraSnap.panel", "CodeSnap", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "camera.svg");
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const src = (f: string) => panel!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", f));
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src blob: data:;">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${src("viewer.css")}"></head>
<body><div id="app"></div><script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;
    let markReady: () => void;
    ready = new Promise(resolve => (markReady = resolve));
    panel.webview.onDidReceiveMessage(async m => {
      switch (m.type) {
        case "ready": markReady(); break;
        case "pasted": {
          // Put back what was on the clipboard before the snap, and the focus where it was.
          if (savedClipboard !== undefined) { await vscode.env.clipboard.writeText(savedClipboard); savedClipboard = undefined; }
          const back = returnTo;
          returnTo = undefined;
          if (back) await vscode.window.showTextDocument(back.document, { viewColumn: back.viewColumn, preserveFocus: false, selection: back.selection });
          break;
        }
        case "setting": await config().update(m.key, m.value, vscode.ConfigurationTarget.Global); break;
        case "save": await save(m); break;
        case "probe": probes.splice(0).forEach(r => r(m)); break;
      }
    }, undefined, context.subscriptions);
    panel.onDidDispose(() => { panel = undefined; ready = undefined; }, undefined, context.subscriptions);
    return panel;
  };

  async function save(m: { data: string; title: string; firstLine: number; lastLine: number }) {
    const name = imageName(m.title, m.firstLine, m.lastLine);
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    let target = saveTo;
    if (!target) target = await vscode.window.showSaveDialog({ defaultUri: folder ? vscode.Uri.joinPath(folder, name) : vscode.Uri.file(path.join(os.homedir(), name)), filters: { "PNG image": ["png"] }, title: "Save the snap" });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(m.data, "base64"));
    panel?.webview.postMessage({ type: "saved", text: `Saved ${path.basename(target.fsPath)}` });
    if (!saveTo) {
      const open = await vscode.window.showInformationMessage(`Saved ${path.basename(target.fsPath)}`, "Open", "Show in Folder");
      if (open === "Open") vscode.commands.executeCommand("vscode.open", target);
      if (open === "Show in Folder") vscode.commands.executeCommand("revealFileInOS", target);
    }
    lastSaved = target;
    savedWaiters.splice(0).forEach(r => r(target));
  }
  let lastSaved: vscode.Uri | undefined;
  const savedWaiters: ((u: vscode.Uri) => void)[] = [];

  /** Copies the selection with its colours and sends it to the panel, which reads it back from the clipboard. */
  async function snap(target = editor) {
    if (!target) { vscode.window.showInformationMessage("Open a file and select some code to snap."); return; }
    const sel = target.selection;
    const range = sel.isEmpty ? new vscode.Range(0, 0, Math.min(target.document.lineCount, 40), 0) : new vscode.Range(sel.start.line, 0, sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line : sel.end.line + 1, 0);
    const p = openPanel();
    if (!p.visible) p.reveal(vscode.ViewColumn.Beside, true);
    await ready;
    // Busy from here: the selection changes below aren't the person's, so live updates ignore them.
    returnTo = target;
    const previous = target.selections;
    // Copy whole lines, so indentation lines up even when the selection starts after the leading spaces.
    target.selection = new vscode.Selection(range.start, range.end);
    savedClipboard ??= await vscode.env.clipboard.readText();
    await vscode.window.showTextDocument(target.document, { viewColumn: target.viewColumn, preserveFocus: false, selection: target.selection });
    await vscode.commands.executeCommand("editor.action.clipboardCopyWithSyntaxHighlightingAction");
    target.selections = previous;
    lastSnap = snapKey(target);
    p.webview.postMessage({
      type: "snap", paste: true, text: target.document.getText(range), firstLine: range.start.line + 1, title: titleFor(target.document.uri.path),
      tabSize: Number(target.options.tabSize) || 4, settings: settings(),
    });
    // The panel can only read the coloured copy while it has focus: lend it focus, and take it back once it has read it.
    p.reveal(p.viewColumn, false);
  }
  const snapKey = (e: vscode.TextEditor) => `${e.document.uri}|${e.selection.start.line}:${e.selection.start.character}-${e.selection.end.line}:${e.selection.end.character}|${e.document.version}`;
  let returnTo: vscode.TextEditor | undefined;
  let lastSnap = "";

  let timer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    vscode.commands.registerCommand("veyraSnap.snap", async (options?: { saveTo?: string }) => {
      if (options?.saveTo) saveTo = vscode.Uri.file(options.saveTo);
      editor = vscode.window.activeTextEditor ?? editor;
      await snap();
      return { panel: !!panel };
    }),
    vscode.window.onDidChangeActiveTextEditor(e => { if (e) editor = e; }),
    vscode.window.onDidChangeTextEditorSelection(e => {
      if (e.textEditor.document.uri.scheme === "output") return;
      editor = e.textEditor;
      if (!panel?.visible || !config().get("liveUpdate", true) || e.selections[0].isEmpty || returnTo || snapKey(e.textEditor) === lastSnap) return;
      clearTimeout(timer);
      timer = setTimeout(() => snap(e.textEditor), 600);
    }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraSnap")) panel?.webview.postMessage({ type: "settings", settings: settings() }); }),
  );

  return {
    probe: () => new Promise(resolve => { probes.push(resolve); panel?.webview.postMessage({ type: "probe" }); }),
    save: () => new Promise<vscode.Uri>(resolve => { savedWaiters.push(resolve); panel?.webview.postMessage({ type: "saveNow" }); }),
    lastSaved: () => lastSaved,
    panelOpen: () => !!panel,
  };
}

export function deactivate() {}
