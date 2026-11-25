// Makes the Chrome Web Store screenshots (1280x800) and promo tile (440x280) from the real extension.
// Run: node scripts/screenshots.mjs   (PLAYWRIGHT_PATH can point at a playwright package)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(ext, "store");
fs.mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.resolve(ext, "../../node_modules/playwright"));

const api = `{
  "id": 9007199254740993123,
  "status": "shipped",
  "total": 149.90,
  "currency": "EUR",
  "customer": { "name": "Northwind Traders", "email": "orders@northwind.example", "website": "https://northwind.example" },
  "items": [
    { "sku": "KB-210", "title": "Mechanical keyboard", "qty": 1, "price": 89.90, "tags": ["hardware", "desk"] },
    { "sku": "MS-044", "title": "Wireless mouse", "qty": 2, "price": 30.00, "tags": ["hardware"] }
  ],
  "shipping": { "carrier": "DHL", "tracking": "JD014600006281230452", "eta": "2026-12-02", "address": { "city": "Berlin", "country": "DE" } },
  "gift": false,
  "coupon": null
}`;
const broken = `{
  "name": "veyra-app",
  "version": "1.4.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
  },
  "dependencies": { "react": "^19.2.0" }
}`;
const pages = { "/orders/1042.json": api, "/package.json": broken };
const server = http.createServer((req, res) => {
  const body = pages[req.url];
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "application/json" }); res.end(body);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vjv-shots-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, colorScheme: "dark",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 1280, height: 800 },
});
try {
  const page = await context.newPage();
  // 1. the tree, with a value selected and its path shown
  await page.goto(base + "/orders/1042.json");
  await page.waitForSelector(".vjv-row");
  await page.locator(".vjv-row", { hasText: '"tracking"' }).click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(out, "1-tree.png") });
  // 2. search
  await page.fill(".vjv-search", "hardware");
  await page.waitForFunction(() => document.querySelector(".vjv-hits")?.textContent.includes("of"));
  await page.screenshot({ path: path.join(out, "2-search.png") });
  // 3. raw, coloured
  await page.fill(".vjv-search", "");
  await page.click(".vjv-tab >> text=Raw");
  await page.screenshot({ path: path.join(out, "3-raw.png") });
  await page.click(".vjv-tab >> text=Tree");
  // 4. a mistake, found
  await page.goto(base + "/package.json");
  await page.waitForSelector(".vjv-error");
  await page.screenshot({ path: path.join(out, "4-error.png") });
  // 5. light theme
  await page.goto(base + "/orders/1042.json");
  await page.waitForSelector(".vjv-row");
  await page.click("text=◐ Auto"); await page.click("text=● Dark");
  await page.locator(".vjv-row", { hasText: '"total"' }).click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(out, "5-light.png") });

  // the small promo tile, drawn as HTML
  const tile = await context.newPage();
  await tile.setViewportSize({ width: 440, height: 280 });
  const icon = fs.readFileSync(path.join(ext, "icons", "icon-128.png")).toString("base64");
  await tile.setContent(`<body style="margin:0;width:440px;height:280px;display:flex;align-items:center;gap:22px;padding:0 34px;box-sizing:border-box;background:radial-gradient(400px 260px at 0% 0%,#1e3a4a,transparent 70%),#0d1117;font-family:Segoe UI,system-ui,sans-serif;color:#e9f3ff">
    <img src="data:image/png;base64,${icon}" width="104" height="104">
    <div><div style="font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.05">JSON Viewer</div>
    <div style="margin-top:10px;font-size:15px;color:#9fb3c6;line-height:1.45">A clear, searchable tree.<br>Exact numbers. Private.</div></div></body>`);
  await tile.screenshot({ path: path.join(out, "promo-440x280.png") });
  console.log("Saved to", out, fs.readdirSync(out).join(", "));
} finally {
  await context.close(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* temp */ }
}
