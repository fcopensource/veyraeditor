// Makes a small Git repository with known history, then runs test/integration/suite.js inside VS Code (or VSCODE_PATH) on it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-wrapped-repo-"));
const git = (args, env = {}) => execFileSync("git", args, { cwd: repo, env: { ...process.env, ...env } });

git(["init", "-q", "-b", "main"]);
git(["config", "user.name", "Ada Lovelace"]);
git(["config", "user.email", "ada@example.dev"]);
git(["config", "commit.gpgsign", "false"]);
git(["config", "core.autocrlf", "false"]);

// Six late-night commits by Ada on consecutive days, then one by Bob.
const year = new Date().getFullYear();
for (let i = 1; i <= 6; i++) {
  fs.writeFileSync(path.join(repo, `parser${i}.ts`), Array.from({ length: i * 10 }, (_, n) => `export const v${n} = ${n};`).join("\n") + "\n");
  const when = `${year}-01-0${i}T23:30:00+05:30`;
  git(["add", "."]);
  git(["commit", "-q", "-m", i === 3 ? "Fix the parser bug" : `Build parser step ${i}`], { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
}
fs.writeFileSync(path.join(repo, "notes.md"), "# Notes\n");
git(["add", "."]);
git(["commit", "-q", "-m", "Add notes"], { GIT_AUTHOR_NAME: "Bob", GIT_AUTHOR_EMAIL: "bob@example.dev", GIT_AUTHOR_DATE: `${year}-01-08T10:00:00Z`, GIT_COMMITTER_DATE: `${year}-01-08T10:00:00Z` });

fs.mkdirSync(path.join(repo, ".vscode"));
fs.writeFileSync(path.join(repo, ".vscode", "settings.json"), JSON.stringify({ "veyraWrapped.period": "allTime", "veyraWrapped.autoPlay": false }));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-wrapped-vscode-"));
// Started from a VS Code terminal, this is set and would make the test VS Code run as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

await runTests({
  vscodeExecutablePath: process.env.VSCODE_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, "test", "integration", "suite.js"),
  launchArgs: [repo, "--disable-workspace-trust", "--user-data-dir", userData, "--extensions-dir", path.join(userData, "extensions")],
});
console.log("Integration tests passed.");
