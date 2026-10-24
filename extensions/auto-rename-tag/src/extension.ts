import * as vscode from "vscode";
import { pairedEdit, type Change } from "./model";

/* Auto Rename Tag Veyra: when a tag's name changes, the paired tag changes with it, in the same undo step. */

const config = () => vscode.workspace.getConfiguration("veyraRename");
/** Languages where tags are JSX: names are case-sensitive and there are no raw-text elements like <script>. */
const JSX = new Set(["javascriptreact", "typescriptreact", "javascript", "typescript", "mdx"]);

export function activate(context: vscode.ExtensionContext) {
  /** Each document's text after the last change, so an edit can be read against what was there before. */
  const before = new Map<string, string>();
  /** Edits this extension made, so their change events aren't treated as typing. */
  const ours = new Map<string, Change[]>();

  const enabled = (doc: vscode.TextDocument) => {
    const c = config();
    if (!c.get("enabled", true)) return false;
    const langs = c.get<string[]>("languages", []);
    return (langs.includes("*") || langs.includes(doc.languageId)) && doc.getText().length <= c.get<number>("maxFileSize", 2000000);
  };
  const remember = (doc: vscode.TextDocument) => { if (enabled(doc)) before.set(doc.uri.toString(), doc.getText()); else before.delete(doc.uri.toString()); };
  vscode.workspace.textDocuments.forEach(remember);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(remember),
    vscode.workspace.onDidCloseTextDocument(doc => { before.delete(doc.uri.toString()); ours.delete(doc.uri.toString()); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraRename")) vscode.workspace.textDocuments.forEach(remember); }),
    vscode.workspace.onDidChangeTextDocument(async e => {
      const doc = e.document, key = doc.uri.toString();
      const old = before.get(key);
      if (old === undefined) { remember(doc); return; }
      before.set(key, doc.getText());
      if (!e.contentChanges.length) return;
      // Our own rename coming back: let it through.
      const pending = ours.get(key);
      const [c] = e.contentChanges;
      if (pending?.length && e.contentChanges.length === 1 && pending[0].offset === c.rangeOffset && pending[0].text === c.text) { pending.shift(); return; }
      // Only plain typing: one change, not undo or redo. (Several changes at once means multiple cursors or another tool, like VS Code's linked editing.)
      if (e.reason !== undefined || e.contentChanges.length !== 1 || !enabled(doc)) return;
      const paired = pairedEdit(old, { offset: c.rangeOffset, length: c.rangeLength, text: c.text }, !JSX.has(doc.languageId));
      if (!paired) return;
      const range = new vscode.Range(doc.positionAt(paired.offset), doc.positionAt(paired.offset + paired.length));
      const list = ours.get(key) ?? [];
      list.push(paired);
      ours.set(key, list);
      const editor = vscode.window.visibleTextEditors.find(ed => ed.document === doc);
      // Joined to the typing's undo step, so one undo puts both tags back.
      const done = editor
        ? await editor.edit(b => b.replace(range, paired.text), { undoStopBefore: false, undoStopAfter: false })
        : await (() => { const w = new vscode.WorkspaceEdit(); w.replace(doc.uri, range, paired.text); return vscode.workspace.applyEdit(w); })();
      if (!done) { const i = list.indexOf(paired); if (i >= 0) list.splice(i, 1); } // the document moved on first; nothing was changed
    }),
    vscode.commands.registerCommand("veyraRename.toggle", async () => {
      const on = !config().get("enabled", true);
      await config().update("enabled", on, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(`Auto Rename Tag Veyra: ${on ? "on" : "off"}`, 2500);
    }),
  );
  return { before }; // for the integration tests
}

export function deactivate() {}
