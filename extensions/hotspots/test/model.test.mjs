// Unit tests for the Hotspots engine (compiled to out/ by `tsc -p .`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGitLog, measure, analyze, hotspotScore, level, coupledWith, modeValue, heatColor,
  buildTree, layoutTreemap, ago, explain, markdownReport, DAY,
} from "../out/model.js";

const R = "\x1e", U = "\x1f";
const NOW = Date.UTC(2026, 10, 19);
const t = daysAgo => Math.floor((NOW - daysAgo * DAY) / 1000);

test("parses git log with numstat, binary files and quoted paths", () => {
  const log = [
    `${R}aaa${U}${t(1)}${U}Ada Lovelace${U}ADA@Example.com\n\n10\t2\tsrc/app.ts\n-\t-\tlogo.png\n`,
    `${R}bbb${U}${t(2)}${U}Bob${U}bob@example.com\n\n1\t0\t"src/\\303\\251t\\303\\251.ts"\n`,
    `${R}ccc${U}${t(3)}${U}Bob${U}bob@example.com\n`,
  ].join("");
  const commits = parseGitLog(log);
  assert.equal(commits.length, 3);
  assert.deepEqual(commits[0].files, [{ path: "src/app.ts", added: 10, deleted: 2 }, { path: "logo.png", added: 1, deleted: 0 }]);
  assert.equal(commits[0].email, "ada@example.com", "emails are compared in lower case");
  assert.equal(commits[0].time, t(1) * 1000);
  assert.equal(commits[1].files[0].path, "src/été.ts");
  assert.deepEqual(commits[2].files, []);
});

test("measures lines of code and indentation complexity, skipping blanks and comments", () => {
  const two = "function a() {\n  if (x) {\n    return 1;\n  }\n\n  // a comment\n  return 2;\n}\n";
  assert.deepEqual(measure(two), { loc: 6, complexity: 1 + 2 + 1 + 1, maxDepth: 2 });
  const tabs = "def a():\n\tif x:\n\t\treturn 1\n\t# note\n\treturn 2\n";
  assert.deepEqual(measure(tabs), { loc: 4, complexity: 1 + 2 + 1, maxDepth: 2 });
  assert.deepEqual(measure(""), { loc: 0, complexity: 0, maxDepth: 0 });
});

test("hotspot score grows with both change frequency and complexity", () => {
  assert.equal(hotspotScore(0, 100, 10, 100), 0);
  assert.equal(hotspotScore(10, 100, 10, 100), 1);
  assert.ok(hotspotScore(10, 50, 10, 100) > hotspotScore(2, 50, 10, 100));
  assert.ok(hotspotScore(5, 100, 10, 100) > hotspotScore(5, 10, 10, 100));
  assert.equal(level(0.7), "critical"); assert.equal(level(0.45), "high"); assert.equal(level(0.25), "medium"); assert.equal(level(0.1), "low"); assert.equal(level(0), "none");
});

// A small history: billing.ts is complex and changes all the time (a hotspot), with invoice.ts usually alongside.
function history() {
  const commits = [];
  const c = (days, who, ...files) => commits.push({ hash: `h${commits.length}`, time: NOW - days * DAY, author: who, email: `${who.toLowerCase()}@x.io`, files: files.map(p => ({ path: p, added: 5, deleted: 1 })) });
  for (let i = 0; i < 12; i++) c(10 + i * 5, i % 3 ? "Ada" : "Bob", "src/billing.ts", ...(i % 4 ? ["src/invoice.ts"] : []));
  for (let i = 0; i < 3; i++) c(20 + i, "Ada", "src/utils.ts");
  for (let i = 0; i < 5; i++) c(400 + i, "Carol", "src/legacy.ts");      // Carol left long ago
  c(30, "Ada", "README.md");
  c(5, "Ada", ...Array.from({ length: 60 }, (_, i) => `gen/${i}.ts`), "src/billing.ts"); // a huge formatting commit
  c(3, "Ada", "src/deleted.ts");
  return commits;
}
const shapes = new Map([
  ["src/billing.ts", { loc: 400, complexity: 900, maxDepth: 6 }],
  ["src/invoice.ts", { loc: 120, complexity: 150, maxDepth: 3 }],
  ["src/utils.ts", { loc: 30, complexity: 20, maxDepth: 2 }],
  ["src/legacy.ts", { loc: 300, complexity: 500, maxDepth: 5 }],
  ["src/quiet.ts", { loc: 80, complexity: 60, maxDepth: 2 }],
  ["README.md", { loc: 10, complexity: 0, maxDepth: 0 }],
]);

test("ranks the complex, often-changed file first and ignores deleted files", () => {
  const a = analyze(history(), shapes, { now: NOW, since: null });
  assert.equal(a.files[0].path, "src/billing.ts");
  assert.equal(a.files[0].rank, 1);
  assert.equal(a.files[0].commits, 13);
  assert.ok(!a.byPath.has("src/deleted.ts"), "files that no longer exist are not listed");
  assert.equal(a.byPath.get("src/quiet.ts").rank, 0, "never changed: not ranked");
  assert.equal(a.byPath.get("src/quiet.ts").score, 0);
  assert.equal(a.authors, 3);
});

test("the period limits history", () => {
  const a = analyze(history(), shapes, { now: NOW, since: NOW - 365 * DAY });
  assert.equal(a.byPath.get("src/legacy.ts").commits, 0, "Carol's commits are older than a year");
  assert.equal(a.byPath.get("src/billing.ts").commits, 13);
});

test("authors and knowledge risk", () => {
  const a = analyze(history(), shapes, { now: NOW, since: null });
  const billing = a.byPath.get("src/billing.ts");
  assert.deepEqual(billing.authors.map(x => x.name), ["Ada", "Bob"]);
  assert.equal(billing.knowledge, "shared");
  assert.equal(a.byPath.get("src/utils.ts").knowledge, "single", "only Ada, who is active");
  assert.equal(a.byPath.get("src/legacy.ts").knowledge, "lost", "only Carol, who left");
});

test("change coupling: files that change together, ignoring huge commits", () => {
  const a = analyze(history(), shapes, { now: NOW, since: null });
  assert.equal(a.coupling.length, 1);
  assert.deepEqual({ a: a.coupling[0].a, b: a.coupling[0].b, shared: a.coupling[0].shared }, { a: "src/billing.ts", b: "src/invoice.ts", shared: 9 });
  assert.ok(a.coupling[0].degree > 0.8);
  assert.deepEqual(coupledWith(a, "src/invoice.ts").map(c => c.path), ["src/billing.ts"]);
  assert.match(explain(a.byPath.get("src/billing.ts"), a), /Changed in 13 commits · 400 lines · nested up to 6 levels deep\. Changed by 2 people, mostly Ada .*Usually changes with invoice\.ts/);
});

test("colour modes and the heat scale", () => {
  const a = analyze(history(), shapes, { now: NOW, since: null });
  const billing = a.byPath.get("src/billing.ts"), quiet = a.byPath.get("src/quiet.ts"), legacy = a.byPath.get("src/legacy.ts");
  assert.equal(modeValue(quiet, "hotspot", a), -1);
  assert.equal(modeValue(billing, "churn", a), 1);
  assert.equal(modeValue(legacy, "knowledge", a), 1);
  assert.ok(modeValue(legacy, "age", a) > modeValue(billing, "age", a));
  assert.equal(heatColor(-1), "#3a3d46");
  assert.equal(heatColor(0), "#26344a");
  assert.equal(heatColor(1), "#ff3d62");
  assert.match(heatColor(0.5), /^#[0-9a-f]{6}$/);
});

test("builds a compact folder tree with summed sizes", () => {
  const tree = buildTree([{ path: "src/lib/a.ts", loc: 10 }, { path: "src/lib/b.ts", loc: 30 }, { path: "README.md", loc: 0 }]);
  assert.equal(tree.size, 41);
  assert.deepEqual(tree.children.map(c => c.name).sort(), ["README.md", "src/lib"]);
});

test("treemap fills the space, without overlaps, with areas matching sizes", () => {
  const files = Array.from({ length: 40 }, (_, i) => ({ path: `${["api", "ui", "lib"][i % 3]}/f${i}.ts`, loc: 5 + i * 7 }));
  const rects = layoutTreemap(buildTree(files), 1000, 600, 0, 0);
  const leaves = rects.filter(r => !r.dir);
  assert.equal(leaves.length, 40);
  const area = leaves.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 600000) < 1, `area ${area}`);
  for (const r of leaves) assert.ok(r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.w <= 1000 + 1e-6 && r.y + r.h <= 600 + 1e-6, "inside the canvas");
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const p = leaves[i], q = leaves[j];
    const overlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 1e-6 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 1e-6;
    assert.ok(!overlap, `${p.path} overlaps ${q.path}`);
  }
  const big = leaves.find(r => r.path === "lib/f38.ts"), small = leaves.find(r => r.path === "api/f0.ts");
  assert.ok(big.w * big.h > small.w * small.h * 20);
  // Squarified: no sliver rectangles for evenly sized files.
  const worst = Math.max(...leaves.map(r => Math.max(r.w / r.h, r.h / r.w)));
  assert.ok(worst < 8, `aspect ratio ${worst}`);
});

test("treemap leaves room for folder headers", () => {
  const rects = layoutTreemap(buildTree([{ path: "src/a.ts", loc: 50 }, { path: "docs/b.md", loc: 50 }]), 400, 300, 16, 2);
  const src = rects.find(r => r.dir && r.name === "src"), a = rects.find(r => r.path === "src/a.ts");
  assert.ok(a.y >= src.y + 16 - 1e-6, "the file sits below its folder's label");
});

test("human words", () => {
  assert.equal(ago(NOW - 0.5 * DAY, NOW), "today");
  assert.equal(ago(NOW - 3 * DAY, NOW), "3 days ago");
  assert.equal(ago(NOW - 70 * DAY, NOW), "2 months ago");
  assert.equal(ago(NOW - 800 * DAY, NOW), "2 years ago");
  assert.equal(ago(null, NOW), "not in this period");
});

test("markdown report", () => {
  const a = analyze(history(), shapes, { now: NOW, since: null });
  const md = markdownReport(a, 0, "shop");
  assert.match(md, /^## Code hotspots: shop/);
  assert.match(md, /\| 1 \| `src\/billing\.ts` \| 13 \| 400 \| 6 \| Ada/);
  assert.match(md, /`src\/billing\.ts` ↔ `src\/invoice\.ts`: 9 commits together/);
  assert.match(md, /`src\/legacy\.ts`: written by Carol, who hasn't committed in over 6 months/);
});

import { globToRegExp, excluded } from "../out/model.js";
test("exclude globs", () => {
  const g = ["**/node_modules/**", "**/*.min.*", "**/package-lock.json", "**/{dist,build}/**", "docs/*.md"].map(globToRegExp);
  for (const p of ["node_modules/a/b.js", "web/node_modules/x.js", "a/jquery.min.js", "package-lock.json", "apps/web/package-lock.json", "dist/app.js", "pkg/build/x.js", "docs/intro.md"]) assert.ok(excluded(p, g), p);
  for (const p of ["src/app.ts", "src/minify.ts", "docs/guide/intro.md", "distance.ts"]) assert.ok(!excluded(p, g), p);
});
