import * as vscode from "vscode";
import * as path from "node:path";

/* Veyra Document Viewer: Word, PowerPoint, Excel and CSV files in a read-only custom editor. */

const config = () => vscode.workspace.getConfiguration("veyraDocs");

class DocumentViewer implements vscode.CustomReadonlyEditorProvider {
  /** Rendered documents, for the integration tests. */
  readonly rendered = new Map<string, string | undefined>();
  constructor(private context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument { return { uri, dispose: () => this.rendered.delete(uri.toString()) }; }

  async resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): Promise<void> {
    const uri = document.uri;
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
    const src = (f: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(media, f));
    // docx-preview adds <style> elements and data: URLs for images and fonts, so those are allowed; scripts are not.
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data: blob:; font-src ${panel.webview.cspSource} data: blob:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${src("viewer.css")}"></head>
<body><div id="app"><div class="loading">Opening…</div></div><script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;

    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case "ready": {
          const ext = path.extname(uri.path).slice(1).toLowerCase();
          let bytes: Uint8Array;
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            const limit = config().get<number>("maxFileSizeMB", 100) * 1024 * 1024;
            if (stat.size > limit) {
              const go = await vscode.window.showWarningMessage(`${path.basename(uri.path)} is ${(stat.size / 1048576).toFixed(0)} MB. Opening it may take a while.`, "Open Anyway");
              if (go !== "Open Anyway") { panel.dispose(); return; }
            }
            // A fresh copy: Node hands back a view into a shared buffer, which arrives in the webview empty.
            bytes = new Uint8Array(await vscode.workspace.fs.readFile(uri));
          } catch (error) {
            vscode.window.showErrorMessage(`Couldn't read ${path.basename(uri.path)}: ${(error as Error).message}`);
            return;
          }
          panel.webview.postMessage({ type: "open", file: path.basename(uri.path), ext, theme: config().get<string>("pageTheme", "paper"), bytes });
          break;
        }
        case "rendered": this.rendered.set(uri.toString(), msg.error); break;
        case "copy": await vscode.env.clipboard.writeText(String(msg.text ?? "")); panel.webview.postMessage({ type: "toast", text: "Copied the text" }); break;
        case "openDefault": await openInDefaultApp(uri); break;
        case "reveal": await vscode.commands.executeCommand("revealFileInOS", uri); break;
      }
    });
  }
}

async function openInDefaultApp(uri: vscode.Uri) {
  if (uri.scheme !== "file") { vscode.window.showInformationMessage("This file isn't on your computer, so it can't open in a desktop app."); return; }
  await vscode.env.openExternal(uri);
}

export function activate(context: vscode.ExtensionContext) {
  const viewer = new DocumentViewer(context);
  const options = { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: true };
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("veyraDocs.viewer", viewer, options),
    vscode.window.registerCustomEditorProvider("veyraDocs.table", viewer, options),
    vscode.commands.registerCommand("veyraDocs.openTable", (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) return vscode.commands.executeCommand("vscode.openWith", target, "veyraDocs.table");
      return undefined;
    }),
    vscode.commands.registerCommand("veyraDocs.openDefault", (uri?: vscode.Uri) => {
      const target = uri ?? (vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined)?.uri;
      return target ? openInDefaultApp(target) : undefined;
    }),
  );
  return { viewer }; // for the integration tests
}

export function deactivate() {}
