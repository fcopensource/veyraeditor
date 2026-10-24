// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a few sample files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-rename-workspace-"));
fs.writeFileSync(path.join(workspace, "page.html"), "<div>hello</div>\n<ul><li>a</li></ul>\n");
fs.writeFileSync(path.join(workspace, "App.tsx"), "export const App = () => <Card title={a > b ? 1 : 2}><>x</></Card>;\n");
fs.writeFileSync(path.join(workspace, "notes.txt"), "<div>not code</div>\n");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-rename-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
