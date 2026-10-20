// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH), with a fake home folder holding Cursor and Claude Code configs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-mcp-home-"));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-mcp-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const server = path.join(root, "test", "fixtures", "server.mjs").replace(/\\/g, "/");
write(path.join(home, ".cursor", "mcp.json"), `{
  // my servers
  "mcpServers": {
    "fixture": { "command": "node", "args": ["${server}"], "env": { "TEST_VALUE": "\${env:VEYRA_TEST_VALUE}" } },
    "missing-program": { "command": "definitely-not-a-program-veyra", "args": [] }
  }
}
`);
write(path.join(home, ".claude.json"), JSON.stringify({ numStartups: 7, theme: "dark", mcpServers: {} }, null, 2));
fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-mcp-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  extensionTestsEnv: { USERPROFILE: home, HOME: home, APPDATA: path.join(home, "AppData", "Roaming"), VEYRA_TEST_HOME: home, VEYRA_TEST_VALUE: "from-env" },
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
