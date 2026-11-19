// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a git project that has two years of history.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), process.env.WORKSPACE_PREFIX || "veyra-hotspots-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
const git = (args, env = {}) => execFileSync("git", args, { cwd: workspace, stdio: "pipe", env: { ...process.env, ...env } });
const nested = (name, depth, lines) => Array.from({ length: lines }, (_, i) => `${"  ".repeat(1 + (i % depth))}const ${name}${i} = ${i};`).join("\n");

git(["init", "-q"]); git(["config", "core.autocrlf", "false"]); git(["config", "commit.gpgsign", "false"]);
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
let n = 0;
function commit(daysAgo, who, files) {
  for (const [f, text] of Object.entries(files)) write(f, `${text}\n// change ${n++}\n`);
  git(["add", "-A"]);
  const when = `${now - daysAgo * DAY} +0000`;
  git(["commit", "-q", "-m", `change ${n}`], { GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: `${who.toLowerCase()}@shop.dev`, GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: `${who.toLowerCase()}@shop.dev`, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
}

// Two years ago: Carol writes the legacy importer, then leaves.
for (let i = 0; i < 6; i++) commit(700 - i * 3, "Carol", { "src/legacy/importer.ts": `export function importer() {\n${nested("legacy", 6, 120)}\n}` });
// The last year: billing is complex and changes all the time, usually with invoice.
for (let i = 0; i < 14; i++) commit(300 - i * 20, i % 3 ? "Ada" : "Ben", {
  "src/billing/billing.ts": `export function bill() {\n${nested("bill", 7, 300 + i)}\n}`,
  ...(i % 5 ? { "src/billing/invoice.ts": `export const invoice = () => {\n${nested("inv", 3, 80 + i)}\n};` } : {}),
});
for (let i = 0; i < 4; i++) commit(200 - i * 30, "Dee", { "src/ui/Button.tsx": `export const Button = () => {\n${nested("btn", 2, 40)}\n};` });
commit(150, "Ada", { "src/utils/format.ts": `export const money = (n: number) => n;` });
commit(100, "Ada", { "README.md": "# Shop" });
commit(90, "Ben", { "src/quiet.ts": `export const quiet = 1;` });
write("node_modules/x/index.js", "module.exports = 1;\n");
write(".gitignore", "node_modules/\n");
git(["add", "-A"]); git(["commit", "-q", "-m", "ignore"], { GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "ada@shop.dev", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "ada@shop.dev" });

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-hotspots-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: process.env.SUITE || path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
