/* Native built-ins: Veyra's own extensions (made for VS Code too), rebuilt inside Veyra so they need nothing
   installed. They're on by default and can be switched off in Extensions. Each one reuses its extension's
   tested model (extensions/<name>/src/model.ts), so Veyra and VS Code behave the same. */

export type NativeKey = "error-lens" | "auto-rename-tag" | "path-intellisense" | "npm-intellisense" | "todo-tree" | "git-graph";

const STORAGE = "veyra.native.disabled";
const read = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE) || "[]")); } catch { return new Set(); } };
let disabled = read();
const listeners = new Set<() => void>();

export const isNativeOn = (key: NativeKey) => !disabled.has(key);
export function setNativeOn(key: NativeKey, on: boolean) {
  if (on) disabled.delete(key); else disabled.add(key);
  try { localStorage.setItem(STORAGE, JSON.stringify([...disabled])); } catch { /* storage blocked */ }
  listeners.forEach(listener => listener());
}
export const onNativeChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/* What the features need to know about the open project: set by the workbench. */
let projectRoot = "";
let projectFiles: string[] = [];
const projectListeners = new Set<() => void>();
export function setProject(root: string, files: string[]) {
  const changed = root !== projectRoot || files !== projectFiles;
  projectRoot = root.replace(/\\/g, "/").replace(/\/$/, ""); projectFiles = files;
  if (changed) projectListeners.forEach(listener => listener());
}
export const project = () => ({ root: projectRoot, files: projectFiles });
export const onProjectChange = (listener: () => void) => { projectListeners.add(listener); return () => { projectListeners.delete(listener); }; };

/** The project-relative path of a Monaco model, or "" when it isn't a file in the open project. */
export function relativePath(uri: { scheme: string; path: string }): string {
  if (!projectRoot || uri.scheme !== "file") return "";
  const full = decodeURIComponent(uri.path).replace(/^\/([A-Za-z]:)/, "$1");
  const root = projectRoot.replace(/^\/([A-Za-z]:)/, "$1");
  const lower = full.toLowerCase(), base = root.toLowerCase() + "/";
  return lower.startsWith(base) ? full.slice(base.length) : "";
}
