// Builds a sample repository for the tests: branches, a merge, tags, a remote with commits to push and pull, and uncommitted work.
// Usage: node make-repo.mjs <folder>   (a folder this script made before is emptied first; any other non-empty folder is refused)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MARKER = ".veyra-sample-repo";

export function makeRepo(root) {
  // Only ever empty a folder this script made before.
  if (fs.existsSync(root) && fs.readdirSync(root).length && !fs.existsSync(path.join(root, MARKER))) throw new Error(`${root} isn't empty and wasn't made by make-repo.mjs, so it won't be deleted.`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, MARKER), "");
  const repo = path.join(root, "app"), remote = path.join(root, "remote.git"), other = path.join(root, "teammate");
  fs.mkdirSync(repo, { recursive: true });
  let clock = Date.UTC(2026, 8, 1, 9) / 1000;
  const git = (cwd, args, who = ["Ada Lovelace", "ada@example.com"]) => {
    clock += 3600;
    const date = `${clock} +0000`;
    return execFileSync("git", args, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: who[0], GIT_AUTHOR_EMAIL: who[1], GIT_COMMITTER_NAME: who[0], GIT_COMMITTER_EMAIL: who[1], GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1" }, encoding: "utf8" });
  };
  fs.writeFileSync(path.join(root, "gitconfig"), "[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n");
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  const commit = (message, who) => { git(repo, ["add", "-A"], who); git(repo, ["commit", "-q", "-m", message], who); };
  const grace = ["Grace Hopper", "grace@example.com"], linus = ["Linus Chen", "linus@example.com"];

  git(repo, ["init", "-q"]);
  write("README.md", "# App\n");
  write("src/app.ts", "export const app = 1;\n");
  commit("Initial commit");
  write("src/login.ts", "export function login() {}\n");
  commit("Add login page", grace);
  git(repo, ["tag", "-a", "v1.0", "-m", "First release"]);
  git(repo, ["checkout", "-q", "-b", "feature/search"]);
  write("src/search.ts", "export function search(q: string) { return q; }\n");
  commit("Add search box", linus);
  write("src/search.ts", "export function search(q: string) { return q.trim(); }\n");
  commit("Trim search queries", linus);
  git(repo, ["checkout", "-q", "main"]);
  write("src/app.ts", "export const app = 2;\n");
  write("docs/guide.md", "# Guide\n");
  commit("Bump app version and add a guide");
  git(repo, ["merge", "-q", "--no-ff", "feature/search", "-m", "Merge branch 'feature/search'"], grace);
  git(repo, ["checkout", "-q", "-b", "experiment"]);
  write("src/experiment.ts", "export const idea = true;\n");
  commit("Try a new idea", linus);
  git(repo, ["checkout", "-q", "main"]);
  fs.renameSync(path.join(repo, "docs/guide.md"), path.join(repo, "docs/handbook.md"));
  fs.rmSync(path.join(repo, "README.md"));
  commit("Rename the guide and drop the old readme");
  git(repo, ["tag", "v1.1"]);

  // A remote that's one commit ahead (a teammate pushed) and one behind (we haven't pushed).
  git(root, ["init", "-q", "--bare", remote]);
  git(repo, ["remote", "add", "origin", remote]);
  git(repo, ["push", "-q", "-u", "origin", "main"]);
  git(root, ["clone", "-q", remote, other]);
  fs.writeFileSync(path.join(other, "CHANGELOG.md"), "# Changes\n");
  git(other, ["add", "-A"], grace);
  git(other, ["commit", "-q", "-m", "Start a changelog"], grace);
  git(other, ["push", "-q", "origin", "main"], grace);
  git(repo, ["fetch", "-q", "origin"]);
  write("src/app.ts", "export const app = 3;\n");
  commit("Bump app version again");

  // An identity for commits the tests make (CI machines have none).
  git(repo, ["config", "user.name", "Test Runner"]);
  git(repo, ["config", "user.email", "test@example.com"]);

  // Work in progress.
  write("src/login.ts", "export function login() { return true; }\n");
  write("notes.txt", "todo\n");
  return repo;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href && process.argv[2]) console.log(makeRepo(path.resolve(process.argv[2])));
