import { MongoClient, type Db, type Document } from "mongodb";
import { toPlain, type Value } from "./literal";
import { readExplain, type IndexKeys, type Plan } from "./advice";
import type { Query } from "./queries";

/* The database side: connecting, running explain() for a query from code, and reading index statistics. No VS Code here. */

export interface IndexInfo { name: string; keys: IndexKeys; unique: boolean; sparse: boolean; partial: boolean; ttl?: number; size?: number; ops?: number; since?: Date }
export interface CollectionInfo { name: string; count: number; size?: number; indexes: IndexInfo[]; statsAvailable: boolean }
export interface Analysis { plan: Plan; filter: Document; sort?: Document; limit?: number; indexes: IndexKeys[]; sampled: string[]; raw: Document }

/** Hosts that are this computer, or a local Docker container. */
export function isLocalUri(uri: string): boolean {
  if (/^mongodb\+srv:/i.test(uri)) return false;
  const hosts = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri)?.[1]?.split(",") ?? [];
  return hosts.length > 0 && hosts.every(h => {
    const host = h.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0" || host === "host.docker.internal" || host.endsWith(".local") || host.endsWith(".localhost") || /^[a-z0-9_-]+$/.test(host);
  });
}
/** The connection string without the password, for showing on screen. */
export function redact(uri: string): string { return uri.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:••••@"); }
export function hostOf(uri: string): string { return /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri)?.[1] ?? uri; }
export function databaseOf(uri: string): string | undefined { return /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i.exec(uri)?.[1] || undefined; }

export class Mongo {
  private constructor(readonly client: MongoClient, public db: Db, readonly uri: string) {}
  static async connect(uri: string, database?: string): Promise<Mongo> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000, appName: "veyra-query-lens" });
    await client.connect();
    const name = database ?? databaseOf(uri) ?? "test";
    return new Mongo(client, client.db(name), uri);
  }
  get host() { return hostOf(this.uri); }
  get local() { return isLocalUri(this.uri); }
  use(database: string) { this.db = this.client.db(database); }
  async databases(): Promise<string[]> {
    try { return (await this.db.admin().listDatabases({ nameOnly: true })).databases.map(d => d.name).filter(n => !["admin", "local", "config"].includes(n)); }
    catch { return [this.db.databaseName]; }
  }
  async collections(): Promise<string[]> {
    return (await this.db.listCollections({ type: "collection" }, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith("system.")).sort();
  }
  async indexes(collection: string): Promise<IndexInfo[]> {
    try {
      return (await this.db.collection(collection).listIndexes().toArray()).map(i => ({ name: i.name, keys: i.key as IndexKeys, unique: !!i.unique, sparse: !!i.sparse, partial: !!i.partialFilterExpression, ttl: i.expireAfterSeconds }));
    } catch (error) {
      if ((error as { codeName?: string }).codeName === "NamespaceNotFound") return [];
      throw error;
    }
  }

  /**
   * Runs explain("executionStats") for a query found in code. Variables in the filter are filled with a real
   * value from the collection, so the plan is the one the app would get. Writes are never run: every
   * method is explained as the find() that selects the same documents.
   */
  async analyze(q: Query, maxTimeMS: number): Promise<Analysis> {
    const coll = this.db.collection(q.collection!);
    const sampled: string[] = [];
    const filter = await this.fill(q.collection!, q.filter, sampled);
    const sort = q.sort.length ? Object.fromEntries(q.sort.map(s => [s.path, s.dir])) : undefined;
    const limit = q.limit;
    const raw = await coll.find(filter, { sort, limit, maxTimeMS }).explain("executionStats");
    const indexes = (await this.indexes(q.collection!)).map(i => i.keys);
    return { plan: readExplain(raw), filter, sort, limit, indexes, sampled, raw };
  }
  /** Replaces each variable with a value of the same field from the collection (an array of one for $in). */
  async fill(collection: string, filter: Value | undefined, sampled: string[] = []): Promise<Document> {
    if (!filter) return {};
    const wanted = new Map<string, unknown>();
    const contexts: { path: string; parent?: string }[] = [];
    const walk = (v: Value, path: string, parent?: string) => {
      if (v.kind === "var") contexts.push({ path, parent });
      else if (v.kind === "object") for (const e of v.entries) walk(e.value, e.key.startsWith("$") ? path : path ? `${path}.${e.key}` : e.key, e.key.startsWith("$") ? e.key : undefined);
      else if (v.kind === "array") v.items.forEach(item => walk(item, path, parent));
    };
    walk(filter, "");
    await Promise.all([...new Set(contexts.map(c => c.path))].filter(Boolean).map(async path => {
      wanted.set(path, await this.sample(collection, path));
      sampled.push(path);
    }));
    const listOps = new Set(["$in", "$nin", "$all"]);
    let k = 0;
    const plain = toPlain(filter, (_v, path) => {
      const ctx = contexts[k++];
      const value = wanted.get(path);
      if (ctx?.parent && listOps.has(ctx.parent)) return Array.isArray(value) ? value : value === undefined ? [] : [value];
      return Array.isArray(value) && ctx?.parent !== "$size" ? value[0] ?? null : value ?? null;
    }) as Document;
    return plain;
  }
  private async sample(collection: string, path: string): Promise<unknown> {
    try {
      const doc = await this.db.collection(collection).findOne({ [path]: { $exists: true, $ne: null } }, { projection: { _id: 0, [path]: 1 }, maxTimeMS: 2000 });
      return path.split(".").reduce<any>((v, part) => (v == null ? v : Array.isArray(v) ? v[0]?.[part] : v[part]), doc) ?? null;
    } catch { return null; }
  }

  /** Indexes with their size and how often they were used since the server started. */
  async collectionInfo(name: string): Promise<CollectionInfo> {
    const coll = this.db.collection(name);
    const [count, indexes] = await Promise.all([coll.estimatedDocumentCount().catch(() => 0), this.indexes(name)]);
    let statsAvailable = true, size: number | undefined;
    try {
      const usage = await coll.aggregate([{ $indexStats: {} }]).toArray();
      for (const u of usage) { const i = indexes.find(x => x.name === u.name); if (i) { i.ops = Number(u.accesses?.ops ?? 0); i.since = u.accesses?.since; } }
    } catch { statsAvailable = false; }
    try {
      const [stats] = await coll.aggregate([{ $collStats: { storageStats: {} } }]).toArray();
      size = stats?.storageStats?.size;
      for (const i of indexes) i.size = stats?.storageStats?.indexSizes?.[i.name];
    } catch { /* not available on this server */ }
    return { name, count, size, indexes, statsAvailable };
  }
  async createIndex(collection: string, keys: IndexKeys) { return this.db.collection(collection).createIndex(keys); }
  async dropIndex(collection: string, name: string) { if (name === "_id_") throw new Error("The _id index can't be dropped."); return this.db.collection(collection).dropIndex(name); }
  async sampleDocuments(collection: string, size: number): Promise<Document[]> {
    return this.db.collection(collection).aggregate([{ $sample: { size } }], { maxTimeMS: 20000 }).toArray();
  }
  close() { return this.client.close(); }
}
