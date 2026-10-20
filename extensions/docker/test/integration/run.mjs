// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a sample project: a Dockerfile with mistakes and a compose file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-docker-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
write("Dockerfile", ["FROM node", "MAINTAINER Ana <ana@example.com>", "RUN apt-get update && apt-get install curl", "ADD . /app", "RUN npm install", 'CMD ["node", "server.js"]', ""].join("\n"));
write("compose.yaml", ["services:", "  web:", "    image: nginx:alpine", "    ports:", '      - "18090:80"', "  cache:", "    image: redis:7-alpine", ""].join("\n"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-docker-vscode-"));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  extensionTestsEnv: { VEYRA_EXPECT_DOCKER: process.env.VEYRA_EXPECT_DOCKER ?? "" },
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
