// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a small Node.js project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = process.env.WORKSPACE || fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-values-workspace-"));
fs.mkdirSync(workspace, { recursive: true });
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };

write("src/cart.js", [
  "const items = [{ name: 'Coffee', price: 4.5 }, { name: 'Bagel', price: 3 }];",
  "let total = 0;",
  "for (const item of items) {",
  "  total += item.price;",
  "  console.log('running total', total);",
  "}",
  "console.log('cart', { count: items.length, total });",
  "if (total > 5) console.warn('big order:', total);",
  "",
].join("\n"));
write("src/crash.js", "const user = JSON.parse('{}');\nconsole.log('loaded');\nconsole.log(user.profile.name);\n");
write("src/run.js", "console.log('from the terminal', 42);\n");
write("package.json", JSON.stringify({ name: "shop", private: true }, null, 2));

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-values-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: process.env.SUITE || path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
