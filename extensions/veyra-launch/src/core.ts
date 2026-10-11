import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import net from 'node:net';
import semver from 'semver';

export type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type Check = { status: 'pass' | 'warn' | 'fail'; title: string; detail: string };
export type Project = { root: string; name: string; framework: string; manager: Manager; scripts: Record<string, string>; checks: Check[] };
const locks: Record<string, Manager> = { 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function chooseManager(pkg: Record<string, unknown>, files: string[]): { manager: Manager; ambiguous: boolean } {
  const declared = typeof pkg.packageManager === 'string' ? /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager)?.[1] as Manager | undefined : undefined;
  const found = [...new Set(files.map(f => locks[f]).filter(Boolean))];
  return { manager: declared ?? found[0] ?? 'npm', ambiguous: found.length > 1 || !!declared && found.some(m => m !== declared) };
}
export function versionCheck(actual: string | undefined, required: unknown): Check {
  if (!actual || !semver.valid(actual)) return { status: 'fail', title: 'Node.js not available on PATH', detail: 'Install Node.js, then restart VS Code so its extension host inherits the updated PATH.' };
  if (typeof required !== 'string') return { status: 'warn', title: `Node.js ${actual}`, detail: 'No engines.node requirement is declared; compatibility has not been verified.' };
  if (!semver.validRange(required)) return { status: 'warn', title: 'Unrecognized Node version requirement', detail: `engines.node: ${required}` };
  return { status: semver.satisfies(actual, required) ? 'pass' : 'fail', title: `Node.js ${actual} · requires ${required}`, detail: 'Checked against package.json engines.node using semantic version ranges.' };
}
export async function toolVersion(tool: 'node' | Manager): Promise<string | undefined> {
  // Fixed executable names only. Never interpolate workspace data into a shell.
  const windows = process.platform === 'win32' && tool !== 'node' && tool !== 'bun';
  return new Promise(resolve => execFile(windows ? 'cmd.exe' : tool, windows ? ['/d', '/c', `${tool} --version`] : ['--version'], { timeout: 5000, maxBuffer: 16384, windowsHide: true }, (error, stdout) => resolve(error ? undefined : stdout.trim())));
}
export async function scanProject(root: string, versions: Partial<Record<'node' | Manager, string>>): Promise<Project> {
  const file = path.join(root, 'package.json');
  const stat = await fs.stat(file);
  if (stat.size > 1024 * 1024) throw new Error('package.json exceeds the 1 MB scan limit.');
  const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('package.json must contain a JSON object.');
  const pkg = record(parsed);
  const files = await fs.readdir(root);
  const { manager, ambiguous } = chooseManager(pkg, files);
  const deps = { ...record(pkg.dependencies), ...record(pkg.devDependencies) };
  const framework = 'next' in deps ? 'Next.js' : 'vite' in deps ? 'Vite' : '@angular/core' in deps ? 'Angular' : 'nuxt' in deps ? 'Nuxt' : 'Node.js';
  const scripts = Object.fromEntries(Object.entries(record(pkg.scripts)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const checks: Check[] = [versionCheck(versions.node, record(pkg.engines).node)];
  checks.push({ status: versions[manager] ? 'pass' : 'fail', title: versions[manager] ? `${manager} ${versions[manager]} available` : `${manager} not available on PATH`, detail: 'Selected using packageManager, then lockfile, then npm. Package-manager version compatibility is not checked.' });
  if (ambiguous) checks.push({ status: 'warn', title: 'Conflicting package-manager evidence', detail: 'Multiple lockfile types or a packageManager mismatch were found. Resolve the conflict before installing.' });
  const installed = files.includes('node_modules') || files.includes('.pnp.cjs');
  checks.push({ status: Object.keys(deps).length === 0 || installed ? 'pass' : 'warn', title: Object.keys(deps).length === 0 ? 'No dependencies declared' : installed ? 'Dependency installation marker found' : 'Dependencies may need installation', detail: 'Checks node_modules or .pnp.cjs only. This does not prove dependencies are complete or current. Monorepos may install at an ancestor root.' });
  checks.push({ status: Object.keys(scripts).length ? 'pass' : 'warn', title: `${Object.keys(scripts).length} runnable scripts`, detail: 'Scripts are read from package.json. Running them may execute arbitrary project code.' });
  return { root, name: typeof pkg.name === 'string' ? pkg.name : path.basename(root), framework, manager, scripts, checks };
}
export function explainError(text: string): string {
  if (/EADDRINUSE|address already in use|port .+already in use/i.test(text)) return 'A server could not bind to its port. Run Veyra Launch: Check Local Port. Stop the server in its original terminal, or use a different port supported by your framework. Veyra never kills processes automatically.';
  if (/command not found|not recognized as|ENOENT/i.test(text)) return 'A command or executable could not be found. Check the command spelling and tool installation. If it is a project binary, install dependencies and run it through a package.json script. Restart VS Code after changing PATH.';
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|Cannot find package/i.test(text)) return 'A module could not be resolved. Check the import path and package.json dependencies, then install with the project’s selected package manager. Installation will not fix an incorrect import path.';
  if (/EBADENGINE|Unsupported engine|incompatible.*node/i.test(text)) return 'The runtime may not satisfy this project’s Node requirement. Compare node --version with package.json engines.node and select a compatible Node version.';
  if (/EACCES|permission denied/i.test(text)) return 'The operation was denied by the operating system. Inspect the named file or directory permissions and ownership. Avoid blindly rerunning package installation with administrator privileges.';
  return 'No supported error pattern matched. Read the first error and its file path in the terminal. Veyra Launch currently explains port conflicts, missing commands/modules, Node engine mismatches, and permission errors; it does not infer arbitrary failures.';
}
export async function portStatus(port: number): Promise<string> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a port from 1 to 65535.');
  const probe = (host: string): Promise<boolean> => new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = (connected: boolean) => { socket.destroy(); resolve(connected); };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true)); socket.once('error', () => done(false));
  });
  const [v4, v6] = await Promise.all([probe('127.0.0.1'), probe('::1')]);
  return v4 || v6 ? `Port ${port} accepts TCP connections on ${[v4 && '127.0.0.1', v6 && '::1'].filter(Boolean).join(' and ')}.` : `No TCP listener responded on loopback port ${port}. This is a point-in-time probe, not a guarantee that a server can bind.`;
}
