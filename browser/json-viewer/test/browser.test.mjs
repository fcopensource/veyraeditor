// Loads the extension into Chromium with Playwright and checks it on real pages from a local server.
// Run: node test/browser.test.mjs   (PLAYWRIGHT_PATH can point at a playwright package; default: the repo's)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.resolve(ext, "../../node_modules/playwright"));

const data = {
  user: { name: "Ada Lovelace", email: "ada@example.com", site: "https://example.com/ada" },
  orderId: "__BIG__",
  price: "__PRICE__",
  items: [{ sku: "A-1", qty: 2 }, { sku: "B-7", qty: 1 }],
  active: true,
  note: null,
};
const dataText = JSON.stringify(data, null, 2).replace('"__BIG__"', "12345678901234567890").replace('"__PRICE__"', "19.90");
const pages = {
  "/data.json": ["application/json; charset=utf-8", dataText],
  "/plain.txt": ["text/plain", '{"plain": [1, 2, 3]}'],
  "/notjson.txt": ["text/plain", "just some {text}"],
  "/broken.json": ["application/json", '{\n  "a": 1,\n  "b": 2,\n}'],
  "/xssi.json": ["application/json", ")]}'\n{\"safe\": true}"],
  "/evil.json": ["application/json", JSON.stringify({ html: "<img src=x onerror=\"window.__pwned=1\">", js: "javascript:window.__pwned=2" })],
  "/page.html": ["text/html", "<!doctype html><title>t</title><pre>{\"a\": 1}</pre>"],
  "/big.json": ["application/json", JSON.stringify({ rows: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: "row " + i })) })],
};
const server = http.createServer((req, res) => {
  const page = pages[req.url];
  if (!page) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": page[0] }); res.end(page[1]);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vjv-profile-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1280, height: 800 },
});
const step = s => console.log("[browser] " + s);
let failed = false;
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extId = worker.url().split("/")[2];
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  step("A JSON page becomes the tree");
  await page.goto(base + "/data.json");
  await page.waitForSelector(".vjv .vjv-row");
  assert.equal(await page.locator("pre").first().isHidden(), true, "the raw text is hidden");
  const keys = await page.locator(".vjv-tree .vjv-key").allTextContents();
  for (const k of ['"user"', '"name"', '"orderId"', '"items"', '"sku"']) assert.ok(keys.includes(k), k);

  step("Big and exactly-written numbers are shown exactly");
  const nums = await page.locator(".vjv-tree .vjv-number").allTextContents();
  assert.ok(nums.includes("12345678901234567890"), nums.join(","));
  assert.ok(nums.includes("19.90"));

  step("Links are links, and only http(s)");
  assert.equal(await page.locator(".vjv-link").getAttribute("href"), "https://example.com/ada");

  step("Clicking a value shows its path");
  await page.locator(".vjv-row", { hasText: '"email"' }).click();
  assert.equal(await page.locator(".vjv-path").textContent(), "$.user.email");

  step("Search finds keys and values and walks through them");
  await page.fill(".vjv-search", "ada");
  await page.waitForFunction(() => document.querySelector(".vjv-hits")?.textContent.includes("of"));
  assert.equal(await page.locator(".vjv-hits").textContent(), "1 of 3");
  await page.press(".vjv-search", "Enter");
  assert.equal(await page.locator(".vjv-hits").textContent(), "2 of 3");
  assert.equal(await page.locator(".vjv-path").textContent(), "$.user.email");

  step("Collapse all and expand all");
  await page.click("text=Collapse all");
  assert.equal(await page.locator(".vjv-tree .vjv-row", { hasText: '"sku"' }).count() > 0 ? await page.locator(".vjv-tree .vjv-row", { hasText: '"sku"' }).first().isVisible() : false, false);
  await page.click("text=Expand all");
  assert.equal(await page.locator(".vjv-tree .vjv-row", { hasText: '"sku"' }).first().isVisible(), true);

  step("Raw view: formatted, coloured, numbers exact");
  await page.click(".vjv-tab >> text=Raw");
  const raw = await page.locator(".vjv-raw").first().textContent();
  assert.ok(raw.includes('"orderId": 12345678901234567890') && raw.includes('"price": 19.90'), raw.slice(0, 200));
  assert.ok(await page.locator(".vjv-raw .vjv-t-key").count() > 5);
  await page.selectOption(".vjv-select", "4");
  assert.ok((await page.locator(".vjv-raw").first().textContent()).includes('\n    "user"'), "4-space indent");

  step("The chosen view and indent are remembered");
  await page.reload();
  await page.waitForSelector(".vjv");
  assert.equal(await page.locator(".vjv-tab.vjv-on").textContent(), "Raw");
  assert.equal(await page.locator(".vjv-select").inputValue(), "4");
  await page.click(".vjv-tab >> text=Tree");

  step("Plain text that is JSON is shown too; plain text that isn't is left alone");
  await page.goto(base + "/plain.txt"); await page.waitForSelector(".vjv");
  await page.goto(base + "/notjson.txt"); await page.waitForTimeout(400);
  assert.equal(await page.locator(".vjv").count(), 0);

  step("A web page is never touched, even with JSON in a <pre>");
  await page.goto(base + "/page.html"); await page.waitForTimeout(400);
  assert.equal(await page.locator(".vjv").count(), 0);

  step("Broken JSON: where the mistake is, with the line marked");
  await page.goto(base + "/broken.json"); await page.waitForSelector(".vjv-error");
  assert.match(await page.locator(".vjv-error").textContent(), /line 4, column 1: There.s an extra comma/);
  assert.equal(await page.locator(".vjv-line-bad .vjv-ln").textContent(), "4");

  step("Anti-hijacking prefixes are handled");
  await page.goto(base + "/xssi.json"); await page.waitForSelector(".vjv-row");
  assert.ok((await page.locator(".vjv-tree").textContent()).includes('"safe"'));

  step("JSON can't run anything: HTML stays text, javascript: isn't a link");
  await page.goto(base + "/evil.json"); await page.waitForSelector(".vjv-row");
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator(".vjv img").count(), 0);
  assert.equal(await page.locator(".vjv-link").count(), 0);

  step("5,000 rows: fast, and shown 200 at a time");
  const t0 = Date.now();
  await page.goto(base + "/big.json"); await page.waitForSelector(".vjv-row");
  const ms = Date.now() - t0;
  assert.ok(ms < 4000, `took ${ms} ms`);
  assert.match(await page.locator(".vjv-showall").first().textContent(), /Show 200 more of 4,800/);
  await page.fill(".vjv-search", "row 4321");
  await page.waitForFunction(() => document.querySelector(".vjv-hits")?.textContent === "1 of 1");
  assert.equal(await page.locator(".vjv-path").textContent(), "$.rows[4321].name");

  step("The toolbar button's page: paste JSON and view it");
  await page.goto(`chrome-extension://${extId}/src/viewer.html`);
  await page.fill("#input", '{"pasted": [true, false]}');
  await page.click("#view");
  await page.waitForSelector(".vjv-row");
  assert.ok((await page.locator(".vjv-tree").textContent()).includes('"pasted"'));
  await page.click(".vjv-back");
  await page.click("#sample");
  await page.waitForSelector(".vjv-row");
  assert.ok((await page.locator(".vjv-tree .vjv-number").allTextContents()).includes("9007199254740993123"));

  assert.deepEqual(errors, [], "no page errors");
  console.log("[browser] all checks passed");
} catch (e) {
  failed = true; console.error("[browser] FAILED:", e);
} finally {
  await context.close(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome may still hold a file: the OS cleans temp */ }
}
process.exit(failed ? 1 : 0);
