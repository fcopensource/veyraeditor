/* Where Rewind keeps history: a folder of gzipped, de-duplicated snapshots ("blobs", named by their SHA-256) and
   one small JSON index per file. Only Node APIs, so it's tested without VS Code. Nothing ever leaves the computer. */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { diffLines, diffStats, newId, shouldCapture, splitLines, thin, type Entry, type Reason } from "./model";

export interface FileHistory { path: string; entries: Entry[] }
export interface Limits { interval: number; maxCount: number; maxAgeDays: number; maxFileSize: number }
export const DEFAULT_LIMITS: Limits = { interval: 30_000, maxCount: 500, maxAgeDays: 30, maxFileSize: 1024 * 1024 };

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
const indexName = (file: string) => createHash("sha1").update(file).digest("hex") + ".json";

export class Store {
  private indexes = new Map<string, FileHistory>();
  private texts = new Map<string, string>(); // hash -> text, for the latest snapshot of each file
  private queue = Promise.resolve();
  constructor(readonly dir: string, public limits: Limits = DEFAULT_LIMITS) {}

  private get blobs() { return path.join(this.dir, "blobs"); }
  private get files() { return path.join(this.dir, "files"); }

  /** Runs storage work one step at a time, so two quick saves never write the same index at once. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async history(file: string): Promise<FileHistory> {
    const cached = this.indexes.get(file);
    if (cached) return cached;
    let history: FileHistory = { path: file, entries: [] };
    try {
      const data = JSON.parse(await fs.readFile(path.join(this.files, indexName(file)), "utf8"));
      if (data && Array.isArray(data.entries)) history = { path: String(data.path || file), entries: data.entries };
    } catch { /* no history yet */ }
    this.indexes.set(file, history);
    return history;
  }
  private async writeIndex(history: FileHistory) {
    await fs.mkdir(this.files, { recursive: true });
    const target = path.join(this.files, indexName(history.path)), temp = target + ".tmp";
    await fs.writeFile(temp, JSON.stringify(history));
    await fs.rename(temp, target);
  }

  async read(hash: string): Promise<string> {
    const cached = this.texts.get(hash);
    if (cached !== undefined) return cached;
    const text = gunzipSync(await fs.readFile(path.join(this.blobs, hash + ".gz"))).toString("utf8");
    return text;
  }
  private async writeBlob(hash: string, text: string) {
    const target = path.join(this.blobs, hash + ".gz");
    try { await fs.access(target); return; } catch { /* new content */ }
    await fs.mkdir(this.blobs, { recursive: true });
    const temp = target + "." + process.pid + ".tmp";
    await fs.writeFile(temp, gzipSync(Buffer.from(text, "utf8")));
    await fs.rename(temp, target);
  }

  /** Saves a snapshot when it's worth one (see shouldCapture). Returns the new entry, or undefined when skipped. */
  capture(file: string, text: string, reason: Reason, label?: string, now = Date.now()): Promise<Entry | undefined> {
    return this.serial(async () => {
      if (Buffer.byteLength(text, "utf8") > this.limits.maxFileSize || text.includes("\u0000")) return undefined;
      const history = await this.history(file);
      const last = history.entries[history.entries.length - 1];
      const hash = hashText(text);
      if (!shouldCapture({ reason, hash, lastHash: last?.hash, lastTime: last?.t, now, interval: this.limits.interval })) return undefined;
      const previous = last ? await this.read(last.hash).catch(() => "") : "";
      const stats = last ? diffStats(diffLines(previous, text, 2000)) : { added: splitLines(text).length, removed: 0 };
      await this.writeBlob(hash, text);
      const entry: Entry = { id: newId(now), t: now, hash, size: text.length, lines: splitLines(text).length, reason, added: stats.added, removed: stats.removed, ...(label ? { label } : {}) };
      history.entries.push(entry);
      history.entries = thin(history.entries, now, this.limits.maxCount, this.limits.maxAgeDays);
      if (last) this.texts.delete(last.hash);
      this.texts.set(hash, text);
      await this.writeIndex(history);
      return entry;
    });
  }

  /** Names an existing snapshot (making it a checkpoint that's never thinned away), or removes the name. */
  rename(file: string, id: string, label: string | undefined): Promise<void> {
    return this.serial(async () => {
      const history = await this.history(file);
      const entry = history.entries.find(e => e.id === id);
      if (!entry) return;
      if (label) entry.label = label; else delete entry.label;
      await this.writeIndex(history);
    });
  }

  /** Every file with history, newest activity first. */
  async all(): Promise<FileHistory[]> {
    let names: string[] = [];
    try { names = (await fs.readdir(this.files)).filter(n => n.endsWith(".json")); } catch { return []; }
    const result: FileHistory[] = [];
    for (const name of names) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(this.files, name), "utf8"));
        if (data?.path && Array.isArray(data.entries) && data.entries.length) result.push(this.indexes.get(data.path) ?? data);
      } catch { /* a damaged index is skipped */ }
    }
    return result.sort((a, b) => (b.entries.at(-1)?.t ?? 0) - (a.entries.at(-1)?.t ?? 0));
  }

  /** Moves a file's history when the file is renamed or moved. */
  move(from: string, to: string): Promise<void> {
    return this.serial(async () => {
      const history = await this.history(from);
      if (!history.entries.length) return;
      const target = await this.history(to);
      const moved: FileHistory = { path: to, entries: [...target.entries, ...history.entries].sort((a, b) => a.t - b.t) };
      this.indexes.set(to, moved); this.indexes.delete(from);
      await this.writeIndex(moved);
      await fs.rm(path.join(this.files, indexName(from)), { force: true });
    });
  }

  clear(file: string): Promise<void> {
    return this.serial(async () => {
      this.indexes.delete(file);
      await fs.rm(path.join(this.files, indexName(file)), { force: true });
      await this.collect();
    });
  }

  /** Deletes blobs no index refers to any more. */
  async collect(): Promise<number> {
    const used = new Set<string>();
    for (const history of await this.all()) for (const e of history.entries) used.add(e.hash);
    let removed = 0;
    try {
      for (const name of await fs.readdir(this.blobs)) {
        if (name.endsWith(".gz") && !used.has(name.slice(0, -3))) { await fs.rm(path.join(this.blobs, name), { force: true }); removed++; }
      }
    } catch { /* no blobs yet */ }
    return removed;
  }

  /** The total size of the history on disk, in bytes. */
  async size(): Promise<number> {
    let total = 0;
    for (const folder of [this.blobs, this.files]) {
      try { for (const name of await fs.readdir(folder)) total += (await fs.stat(path.join(folder, name))).size; } catch { /* empty */ }
    }
    return total;
  }
}
