// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a sample project full of tags.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-todo-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
write("src/app.ts", ["export function login() {", "  // TODO: remember the user", "  return true; // FIXME(ada): handle a wrong password", "}", ""].join("\n"));
write("src/lib/util.py", ["def slugify(s):", "    # HACK works for ASCII only", "    return s.lower()", ""].join("\n"));
write("README.md", ["# App", "", "- [ ] TODO write the intro", ""].join("\n"));
write("node_modules/pkg/index.js", "// TODO: not ours\n");
write("dist/bundle.js", "// TODO: built output\n");
write("assets/logo.bin", Buffer.concat([Buffer.from("// TODO hidden in a binary\n"), Buffer.alloc(16)]));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-todo-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
