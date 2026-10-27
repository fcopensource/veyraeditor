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
