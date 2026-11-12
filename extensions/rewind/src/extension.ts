/* Veyra Rewind: time travel for every file. Snapshots are taken on open, on save and while you type; the Rewind
   panel scrubs through them, plays the file's story back, and restores any version or block. */
import * as vscode from "vscode";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DEFAULT_EXCLUDE, REASON_LABEL, diffLines, findLines, hunks, isExcluded, lineSet, relativeTime, statsLabel, type Entry, type Reason } from "./model";
import { Store, hashText, type FileHistory } from "./store";

const SCHEME = "veyra-rewind";
let store: Store;
const panels = new Map<string, RewindPanel>();
const typingTimers = new Map<string, NodeJS.Timeout>();

const config = () => vscode.workspace.getConfiguration("veyraRewind");
const enabled = () => config().get<boolean>("enabled", true);
function applyLimits() {
  store.limits = {
    interval: Math.max(5, config().get<number>("captureInterval", 30)) * 1000,
    maxCount: Math.max(10, config().get<number>("maxSnapshotsPerFile", 500)),
    maxAgeDays: Math.max(1, config().get<number>("maxAgeDays", 30)),
    maxFileSize: Math.max(16, config().get<number>("maxFileSizeKB", 1024)) * 1024,
  };
}

/** The file a document belongs to, when Rewind should keep its history. */
function trackedPath(document: vscode.TextDocument): string | undefined {
  if (document.uri.scheme !== "file" || document.isUntitled) return undefined;
  const file = document.uri.fsPath;
  const relative = vscode.workspace.asRelativePath(document.uri, false);
  if (isExcluded(relative, [...DEFAULT_EXCLUDE, ...config().get<string[]>("exclude", [])])) return undefined;
  return file;
}

async function capture(document: vscode.TextDocument, reason: Reason, label?: string): Promise<Entry | undefined> {
  if (!enabled() && reason !== "checkpoint") return undefined;
  const file = trackedPath(document);
  if (!file) return undefined;
  const entry = await store.capture(file, document.getText(), reason, label).catch(() => undefined);
  if (entry) { panels.get(file)?.refresh(); updateStatus(); }
  return entry;
}

// ---------- Status bar ----------
let status: vscode.StatusBarItem;
async function updateStatus() {
  const document = vscode.window.activeTextEditor?.document;
  const file = document && trackedPath(document);
  if (!file || !enabled() || !config().get<boolean>("statusBar", true)) { status.hide(); return; }
  const count = (await store.history(file)).entries.length;
  status.text = `$(history) ${count}`;
  status.tooltip = count ? `Rewind: ${count} snapshot${count === 1 ? "" : "s"} of ${path.basename(file)}. Click to travel back in time.` : "Rewind: no history for this file yet";
  status.show();
}

// ---------- Snapshot documents (for VS Code's diff editor) ----------
const snapshotUri = (file: string, entry: Entry) =>
  vscode.Uri.from({ scheme: SCHEME, path: `/${entry.hash}/${path.basename(file)}`, query: new URLSearchParams({ t: String(entry.t) }).toString() });
class SnapshotProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri) { return store.read(uri.path.split("/")[1]); }
}

async function currentText(file: string): Promise<string | undefined> {
  const open = vscode.workspace.textDocuments.find(d => d.uri.scheme === "file" && d.uri.fsPath === file);
  if (open) return open.getText();
  try { return await fs.readFile(file, "utf8"); } catch { return undefined; }
}

async function compare(file: string, entry: Entry) {
  const exists = await currentText(file) !== undefined;
  const left = snapshotUri(file, entry);
  if (!exists) { await vscode.window.showTextDocument(left, { preview: true }); return; }
  await vscode.commands.executeCommand("vscode.diff", left, vscode.Uri.file(file),
    `${path.basename(file)}: ${relativeTime(entry.t, Date.now())} ↔ now`, { preview: true });
}

/** Puts a snapshot back into the file as one edit, so Ctrl+Z undoes the restore. Closed or deleted files are rewritten. */
async function restore(file: string, entry: Entry) {
  const text = await store.read(entry.hash);
  const open = vscode.workspace.textDocuments.find(d => d.uri.scheme === "file" && d.uri.fsPath === file);
  if (open) {
    await capture(open, "restore", undefined); // keep "just before the restore" in history too
    const edit = new vscode.WorkspaceEdit();
    edit.replace(open.uri, new vscode.Range(0, 0, open.lineCount, 0), text);
    await vscode.workspace.applyEdit(edit);
    await vscode.window.showTextDocument(open, { preview: false });
  } else {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");
    await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
  }
  vscode.window.setStatusBarMessage(`$(history) Restored ${path.basename(file)} to ${relativeTime(entry.t, Date.now())}. Ctrl+Z undoes it.`, 5000);
}

// ---------- The Rewind panel ----------
class RewindPanel {
  private selected = "";
  private constructor(readonly file: string, readonly panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
    panel.onDidDispose(() => panels.delete(file));
    panel.webview.onDidReceiveMessage(message => this.receive(message).catch(error => vscode.window.showErrorMessage(`Rewind: ${error?.message || error}`)));
    panel.webview.html = this.html();
  }
  static show(context: vscode.ExtensionContext, file: string, focus?: { id: string; line?: number }) {
    let current = panels.get(file);
    if (current) current.panel.reveal(vscode.ViewColumn.Beside);
    else {
      const panel = vscode.window.createWebviewPanel("veyraRewind.panel", `Rewind · ${path.basename(file)}`, vscode.ViewColumn.Beside, {
        enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
      current = new RewindPanel(file, panel, context);
      panels.set(file, current);
    }
    if (focus) current.selected = focus.id;
    void current.refresh(focus?.line);
    return current;
  }

  async refresh(focusLine?: number) {
    const history = await store.history(this.file);
    const now = Date.now();
    const exists = await currentText(this.file) !== undefined;
    const entries = history.entries.map(e => ({ id: e.id, t: e.t, when: relativeTime(e.t, now), reason: REASON_LABEL[e.reason], label: e.label || "", stats: statsLabel(e), added: e.added, removed: e.removed, lines: e.lines }));
    if (!entries.some(e => e.id === this.selected)) this.selected = entries.at(-1)?.id || "";
    await this.panel.webview.postMessage({ type: "history", file: this.file, name: path.basename(this.file), exists, entries, selected: this.selected });
    if (this.selected) await this.show(this.selected, focusLine);
  }

  private async show(id: string, focusLine?: number) {
    const entry = (await store.history(this.file)).entries.find(e => e.id === id);
    if (!entry) return;
    this.selected = id;
    const then = await store.read(entry.hash), now = await currentText(this.file) ?? "";
    const ops = diffLines(then, now);
    const same = hashText(now) === entry.hash;
    await this.panel.webview.postMessage({
      type: "snapshot", id, same, lines: then.split(/\r?\n/), focusLine,
      hunks: hunks(ops, 3).map(h => ({ oldStart: h.oldStart, newStart: h.newStart, ops: h.ops.map(o => ({ k: o.kind[0], t: o.text, o: o.oldLine, n: o.newLine })) })),
    });
  }

  private async receive(message: { type: string; id?: string; label?: string; text?: string }) {
    const entry = message.id ? (await store.history(this.file)).entries.find(e => e.id === message.id) : undefined;
    switch (message.type) {
      case "ready": return this.refresh();
      case "select": return message.id ? this.show(message.id) : undefined;
      case "restore": if (entry) await restore(this.file, entry); return this.refresh();
      case "compare": return entry ? compare(this.file, entry) : undefined;
      case "copy": if (entry) { await vscode.env.clipboard.writeText(await store.read(entry.hash)); vscode.window.setStatusBarMessage("$(copy) Copied that version of the file", 3000); } return;
      case "copyText": if (message.text) { await vscode.env.clipboard.writeText(message.text); vscode.window.setStatusBarMessage("$(copy) Copied", 3000); } return;
      case "label": {
        if (!entry) return;
        const label = await vscode.window.showInputBox({ title: "Name this snapshot", prompt: "A named snapshot is a checkpoint: it's kept forever. Leave empty to remove the name.", value: entry.label || "", placeHolder: "Before the big refactor" });
        if (label === undefined) return;
        await store.rename(this.file, entry.id, label.trim() || undefined);
        return this.refresh();
      }
      case "checkpoint": await vscode.commands.executeCommand("veyraRewind.checkpoint", vscode.Uri.file(this.file)); return this.refresh();
    }
  }

  private html() {
    const webview = this.panel.webview;
    const media = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", name));
    const nonce = [...Array(24)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${media("rewind.css")}"><title>Rewind</title></head>
<body><div id="app" aria-live="polite"></div><script nonce="${nonce}" src="${media("rewind.js")}"></script></body></html>`;
  }
}

// ---------- Commands ----------
function fileFrom(arg?: vscode.Uri): string | undefined {
  if (arg instanceof vscode.Uri && arg.scheme === "file") return arg.fsPath;
  const document = vscode.window.activeTextEditor?.document;
  return document && document.uri.scheme === "file" ? document.uri.fsPath : undefined;
}

async function pickSnapshot(file: string, title: string): Promise<Entry | undefined> {
  const entries = [...(await store.history(file)).entries].reverse(), now = Date.now();
  if (!entries.length) { vscode.window.showInformationMessage(`Rewind has no history for ${path.basename(file)} yet. It's saved as you edit and save.`); return undefined; }
  const pick = await vscode.window.showQuickPick(entries.map(e => ({
    label: `${e.label ? "$(bookmark) " + e.label + " · " : ""}${relativeTime(e.t, now)}`, description: `${REASON_LABEL[e.reason]} · ${statsLabel(e)}`, detail: `${e.lines} lines · ${new Date(e.t).toLocaleString()}`, entry: e,
  })), { title, placeHolder: "Pick a moment in this file's history", matchOnDescription: true });
  return pick?.entry;
}

/** "Find Deleted Code": text that was in a file's history but isn't in the file today. */
async function findDeleted(context: vscode.ExtensionContext) {
  const query = await vscode.window.showInputBox({ title: "Rewind: Find Deleted Code", prompt: "Search everything you ever had in a file, but deleted. Case-insensitive unless you type capitals.", placeHolder: "calculateTotal" });
  if (!query?.trim()) return;
  type Item = vscode.QuickPickItem & { file: string; entry: Entry; line: number };
  const items = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Rewind: searching history for “${query}”…` }, async () => {
    const found: Item[] = [], now = Date.now();
    for (const history of await store.all()) {
      const current = await currentText(history.path);
      const still = current === undefined ? new Set<string>() : lineSet(current);
      const seen = new Set<string>();
      for (const entry of [...history.entries].reverse()) {
        const text = await store.read(entry.hash).catch(() => "");
        for (const hit of findLines(text, query.trim(), still, 30)) {
          const key = hit.text.trim();
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ label: key.length > 120 ? key.slice(0, 117) + "…" : key, description: `${path.basename(history.path)}:${hit.line} · ${relativeTime(entry.t, now)}`,
            detail: current === undefined ? `${vscode.workspace.asRelativePath(history.path)} (file deleted)` : vscode.workspace.asRelativePath(history.path), file: history.path, entry, line: hit.line });
        }
        if (found.length >= 300) break;
      }
      if (found.length >= 300) break;
    }
    return found;
  });
  if (!items.length) { vscode.window.showInformationMessage(`Rewind found no deleted code matching “${query}”. Code that's still in its file isn't listed.`); return; }
  const pick = await vscode.window.showQuickPick(items, { title: `Deleted code matching “${query}” (${items.length})`, matchOnDescription: true, matchOnDetail: true });
  if (pick) RewindPanel.show(context, pick.file, { id: pick.entry.id, line: pick.line });
}

async function restoreDeletedFile() {
  type Item = vscode.QuickPickItem & { history: FileHistory };
  const items: Item[] = [], now = Date.now();
  for (const history of await store.all()) {
    if (await currentText(history.path) !== undefined) continue;
    const last = history.entries.at(-1)!;
    items.push({ label: path.basename(history.path), description: `deleted · last seen ${relativeTime(last.t, now)}`, detail: vscode.workspace.asRelativePath(history.path), history });
  }
  if (!items.length) { vscode.window.showInformationMessage("Rewind has no deleted files to bring back."); return; }
  const pick = await vscode.window.showQuickPick(items, { title: "Rewind: Restore a Deleted File", matchOnDetail: true });
  if (!pick) return;
  const latest = [...pick.history.entries].reverse().find(e => e.reason !== "delete") ?? pick.history.entries.at(-1)!;
  await restore(pick.history.path, latest);
}

export function activate(context: vscode.ExtensionContext) {
  store = new Store(path.join(context.globalStorageUri.fsPath, "history"));
  applyLimits();
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  status.command = "veyraRewind.open";
  context.subscriptions.push(status, vscode.workspace.registerTextDocumentContentProvider(SCHEME, new SnapshotProvider()));

  const register = (id: string, run: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, run));
  register("veyraRewind.open", (uri?: vscode.Uri) => {
    const file = fileFrom(uri);
    if (!file) { vscode.window.showInformationMessage("Open a file to see its history."); return; }
    const document = vscode.workspace.textDocuments.find(d => d.uri.fsPath === file);
    if (document) void capture(document, "edit");
    return RewindPanel.show(context, file);
  });
  register("veyraRewind.checkpoint", async (uri?: vscode.Uri) => {
    const file = fileFrom(uri);
    const document = file && vscode.workspace.textDocuments.find(d => d.uri.scheme === "file" && d.uri.fsPath === file);
    if (!document) { vscode.window.showInformationMessage("Open a file to take a checkpoint."); return; }
    const label = await vscode.window.showInputBox({ title: "Take a checkpoint", prompt: "A named snapshot you can always come back to. It's never cleaned up.", placeHolder: "Before the big refactor" });
    if (label === undefined) return;
    const entry = await capture(document, "checkpoint", label.trim() || "Checkpoint");
    if (entry) vscode.window.setStatusBarMessage(`$(bookmark) Checkpoint “${entry.label}” saved`, 4000);
    else vscode.window.showWarningMessage("Rewind can't keep history for this file (it's excluded, too large or binary).");
  });
  register("veyraRewind.compare", async (uri?: vscode.Uri) => {
    const file = fileFrom(uri); if (!file) return;
    const entry = await pickSnapshot(file, `Compare ${path.basename(file)} with…`);
    if (entry) await compare(file, entry);
  });
  register("veyraRewind.restore", async (uri?: vscode.Uri) => {
    const file = fileFrom(uri); if (!file) return;
    const entry = await pickSnapshot(file, `Restore ${path.basename(file)} to…`);
    if (entry) await restore(file, entry);
  });
  register("veyraRewind.findDeleted", () => findDeleted(context));
  register("veyraRewind.restoreDeletedFile", restoreDeletedFile);
  register("veyraRewind.clearFile", async (uri?: vscode.Uri) => {
    const file = fileFrom(uri); if (!file) return;
    const answer = await vscode.window.showWarningMessage(`Delete all Rewind history for ${path.basename(file)}? Checkpoints go too. This can't be undone.`, { modal: true }, "Delete History");
    if (answer !== "Delete History") return;
    await store.clear(file); panels.get(file)?.panel.dispose(); void updateStatus();
  });
  register("veyraRewind.showStorage", async () => {
    const [files, bytes] = [await store.all(), await store.size()];
    const snapshots = files.reduce((n, f) => n + f.entries.length, 0);
    const choice = await vscode.window.showInformationMessage(`Rewind keeps ${snapshots} snapshots of ${files.length} files in ${(bytes / 1048576).toFixed(1)} MB, only on this computer.`, "Open Folder");
    if (choice) await vscode.env.openExternal(vscode.Uri.file(store.dir));
  });

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => void capture(document, "open")),
    vscode.workspace.onDidSaveTextDocument(document => void capture(document, "save")),
    vscode.workspace.onDidChangeTextDocument(event => {
      const document = event.document, file = trackedPath(document);
      if (!file || !event.contentChanges.length) return;
      clearTimeout(typingTimers.get(file));
      // A pause in typing: keep what's there, at most once per capture interval.
      typingTimers.set(file, setTimeout(() => { typingTimers.delete(file); void capture(document, "edit"); }, 2000));
    }),
    vscode.workspace.onWillDeleteFiles(event => event.waitUntil((async () => {
      for (const uri of event.files) {
        const text = await currentText(uri.fsPath);
        if (text !== undefined && uri.scheme === "file") await store.capture(uri.fsPath, text, "delete").catch(() => undefined);
      }
    })())),
    vscode.workspace.onDidRenameFiles(event => { for (const { oldUri, newUri } of event.files) if (oldUri.scheme === "file" && newUri.scheme === "file") void store.move(oldUri.fsPath, newUri.fsPath); }),
    vscode.window.onDidChangeActiveTextEditor(() => void updateStatus()),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration("veyraRewind")) { applyLimits(); void updateStatus(); } }),
    { dispose: () => typingTimers.forEach(timer => clearTimeout(timer)) },
  );
  for (const document of vscode.workspace.textDocuments) void capture(document, "open");
  void updateStatus();
  setTimeout(() => void store.collect(), 60_000).unref?.();
  return { store, panels };
}

export function deactivate() {}
