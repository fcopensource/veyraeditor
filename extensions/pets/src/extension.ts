import * as vscode from "vscode";
import { freshName, random, type Kind, type PetInfo } from "./model";

/* Pets Veyra: pets in a webview (the Explorer and a bigger panel), saved with VS Code, reacting to your coding. */

const config = () => vscode.workspace.getConfiguration("veyraPets");
const KEY = "veyraPets.pets";
const rnd = random();
const KINDS: { kind: Kind; label: string; colors: string[] }[] = [
  { kind: "cat", label: "$(heart) Cat", colors: ["orange", "black", "white", "grey"] },
  { kind: "dog", label: "$(heart) Dog", colors: ["brown", "golden", "black", "white"] },
  { kind: "fox", label: "$(heart) Fox", colors: ["red", "arctic"] },
  { kind: "bunny", label: "$(heart) Bunny", colors: ["white", "brown", "grey"] },
  { kind: "panda", label: "$(heart) Panda", colors: ["classic"] },
];

export function activate(context: vscode.ExtensionContext) {
  const webviews = new Set<vscode.Webview>();
  const pets = (): PetInfo[] => context.globalState.get<PetInfo[]>(KEY) ?? [];
  const settings = () => ({ background: config().get("background", "meadow"), size: config().get("size", "medium"), showNames: config().get("showNames", true) });
  const broadcast = (message: unknown) => { for (const w of webviews) w.postMessage(message); };
  const sendPets = () => broadcast({ type: "pets", pets: pets(), settings: settings() });
  const save = async (list: PetInfo[]) => { await context.globalState.update(KEY, list); sendPets(); };
  if (!context.globalState.get(KEY)) context.globalState.update(KEY, [{ id: "first", kind: "cat", color: "orange", name: "Mochi" }]);
  context.globalState.setKeysForSync([KEY]);

  /** For tests: answers from the webviews to "probe". */
  const probes: ((state: unknown) => void)[] = [];
  const attach = (webview: vscode.Webview, onDispose: (cb: () => void) => void) => {
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] };
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const src = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", f));
    webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}#scene{display:block;width:100%;height:100%;touch-action:none;user-select:none}</style></head>
<body><canvas id="scene" aria-label="Your pets. Click a pet to pet it, click or drag to throw a ball."></canvas><script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;
    webviews.add(webview);
    const sub = webview.onDidReceiveMessage(m => {
      if (m.type === "ready") webview.postMessage({ type: "pets", pets: pets(), settings: settings() });
      if (m.type === "probe") probes.splice(0).forEach(resolve => resolve(m));
    });
    onDispose(() => { webviews.delete(webview); sub.dispose(); });
  };

  let panel: vscode.WebviewPanel | undefined;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("veyraPets.view", {
      resolveWebviewView(view) { attach(view.webview, cb => view.onDidDispose(cb)); },
    }, { webviewOptions: { retainContextWhenHidden: true } }),

    vscode.commands.registerCommand("veyraPets.openPanel", () => {
      if (panel) { panel.reveal(); return panel; }
      panel = vscode.window.createWebviewPanel("veyraPets.panel", "Pets", vscode.ViewColumn.Beside, { retainContextWhenHidden: true });
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "paw.svg");
      attach(panel.webview, cb => panel!.onDidDispose(() => { cb(); panel = undefined; }));
      return panel;
    }),

    vscode.commands.registerCommand("veyraPets.addPet", async (preset?: Partial<PetInfo>) => {
      const kind = preset?.kind ?? (await vscode.window.showQuickPick(KINDS.map(k => ({ label: k.label, description: k.colors.join(", "), pet: k.kind })), { placeHolder: "Which pet?" }))?.pet;
      if (!kind) return;
      const colors = KINDS.find(k => k.kind === kind)!.colors;
      const color = preset?.color ?? (colors.length === 1 ? colors[0] : (await vscode.window.showQuickPick(colors, { placeHolder: "Which colour?" })));
      if (!color) return;
      const suggested = freshName(pets().map(p => p.name), rnd);
      const name = preset?.name ?? (await vscode.window.showInputBox({ prompt: "Name your pet", value: suggested, validateInput: v => (v.trim() ? (v.length > 24 ? "Keep it under 24 letters." : undefined) : "Give your pet a name.") }));
      if (!name) return;
      await save([...pets(), { id: `${Date.now().toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`, kind, color, name: name.trim() }]);
      vscode.window.setStatusBarMessage(`Pets Veyra: say hello to ${name.trim()}!`, 3000);
      if (!webviews.size) vscode.commands.executeCommand("veyraPets.view.focus");
    }),

    vscode.commands.registerCommand("veyraPets.removePet", async (id?: string) => {
      const list = pets();
      if (!list.length) { vscode.window.showInformationMessage("There are no pets yet. Add one with Pets Veyra: Add a Pet."); return; }
      const target = id ?? (await vscode.window.showQuickPick(list.map(p => ({ label: p.name, description: `${p.color} ${p.kind}`, id: p.id })), { placeHolder: "Say goodbye to which pet?" }))?.id;
      if (target) await save(list.filter(p => p.id !== target));
    }),

    vscode.commands.registerCommand("veyraPets.renamePet", async () => {
      const list = pets();
      const pick = await vscode.window.showQuickPick(list.map(p => ({ label: p.name, description: `${p.color} ${p.kind}`, id: p.id })), { placeHolder: "Rename which pet?" });
      if (!pick) return;
      const name = await vscode.window.showInputBox({ prompt: `A new name for ${pick.label}`, value: pick.label, validateInput: v => (v.trim() ? undefined : "Give your pet a name.") });
      if (name) await save(list.map(p => (p.id === pick.id ? { ...p, name: name.trim() } : p)));
    }),

    vscode.commands.registerCommand("veyraPets.throwBall", () => broadcast({ type: "throw" })),

    vscode.commands.registerCommand("veyraPets.background", async () => {
      const items = [["meadow", "Grass and a soft sky"], ["night", "Stars and the moon"], ["beach", "Sand and the sea"], ["plain", "Your theme's background"]].map(([label, detail]) => ({ label, description: detail }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Where do your pets live?" });
      if (pick) await config().update("background", pick.label, vscode.ConfigurationTarget.Global);
    }),

    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraPets")) sendPets(); }),
  );

  // ---------- Reacting to your coding ----------
  let lastSave = 0, lastTyping = 0, errors = countErrors();
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (!config().get("reactToCode", true) || Date.now() - lastSave < 4000) return;
      lastSave = Date.now();
      broadcast({ type: "cheer" });
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.scheme === "output" || Date.now() - lastTyping < 5000) return;
      lastTyping = Date.now();
      broadcast({ type: "activity" });
    }),
    vscode.languages.onDidChangeDiagnostics(() => {
      const now = countErrors();
      if (config().get("reactToCode", true)) {
        if (now > errors) broadcast({ type: "worry" });
        else if (now === 0 && errors > 0) broadcast({ type: "party" });
      }
      errors = now;
    }),
  );

  return {
    /** For tests: the state of the first webview's world. */
    probe: () => new Promise(resolve => { probes.push(resolve); broadcast({ type: "probe" }); }),
    pets,
    webviewCount: () => webviews.size,
  };
}

function countErrors(): number {
  let n = 0;
  for (const [, list] of vscode.languages.getDiagnostics()) for (const d of list) if (d.severity === vscode.DiagnosticSeverity.Error) n++;
  return n;
}

export function deactivate() {}
