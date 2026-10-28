// veyra-guard-ignore-file: builds sample pull requests with suspicious code on purpose.
// Runs the bundled GitHub Action (action/index.js) against a mock GitHub API, as a pull request would.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const action = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../action/index.js");
const j = (...parts) => parts.join("");

/** A mock of the GitHub API endpoints the Action uses. */
async function mockGitHub(files, { reviewStatus = 200 } = {}) {
  const reviews = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", c => body += c).on("end", () => {
      if (req.method === "GET" && /\/repos\/acme\/app\/pulls\/7\/files/.test(req.url)) {
        const page = Number(new URL(req.url, "http://x").searchParams.get("page"));
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(page === 1 ? files : []));
      } else if (req.method === "POST" && req.url === "/repos/acme/app/pulls/7/reviews") {
        reviews.push({ auth: req.headers.authorization, body: JSON.parse(body) });
        res.writeHead(reviewStatus, { "Content-Type": "application/json" }).end("{}");
      } else res.writeHead(404).end("{}");
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, reviews, close: () => server.close() };
}

function runAction(workspace, api, inputs = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-action-"));
  const event = path.join(tmp, "event.json"), summary = path.join(tmp, "summary.md"), output = path.join(tmp, "output.txt");
  fs.writeFileSync(event, JSON.stringify({ pull_request: { number: 7 } }));
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_API_URL: api, GITHUB_REPOSITORY: "acme/app", GITHUB_EVENT_PATH: event, GITHUB_WORKSPACE: workspace, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, "INPUT_GITHUB-TOKEN": "test-token" };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v;
  return new Promise(resolve => {
    const child = spawn(process.execPath, [action], { env });
    let stdout = ""; child.stdout.on("data", d => stdout += d);
    child.on("close", code => resolve({ code, stdout, summary: fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "", output: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "" }));
  });
}

function workspaceWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guard-ws-"));
  for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); }
  return dir;
}

test("a pull request that adds malicious code is marked line by line and fails", async () => {
  // Line 3 is old code (already suspicious, but not part of this change); lines 5 and 6 are new.
  const app = ["const a = 1;", "", j("fetch('http://198.51", ".100.7/old')"), "", j("ev", "al(at", "ob(payload));"), j("fetch('http://203.0", ".113.9/new')"), ""].join("\n");
  const ws = workspaceWith({ "src/app.js": app, "README.md": "hello\n" });
  const gh = await mockGitHub([
    { filename: "src/app.js", status: "modified", patch: j("@@ -1,4 +1,6 @@\n const a = 1;\n \n fetch('http://198.51", ".100.7/old')\n \n+ev", "al(at", "ob(payload));\n+fetch('http://203.0", ".113.9/new')") },
    { filename: "README.md", status: "added", patch: "@@ -0,0 +1 @@\n+hello" },
    { filename: "old.js", status: "removed" },
  ]);
  try {
    const r = await runAction(ws, gh.url);
    assert.equal(r.code, 1, "fails the check (critical finding, default fail-on: high)");
    assert.match(r.stdout, /::error file=src\/app\.js,line=5,col=1,endColumn=\d+,title=Veyra Code Guard · CRITICAL · Running decoded or obfuscated code::/);
    assert.match(r.stdout, /::warning file=src\/app\.js,line=6,/);
    assert.doesNotMatch(r.stdout, /line=3,/, "old lines are not reported");
    assert.match(r.summary, /Found \*\*2\*\* suspicious lines in pull request #7/);
    assert.match(r.output, /findings=2\ncritical=1/);
    assert.equal(gh.reviews.length, 1);
    const review = gh.reviews[0];
    assert.equal(review.auth, "Bearer test-token");
    assert.equal(review.body.event, "REQUEST_CHANGES");
    assert.deepEqual(review.body.comments.map(c => `${c.path}:${c.line}:${c.side}`), ["src/app.js:5:RIGHT", "src/app.js:6:RIGHT"]);
    assert.match(review.body.comments[0].body, /Running decoded or obfuscated code/);
  } finally { gh.close(); }
});

test("a clean pull request passes without a review", async () => {
  const ws = workspaceWith({ "src/add.ts": "export const add = (a: number, b: number) => a + b;\n" });
  const gh = await mockGitHub([{ filename: "src/add.ts", status: "added", patch: "@@ -0,0 +1 @@\n+export const add = (a: number, b: number) => a + b;" }]);
  try {
    const r = await runAction(ws, gh.url);
    assert.equal(r.code, 0);
    assert.match(r.summary, /No signs of malicious code in pull request #7/);
    assert.equal(gh.reviews.length, 0, "nothing to say, so no review is posted");
  } finally { gh.close(); }
});

test("fail-on, ignore-paths and fork pull requests (read-only token)", async () => {
  const ws = workspaceWith({ "lib/net.js": j("fetch('http://203.0", ".113.9/x')\n"), "fixtures/evil.js": j("ev", "al(at", "ob(x))\n") });
  const files = [
    { filename: "lib/net.js", status: "added", patch: j("@@ -0,0 +1 @@\n+fetch('http://203.0", ".113.9/x')") },
    { filename: "fixtures/evil.js", status: "added", patch: j("@@ -0,0 +1 @@\n+ev", "al(at", "ob(x))") },
  ];
  // A medium finding doesn't fail at the default "high"; fixtures are skipped; the review is refused (fork) but annotations remain.
  const gh = await mockGitHub(files, { reviewStatus: 403 });
  try {
    const r = await runAction(ws, gh.url, { "ignore-paths": "fixtures/**" });
    assert.equal(r.code, 0);
    assert.match(r.stdout, /::warning file=lib\/net\.js,line=1/);
    assert.doesNotMatch(r.stdout, /fixtures\/evil\.js/);
    assert.match(r.stdout, /::notice::Couldn't post a review comment \(GitHub POST/);
  } finally { gh.close(); }
  const gh2 = await mockGitHub(files);
  try {
    const r = await runAction(ws, gh2.url, { "fail-on": "medium", "ignore-paths": "fixtures/**" });
    assert.equal(r.code, 1, "fails at medium when asked");
  } finally { gh2.close(); }
});

test("the Action writes a PDF report and SARIF for GitHub code scanning", async () => {
  const ws = workspaceWith({ "src/app.js": j("ev", "al(at", "ob(payload));\n") });
  const gh = await mockGitHub([{ filename: "src/app.js", status: "added", patch: j("@@ -0,0 +1 @@\n+ev", "al(at", "ob(payload));") }]);
  try {
    const r = await runAction(ws, gh.url, { "report-pdf": "security-report.pdf", sarif: "code-guard.sarif", review: "false" });
    assert.equal(r.code, 1);
    const pdf = fs.readFileSync(path.join(ws, "security-report.pdf"));
    assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
    const sarif = JSON.parse(fs.readFileSync(path.join(ws, "code-guard.sarif"), "utf8"));
    assert.equal(sarif.runs[0].results[0].ruleId, "eval-decoded");
    assert.match(r.output, /grade=D\nscore=70\nreport=.*security-report\.pdf\nsarif=.*code-guard\.sarif/);
    assert.match(r.summary, /Grade D \(70\/100\)/);
    assert.match(r.summary, /How to fix/);
    assert.equal(gh.reviews.length, 0, "review: false posts no review");
  } finally { gh.close(); }
});

// The pre-commit guard: `cli.js --staged` checks exactly what is about to be committed.
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bundle/cli.js");
const git = (cwd, ...args) => new Promise((resolve, reject) => { const c = spawn("git", args, { cwd }); let err = ""; c.stderr.on("data", d => err += d); c.on("close", code => code ? reject(new Error(`git ${args.join(" ")}: ${err}`)) : resolve()); });
function runCli(cwd, ...args) {
  return new Promise(resolve => {
    const env = { ...process.env }; for (const k of Object.keys(env)) if (k.startsWith("GITHUB_") || k.startsWith("INPUT_")) delete env[k];
    const child = spawn(process.execPath, [cli, ...args], { cwd, env });
    let stdout = ""; child.stdout.on("data", d => stdout += d);
    child.on("close", code => resolve({ code, stdout }));
  });
}

test("--staged blocks a commit that adds malicious code, and only looks at staged lines", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "guard-git-"));
  await git(repo, "init", "-q"); await git(repo, "config", "user.email", "t@example.com"); await git(repo, "config", "user.name", "T");
  // Already committed (old) suspicious code is not the commit's fault.
  fs.writeFileSync(path.join(repo, "old.js"), j("fetch('http://203.0", ".113.9/old')\n"));
  await git(repo, "add", "."); await git(repo, "commit", "-q", "-m", "old");
  fs.writeFileSync(path.join(repo, "old.js"), j("fetch('http://203.0", ".113.9/old')\nconsole.log('hi');\n"));
  fs.writeFileSync(path.join(repo, "new.js"), j("const ok = 1;\nev", "al(at", "ob(payload));\n"));
  fs.writeFileSync(path.join(repo, "unstaged.js"), j("ev", "al(at", "ob(x));\n"));
  await git(repo, "add", "old.js", "new.js");
  let r = await runCli(repo, "--staged");
  assert.equal(r.code, 1, "blocked");
  assert.match(r.stdout, /CRITICAL\s+Running decoded or obfuscated code\s+new\.js:2:1/);
  assert.match(r.stdout, /Commit blocked\./);
  assert.doesNotMatch(r.stdout, /old\.js:1/, "lines already committed are not re-reported");
  assert.doesNotMatch(r.stdout, /unstaged\.js/, "unstaged files are not checked");
  // A clean change passes.
  await git(repo, "reset", "-q"); await git(repo, "add", "old.js");
  r = await runCli(repo, "--staged");
  assert.equal(r.code, 0, r.stdout);
  assert.match(r.stdout, /Grade A \(100\/100\)/);
});

test("the command line scans a folder and can print JSON", async () => {
  const dir = workspaceWith({ "a.js": j("fetch('http://203.0", ".113.9/x')\n"), "node_modules/x/i.js": j("ev", "al(at", "ob(x));\n") });
  const r = await runCli(dir, ".", "--json");
  assert.equal(r.code, 0, "a medium finding doesn't fail at the default high");
  const out = JSON.parse(r.stdout);
  assert.equal(out.grade.letter, "A");
  assert.deepEqual(out.files.map(f => f.path), ["a.js"], "node_modules skipped");
  assert.equal((await runCli(dir, ".", "--fail-on", "medium", "--json")).code, 1);
});

test("the git hook checks the repository being committed, even inside a CI job", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "guard-ci-git-"));
  await git(repo, "init", "-q"); await git(repo, "config", "user.email", "t@example.com"); await git(repo, "config", "user.name", "T");
  fs.writeFileSync(path.join(repo, "evil.js"), j("ev", "al(at", "ob(x));\n"));
  await git(repo, "add", "evil.js");
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "guard-ci-ws-"));
  const r = await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, "--staged"], { cwd: repo, env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_WORKSPACE: elsewhere } });
    let stdout = ""; child.stdout.on("data", d => stdout += d);
    child.on("close", code => resolve({ code, stdout }));
  });
  assert.equal(r.code, 1, "blocked");
  assert.match(r.stdout, /Commit blocked\./, "terminal output, not Action annotations");
  assert.match(r.stdout, /evil\.js:1/);
});

test("--fix removes hidden characters and rescans: what's left is reported after the fix", async () => {
  const dir = workspaceWith({
    "a.js": j("const access = 'user", "‮", "';\nconst is", "​", "Admin = false;\nconst team = '\u{1F469}‍\u{1F4BB}';\n"),
    "b.js": j("const x = 1;", "⁦", "\nev", "al(at", "ob(p));\n"),
  });
  const r = await runCli(dir, ".", "--fix", "--json");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.fixed, { removed: 3, files: 2 });
  assert.equal(fs.readFileSync(path.join(dir, "a.js"), "utf8"), "const access = 'user';\nconst isAdmin = false;\nconst team = '\u{1F469}‍\u{1F4BB}';\n", "emoji joiners are kept");
  assert.deepEqual(out.files.map(f => `${f.path}:${f.findings.map(x => x.rule)}`), ["b.js:eval-decoded"], "a.js is clean after the rescan; b.js still has its eval");
  assert.equal(r.code, 1, "the remaining critical finding still fails");
});

test("--watch rescans a file when malicious code is removed, and when a file is deleted", async () => {
  const dir = workspaceWith({ "evil.js": j("const ok = 1;\nev", "al(at", "ob(p));\n"), "net.js": j("fetch('http://203.0", ".113.9/x');\n") });
  const env = { ...process.env }; for (const k of Object.keys(env)) if (k.startsWith("GITHUB_") || k.startsWith("INPUT_")) delete env[k];
  const child = spawn(process.execPath, [cli, ".", "--watch"], { cwd: dir, env });
  let stdout = ""; child.stdout.on("data", d => stdout += d);
  const until = async (re, what) => { for (let i = 0; i < 100 && !re.test(stdout); i++) await new Promise(r => setTimeout(r, 100)); assert.match(stdout, re, what); };
  try {
    await until(/Watching/, "starts watching");
    assert.match(stdout, /Grade D/);
    fs.writeFileSync(path.join(dir, "evil.js"), "const ok = 1;\n");
    await until(/evil\.js rescanned: clean again \(1 finding removed\)/, "reports the file is clean after the code is removed");
    await until(/Grade A \(96\/100\)/, "the grade is updated: only the medium finding in net.js is left");
    fs.writeFileSync(path.join(dir, "new.js"), j("ev", "al(at", "ob(q));\n"));
    await until(/new\.js: 1 new finding/, "a new suspicious file is reported");
    fs.rmSync(path.join(dir, "net.js"));
    await until(/net\.js was deleted: 1 finding gone/, "a deleted file's findings go");
  } finally { child.kill(); }
});

test("team settings in .veyra-guard.json: ignored paths, disabled rules, custom rules, fail-on", async () => {
  const dir = workspaceWith({
    ".veyra-guard.json": JSON.stringify({ ignorePaths: ["vendor/**"], disabledRules: ["raw-ip-url"], failOn: "medium", customRules: [{ id: "no-console-secrets", pattern: "console\\.log\\(.*token", severity: "medium", title: "Logs a token" }] }),
    "src/a.js": j("fetch('http://203.0", ".113.9/x');\nconsole.log('token', token);\n"),
    "vendor/lib.js": j("ev", "al(at", "ob(x));\n"),
    "src/b.php": j("<?php ev", "al($_PO", "ST['c']); ?>\n"),
  });
  const r = await runCli(dir, ".", "--json");
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.files.map(f => `${f.path}:${f.findings.map(x => x.rule)}`), ["src/a.js:no-console-secrets", "src/b.php:webshell"]);
  assert.equal(r.code, 1, "fails at medium, as the project asks");
  assert.equal(out.languages.JavaScript, 1, "vendor/ is ignored, so only src/a.js");
  assert.equal(out.languages.PHP, 1);
  const sarifRun = await runCli(dir, ".", "--sarif", "out.sarif", "--json");
  assert.equal(sarifRun.code, 1);
  const sarif = JSON.parse(fs.readFileSync(path.join(dir, "out.sarif"), "utf8")).runs[0];
  const custom = sarif.results.find(x => x.ruleId === "no-console-secrets");
  assert.equal(sarif.tool.driver.rules[custom.ruleIndex].id, "no-console-secrets", "custom rules are described in SARIF too");
  assert.match((await runCli(dir, "--help")).stdout, /--watch/);
});
