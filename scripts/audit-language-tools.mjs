// CI check for the language tools Veyra installs on users' machines (src-tauri/src/lsp.rs):
// installs each pinned package set exactly as the app does (no install scripts) and runs `npm audit`.
// Policy: any HIGH or CRITICAL advisory fails the check, which blocks the release until it is reviewed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const source = readFileSync(new URL("../src-tauri/src/lsp.rs", import.meta.url), "utf8");
const specs = [...source.matchAll(/Spec \{ key: "([^"]+)", packages: &\[([^\]]+)\]/g)]
  .map(([, key, list]) => ({ key, packages: [...list.matchAll(/"([^"]+)"/g)].map(m => m[1]) }));
if (!specs.length) { console.error("No language tools found in lsp.rs"); process.exit(1); }
// The exact package.json Veyra writes into each tool folder (including its security overrides).
const manifest = source.match(/const TOOL_MANIFEST: &str = r#"(.*?)"#;/)?.[1];
if (!manifest) { console.error("TOOL_MANIFEST not found in lsp.rs"); process.exit(1); }

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let failed = false;
for (const { key, packages } of specs) {
  const dir = mkdtempSync(path.join(tmpdir(), `veyra-${key}-`));
  try {
    writeFileSync(path.join(dir, "package.json"), manifest);
    execFileSync(npm, ["install", "--ignore-scripts", "--no-fund", "--omit=dev", "--loglevel=error", ...packages], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
    let report;
    try { report = execFileSync(npm, ["audit", "--omit=dev", "--json"], { cwd: dir, encoding: "utf8", shell: process.platform === "win32" }); }
    catch (error) { report = error.stdout; } // npm audit exits non-zero when it finds anything
    const counts = JSON.parse(report || "{}").metadata?.vulnerabilities || {};
    const serious = (counts.high || 0) + (counts.critical || 0);
    console.log(`${serious ? "FAIL" : "ok  "} ${key.padEnd(10)} ${packages.join(" ")}  critical=${counts.critical || 0} high=${counts.high || 0} moderate=${counts.moderate || 0} low=${counts.low || 0}`);
    if (serious) failed = true;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
process.exit(failed ? 1 : 0);
