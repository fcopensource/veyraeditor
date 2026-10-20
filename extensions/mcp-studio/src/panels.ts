import * as vscode from "vscode";
import * as m from "./model";
import { CATALOG } from "./catalog";
import { argumentsFrom, formFields, Session, type FormField } from "./inspector";
import { keyOf, runnable, RESTRICTED, type Configs } from "./configs";

/* The Inspector and the Add Server page, both webviews running media/panel.js. */

function page(context: vscode.ExtensionContext, webview: vscode.Webview, mode: "inspector" | "add") {
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", file));
  const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; media-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${media("panel.css")}"></head>
<body data-mode="${mode}" data-logo="${media("icon.png")}"><div id="app"></div><script nonce="${nonce}" src="${media("panel.js")}"></script></body></html>`;
}
const errorText = (error: unknown) => String((error as Error)?.message ?? error);

// ---------- Inspector ----------

export class InspectorPanel {
  private static open = new Map<string, InspectorPanel>();
  private session?: Session;
  private fields = new Map<string, FormField[]>();
  private connecting = false;

  static show(context: vscode.ExtensionContext, configs: Configs, target: m.ConfigTarget, def: m.ServerDef) {
    const key = keyOf(target, def.name);
    const existing = InspectorPanel.open.get(key);
    if (existing) { existing.panel.reveal(); return; }
    InspectorPanel.open.set(key, new InspectorPanel(context, configs, target, def, key));
  }
  static async closeAll() { await Promise.all([...InspectorPanel.open.values()].map(p => p.session?.close())); }

  private readonly panel: vscode.WebviewPanel;
  private constructor(context: vscode.ExtensionContext, private configs: Configs, private target: m.ConfigTarget, private def: m.ServerDef, private key: string) {
    this.panel = vscode.window.createWebviewPanel("veyraMcp.inspector", `MCP: ${def.name}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(context, this.panel.webview, "inspector");
    this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg).catch(error => this.post({ type: "toast", kind: "error", text: errorText(error) })));
    this.panel.onDidDispose(() => { InspectorPanel.open.delete(this.key); this.session?.close(); });
  }
  private post(message: unknown) { return this.panel.webview.postMessage(message); }

  private async connect() {
    if (this.connecting) return;
    if (!vscode.workspace.isTrusted) { this.post({ type: "failed", title: "Not started in Restricted Mode", detail: RESTRICTED, missing: [] }); return; }
    this.connecting = true;
    await this.session?.close();
    this.session = undefined;
    this.post({ type: "connecting" });
    this.configs.setStatus(this.key, { state: "checking", detail: "", at: Date.now() });
    const ready = await runnable(this.target, this.def);
    if (!ready) { this.connecting = false; this.post({ type: "failed", title: "Not started", detail: "A value this server needs was not entered.", missing: [] }); return; }
    try {
      this.session = await Session.open(ready.def, { cwd: this.target.folder ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, timeoutMs: 90000, onLog: entry => this.post({ type: "log", entry }) });
      const s = this.session;
      const [tools, resources, templates, prompts] = await Promise.all([s.tools(), s.resources(), s.resourceTemplates(), s.prompts()].map(p => p.catch(() => [])));
      this.fields = new Map(tools.map((t: any) => [t.name, formFields(t.inputSchema)]));
      this.configs.setStatus(this.key, { state: "ok", detail: `${tools.length} tool${tools.length === 1 ? "" : "s"}`, at: Date.now() });
      this.post({ type: "connected", info: s.info, tools: tools.map((t: any) => ({ ...t, fields: this.fields.get(t.name) })), resources, templates, prompts, missing: ready.missing });
    } catch (error) {
      const why = m.explainFailure(error, ready.def, (error as any)?.stderr ?? "");
      this.configs.setStatus(this.key, { state: "error", detail: why.title, at: Date.now() });
      this.post({ type: "failed", ...why, missing: ready.missing });
    } finally { this.connecting = false; }
  }

  private async onMessage(msg: any) {
    switch (msg.type) {
      case "ready":
        this.post({ type: "init", server: { name: this.def.name, app: this.target.label, file: this.target.file, transport: this.def.transport, summary: m.summary(m.masked(this.def)), secrets: m.plainSecrets(this.def).length, scope: this.target.scope } });
        await this.connect();
        break;
      case "reconnect": await this.connect(); break;
      case "disconnect": await this.session?.close(); this.session = undefined; this.post({ type: "disconnected" }); break;
      case "callTool": {
        const fields = this.fields.get(msg.name) ?? [];
        const { args, error } = msg.raw ? (() => { try { return { args: JSON.parse(msg.raw || "{}"), error: undefined }; } catch { return { args: {}, error: "The arguments are not valid JSON." }; } })() : argumentsFrom(fields, msg.values ?? {});
        if (error) { this.post({ type: "result", id: msg.id, ok: false, error }); break; }
        await this.run(msg.id, () => this.session!.callTool(msg.name, args), args);
        break;
      }
      case "readResource": await this.run(msg.id, () => this.session!.readResource(msg.uri)); break;
      case "getPrompt": await this.run(msg.id, () => this.session!.getPrompt(msg.name, msg.args ?? {})); break;
      case "copy": await vscode.env.clipboard.writeText(String(msg.text ?? "")); this.post({ type: "toast", text: "Copied" }); break;
      case "openConfig": await vscode.commands.executeCommand("veyraMcp.openConfig", { kind: "server", located: this.configs.read(this.target), def: this.def }); break;
    }
  }
  private async run(id: string, work: () => Promise<unknown>, args?: unknown) {
    if (!this.session) { this.post({ type: "result", id, ok: false, error: "The server is not connected. Click Reconnect." }); return; }
    const started = Date.now();
    try { this.post({ type: "result", id, ok: true, result: await work(), ms: Date.now() - started, args }); }
    catch (error) { this.post({ type: "result", id, ok: false, error: errorText(error), ms: Date.now() - started }); }
  }
}

// ---------- Add Server ----------

export class AddServerPanel {
  private static current?: AddServerPanel;
  static show(context: vscode.ExtensionContext, configs: Configs, preselect?: string) {
    if (AddServerPanel.current) { AddServerPanel.current.panel.reveal(); AddServerPanel.current.init(preselect); return; }
    AddServerPanel.current = new AddServerPanel(context, configs, preselect);
  }
  private readonly panel: vscode.WebviewPanel;
  private constructor(context: vscode.ExtensionContext, private configs: Configs, private preselect?: string) {
    this.panel = vscode.window.createWebviewPanel("veyraMcp.add", "Add MCP Server", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(context, this.panel.webview, "add");
    this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg).catch(error => this.post({ type: "toast", kind: "error", text: errorText(error) })));
    this.panel.onDidDispose(() => (AddServerPanel.current = undefined));
  }
  private post(message: unknown) { return this.panel.webview.postMessage(message); }
  private init(preselect = this.preselect) {
    const hostApp = this.configs.targets().find(t => t.app === "vscode" && t.scope === "user");
    const targets = this.configs.targets().filter(t => t.writable && (this.configs.installed(t) || t.scope === "project")).map(t => ({
      id: t.id, label: t.label, scope: t.scope, file: t.file, local: t.format === "claude-desktop",
      checked: preselect ? t.id === preselect : t.id === hostApp?.id,
    }));
    this.post({ type: "init", catalog: CATALOG, targets, workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "" });
  }

  private async onMessage(msg: any) {
    switch (msg.type) {
      case "ready": this.init(); break;
      case "pickFolder": {
        const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Choose folder" });
        if (picked?.[0]) this.post({ type: "folderPicked", key: msg.key, path: picked[0].fsPath });
        break;
      }
      case "test": {
        const def = msg.def as m.ServerDef;
        const invalid = m.validateDef(def);
        if (invalid) { this.post({ type: "testResult", ok: false, title: invalid, detail: "" }); break; }
        if (!vscode.workspace.isTrusted) { this.post({ type: "testResult", ok: false, title: "Not started in Restricted Mode", detail: RESTRICTED }); break; }
        let session: Session | undefined;
        try {
          session = await Session.open(def, { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, timeoutMs: 90000 });
          const tools = await session.tools().catch(() => []);
          this.post({ type: "testResult", ok: true, title: `Works: ${session.info.name ?? "server"}${session.info.version ? ` ${session.info.version}` : ""}`, detail: tools.length ? `${tools.length} tool${tools.length === 1 ? "" : "s"}: ${tools.slice(0, 12).map((t: any) => t.name).join(", ")}${tools.length > 12 ? "…" : ""}` : "It offers no tools." });
        } catch (error) {
          this.post({ type: "testResult", ok: false, ...m.explainFailure(error, def, (error as any)?.stderr ?? "") });
        } finally { await session?.close(); }
        break;
      }
      case "add": {
        const def = msg.def as m.ServerDef;
        const invalid = m.validateDef(def);
        if (invalid) { this.post({ type: "added", ok: false, text: invalid }); break; }
        const targets = this.configs.targets().filter(t => (msg.targets as string[]).includes(t.id));
        if (!targets.length) { this.post({ type: "added", ok: false, text: "Choose at least one app to add the server to." }); break; }
        const done: string[] = [], skipped: string[] = [];
        for (const target of targets) {
          if (def.transport !== "stdio" && target.format === "claude-desktop") { skipped.push(`${target.label}: add remote servers in Claude Desktop under Settings → Connectors`); continue; }
          const located = this.configs.read(target);
          if (located.error) { skipped.push(`${target.label}: its file has an error (${located.error})`); continue; }
          if (located.servers.some(s => s.name === def.name)) {
            const answer = await vscode.window.showWarningMessage(`${target.label} already has a server named "${def.name}". Replace it?`, { modal: true }, "Replace");
            if (answer !== "Replace") { skipped.push(`${target.label}: kept the existing "${def.name}"`); continue; }
          }
          await this.configs.edit(target, text => m.upsertServer(text, target.format, def));
          done.push(target.label);
        }
        const secrets = m.plainSecrets(def).length && targets.some(t => t.scope === "project");
        this.post({ type: "added", ok: done.length > 0, text: done.length ? `Added "${def.name}" to ${done.join(", ")}. Restart those apps if they are open.` : "Nothing was added.", skipped, warn: secrets ? "This server has a secret written in a project file, which may be committed to git. Prefer a variable such as ${env:NAME}." : undefined });
        break;
      }
    }
  }
}
