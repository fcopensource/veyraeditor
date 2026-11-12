import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const apply = ops => ops.filter(o => o.kind !== "del").map(o => o.text);
const revert = ops => ops.filter(o => o.kind !== "add").map(o => o.text);

test("a diff turns the old text into the new one, with line numbers", () => {
  const a = "one\ntwo\nthree\nfour\n", b = "one\n2\nthree\nfour\nfive\n";
  const ops = m.diffLines(a, b);
  assert.deepEqual(apply(ops), ["one", "2", "three", "four", "five"]);
  assert.deepEqual(revert(ops), ["one", "two", "three", "four"]);
  assert.deepEqual(m.diffStats(ops), { added: 2, removed: 1 });
  assert.deepEqual(ops.find(o => o.kind === "del"), { kind: "del", text: "two", oldLine: 2, newLine: undefined });
  assert.deepEqual(ops.find(o => o.text === "five"), { kind: "add", text: "five", oldLine: undefined, newLine: 5 });
});

test("diffs are minimal and handle empty sides, CRLF and identical text", () => {
  assert.deepEqual(m.diffStats(m.diffLines("", "a\nb")), { added: 2, removed: 0 });
  assert.deepEqual(m.diffStats(m.diffLines("a\nb", "")), { added: 0, removed: 2 });
  assert.deepEqual(m.diffStats(m.diffLines("a\r\nb\r\n", "a\nb\n")), { added: 0, removed: 0 });
  // Moving one line in the middle of many costs 2, not a rewrite.
  const lines = Array.from({ length: 200 }, (_, i) => "line " + i);
  const moved = [...lines]; moved.splice(150, 0, moved.splice(50, 1)[0]);
  assert.deepEqual(m.diffStats(m.diffLines(lines.join("\n"), moved.join("\n"))), { added: 1, removed: 1 });
});

test("random edits always round-trip", () => {
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let round = 0; round < 300; round++) {
    const a = Array.from({ length: rnd(30) }, () => "x" + rnd(6));
    const b = [...a];
    for (let k = rnd(6); k > 0; k--) { const at = rnd(b.length + 1); if (rnd(2) && b.length) b.splice(at % b.length, 1); else b.splice(at, 0, "y" + rnd(6)); }
    const ops = m.diffLines(a.join("\n"), b.join("\n"));
    assert.deepEqual(apply(ops), b); assert.deepEqual(revert(ops), a);
  }
});

test("hunks keep three lines of context and merge nearby changes", () => {
  const a = Array.from({ length: 30 }, (_, i) => "l" + i);
  const b = [...a]; b[5] = "changed"; b[8] = "changed too"; b[25] = "far away";
  const result = m.hunks(m.diffLines(a.join("\n"), b.join("\n")));
  assert.equal(result.length, 2);
  assert.equal(result[0].oldStart, 3);
  assert.equal(result[0].ops.filter(o => o.kind !== "same").length, 4);
  assert.equal(m.hunks(m.diffLines("same", "same")).length, 0);
});

test("when to take a snapshot", () => {
  const base = { hash: "b", lastHash: "a", lastTime: 1000, now: 20_000, interval: 30_000 };
  assert.equal(m.shouldCapture({ ...base, reason: "save" }), true);
  assert.equal(m.shouldCapture({ ...base, reason: "edit" }), false, "typing waits for the interval");
  assert.equal(m.shouldCapture({ ...base, reason: "edit", now: 40_000 }), true);
  assert.equal(m.shouldCapture({ ...base, reason: "save", hash: "a" }), false, "unchanged text is skipped");
  assert.equal(m.shouldCapture({ ...base, reason: "checkpoint", hash: "a" }), true, "a checkpoint names the current text");
  assert.equal(m.shouldCapture({ reason: "edit", hash: "a", now: 5, interval: 30_000 }), true, "the first snapshot of a file");
});

test("excluded files: dependencies, build output, lock files and custom globs", () => {
  const ex = [...m.DEFAULT_EXCLUDE, "**/*.log", "secret/{a,b}.txt"];
  for (const p of ["node_modules/react/index.js", "web/node_modules/x.js", "dist/app.js", "app.min.js", "yarn.lock", "package-lock.json", "logs/app.log", "secret/a.txt"]) assert.equal(m.isExcluded(p, ex), true, p);
  for (const p of ["src/app.ts", "README.md", "distance.ts", "secret/c.txt", "src/build.ts"]) assert.equal(m.isExcluded(p, ex), false, p);
  assert.equal(m.isExcluded("C:\\work\\node_modules\\a.js", ex), true, "Windows paths");
});

test("thinning keeps today, then fewer as snapshots age, and always keeps checkpoints and the newest", () => {
  const now = Date.UTC(2026, 10, 13, 12), H = 3600_000, D = 24 * H;
  const e = (t, extra = {}) => ({ id: String(t), t, hash: "h" + t, size: 1, lines: 1, reason: "edit", added: 0, removed: 0, ...extra });
  const entries = [];
  for (let t = now - 40 * D; t <= now; t += 5 * 60_000) entries.push(e(t)); // every 5 minutes for 40 days
  entries.push(e(now - 35 * D + 1, { label: "Before the refactor" }));
  const kept = m.thin(entries, now, 100_000, 30);
  const today = kept.filter(x => now - x.t <= D).length, week = kept.filter(x => now - x.t > D && now - x.t <= 7 * D).length;
  assert.equal(today, 24 * 12 + 1, "everything from the last 24 hours");
  assert.ok(week >= 6 * 24 * 6 - 6 && week <= 6 * 24 * 6 + 6, `one per 10 minutes for the week (${week})`);
  assert.ok(kept.some(x => x.label === "Before the refactor"), "checkpoints survive past maxAgeDays");
  assert.ok(!kept.some(x => now - x.t > 30 * D && !x.label), "older than 30 days goes");
  assert.equal(kept.at(-1).t, now, "the newest stays");
  const capped = m.thin(entries, now, 50, 30);
  assert.equal(capped.length, 50);
  assert.ok(capped.some(x => x.label), "the cap drops unnamed snapshots first");
  assert.deepEqual(kept.map(x => x.t), [...kept.map(x => x.t)].sort((a, b) => a - b), "oldest first");
});

test("finding deleted code skips lines still in the file", () => {
  const then = "function total(items) {\n  return sum(items);\n}\nconst tax = 0.2;\n";
  const now = "const tax = 0.2;\n";
  assert.deepEqual(m.findLines(then, "total", m.lineSet(now)).map(f => f.line), [1]);
  assert.deepEqual(m.findLines(then, "tax", m.lineSet(now)), [], "still in the file");
  assert.equal(m.findLines(then, "Total").length, 0, "capitals make it case-sensitive");
  assert.deepEqual(m.findLines(then, "SUM".toLowerCase())[0], { line: 2, text: "  return sum(items);", column: 10 });
});

test("labels read naturally", () => {
  const now = new Date(2026, 10, 13, 15, 0).getTime();
  assert.equal(m.relativeTime(now - 10_000, now), "just now");
  assert.equal(m.relativeTime(now - 5 * 60_000, now), "5 min ago");
  assert.equal(m.relativeTime(now - 3 * 3600_000, now), "3 h ago");
  assert.equal(m.relativeTime(new Date(2026, 10, 13, 2, 5).getTime(), now), "today 02:05");
  assert.equal(m.relativeTime(new Date(2026, 10, 12, 14, 5).getTime(), now), "yesterday 14:05");
  assert.equal(m.relativeTime(new Date(2026, 2, 12, 9, 30).getTime(), now), "12 Mar 09:30");
  assert.equal(m.relativeTime(new Date(2025, 2, 12, 9, 30).getTime(), now), "12 Mar 2025 09:30");
  assert.equal(m.statsLabel({ added: 3, removed: 1 }), "+3 −1");
  assert.equal(m.statsLabel({ added: 0, removed: 0 }), "no line changes");
  assert.match(m.newId(now, () => 0.5), /^[a-z0-9]+-[a-z0-9]{5}$/);
});
