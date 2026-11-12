/* Pure helpers for Rewind: diffs, which snapshots to keep, searching history and labels. No VS Code, so they're
   tested in Node (test/model.test.mjs). */

export type Reason = "open" | "save" | "edit" | "checkpoint" | "restore" | "delete";
export interface Entry { id: string; t: number; hash: string; size: number; lines: number; reason: Reason; label?: string; added: number; removed: number }

// ---------- Line diff ----------

export type Op = { kind: "same" | "add" | "del"; text: string; oldLine?: number; newLine?: number };

/** Splits text into lines; a final newline doesn't make an extra empty line. */
export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * A line diff from `a` to `b` (Myers' algorithm, O((N+M)·D)). Common start and end lines are trimmed first, so the
 * usual "a few lines changed in a big file" case is fast. Above `maxCost` edits it falls back to replace-everything.
 */
export function diffLines(aText: string, bText: string, maxCost = 4000): Op[] {
  const a = splitLines(aText), b = splitLines(bText);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ops: Op[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: "same", text: a[i], oldLine: i + 1, newLine: i + 1 });
  const middle = myers(a.slice(start, endA), b.slice(start, endB), maxCost);
  for (const op of middle) {
    ops.push({ kind: op.kind, text: op.text, oldLine: op.oldLine === undefined ? undefined : op.oldLine + start, newLine: op.newLine === undefined ? undefined : op.newLine + start });
  }
  for (let i = 0; i < a.length - endA; i++) ops.push({ kind: "same", text: a[endA + i], oldLine: endA + i + 1, newLine: endB + i + 1 });
  return ops;
}

function myers(a: string[], b: string[], maxCost: number): Op[] {
  const n = a.length, m = b.length;
  if (!n) return b.map((text, j) => ({ kind: "add" as const, text, newLine: j + 1 }));
  if (!m) return a.map((text, i) => ({ kind: "del" as const, text, oldLine: i + 1 }));
  const max = Math.min(n + m, maxCost), offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }
  if (!found) return [...a.map((text, i) => ({ kind: "del" as const, text, oldLine: i + 1 })), ...b.map((text, j) => ({ kind: "add" as const, text, newLine: j + 1 }))];
  // Walk the trace backwards to recover the edit script.
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK], prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; ops.push({ kind: "same", text: a[x], oldLine: x + 1, newLine: y + 1 }); }
    if (d > 0) {
      if (x === prevX) { y--; ops.push({ kind: "add", text: b[y], newLine: y + 1 }); }
      else { x--; ops.push({ kind: "del", text: a[x], oldLine: x + 1 }); }
    }
  }
  return ops.reverse();
}

/** How many lines a change adds and removes. */
export function diffStats(ops: Op[]): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const op of ops) { if (op.kind === "add") added++; else if (op.kind === "del") removed++; }
  return { added, removed };
}

export interface Hunk { oldStart: number; newStart: number; ops: Op[] }
/** Groups a diff into hunks with `context` unchanged lines around each change, like a unified diff. */
export function hunks(ops: Op[], context = 3): Hunk[] {
  const changed = ops.map((op, i) => op.kind !== "same" ? i : -1).filter(i => i >= 0);
  if (!changed.length) return [];
  const result: Hunk[] = [];
  let from = Math.max(0, changed[0] - context), to = Math.min(ops.length - 1, changed[0] + context);
  const flush = () => {
    const slice = ops.slice(from, to + 1);
    const first = slice[0];
    result.push({ oldStart: first.oldLine ?? (slice.find(o => o.oldLine)?.oldLine ?? 1), newStart: first.newLine ?? (slice.find(o => o.newLine)?.newLine ?? 1), ops: slice });
  };
  for (const index of changed.slice(1)) {
    if (index - context <= to + 1) to = Math.min(ops.length - 1, index + context);
    else { flush(); from = Math.max(0, index - context); to = Math.min(ops.length - 1, index + context); }
  }
  flush();
  return result;
}

// ---------- Capturing ----------

/**
 * Whether the text in the editor is worth a new snapshot: it changed since the last one, and for a typing
 * snapshot ("edit") at least `interval` ms passed since the last snapshot. Saves, checkpoints and restores always count.
 */
export function shouldCapture(o: { reason: Reason; hash: string; lastHash?: string; lastTime?: number; now: number; interval: number }): boolean {
  if (o.hash === o.lastHash && o.reason !== "checkpoint") return false;
  if (o.reason !== "edit") return true;
  return o.lastTime === undefined || o.now - o.lastTime >= o.interval;
}

/** Files Rewind leaves alone: dependencies, build output, lock files, minified code and anything in `exclude`. */
export const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/out/**", "**/.next/**", "**/coverage/**", "**/*.min.*", "**/*.lock", "**/package-lock.json", "**/*.map"];

/** A glob (*, **, ?, {a,b}) as a regular expression matched against a forward-slash path. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { const slash = glob[i + 2] === "/"; out += slash ? "(?:.*/)?" : ".*"; i += slash ? 2 : 1; }
      else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (c === "{") { const end = glob.indexOf("}", i); if (end < 0) { out += "\\{"; continue; } out += "(?:" + glob.slice(i + 1, end).split(",").map(escape).join("|") + ")"; i = end; }
    else out += escape(c);
  }
  return new RegExp("^" + out + "$", "i");
}
const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");

export function isExcluded(path: string, patterns: string[]): boolean {
  const normal = path.replace(/\\/g, "/");
  return patterns.some(p => { const re = globToRegExp(p); return re.test(normal) || re.test("/" + normal.replace(/^\/+/, "")); });
}

// ---------- Keeping history small ----------

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/**
 * Which snapshots to keep, oldest first. Everything from the last 24 hours stays; up to a week old, one per 10
 * minutes; older, one per hour. Checkpoints (named snapshots) and the newest snapshot always stay. Past `maxAgeDays`
 * snapshots go (except checkpoints), and at most `maxCount` are kept, dropping the oldest unnamed ones first.
 */
export function thin(entries: Entry[], now: number, maxCount = 500, maxAgeDays = 30): Entry[] {
  const sorted = [...entries].sort((a, b) => a.t - b.t);
  const newest = sorted[sorted.length - 1];
  const buckets = new Set<string>();
  const kept: Entry[] = [];
  // Walk newest first so the latest snapshot in each bucket survives.
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i], age = now - e.t;
    if (e.label || e === newest) { kept.push(e); continue; }
    if (age > maxAgeDays * DAY) continue;
    if (age <= DAY) { kept.push(e); continue; }
    const size = age <= 7 * DAY ? 10 * MINUTE : HOUR;
    const bucket = `${size}:${Math.floor(e.t / size)}`;
    if (buckets.has(bucket)) continue;
    buckets.add(bucket); kept.push(e);
  }
  kept.reverse();
  while (kept.length > maxCount) {
    const index = kept.findIndex(e => !e.label && e !== newest);
    if (index < 0) break;
    kept.splice(index, 1);
  }
  return kept;
}

// ---------- Search ----------

export interface Found { line: number; text: string; column: number }
/** Lines of `text` containing `query` (case-insensitive unless it has capitals), skipping lines also in `exclude`. */
export function findLines(text: string, query: string, exclude?: Set<string>, max = 20): Found[] {
  if (!query) return [];
  const smart = query !== query.toLowerCase();
  const needle = smart ? query : query.toLowerCase();
  const found: Found[] = [];
  const lines = splitLines(text);
  for (let i = 0; i < lines.length && found.length < max; i++) {
    const line = lines[i];
    const column = (smart ? line : line.toLowerCase()).indexOf(needle);
    if (column >= 0 && !(exclude && exclude.has(line.trim()))) found.push({ line: i + 1, text: line, column: column + 1 });
  }
  return found;
}
/** The trimmed lines of a text, to tell "still in the file" from "gone". */
export const lineSet = (text: string) => new Set(splitLines(text).map(l => l.trim()).filter(Boolean));

// ---------- Labels ----------

/** "just now", "5 min ago", "3 h ago", "yesterday 14:05", "12 Mar 09:30". */
export function relativeTime(t: number, now: number): string {
  const diff = now - t;
  if (diff < 45_000) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  const date = new Date(t), today = new Date(now);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  if (sameDay(date, today) && diff < 6 * HOUR) return `${Math.round(diff / HOUR)} h ago`;
  if (sameDay(date, today)) return `today ${time}`;
  const yesterday = new Date(now - DAY);
  if (sameDay(date, yesterday)) return `yesterday ${time}`;
  const month = date.toLocaleString("en", { month: "short" });
  return `${date.getDate()} ${month}${date.getFullYear() !== today.getFullYear() ? " " + date.getFullYear() : ""} ${time}`;
}

export const REASON_LABEL: Record<Reason, string> = { open: "Opened", save: "Saved", edit: "While typing", checkpoint: "Checkpoint", restore: "Before restore", delete: "Before delete" };

/** "+12 −3" for a snapshot's change against the one before it. */
export const statsLabel = (e: Pick<Entry, "added" | "removed">) => e.added || e.removed ? `+${e.added} −${e.removed}` : "no line changes";

/** A short, readable id for a snapshot (time plus a random tail), sortable by time. */
export const newId = (t: number, random: () => number = Math.random) => t.toString(36) + "-" + Math.floor(random() * 0xffffff).toString(36).padStart(5, "0");
