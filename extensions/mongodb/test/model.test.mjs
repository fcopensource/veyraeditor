import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseValue, toPlain } = require("../out/literal.js");
const q = require("../out/queries.js");
const a = require("../out/advice.js");
const s = require("../out/schema.js");

test("reads object literals from JavaScript and Python, keeping variables as variables", () => {
  const v = parseValue(`{ status: "paid", total: { $gte: minTotal }, tags: ["a", 'b'], deleted: false, note: null, name: /^ann/i, at: new Date(), ...rest, 'quoted-key': 1, [computed]: 2, short }`);
  assert.deepEqual(v.entries.map(e => e.key), ["status", "total", "tags", "deleted", "note", "name", "at", "quoted-key", "short"]);
  const plain = toPlain(v, (x, path) => `<${x.text}@${path}>`);
  assert.deepEqual(plain.total, { $gte: "<minTotal@total>" });
  assert.equal(plain.name.source, "^ann");
  assert.equal(plain.at, "<new Date()@at>");
  assert.equal(plain.short, "<short@short>");
  const py = toPlain(parseValue(`{"active": True, "deleted_at": None, "age": {"$gt": 18}, "name": f"{x}"}`), x => x.text);
  assert.deepEqual(py, { active: true, deleted_at: null, age: { $gt: 18 }, name: 'f"{x}"' });
  assert.deepEqual(toPlain(parseValue(`[("createdAt", -1), ("_id", 1)]`)), [["createdAt", -1], ["_id", 1]]);
  assert.equal(parseValue("(a || b)").kind, "var");
  assert.equal(parseValue("`orders-${id}`").kind, "var");
  assert.equal(parseValue("limit * 2").kind, "var");
});

test("finds Node.js driver queries and their collections", () => {
  const code = `
import { MongoClient } from "mongodb";
const db = client.db("shop");
const orders = db.collection("orders");
// orders.find({ commented: true })
export async function recent(customerId, since) {
  const list = await orders.find({ customerId, createdAt: { $gte: since }, status: { $in: ["paid", "shipped"] } }).sort({ createdAt: -1 }).limit(20).toArray();
  const one = await db.collection('users').findOne({ email: email.toLowerCase() });
  const n = await db.collection("orders").countDocuments({ status: "refunded" });
  const top = await orders.aggregate([{ $match: { status: "paid" } }, { $sort: { total: -1 } }, { $limit: 5 }, { $group: { _id: "$customerId" } }]).toArray();
  const fromOptions = await orders.find({ region }, { sort: { total: -1 }, limit: 3 });
  const notMongo = [1, 2, 3].find(x => x > 1);
  const text = "orders.find({ inString: 1 })";
  return { list, one, n, top };
}`;
  const found = q.findQueries(code, "js");
  assert.deepEqual(found.map(x => `${x.method}:${x.collection}`), ["find:orders", "findOne:users", "countDocuments:orders", "aggregate:orders", "find:orders"]);
  const [list, one, , agg, opts] = found;
  assert.deepEqual(list.sort, [{ path: "createdAt", dir: -1 }]);
  assert.equal(list.limit, 20);
  assert.equal(list.via, "variable");
  assert.equal(one.via, "collection()");
  assert.equal(one.limit, 1);
  assert.deepEqual(agg.sort, [{ path: "total", dir: -1 }]);
  assert.equal(agg.limit, 5);
  assert.deepEqual(toPlain(agg.filter), { status: "paid" });
  assert.deepEqual(opts.sort, [{ path: "total", dir: -1 }]);
  assert.equal(opts.limit, 3);
  assert.equal(code.split("\n")[list.line].slice(list.character, list.character + 4), "find");
});

test("finds Mongoose queries, with models and Mongoose's collection names", () => {
  const models = `
const orderSchema = new Schema({ customer: { type: Schema.Types.ObjectId, ref: "Customer" }, total: Number });
export const Order = mongoose.model("Order", orderSchema);
export const Person = model<IPerson>("Person", personSchema);
const Category = mongoose.model("Category", categorySchema, "product_categories");
const logSchema = new Schema({ level: String }, { collection: "app_logs" });
export const Log = mongoose.model("Log", logSchema);`;
  const known = q.findModels(models);
  assert.deepEqual(known.map(m => `${m.variable}=${m.collection}`), ["Order=orders", "Person=people", "Category=product_categories", "Log=app_logs"]);
  const code = `
import { Order, Person } from "../models";
const recent = await Order.find({ status: "paid", total: { $gt: 100 } }).sort("-createdAt total").limit(10).lean();
const people = await Person.find({ city }, null, { sort: { lastName: 1 } });
const exists = await Order.exists({ number: orderNumber });
const other = await mongoose.model("Category").find({ parent: null });`;
  const found = q.findQueries(code, "js", known);
  assert.deepEqual(found.map(x => `${x.method}:${x.collection}:${x.model}`), ["find:orders:Order", "find:people:Person", "exists:orders:Order", "find:product_categories:Category"]);
  assert.deepEqual(found[0].sort, [{ path: "createdAt", dir: -1 }, { path: "total", dir: 1 }]);
  assert.equal(found[0].limit, 10);
  assert.deepEqual(found[1].sort, [{ path: "lastName", dir: 1 }]);
  for (const [name, plural] of [["Mouse", "mice"], ["Status", "status"], ["Alias", "aliases"], ["Box", "boxes"], ["Company", "companies"], ["News", "news"], ["Child", "children"]]) assert.equal(q.mongoosePlural(name), plural);
});

test("finds PyMongo queries", () => {
  const code = `
from pymongo import MongoClient, DESCENDING
client = MongoClient(os.environ["MONGODB_URI"])
store = client["shop"]
orders = store.orders
users = store.get_collection("users")
# store.orders.find({"commented": True})
def recent(customer_id):
    rows = orders.find({"customer_id": customer_id, "status": "paid"}).sort("created_at", DESCENDING).limit(20)
    u = users.find_one({"email": email})
    n = db.invoices.count_documents({"paid": False})
    top = store["orders"].find({"total": {"$gt": 100}}, sort=[("total", -1)], limit=5)
    return rows`;
  const found = q.findQueries(code, "py");
  assert.deepEqual(found.map(x => `${x.method}:${x.collection}`), ["find:orders", "find_one:users", "count_documents:invoices", "find:orders"]);
  assert.deepEqual(found[0].sort, [{ path: "created_at", dir: -1 }]);
  assert.equal(found[0].limit, 20);
  assert.deepEqual(found[3].sort, [{ path: "total", dir: -1 }]);
  assert.equal(found[3].limit, 5);
});

test("explains why some queries can't be checked, and honours a collection hint", () => {
  const code = `
const filter = buildFilter(req.query);
const a = await db.collection("orders").find(filter).toArray();
const b = await db.collection("orders").aggregate(pipeline);
const c = await db.collection("orders").aggregate([{ $group: { _id: "$status" } }]);
// veyra-collection: invoices
const d = await repo.find({ paid: false });`;
  const found = q.findQueries(code, "js");
  assert.match(found[0].unsupported, /built at run time/);
  assert.match(found[1].unsupported, /built at run time/);
  assert.match(found[2].unsupported, /doesn't start with \$match/);
  assert.equal(found[3].collection, "invoices");
  assert.equal(found[3].via, "comment");
});

test("suggests indexes with the Equality, Sort, Range rule", () => {
  const shape = a.shapeOf(parseValue(`{ createdAt: { $gte: since }, customerId: id, status: { $in: ["paid", "shipped"] }, note: { $exists: true } }`));
  assert.deepEqual(shape.conditions, [{ path: "createdAt", op: "range" }, { path: "customerId", op: "eq" }, { path: "status", op: "in" }, { path: "note", op: "exists" }]);
  assert.deepEqual(a.suggestIndex(shape.conditions, [{ path: "total", dir: -1 }]), { customerId: 1, status: 1, total: -1, createdAt: 1, note: 1 });
  assert.equal(a.suggestIndex(a.shapeOf(parseValue(`{ _id: id }`)).conditions, []), undefined);
  assert.deepEqual(a.suggestIndex(a.shapeOf(parseValue(`{ name: /^Ann/ }`)).conditions, []), { name: 1 });
  assert.deepEqual(a.shapeOf(parseValue(`{ "address.city": city, $and: [{ a: 1 }, { b: { $lt: 2 } }] }`)).conditions.map(c => `${c.path}:${c.op}`), ["address.city:eq", "a:eq", "b:range"]);
  const or = a.shapeOf(parseValue(`{ $or: [{ a: 1 }, { b: 2 }] }`));
  assert.equal(or.or.length, 2);
  assert.ok(a.covers({ customerId: 1, status: 1, createdAt: -1 }, { customerId: 1, status: 1 }));
  assert.ok(a.covers({ a: -1, b: 1 }, { a: 1, b: -1 }), "an index can be read backwards");
  assert.ok(!a.covers({ status: 1, customerId: 1 }, { customerId: 1, status: 1 }));
  const code = a.indexCode("orders", { customerId: 1, createdAt: -1 }, "orderSchema");
  assert.equal(code.mongoose, "orderSchema.index({ customerId: 1, createdAt: -1 });");
  assert.equal(code.python, 'db["orders"].create_index([("customerId", ASCENDING), ("createdAt", DESCENDING)])');
  assert.equal(code.node, 'await db.collection("orders").createIndex({ customerId: 1, createdAt: -1 });');
});

test("reads explain() output from both query engines, in plain words", () => {
  const classic = { queryPlanner: { winningPlan: { stage: "SORT", inputStage: { stage: "COLLSCAN" } } }, executionStats: { nReturned: 20, totalDocsExamined: 48210, totalKeysExamined: 0, executionTimeMillis: 212 } };
  const plan = a.readExplain(classic);
  assert.equal(plan.scan, "collection");
  assert.equal(plan.inMemorySort, true);
  const shape = a.shapeOf(parseValue("{ customerId: id }"));
  const v = a.verdict({ sort: [{ path: "createdAt", dir: -1 }] }, shape, plan, [{ _id: 1 }]);
  assert.equal(v.level, "warning");
  assert.deepEqual(v.suggestion, { customerId: 1, createdAt: -1 });
  assert.equal(a.lensTitle(v, plan), "⚠ Full collection scan · 48,210 read → 20 returned · 212 ms");
  const sbe = { queryPlanner: { winningPlan: { queryPlan: { stage: "FETCH", inputStage: { stage: "IXSCAN", indexName: "customerId_1_createdAt_-1", keyPattern: { customerId: 1, createdAt: -1 } } } } }, executionStats: { nReturned: 20, totalDocsExamined: 20, totalKeysExamined: 20, executionTimeMillis: 1 } };
  const good = a.verdict({ sort: [] }, shape, a.readExplain(sbe), [{ customerId: 1, createdAt: -1 }]);
  assert.equal(good.level, "good");
  assert.equal(good.title, "Uses index customerId_1_createdAt_-1");
  const small = a.verdict({ sort: [] }, shape, { ...plan, inMemorySort: false, docsExamined: 40, returned: 3 }, []);
  assert.equal(small.level, "info");
  assert.match(small.detail, /Fine now, but it grows/);
  const already = a.verdict({ sort: [] }, shape, { ...plan, inMemorySort: false }, [{ customerId: 1 }]);
  assert.equal(already.suggestion, undefined, "an index that exists is not suggested again");
  assert.equal(a.readExplain({ queryPlanner: { winningPlan: { stage: "IDHACK" } }, executionStats: {} }).scan, "id");
  assert.equal(a.readExplain({ queryPlanner: { winningPlan: { stage: "EOF" } }, executionStats: {} }).scan, "none");
});

test("reads Mongoose schemas", () => {
  const code = `
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: Number,
  tags: [String],
  sku: { type: String, required: [true, "SKU is needed"] },
  dimensions: { width: Number, height: { type: Number } },
  meta: {},
  owner: { type: Schema.Types.ObjectId, ref: "User" },
  variants: [{ color: String }],
}, { timestamps: true });`;
  const [schema] = s.findSchemas(code);
  assert.equal(schema.variable, "productSchema");
  assert.deepEqual(schema.fields.map(f => `${f.path}:${f.type}${f.items ? `<${f.items}>` : ""}${f.required ? "!" : ""}`), [
    "name:string!", "price:number", "tags:array<string>", "sku:string!", "dimensions.width:number", "dimensions.height:number", "meta:mixed", "owner:objectId", "variants:array<object>", "createdAt:date", "updatedAt:date",
  ]);
  assert.equal(code.slice(schema.fields[1].offset, schema.fields[1].offset + 5), "price");
});

test("finds drift between a schema and real documents", () => {
  const [schema] = s.findSchemas(`const p = new Schema({ name: { type: String, required: true }, price: Number, tags: [String], dims: { width: Number }, legacy: String });`);
  const docs = [];
  for (let i = 0; i < 100; i++) docs.push({ _id: { _bsontype: "ObjectId" }, name: i < 95 ? `P${i}` : null, price: i < 12 ? String(i) : i, tags: ["x"], dims: { width: 1 }, ...(i < 38 ? { phone: "123" } : {}), __v: 0 });
  const drift = s.compare(schema, docs);
  const by = k => drift.filter(d => d.kind === k).map(d => `${d.path} ${d.percent}%`);
  assert.deepEqual(by("wrong-type"), ["price 12%"]);
  assert.deepEqual(by("required-missing"), ["name 5%"]);
  assert.deepEqual(by("not-in-schema"), ["phone 38%"]);
  assert.deepEqual(by("never-present"), ["legacy 0%"]);
  assert.equal(drift.find(d => d.kind === "wrong-type").message, "price should be a number, but it's a string in 12% of documents (12).");
  assert.match(drift.find(d => d.kind === "not-in-schema").message, /Mongoose drops it when saving/);
});
