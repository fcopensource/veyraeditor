// Runs Query Lens against a real MongoDB server (started by mongodb-memory-server, or MONGODB_TEST_URI).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Mongo, isLocalUri, redact, databaseOf } = require("../out/db.js");
const { findQueries, findModels } = require("../out/queries.js");
const { shapeOf, verdict, suggestIndex } = require("../out/advice.js");
const { findSchemas, compare } = require("../out/schema.js");

let server, mongo, uri;
before(async () => {
  uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    server = await MongoMemoryServer.create();
    uri = server.getUri();
  }
  mongo = await Mongo.connect(uri, "veyra_lens_test");
  await mongo.db.dropDatabase();
  const orders = [];
  const statuses = ["paid", "shipped", "refunded", "pending"];
  for (let i = 0; i < 20000; i++) orders.push({ customerId: `c${i % 500}`, status: statuses[i % 4], total: (i * 37) % 1000, createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000), region: i % 2 ? "eu" : "us" });
  await mongo.db.collection("orders").insertMany(orders);
  await mongo.db.collection("orders").createIndex({ legacyCode: 1 }, { name: "legacyCode_1" });
  await mongo.db.collection("orders").createIndex({ region: 1 }, { name: "region_1" });
  const products = [];
  for (let i = 0; i < 200; i++) products.push({ name: i < 190 ? `Product ${i}` : null, price: i < 24 ? `${i}.99` : i + 0.99, tags: ["a"], ...(i < 76 ? { phone: "123" } : {}), __v: 0 });
  await mongo.db.collection("products").insertMany(products);
});
after(async () => { await mongo?.db.dropDatabase().catch(() => {}); await mongo?.close(); await server?.stop(); });

const CODE = `
const orders = db.collection("orders");
export async function recentForCustomer(customerId, since) {
  return orders.find({ customerId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).toArray();
}
export const byRegion = region => orders.find({ region: region }).toArray();
export const byStatuses = statuses => orders.countDocuments({ status: { $in: statuses } });
`;

test("finds a slow query in code, suggests an index, and the index fixes it", async () => {
  const [recent] = findQueries(CODE, "js");
  assert.equal(recent.collection, "orders");
  const before = await mongo.analyze(recent, 5000);
  assert.equal(before.plan.scan, "collection", JSON.stringify(before.plan));
  assert.ok(before.plan.docsExamined >= 20000);
  assert.ok(before.plan.returned > 0, "the variables were filled with real values, so documents match");
  assert.deepEqual(before.sampled.sort(), ["createdAt", "customerId"]);
  assert.ok(before.filter.createdAt.$gte instanceof Date, "a sampled date stays a date");
  const v = verdict(recent, shapeOf(recent.filter), before.plan, before.indexes);
  assert.equal(v.level, "warning");
  assert.deepEqual(v.suggestion, { customerId: 1, createdAt: -1 });
  await mongo.createIndex("orders", v.suggestion);
  const after = await mongo.analyze(recent, 5000);
  assert.equal(after.plan.scan, "index");
  assert.equal(after.plan.index, "customerId_1_createdAt_-1");
  assert.equal(after.plan.inMemorySort, false);
  assert.ok(after.plan.docsExamined <= 20, `reads at most what it returns: ${after.plan.docsExamined}`);
  const good = verdict(recent, shapeOf(recent.filter), after.plan, after.indexes);
  assert.equal(good.level, "good");
  assert.equal(good.suggestion, undefined);
});

test("a query that already has an index is good, and $in gets an array of real values", async () => {
  const [, byRegion, byStatuses] = findQueries(CODE, "js");
  const region = await mongo.analyze(byRegion, 5000);
  assert.equal(region.plan.index, "region_1");
  assert.ok(["eu", "us"].includes(region.filter.region));
  const statuses = await mongo.analyze(byStatuses, 5000);
  assert.ok(Array.isArray(statuses.filter.status.$in) && statuses.filter.status.$in.length === 1);
  assert.equal(statuses.plan.scan, "collection");
  assert.deepEqual(suggestIndex(shapeOf(byStatuses.filter).conditions, []), { status: 1 });
});

test("Index Doctor: sizes, and indexes no query has used", async () => {
  await mongo.db.collection("orders").find({ region: "eu" }).limit(1).toArray();
  const info = await mongo.collectionInfo("orders");
  assert.equal(info.count, 20000);
  const legacy = info.indexes.find(i => i.name === "legacyCode_1");
  const region = info.indexes.find(i => i.name === "region_1");
  if (info.statsAvailable) {
    assert.equal(legacy.ops, 0, "never used");
    assert.ok(region.ops > 0, "used by the query above");
  }
  assert.ok(info.indexes.every(i => i.size === undefined || i.size > 0));
  assert.ok(info.indexes.some(i => i.name === "_id_"));
  await mongo.dropIndex("orders", "legacyCode_1");
  assert.ok(!(await mongo.indexes("orders")).some(i => i.name === "legacyCode_1"));
  await assert.rejects(mongo.dropIndex("orders", "_id_"), /can't be dropped/);
  assert.deepEqual(await mongo.collections(), ["orders", "products"]);
});

test("Schema drift between a Mongoose schema and real documents", async () => {
  const code = `
const productSchema = new Schema({ name: { type: String, required: true }, price: Number, tags: [String], discontinued: Boolean });
export const Product = mongoose.model("Product", productSchema);`;
  const [schema] = findSchemas(code);
  const [model] = findModels(code);
  assert.equal(model.collection, "products");
  const docs = await mongo.sampleDocuments(model.collection, 1000);
  assert.equal(docs.length, 200);
  const drift = compare(schema, docs);
  const by = kind => drift.filter(d => d.kind === kind).map(d => `${d.path} ${d.percent}%`);
  assert.deepEqual(by("wrong-type"), ["price 12%"]);
  assert.deepEqual(by("required-missing"), ["name 5%"]);
  assert.deepEqual(by("not-in-schema"), ["phone 38%"]);
  assert.deepEqual(by("never-present"), ["discontinued 0%"]);
});

test("connection strings", () => {
  assert.ok(isLocalUri("mongodb://localhost:27017/shop"));
  assert.ok(isLocalUri("mongodb://user:pw@127.0.0.1:27017,127.0.0.1:27018/?replicaSet=rs0"));
  assert.ok(isLocalUri("mongodb://mongo:27017"), "a Docker Compose service name");
  assert.ok(!isLocalUri("mongodb+srv://user:pw@cluster0.abcde.mongodb.net/shop"));
  assert.ok(!isLocalUri("mongodb://db.example.com:27017"));
  assert.equal(redact("mongodb+srv://ana:s3cret@cluster0.x.mongodb.net/shop"), "mongodb+srv://ana:••••@cluster0.x.mongodb.net/shop");
  assert.equal(databaseOf("mongodb://localhost:27017/shop?retryWrites=true"), "shop");
  assert.equal(databaseOf("mongodb://localhost:27017/"), undefined);
  assert.ok(isLocalUri(uri), "the test server is local");
});
