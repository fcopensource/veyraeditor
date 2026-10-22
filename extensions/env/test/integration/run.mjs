// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a sample git project full of env mistakes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-env-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
const git = (...args) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" });

write(".gitignore", "node_modules\n");
write(".env", ["# Database", "DATABASE_URL=postgres://app:s3cret@localhost:5432/shop", "STRIPE_SECRET_KEY=sk_live_51HabcdefGHIJKLmnop", "PORT=3000", "API_KEY = abc123", ""].join("\n"));
write(".env.example", ["# Copy this file to .env", "PORT=", "OLD_ONLY=", ""].join("\n"));
write(".env.staging", "PORT=8080\nSTAGING_TOKEN=tok_abc\n");
write("src/app.ts", [
  "const db = process.env.DATABASE_URL;",
  "const missing = process.env.MISSING_ONE;",
  "const mode = process.env.NODE_ENV;",
  "const old = process.env.OLD_ONLY;",
  "const port = process.env.",
  "",
].join("\n"));
write("api/main.py", ['import os', 'port = os.getenv("PORT")', 'key = os.environ["PY_MISSING"]', ""].join("\n"));
git("init", "-q");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Veyra Test");
git("add", ".gitignore", ".env.staging");
git("commit", "-q", "-m", "init");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-env-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
