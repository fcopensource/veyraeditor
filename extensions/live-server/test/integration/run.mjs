// Downloads VS Code (or uses VSCODE_PATH) and runs test/integration/suite.js inside it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-workspace-"));
fs.mkdirSync(path.join(workspace, "pages"));
fs.writeFileSync(path.join(workspace, "index.html"), '<html><head><link rel="stylesheet" href="style.css"></head><body><h1>Home</h1></body></html>');
fs.writeFileSync(path.join(workspace, "pages", "about me.html"), "<html><body><p>About</p></body></html>");
fs.writeFileSync(path.join(workspace, "style.css"), "h1 { color: red }");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
