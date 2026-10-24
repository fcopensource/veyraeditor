// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with the sample repository from test/fixtures/make-repo.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";
import { makeRepo } from "../fixtures/make-repo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = makeRepo(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "veyra-git-workspace-")), "sample"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-git-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [repo, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
