import * as vscode from "vscode";
import * as m from "./model";
import type { Store } from "./extension";
import { homedir } from "node:os";

/* The request editor and the environment editor, both webviews running media/panel.js. */

export interface ResponseData {
  status: number; statusText: string; ms: number; size: number; headers: [string, string][];
  kind: ReturnType<typeof m.bodyKind>; contentType: string; text?: string; base64?: string; truncated: boolean;
  url: string; redirected: boolean; warnings: string[]; sentHeaders: [string, string][];
}
const MAX_TEXT = 5 * 1024 * 1024, MAX_IMAGE = 8 * 1024 * 1024;

function page(context: vscode.ExtensionContext, webview: vscode.Webview, mode: "request" | "environments") {
  const media = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", file));
  const nonce = Array.from({ length: 24 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="stylesheet" href="${media("panel.css")}"></head>
<body data-mode="${mode}" data-logo="${media("icon.png")}"><div id="app"></div><script nonce="${nonce}" src="${media("panel.js")}"></script></body></html>`;
}

/** A clear explanation for the usual reasons a request fails before any response. */
function explain(error: any, url: string, timeoutSeconds: number): string {
  const code = error?.cause?.code ?? error?.code;
  let host = url;
  try { host = new URL(url).host; } catch { /* keep the URL */ }
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return `No response from ${host} within ${timeoutSeconds} seconds. Increase veyraApi.timeout for slow APIs.`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `Could not find the server "${host}". Check the address and your internet connection.`;
  if (code === "ECONNREFUSED") return `Nothing is answering at ${host}. Is your server running on that port?`;
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return `${host} closed the connection before answering.`;
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return `Connecting to ${host} timed out.`;
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code ?? "")) return `The certificate of ${host} is not trusted (${code}). For a local server, use http:// instead of https://.`;
  if (/Invalid URL|Failed to parse URL/i.test(error?.message ?? "")) return `"${url || "(empty)"}" is not a valid URL. Enter a full address, like https://api.example.com/users.`;
  return String(error?.cause?.message || error?.message || error);
}

export class RequestPanel {
  readonly panel: vscode.WebviewPanel;
  private abort?: AbortController;
  private saveTimer?: NodeJS.Timeout;
  private lastBody?: Uint8Array;
  private lastResponse?: ResponseData;

  constructor(private owner: RequestPanels, public request: m.ApiRequest, public collectionId: string | undefined, public extraVariables: Record<string, string>, private sendOnReady: boolean) {
    this.panel = vscode.window.createWebviewPanel("veyraApi.request", this.title(), vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(owner.context.extensionUri, "media")],
    });
    this.panel.iconPath = vscode.Uri.joinPath(owner.context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(owner.context, this.panel.webview, "request");
    this.panel.webview.onDidReceiveMessage(message => this.onMessage(message).catch(error => this.post({ type: "toast", kind: "error", text: (error as Error).message })));
    this.panel.onDidDispose(() => { this.abort?.abort(); this.flush(); owner.forget(this); });
  }
  private title() { return `${this.request.method} ${this.request.name}`; }
  post(message: unknown) { return this.panel.webview.postMessage(message); }

  async load() {
    const environments = await this.owner.store.environments();
    let collectionName: string | undefined;
    if (this.collectionId) collectionName = (await this.owner.store.collections()).find(c => c.collection.id === this.collectionId)?.collection.name;
    const config = vscode.workspace.getConfiguration("veyraApi");
    this.post({
      type: "load", request: this.request, collectionName, saved: !!this.collectionId,
      environments: environments.map(e => ({ id: e.id, name: e.name })), activeEnvironment: this.owner.store.activeEnvironmentId,
      variables: await this.variables(), layout: config.get("responseLayout", "auto"),
      response: this.lastResponse,
    });
  }
  async variables() { return { ...(await this.owner.store.variables()), ...this.extraVariables }; }

  private async onMessage(msg: any) {
    switch (msg.type) {
      case "ready": await this.load(); if (this.sendOnReady) { this.sendOnReady = false; await this.send(); } break;
      case "update": this.update(m.normalizeRequest(msg.request)); break;
      case "send": this.update(m.normalizeRequest(msg.request)); await this.send(); break;
      case "cancel": this.abort?.abort(); break;
      case "save": await this.saveAs(); break;
      case "copy": {
        const prepared = m.prepare(this.request, await this.variables());
        const text = msg.as === "fetch" ? m.toFetch(prepared) : msg.as === "python" ? m.toPython(prepared) : m.toCurl(prepared);
        await vscode.env.clipboard.writeText(text);
        this.post({ type: "toast", text: `Copied as ${msg.as === "fetch" ? "JavaScript fetch" : msg.as === "python" ? "Python" : "cURL"}` });
        break;
      }
      case "copyResponse": if (this.lastResponse?.text !== undefined) { await vscode.env.clipboard.writeText(msg.pretty ?? this.lastResponse.text); this.post({ type: "toast", text: "Response copied" }); } break;
      case "saveResponse": await this.saveResponse(); break;
      case "openResponse": {
        if (this.lastResponse?.text === undefined) break;
        const language = { json: "json", html: "html", xml: "xml" }[this.lastResponse.kind as string] ?? "plaintext";
        const doc = await vscode.workspace.openTextDocument({ content: msg.pretty ?? this.lastResponse.text, language });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        break;
      }
      case "setEnvironment": await this.owner.store.setActiveEnvironment(msg.id || undefined); break;
      case "editEnvironments": await vscode.commands.executeCommand("veyraApi.editEnvironments"); break;
    }
  }

  /** Every edit is kept; requests that belong to a collection are saved to disk shortly after. */
  private update(request: m.ApiRequest) {
    request.id = this.request.id;
    this.request = request;
    this.panel.title = this.title();
    if (!this.collectionId) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }
  private flush() {
    if (!this.saveTimer || !this.collectionId) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.owner.store.putRequest(this.collectionId, this.request).catch(error => vscode.window.showErrorMessage(`Could not save "${this.request.name}": ${(error as Error).message}`));
  }

  private async saveAs() {
    if (this.collectionId) { this.flush(); this.post({ type: "toast", text: "Saved" }); return; }
    const collection = await this.owner.pickCollection("Save to which collection?");
    if (!collection) return;
    const name = await vscode.window.showInputBox({ prompt: "Request name", value: this.request.name === "New request" ? m.nameFor(this.request.method, this.request.url) : this.request.name, validateInput: v => (v.trim() ? null : "Enter a name") });
    if (!name) return;
    this.request = { ...this.request, name: name.trim() };
    await this.owner.store.putRequest(collection.id, this.request);
    this.collectionId = collection.id;
    this.panel.title = this.title();
    this.post({ type: "saved", collectionName: collection.name, name: this.request.name });
  }

  private async saveResponse() {
    if (!this.lastBody || !this.lastResponse) return;
    const ext = { json: "json", html: "html", xml: "xml", text: "txt" }[this.lastResponse.kind as string] ?? (this.lastResponse.contentType.split("/")[1]?.split(/[;+]/)[0] || "bin");
    const file = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(homedir()), `response.${ext}`) });
    if (!file) return;
    await vscode.workspace.fs.writeFile(file, this.lastBody);
    this.post({ type: "toast", text: `Saved ${m.formatBytes(this.lastBody.length)}` });
  }

  async send() {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const config = vscode.workspace.getConfiguration("veyraApi");
    const timeoutSeconds = Math.max(1, config.get<number>("timeout", 30));
    const prepared = m.prepare(this.request, await this.variables());
    const warnings: string[] = [];
    if (prepared.missing.length) warnings.push(`Unknown variable${prepared.missing.length === 1 ? "" : "s"}: ${prepared.missing.map(n => `{{${n}}}`).join(", ")}. Choose an environment that has ${prepared.missing.length === 1 ? "it" : "them"}.`);
    let body = prepared.body;
    if ((prepared.method === "GET" || prepared.method === "HEAD") && body) { warnings.push(`The body was not sent: ${prepared.method} requests cannot have one.`); body = undefined; }
    this.post({ type: "sending" });
    const timer = setTimeout(() => abort.abort(new DOMException("timeout", "TimeoutError")), timeoutSeconds * 1000);
    const started = performance.now();
    const history = { id: m.newId(), at: Date.now(), request: structuredClone(this.request) };
    try {
      const response = await fetch(prepared.url, { method: prepared.method, headers: prepared.headers, body, redirect: config.get("followRedirects", true) ? "follow" : "manual", signal: abort.signal });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const ms = performance.now() - started;
      const headers: [string, string][] = [];
      response.headers.forEach((value, key) => headers.push([key, value]));
      const contentType = response.headers.get("content-type") ?? "";
      const text = new TextDecoder().decode(bytes.subarray(0, MAX_TEXT));
      const kind = m.bodyKind(contentType, text.slice(0, 200));
      const data: ResponseData = {
        status: response.status, statusText: response.statusText || m.STATUS[response.status] || "", ms, size: bytes.length, headers, kind, contentType,
        text: kind === "image" || kind === "binary" ? undefined : text, base64: kind === "image" && bytes.length <= MAX_IMAGE ? Buffer.from(bytes).toString("base64") : undefined,
        truncated: bytes.length > MAX_TEXT && kind !== "image" && kind !== "binary", url: response.url || prepared.url, redirected: response.redirected, warnings, sentHeaders: prepared.headers,
      };
      this.lastBody = bytes;
      this.lastResponse = data;
      if (this.abort === abort) this.post({ type: "response", response: data });
      await this.owner.store.addHistory({ ...history, status: response.status, ms });
    } catch (error: any) {
      const cancelled = abort.signal.aborted && !(abort.signal.reason instanceof DOMException && abort.signal.reason.name === "TimeoutError");
      const message = cancelled ? "Cancelled." : explain(abort.signal.reason?.name === "TimeoutError" ? abort.signal.reason : error, prepared.url, timeoutSeconds);
      if (this.abort === abort) this.post({ type: "failed", message, cancelled, warnings, ms: performance.now() - started });
      if (!cancelled) await this.owner.store.addHistory({ ...history, error: message });
    } finally {
      clearTimeout(timer);
      if (this.abort === abort) this.abort = undefined;
    }
  }
}

export class RequestPanels {
  private panels = new Set<RequestPanel>();
  pickCollection: (placeHolder: string) => Promise<m.Collection | undefined> = async () => undefined;
  constructor(readonly context: vscode.ExtensionContext, readonly store: Store) {}

  open(request: m.ApiRequest, collectionId: string | undefined, options: { send?: boolean; extraVariables?: Record<string, string> } = {}) {
    const existing = [...this.panels].find(p => p.request.id === request.id);
    if (existing) {
      existing.panel.reveal();
      if (options.send) existing.send();
      return existing;
    }
    const panel = new RequestPanel(this, structuredClone(request), collectionId, options.extraVariables ?? {}, !!options.send);
    this.panels.add(panel);
    return panel;
  }
  forget(panel: RequestPanel) { this.panels.delete(panel); }
  close(requestId: string) { for (const p of this.panels) if (p.request.id === requestId) p.panel.dispose(); }
  renamed(requestId: string, name: string) {
    for (const p of this.panels) if (p.request.id === requestId) { p.request = { ...p.request, name }; p.post({ type: "renamed", name }); p.panel.title = `${p.request.method} ${name}`; }
  }
  /** After the environment or its values change, every open request shows the new values. */
  async broadcastVariables() {
    const environments = (await this.store.environments()).map(e => ({ id: e.id, name: e.name }));
    for (const p of this.panels) p.post({ type: "variables", variables: await p.variables(), environments, activeEnvironment: this.store.activeEnvironmentId });
  }
}

/** One editor for all environments: variables, private values and which one is active. */
export class EnvironmentPanel {
  private panel?: vscode.WebviewPanel;
  private select?: string;
  constructor(private context: vscode.ExtensionContext, private store: Store) {
    store.onDidChange(() => this.load(false));
  }
  show(select?: string) {
    this.select = select;
    if (this.panel) { this.panel.reveal(); this.load(true); return; }
    this.panel = vscode.window.createWebviewPanel("veyraApi.environments", "Environments", vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    });
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.png");
    this.panel.webview.html = page(this.context, this.panel.webview, "environments");
    this.panel.onDidDispose(() => (this.panel = undefined));
    this.panel.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg.type === "ready") await this.load(true);
      else if (msg.type === "saveEnvironments") await this.store.saveEnvironments((msg.environments as any[]).map(e => ({ id: String(e.id), name: String(e.name || "Environment"), variables: (e.variables ?? []).map((v: any) => ({ key: String(v.key ?? ""), value: String(v.value ?? ""), enabled: v.enabled !== false, secret: !!v.secret })) })));
      else if (msg.type === "activate") await this.store.setActiveEnvironment(msg.id || undefined);
    });
  }
  private async load(reselect: boolean) {
    if (!this.panel) return;
    this.panel.webview.postMessage({ type: "environments", environments: await this.store.environments(), activeEnvironment: this.store.activeEnvironmentId, select: reselect ? this.select : undefined, inWorkspace: this.store.inWorkspace });
  }
}
