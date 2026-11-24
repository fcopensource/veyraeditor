import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { collected, EMPTY, onSave, PayState } from './pay';

const SAVE_KEY = 'neonGetaway.save';
const PAY_KEY = 'neonGetaway.pay';
const SOUND_KEY = 'neonGetaway.soundOn';

type FromGame =
  | { type: 'ready' }
  | { type: 'save'; save: unknown }
  | { type: 'paid'; amount: number }
  | { type: 'sound'; on: boolean };

let game: GamePanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'neonGetaway.play';
  const config = () => vscode.workspace.getConfiguration('neonGetaway');
  const pay = (): PayState => ({ ...EMPTY, ...context.globalState.get<PayState>(PAY_KEY) });

  const refreshStatus = () => {
    if (!config().get<boolean>('statusBar', true)) { status.hide(); return; }
    const pending = pay().pending;
    status.text = pending > 0 ? `$(rocket) +$${pending.toLocaleString('en')}` : '$(rocket) Neon Getaway';
    status.tooltip = pending > 0
      ? `Your code earned $${pending.toLocaleString('en')} in Neon Getaway. Click to spend it.`
      : 'Play Neon Getaway (Ctrl+Alt+G). Saving files earns you in-game cash.';
    status.show();
  };

  context.subscriptions.push(
    status,
    vscode.commands.registerCommand('neonGetaway.play', () => {
      if (game) { game.panel.reveal(); return; }
      game = new GamePanel(context, pay, async p => { await context.globalState.update(PAY_KEY, p); refreshStatus(); });
      game.panel.onDidDispose(() => { game = undefined; });
    }),
    vscode.commands.registerCommand('neonGetaway.reset', async () => {
      const ok = await vscode.window.showWarningMessage('Delete your Neon Getaway save? Your cash, cars and missions start over.', { modal: true }, 'Start over');
      if (ok !== 'Start over') return;
      await context.globalState.update(SAVE_KEY, undefined);
      game?.init();
      vscode.window.showInformationMessage('Neon Getaway: a fresh start in Solara Bay.');
    }),
    vscode.workspace.onDidSaveTextDocument(async doc => {
      if (!config().get<boolean>('paycheck', true) || doc.uri.scheme === 'vscode-userdata') return;
      const { state, paid } = onSave(pay(), new Date());
      await context.globalState.update(PAY_KEY, state);
      if (paid && game?.ready) game.sendPaycheck();
      refreshStatus();
    }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('neonGetaway')) refreshStatus(); }),
  );
  refreshStatus();

  // For the integration tests.
  return {
    isOpen: () => !!game,
    isReady: () => !!game?.ready,
    pending: () => pay().pending,
    save: () => context.globalState.get(SAVE_KEY),
    post: (m: unknown) => game?.panel.webview.postMessage(m),
  };
}

class GamePanel {
  readonly panel: vscode.WebviewPanel;
  ready = false;

  constructor(private context: vscode.ExtensionContext, private pay: () => PayState, private setPay: (p: PayState) => Promise<void>) {
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('neonGetaway', 'Neon Getaway', vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media],
    });
    this.panel.iconPath = vscode.Uri.joinPath(media, 'icon.png');
    const web = this.panel.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const src = (f: string) => web.asWebviewUri(vscode.Uri.joinPath(media, f));
    const csp = `default-src 'none'; img-src ${web.cspSource} data:; style-src ${web.cspSource}; font-src ${web.cspSource}; script-src 'nonce-${nonce}';`;
    web.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${src('game.css')}"><title>Neon Getaway</title></head>
<body><canvas id="game" tabindex="0" aria-label="Neon Getaway, a driving game. Use W A S D or the arrow keys to drive."></canvas>
<script nonce="${nonce}" src="${src('engine.js')}"></script><script nonce="${nonce}" src="${src('audio.js')}"></script><script nonce="${nonce}" src="${src('game.js')}"></script>
</body></html>`;
    web.onDidReceiveMessage(async (m: FromGame) => {
      if (m.type === 'ready') { this.ready = true; this.init(); }
      else if (m.type === 'save') await context.globalState.update(SAVE_KEY, m.save);
      else if (m.type === 'paid') await this.setPay(collected(this.pay(), m.amount));
      else if (m.type === 'sound') await context.globalState.update(SOUND_KEY, m.on);
    });
  }

  /** Load the save into the game, with any cash the player's code earned while they were away. */
  init() {
    const sound = vscode.workspace.getConfiguration('neonGetaway').get<boolean>('sound', true) && this.context.globalState.get<boolean>(SOUND_KEY) !== false;
    void this.panel.webview.postMessage({ type: 'init', save: this.context.globalState.get(SAVE_KEY) ?? null, paycheck: this.pay().pending, sound });
  }

  sendPaycheck() {
    const amount = this.pay().pending;
    if (amount > 0) void this.panel.webview.postMessage({ type: 'paycheck', amount });
  }
}

export function deactivate() {}
