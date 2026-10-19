// Builds a small sample project, then runs test/integration/suite.js inside VS Code (or VSCODE_PATH).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-npm-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
write("package.json", JSON.stringify({ name: "sample", dependencies: { "fake-ui": "^2.1.0", "declared-only": "^1.0.0" }, devDependencies: { "fake-test": "^0.4.0" } }, null, 2));
write("node_modules/fake-ui/package.json", JSON.stringify({ name: "fake-ui", version: "2.1.3", description: "A sample UI kit for the test.", license: "MIT", exports: { ".": "./index.js", "./button": "./button.js", "./theme": "./theme.js" } }));
write("node_modules/fake-test/package.json", JSON.stringify({ name: "fake-test", version: "0.4.1" }));
write("node_modules/transitive-lib/package.json", JSON.stringify({ name: "transitive-lib", version: "1.0.0" }));
write("src/app.js", [
  `import ui from "fake-ui";`,
  `import ghost from "ghost-package";`,
  `import lib from "transitive-lib";`,
  `import only from "declared-only";`,
  `import fs from "fs";`,
  `import local from "./local.js";`,
  `import x from "";`,
  `import y from "fake-ui/";`,
  ``,
].join("\n"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-npm-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
