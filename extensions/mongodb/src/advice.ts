import type { Value } from "./literal";
import type { Query, SortKey } from "./queries";

/* What a query asks for, the index it needs, and what MongoDB's explain() says it did. */

export type Op = "eq" | "in" | "range" | "prefix" | "regex" | "exists" | "ne" | "elemMatch" | "other";
export interface Condition { path: string; op: Op }
export interface Shape { conditions: Condition[]; or: Condition[][]; unsupported?: string }

const RANGE = new Set(["$gt", "$gte", "$lt", "$lte"]);
/** The conditions of a filter, with $and flattened and $or kept as branches. */
export function shapeOf(filter: Value | undefined): Shape {
  const shape: Shape = { conditions: [], or: [] };
  const walk = (v: Value, prefix: string, into: Condition[]) => {
    if (v.kind !== "object") return;
    for (const { key, value } of v.entries) {
      if (key === "$and" && value.kind === "array") { value.items.forEach(item => walk(item, prefix, into)); continue; }
      if ((key === "$or" || key === "$nor") && value.kind === "array") {
        if (key === "$nor") { shape.unsupported ??= "$nor can't use an index well."; continue; }
        shape.or.push(...value.items.map(item => { const branch: Condition[] = []; walk(item, prefix, branch); return branch; }));
        continue;
      }
      if (key === "$expr" || key === "$where" || key === "$text" || key === "$jsonSchema") { shape.unsupported ??= `${key} queries are checked as they are; no index is suggested.`; into.push({ path: key, op: "other" }); continue; }
      if (key.startsWith("$")) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      into.push(...conditionsFor(path, value));
    }
  };
  walk(filter ?? { kind: "object", entries: [], start: 0, end: 0 }, "", shape.conditions);
  return shape;
}
function conditionsFor(path: string, value: Value): Condition[] {
  if (value.kind === "regex") return [{ path, op: /^\^[\w\s-]/.test(value.source) && !value.flags.includes("i") ? "prefix" : "regex" }];
  if (value.kind !== "object" || !value.entries.length || !value.entries.every(e => e.key.startsWith("$"))) return [{ path, op: "eq" }];
  const out: Condition[] = [];
  for (const { key, value: v } of value.entries) {
    if (key === "$eq") out.push({ path, op: "eq" });
    else if (key === "$in") out.push({ path, op: "in" });
    else if (RANGE.has(key)) { if (!out.some(c => c.op === "range")) out.push({ path, op: "range" }); }
    else if (key === "$ne" || key === "$nin" || key === "$not") out.push({ path, op: "ne" });
    else if (key === "$exists") out.push({ path, op: "exists" });
    else if (key === "$regex") out.push({ path, op: v.kind === "string" && /^\^[\w\s-]/.test(v.value) && !value.entries.some(e => e.key === "$options" && e.value.kind === "string" && e.value.value.includes("i")) ? "prefix" : "regex" });
    else if (key === "$elemMatch") out.push({ path, op: "elemMatch" });
    else if (key === "$options") continue;
    else out.push({ path, op: "other" });
  }
  return out;
}

export type IndexKeys = Record<string, 1 | -1>;
/**
 * The index MongoDB recommends for a query: fields matched exactly first, then the sort, then ranges
 * (the Equality, Sort, Range rule). Returns undefined when no index would help.
 */
export function suggestIndex(conditions: Condition[], sort: SortKey[]): IndexKeys | undefined {
  const keys: IndexKeys = {};
  const add = (path: string, dir: 1 | -1 = 1) => { if (!(path in keys) && !path.startsWith("$")) keys[path] = dir; };
  for (const c of conditions) if (c.op === "eq" || c.op === "in" || c.op === "elemMatch") add(c.path);
  for (const s of sort) add(s.path, s.dir);
  for (const c of conditions) if (c.op === "range" || c.op === "prefix") add(c.path);
  for (const c of conditions) if (c.op === "exists" || c.op === "ne" || c.op === "regex") add(c.path);
  const paths = Object.keys(keys);
  if (!paths.length || (paths.length === 1 && paths[0] === "_id")) return undefined;
  return keys;
}
/** Whether an existing index already serves these keys (same fields in the same order at its start). */
export function covers(existing: IndexKeys, wanted: IndexKeys): boolean {
  const have = Object.entries(existing), want = Object.entries(wanted);
  if (have.length < want.length) return false;
  const sameDir = want.every(([k, d], i) => have[i][0] === k && have[i][1] === d);
  const flipped = want.every(([k, d], i) => have[i][0] === k && have[i][1] === -d);
  return sameDir || flipped;
}
export const keysText = (keys: IndexKeys) => `{ ${Object.entries(keys).map(([k, d]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${d}`).join(", ")} }`;

// ---------- explain() ----------

export interface Plan {
  stages: string[];
  scan: "collection" | "index" | "id" | "none";
  index?: string;
  indexKeys?: IndexKeys;
  inMemorySort: boolean;
  docsExamined: number; keysExamined: number; returned: number; ms: number;
}
/** Reads the winning plan and the numbers from explain("executionStats"), for the classic and the newer (SBE) engine. */
export function readExplain(explain: any): Plan {
  const planner = explain?.queryPlanner ?? explain?.stages?.[0]?.$cursor?.queryPlanner ?? (explain?.shards ? Object.values<any>(explain.shards)[0]?.queryPlanner : undefined);
  const winning = planner?.winningPlan?.queryPlan ?? planner?.winningPlan ?? {};
  const stages: string[] = [];
  let index: string | undefined, indexKeys: IndexKeys | undefined;
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.stage) {
      stages.push(node.stage);
      if (/IXSCAN|COUNT_SCAN|DISTINCT_SCAN/.test(node.stage) && !index) { index = node.indexName; indexKeys = node.keyPattern; }
    }
    walk(node.inputStage);
    (node.inputStages ?? []).forEach(walk);
    walk(node.queryPlan);
  };
  walk(winning);
  const stats = explain?.executionStats ?? explain?.stages?.[0]?.$cursor?.executionStats ?? {};
  const scan = stages.some(s => s === "IDHACK" || s === "EXPRESS_IXSCAN" && index === "_id_" || s === "EXPRESS_CLUSTERED_IXSCAN") ? "id"
    : stages.some(s => /IXSCAN|COUNT_SCAN|DISTINCT_SCAN/.test(s)) ? "index"
    : stages.includes("COLLSCAN") ? "collection" : stages.includes("EOF") ? "none" : "collection";
  return {
    stages, scan, index, indexKeys,
    inMemorySort: stages.includes("SORT"),
    docsExamined: Number(stats.totalDocsExamined ?? 0), keysExamined: Number(stats.totalKeysExamined ?? 0),
    returned: Number(stats.nReturned ?? 0), ms: Number(stats.executionTimeMillis ?? 0),
  };
}

export type Level = "good" | "info" | "warning";
export interface Verdict { level: Level; title: string; detail: string; suggestion?: IndexKeys }
const n = (x: number) => x.toLocaleString("en-US");
/**
 * Plain words for a plan: what it did, whether that's a problem, and the index that would fix it.
 * `existing` is the collection's indexes, so an index that's already there is not suggested again.
 */
export function verdict(q: Pick<Query, "sort">, shape: Shape, plan: Plan, existing: IndexKeys[]): Verdict {
  const read = `${n(plan.docsExamined)} document${plan.docsExamined === 1 ? "" : "s"} read to return ${n(plan.returned)}`;
  const wanted = shape.or.length || shape.unsupported ? undefined : suggestIndex(shape.conditions, q.sort);
  const suggestion = wanted && !existing.some(e => covers(e, wanted)) ? wanted : undefined;
  if (plan.scan === "id") return { level: "good", title: "Finds by _id", detail: `Uses the _id index · ${plan.ms} ms` };
  if (plan.scan === "none") return { level: "good", title: "Nothing to read", detail: "The collection is empty or doesn't exist yet." };
  if (plan.scan === "collection") {
    const big = plan.docsExamined >= 1000;
    if (shape.or.length) return { level: big ? "warning" : "info", title: "Full collection scan", detail: `${read}. Each $or branch needs its own index to avoid this.` };
    return {
      level: big ? "warning" : "info",
      title: "Full collection scan",
      detail: `${read}${big ? "" : ". Fine now, but it grows with the collection"}.${suggestion ? ` An index on ${keysText(suggestion)} fixes it.` : ""}`,
      suggestion,
    };
  }
  // An index is used.
  const used = plan.index ? `index ${plan.index}` : "an index";
  if (plan.inMemorySort) {
    return { level: plan.docsExamined >= 1000 ? "warning" : "info", title: "Sorts in memory", detail: `Uses ${used}, but sorts the results in memory (${read}). ${suggestion ? `An index on ${keysText(suggestion)} returns them already sorted.` : "Add the sort fields to the index."}`, suggestion };
  }
  if (plan.docsExamined > 10 * Math.max(plan.returned, 1) && plan.docsExamined >= 1000) {
    return { level: "warning", title: "Index isn't selective", detail: `Uses ${used} but still ${read}.${suggestion ? ` An index on ${keysText(suggestion)} narrows it down.` : ""}`, suggestion };
  }
  return { level: "good", title: `Uses ${used}`, detail: `${read} · ${plan.ms} ms` };
}

/** The lens text above a query. */
export function lensTitle(v: Verdict, plan: Plan): string {
  const icon = v.level === "good" ? "✓" : v.level === "warning" ? "⚠" : "ℹ";
  return `${icon} ${v.title} · ${n(plan.docsExamined)} read → ${n(plan.returned)} returned · ${plan.ms} ms`;
}

/** The index as code to paste into a Mongoose schema, a Node.js script, a Python script or mongosh. */
export function indexCode(collection: string, keys: IndexKeys, schemaVariable = "schema") {
  const k = keysText(keys);
  return {
    mongoose: `${schemaVariable}.index(${k});`,
    node: `await db.collection(${JSON.stringify(collection)}).createIndex(${k});`,
    python: `db[${JSON.stringify(collection)}].create_index([${Object.entries(keys).map(([f, d]) => `(${JSON.stringify(f)}, ${d === 1 ? "ASCENDING" : "DESCENDING"})`).join(", ")}])`,
    mongosh: `db.getCollection(${JSON.stringify(collection)}).createIndex(${k})`,
  };
}
