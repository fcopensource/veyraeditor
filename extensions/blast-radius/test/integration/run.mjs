// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a small git project:
// a Next.js-style app with a tsconfig alias, a Python backend, tests, and one uncommitted change.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-blast-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };

write("package.json", JSON.stringify({ name: "shop", scripts: { test: "vitest" }, devDependencies: { vitest: "^2.0.0" } }, null, 2));
write("tsconfig.json", `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }`);
write("src/lib/db.ts", `export const db = { query: (s: string) => s };\n`);
write("src/lib/users.ts", `import { db } from "./db";\nexport const getUser = (id: string) => db.query(id);\n`);
write("src/lib/orders.ts", `import { db } from "@/lib/db";\nexport const orders = () => db.query("orders");\n`);
write("src/components/UserCard.tsx", `import { getUser } from "@/lib/users";\nexport default function UserCard() { return getUser("1"); }\n`);
write("app/users/page.tsx", `import UserCard from "@/components/UserCard";\nexport default function Page() { return UserCard(); }\n`);
write("app/api/orders/route.ts", `import { orders } from "@/lib/orders";\nexport const GET = () => orders();\n`);
write("tests/users.test.ts", `import { getUser } from "../src/lib/users";\n`);
write("src/lib/format.ts", `export const money = (n: number) => "$" + n;\n`);
write("src/unused.ts", `// import { db } from "./lib/db"  (commented out: not a real import)\nexport const x = 1;\n`);
write("backend/app/__init__.py", "");
write("backend/app/models.py", "class User: pass\n");
write("backend/app/api.py", "from .models import User\n");
write("backend/tests/test_api.py", "from app.api import User\n");
write("node_modules/lib/index.js", `require("../../src/lib/db");\n`);
write("README.md", "# Shop\n");

const git = (...args) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" });
git("init", "-q"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test"); git("config", "core.autocrlf", "false");
fs.writeFileSync(path.join(workspace, ".gitignore"), "node_modules/\n");
git("add", "-A"); git("commit", "-q", "-m", "start");
// The uncommitted change the suite starts from.
fs.appendFileSync(path.join(workspace, "src/lib/db.ts"), `export const version = 2;\n`);

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-blast-vscode-"));
await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
