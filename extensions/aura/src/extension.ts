/*
 * Veyra Aura: your coding aura. Earn aura for clearing errors, clean saves, commits, passing tests and builds,
 * deleting code and staying locked in; lose a little for "wip" commit messages, failing tests and force pushes.
 * Ranks from NPC to Final Boss, a daily streak, and an aura card to share. Everything stays on your computer.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import {
  AuraEvent, AuraState, MoveId, Rank, activeMinute, award, caption, classifyCommand, emptyState, fmt, hasDebugger,
  isNight, judgeCommitMessage, lastWeek, liveStreak, rankFor, signed, topMoves, dayKey, RANKS,
} from './model';

const ID = 'veyraAura';
const STATE_KEY = 'veyraAura.state';
const cfg = () => vscode.workspace.getConfiguration(ID);

export function activate(context: vscode.ExtensionContext) {
  let state: AuraState = { ...emptyState(), ...(context.globalState.get<AuraState>(STATE_KEY) ?? {}) };
  const opts = { errorAgeMs: 10000, now: () => Date.now() };
  const now = () => opts.now();
  const enabled = () => cfg().get<boolean>('enabled', true);
  const save = () => void context.globalState.update(STATE_KEY, state);

  // ---------- Giving aura ----------
  function give(id: MoveId, vars: Record<string, string | number> = {}, key?: string): AuraEvent[] {
    if (!enabled()) return [];
    const result = award(state, id, now(), vars, { roast: cfg().get<boolean>('roast', true), key });
    if (!result.events.length) return [];
    state = result.state;
    save();
    flash(result.events);
    if (result.rankUp) void rankUp(result.rankUp);
    panel?.update();
    return result.events;
  }

  // ---------- Status bar ----------
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
  status.command = `${ID}.open`;
  context.subscriptions.push(status);
  let flashUntil = 0;
  function renderStatus() {
    if (!enabled() || !cfg().get<boolean>('statusBar', true)) { status.hide(); return; }
    if (now() < flashUntil) return;
    const { rank, next, progress } = rankFor(state.total);
    const streak = liveStreak(state, now());
    status.text = `$(sparkle) ${fmt(state.total)} aura${streak >= 2 ? ` 🔥${streak}` : ''}`;
    status.tooltip = new vscode.MarkdownString(
      `**${rank.emoji} ${rank.name}** · ${fmt(state.total)} aura\n\n${rank.vibe}\n\n` +
      (next ? `${Math.round(progress * 100)}% of the way to **${next.emoji} ${next.name}** (${fmt(next.min)})\n\n` : 'Max rank. Respect.\n\n') +
      `Today: **${signed(state.days[dayKey(now())] ?? 0)}**${streak >= 2 ? ` · 🔥 ${streak}-day streak` : ''}\n\nClick to open your aura.`);
    status.backgroundColor = undefined;
    status.show();
  }
  function flash(events: AuraEvent[]) {
    if (!cfg().get<boolean>('statusBar', true)) return;
    const total = events.reduce((s, e) => s + e.aura, 0);
    const main = events[events.length - 1];
    status.text = `$(sparkle) ${signed(total)} aura ${main.emoji}`;
    status.tooltip = events.map(e => `${e.emoji} ${signed(e.aura)} · ${e.text}`).join('\n');
    status.backgroundColor = total < 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    status.show();
    flashUntil = now() + 3500;
    setTimeout(renderStatus, 3600);
    if (cfg().get<string>('notifications', 'rankUps') === 'all') {
      for (const e of events) if (Math.abs(e.aura) >= 10) void vscode.window.showInformationMessage(`${e.emoji} ${signed(e.aura)} aura · ${e.text}`);
    }
  }
  async function rankUp(rank: Rank) {
    if (cfg().get<string>('notifications', 'rankUps') === 'off') return;
    const choice = await vscode.window.showInformationMessage(`${rank.emoji} Rank up! You're ${rank.name} now. ${rank.vibe}`, 'Share Aura Card', 'Open Aura');
    if (choice === 'Share Aura Card') void vscode.commands.executeCommand(`${ID}.share`);
    else if (choice === 'Open Aura') void vscode.commands.executeCommand(`${ID}.open`);
  }

  // ---------- Signals ----------
  // 1. Clearing every error in a file (errors that stuck around for a bit, not a half-typed line).
  const errors = new Map<string, { count: number; since: number }>();
  const errorCount = (uri: vscode.Uri) => vscode.languages.getDiagnostics(uri).filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(event => {
    for (const uri of event.uris) {
      if (uri.scheme !== 'file') continue;
      const key = uri.toString(), n = errorCount(uri), seen = errors.get(key);
      if (n > 0) { if (!seen) errors.set(key, { count: n, since: now() }); else seen.count = Math.max(seen.count, n); continue; }
      if (!seen) continue;
      errors.delete(key);
      const open = vscode.workspace.textDocuments.some(d => d.uri.toString() === key);
      if (open && now() - seen.since >= opts.errorAgeMs) give('clearedErrors', { file: path.basename(uri.fsPath), n: seen.count });
    }
  }));

  // 2. Saves: clean saves, big deletes, and a leftover debugger.
  const lineCounts = new Map<string, number>();
  const remember = (d: vscode.TextDocument) => { if (d.uri.scheme === 'file') lineCounts.set(d.uri.toString(), d.lineCount); };
  vscode.workspace.textDocuments.forEach(remember);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(remember));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(d => {
    if (d.uri.scheme !== 'file') return;
    const file = path.basename(d.uri.fsPath);
    const before = lineCounts.get(d.uri.toString());
    lineCounts.set(d.uri.toString(), d.lineCount);
    if (before !== undefined && before - d.lineCount >= 50) give('deletedLines', { n: before - d.lineCount, file });
    if (/^(javascript|typescript)(react)?$/.test(d.languageId) && hasDebugger(d.getText())) give('debuggerLeft', { file }, d.uri.fsPath);
    else if (errorCount(d.uri) === 0) give('cleanSave');
  }));

  // 3. Typing: every 25 minutes with edits is a locked-in session; after midnight you're a night owl.
  let lastMinute = -1;
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.uri.scheme !== 'file' || !event.contentChanges.length || !enabled()) return;
    if (vscode.window.activeTextEditor?.document !== event.document) return; // your typing, not a formatter in the background
    const minute = Math.floor(now() / 60000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    const r = activeMinute(state, now());
    state = r.state;
    save();
    if (r.lockedIn) give('lockedIn');
    if (isNight(now())) give('nightOwl');
  }));

  // 4. Commits, from VS Code's Git: any new commit, however it was made.
  function onCommit(message: string) {
    give('commit');
    const verdict = judgeCommitMessage(message);
    if (verdict === 'good') give('goodCommitMessage');
    else if (verdict === 'bad') give('badCommitMessage', { msg: message.trim().split('\n')[0].slice(0, 30) });
  }
  void (async () => {
    try {
      const git = vscode.extensions.getExtension<{ getAPI(v: 1): GitAPI }>('vscode.git');
      if (!git) return;
      const api = (git.isActive ? git.exports : await git.activate()).getAPI(1);
      const watch = (repo: Repository) => {
        let head = repo.state.HEAD?.commit;
        context.subscriptions.push(repo.state.onDidChange(async () => {
          const next = repo.state.HEAD?.commit;
          if (!next || next === head) return;
          const previous = head;
          head = next;
          if (!previous) return;
          try { const c = await repo.getCommit(next); if (c.parents?.[0] === previous) onCommit(c.message); } catch { /* not readable */ }
        }));
      };
      api.repositories.forEach(watch);
      context.subscriptions.push(api.onDidOpenRepository(watch));
    } catch { /* no git */ }
  })();

  // 5. Terminal commands (VS Code 1.93+ with shell integration): tests, builds and force pushes.
  function onCommand(commandLine: string, exitCode: number | undefined) {
    if (exitCode === undefined) return;
    const kind = classifyCommand(commandLine);
    if (kind === 'test') give(exitCode === 0 ? 'testsPassed' : 'testsFailed');
    else if (kind === 'build') give(exitCode === 0 ? 'buildPassed' : 'buildFailed');
    else if (kind === 'forcePush' && exitCode === 0) give('forcePush');
  }
  const shellEnd = (vscode.window as unknown as { onDidEndTerminalShellExecution?: vscode.Event<{ execution: { commandLine: { value: string } }; exitCode: number | undefined }> }).onDidEndTerminalShellExecution;
  if (shellEnd) context.subscriptions.push(shellEnd(e => onCommand(e.execution.commandLine.value, e.exitCode)));
  // ...and tasks (Run Task, npm scripts in the Explorer).
  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(e => {
    const task = e.execution.task;
    if (e.exitCode === undefined) return;
    if (task.group === vscode.TaskGroup.Test) give(e.exitCode === 0 ? 'testsPassed' : 'testsFailed');
    else if (task.group === vscode.TaskGroup.Build) give(e.exitCode === 0 ? 'buildPassed' : 'buildFailed');
    else onCommand(task.name.replace(/^npm: /, 'npm run '), e.exitCode);
  }));

  // ---------- The Aura panel ----------
  let panel: AuraPanel | undefined;
  let savePathForTest: string | undefined;
  const snapshot = () => {
    const t = now();
    const { rank, next, progress } = rankFor(state.total);
    return {
      total: state.total, totalText: fmt(state.total), rank, next, progress, ranks: RANKS, streak: liveStreak(state, t), bestStreak: state.bestStreak,
      today: state.days[dayKey(t)] ?? 0, week: lastWeek(state, t), top: topMoves(state, t),
      events: state.events.slice(-40).reverse().map(e => ({ ...e, ago: ago(e.t, t) })), caption: caption(state, t), roast: cfg().get<boolean>('roast', true),
    };
  };
  async function saveCard(dataUrl: string) {
    const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    let target = savePathForTest ? vscode.Uri.file(savePathForTest) : undefined;
    if (!target) {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
      target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(folder, 'my-aura-card.png'), filters: { 'PNG image': ['png'] }, title: 'Save your aura card' });
    }
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, png);
    await vscode.env.clipboard.writeText(caption(state, now()));
    if (savePathForTest) return;
    const choice = await vscode.window.showInformationMessage('Aura card saved, and the caption is copied. Post it! 📸', 'Open Card');
    if (choice === 'Open Card') await vscode.commands.executeCommand('vscode.open', target);
  }
  function openPanel(card = false) {
    if (!panel) {
      panel = new AuraPanel(context, snapshot, async msg => {
        if (msg.type === 'card' && typeof msg.png === 'string') await saveCard(msg.png);
        else if (msg.type === 'caption') { await vscode.env.clipboard.writeText(caption(state, now())); vscode.window.setStatusBarMessage('$(check) Caption copied', 2500); }
      }, () => { panel = undefined; });
    } else panel.reveal();
    if (card) panel.makeCard();
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(`${ID}.open`, () => openPanel()),
    vscode.commands.registerCommand(`${ID}.share`, () => openPanel(true)),
    vscode.commands.registerCommand(`${ID}.copyCaption`, async () => { await vscode.env.clipboard.writeText(caption(state, now())); vscode.window.setStatusBarMessage('$(check) Caption copied', 2500); }),
    vscode.commands.registerCommand(`${ID}.reset`, async () => {
      const ok = await vscode.window.showWarningMessage('Reset your aura to 0? Your rank, streak and history go too.', { modal: true }, 'Reset');
      if (ok !== 'Reset') return;
      state = emptyState(); save(); renderStatus(); panel?.update();
    }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration(ID)) { renderStatus(); panel?.update(); } }),
  );
  renderStatus();
  const tick = setInterval(renderStatus, 60000);
  context.subscriptions.push({ dispose: () => clearInterval(tick) });

  // For tests.
  return {
    state: () => state, give, onCommit, onCommand, options: opts, snapshot,
    panel: () => panel, setSavePath: (p: string | undefined) => { savePathForTest = p; },
    statusText: () => status.text,
  };
}

export function deactivate() { /* disposables clean up */ }

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The parts of VS Code's Git extension API that Aura uses.
interface Commit { hash: string; message: string; parents: string[] }
interface Repository { state: { HEAD?: { commit?: string }; onDidChange: vscode.Event<void> }; getCommit(ref: string): Promise<Commit> }
interface GitAPI { repositories: Repository[]; onDidOpenRepository: vscode.Event<Repository> }

type Message = { type: string; png?: string };

/** The Aura webview: your aura, rank, streak, week, feed, and the aura card. */
class AuraPanel {
  private panel: vscode.WebviewPanel;
  private ready = false;
  private pendingCard = false;
  /** For tests: the last state the webview confirmed it rendered. */
  rendered: { total?: number } = {};

  constructor(context: vscode.ExtensionContext, private snapshot: () => unknown, onMessage: (m: Message) => Promise<void>, onClose: () => void) {
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('veyraAura', 'Your Aura', vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [media] });
    this.panel.iconPath = vscode.Uri.joinPath(media, 'icon.png');
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
    const js = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
    const csp = `default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src ${this.panel.webview.cspSource}; font-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';`;
    this.panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"><title>Your Aura</title></head><body><main id="app" aria-live="polite"></main><script nonce="${nonce}" src="${js}"></script></body></html>`;
    this.panel.webview.onDidReceiveMessage(async (m: Message & { total?: number }) => {
      if (m.type === 'ready') { this.ready = true; this.update(); if (this.pendingCard) { this.pendingCard = false; void this.panel.webview.postMessage({ type: 'makeCard' }); } return; }
      if (m.type === 'rendered') { this.rendered = { total: m.total }; return; }
      await onMessage(m);
    });
    this.panel.onDidDispose(onClose);
  }
  reveal() { this.panel.reveal(); }
  update() { if (this.ready) void this.panel.webview.postMessage({ type: 'state', data: this.snapshot() }); }
  makeCard() { if (this.ready) void this.panel.webview.postMessage({ type: 'makeCard' }); else this.pendingCard = true; }
  dispose() { this.panel.dispose(); }
}

