import * as vscode from "vscode";
import * as m from "./model";
import { Docker, DockerError, type Stream } from "./docker";
import type { Store } from "./extension";

/* The Logs panel and the Dashboard, both webviews running media/panel.js. */

function page(context: vscode.ExtensionContext, webview: vscode.Webview, mode: "logs" | "dashboard") {
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", file));
  const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${media("panel.css")}"></head>
<body data-mode="${mode}" data-logo="${media("icon.png")}"><div id="app"></div><script nonce="${nonce}" src="${media("panel.js")}"></script></body></html>`;
}
const options = (context: vscode.ExtensionContext): vscode.WebviewPanelOptions & vscode.WebviewOptions => ({ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] });
const explain = (error: unknown) => (error instanceof DockerError ? error.explained : m.explainError(String((error as Error)?.message ?? error)));

// ---------- Logs ----------

export type LogTarget = { kind: "container"; id: string; name: string } | { kind: "project"; name: string; args: string[]; service?: string };

export class LogsPanel {
  private static open = new Map<string, LogsPanel>();
  static show(context: vscode.ExtensionContext, docker: Docker, target: LogTarget) {
    const key = target.kind === "container" ? `c:${target.id}` : `p:${target.name}:${target.service ?? ""}`;
    const existing = LogsPanel.open.get(key);
    if (existing) { existing.panel.reveal(); return; }
    LogsPanel.open.set(key, new LogsPanel(context, docker, target, key));
  }
  static closeAll() { LogsPanel.open.forEach(p => p.panel.dispose()); }

  private readonly panel: vscode.WebviewPanel;
  private stream?: Stream;
  private pending: (m.LogLine & { err?: boolean })[] = [];
  private flushTimer?: NodeJS.Timeout;
  private constructor(context: vscode.ExtensionContext, private docker: Docker, private target: LogTarget, key: string) {
    const title = target.kind === "container" ? target.name : `${target.service ?? target.name} (compose)`;
    this.panel = vscode.window.createWebviewPanel("veyraDocker.logs", `Logs: ${title}`, vscode.ViewColumn.Active, options(context));
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "logs.svg");
    this.panel.webview.html = page(context, this.panel.webview, "logs");
    this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    this.panel.onDidDispose(() => { LogsPanel.open.delete(key); this.stream?.stop(); clearTimeout(this.flushTimer); });
  }
  private post(message: unknown) { return this.panel.webview.postMessage(message); }

  private attach() {
    this.stream?.stop();
    const lines = String(vscode.workspace.getConfiguration("veyraDocker").get<number>("logs.lines", 500));
    const compose = this.target.kind === "project";
    const args = this.target.kind === "container"
      ? ["logs", "-f", "--tail", lines, "--timestamps", this.target.id]
      : [...this.target.args, "logs", "-f", "--tail", lines, "--timestamps", "--no-color", ...(this.target.service ? [this.target.service] : [])];
    this.post({ type: "attached" });
    const stream = this.docker.stream(args, (line, from) => {
      this.pending.push({ ...m.parseLogLine(line, compose), err: from === "stderr" });
      if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 80);
    });
    this.stream = stream;
    stream.done.then(code => {
      if (this.stream !== stream) return;
      this.flush();
      this.post({ type: "ended", code });
    });
  }
  private flush() {
    this.flushTimer = undefined;
    if (!this.pending.length) return;
    const lines = this.pending; this.pending = [];
    this.post({ type: "lines", lines });
  }
  private async onMessage(msg: any) {
    switch (msg.type) {
      case "ready":
        this.post({ type: "init", target: { kind: this.target.kind, name: this.target.kind === "container" ? this.target.name : this.target.service ?? this.target.name } });
        this.attach();
        break;
      case "reattach": this.attach(); break;
      case "stop": this.stream?.stop(); this.stream = undefined; this.post({ type: "ended", code: null, stopped: true }); break;
      case "copy": await vscode.env.clipboard.writeText(String(msg.text ?? "")); this.post({ type: "toast", text: `Copied ${msg.count} lines` }); break;
      case "save": {
        const uri = await vscode.window.showSaveDialog({ filters: { "Log files": ["log", "txt"] }, saveLabel: "Save logs" });
        if (uri) { await vscode.workspace.fs.writeFile(uri, Buffer.from(String(msg.text ?? ""), "utf8")); this.post({ type: "toast", text: "Saved" }); }
        break;
      }
      case "openEditor": {
        const doc = await vscode.workspace.openTextDocument({ language: "log", content: String(msg.text ?? "") });
        await vscode.window.showTextDocument(doc);
        break;
      }
    }
  }
}

// ---------- Dashboard ----------

export class DashboardPanel {
  private static current?: DashboardPanel;
  static show(context: vscode.ExtensionContext, store: Store, cleanup = false) {
    if (DashboardPanel.current) { DashboardPanel.current.panel.reveal(); if (cleanup) DashboardPanel.current.post({ type: "focusCleanup" }); return; }
    DashboardPanel.current = new DashboardPanel(context, store, cleanup);
  }

  private readonly panel: vscode.WebviewPanel;
  private timer?: NodeJS.Timeout;
  private stats = new Map<string, m.Stats>();
  private disk: m.DiskUsage[] | undefined;
  private busy = false;
  private subs: vscode.Disposable[] = [];
  private constructor(context: vscode.ExtensionContext, private store: Store, private cleanup: boolean) {
    this.panel = vscode.window.createWebviewPanel("veyraDocker.dashboard", "Docker Dashboard", vscode.ViewColumn.Active, options(context));
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(context, this.panel.webview, "dashboard");
    this.subs.push(
      this.panel.webview.onDidReceiveMessage(msg => this.onMessage(msg).catch(error => this.post({ type: "toast", kind: "error", text: explain(error).title }))),
      store.onDidChange(() => this.send()),
      this.panel.onDidChangeViewState(() => (this.panel.visible ? this.tick() : clearTimeout(this.timer))),
    );
    this.panel.onDidDispose(() => { DashboardPanel.current = undefined; clearTimeout(this.timer); this.subs.forEach(s => s.dispose()); });
  }
  private post(message: unknown) { return this.panel.webview.postMessage(message); }

  /** Live CPU and memory every few seconds while the panel is visible. */
  private async tick() {
    clearTimeout(this.timer);
    if (!this.panel.visible) return;
    if (!this.store.error && this.store.runningContainers.length) {
      try { this.stats = new Map((await this.store.docker.stats()).map(s => [s.id.slice(0, 12), s])); } catch { /* Docker went away: the store will say */ }
    } else this.stats.clear();
    this.send();
    this.timer = setTimeout(() => this.tick(), 2500);
  }
  private async loadDisk() {
    if (this.store.error) return;
    try { this.disk = await this.store.docker.diskUsage(); } catch { this.disk = undefined; }
    this.send();
  }
  private send() {
    const s = this.store;
    this.post({
      type: "state", error: s.error, version: s.version, loaded: s.loaded, disk: this.disk,
      counts: { running: s.runningContainers.length, containers: s.containers.length, images: s.images.length, volumes: s.volumes.length, dangling: s.images.filter(i => i.dangling).length, stopped: s.containers.filter(c => c.state === "exited" || c.state === "created" || c.state === "dead").length },
      containers: s.containers.map(c => ({ id: c.id, name: c.name, service: c.service, project: c.project, image: c.image, state: c.state, status: m.shortStatus(c), health: c.health, ports: c.ports.filter((p, i, all) => all.findIndex(q => q.hostPort === p.hostPort) === i).map(p => ({ host: p.hostPort, container: p.containerPort, url: m.portUrl(p) })), stats: this.stats.get(c.id.slice(0, 12)) })),
    });
  }

  private async onMessage(msg: any) {
    switch (msg.type) {
      case "ready":
        if (!this.store.loaded) await this.store.refresh();
        this.send();
        void this.tick();
        void this.loadDisk();
        if (this.cleanup) this.post({ type: "focusCleanup" });
        break;
      case "refreshDisk": await this.loadDisk(); break;
      case "container": {
        const container = this.store.containers.find(c => c.id === msg.id);
        if (container) await vscode.commands.executeCommand(`veyraDocker.${msg.action}`, { kind: "container", container });
        break;
      }
      case "open": await vscode.env.openExternal(vscode.Uri.parse(String(msg.url))); break;
      case "command": await vscode.commands.executeCommand(`veyraDocker.${msg.command}`); break;
      case "prune": await this.prune(msg.what); break;
    }
  }

  private async prune(what: "containers" | "danglingImages" | "unusedImages" | "volumes" | "buildCache" | "networks") {
    if (this.busy) return;
    const info = {
      containers: ["Remove all stopped containers?", "Running containers are not touched."],
      danglingImages: ["Remove untagged images?", "These are left over from older builds. Images with a name are kept."],
      unusedImages: ["Remove every image no container uses?", "Images you have not run yet are removed too. You can pull or build them again later."],
      volumes: ["Delete unused anonymous volumes?", "Volumes with a name are kept. Data in the deleted volumes is gone for good."],
      buildCache: ["Clear the build cache?", "Your next builds will be slower, as layers are built again."],
      networks: ["Remove unused networks?", "Built-in networks are kept."],
    }[what];
    const ok = await vscode.window.showWarningMessage(info[0], { modal: true, detail: info[1] }, "Clean Up");
    if (!ok) return;
    this.busy = true;
    this.post({ type: "pruning", what });
    try {
      const { bytes, count } = await this.store.docker.prune(what);
      const text = count !== undefined ? (count ? `Deleted ${count} unused volume${count === 1 ? "" : "s"}` : "Done. No unused anonymous volumes.") : bytes ? `Freed ${m.formatSize(bytes)}` : "Done. Nothing to free.";
      this.post({ type: "toast", text });
    } catch (error) {
      const why = explain(error);
      this.post({ type: "toast", kind: "error", text: `${why.title}. ${why.detail}` });
    } finally {
      this.busy = false;
      this.post({ type: "pruning", what: undefined });
      await this.store.refresh();
      await this.loadDisk();
    }
  }
}
