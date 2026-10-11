/* Breakpoints per workspace file (relative path → sorted line numbers), saved per project in localStorage.
   The editor gutter, the Run and Debug panel and the debug session all read and change them through here. */
let root = "";
let store = new Map<string, number[]>();
const listeners = new Set<() => void>();
const key = () => "veyra.breakpoints:" + root;
const save = () => { try { localStorage.setItem(key(), JSON.stringify([...store])); } catch { /* storage full or blocked */ } };
const changed = () => { save(); listeners.forEach(listener => listener()); };

/** Switch to a workspace: loads that project's breakpoints. */
export function setBreakpointRoot(next: string) {
  if (next === root) return;
  root = next;
  try { store = new Map(JSON.parse(localStorage.getItem(key()) || "[]")); } catch { store = new Map(); }
  listeners.forEach(listener => listener());
}
export const onBreakpointsChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const breakpointsFor = (path: string) => store.get(path) || [];
export const allBreakpoints = () => [...store].filter(([, lines]) => lines.length).sort(([a], [b]) => a.localeCompare(b));
export const hasBreakpoint = (path: string, line: number) => breakpointsFor(path).includes(line);

export function toggleBreakpoint(path: string, line: number) {
  const lines = breakpointsFor(path);
  const next = lines.includes(line) ? lines.filter(l => l !== line) : [...lines, line].sort((a, b) => a - b);
  if (next.length) store.set(path, next); else store.delete(path);
  changed();
}
export function removeBreakpoint(path: string, line: number) { if (hasBreakpoint(path, line)) toggleBreakpoint(path, line); }
export function clearBreakpoints() { store.clear(); changed(); }

/** Lines shift when text is inserted or deleted above them; the editor reports the new positions here. */
export function moveBreakpoints(path: string, lines: number[]) {
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  const current = breakpointsFor(path);
  if (unique.length === current.length && unique.every((line, i) => line === current[i])) return;
  if (unique.length) store.set(path, unique); else store.delete(path);
  changed();
}
