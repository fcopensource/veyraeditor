// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a small project to save files in.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = process.env.WORKSPACE || fs.mkdtempSync(path.join(os.tmpdir(), "neon-getaway-workspace-"));
fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
fs.writeFileSync(path.join(workspace, "src", "cart.js"), "export const total = prices => prices.reduce((a, b) => a + b, 0);\n");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "neon-getaway-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
