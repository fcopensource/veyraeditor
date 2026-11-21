/* Veyra Live Values: the model. Pure logic, no `vscode` import, so it is unit-tested with plain Node. */
import * as path from 'path';

export type Level = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'crash';

/** One line the hook writes (runtime/hook.js). `line` and `col` are 1-based. */
export interface LiveRecord {
  v: number; t: number; pid: number; level: Level; file: string; line: number; col: number;
  text: string; full: string; num?: number; origin?: string;
}

export interface Sample { t: number; text: string; num?: number; level: Level }

/** What one line of code has printed. `line` is 0-based, like VS Code. */
export interface Entry {
  key: string; file: string; line: number; level: Level;
  text: string; full: string; count: number; first: number; last: number; pid: number;
  history: Sample[];
}

export const HISTORY = 30;
const windows = process.platform === 'win32';

/** A stable key for a file path: resolved, and case-insensitive on Windows. */
export const fileKey = (file: string, win = windows) => { const r = path.resolve(file); return win ? r.toLowerCase() : r; };

const LEVELS = new Set<Level>(['log', 'info', 'warn', 'error', 'debug', 'crash']);

/**
 * Splits a chunk of the hook's file into records. A record cut in half at the end of the chunk is returned in `rest`
 * and should be prepended to the next chunk. Lines that are not valid records are skipped.
 */
export function parseChunk(chunk: string): { records: LiveRecord[]; rest: string } {
  const lines = chunk.split('\n');
  const rest = lines.pop() ?? '';
  const records: LiveRecord[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as LiveRecord;
      if (r && typeof r.file === 'string' && Number.isInteger(r.line) && r.line > 0 && LEVELS.has(r.level) && typeof r.text === 'string') {
        records.push({ ...r, full: typeof r.full === 'string' ? r.full : r.text });
      }
    } catch { /* a broken line: skip it */ }
  }
  return { records, rest };
}

/** How much a level matters when two levels meet on one line: a crash beats an error beats a warning beats a log. */
export const severity = (level: Level) => ({ crash: 4, error: 3, warn: 2, info: 1, log: 1, debug: 0 })[level];

/** Every value your code printed, by file and line. */
export class Store {
  private files = new Map<string, Map<number, Entry>>();
  private runs = new Set<string>();
  /** Bumps on every change, so views know when to redraw. */
  version = 0;

  constructor(private win = windows) {}

  /**
   * Adds a record. When a new run (a process id not seen before) first prints in a file, values from earlier runs
   * in that file are cleared first, so you only see what the latest run did (when `clearOnRun` is on).
   */
  add(r: LiveRecord, clearOnRun = true): Entry {
    const key = fileKey(r.file, this.win);
    let lines = this.files.get(key);
    if (!lines) { lines = new Map(); this.files.set(key, lines); }
    const run = `${r.pid}|${key}`;
    if (!this.runs.has(run)) {
      this.runs.add(run);
      if (clearOnRun) for (const [line, e] of lines) if (e.pid !== r.pid) lines.delete(line);
    }
    const line = r.line - 1;
    const sample: Sample = { t: r.t, text: r.text, num: r.num, level: r.level };
    let e = lines.get(line);
    if (!e) {
      e = { key, file: r.file, line, level: r.level, text: r.text, full: r.full, count: 0, first: r.t, last: r.t, pid: r.pid, history: [] };
      lines.set(line, e);
    }
    if (e.pid !== r.pid) { e.count = 0; e.history = []; e.first = r.t; }
    e.count++;
    e.text = r.text; e.full = r.full; e.last = r.t; e.pid = r.pid; e.file = r.file;
    // A line that once crashed stays a crash until it prints again in a later run.
    e.level = e.level === 'crash' && r.level !== 'crash' && e.count > 1 ? 'crash' : r.level;
    e.history.push(sample);
    if (e.history.length > HISTORY) e.history.splice(0, e.history.length - HISTORY);
    this.version++;
    return e;
  }

  forFile(file: string): Entry[] {
    return [...(this.files.get(fileKey(file, this.win))?.values() ?? [])].sort((a, b) => a.line - b.line);
  }

  at(file: string, line: number): Entry | undefined { return this.files.get(fileKey(file, this.win))?.get(line); }

  all(): Entry[] { return [...this.files.values()].flatMap(m => [...m.values()]); }

  /** Files with values, most recently active first. */
  fileList(): { file: string; entries: Entry[]; last: number }[] {
    return [...this.files.values()].filter(m => m.size).map(m => {
      const entries = [...m.values()].sort((a, b) => a.line - b.line);
      return { file: entries[0].file, entries, last: Math.max(...entries.map(e => e.last)) };
    }).sort((a, b) => b.last - a.last);
  }

  get size() { let n = 0; for (const m of this.files.values()) n += m.size; return n; }

  clear(file?: string) {
    if (file) this.files.delete(fileKey(file, this.win)); else { this.files.clear(); this.runs.clear(); }
    this.version++;
  }

  remove(file: string, line: number) { if (this.files.get(fileKey(file, this.win))?.delete(line)) this.version++; }

  /**
   * Keeps values on the right lines while you edit. The edit replaced the range from (`start`, `startChar`) to
   * (`end`, `endChar`), 0-based, with `inserted`. A value follows its line: values on lines that were deleted go,
   * and values below the edit move up or down.
   */
  shift(file: string, start: number, startChar: number, end: number, endChar: number, inserted: string) {
    const lines = this.files.get(fileKey(file, this.win));
    if (!lines || !lines.size) return;
    const added = inserted.split('\n').length - 1;
    const delta = added - (end - start);
    const empty = start === end && startChar === endChar;
    if (delta === 0 && !(empty && startChar === 0 && added)) return;
    const moved = new Map<number, Entry>();
    const put = (line: number, e: Entry) => { const other = moved.get(line); if (!other || other.last < e.last) { e.line = line; moved.set(line, e); } };
    for (const [line, e] of lines) {
      if (line < start) put(line, e);
      else if (line === start) {
        if (startChar > 0) put(line, e);                   // the start of the line (where the code is) stays
        else if (empty) put(start + added, e);             // new lines typed above it push it down
        else if (end === start) put(line, e);              // an edit inside the line
        // else: the whole line, from column 0, was replaced
      } else if (line < end) continue;                     // deleted
      else if (line === end) put(start + added, e);        // the rest of the last line joins the edit
      else put(line + delta, e);
    }
    this.files.set(fileKey(file, this.win), moved);
    this.version++;
  }
}

const BARS = '▁▂▃▄▅▆▇█';
/** A tiny chart of numbers, like ▁▃▅▇▅▃. Empty when there are fewer than two numbers. */
export function sparkline(nums: number[]): string {
  const values = nums.filter(n => Number.isFinite(n));
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  return values.map(n => BARS[max === min ? 3 : Math.round(((n - min) / (max - min)) * (BARS.length - 1))]).join('');
}

/** "now", "12s ago", "4m ago", "2h ago", "3d ago". */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 2) return 'now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const ICONS: Record<Level, string> = { log: '▸', info: '▸', debug: '·', warn: '⚠', error: '✖', crash: '💥' };

/** The text shown after a line of code: icon, value, and how many times it printed. */
export function inlineText(e: Entry, max = 120): string {
  const text = e.level === 'crash' ? `Crashed: ${e.text}` : e.text;
  const value = text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
  return `${ICONS[e.level]} ${value}${e.count > 1 ? `   ×${e.count}` : ''}`;
}

/** Numbers this line printed, oldest first. */
export const numbers = (e: Entry) => e.history.map(s => s.num).filter((n): n is number => typeof n === 'number');

/** The hover for a line: Markdown with the full value, a chart of numbers, and recent values. */
export function hoverMarkdown(e: Entry, now = Date.now()): string {
  const title = e.level === 'crash' ? '💥 **Crashed here**' : e.level === 'error' ? '✖ **Error**' : e.level === 'warn' ? '⚠ **Warning**' : '▸ **Live value**';
  const out = [`${title} · ${e.count === 1 ? 'printed once' : `printed ${e.count} times`} · ${ago(e.last, now)}`, '', fence(e.full)];
  const nums = numbers(e);
  if (nums.length >= 2) out.push('', `\`${sparkline(nums)}\`  min **${fmt(Math.min(...nums))}** · max **${fmt(Math.max(...nums))}** · last **${fmt(nums[nums.length - 1])}**`);
  const recent = e.history.slice(-6, -1).reverse();
  if (recent.length) {
    out.push('', '**Before that**', '');
    for (const s of recent) out.push(`- \`${s.text.replace(/`/g, 'ˋ').slice(0, 100)}\` · ${ago(s.t, now)}`);
  }
  return out.join('\n');
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 1 ? 4 : 2));
function fence(text: string): string {
  const ticks = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map(m => m.length + 1)));
  return `${ticks}text\n${text}\n${ticks}`;
}

/** NODE_OPTIONS with the hook in front of whatever was there, quoted so paths with spaces work. */
export function nodeOptions(hook: string, existing = ''): string {
  const flag = `--require ${JSON.stringify(hook)}`;
  return existing.includes(flag) ? existing : `${flag}${existing ? ' ' + existing : ''}`;
}

/**
 * The command that runs a file with Node, for "Run with Live Values". `file` is relative to the terminal's folder
 * when it can be (shorter and clearer), else absolute.
 */
export function runCommand(file: string, hasLocalTsx: boolean): string {
  const quoted = /[\s"'&()$;|<>^`]/.test(file) ? `"${file}"` : file;
  if (/\.(m|c)?ts$/i.test(file)) return hasLocalTsx ? `npx tsx ${quoted}` : `npx --yes tsx ${quoted}`;
  return `node ${quoted}`;
}
