import { Reader, type Value } from "./literal";

/* Finds MongoDB queries in JavaScript, TypeScript and Python code, and works out which collection each one reads. */

export type Language = "js" | "py";
export interface SortKey { path: string; dir: 1 | -1 }
export interface Query {
  method: string;
  /** Offset and position of the method name, where the lens goes. */
  offset: number; line: number; character: number;
  receiver: string;
  collection?: string;
  /** How the collection was found, for the details panel. */
  via?: "collection()" | "model" | "variable" | "attribute" | "comment";
  model?: string;
  filter?: Value;
  sort: SortKey[];
  limit?: number;
  pipeline: boolean;
  /** Why the query can't be checked (a filter built at run time, for example). */
  unsupported?: string;
}
export interface ModelInfo { variable?: string; name: string; collection: string; schemaVariable?: string }

// ---------- Methods ----------

const FILTER_FIRST = new Set([
  "find", "findOne", "countDocuments", "count", "deleteOne", "deleteMany", "updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "findOneAndRemove", "exists", "estimatedDocumentCount",
  "find_one", "count_documents", "delete_one", "delete_many", "update_one", "update_many", "replace_one", "find_one_and_update", "find_one_and_delete", "find_one_and_replace",
]);
const METHODS = new Set([...FILTER_FIRST, "aggregate", "distinct"]);
const METHOD_RE = new RegExp(`\\.\\s*(${[...METHODS].sort((a, b) => b.length - a.length).join("|")})\\s*\\(`, "g");

// ---------- Masking comments and strings ----------

/** Copies the text with comments, and the inside of strings, replaced by spaces, so searches skip them. */
export function mask(text: string, lang: Language): string {
  const out = text.split("");
  const blank = (a: number, b: number) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (lang === "js" && text.startsWith("//", i)) { const e = text.indexOf("\n", i); blank(i, e < 0 ? text.length : e); i = e < 0 ? text.length : e; continue; }
    if (lang === "js" && text.startsWith("/*", i)) { const e = text.indexOf("*/", i + 2); const end = e < 0 ? text.length : e + 2; blank(i, end); i = end; continue; }
    if (lang === "py" && c === "#") { const e = text.indexOf("\n", i); blank(i, e < 0 ? text.length : e); i = e < 0 ? text.length : e; continue; }
    if (c === '"' || c === "'" || (lang === "js" && c === "`")) {
      const triple = lang === "py" && text.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < text.length && !text.startsWith(q, j)) { if (text[j] === "\\") j++; else if (text[j] === "\n" && !triple && c !== "`") break; j++; }
      blank(i + q.length, j);
      i = j + q.length;
      continue;
    }
    i++;
  }
  return out.join("");
}

// ---------- Mongoose models ----------

const UNCOUNTABLE = new Set(["advice", "energy", "excretion", "digestion", "cooperation", "health", "justice", "labour", "machinery", "equipment", "information", "pollution", "sewage", "paper", "money", "species", "series", "rain", "rice", "fish", "sheep", "moose", "deer", "news", "expertise", "status", "media"]);
const PLURAL: [RegExp, string][] = [
  [/(m)an$/i, "$1en"], [/(pe)rson$/i, "$1ople"], [/(child)$/i, "$1ren"], [/^(ox)$/i, "$1en"], [/(ax|test)is$/i, "$1es"], [/(octop|vir)us$/i, "$1i"],
  [/(alias|status)$/i, "$1es"], [/(bu)s$/i, "$1ses"], [/(buffal|tomat|potat)o$/i, "$1oes"], [/([ti])um$/i, "$1a"], [/sis$/i, "ses"],
  [/(?:([^f])fe|([lr])f)$/i, "$1$2ves"], [/(hive)$/i, "$1s"], [/([^aeiouy]|qu)y$/i, "$1ies"], [/(x|ch|ss|sh)$/i, "$1es"],
  [/(matr|vert|ind)ix|ex$/i, "$1ices"], [/([m|l])ouse$/i, "$1ice"], [/(kn|w|l)ife$/i, "$1ives"], [/(quiz)$/i, "$1zes"], [/s$/i, "s"], [/([^a-z])$/, "$1"], [/$/, "s"],
];
/** The collection name Mongoose uses for a model name: "Order" → "orders", "Person" → "people", "Category" → "categories". */
export function mongoosePlural(name: string): string {
  const lower = name.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return lower;
  for (const [re, to] of PLURAL) if (re.test(lower)) return lower.replace(re, to);
  return lower;
}

/** Mongoose models defined in a file: `const Order = mongoose.model("Order", orderSchema, "optional_collection")`. */
export function findModels(text: string): ModelInfo[] {
  const out: ModelInfo[] = [];
  const re = /(?:(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*)?(?:\w+\.)?model\s*(?:<[^>()]*>)?\s*\(\s*(['"`])([\w.\-]+)\2\s*,\s*(?:(\w+)\b(?!\s*\()|new\b[^,)]*(?:\([^)]*\))?)(?:\s*,\s*(['"`])([\w.\-]+)\5)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [, variable, , name, schemaVariable, , explicit] = m;
    const schemaCollection = schemaVariable ? collectionOption(text, schemaVariable) : undefined;
    out.push({ variable, name, collection: explicit ?? schemaCollection ?? mongoosePlural(name), schemaVariable });
  }
  return out;
}
/** The `collection` option of `const <variable> = new Schema({...}, { collection: "x" })`. */
function collectionOption(text: string, variable: string): string | undefined {
  const at = new RegExp(`\\b${variable}\\s*(?::[^=]+)?=\\s*new\\s+(?:\\w+\\.)?Schema\\s*(?:<[^>()]*>)?\\s*\\(`).exec(text);
  if (!at) return undefined;
  const r = new Reader(text, at.index + at[0].length);
  r.value();
  if (r.peek() !== ",") return undefined;
  r.i++;
  const options = r.value();
  const coll = options.kind === "object" ? options.entries.find(e => e.key === "collection")?.value : undefined;
  return coll?.kind === "string" ? coll.value : undefined;
}

// ---------- Finding queries ----------

function lineCol(text: string, offset: number) {
  let line = 0, last = -1;
  for (let k = text.indexOf("\n"); k >= 0 && k < offset; k = text.indexOf("\n", k + 1)) { line++; last = k; }
  return { line, character: offset - last - 1 };
}
/** The expression before ".method(": `db.collection("x")`, `Order`, `this.orders`, `db["orders"]`. */
function receiverBefore(text: string, masked: string, dot: number): string {
  let j = dot - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (text[j] === "?" ) j--; // optional chaining
  const end = j + 1;
  while (j >= 0) {
    const c = masked[j];
    if (c === ")" || c === "]") {
      const open = c === ")" ? "(" : "[";
      let depth = 0;
      for (; j >= 0; j--) { if (masked[j] === c) depth++; else if (masked[j] === open && --depth === 0) break; }
      j--;
      continue;
    }
    if (/[\w$.]/.test(c)) { j--; continue; }
    if (c === "?" && masked[j + 1] === ".") { j--; continue; }
    break;
  }
  return text.slice(j + 1, end).replace(/^\.+/, "").trim();
}

interface Args { positional: Value[]; keywords: Map<string, Value>; end: number }
function readArgs(text: string, open: number): Args {
  const r = new Reader(text, open + 1);
  const positional: Value[] = [], keywords = new Map<string, Value>();
  for (let guard = 0; guard < 20; guard++) {
    const c = r.peek();
    if (c === undefined || c === ")") { r.i++; break; }
    if (c === ",") { r.i++; continue; }
    const kw = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(text.slice(r.i));
    if (kw) { r.i += kw[0].length; keywords.set(kw[1], r.value()); continue; }
    const before = r.i;
    positional.push(r.value());
    if (r.i === before) { r.skipBalanced(); }
  }
  return { positional, keywords, end: r.i };
}

const DIR: Record<string, 1 | -1> = { "1": 1, "-1": -1, asc: 1, ascending: 1, desc: -1, descending: -1, ASCENDING: 1, DESCENDING: -1 };
function dirOf(v: Value | undefined): 1 | -1 | undefined {
  if (!v) return 1;
  if (v.kind === "number") return v.value < 0 ? -1 : 1;
  if (v.kind === "string") return DIR[v.value.toLowerCase()];
  if (v.kind === "var") return DIR[v.text.split(".").pop()!] ?? undefined;
  return undefined;
}
/** { a: 1, b: -1 }, [["a", 1]], [("a", -1)], "-createdAt name", or sort("a", -1) in Python. */
export function readSort(args: Value[]): SortKey[] {
  const [first, second] = args;
  if (!first) return [];
  if (first.kind === "string") {
    if (second) { const d = dirOf(second); return d ? [{ path: first.value, dir: d }] : []; }
    return first.value.split(/\s+/).filter(Boolean).map(p => ({ path: p.replace(/^[-+]/, ""), dir: p.startsWith("-") ? -1 : 1 }));
  }
  if (first.kind === "object") return first.entries.flatMap(e => { const d = dirOf(e.value); return d ? [{ path: e.key, dir: d }] : []; });
  if (first.kind === "array") return first.items.flatMap(item => (item.kind === "array" && item.items[0]?.kind === "string" ? [{ path: item.items[0].value, dir: dirOf(item.items[1]) ?? 1 }] : []));
  return [];
}

/** Every MongoDB query call in a file. `models` maps model variable and model names to collections. */
export function findQueries(text: string, lang: Language, models: ModelInfo[] = []): Query[] {
  const masked = mask(text, lang);
  const localModels = [...findModels(text), ...models];
  const out: Query[] = [];
  METHOD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = METHOD_RE.exec(masked))) {
    const method = m[1];
    const dot = m.index;
    const nameAt = masked.indexOf(method, dot);
    const open = masked.indexOf("(", nameAt + method.length);
    const receiver = receiverBefore(text, masked, dot);
    if (!receiver || /^(\[|\]|\)|Array|Object|JSON|Promise|Math|_|lodash|this\.\$|\$|res|req|arr|list|items|array|data)$/.test(receiver)) continue;
    const args = readArgs(text, open);
    const where = lineCol(text, nameAt);
    const q: Query = { method, offset: nameAt, ...where, receiver, sort: [], pipeline: method === "aggregate" };
    // Which collection
    const resolved = resolveCollection(receiver, text, lang, localModels, where.line);
    if (!resolved) continue; // not a MongoDB call we can place (an array's .find, for example)
    Object.assign(q, resolved);

    if (method === "aggregate") {
      const pipeline = args.positional[0];
      if (!pipeline || pipeline.kind !== "array") { q.unsupported = "The pipeline is built at run time."; out.push(q); continue; }
      const matches: Value[] = [];
      for (const stage of pipeline.items) {
        if (stage.kind !== "object" || stage.entries.length !== 1) break;
        const [{ key, value }] = stage.entries;
        if (key === "$match") matches.push(value);
        else if (key === "$sort") { q.sort = readSort([value]); }
        else if (key === "$limit" && value.kind === "number") { q.limit = value.value; break; }
        else break;
        if (key === "$sort") { const next = pipeline.items[pipeline.items.indexOf(stage) + 1]; if (next?.kind === "object" && next.entries[0]?.key === "$limit" && next.entries[0].value.kind === "number") q.limit = next.entries[0].value.value; break; }
      }
      if (!matches.length) { q.unsupported = "The pipeline doesn't start with $match, so it reads every document by design."; out.push(q); continue; }
      q.filter = matches.length === 1 ? matches[0] : { kind: "object", start: matches[0].start, end: matches[matches.length - 1].end, entries: [{ key: "$and", keyStart: matches[0].start, value: { kind: "array", items: matches, start: matches[0].start, end: matches[matches.length - 1].end } }] };
      out.push(q);
      continue;
    }
    const filterArg = method === "distinct" ? args.positional[1] : args.positional[0] ?? args.keywords.get("filter");
    if (method === "estimatedDocumentCount") continue;
    if (!filterArg) q.filter = { kind: "object", entries: [], start: open, end: open };
    else if (filterArg.kind === "object") q.filter = filterArg;
    else { q.unsupported = "The filter is built at run time."; }
    // Options: driver find(filter, { sort, limit }), Mongoose find(filter, projection, { sort, limit }), PyMongo keywords.
    for (const opt of [args.positional[1], args.positional[2]]) {
      if (opt?.kind !== "object") continue;
      const sortOpt = opt.entries.find(e => e.key === "sort")?.value;
      if (sortOpt) q.sort = readSort([sortOpt]);
      const limitOpt = opt.entries.find(e => e.key === "limit")?.value;
      if (limitOpt?.kind === "number") q.limit = limitOpt.value;
    }
    if (args.keywords.get("sort")) q.sort = readSort([args.keywords.get("sort")!]);
    const kwLimit = args.keywords.get("limit");
    if (kwLimit?.kind === "number") q.limit = kwLimit.value;
    if (/^(findOne|find_one|exists|findOneAnd|find_one_and)/.test(method)) q.limit = 1;
    // Chained calls: .sort(…).limit(…).skip(…).select(…).lean()
    let at = args.end;
    for (let guard = 0; guard < 12; guard++) {
      const chain = /^\s*\??\.\s*([A-Za-z_]\w*)\s*\(/.exec(text.slice(at));
      if (!chain) break;
      const chainOpen = at + chain[0].length - 1;
      const chainArgs = readArgs(text, chainOpen);
      if (chain[1] === "sort") q.sort = readSort(chainArgs.positional);
      if (chain[1] === "limit" && chainArgs.positional[0]?.kind === "number") q.limit = (chainArgs.positional[0] as { value: number }).value;
      at = chainArgs.end;
    }
    out.push(q);
  }
  return out;
}

function resolveCollection(receiver: string, text: string, lang: Language, models: ModelInfo[], line: number): Pick<Query, "collection" | "via" | "model"> | undefined {
  const lines = text.split(/\r?\n/);
  const hint = /veyra-collection:\s*([\w.\-]+)/.exec(`${lines[line - 1] ?? ""} ${lines[line] ?? ""}`);
  if (hint) return { collection: hint[1], via: "comment" };
  const explicit = /\.(?:collection|getCollection|get_collection)\(\s*(['"`])([\w.\-]+)\1\s*\)$/.exec(receiver) ?? /\[\s*(['"])([\w.\-]+)\1\s*\]$/.exec(receiver);
  if (explicit) return { collection: explicit[2], via: "collection()" };
  const modelCall = /\bmodel\s*(?:<[^>]*>)?\(\s*(['"`])([\w.\-]+)\1\s*\)$/.exec(receiver);
  if (modelCall) { const known = models.find(x => x.name === modelCall[2]); return { collection: known?.collection ?? mongoosePlural(modelCall[2]), via: "model", model: modelCall[2] }; }
  const bare = receiver.replace(/^this\./, "");
  const model = models.find(x => x.variable === bare) ?? models.find(x => x.name === bare);
  if (model && /^[A-Z]/.test(bare)) return { collection: model.collection, via: "model", model: model.name };
  // A variable assigned from db.collection("x") earlier in the file.
  if (/^[\w$]+(\.[\w$]+)?$/.test(receiver)) {
    const name = receiver.replace(/^(this|self)\./, "");
    const assign = new RegExp(`(?:^|[\\s(,;{])(?:this\\.|self\\.)?${name.replace(/\$/g, "\\$")}\\s*(?::[^=\\n]+)?=(?!=)\\s*(?:await\\s+)?([^;\\n]+)`, "m").exec(text);
    if (assign) {
      const rhs = assign[1];
      const fromCall = /\.(?:collection|getCollection|get_collection)\(\s*(['"`])([\w.\-]+)\1\s*\)/.exec(rhs) ?? /\[\s*(['"])([\w.\-]+)\1\s*\]\s*$/.exec(rhs.trim());
      if (fromCall) return { collection: fromCall[2], via: "variable" };
      const modelRhs = /\bmodel\s*(?:<[^>]*>)?\(\s*(['"`])([\w.\-]+)\1/.exec(rhs);
      if (modelRhs) { const known = models.find(x => x.name === modelRhs[2]); return { collection: known?.collection ?? mongoosePlural(modelRhs[2]), via: "model", model: modelRhs[2] }; }
      if (lang === "py") { const attr = /^([\w]+)\.([A-Za-z_]\w*)\s*$/.exec(rhs.trim()); if (attr && isPyDatabase(attr[1], text)) return { collection: attr[2], via: "variable" }; }
    }
  }
  // Python: db.orders.find(…)
  if (lang === "py") {
    const attr = /^([\w]+)\.([A-Za-z_]\w*)$/.exec(receiver);
    if (attr && isPyDatabase(attr[1], text)) return { collection: attr[2], via: "attribute" };
  }
  return undefined;
}
/** Whether a Python name holds a database: named like one, or assigned from a client. */
function isPyDatabase(name: string, text: string): boolean {
  if (/^(db|database|mongo_?db|.*_db)$/i.test(name)) return true;
  return new RegExp(`\\b${name}\\s*=\\s*(?:\\w+\\[|\\w+\\.get_database\\(|\\w+\\.get_default_database\\(|MongoClient\\([^)]*\\)\\[|AsyncIOMotorClient\\([^)]*\\)\\[|\\w+\\.client\\[)`).test(text);
}
