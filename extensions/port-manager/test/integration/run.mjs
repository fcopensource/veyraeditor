// Downloads VS Code (or uses VSCODE_PATH) and runs test/integration/suite.js inside it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-ports-workspace-"));
fs.writeFileSync(path.join(workspace, "server.js"), "const s=require('http').createServer((q,r)=>r.end('ok')).listen(0,'127.0.0.1',()=>console.log(s.address().port));\n");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-ports-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
