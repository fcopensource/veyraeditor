import * as vscode from "vscode";
import { chooseNextSeed, codeMinute, commit, evaporate, fixed, newGarden, pressedTotal, random, repair, save, SPECIES, species, stageOf, type Event, type Garden, type SpeciesId } from "./model";

/* Code Garden Veyra: a garden that grows with your coding, in a webview (the Explorer and a bigger panel).
   It's kept in VS Code's global state, synced between your machines with Settings Sync. */

const KEY = "veyraGarden.garden";
const config = () => vscode.workspace.getConfiguration("veyraGarden");
const rnd = random();
/** Typing within this long counts the current minute as a coding minute. */
const ACTIVE_WINDOW_MS = 90_000;

export function activate(context: vscode.ExtensionContext) {
  let garden: Garden = repair(context.globalState.get(KEY), Date.now(), rnd);
  evaporate(garden, Date.now());
  context.globalState.setKeysForSync([KEY]);

  const webviews = new Set<vscode.Webview>();
  const broadcast = (message: unknown) => { for (const w of webviews) w.postMessage(message); };
  const settings = () => ({ sky: config().get<string>("sky", "auto") });
  const sendGarden = () => broadcast({ type: "garden", garden, settings: settings() });

  const persist = () => context.globalState.update(KEY, garden);
  /** Applies a change, saves, refreshes every view and the status bar, and tells you about anything worth knowing. */
  const apply = (events: Event[]) => {
    persist();
    sendGarden();
    if (events.length) broadcast({ type: "events", events });
    updateStatus();
    announce(events);
  };

  // ---------- Status bar ----------
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = "veyraGarden.view.focus";
  context.subscriptions.push(status);
  function updateStatus() {
    if (!config().get("statusBar", true)) { status.hide(); return; }
    const blooms = garden.plants.filter(p => stageOf(p) >= 4).length;
    status.text = `$(flame) ${garden.streak.days} · $(heart) ${blooms}`;
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**Code Garden**\n\n`);
    md.appendMarkdown(`$(flame) ${garden.streak.days}-day streak (best ${garden.streak.best})  \n`);
    md.appendMarkdown(`$(heart) ${blooms} in bloom, ${garden.plants.length} growing  \n`);
    md.appendMarkdown(`$(book) ${pressedTotal(garden)} pressed, ${garden.known.length} of ${SPECIES.length} species  \n`);
    md.appendMarkdown(`$(drop) Soil ${Math.round(garden.moisture * 100)}% watered`);
    status.tooltip = md;
    status.show();
  }
  updateStatus();

  function announce(events: Event[]) {
    if (!config().get("notifications", true)) return;
    for (const e of events) {
      if (e.type === "unlock") {
        const s = species(e.species);
        vscode.window.showInformationMessage(`Code Garden: you unlocked the ${s.name}! (${s.how})`, "Plant it next").then(choice => {
          if (choice) { chooseNextSeed(garden, s.id); persist(); vscode.window.setStatusBarMessage(`Code Garden: the next seed will be a ${s.name}.`, 4000); }
        });
      } else if (e.type === "streak" && [3, 7, 14, 30, 50, 100, 365].includes(e.days)) {
        vscode.window.showInformationMessage(`Code Garden: ${e.days} days in a row. Your garden is thriving!`);
      } else if (e.type === "pressed") {
        vscode.window.setStatusBarMessage(`Code Garden: a ${species(e.species).name} was pressed into your collection.`, 5000);
      }
    }
  }

  // ---------- Views ----------
  const probes: ((state: unknown) => void)[] = [];
  const snapshots: ((dataUrl: string | undefined) => void)[] = [];
  const attach = (webview: vscode.Webview, onDispose: (cb: () => void) => void) => {
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] };
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const src = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", f));
    webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${src("garden.css")}"></head>
<body><canvas id="scene" role="img" aria-label="Your code garden"></canvas>
<div id="hud" aria-live="polite"></div><div id="tip" hidden></div>
<script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;
    webviews.add(webview);
    const sub = webview.onDidReceiveMessage(m => {
      if (m?.type === "ready") webview.postMessage({ type: "garden", garden, settings: settings() });
      else if (m?.type === "probe") probes.splice(0).forEach(resolve => resolve(m.state));
      else if (m?.type === "snapshot") snapshots.splice(0).forEach(resolve => resolve(typeof m.dataUrl === "string" ? m.dataUrl : undefined));
    });
    onDispose(() => { webviews.delete(webview); sub.dispose(); });
  };

  /** A PNG of the garden from the view, as a data URL. */
  const takeSnapshot = () => new Promise<string | undefined>(resolve => { snapshots.push(resolve); broadcast({ type: "snapshot" }); setTimeout(() => resolve(undefined), 5000); });

  let panel: vscode.WebviewPanel | undefined;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("veyraGarden.view", {
      resolveWebviewView(view) { attach(view.webview, cb => view.onDidDispose(cb)); },
    }, { webviewOptions: { retainContextWhenHidden: true } }),

    vscode.commands.registerCommand("veyraGarden.openPanel", () => {
      if (panel) { panel.reveal(); return panel; }
      panel = vscode.window.createWebviewPanel("veyraGarden.panel", "Code Garden", vscode.ViewColumn.Beside, { retainContextWhenHidden: true });
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "leaf.svg");
      attach(panel.webview, cb => panel!.onDidDispose(() => { cb(); panel = undefined; }));
      return panel;
    }),

    vscode.commands.registerCommand("veyraGarden.snapshot", async () => {
      if (!webviews.size) { await vscode.commands.executeCommand("veyraGarden.view.focus"); await new Promise(r => setTimeout(r, 800)); }
      const dataUrl = await takeSnapshot();
      if (!dataUrl?.startsWith("data:image/png;base64,")) { vscode.window.showWarningMessage("Code Garden: couldn't take the snapshot. Open the Code Garden view and try again."); return; }
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
      const target = await vscode.window.showSaveDialog({
        title: "Save your Code Garden", saveLabel: "Save snapshot", filters: { "PNG image": ["png"] },
        defaultUri: folder ? vscode.Uri.joinPath(folder, "my-code-garden.png") : undefined,
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
      const open = await vscode.window.showInformationMessage("Code Garden: snapshot saved. Share it with #CodeGarden!", "Open it");
      if (open) vscode.commands.executeCommand("vscode.open", target);
    }),

    vscode.commands.registerCommand("veyraGarden.herbarium", async () => {
      const items = SPECIES.map(s => {
        const open = s.unlocked(garden);
        const growing = garden.plants.filter(p => p.species === s.id).length;
        const pressed = garden.pressed[s.id] ?? 0;
        return {
          label: `${open ? "$(check)" : "$(lock)"} ${s.name}`,
          description: open ? `${growing} growing · ${pressed} pressed` : "Locked",
          detail: open ? `Unlocked: ${s.how}` : `To unlock: ${s.how}`,
        };
      });
      const t = garden.totals;
      await vscode.window.showQuickPick(items, {
        title: `Your collection: ${garden.known.length} of ${SPECIES.length} species · ${pressedTotal(garden)} pressed flowers`,
        placeHolder: `${t.minutes} minutes of coding · ${t.saves} saves · ${t.fixes} errors fixed · ${t.commits} commits · best streak ${garden.streak.best} days`,
        matchOnDescription: true, matchOnDetail: true,
      });
    }),

    vscode.commands.registerCommand("veyraGarden.chooseSeed", async (id?: SpeciesId) => {
      const pick = id ?? (await vscode.window.showQuickPick(
        SPECIES.map(s => ({ label: s.unlocked(garden) ? s.name : `$(lock) ${s.name}`, description: s.unlocked(garden) ? (garden.nextSeed === s.id ? "Next seed" : "") : `Locked: ${s.how}`, id: s.id, open: s.unlocked(garden) })),
        { placeHolder: "Which seed should sprout next? (A new seed sprouts every 20 minutes of coding.)" },
      ))?.id;
      if (!pick) return;
      if (!chooseNextSeed(garden, pick)) { vscode.window.showInformationMessage(`Code Garden: the ${species(pick).name} is still locked. ${species(pick).how}.`); return; }
      apply([]);
      vscode.window.setStatusBarMessage(`Code Garden: the next seed will be a ${species(pick).name}.`, 4000);
    }),

    vscode.commands.registerCommand("veyraGarden.reset", async () => {
      const sure = await vscode.window.showWarningMessage("Start a new garden? Your plants, streak and collection will be cleared.", { modal: true }, "Start Again");
      if (sure !== "Start Again") return;
      garden = newGarden(Date.now(), rnd);
      apply([]);
    }),

    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraGarden")) { sendGarden(); updateStatus(); } }),
  );

  // ---------- Your coding ----------
  let lastTyped = 0, lastSaved = 0;
  const isCode = (doc: vscode.TextDocument) => doc.uri.scheme === "file" || doc.uri.scheme === "untitled" || doc.uri.scheme === "vscode-remote";
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => { if (isCode(e.document) && e.contentChanges.length) lastTyped = Date.now(); }),
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (!isCode(doc) || Date.now() - lastSaved < 2000) return;
      lastSaved = Date.now();
      apply(save(garden, Date.now(), rnd));
    }),
  );
  // A coding minute: you typed in the last minute and a half, in a focused VS Code window.
  const minute = setInterval(() => {
    if (vscode.window.state.focused && Date.now() - lastTyped < ACTIVE_WINDOW_MS) apply(codeMinute(garden, Date.now(), rnd));
    else { evaporate(garden, Date.now()); updateStatus(); }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(minute) });

  // Errors: when the last one is fixed, butterflies come.
  let errors = countErrors(), peak = errors;
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => {
    const now = countErrors();
    peak = Math.max(peak, now);
    if (now === 0 && errors > 0) { apply(fixed(garden, peak)); peak = 0; }
    errors = now;
  }));

  // Commits, through VS Code's built-in Git extension (if it's there and enabled).
  watchCommits(context, () => apply(commit(garden)));

  return {
    /** For tests: the state of the first webview's garden. */
    probe: () => new Promise(resolve => { probes.push(resolve); broadcast({ type: "probe" }); }),
    garden: () => garden,
    webviewCount: () => webviews.size,
    /** For tests: as if you'd coded for this many minutes. */
    codeMinutes: (n: number, at = Date.now()) => { const events: Event[] = []; for (let i = 0; i < n; i++) events.push(...codeMinute(garden, at + i * 60_000, rnd)); apply(events); return events; },
    commit: () => apply(commit(garden)),
    snapshot: takeSnapshot,
  };
}

function countErrors(): number {
  let n = 0;
  for (const [, list] of vscode.languages.getDiagnostics()) for (const d of list) if (d.severity === vscode.DiagnosticSeverity.Error) n++;
  return n;
}

// The bits of the Git extension's API we use (it ships with VS Code; see extensions/git/src/api/git.d.ts).
interface GitRepository { state: { HEAD?: { name?: string; commit?: string; ahead?: number }; onDidChange: vscode.Event<void> }; onDidCommit?: vscode.Event<void> }
interface GitApi { repositories: GitRepository[]; onDidOpenRepository: vscode.Event<GitRepository> }

function watchCommits(context: vscode.ExtensionContext, onCommit: () => void) {
  const git = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  if (!git) return;
  const start = async () => {
    try {
      const api = (git.isActive ? git.exports : await git.activate()).getAPI(1);
      const watch = (repo: GitRepository) => {
        if (typeof repo.onDidCommit === "function") { context.subscriptions.push(repo.onDidCommit(onCommit)); return; }
        // Older VS Code: a new commit on the same branch that's one more ahead of its upstream.
        let last = { ...repo.state.HEAD };
        context.subscriptions.push(repo.state.onDidChange(() => {
          const head = repo.state.HEAD;
          if (head?.commit && last.commit && head.commit !== last.commit && head.name === last.name && (head.ahead ?? 0) > (last.ahead ?? 0)) onCommit();
          last = { ...head };
        }));
      };
      api.repositories.forEach(watch);
      context.subscriptions.push(api.onDidOpenRepository(watch));
    } catch { /* Git is disabled: the garden simply grows without commit blooms */ }
  };
  start();
}

export function deactivate() {}
