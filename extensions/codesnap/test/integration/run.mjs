// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a TypeScript file to snap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-snap-workspace-"));
fs.writeFileSync(path.join(workspace, "cart.ts"), [
  "interface Item { name: string; price: number }",
  "",
  "export function total(items: Item[]): number {",
  "  // Prices are in cents",
  "  return items.reduce((sum, item) => sum + item.price, 0);",
  "}",
  "",
  "export const empty = (items: Item[]) => items.length === 0;",
  "",
].join("\n"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-snap-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
