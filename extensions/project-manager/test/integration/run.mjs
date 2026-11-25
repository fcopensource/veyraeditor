// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH), with a folder of sample repositories to find.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const code = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-pm-code-"));
const mk = (rel, files = []) => { fs.mkdirSync(path.join(code, rel), { recursive: true }); for (const f of files) fs.writeFileSync(path.join(code, rel, f), ""); };
mk("shop/.git"); mk("shop", ["package.json"]);
mk("api/.git"); mk("api", ["pyproject.toml"]);
mk("tools/cli/.git"); mk("tools/cli", ["Cargo.toml"]);
mk("node_modules/dep/.git");
mk("workspace", ["README.md"]);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-pm-vscode-"));
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-pm-store-"));
fs.mkdirSync(path.join(userData, "User"), { recursive: true });
fs.writeFileSync(path.join(userData, "User", "settings.json"), JSON.stringify({
  "veyraProjects.scanFolders": [code],
  "veyraProjects.projectsLocation": storage,
}));
process.env.VEYRA_PM_CODE = code;
process.env.VEYRA_PM_STORE = storage;

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  extensionTestsEnv: { VEYRA_PM_CODE: code, VEYRA_PM_STORE: storage },
  launchArgs: [path.join(code, "workspace"), "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
