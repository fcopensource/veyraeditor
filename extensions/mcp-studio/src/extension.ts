import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import * as m from "./model";
import { Session } from "./inspector";
import { AddServerPanel, InspectorPanel } from "./panels";
import { canStart, Configs, keyOf, runnable, type Located } from "./configs";

/* Veyra MCP Studio: every MCP server of every AI app in one sidebar, with an inspector and a catalog. */

// ---------- Sidebar ----------

type Node = { kind: "app"; located: Located } | { kind: "server"; located: Located; def: m.ServerDef } | { kind: "problem"; located: Located };
const APP_ICONS: Record<m.AppId, string> = { "claude-desktop": "comment-discussion", "claude-code": "terminal", cursor: "symbol-event", vscode: "vscode", copilot: "copilot", windsurf: "symbol-misc" };

class ServersTree implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(private configs: Configs) { configs.onDidChange(() => this.emitter.fire()); }
  getChildren(node?: Node): Node[] {
    if (!node) return this.configs.all().filter(l => l.exists || l.target.scope === "user").map(located => ({ kind: "app", located }));
    if (node.kind !== "app") return [];
    if (node.located.error) return [{ kind: "problem", located: node.located }];
    return node.located.servers.map(def => ({ kind: "server", located: node.located, def }));
  }
  getTreeItem(node: Node): vscode.TreeItem {
    const t = node.located.target;
    if (node.kind === "app") {
      const count = node.located.servers.length;
      const item = new vscode.TreeItem(t.scope === "project" ? `${m.APP_NAMES[t.app]} · project` : t.label, count || node.located.error ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      item.id = t.id;
      item.iconPath = new vscode.ThemeIcon(APP_ICONS[t.app]);
      item.description = node.located.error ? "file has an error" : `${count || "no"} server${count === 1 ? "" : "s"}${t.writable ? "" : " · read-only"}`;
      item.tooltip = new vscode.MarkdownString(`**${t.label}**\n\n\`${t.file}\`${node.located.exists ? "" : "\n\n(No file yet: it is created when you add a server.)"}${t.writable ? "" : "\n\nShown here; edit it in its own app."}`);
      item.contextValue = t.writable ? "app" : "app-readonly";
      return item;
    }
    if (node.kind === "problem") {
      const item = new vscode.TreeItem(node.located.error ?? "Problem");
      item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"));
      item.command = { command: "veyraMcp.openConfig", title: "Open", arguments: [{ kind: "app", located: node.located }] };
      return item;
    }
    const def = node.def, status = this.configs.status.get(keyOf(t, def.name));
    const secrets = m.plainSecrets(def);
    const item = new vscode.TreeItem(def.name);
    item.id = keyOf(t, def.name);
    item.description = `${def.disabled ? "off · " : ""}${status?.state === "ok" ? status.detail + " · " : ""}${m.summary(m.masked(def))}`;
    item.iconPath = status?.state === "checking" ? new vscode.ThemeIcon("loading~spin")
      : status?.state === "ok" ? new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"))
      : status?.state === "error" ? new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"))
      : new vscode.ThemeIcon(def.transport === "stdio" ? "server-process" : "globe");
    const md = new vscode.MarkdownString(undefined, true);
    md.appendMarkdown(`**${def.name}** · ${def.transport === "stdio" ? "local" : def.transport === "sse" ? "remote (SSE)" : "remote"}\n\n`);
    md.appendCodeblock(m.summary(m.masked(def)), "text");
    if (status?.state === "error") md.appendMarkdown(`\n$(error) ${status.detail}\n`);
    if (secrets.length) md.appendMarkdown(`\n$(warning) Has ${secrets.length === 1 ? "a secret" : `${secrets.length} secrets`} written in the file${t.scope === "project" ? ", which may be committed to git" : ""}.\n`);
    item.tooltip = md;
    item.contextValue = t.writable ? "server" : "server-readonly";
    item.command = { command: "veyraMcp.inspect", title: "Inspect", arguments: [node] };
    return item;
  }
}

// ---------- Activation ----------

export function activate(context: vscode.ExtensionContext) {
  const configs = new Configs(context);
  configs.watch();
  const tree = vscode.window.createTreeView("veyraMcp.servers", { treeDataProvider: new ServersTree(configs), showCollapseAll: true });
  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...args: any[]) => {
    try { await fn(...args); } catch (error) { vscode.window.showErrorMessage((error as Error).message); }
  }));
  const serverNode = (node?: Node): Extract<Node, { kind: "server" }> | undefined => {
    const n = node ?? (tree.selection[0] as Node | undefined);
    return n?.kind === "server" ? n : undefined;
  };

  const test = async (located: Located, def: m.ServerDef, quiet = false) => {
    if (quiet ? !vscode.workspace.isTrusted : !(await canStart())) return;
    const key = keyOf(located.target, def.name);
    const ready = await runnable(located.target, def);
    if (!ready) return;
    configs.setStatus(key, { state: "checking", detail: "", at: Date.now() });
    let session: Session | undefined;
    try {
      session = await Session.open(ready.def, { cwd: located.target.folder ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, timeoutMs: 90000 });
      const tools = await session.tools().catch(() => []);
      configs.setStatus(key, { state: "ok", detail: `${tools.length} tool${tools.length === 1 ? "" : "s"}`, at: Date.now() });
      if (!quiet) vscode.window.showInformationMessage(`${def.name} works: ${session.info.name ?? "server"}${session.info.version ? ` ${session.info.version}` : ""}, ${tools.length} tool${tools.length === 1 ? "" : "s"}.`);
    } catch (error) {
      const why = m.explainFailure(error, ready.def, (error as any)?.stderr ?? "");
      const missing = ready.missing.length ? ` Not set: ${ready.missing.join(", ")}.` : "";
      configs.setStatus(key, { state: "error", detail: why.title + missing, at: Date.now() });
      // Not awaited: the check is done even while the message stays open.
      if (!quiet) vscode.window.showErrorMessage(`${def.name}: ${why.title}.${missing}`, { detail: why.detail, modal: false }, "Open Inspector")
        .then(pick => { if (pick) vscode.commands.executeCommand("veyraMcp.inspect", { kind: "server", located, def }); });
    } finally { await session?.close(); }
  };

  register("veyraMcp.refresh", () => { configs.status.clear(); configs.refresh(); });
  register("veyraMcp.addServer", (node?: Node) => AddServerPanel.show(context, configs, node?.kind === "app" ? node.located.target.id : undefined));
  register("veyraMcp.inspect", async (node?: Node) => {
    const n = serverNode(node);
    if (n && await canStart()) InspectorPanel.show(context, configs, n.located.target, n.def);
  });
  register("veyraMcp.test", async (node?: Node) => { const n = serverNode(node); if (n) await test(n.located, n.def); });
  register("veyraMcp.testAll", async () => {
    if (!(await canStart())) return;
    const all = configs.all().flatMap(l => l.servers.filter(s => !s.disabled).map(def => ({ located: l, def })));
    if (!all.length) { vscode.window.showInformationMessage("There are no servers to check yet. Add one with the + button."); return; }
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Checking MCP servers", cancellable: true }, async (progress, token) => {
      let done = 0;
      const queue = [...all];
      const worker = async () => {
        while (queue.length && !token.isCancellationRequested) {
          const item = queue.shift()!;
          await test(item.located, item.def, true);
          progress.report({ message: `${++done} of ${all.length}`, increment: 100 / all.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    });
    const failed = all.filter(i => configs.status.get(keyOf(i.located.target, i.def.name))?.state === "error").length;
    vscode.window.showInformationMessage(failed ? `${all.length - failed} of ${all.length} servers work. Hover a red one to see why.` : `All ${all.length} servers work.`);
  });
  register("veyraMcp.openConfig", async (node?: Node) => {
    const n = node ?? (tree.selection[0] as Node | undefined);
    if (!n) return;
    const target = n.located.target;
    if (!fs.existsSync(target.file)) { vscode.window.showInformationMessage(`${target.label} has no config file yet. Add a server to create it.`); return; }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target.file));
    const editor = await vscode.window.showTextDocument(doc);
    if (n.kind === "server") {
      const offset = m.entryOffset(doc.getText(), target.format, n.def.name);
      if (offset !== undefined) { const pos = doc.positionAt(offset); editor.selection = new vscode.Selection(pos, pos); editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport); }
    }
  });
  register("veyraMcp.remove", async (node?: Node) => {
    const n = serverNode(node);
    if (!n) return;
    const ok = await vscode.window.showWarningMessage(`Remove "${n.def.name}" from ${n.located.target.label}?`, { modal: true, detail: `It is deleted from ${n.located.target.file}. A backup of the file is kept as ${path.basename(n.located.target.file)}.veyra-backup.` }, "Remove");
    if (ok !== "Remove") return;
    await configs.edit(n.located.target, text => m.removeServer(text, n.located.target.format, n.def.name));
    configs.setStatus(keyOf(n.located.target, n.def.name), undefined);
  });
  register("veyraMcp.copyTo", async (node?: Node) => {
    const n = serverNode(node);
    if (!n) return;
    const from = n.located.target;
    const choices = configs.targets().filter(t => t.writable && t.file !== from.file && (configs.installed(t) || t.scope === "project")).map(t => {
      const blocked = n.def.transport !== "stdio" && t.format === "claude-desktop";
      return { label: t.label, description: t.scope === "project" ? "project" : "", detail: blocked ? "Remote servers are added in Claude Desktop under Settings → Connectors" : t.file, target: t, blocked };
    });
    const picked = await vscode.window.showQuickPick(choices.filter(c => !c.blocked), { canPickMany: true, title: `Copy "${n.def.name}" to…`, placeHolder: "Choose the apps that should get this server" });
    if (!picked?.length) return;
    const notes: string[] = [];
    for (const { target } of picked) {
      const existing = configs.read(target);
      if (existing.error) { notes.push(`${target.label}: skipped, its file has an error.`); continue; }
      if (existing.servers.some(s => s.name === n.def.name)) {
        const answer = await vscode.window.showWarningMessage(`${target.label} already has a server named "${n.def.name}". Replace it?`, { modal: true }, "Replace");
        if (answer !== "Replace") continue;
      }
      const { def, warnings } = m.translate(n.def, from.format, target.format);
      await configs.edit(target, text => m.upsertServer(text, target.format, def));
      notes.push(...warnings.map(w => `${target.label}: ${w}`));
    }
    vscode.window.showInformationMessage(`Copied "${n.def.name}" to ${picked.map(p => p.label).join(", ")}. Restart those apps if they are open.`, ...(notes.length ? [{ title: "Show notes" }] : []))
      .then(choice => { if (choice) vscode.window.showWarningMessage(notes.join("\n"), { modal: true }); });
  });
  register("veyraMcp.openCatalog", () => AddServerPanel.show(context, configs));

  context.subscriptions.push(tree, configs, vscode.workspace.onDidChangeWorkspaceFolders(() => configs.refresh()));
  return { configs }; // for the integration tests
}

export function deactivate() { return InspectorPanel.closeAll(); }
