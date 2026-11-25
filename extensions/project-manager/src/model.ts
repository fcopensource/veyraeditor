// Project Manager Veyra: the parts with no VS Code in them, so they can be tested with plain Node.
import * as fs from 'fs';
import * as path from 'path';

/** A saved project, as stored in projects.json. */
export interface Project {
  name: string;
  rootPath: string;
  tags: string[];
  /** When it was last opened from Project Manager (ms since 1970), for "most recent first". */
  lastOpened?: number;
}

/** A folder found by scanning, not saved by the user. */
export interface Found {
  name: string;
  rootPath: string;
  kind: Kind;
}

export type Kind = 'node' | 'python' | 'rust' | 'go' | 'java' | 'dotnet' | 'php' | 'ruby' | 'dart' | 'cpp' | 'folder';

/** What each kind of project is called, and the codicon shown for it. */
export const KINDS: Record<Kind, { label: string; icon: string }> = {
  node: { label: 'Node.js', icon: 'json' },
  python: { label: 'Python', icon: 'snake' },
  rust: { label: 'Rust', icon: 'gear' },
  go: { label: 'Go', icon: 'symbol-namespace' },
  java: { label: 'Java', icon: 'coffee' },
  dotnet: { label: '.NET', icon: 'symbol-class' },
  php: { label: 'PHP', icon: 'symbol-method' },
  ruby: { label: 'Ruby', icon: 'ruby' },
  dart: { label: 'Dart / Flutter', icon: 'device-mobile' },
  cpp: { label: 'C / C++', icon: 'symbol-structure' },
  folder: { label: 'Folder', icon: 'folder' },
};

/** Guesses the kind of project from the names of the files in its root folder. */
export function kindOf(names: string[]): Kind {
  const has = (n: string) => names.includes(n);
  const ends = (s: string) => names.some(n => n.endsWith(s));
  if (has('Cargo.toml')) return 'rust';
  if (has('go.mod')) return 'go';
  if (has('pubspec.yaml')) return 'dart';
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return 'java';
  if (ends('.csproj') || ends('.sln') || ends('.fsproj')) return 'dotnet';
  if (has('composer.json')) return 'php';
  if (has('Gemfile')) return 'ruby';
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py') || has('Pipfile')) return 'python';
  if (has('package.json')) return 'node';
  if (has('CMakeLists.txt') || (has('Makefile') && names.some(n => /\.(c|cpp|cc|h|hpp)$/.test(n)))) return 'cpp';
  return 'folder';
}

/** Compares two folder paths: separators and a trailing slash don't matter, and on Windows neither does case. */
export function samePath(a: string, b: string, windows = process.platform === 'win32'): boolean {
  return pathKey(a, windows) === pathKey(b, windows);
}
export function pathKey(p: string, windows = process.platform === 'win32'): string {
  let k = p.replace(/\\/g, '/').replace(/\/+$/, '');
  if (windows) k = k.toLowerCase();
  return k;
}

/** Expands a leading ~ to the home folder. */
export function expandHome(p: string, home: string): string {
  return p === '~' ? home : p.startsWith('~/') || p.startsWith('~\\') ? path.join(home, p.slice(2)) : p;
}

/** Reads projects.json. Accepts the list on its own, or the Project Manager format with extra fields, and skips entries that make no sense. */
export function parseProjects(text: string): { projects: Project[]; error?: string } {
  if (!text.trim()) return { projects: [] };
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { projects: [], error: `projects.json isn't valid JSON: ${(e as Error).message}` }; }
  const list = Array.isArray(data) ? data : Array.isArray((data as { projects?: unknown })?.projects) ? (data as { projects: unknown[] }).projects : null;
  if (!list) return { projects: [], error: 'projects.json should be a list of projects, like [{ "name": "app", "rootPath": "C:/code/app" }].' };
  const projects: Project[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o.enabled === false) continue;
    const rootPath = typeof o.rootPath === 'string' ? o.rootPath.trim() : '';
    if (!rootPath) continue;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : path.basename(rootPath.replace(/[\\/]+$/, '')) || rootPath;
    const tags = Array.isArray(o.tags) ? [...new Set(o.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()))] : [];
    const lastOpened = typeof o.lastOpened === 'number' && isFinite(o.lastOpened) ? o.lastOpened : undefined;
    projects.push({ name, rootPath, tags, ...(lastOpened ? { lastOpened } : {}) });
  }
  return { projects };
}

export function serializeProjects(projects: Project[]): string {
  return JSON.stringify(projects.map(p => ({ name: p.name, rootPath: p.rootPath, tags: p.tags, ...(p.lastOpened ? { lastOpened: p.lastOpened } : {}) })), null, 2) + '\n';
}

/** Saves a folder as a project, or renames the one already saved for it. */
export function upsert(projects: Project[], name: string, rootPath: string, windows?: boolean): Project[] {
  const i = projects.findIndex(p => samePath(p.rootPath, rootPath, windows));
  if (i < 0) return [...projects, { name, rootPath, tags: [] }];
  return projects.map((p, j) => j === i ? { ...p, name } : p);
}

export function remove(projects: Project[], rootPath: string, windows?: boolean): Project[] {
  return projects.filter(p => !samePath(p.rootPath, rootPath, windows));
}

export function setTags(projects: Project[], rootPath: string, tags: string[], windows?: boolean): Project[] {
  const clean = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  return projects.map(p => samePath(p.rootPath, rootPath, windows) ? { ...p, tags: clean } : p);
}

export function touch(projects: Project[], rootPath: string, now: number, windows?: boolean): Project[] {
  return projects.map(p => samePath(p.rootPath, rootPath, windows) ? { ...p, lastOpened: now } : p);
}

export type SortOrder = 'name' | 'recent' | 'saved';

/** Sorts saved projects: by name (natural, case-insensitive), most recently opened first, or in the order they were saved. */
export function sortProjects<T extends { name: string; lastOpened?: number }>(list: T[], order: SortOrder): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  if (order === 'saved') return [...list];
  if (order === 'recent') return [...list].sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0) || byName(a, b));
  return [...list].sort(byName);
}

/** Every tag in use, sorted. */
export function allTags(projects: Project[]): string[] {
  return [...new Set(projects.flatMap(p => p.tags))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** The projects with a tag, or with no tag at all for null. */
export function withTag(projects: Project[], tag: string | null): Project[] {
  return projects.filter(p => tag === null ? p.tags.length === 0 : p.tags.includes(tag));
}

/** Folders a scan never goes into: dependencies, build output, caches and hidden folders. */
export const SKIP = new Set(['node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj', '.venv', 'venv', 'env', '__pycache__', '.gradle', '.idea', '.vscode', 'Library', 'AppData', 'Pods', 'DerivedData']);

export interface ScanOptions {
  /** How many folders deep to look under each base folder (1 = only its direct subfolders). */
  depth: number;
  /** Folder names to skip, on top of SKIP. */
  ignore?: string[];
  /** Stop after this many repositories, so a huge disk can't hang the scan. */
  limit?: number;
}

/**
 * Finds Git repositories under the base folders: any folder with a .git folder (or a .git file, for worktrees and
 * submodules) inside. It doesn't look inside a repository it has found, follows no links, and skips SKIP folders.
 */
export async function scanForRepos(bases: string[], options: ScanOptions): Promise<Found[]> {
  const skip = new Set([...SKIP, ...(options.ignore || [])]);
  const limit = options.limit ?? 500;
  const found: Found[] = [];
  const seen = new Set<string>();
  async function visit(dir: string, depth: number): Promise<void> {
    if (found.length >= limit) return;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.name === '.git')) {
      const key = pathKey(dir);
      if (!seen.has(key)) { seen.add(key); found.push({ name: path.basename(dir), rootPath: dir, kind: kindOf(entries.map(e => e.name)) }); }
      return;
    }
    if (depth <= 0) return;
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith('.') || skip.has(e.name)) continue;
      await visit(path.join(dir, e.name), depth - 1);
    }
  }
  for (const base of bases) await visit(base, Math.max(0, options.depth));
  return found.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** A short path for display: the home folder as ~, and forward slashes. */
export function shortPath(p: string, home: string): string {
  const norm = (s: string) => s.replace(/\\/g, '/');
  const P = norm(p), H = norm(home).replace(/\/+$/, '');
  if (H && (P === H || P.toLowerCase().startsWith(H.toLowerCase() + '/'))) return '~' + P.slice(H.length);
  return P;
}
