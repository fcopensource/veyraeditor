import * as vscode from "vscode";
import * as path from "node:path";
import type * as m from "./model";
import type { Index } from "./extension";

/* The Compare panel: every variable in a row, every env file in a column. Runs media/compare.js. */

interface Actions {
  mask(e: m.Entry): string;
  secret(e: m.Entry): boolean;
  add(uri: vscode.Uri, name: string, value: string): Promise<void>;
  open(uri: vscode.Uri, line: number): Thenable<unknown>;
}

export class ComparePanel {
  private static current?: ComparePanel;
  static show(context: vscode.ExtensionContext, index: Index, actions: Actions) {
    if (ComparePanel.current) { ComparePanel.current.panel.reveal(); ComparePanel.current.send(); return; }
    ComparePanel.current = new ComparePanel(context, index, actions);
  }

  private readonly panel: vscode.WebviewPanel;
  private subs: vscode.Disposable[] = [];
  private constructor(context: vscode.ExtensionContext, private index: Index, private actions: Actions) {
    this.panel = vscode.window.createWebviewPanel("veyraEnv.compare", "Compare Env Files", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    const media = (file: string) => this.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", file));
    const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
    this.panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource}; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${media("compare.css")}"></head>
<body data-logo="${media("icon.png")}"><div id="app"></div><script nonce="${nonce}" src="${media("compare.js")}"></script></body></html>`;
    this.subs.push(
      this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg)),
      index.onDidChange(() => this.send()),
      vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration("veyraEnv.hideValues") && this.send()),
    );
    this.panel.onDidDispose(() => { ComparePanel.current = undefined; this.subs.forEach(s => s.dispose()); });
  }

  /** The table: values are masked as in the editor; real values are sent only when a cell is revealed. */
  send() {
    const files = this.index.list();
    const keys = [...new Set(files.flatMap(f => f.parsed.entries.map(e => e.key)))];
    this.panel.webview.postMessage({
      type: "data",
      files: files.map(f => ({ id: f.uri.toString(), name: f.name, folder: vscode.workspace.asRelativePath(f.dir) === f.dir ? "" : path.dirname(vscode.workspace.asRelativePath(f.uri)), template: f.template, exposed: !f.template && (f.tracked || f.ignored === false) && f.parsed.entries.some(e => e.value) })),
      rows: keys.map(name => ({
        name,
        cells: files.map(f => {
          const e = f.parsed.entries.find(x => x.key === name);
          return e ? { set: true, empty: !e.value, shown: this.actions.mask(e), secret: this.actions.secret(e), line: e.line, hash: e.value ? hash(e.value) : "" } : { set: false };
        }),
      })),
    });
  }
  private async onMessage(msg: any) {
    const file = this.index.list().find(f => f.uri.toString() === msg.file);
    switch (msg.type) {
      case "ready": this.send(); break;
      case "reveal": {
        const e = file?.parsed.entries.find(x => x.key === msg.name);
        if (e) this.panel.webview.postMessage({ type: "revealed", file: msg.file, name: msg.name, value: e.value });
        break;
      }
      case "open": if (file) await this.actions.open(file.uri, msg.line ?? 0); break;
      case "add": {
        if (!file) break;
        const value = msg.withValue ? this.index.list().map(f => f.parsed.entries.find(x => x.key === msg.name)?.value).find(v => v) ?? "" : "";
        await this.actions.add(file.uri, msg.name, file.template ? "" : value);
        this.panel.webview.postMessage({ type: "toast", text: `Added ${msg.name} to ${file.name}` });
        break;
      }
      case "copy": {
        const e = file?.parsed.entries.find(x => x.key === msg.name);
        if (e) { await vscode.env.clipboard.writeText(e.value); this.panel.webview.postMessage({ type: "toast", text: `Copied ${msg.name}` }); }
        break;
      }
    }
  }
}
/** Lets the panel tell equal and different values apart without receiving them. */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
