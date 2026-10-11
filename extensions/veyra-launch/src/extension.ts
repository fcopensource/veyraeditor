import * as vscode from 'vscode';
import path from 'node:path';
import { Project, scanProject, toolVersion, portStatus, explainError } from './core';

class Item extends vscode.TreeItem {
  constructor(label: string, public children: Item[] = []) { super(label, children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None); }
}
export function activate(context: vscode.ExtensionContext) {
  const changed = new vscode.EventEmitter<void>();
  let projects: Project[] = [];
  let rows: Item[] = [];
  let running = false;
  const output = vscode.window.createOutputChannel('Veyra Launch');
  const tree = vscode.window.createTreeView('veyraLaunch.projects', { treeDataProvider: { onDidChangeTreeData: changed.event, getTreeItem: item => item, getChildren: (item?: Item) => item?.children ?? rows } });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
  status.text = '$(rocket) Launch'; status.tooltip = 'Scan project readiness'; status.command = 'veyraLaunch.scan'; status.show();
  context.subscriptions.push(changed, output, tree, status);
  const trusted = () => {
    if (vscode.workspace.isTrusted) return true;
    void vscode.window.showWarningMessage('Trust this workspace before using Veyra Launch.'); return false;
  };
  const scan = async () => {
    if (!trusted() || running) return;
    if (!vscode.workspace.workspaceFolders?.length) { void vscode.window.showInformationMessage('Open a project folder first.'); return; }
    running = true; status.text = '$(sync~spin) Scanning';
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Veyra Launch: checking projects' }, async () => {
        const tools = ['node', 'npm', 'pnpm', 'yarn', 'bun'] as const;
        const values = await Promise.all(tools.map(toolVersion));
        const versions = Object.fromEntries(tools.map((tool, i) => [tool, values[i]]));
        const files = await vscode.workspace.findFiles('**/package.json', '**/{node_modules,.git,.next,dist,build,coverage,.yarn,.pnpm-store}/**', 51);
        const sorted = files.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
        projects = []; rows = []; output.clear();
        output.appendLine('VEYRA LAUNCH — READINESS REPORT\n');
        for (const file of sorted.slice(0, 50)) {
          try {
            const project = await scanProject(path.dirname(file.fsPath), versions);
            projects.push(project);
            const checks = project.checks.map(check => {
              const item = new Item(check.title);
              item.iconPath = new vscode.ThemeIcon(check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'error' : 'warning', new vscode.ThemeColor(check.status === 'pass' ? 'testing.iconPassed' : check.status === 'fail' ? 'errorForeground' : 'editorWarning.foreground'));
              item.tooltip = check.detail; return item;
            });
            const scripts = Object.entries(project.scripts).map(([name, command]) => {
              const item = new Item(name); item.description = command; item.tooltip = command; item.iconPath = new vscode.ThemeIcon('play');
              item.command = { command: 'veyraLaunch.run', title: 'Run script', arguments: [project.root, name] }; return item;
            });
            const install = new Item('Install dependencies…'); install.iconPath = new vscode.ThemeIcon('cloud-download'); install.command = { command: 'veyraLaunch.install', title: 'Install dependencies', arguments: [project.root] };
            const root = new Item(project.name, [...checks, new Item('Scripts', scripts), install]); root.description = `${project.framework} · ${project.manager}`; root.tooltip = project.root; root.iconPath = new vscode.ThemeIcon('package'); rows.push(root);
            output.appendLine(`${project.name} | ${project.framework} | ${project.root}\n${project.checks.map(c => `[${c.status.toUpperCase()}] ${c.title}\n  ${c.detail}`).join('\n')}\n`);
          } catch (error) {
            const item = new Item(`Cannot scan ${vscode.workspace.asRelativePath(file)}`); item.tooltip = String(error); item.iconPath = new vscode.ThemeIcon('error'); rows.push(item); output.appendLine(`${file.fsPath}: ${String(error)}`);
          }
        }
        if (files.length > 50) rows.push(new Item('Scan limited to 50 packages. Open a smaller workspace to inspect more.'));
        if (!files.length) rows.push(new Item('No package.json found. Open a Node.js project.'));
        tree.message = `${projects.length} projects · local checks · refresh after changes`;
        changed.fire();
      });
    } finally { running = false; status.text = `$(rocket) Launch · ${projects.length}`; }
  };
  const choose = async (root?: string) => {
    if (running) { void vscode.window.showInformationMessage('Wait for the current scan to finish.'); return; }
    if (!projects.length) await scan();
    if (root) return projects.find(p => p.root === root);
    if (projects.length === 1) return projects[0];
    const selected = await vscode.window.showQuickPick(projects.map(p => ({ label: p.name, description: p.root, project: p })), { placeHolder: 'Choose a project' });
    return selected?.project;
  };
  const execute = async (root?: string, script?: string, install = false) => {
    if (!trusted()) return;
    const selected = await choose(root); if (!selected) return;
    // Re-read scripts and manager immediately before presenting an execution preview.
    const project = await scanProject(selected.root, {});
    if (!install && !script) script = (await vscode.window.showQuickPick(Object.entries(project.scripts).map(([label, description]) => ({ label, description })), { placeHolder: 'Choose a script to run' }))?.label;
    if (!install && (!script || !(script in project.scripts))) return;
    if (!install && (script!.startsWith('-') || /[\r\n\x00]/.test(script!))) throw new Error('Rename this script before running it: names beginning with a dash or containing control characters are unsupported.');
    const args = install ? ['install'] : ['run', script!];
    const display = `${project.manager} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    const answer = await vscode.window.showInformationMessage(`Run ${display}?`, { modal: true, detail: `Folder: ${project.root}\n${install ? 'May download dependencies and execute package lifecycle scripts.' : `Script: ${project.scripts[script!]}\nLifecycle hooks may also run.`}` }, 'Run');
    if (answer !== 'Run' || !trusted()) return;
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.root)); if (!folder) return;
    const task = new vscode.Task({ type: 'veyraLaunch', root: project.root, action: install ? 'install' : script }, folder, `${project.name}: ${install ? 'install' : script}`, 'Veyra Launch', new vscode.ShellExecution(project.manager, args.map(value => ({ value, quoting: vscode.ShellQuoting.Strong })), { cwd: project.root }), []);
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: false };
    await vscode.tasks.executeTask(task);
  };
  const register = (id: string, action: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(`veyraLaunch.${id}`, async (...args) => { try { await action(...args); } catch (error) { output.appendLine(String(error)); void vscode.window.showErrorMessage(`Veyra Launch: ${String(error)}`); } }));
  register('scan', scan); register('run', (root?: string, script?: string) => execute(root, script)); register('install', (root?: string) => execute(root, undefined, true));
  register('report', async () => { if (!rows.length) await scan(); output.show(); });
  register('port', async () => {
    const value = await vscode.window.showInputBox({ prompt: 'Check a TCP port on this extension host (remote host when using SSH/WSL)', value: '3000', validateInput: s => /^\d+$/.test(s) && +s > 0 && +s <= 65535 ? undefined : 'Enter an integer from 1 to 65535.' });
    if (value !== undefined) void vscode.window.showInformationMessage(await portStatus(Number(value)));
  });
  register('explain', async () => {
    const text = await vscode.window.showInputBox({ prompt: 'Paste an error message (processed locally; omit secrets)', ignoreFocusOut: true });
    if (text) { output.appendLine(`\nSETUP ERROR EXPLANATION\n${explainError(text)}\n`); output.show(); }
  });
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => { projects = []; rows = []; changed.fire(); tree.message = 'Workspace changed. Scan to refresh.'; }));
  context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(event => {
    if (event.execution.task.definition.type === 'veyraLaunch') {
      output.appendLine(`${event.execution.task.name}: ${event.exitCode === undefined ? 'ended without an exit code' : `exit ${event.exitCode}`}`);
      if (event.exitCode !== undefined && event.exitCode !== 0) void vscode.window.showWarningMessage('The Veyra Launch task failed. Inspect its terminal output, then use Explain a Setup Error.');
    }
  }));
}
