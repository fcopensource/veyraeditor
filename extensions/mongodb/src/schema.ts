import { Reader, type Value } from "./literal";
import { mask } from "./queries";

/* Mongoose schemas read from code, and compared with the documents really in the database. */

export type FieldType = "string" | "number" | "boolean" | "date" | "objectId" | "decimal" | "binData" | "array" | "object" | "map" | "mixed" | "unknown";
export interface SchemaField { path: string; type: FieldType; items?: FieldType; required: boolean; offset: number }
export interface SchemaInfo { variable?: string; offset: number; fields: SchemaField[]; timestamps: boolean; collectionOption?: string; strict: boolean }

const TYPE_NAMES: Record<string, FieldType> = {
  String: "string", Number: "number", Boolean: "boolean", Bool: "boolean", Date: "date", ObjectId: "objectId", ObjectID: "objectId",
  Decimal128: "decimal", Decimal: "decimal", Buffer: "binData", Mixed: "mixed", Map: "map", Object: "mixed", Array: "array", BigInt: "number", Double: "number", Int32: "number", UUID: "binData",
};
function typeOf(v: Value): FieldType | undefined {
  if (v.kind === "var") return TYPE_NAMES[v.text.split(".").pop()!.replace(/\(\)$/, "")];
  if (v.kind === "string") return TYPE_NAMES[v.value] ?? (/^string$/i.test(v.value) ? "string" : /^number$/i.test(v.value) ? "number" : undefined);
  if (v.kind === "array") return "array";
  return undefined;
}

/** Every `new Schema({...})` in a file, with its fields flattened to dotted paths. */
export function findSchemas(text: string): SchemaInfo[] {
  const masked = mask(text, "js");
  const out: SchemaInfo[] = [];
  const re = /(?:(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*)?new\s+(?:\w+\.)?Schema\s*(?:<[^>()]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const r = new Reader(text, m.index + m[0].length);
    const def = r.value();
    if (def.kind !== "object") continue;
    let options: Value | undefined;
    if (r.peek() === ",") { r.i++; options = r.value(); }
    const fields: SchemaField[] = [];
    collect(def, "", fields);
    const opt = (key: string) => (options?.kind === "object" ? options.entries.find(e => e.key === key)?.value : undefined);
    const ts = opt("timestamps");
    const timestamps = !!ts && (ts.kind === "boolean" ? ts.value : ts.kind === "object");
    if (timestamps) for (const f of ["createdAt", "updatedAt"]) if (!fields.some(x => x.path === f)) fields.push({ path: f, type: "date", required: false, offset: m.index });
    const coll = opt("collection");
    const strict = opt("strict");
    out.push({ variable: m[1], offset: m.index, fields, timestamps, collectionOption: coll?.kind === "string" ? coll.value : undefined, strict: !(strict?.kind === "boolean" && !strict.value) });
  }
  return out;
}
function collect(def: Extract<Value, { kind: "object" }>, prefix: string, out: SchemaField[]) {
  for (const { key, keyStart, value } of def.entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    const direct = typeOf(value);
    if (value.kind === "array") {
      const inner = value.items[0];
      out.push({ path, type: "array", items: inner ? (inner.kind === "object" ? (inner.entries.some(e => e.key === "type") ? typeOf(inner.entries.find(e => e.key === "type")!.value) ?? "unknown" : "object") : typeOf(inner) ?? "unknown") : "mixed", required: false, offset: keyStart });
      continue;
    }
    if (value.kind === "object") {
      const typeEntry = value.entries.find(e => e.key === "type");
      if (typeEntry && typeEntry.value.kind !== "object") {
        const t = typeOf(typeEntry.value);
        const req = value.entries.find(e => e.key === "required")?.value;
        const items = typeEntry.value.kind === "array" ? (typeEntry.value.items[0] ? typeOf(typeEntry.value.items[0]) ?? "unknown" : "mixed") : undefined;
        out.push({ path, type: t ?? "unknown", items, required: !!req && (req.kind === "boolean" ? req.value : req.kind === "array" ? true : req.kind !== "null"), offset: keyStart });
        continue;
      }
      if (!value.entries.length) { out.push({ path, type: "mixed", required: false, offset: keyStart }); continue; }
      collect(value, path, out); // a nested object
      continue;
    }
    out.push({ path, type: direct ?? "unknown", required: false, offset: keyStart });
  }
}

// ---------- Comparing with documents ----------

/** The BSON type name of a value from the Node.js driver, in the same words as FieldType. */
export function bsonType(v: unknown): FieldType | "null" {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return "string";
  if (typeof v === "number" || typeof v === "bigint") return "number";
  if (typeof v === "boolean") return "boolean";
  if (v instanceof Date) return "date";
  if (Array.isArray(v)) return "array";
  const t = (v as { _bsontype?: string })._bsontype;
  if (t === "ObjectId" || t === "ObjectID") return "objectId";
  if (t === "Decimal128") return "decimal";
  if (t === "Binary" || t === "UUID") return "binData";
  if (t === "Long" || t === "Int32" || t === "Double") return "number";
  if (t) return "unknown";
  return "object";
}
/** Each document's fields as dotted paths, down into nested objects but not into arrays. */
export function flatten(doc: Record<string, unknown>, prefix = "", out = new Map<string, unknown>()): Map<string, unknown> {
  for (const [k, v] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (bsonType(v) === "object" && Object.keys(v as object).length) flatten(v as Record<string, unknown>, path, out);
    else out.set(path, v);
  }
  return out;
}

export interface Drift {
  path: string;
  kind: "not-in-schema" | "wrong-type" | "required-missing" | "never-present";
  percent: number; count: number;
  found?: string; expected?: FieldType;
  offset?: number;
  message: string;
}
const pct = (count: number, total: number) => Math.round((count / Math.max(total, 1)) * 1000) / 10;
/** How the documents differ from the schema. Small amounts are reported too, with their share. */
export function compare(schema: SchemaInfo, docs: Record<string, unknown>[]): Drift[] {
  const total = docs.length;
  if (!total) return [];
  const fields = new Map(schema.fields.map(f => [f.path, f]));
  const free = schema.fields.filter(f => f.type === "mixed" || f.type === "map" || (f.type === "array" && (f.items === "object" || f.items === "mixed"))).map(f => f.path);
  const underFree = (p: string) => free.some(f => p === f || p.startsWith(f + "."));
  const seen = new Map<string, number>(), types = new Map<string, Map<string, number>>(), missingRequired = new Map<string, number>();
  for (const doc of docs) {
    const flat = flatten(doc);
    for (const [path, value] of flat) {
      seen.set(path, (seen.get(path) ?? 0) + 1);
      const t = bsonType(value);
      const byType = types.get(path) ?? new Map<string, number>();
      byType.set(t, (byType.get(t) ?? 0) + 1);
      types.set(path, byType);
    }
    for (const f of schema.fields) if (f.required && (flat.get(f.path) === undefined || flat.get(f.path) === null)) missingRequired.set(f.path, (missingRequired.get(f.path) ?? 0) + 1);
  }
  const out: Drift[] = [];
  const parentInSchema = (p: string) => { const parts = p.split("."); for (let i = parts.length - 1; i > 0; i--) if (fields.has(parts.slice(0, i).join("."))) return parts.slice(0, i).join("."); return undefined; };
  for (const [path, count] of seen) {
    if (path === "_id" || path === "__v" || underFree(path)) continue;
    const f = fields.get(path);
    if (!f) {
      if (parentInSchema(path) && fields.get(parentInSchema(path)!)?.type !== "object") continue;
      out.push({ path, kind: "not-in-schema", count, percent: pct(count, total), message: `${path} is in ${pct(count, total)}% of documents but not in the schema${schema.strict ? ", so Mongoose drops it when saving and hides it from your models" : ""}.` });
      continue;
    }
    if (f.type === "unknown" || f.type === "mixed" || f.type === "map") continue;
    const byType = types.get(path)!;
    for (const [t, c] of byType) {
      if (t === f.type || t === "null") continue;
      if (f.type === "array" && t === "array") continue;
      out.push({ path, kind: "wrong-type", count: c, percent: pct(c, total), found: t, expected: f.type, offset: f.offset, message: `${path} should be ${article(f.type)}, but it's ${article(t)} in ${pct(c, total)}% of documents (${c.toLocaleString("en-US")}).` });
    }
  }
  for (const [path, c] of missingRequired) out.push({ path, kind: "required-missing", count: c, percent: pct(c, total), offset: fields.get(path)?.offset, message: `${path} is required, but ${pct(c, total)}% of documents (${c.toLocaleString("en-US")}) don't have it.` });
  for (const f of schema.fields) {
    if (seen.has(f.path) || [...seen.keys()].some(p => p.startsWith(f.path + ".")) || missingRequired.has(f.path)) continue;
    out.push({ path: f.path, kind: "never-present", count: 0, percent: 0, offset: f.offset, message: `${f.path} isn't in any of the ${total.toLocaleString("en-US")} documents checked. Is it new, or renamed?` });
  }
  return out.sort((a, b) => order(a) - order(b) || b.percent - a.percent);
}
const order = (d: Drift) => ({ "wrong-type": 0, "required-missing": 1, "not-in-schema": 2, "never-present": 3 })[d.kind];
const article = (t: string) => (/^[aeiou]/i.test(t) && t !== "objectId" ? `an ${t}` : t === "objectId" ? "an ObjectId" : `a ${t}`);
