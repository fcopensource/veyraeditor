import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const H = c => c.repeat(40);
const log = (...commits) => commits.map(c => [c.hash, c.parents.join(" "), c.author ?? "Ada", "ada@x.io", "1700000000", c.subject ?? "msg"].join("\x1f") + "\x1e\n").join("");

test("reads git log, including messages with separators-like text", () => {
  const out = log({ hash: H("a"), parents: [H("b")], subject: "Fix: a | b" }, { hash: H("b"), parents: [], subject: "First" });
  const commits = m.parseLog(out);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], { hash: H("a"), parents: [H("b")], author: "Ada", email: "ada@x.io", date: 1700000000, subject: "Fix: a | b" });
  assert.deepEqual(commits[1].parents, []);
  assert.deepEqual(m.parseLog(""), []);
});

test("reads branches, remote branches and tags, with ahead and behind", () => {
  const refs = m.parseRefs([
    [H("a"), "", "refs/heads/main", "origin/main", "[ahead 2, behind 1]"],
    [H("b"), "", "refs/heads/old", "origin/old", "[gone]"],
    [H("a"), "", "refs/remotes/origin/main", "", ""],
    [H("c"), "", "refs/remotes/origin/HEAD", "", ""],
    [H("d"), H("a"), "refs/tags/v1.0", "", ""],
    [H("e"), "", "refs/stash", "", ""],
  ].map(r => r.join("\x1f")).join("\n"));
  assert.deepEqual(refs.map(r => `${r.kind}:${r.name}`), ["head:main", "head:old", "remote:origin/main", "tag:v1.0"]);
  assert.equal(refs[0].ahead, 2); assert.equal(refs[0].behind, 1); assert.equal(refs[0].upstream, "origin/main");
  assert.equal(refs[1].gone, true);
  assert.equal(refs[3].hash, H("a"), "an annotated tag points at its commit");
});

test("lays out a straight line in one lane", () => {
  const rows = m.layoutGraph([{ hash: "c", parents: ["b"] }, { hash: "b", parents: ["a"] }, { hash: "a", parents: [] }]);
  assert.deepEqual(rows.map(r => r.col), [0, 0, 0]);
  assert.deepEqual(rows[0].incoming, []);
  assert.deepEqual(rows[1].incoming, [{ lane: 0, color: 0 }]);
  assert.deepEqual(rows[2].outgoing, []);
  assert.ok(rows.every(r => r.width === 1));
});

test("lays out a branch and its merge", () => {
  // m merges f into main: m(b, f) ; f(b) ; b(a) ; a
  const rows = m.layoutGraph([{ hash: "m", parents: ["b", "f"] }, { hash: "f", parents: ["b"] }, { hash: "b", parents: ["a"] }, { hash: "a", parents: [] }]);
  assert.deepEqual(rows.map(r => r.col), [0, 1, 0, 0]);
  assert.deepEqual(rows[0].outgoing.map(l => l.lane), [0, 1], "the merge sends a line to each parent");
  assert.notEqual(rows[0].outgoing[1].color, rows[0].outgoing[0].color, "the branch gets its own colour");
  assert.deepEqual(rows[1].pass.map(l => l.lane), [0], "main passes by the branch commit");
  assert.deepEqual(rows[2].incoming.map(l => l.lane).sort(), [0, 1], "both lanes meet at the fork point");
  assert.equal(rows[3].width, 1, "the branch lane is gone after the fork");
});

test("two branch tips side by side, and a lane reused after it ends", () => {
  // tips x and y both come from b; later z starts a new line after they meet
  const rows = m.layoutGraph([{ hash: "x", parents: ["b"] }, { hash: "y", parents: ["b"] }, { hash: "b", parents: ["a"] }, { hash: "z", parents: ["a"] }, { hash: "a", parents: [] }]);
  assert.deepEqual(rows.map(r => r.col), [0, 1, 0, 1, 0]);
  assert.equal(rows[3].incoming.length, 0, "z is a new tip");
  assert.deepEqual(rows[4].incoming.map(l => l.lane).sort(), [0, 1]);
});

test("an octopus merge sends a line to every parent", () => {
  const rows = m.layoutGraph([{ hash: "o", parents: ["a", "b", "c"] }, { hash: "b", parents: ["a"] }, { hash: "c", parents: ["a"] }, { hash: "a", parents: [] }]);
  assert.deepEqual(rows[0].outgoing.map(l => l.lane), [0, 1, 2]);
  assert.equal(new Set(rows[0].outgoing.map(l => l.color)).size, 3);
  assert.deepEqual(rows[3].incoming.map(l => l.lane).sort(), [0, 1, 2]);
});

test("a commit whose parent wasn't loaded keeps its lane going", () => {
  const rows = m.layoutGraph([{ hash: "b", parents: ["a"] }]);
  assert.deepEqual(rows[0].outgoing, [{ lane: 0, color: 0 }]);
});

test("reads the files a commit changed, with renames and binary files", () => {
  const files = m.parseChanges("M\0src/app.ts\0R087\0old.txt\0new.txt\0A\0logo.png\0D\0gone.md\0", "3\t1\tsrc/app.ts\0" + "2\t2\t\0old.txt\0new.txt\0" + "-\t-\tlogo.png\0" + "0\t9\tgone.md\0");
  assert.deepEqual(files, [
    { status: "M", path: "src/app.ts", added: 3, removed: 1 },
    { status: "R", oldPath: "old.txt", path: "new.txt", added: 2, removed: 2 },
    { status: "A", path: "logo.png", binary: true },
    { status: "D", path: "gone.md", added: 0, removed: 9 },
  ]);
});

test("reads the working tree status", () => {
  const files = m.parseStatus(" M src/app.ts\0?? notes.txt\0R  new.ts\0old.ts\0D  gone.ts\0A  added.ts\0");
  assert.deepEqual(files, [
    { status: "M", path: "src/app.ts" },
    { status: "U", path: "notes.txt" },
    { status: "R", path: "new.ts", oldPath: "old.ts" },
    { status: "D", path: "gone.ts" },
    { status: "A", path: "added.ts" },
  ]);
});

test("formats dates", () => {
  const now = Date.UTC(2026, 9, 24, 12);
  const at = (ms) => Math.round((now - ms) / 1000);
  assert.equal(m.formatDate(at(30_000), "relative", now), "just now");
  assert.equal(m.formatDate(at(3 * 3600_000), "relative", now), "3 hours ago");
  assert.equal(m.formatDate(at(86400_000), "relative", now), "1 day ago");
  assert.equal(m.formatDate(at(400 * 86400_000), "relative", now), "1 year ago");
  assert.match(m.formatDate(1700000000, "date"), /^2023-11-1[45]$/);
  assert.match(m.formatDate(1700000000, "dateTime"), /^2023-11-1[45] \d\d:\d\d$/);
});

test("initials, colours, search and names", () => {
  assert.equal(m.initials("Ada Lovelace"), "AL");
  assert.equal(m.initials("grace"), "GR");
  assert.equal(m.initials("jean-luc picard"), "JP");
  assert.equal(m.initials(""), "?");
  assert.equal(m.hue("Ada"), m.hue("ada"));
  const c = { hash: "abcdef1234" + "0".repeat(30), parents: [], author: "Ada", email: "ada@x.io", date: 0, subject: "Fix login bug" };
  assert.ok(m.matches(c, "login")); assert.ok(m.matches(c, "ADA")); assert.ok(m.matches(c, "abcdef")); assert.ok(!m.matches(c, "abc")); assert.ok(!m.matches(c, "  "));
  assert.equal(m.validRefName("feature/login"), undefined);
  for (const bad of ["", "has space", "-x", "a..b", "a~1", "a:b", "x.lock", "end/", "a//b", "a@{1}"]) assert.ok(m.validRefName(bad), bad);
});
