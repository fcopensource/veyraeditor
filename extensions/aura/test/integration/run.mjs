// Runs test/integration/suite.js (or SUITE) inside VS Code (or VSCODE_PATH) with a small git project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = process.env.WORKSPACE || fs.mkdtempSync(path.join(os.tmpdir(), "veyra-aura-workspace-"));
fs.mkdirSync(workspace, { recursive: true });
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
const git = args => execFileSync("git", args, { cwd: workspace, stdio: "pipe" });

write("src/cart.ts", "export const total = (prices: number[]) => prices.reduce((a, b) => a + b, 0);\n");
write("src/legacy.ts", Array.from({ length: 80 }, (_, i) => `export const old${i} = ${i};`).join("\n") + "\n");
write("src/debug.js", "function pay() {\n  return 1;\n}\n");
write("package.json", JSON.stringify({ name: "shop", private: true }, null, 2));
git(["init", "-q"]); git(["config", "user.name", "Shop Dev"]); git(["config", "user.email", "dev@shop.test"]);
git(["config", "commit.gpgsign", "false"]); git(["config", "core.autocrlf", "false"]);
git(["add", "-A"]); git(["commit", "-q", "-m", "Initial commit of the shop"]);

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-aura-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: process.env.SUITE || path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
