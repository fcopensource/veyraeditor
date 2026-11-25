// Project Manager Veyra: your projects in one place. Save folders, find Git repositories, and switch in a keystroke.
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  KINDS, Found, Kind, Project, SortOrder, allTags, expandHome, kindOf, parseProjects, remove, samePath, scanForRepos,
  serializeProjects, setTags, shortPath, sortProjects, touch, upsert, withTag,
} from './model';

const CFG = 'veyraProjects';
const HOME = os.homedir();
const config = () => vscode.workspace.getConfiguration(CFG);

/** projects.json: in the folder from veyraProjects.projectsLocation, or in the extension's own storage. */
class Store {
  projects: Project[] = [];
  error?: string;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  constructor(private readonly storage: vscode.Uri) {}

  get file(): string {
    const custom = (config().get<string>('projectsLocation') || '').trim();
    return path.join(custom ? expandHome(custom, HOME) : this.storage.fsPath, 'projects.json');
  }

  async load(): Promise<void> {
    let text = '';
    try { text = await fs.promises.readFile(this.file, 'utf8'); } catch { /* no file yet: no projects */ }
    const { projects, error } = parseProjects(text);
    this.projects = projects; this.error = error;
    this.changed.fire();
  }

  async save(projects: Project[]): Promise<void> {
    this.projects = projects; this.error = undefined;
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    await fs.promises.writeFile(this.file, serializeProjects(projects), 'utf8');
    this.changed.fire();
  }

  find(rootPath: string): Project | undefined { return this.projects.find(p => samePath(p.rootPath, rootPath)); }
}

/** The folder (or .code-workspace file) this window has open, if it's on this computer. */
function currentRoot(): string | undefined {
  const ws = vscode.workspace.workspaceFile;
  if (ws?.scheme === 'file') return ws.fsPath;
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.scheme === 'file' ? folder.uri.fsPath : undefined;
}

const exists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };

/** The kind of project in a folder, cached so the tree doesn't read the disk on every refresh. */
const kinds = new Map<string, Kind>();
function kindFor(rootPath: string): Kind {
  let k = kinds.get(rootPath);
  if (!k) {
    try { k = rootPath.endsWith('.code-workspace') ? 'folder' : kindOf(fs.readdirSync(rootPath)); } catch { k = 'folder'; }
    kinds.set(rootPath, k);
  }
  return k;
}

type Source = 'saved' | 'git' | 'recent';
type Node =
  | { type: 'section'; id: 'saved' | 'git' | 'recent'; label: string }
  | { type: 'tag'; tag: string | null }
  | { type: 'project'; source: Source; name: string; rootPath: string; tags: string[] }
  | { type: 'hint'; label: string; command?: vscode.Command; icon: string };

class Tree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  repos: Found[] = [];
  recent: { name: string; rootPath: string }[] = [];
  scanning = false;
  constructor(private readonly store: Store) {}

  refresh(): void { this.changed.fire(undefined); }

  /** Scans the base folders from veyraProjects.scanFolders for Git repositories. */
  async scan(): Promise<void> {
    const bases = (config().get<string[]>('scanFolders') || []).map(b => expandHome(b.trim(), HOME)).filter(Boolean);
    this.scanning = true; this.refresh();
    try {
      this.repos = bases.length ? await scanForRepos(bases, { depth: config().get<number>('scanDepth', 4), ignore: config().get<string[]>('ignoreFolders', []) }) : [];
      for (const r of this.repos) kinds.set(r.rootPath, r.kind);
    } finally { this.scanning = false; this.refresh(); }
  }

  /** The folders VS Code opened recently, from its own list. */
  async loadRecent(): Promise<void> {
    try {
      const data = await vscode.commands.executeCommand<{ workspaces?: { folderUri?: vscode.Uri; workspace?: { configPath: vscode.Uri }; label?: string }[] }>('_workbench.getRecentlyOpened');
      this.recent = (data?.workspaces || [])
        .map(w => w.folderUri || w.workspace?.configPath)
        .filter((u): u is vscode.Uri => !!u && u.scheme === 'file')
        .map(u => ({ name: path.basename(u.fsPath).replace(/\.code-workspace$/, ''), rootPath: u.fsPath }))
        .slice(0, config().get<number>('recentLimit', 10));
    } catch { this.recent = []; }
    this.refresh();
  }

  sorted(): Project[] { return sortProjects(this.store.projects, config().get<SortOrder>('sortBy', 'name')); }

  getChildren(node?: Node): Node[] {
    const saved = this.sorted();
    if (!node) {
      const out: Node[] = [{ type: 'section', id: 'saved', label: 'Saved' }, { type: 'section', id: 'git', label: 'Git Repositories' }];
      if (config().get<boolean>('showRecent', true)) out.push({ type: 'section', id: 'recent', label: 'Recent' });
      return out;
    }
    if (node.type === 'section' && node.id === 'saved') {
      if (this.store.error) return [{ type: 'hint', label: this.store.error, icon: 'warning', command: { command: 'veyraProjects.editProjects', title: 'Edit projects.json' } }];
      if (!saved.length) return [{ type: 'hint', label: 'Save this folder as a project', icon: 'add', command: { command: 'veyraProjects.save', title: 'Save Project' } }];
      if (config().get<boolean>('groupByTag', false) && allTags(saved).length) {
        const groups: Node[] = allTags(saved).map(tag => ({ type: 'tag', tag }));
        if (withTag(saved, null).length) groups.push({ type: 'tag', tag: null });
        return groups;
      }
      return saved.map(p => ({ type: 'project', source: 'saved', name: p.name, rootPath: p.rootPath, tags: p.tags }));
    }
    if (node.type === 'tag') return withTag(saved, node.tag).map(p => ({ type: 'project', source: 'saved', name: p.name, rootPath: p.rootPath, tags: p.tags }));
    if (node.type === 'section' && node.id === 'git') {
      if (this.scanning) return [{ type: 'hint', label: 'Looking for repositories…', icon: 'loading~spin' }];
      if (!(config().get<string[]>('scanFolders') || []).length) return [{ type: 'hint', label: 'Choose a folder to look for Git repositories in', icon: 'search', command: { command: 'veyraProjects.addScanFolder', title: 'Add a Folder to Scan' } }];
      if (!this.repos.length) return [{ type: 'hint', label: 'No Git repositories found. Add another folder?', icon: 'search', command: { command: 'veyraProjects.addScanFolder', title: 'Add a Folder to Scan' } }];
      return this.repos.map(r => ({ type: 'project', source: 'git', name: r.name, rootPath: r.rootPath, tags: [] }));
    }
    if (node.type === 'section' && node.id === 'recent') {
      if (!this.recent.length) return [{ type: 'hint', label: 'Folders you open will show up here', icon: 'history' }];
      return this.recent.map(r => ({ type: 'project', source: 'recent', name: r.name, rootPath: r.rootPath, tags: [] }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === 'section') {
      const count = node.id === 'saved' ? this.store.projects.length : node.id === 'git' ? this.repos.length : this.recent.length;
      const item = new vscode.TreeItem(node.label, node.id === 'recent' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
      item.id = 'section:' + node.id;
      item.description = count ? String(count) : undefined;
      item.iconPath = new vscode.ThemeIcon(node.id === 'saved' ? 'star-full' : node.id === 'git' ? 'source-control' : 'history');
      item.contextValue = 'section-' + node.id;
      return item;
    }
    if (node.type === 'tag') {
      const item = new vscode.TreeItem(node.tag ?? 'No tag', vscode.TreeItemCollapsibleState.Expanded);
      item.id = 'tag:' + (node.tag ?? '');
      item.iconPath = new vscode.ThemeIcon(node.tag ? 'tag' : 'circle-outline');
      item.description = String(withTag(this.store.projects, node.tag).length);
      return item;
    }
    if (node.type === 'hint') {
      const item = new vscode.TreeItem(node.label);
      item.iconPath = new vscode.ThemeIcon(node.icon);
      item.command = node.command;
      item.contextValue = 'hint';
      return item;
    }
    const here = currentRoot();
    const isCurrent = !!here && samePath(here, node.rootPath);
    const missing = !exists(node.rootPath);
    const kind = missing ? 'folder' : kindFor(node.rootPath);
    const item = new vscode.TreeItem(node.name);
    item.id = node.source + ':' + node.rootPath;
    item.description = (isCurrent ? '● ' : '') + shortPath(node.rootPath, HOME);
    item.tooltip = new vscode.MarkdownString(`**${node.name}**${isCurrent ? ' (open in this window)' : ''}\n\n${node.rootPath}\n\n${missing ? '$(warning) This folder no longer exists.' : KINDS[kind].label}${node.tags.length ? `\n\nTags: ${node.tags.join(', ')}` : ''}`, true);
    item.iconPath = new vscode.ThemeIcon(missing ? 'warning' : KINDS[kind].icon, missing ? new vscode.ThemeColor('problemsWarningIcon.foreground') : isCurrent ? new vscode.ThemeColor('charts.green') : undefined);
    item.contextValue = node.source === 'saved' ? 'project-saved' : 'project-unsaved';
    item.command = { command: 'veyraProjects.openProject', title: 'Open', arguments: [node] };
    return item;
  }
}

type ProjectNode = Extract<Node, { type: 'project' }>;

export function activate(context: vscode.ExtensionContext) {
  const store = new Store(context.globalStorageUri);
  const tree = new Tree(store);
  const view = vscode.window.createTreeView('veyraProjects.tree', { treeDataProvider: tree, showCollapseAll: true });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'veyraProjects.list';

  const updateStatus = () => {
    const here = currentRoot();
    const saved = here ? store.find(here) : undefined;
    if (!config().get<boolean>('showInStatusBar', true) || !here) { status.hide(); return; }
    status.text = `$(folder-opened) ${saved ? saved.name : path.basename(here).replace(/\.code-workspace$/, '')}`;
    status.tooltip = saved ? `Project: ${saved.name}. Click to switch projects (Shift+Alt+P).` : 'Switch projects (Shift+Alt+P). This folder isn\'t saved yet: right-click a project in the Projects view, or run "Save Project".';
    status.show();
  };
  store.onDidChange(() => { tree.refresh(); updateStatus(); vscode.commands.executeCommand('setContext', 'veyraProjects.saved', !!(currentRoot() && store.find(currentRoot()!))); });

  const rootOf = (arg?: ProjectNode | vscode.Uri): string | undefined => arg instanceof vscode.Uri ? arg.fsPath : arg?.rootPath ?? currentRoot();

  async function open(rootPath: string, newWindow: boolean) {
    if (!exists(rootPath)) {
      const actions = store.find(rootPath) ? ['Remove from Projects'] : [];
      const pick = await vscode.window.showWarningMessage(`${rootPath} no longer exists.`, ...actions);
      if (pick === 'Remove from Projects') await store.save(remove(store.projects, rootPath));
      return;
    }
    if (store.find(rootPath)) await store.save(touch(store.projects, rootPath, Date.now()));
    const here = currentRoot();
    if (!newWindow && here && samePath(here, rootPath)) return;
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(rootPath), { forceNewWindow: newWindow });
  }

  async function save(rootPath?: string, suggested?: string) {
    if (!rootPath) { vscode.window.showInformationMessage('Open a folder first, then save it as a project.'); return; }
    const existing = store.find(rootPath);
    const name = await vscode.window.showInputBox({
      title: existing ? 'Rename Project' : 'Save Project', prompt: rootPath,
      value: existing?.name ?? suggested ?? path.basename(rootPath).replace(/\.code-workspace$/, ''),
      validateInput: v => v.trim() ? undefined : 'Give the project a name',
    });
    if (!name) return;
    await store.save(upsert(store.projects, name.trim(), rootPath));
    vscode.window.setStatusBarMessage(`$(check) Saved project ${name.trim()}`, 3000);
  }

  /** The quick switcher: saved projects first, then Git repositories, then recent folders, without duplicates. */
  async function list(newWindowDefault = config().get<boolean>('openInNewWindow', false)) {
    type Item = vscode.QuickPickItem & { rootPath?: string };
    const newWindowButton = { iconPath: new vscode.ThemeIcon('empty-window'), tooltip: 'Open in a new window' };
    const here = currentRoot();
    const seen = new Set<string>();
    const items: Item[] = [];
    const add = (heading: string, list: { name: string; rootPath: string; tags?: string[] }[]) => {
      const fresh = list.filter(p => { const k = p.rootPath.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!fresh.length) return;
      items.push({ label: heading, kind: vscode.QuickPickItemKind.Separator });
      for (const p of fresh) {
        const current = !!here && samePath(here, p.rootPath);
        items.push({
          label: `$(${exists(p.rootPath) ? KINDS[kindFor(p.rootPath)].icon : 'warning'}) ${p.name}`,
          description: (current ? '● open · ' : '') + (p.tags?.length ? p.tags.map(t => '#' + t).join(' ') : ''),
          detail: shortPath(p.rootPath, HOME), rootPath: p.rootPath, buttons: [newWindowButton],
        });
      }
    };
    add('Saved', tree.sorted());
    add('Git Repositories', tree.repos);
    if (config().get<boolean>('showRecent', true)) add('Recent', tree.recent);
    if (!items.length) {
      const pick = await vscode.window.showInformationMessage('No projects yet. Save this folder, or choose a folder to find Git repositories in.', 'Save Project', 'Find Repositories');
      if (pick === 'Save Project') await save(currentRoot());
      if (pick === 'Find Repositories') await vscode.commands.executeCommand('veyraProjects.addScanFolder');
      return;
    }
    const qp = vscode.window.createQuickPick<Item>();
    qp.title = 'Open a Project';
    qp.placeholder = newWindowDefault ? 'Type to search. Enter opens in a new window.' : 'Type to search. Enter opens here; the window button opens a new window.';
    qp.matchOnDescription = true; qp.matchOnDetail = true;
    qp.items = items;
    qp.onDidTriggerItemButton(e => { qp.hide(); if (e.item.rootPath) void open(e.item.rootPath, true); });
    qp.onDidAccept(() => { const item = qp.selectedItems[0]; qp.hide(); if (item?.rootPath) void open(item.rootPath, newWindowDefault); });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  }

  context.subscriptions.push(
    view, status,
    vscode.commands.registerCommand('veyraProjects.list', () => list()),
    vscode.commands.registerCommand('veyraProjects.listNewWindow', () => list(true)),
    vscode.commands.registerCommand('veyraProjects.save', (arg?: ProjectNode | vscode.Uri) => save(rootOf(arg), arg && !(arg instanceof vscode.Uri) ? arg.name : undefined)),
    vscode.commands.registerCommand('veyraProjects.openProject', (node: ProjectNode) => open(node.rootPath, config().get<boolean>('openInNewWindow', false))),
    vscode.commands.registerCommand('veyraProjects.openHere', (node: ProjectNode) => open(node.rootPath, false)),
    vscode.commands.registerCommand('veyraProjects.openNewWindow', (node: ProjectNode) => open(node.rootPath, true)),
    vscode.commands.registerCommand('veyraProjects.rename', (node?: ProjectNode) => save(rootOf(node))),
    vscode.commands.registerCommand('veyraProjects.remove', async (node?: ProjectNode) => {
      const root = rootOf(node); const p = root && store.find(root);
      if (!p) return;
      const ok = await vscode.window.showWarningMessage(`Remove ${p.name} from your projects? The folder itself isn't touched.`, { modal: true }, 'Remove');
      if (ok === 'Remove') await store.save(remove(store.projects, p.rootPath));
    }),
    vscode.commands.registerCommand('veyraProjects.editTags', async (node?: ProjectNode) => {
      const root = rootOf(node); const p = root && store.find(root);
      if (!p) { vscode.window.showInformationMessage('Save the project first, then add tags.'); return; }
      const known = allTags(store.projects);
      type T = vscode.QuickPickItem & { tag: string };
      const qp = vscode.window.createQuickPick<T>();
      qp.title = `Tags for ${p.name}`; qp.canSelectMany = true;
      qp.placeholder = 'Pick tags, or type a new one and press Enter';
      const base = known.map(tag => ({ label: tag, tag }));
      qp.items = base;
      qp.selectedItems = base.filter(i => p.tags.includes(i.tag));
      qp.onDidChangeValue(v => {
        const t = v.trim();
        const extra = t && !known.includes(t) ? [{ label: t, description: 'new tag', tag: t }] : [];
        const keep = qp.selectedItems;
        qp.items = [...extra, ...base];
        qp.selectedItems = qp.items.filter(i => keep.some(k => k.tag === i.tag));
      });
      qp.onDidAccept(async () => {
        const typed = qp.value.trim();
        const tags = qp.selectedItems.map(i => i.tag);
        if (typed && !tags.includes(typed) && !qp.selectedItems.length) tags.push(typed);
        qp.hide();
        await store.save(setTags(store.projects, p.rootPath, tags));
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
    }),
    vscode.commands.registerCommand('veyraProjects.toggleGroupByTag', () => config().update('groupByTag', !config().get<boolean>('groupByTag', false), vscode.ConfigurationTarget.Global)),
    vscode.commands.registerCommand('veyraProjects.sortBy', async () => {
      const options: { label: string; value: SortOrder }[] = [{ label: 'Name', value: 'name' }, { label: 'Recently opened', value: 'recent' }, { label: 'The order I saved them in', value: 'saved' }];
      const current = config().get<SortOrder>('sortBy', 'name');
      const pick = await vscode.window.showQuickPick(options.map(o => ({ ...o, description: o.value === current ? 'current' : undefined })), { title: 'Sort Saved Projects By' });
      if (pick) await config().update('sortBy', pick.value, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('veyraProjects.editProjects', async () => {
      if (!exists(store.file)) await store.save(store.projects);
      await vscode.window.showTextDocument(vscode.Uri.file(store.file));
    }),
    vscode.commands.registerCommand('veyraProjects.addScanFolder', async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Look for repositories here', title: 'Folders with your Git repositories' });
      if (!picked?.length) return;
      const now = config().get<string[]>('scanFolders') || [];
      const next = [...now, ...picked.map(u => u.fsPath).filter(p => !now.some(n => samePath(expandHome(n, HOME), p)))];
      await config().update('scanFolders', next, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('veyraProjects.refresh', async () => { kinds.clear(); await Promise.all([store.load(), tree.scan(), tree.loadRecent()]); }),
    vscode.commands.registerCommand('veyraProjects.revealInOS', (node?: ProjectNode) => { const r = rootOf(node); if (r) vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(r)); }),
    vscode.commands.registerCommand('veyraProjects.copyPath', async (node?: ProjectNode) => { const r = rootOf(node); if (r) { await vscode.env.clipboard.writeText(r); vscode.window.setStatusBarMessage('$(check) Path copied', 2000); } }),
    vscode.commands.registerCommand('veyraProjects.openTerminal', (node?: ProjectNode) => { const r = rootOf(node); if (r && exists(r)) vscode.window.createTerminal({ name: path.basename(r), cwd: r.endsWith('.code-workspace') ? path.dirname(r) : r }).show(); }),
    vscode.workspace.onDidSaveTextDocument(doc => { if (samePath(doc.uri.fsPath, store.file)) void store.load(); }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${CFG}.projectsLocation`)) void store.load();
      if (e.affectsConfiguration(`${CFG}.scanFolders`) || e.affectsConfiguration(`${CFG}.scanDepth`) || e.affectsConfiguration(`${CFG}.ignoreFolders`)) void tree.scan();
      if (e.affectsConfiguration(`${CFG}.recentLimit`) || e.affectsConfiguration(`${CFG}.showRecent`)) void tree.loadRecent();
      if (e.affectsConfiguration(`${CFG}.showInStatusBar`)) updateStatus();
      if (e.affectsConfiguration(`${CFG}.groupByTag`) || e.affectsConfiguration(`${CFG}.sortBy`)) tree.refresh();
    }),
  );

  const ready = Promise.all([store.load(), tree.scan(), tree.loadRecent()]).then(() => updateStatus());
  return { store, tree, view, ready, list };
}

export function deactivate() { /* nothing to clean up */ }
