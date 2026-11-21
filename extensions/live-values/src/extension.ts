/*
 * Veyra Live Values: console.log values, warnings, errors and crashes, right next to the line that printed them.
 *
 * How it works: the extension adds NODE_OPTIONS="--require runtime/hook.js" to VS Code's terminals (and Node debug
 * sessions). The hook records what your code prints, with its file and line, into a local file; the extension reads
 * that file and shows each value at the end of its line. 100% local: nothing is sent anywhere.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { Entry, Level, Store, ago, hoverMarkdown, inlineText, nodeOptions, parseChunk, runCommand, severity } from './model';

const ID = 'veyraLiveValues';
const TERMINAL = 'Live Values';
const cfg = () => vscode.workspace.getConfiguration(ID);
const COLORS: Record<Level, string> = {
  log: `${ID}.value`, info: `${ID}.value`, debug: `${ID}.value`, warn: `${ID}.warning`, error: `${ID}.error`, crash: `${ID}.error`,
};
const TREE_ICONS: Record<Level, [string, string]> = {
  log: ['debug-console', `${ID}.value`], info: ['info', `${ID}.value`], debug: ['debug', `${ID}.value`],
  warn: ['warning', 'editorWarning.foreground'], error: ['error', 'editorError.foreground'], crash: ['flame', 'editorError.foreground'],
};

export function activate(context: vscode.ExtensionContext) {
  const store = new Store();
  const hookPath = context.asAbsolutePath(path.join('runtime', 'hook.js'));

  // The file the hook writes to: one per VS Code window, in the system temp folder. Old ones are cleaned up.
  const dir = path.join(os.tmpdir(), 'veyra-live-values');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of safe(() => fs.readdirSync(dir), [] as string[])) {
    const file = path.join(dir, name);
    safe(() => { if (Date.now() - fs.statSync(file).mtimeMs > 86400000) fs.unlinkSync(file); }, undefined);
  }
  const logFile = path.join(dir, `${process.pid}-${crypto.randomBytes(4).toString('hex')}.jsonl`);
  fs.writeFileSync(logFile, '');
  context.subscriptions.push({ dispose: () => safe(() => fs.unlinkSync(logFile), undefined) });

  let paused = false;
  let inlineOn = cfg().get<boolean>('inline', true);
  const roots = () => (vscode.workspace.workspaceFolders ?? []).filter(f => f.uri.scheme === 'file').map(f => f.uri.fsPath);
  const env = (existing = ''): Record<string, string> => ({
    NODE_OPTIONS: nodeOptions(hookPath, existing), VEYRA_LIVE_FILE: logFile, VEYRA_LIVE_ROOTS: roots().join(path.delimiter),
  });

  // 1. Terminals: every new VS Code terminal runs Node with the hook.
  function applyEnv() {
    const collection = context.environmentVariableCollection;
    collection.clear();
    if (!cfg().get<boolean>('enabled', true)) return;
    collection.persistent = false;
    (collection as { description?: string }).description = 'Shows console.log values next to your code (Veyra Live Values)';
    const values = env();
    collection.replace('VEYRA_LIVE_FILE', values.VEYRA_LIVE_FILE);
    collection.replace('VEYRA_LIVE_ROOTS', values.VEYRA_LIVE_ROOTS);
    collection.prepend('NODE_OPTIONS', `--require ${JSON.stringify(hookPath)} `);
  }
  applyEnv();

  // 2. Node debug sessions (F5, launch.json) get the hook too.
  const debugProvider: vscode.DebugConfigurationProvider = {
    resolveDebugConfiguration(_folder, config) {
      if (!cfg().get<boolean>('enabled', true) || !cfg().get<boolean>('debugSessions', true)) return config;
      const existing = (config.env && typeof config.env.NODE_OPTIONS === 'string') ? config.env.NODE_OPTIONS : '';
      config.env = { ...(config.env ?? {}), ...env(existing) };
      return config;
    },
  };
  for (const type of ['node', 'pwa-node']) context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider(type, debugProvider));

  // 3. Read what the hook writes.
  let offset = 0, rest = '';
  let decoder = new StringDecoder('utf8');
  function poll(): number {
    let size: number;
    try { size = fs.statSync(logFile).size; } catch { return 0; }
    if (size < offset) { offset = 0; rest = ''; decoder = new StringDecoder('utf8'); }
    if (size === offset) return 0;
    const length = Math.min(size - offset, 4 * 1024 * 1024);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(logFile, 'r');
    let read = 0;
    try { read = fs.readSync(fd, buffer, 0, length, offset); } finally { fs.closeSync(fd); }
    offset += read;
    const { records, rest: tail } = parseChunk(rest + decoder.write(buffer.subarray(0, read)));
    rest = tail;
    let added = 0;
    if (!paused) {
      const clearOnRun = cfg().get<boolean>('clearOnNewRun', true);
      for (const r of records) { store.add(r, clearOnRun); added++; }
    }
    // Keep the file small: once everything is read and it has grown past 8 MB, start it again.
    if (offset === size && size > 8 * 1024 * 1024 && !rest) safe(() => { fs.truncateSync(logFile, 0); offset = 0; }, undefined);
    if (added) scheduleRender();
    return added;
  }
  const timer = setInterval(poll, 200);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // 4. Values at the end of their lines.
  const valueType = vscode.window.createTextEditorDecorationType({
    after: { margin: '0 0 0 2.5em', fontStyle: 'normal', fontWeight: 'normal' },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  const crashType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: new vscode.ThemeColor(`${ID}.crashBackground`),
    overviewRulerColor: new vscode.ThemeColor('editorError.foreground'), overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  context.subscriptions.push(valueType, crashType);

  type Shown = { line: number; text: string; level: Level };
  function decorationsFor(document: vscode.TextDocument): Shown[] {
    if (document.uri.scheme !== 'file' || !inlineOn || !cfg().get<boolean>('enabled', true)) return [];
    const max = Math.max(10, cfg().get<number>('maxLength', 120));
    return store.forFile(document.uri.fsPath).filter(e => e.line < document.lineCount).map(e => ({ line: e.line, text: inlineText(e, max), level: e.level }));
  }
  function render() {
    renderTimer = undefined;
    for (const editor of vscode.window.visibleTextEditors) {
      const shown = decorationsFor(editor.document);
      const values: vscode.DecorationOptions[] = shown.map(s => {
        const end = editor.document.lineAt(s.line).range.end;
        const e = store.at(editor.document.uri.fsPath, s.line)!;
        return {
          range: new vscode.Range(end, end), hoverMessage: hover(e),
          renderOptions: { after: { contentText: s.text, color: new vscode.ThemeColor(COLORS[s.level]) } },
        };
      });
      editor.setDecorations(valueType, values);
      editor.setDecorations(crashType, shown.filter(s => s.level === 'crash').map(s => editor.document.lineAt(s.line).range));
    }
    tree.refresh();
    updateStatus();
  }
  let renderTimer: NodeJS.Timeout | undefined;
  function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(render, 40); }

  const hover = (e: Entry) => {
    const md = new vscode.MarkdownString(hoverMarkdown(e));
    const arg = encodeURIComponent(JSON.stringify([{ file: e.file, line: e.line }]));
    md.appendMarkdown(`\n\n[Copy value](command:${ID}.copyValue?${arg}) · [Clear this line](command:${ID}.removeEntry?${arg}) · [Clear file](command:${ID}.clearFile?${arg})`);
    md.isTrusted = { enabledCommands: [`${ID}.copyValue`, `${ID}.removeEntry`, `${ID}.clearFile`] };
    return md;
  };
  // Hovering the code of a line that printed something shows its value too.
  context.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    provideHover(document, position) {
      if (!cfg().get<boolean>('enabled', true)) return undefined;
      const e = store.at(document.uri.fsPath, position.line);
      return e ? new vscode.Hover(hover(e), document.lineAt(position.line).range) : undefined;
    },
  }));

  // Values follow their lines while you edit.
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme !== 'file' || !event.contentChanges.length) return;
    const before = store.version;
    const changes = [...event.contentChanges].sort((a, b) => b.range.start.compareTo(a.range.start));
    for (const c of changes) store.shift(event.document.uri.fsPath, c.range.start.line, c.range.start.character, c.range.end.line, c.range.end.character, c.text);
    if (store.version !== before) scheduleRender();
  }));
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(scheduleRender));

  // 5. The Live Values view.
  const tree = new FeedTree(store);
  const view = vscode.window.createTreeView(`${ID}.feed`, { treeDataProvider: tree, showCollapseAll: true });
  context.subscriptions.push(view);

  // 6. Status bar.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = `${ID}.menu`;
  context.subscriptions.push(status);
  function updateStatus() {
    if (!cfg().get<boolean>('enabled', true) || !cfg().get<boolean>('statusBar', true)) { status.hide(); return; }
    const all = store.all();
    const crashes = all.filter(e => e.level === 'crash').length;
    const errors = all.filter(e => e.level === 'error').length;
    status.text = paused ? '$(debug-pause) Live paused' : `$(pulse) Live ${all.length}${crashes ? ` $(flame) ${crashes}` : errors ? ` $(error) ${errors}` : ''}`;
    status.tooltip = new vscode.MarkdownString(paused
      ? '**Veyra Live Values** is paused. Click to resume.'
      : `**Veyra Live Values**: ${all.length} line${all.length === 1 ? '' : 's'} printed values${crashes ? `, ${crashes} crash${crashes === 1 ? '' : 'es'}` : ''}${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}.\n\nRun Node.js in a VS Code terminal and console.log values appear next to your code. Click for options.`);
    status.backgroundColor = crashes ? new vscode.ThemeColor('statusBarItem.errorBackground') : undefined;
    status.show();
  }
  updateStatus();

  // 7. Commands.
  const terminalEnv = () => env();
  // The Live Values terminal for a folder: reused while it is open, so each run doesn't open another one.
  const terminals = new Map<vscode.Terminal, string>();
  context.subscriptions.push(vscode.window.onDidCloseTerminal(t => terminals.delete(t)));
  function liveTerminal(cwd: string): vscode.Terminal {
    for (const [t, dir] of terminals) if (dir === cwd && t.exitStatus === undefined) return t;
    const terminal = vscode.window.createTerminal({ name: TERMINAL, cwd, env: terminalEnv(), iconPath: new vscode.ThemeIcon('pulse') });
    terminals.set(terminal, cwd);
    return terminal;
  }
  const target = (arg?: { file: string; line: number }) => {
    if (arg && typeof arg.file === 'string') return store.at(arg.file, arg.line);
    const editor = vscode.window.activeTextEditor;
    return editor ? store.at(editor.document.uri.fsPath, editor.selection.active.line) : undefined;
  };
  const entryArg = (x: unknown): { file: string; line: number } | undefined => {
    if (x && typeof x === 'object' && 'entry' in x) { const e = (x as { entry: Entry }).entry; return { file: e.file, line: e.line }; }
    if (x && typeof x === 'object' && 'file' in x && 'line' in x) return x as { file: string; line: number };
    return undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(`${ID}.runFile`, async (uri?: vscode.Uri) => {
      const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
      if (!document || document.uri.scheme !== 'file') { vscode.window.showInformationMessage('Open a JavaScript or TypeScript file to run it with Live Values.'); return; }
      if (document.isDirty) await document.save();
      const file = document.uri.fsPath;
      const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? path.dirname(file);
      const hasTsx = fs.existsSync(path.join(folder, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'));
      const terminal = liveTerminal(folder);
      terminal.show(true);
      // Our terminal starts in the folder (and you could cd away, so a path outside it stays absolute).
      const relative = path.relative(folder, file);
      const shown = !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
      terminal.sendText(runCommand(shown, hasTsx));
    }),
    vscode.commands.registerCommand(`${ID}.newTerminal`, () => {
      vscode.window.createTerminal({ name: TERMINAL, env: terminalEnv(), iconPath: new vscode.ThemeIcon('pulse') }).show();
    }),
    vscode.commands.registerCommand(`${ID}.clear`, () => { store.clear(); render(); }),
    vscode.commands.registerCommand(`${ID}.clearFile`, (x?: unknown) => {
      const file = entryArg(x)?.file ?? (x instanceof vscode.Uri ? x.fsPath : undefined) ?? (x && typeof x === 'object' && 'file' in x ? String((x as { file: string }).file) : undefined) ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (file) { store.clear(file); render(); }
    }),
    vscode.commands.registerCommand(`${ID}.removeEntry`, (x?: unknown) => {
      const e = target(entryArg(x));
      if (e) { store.remove(e.file, e.line); render(); }
    }),
    vscode.commands.registerCommand(`${ID}.copyValue`, async (x?: unknown) => {
      const e = target(entryArg(x));
      if (!e) { vscode.window.showInformationMessage('This line has not printed anything yet.'); return; }
      await vscode.env.clipboard.writeText(e.full);
      vscode.window.setStatusBarMessage('$(check) Value copied', 2000);
    }),
    vscode.commands.registerCommand(`${ID}.reveal`, async (x?: unknown) => {
      const arg = entryArg(x);
      if (!arg) return;
      const editor = await vscode.window.showTextDocument(vscode.Uri.file(arg.file), { preview: true });
      const pos = new vscode.Position(Math.min(arg.line, editor.document.lineCount - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }),
    vscode.commands.registerCommand(`${ID}.toggleInline`, () => { inlineOn = !inlineOn; render(); }),
    vscode.commands.registerCommand(`${ID}.pause`, () => { paused = true; void vscode.commands.executeCommand('setContext', `${ID}.paused`, true); updateStatus(); }),
    vscode.commands.registerCommand(`${ID}.resume`, () => { paused = false; void vscode.commands.executeCommand('setContext', `${ID}.paused`, false); updateStatus(); }),
    vscode.commands.registerCommand(`${ID}.menu`, async () => {
      type Item = vscode.QuickPickItem & { run: string };
      const editor = vscode.window.activeTextEditor;
      const runnable = editor && /\.(m|c)?(j|t)sx?$/i.test(editor.document.fileName);
      const items: Item[] = [
        ...(runnable ? [{ label: '$(play) Run This File with Live Values', description: path.basename(editor!.document.fileName), run: `${ID}.runFile` }] : []),
        { label: '$(terminal) New Live Values Terminal', description: 'Run any Node.js command here', run: `${ID}.newTerminal` },
        { label: '$(list-flat) Show All Values', run: `${ID}.feed.focus` },
        paused ? { label: '$(debug-continue) Resume', run: `${ID}.resume` } : { label: '$(debug-pause) Pause', description: 'Stop collecting new values', run: `${ID}.pause` },
        { label: inlineOn ? '$(eye-closed) Hide Values in the Editor' : '$(eye) Show Values in the Editor', run: `${ID}.toggleInline` },
        { label: '$(clear-all) Clear All Values', run: `${ID}.clear` },
        { label: '$(gear) Settings', run: 'workbench.action.openSettings' },
      ];
      const pick = await vscode.window.showQuickPick(items, { title: 'Veyra Live Values' });
      if (pick) await vscode.commands.executeCommand(pick.run, ...(pick.run === 'workbench.action.openSettings' ? [ID] : []));
    }),
  );
  void vscode.commands.executeCommand('setContext', `${ID}.paused`, false);

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (!e.affectsConfiguration(ID)) return;
    if (e.affectsConfiguration(`${ID}.inline`)) inlineOn = cfg().get<boolean>('inline', true);
    applyEnv();
    render();
  }), vscode.workspace.onDidChangeWorkspaceFolders(applyEnv));

  // First run: say what to do.
  if (!context.globalState.get('welcomed') && cfg().get<boolean>('enabled', true)) {
    void context.globalState.update('welcomed', true);
    void vscode.window.showInformationMessage(
      'Veyra Live Values is on: run Node.js in a VS Code terminal and console.log values appear right next to your code. Terminals that were already open need a restart.',
      'Run This File', 'New Terminal',
    ).then(choice => {
      if (choice === 'Run This File') void vscode.commands.executeCommand(`${ID}.runFile`);
      else if (choice === 'New Terminal') void vscode.commands.executeCommand(`${ID}.newTerminal`);
    });
  }

  render();
  // For tests.
  return {
    store, logFile, hookPath, env, debugProvider, tree,
    poll: () => { const n = poll(); render(); return n; },
    decorations: (document: vscode.TextDocument) => decorationsFor(document),
    isPaused: () => paused,
  };
}

export function deactivate() { /* disposables clean up */ }

function safe<T>(run: () => T, fallback: T): T { try { return run(); } catch { return fallback; } }

type Node = { kind: 'file'; file: string; entries: Entry[] } | { kind: 'entry'; entry: Entry };

/** Every file that printed something, newest first, with each line's latest value. */
class FeedTree implements vscode.TreeDataProvider<Node> {
  private changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private shownVersion = -1;
  constructor(private store: Store) {}
  refresh() { if (this.store.version !== this.shownVersion) { this.shownVersion = this.store.version; this.changed.fire(undefined); } }

  getChildren(node?: Node): Node[] {
    if (!node) return this.store.fileList().map(f => ({ kind: 'file' as const, file: f.file, entries: f.entries }));
    if (node.kind === 'file') return node.entries.map(entry => ({ kind: 'entry' as const, entry }));
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'file') {
      const item = new vscode.TreeItem(vscode.Uri.file(node.file), vscode.TreeItemCollapsibleState.Expanded);
      const worst = node.entries.reduce((a, e) => Math.max(a, severity(e.level)), 0);
      const folder = vscode.workspace.asRelativePath(path.dirname(node.file));
      item.description = `${folder === path.dirname(node.file) ? '' : folder + ' · '}${node.entries.length} line${node.entries.length === 1 ? '' : 's'}${worst >= 4 ? ' · crashed' : worst === 3 ? ' · errors' : ''}`;
      item.contextValue = 'file';
      return item;
    }
    const e = node.entry;
    const item = new vscode.TreeItem(inlineText(e, 90).replace(/^\S+ /, ''), vscode.TreeItemCollapsibleState.None);
    item.description = `line ${e.line + 1} · ${ago(e.last)}`;
    const [icon, color] = TREE_ICONS[e.level];
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    const md = new vscode.MarkdownString(hoverMarkdown(e));
    item.tooltip = md;
    item.contextValue = 'entry';
    item.command = { command: `${ID}.reveal`, title: 'Go to Line', arguments: [{ file: e.file, line: e.line }] };
    return item;
  }
}
