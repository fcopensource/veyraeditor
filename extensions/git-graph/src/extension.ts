import * as vscode from "vscode";
import * as path from "node:path";
import { EMPTY_TREE, Git, GitError } from "./git";
import { UNCOMMITTED, validRefName, type Commit, type FileChange, type Ref } from "./model";

/* Git Graph Veyra: a webview panel per repository showing the commit graph, with details, diffs and actions. */

interface GitApi { git: { path: string }; repositories: Repository[]; onDidOpenRepository: vscode.Event<Repository>; toGitUri(uri: vscode.Uri, ref: string): vscode.Uri }
interface Repository { rootUri: vscode.Uri; state: { onDidChange: vscode.Event<void> } }

const config = () => vscode.workspace.getConfiguration("veyraGit");
const short = (hash: string) => (hash === UNCOMMITTED ? "working tree" : hash.slice(0, 7));

/** Dialogs, kept in one place so the integration test can answer them. */
export const ui = {
  confirm: async (message: string, detail: string, button: string) => (await vscode.window.showWarningMessage(message, { modal: true, detail }, button)) === button,
  input: (prompt: string, value = "", validate?: (v: string) => string | undefined) => vscode.window.showInputBox({ prompt, value, validateInput: validate }),
  pick: async <T extends string>(items: { label: T; description?: string; detail?: string }[], placeHolder: string) => (await vscode.window.showQuickPick(items, { placeHolder }))?.label,
};

let api: GitApi | undefined;
async function gitApi(): Promise<GitApi | undefined> {
  if (api) return api;
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  if (!ext) return undefined;
  api = (ext.isActive ? ext.exports : await ext.activate()).getAPI(1);
  return api;
}

export class GraphPanel {
  static readonly panels = new Map<string, GraphPanel>();
  readonly git: Git;
  /** For tests: how many rows the view drew last, and what it was sent. */
  rendered = -1;
  lastData: { commits: Commit[]; refs: Ref[]; head: { hash?: string; branch?: string } } | undefined;
  private max = config().get<number>("commitsToLoad", 400);
  private branch: string | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private disposables: vscode.Disposable[] = [];

  static async show(context: vscode.ExtensionContext, repo: Repository): Promise<GraphPanel> {
    const root = repo.rootUri.fsPath;
    const existing = GraphPanel.panels.get(root);
    if (existing) { existing.panel.reveal(); return existing; }
    const panel = vscode.window.createWebviewPanel("veyraGit.graph", `Git Graph · ${path.basename(root)}`, vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.iconPath = { light: vscode.Uri.joinPath(context.extensionUri, "media", "tab-light.svg"), dark: vscode.Uri.joinPath(context.extensionUri, "media", "tab-dark.svg") };
    const graph = new GraphPanel(context, panel, repo, new Git((await gitApi())?.git.path || "git", root));
    GraphPanel.panels.set(root, graph);
    return graph;
  }

  private constructor(context: vscode.ExtensionContext, readonly panel: vscode.WebviewPanel, readonly repo: Repository, git: Git) {
    this.git = git;
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join("");
    const src = (f: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", f));
    panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${panel.webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${src("viewer.css")}"></head>
<body><div id="app"><div class="loading" role="status"><div class="spinner"></div><span>Reading history…</span></div></div><script nonce="${nonce}" src="${src("viewer.js")}"></script></body></html>`;
    this.disposables.push(
      panel.webview.onDidReceiveMessage(m => this.onMessage(m).catch(e => this.fail(e))),
      repo.state.onDidChange(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraGit")) this.scheduleRefresh(); }),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  private dispose() {
    GraphPanel.panels.delete(this.git.root);
    clearTimeout(this.refreshTimer);
    this.disposables.forEach(d => d.dispose());
  }

  private post(message: unknown) { return this.panel.webview.postMessage(message); }
  private fail(error: unknown) {
    const message = error instanceof GitError ? error.message : (error as Error)?.message ?? String(error);
    vscode.window.showErrorMessage(`Git Graph Veyra: ${message}`);
    this.post({ type: "busy", busy: false });
  }
  private scheduleRefresh() { clearTimeout(this.refreshTimer); this.refreshTimer = setTimeout(() => this.load().catch(e => this.fail(e)), 350); }

  async load() {
    const remotes = config().get<boolean>("showRemoteBranches", true);
    const [{ commits, more }, refs, head] = await Promise.all([this.git.log({ max: this.max, skip: 0, branch: this.branch, remotes }), this.git.refs(), this.git.head()]);
    const uncommitted = this.branch ? undefined : await this.git.uncommitted(head.hash);
    if (uncommitted) commits.unshift(uncommitted);
    this.lastData = { commits, refs, head };
    await this.post({ type: "graph", repo: path.basename(this.git.root), commits, refs, head, more, branch: this.branch ?? "", dateFormat: config().get("dateFormat", "relative"), remotes });
  }

  async onMessage(m: any) {
    switch (m.type) {
      case "ready": case "refresh": return this.load();
      case "more": this.max += config().get<number>("commitsToLoad", 400); return this.load();
      case "branch": this.branch = m.branch || undefined; return this.load();
      case "rendered": this.rendered = m.rows; return;
      case "details": return this.details(m.hash, m.base);
      case "diff": return this.openDiff(m.hash, m.base, m.file as FileChange);
      case "openFile": return vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path.join(this.git.root, m.path)));
      case "copy": await vscode.env.clipboard.writeText(String(m.text)); return this.post({ type: "toast", text: m.what ? `Copied ${m.what}` : "Copied" });
      case "fetch": return this.fetch();
      case "action": return this.action(m.action, m);
    }
    return undefined;
  }

  async details(hash: string, base?: string) {
    if (hash === UNCOMMITTED) return this.post({ type: "details", hash, files: await this.git.status() });
    const [info, files] = await Promise.all([this.git.details(hash), this.git.changes(hash, base)]);
    return this.post({ type: "details", hash, base, info, files });
  }

  private async openDiff(hash: string, base: string | undefined, file: FileChange) {
    const toGitUri = (await gitApi())!.toGitUri;
    const uri = vscode.Uri.file(path.join(this.git.root, file.path));
    const oldUri = vscode.Uri.file(path.join(this.git.root, file.oldPath ?? file.path));
    const name = path.basename(file.path);
    if (hash === UNCOMMITTED) {
      if (file.status === "D") return vscode.commands.executeCommand("vscode.open", toGitUri(uri, "HEAD"));
      if (file.status === "U" || file.status === "A") return vscode.commands.executeCommand("vscode.open", uri);
      return vscode.commands.executeCommand("vscode.diff", toGitUri(oldUri, "HEAD"), uri, `${name} (HEAD ↔ working tree)`);
    }
    const from = base ?? (await this.git.parentsOf(hash))[0] ?? EMPTY_TREE;
    if (file.status === "A") return vscode.commands.executeCommand("vscode.open", toGitUri(uri, hash), { preview: true });
    if (file.status === "D") return vscode.commands.executeCommand("vscode.open", toGitUri(oldUri, from), { preview: true });
    return vscode.commands.executeCommand("vscode.diff", toGitUri(oldUri, from), toGitUri(uri, hash), `${name} (${short(from === EMPTY_TREE ? "empty" : from)} ↔ ${short(hash)})`, { preview: true });
  }

  async fetch() {
    await this.post({ type: "busy", busy: true, text: "Fetching…" });
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Fetching" }, () => this.git.run(["fetch", "--all", "--prune"]));
    await this.post({ type: "busy", busy: false });
    await this.post({ type: "toast", text: "Fetched from all remotes" });
    return this.load();
  }

  /** Runs a git command for an action, then shows the result in the graph. */
  private async exec(args: string[], done: string) {
    await this.post({ type: "busy", busy: true, text: `${done.replace(/\.$/, "")}…` });
    try { await this.git.run(args); }
    finally { await this.post({ type: "busy", busy: false }); }
    await this.post({ type: "toast", text: done });
    await this.load();
  }

  async action(name: string, m: { hash?: string; ref?: string; kind?: string; subject?: string; merge?: boolean }) {
    const hash = m.hash ?? "", ref = m.ref ?? "";
    const head = this.lastData?.head;
    const current = head?.branch ? `"${head.branch}"` : "the current commit";
    switch (name) {
      case "checkoutCommit":
        if (await ui.confirm(`Check out commit ${short(hash)}?`, "You'll be on this commit without a branch (detached HEAD). Create a branch from it to keep new work.", "Check Out"))
          return this.exec(["checkout", "--detach", hash], `Checked out ${short(hash)}`);
        return;
      case "createBranch": {
        const branch = await ui.input(`New branch at ${short(hash)}`, "", validRefName);
        if (!branch) return;
        const how = await ui.pick([{ label: "Create and Check Out" }, { label: "Create" }], `Create "${branch}"`);
        if (!how) return;
        return this.exec(how === "Create" ? ["branch", branch, hash] : ["checkout", "-b", branch, hash], `Created branch ${branch}`);
      }
      case "createTag": {
        const tag = await ui.input(`New tag at ${short(hash)}`, "", validRefName);
        if (!tag) return;
        const message = await ui.input("Tag message (leave empty for a lightweight tag)", "");
        if (message === undefined) return;
        return this.exec(message ? ["tag", "-a", tag, "-m", message, hash] : ["tag", tag, hash], `Created tag ${tag}`);
      }
      case "cherryPick":
        if (await ui.confirm(`Cherry-pick ${short(hash)} onto ${current}?`, m.subject ?? "", "Cherry-Pick"))
          return this.exec(["cherry-pick", ...(m.merge ? ["-m", "1"] : []), hash], `Cherry-picked ${short(hash)}`);
        return;
      case "revert":
        if (await ui.confirm(`Revert ${short(hash)}?`, `A new commit on ${current} will undo: ${m.subject ?? ""}`, "Revert"))
          return this.exec(["revert", "--no-edit", ...(m.merge ? ["-m", "1"] : []), hash], `Reverted ${short(hash)}`);
        return;
      case "reset": {
        const mode = await ui.pick([
          { label: "Soft", description: "Keep all changes, staged" },
          { label: "Mixed", description: "Keep all changes, unstaged" },
          { label: "Hard", description: "Discard all changes" },
        ], `Reset ${current} to ${short(hash)}`);
        if (!mode) return;
        if (mode === "Hard" && !(await ui.confirm(`Discard all changes and reset ${current} to ${short(hash)}?`, "Uncommitted changes and later commits on this branch will be lost. This can't be undone here.", "Reset Hard"))) return;
        return this.exec(["reset", `--${mode.toLowerCase()}`, hash], `Reset to ${short(hash)}`);
      }
      case "checkoutBranch": {
        if (m.kind === "remote") {
          const local = ref.split("/").slice(1).join("/");
          const exists = this.lastData?.refs.some(r => r.kind === "head" && r.name === local);
          return this.exec(exists ? ["checkout", local] : ["checkout", "--track", ref], `Checked out ${local}`);
        }
        return this.exec(["checkout", ref], `Checked out ${ref}`);
      }
      case "mergeBranch":
        if (await ui.confirm(`Merge "${ref}" into ${current}?`, "", "Merge")) return this.exec(["merge", "--no-edit", ref], `Merged ${ref}`);
        return;
      case "renameBranch": {
        const to = await ui.input(`Rename "${ref}" to`, ref, validRefName);
        if (!to || to === ref) return;
        return this.exec(["branch", "-m", ref, to], `Renamed to ${to}`);
      }
      case "deleteBranch": {
        if (!(await ui.confirm(`Delete branch "${ref}"?`, "", "Delete"))) return;
        try { return await this.exec(["branch", "-d", ref], `Deleted ${ref}`); }
        catch (e) {
          if (!/not fully merged/i.test((e as GitError).output ?? "")) throw e;
          if (await ui.confirm(`"${ref}" isn't merged. Delete it anyway?`, "Its commits will only be reachable from other branches or tags.", "Delete Anyway"))
            return this.exec(["branch", "-D", ref], `Deleted ${ref}`);
          return;
        }
      }
      case "pushBranch": {
        const remotes = (await this.git.run(["remote"])).split(/\r?\n/).filter(Boolean);
        if (!remotes.length) { vscode.window.showInformationMessage("This repository has no remote to push to."); return; }
        const upstream = this.lastData?.refs.find(r => r.kind === "head" && r.name === ref)?.upstream;
        if (upstream) return this.exec(["push", upstream.split("/")[0], ref], `Pushed ${ref}`);
        const remote = remotes.length === 1 ? remotes[0] : await ui.pick(remotes.map(r => ({ label: r })), `Push "${ref}" to`);
        if (!remote) return;
        return this.exec(["push", "-u", remote, ref], `Pushed ${ref} to ${remote}`);
      }
      case "deleteTag":
        if (await ui.confirm(`Delete tag "${ref}"?`, "This only deletes it here, not on remotes.", "Delete")) return this.exec(["tag", "-d", ref], `Deleted tag ${ref}`);
        return;
      case "pushTag": {
        const remotes = (await this.git.run(["remote"])).split(/\r?\n/).filter(Boolean);
        const remote = remotes.length === 1 ? remotes[0] : await ui.pick(remotes.map(r => ({ label: r })), `Push tag "${ref}" to`);
        if (!remote) return;
        return this.exec(["push", remote, `refs/tags/${ref}`], `Pushed tag ${ref}`);
      }
      case "stash":
        return this.exec(["stash", "push", "--include-untracked"], "Stashed your changes");
      case "openScm":
        return vscode.commands.executeCommand("workbench.view.scm");
    }
    return undefined;
  }
}

async function pickRepository(arg?: { rootUri?: vscode.Uri }): Promise<Repository | undefined> {
  const git = await gitApi();
  if (!git) { vscode.window.showErrorMessage("Git Graph Veyra needs VS Code's built-in Git extension, which is turned off."); return; }
  if (arg?.rootUri) { const repo = git.repositories.find(r => r.rootUri.fsPath === arg.rootUri!.fsPath); if (repo) return repo; }
  if (!git.repositories.length) {
    const action = await vscode.window.showInformationMessage("There's no git repository open. Open a folder that uses git, or start one with git init.", "Open Folder");
    if (action) vscode.commands.executeCommand("vscode.openFolder");
    return;
  }
  if (git.repositories.length === 1) return git.repositories[0];
  const active = vscode.window.activeTextEditor?.document.uri.fsPath;
  const items = git.repositories.map(r => ({ label: path.basename(r.rootUri.fsPath), description: r.rootUri.fsPath, repo: r }));
  if (active) { const hit = items.find(i => active.startsWith(i.description + path.sep)); if (hit) return hit.repo; }
  return (await vscode.window.showQuickPick(items, { placeHolder: "Which repository?" }))?.repo;
}

export function activate(context: vscode.ExtensionContext) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.text = "$(git-commit) Git Graph";
  item.tooltip = "View the Git Graph (Ctrl+Alt+G)";
  item.command = "veyraGit.view";
  const updateItem = async () => {
    const git = config().get<boolean>("showStatusBarItem", true) ? await gitApi() : undefined;
    if (git?.repositories.length) item.show(); else item.hide();
  };
  context.subscriptions.push(
    item,
    vscode.commands.registerCommand("veyraGit.view", async (arg?: { rootUri?: vscode.Uri }) => {
      const repo = await pickRepository(arg);
      return repo ? GraphPanel.show(context, repo) : undefined;
    }),
    vscode.commands.registerCommand("veyraGit.fetch", async () => { for (const p of GraphPanel.panels.values()) await p.fetch(); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("veyraGit.showStatusBarItem")) updateItem(); }),
  );
  gitApi().then(git => { if (git) context.subscriptions.push(git.onDidOpenRepository(() => updateItem())); updateItem(); });
  return { GraphPanel, ui }; // for the integration tests
}

export function deactivate() {}
