// veyra-guard-ignore-file: builds a sample workspace with suspicious code on purpose.
// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with that sample folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-guard-workspace-"));
const j = (...parts) => parts.join("");
// Line 1: Trojan Source (a hidden direction character). Line 3: decoded code being run. Line 5: ordinary code.
fs.writeFileSync(path.join(workspace, "danger.js"), [
  j("const access = 'user", "‮", "';"),
  "",
  j("ev", "al(at", "ob(payload));"),
  "",
  "console.log('ordinary code');",
  "",
].join("\n"));
fs.writeFileSync(path.join(workspace, "client.py"), j("requests.get('http://198.51", ".100.7:8080/c')\n"));
fs.writeFileSync(path.join(workspace, "safe.ts"), "export const add = (a: number, b: number) => a + b;\n");
fs.mkdirSync(path.join(workspace, "node_modules", "lib"), { recursive: true });
fs.writeFileSync(path.join(workspace, "node_modules", "lib", "index.js"), j("ev", "al(at", "ob(x));\n"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-guard-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
