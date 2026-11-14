// Decides which checks a push or pull request needs, so only what changed is built and tested.
// Writes GitHub Actions outputs: app (true/false), extensions (a JSON matrix of { dir, name }),
// docker, mongodb and port-manager (true/false).
//
// Everything runs when: the run was started by hand, the base can't be found (a new branch),
// or the checks themselves changed (this script, the workflow, scripts/fetch-vscode.mjs).
// The app also runs when an extension file it imports changes (Veyra builds some extensions in).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const EXTENSIONS = [
  ["live-server", "Live Server"], ["port-manager", "Port Manager"], ["env", "Env"], ["path-intellisense", "Path IntelliSense"],
  ["document-viewer", "Document Viewer"], ["git-graph", "Git Graph"], ["error-lens", "Error Lens"], ["todo-tree", "Todo Tree"],
  ["auto-rename-tag", "Auto Rename Tag"], ["pets", "Pets"], ["codesnap", "CodeSnap"], ["code-guard", "Code Guard"],
  ["wrapped", "Wrapped"], ["rewind", "Rewind"], ["garden", "Code Garden"],
].map(([dir, name]) => ({ dir, name }));

/** Folders and files that make up the Veyra app (everything that isn't an extension, the website or docs). */
const APP = [/^src\//, /^src-tauri\//, /^tests\//, /^public\//, /^index\.html$/, /^package(-lock)?\.json$/, /^vite\.config\.ts$/, /^tsconfig.*\.json$/, /^playwright\.config\.ts$/, /^scripts\/audit-language-tools\.mjs$/];
const CHECKS = [/^\.github\/workflows\/checks\.yml$/, /^scripts\/changed-checks\.mjs$/, /^scripts\/fetch-vscode\.mjs$/];

/** Extension folders the app imports from (src/ referring to "extensions/<dir>/"), found by reading the source. */
export function appExtensionDirs(root = "src") {
  const dirs = new Set();
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name)) for (const match of fs.readFileSync(full, "utf8").matchAll(/extensions\/([a-z0-9-]+)\//g)) dirs.add(match[1]);
    }
  };
  walk(root);
  return dirs;
}

/** What to run for these changed paths (null = run everything). */
export function plan(files, appDirs) {
  const all = { app: true, extensions: EXTENSIONS, docker: true, mongodb: true, portManager: true, reason: "" };
  if (files === null) return { ...all, reason: "no base to compare with, so everything runs" };
  if (files.some(f => CHECKS.some(re => re.test(f)))) return { ...all, reason: "the checks themselves changed, so everything runs" };
  const touched = dir => files.some(f => f.startsWith(`extensions/${dir}/`));
  const app = files.some(f => APP.some(re => re.test(f))) || [...appDirs].some(touched);
  return {
    app, extensions: EXTENSIONS.filter(e => touched(e.dir)),
    docker: touched("docker"), mongodb: touched("mongodb"), portManager: touched("port-manager"),
    reason: `${files.length} changed file${files.length === 1 ? "" : "s"}`,
  };
}

function changedFiles() {
  const { GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventPath, APP_ONLY: appOnly } = process.env;
  if (appOnly === "true") return "app-only";
  if (event === "workflow_dispatch" || !eventPath) return null;
  const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const base = event === "pull_request" ? payload.pull_request?.base?.sha : payload.before;
  const head = event === "pull_request" ? payload.pull_request?.head?.sha : payload.after;
  if (!base || /^0+$/.test(base) || !head) return null;
  try {
    // For a pull request, compare with where the branch left main; for a push, with the previous tip.
    const range = event === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
    return execFileSync("git", ["diff", "--name-only", range], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = changedFiles();
  const result = files === "app-only"
    ? { app: true, extensions: [], docker: false, mongodb: false, portManager: false, reason: "a release: the app's checks only" }
    : plan(files, appExtensionDirs());
  const lines = [
    `app=${result.app}`, `extensions=${JSON.stringify(result.extensions)}`,
    `docker=${result.docker}`, `mongodb=${result.mongodb}`, `port-manager=${result.portManager}`,
  ];
  console.log(`Checks to run (${result.reason}):\n  app: ${result.app}\n  extensions: ${result.extensions.map(e => e.name).join(", ") || "none"}\n  docker: ${result.docker}, mongodb: ${result.mongodb}, port manager: ${result.portManager}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Checks to run\n${result.reason}\n\n- App: ${result.app ? "yes" : "no"}\n- Extensions: ${result.extensions.map(e => e.name).join(", ") || "none"}\n`);
}
