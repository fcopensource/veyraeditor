// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a small sample folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-lens-workspace-"));
fs.writeFileSync(path.join(workspace, "notes.txt"), ["first line", "second line", "third line", "fourth line", "fifth line", ""].join("\n"));
fs.mkdirSync(path.join(workspace, "node_modules", "lib"), { recursive: true });
fs.writeFileSync(path.join(workspace, "node_modules", "lib", "index.txt"), "vendored\n");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-lens-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
