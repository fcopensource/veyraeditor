// Runs test/integration/suite.js inside VS Code (or VSCODE_PATH) with a sample project: aliases, Node ESM, HTML, Markdown and typos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-path-workspace-"));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true }); fs.writeFileSync(path.join(workspace, file), text); };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

write("tsconfig.json", `{
  // the web app
  "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"], }, "moduleResolution": "bundler", "jsx": "react-jsx" },
}`);
write("src/components/Button.tsx", "export const Button = () => null;\n");
write("src/components/Header.tsx", "export default function Header() { return null; }\n");
write("src/components/index.ts", "export * from './Button';\n");
write("src/utils/helper.ts", "export const helper = 1;\n");
write("src/utils/date.ts", "export const date = 1;\n");
write("src/styles/main.css", "body { margin: 0 }\n");
write("public/logo.png", PNG);
write("docs/guide.md", "# Guide\n");
write("src/app.tsx", [
  'import { Button } from "./components/";',
  'import { helper } from "./utils/helpr";',
  'import Header from "@/components/Header";',
  'import { date } from "@/utils/dat";',
  'import React from "react";',
  'const logo = "/logo.png";',
  'import later from "./utils/later";',
  "",
].join("\n"));
write("src/page.html", ['<link rel="stylesheet" href="./styles/mian.css">', '<img src="/logo.png">', '<a href="/about">About</a>', '<script src="./"></script>', ""].join("\n"));
write("README.md", ["See [the guide](docs/gide.md) and ![logo](public/logo.png).", ""].join("\n"));
write("server/tsconfig.json", `{ "compilerOptions": { "module": "nodenext", "moduleResolution": "nodenext" } }`);
write("server/package.json", `{ "type": "module" }`);
write("server/src/db.ts", "export const db = 1;\n");
write("server/src/main.ts", ['import { db } from "./";', 'import { x } from "./db.js";', ""].join("\n"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-path-vscode-"));
// As after answering "Turn Off" to the extension's offer: VS Code's own import path suggestions are off.
fs.mkdirSync(path.join(userData, "User"), { recursive: true });
fs.writeFileSync(path.join(userData, "User", "settings.json"), JSON.stringify({ "typescript.suggest.paths": false, "javascript.suggest.paths": false }));

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
