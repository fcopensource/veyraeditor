// Runs test/integration/suite.js inside VS Code with a sample Mongoose app. With MONGODB_TEST_URI set, it seeds a real
// database first and puts its address in the app's .env, as a developer would.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-mongo-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };

write("models/order.js", [
  'const mongoose = require("mongoose");',
  "const orderSchema = new mongoose.Schema({ customerId: String, status: String, total: Number, region: String, createdAt: Date });",
  "orderSchema.index({ region: 1 });",
  'module.exports = mongoose.model("Order", orderSchema);',
  "",
].join("\n"));
write("models/product.js", [
  'const { Schema, model } = require("mongoose");',
  "const productSchema = new Schema({",
  "  name: { type: String, required: true },",
  "  price: Number,",
  "  discontinued: Boolean,",
  "});",
  'module.exports = model("Product", productSchema);',
  "",
].join("\n"));
write("src/orders.js", [
  'const Order = require("../models/order");',
  "async function recentForCustomer(customerId, since) {",
  "  return Order.find({ customerId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20);",
  "}",
  "async function byRegion(region) {",
  "  return Order.find({ region });",
  "}",
  "async function report(db, pipeline) {",
  '  return db.collection("orders").aggregate(pipeline).toArray();',
  "}",
  "module.exports = { recentForCustomer, byRegion, report };",
  "",
].join("\n"));
write("app.py", ["from pymongo import MongoClient", "db = MongoClient()['lens_it']", "def paid(status):", '    return list(db.orders.find({"status": status}))', ""].join("\n"));

const base = process.env.MONGODB_TEST_URI;
if (base) {
  const { MongoClient } = createRequire(path.join(root, "package.json"))("mongodb");
  const client = new MongoClient(base);
  await client.connect();
  const db = client.db("lens_it");
  await db.dropDatabase();
  const statuses = ["paid", "shipped", "refunded"];
  await db.collection("orders").insertMany(Array.from({ length: 5000 }, (_, i) => ({ customerId: `c${i % 200}`, status: statuses[i % 3], total: i % 500, region: i % 2 ? "eu" : "us", createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60000) })));
  await db.collection("orders").createIndex({ region: 1 });
  await db.collection("products").insertMany(Array.from({ length: 100 }, (_, i) => ({ name: `P${i}`, price: i < 10 ? `${i}.50` : i + 0.5, color: i < 30 ? "red" : undefined })));
  // A user with a non-ASCII password: signing in with SCRAM-SHA-256 runs it through saslprep, which build.mjs replaces.
  const password = "Pässwörd Ünïcode-42";
  await client.db("admin").command({ dropUser: "lens" }).catch(() => {});
  await client.db("admin").command({ createUser: "lens", pwd: password, roles: [{ role: "readWrite", db: "lens_it" }], mechanisms: ["SCRAM-SHA-256"] });
  await client.close();
  const url = new URL(base.replace(/^mongodb/, "http"));
  url.pathname = "/lens_it";
  url.username = "lens";
  url.password = encodeURIComponent(password);
  url.search = "?authSource=admin&authMechanism=SCRAM-SHA-256";
  write(".env", `MONGODB_URI=${url.toString().replace(/^http/, "mongodb")}\n`);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-mongo-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  extensionTestsEnv: { VEYRA_EXPECT_MONGO: base ? "1" : "" },
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
