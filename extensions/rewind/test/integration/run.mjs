// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a small sample folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-rewind-workspace-"));
fs.writeFileSync(path.join(workspace, "cart.js"), "function total(items) {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n\nmodule.exports = { total };\n");
fs.writeFileSync(path.join(workspace, "notes.md"), "# Notes\n");
fs.mkdirSync(path.join(workspace, "node_modules", "lib"), { recursive: true });
fs.writeFileSync(path.join(workspace, "node_modules", "lib", "index.js"), "module.exports = 1;\n");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-rewind-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
