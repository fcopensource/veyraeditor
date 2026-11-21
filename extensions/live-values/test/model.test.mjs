// Unit tests for the Live Values model (compiled to out/ by `tsc -p .`).
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Store, parseChunk, sparkline, ago, inlineText, hoverMarkdown, nodeOptions, runCommand, fileKey, HISTORY } from "../out/model.js";

const FILE = path.resolve("/work/app/src/server.ts");
const rec = (line, text, extra = {}) => ({ v: 1, t: 1000, pid: 1, level: "log", file: FILE, line, col: 3, text, full: text, ...extra });

test("parses complete records and keeps a half-written one for later", () => {
  const a = JSON.stringify(rec(3, "hello"));
  const b = JSON.stringify(rec(4, "world"));
  const { records, rest } = parseChunk(`${a}\n${b.slice(0, 10)}`);
  assert.equal(records.length, 1);
  assert.equal(records[0].text, "hello");
  const next = parseChunk(rest + b.slice(10) + "\n");
  assert.equal(next.records[0].text, "world");
  assert.equal(next.rest, "");
});

test("skips broken and invalid lines", () => {
  const { records } = parseChunk(`not json\n${JSON.stringify({ file: FILE, line: 0, level: "log", text: "x" })}\n${JSON.stringify({ ...rec(2, "ok"), level: "nope" })}\n\n${JSON.stringify(rec(2, "ok"))}\n`);
  assert.deepEqual(records.map(r => r.text), ["ok"]);
});

test("stores the latest value per line, 0-based, with a count and history", () => {
  const s = new Store(false);
  s.add(rec(10, "1", { num: 1, t: 1 }));
  s.add(rec(10, "2", { num: 2, t: 2 }));
  const e = s.add(rec(10, "3", { num: 3, t: 3 }));
  assert.equal(e.line, 9);
  assert.equal(e.count, 3);
  assert.equal(e.text, "3");
  assert.equal(s.at(FILE, 9), e);
  assert.deepEqual(e.history.map(h => h.num), [1, 2, 3]);
  for (let i = 0; i < HISTORY + 5; i++) s.add(rec(10, String(i)));
  assert.equal(s.at(FILE, 9).history.length, HISTORY);
  assert.equal(s.size, 1);
});

test("a new run clears the previous run's values in that file", () => {
  const s = new Store(false);
  s.add(rec(1, "old a"));
  s.add(rec(2, "old b"));
  s.add(rec(1, "new a", { pid: 2 }));
  assert.deepEqual(s.forFile(FILE).map(e => [e.line, e.text, e.count]), [[0, "new a", 1]]);
  // Without clearOnRun the old values stay, and a line printed again restarts its count.
  const k = new Store(false);
  k.add(rec(1, "old a")); k.add(rec(1, "old a")); k.add(rec(2, "old b"));
  k.add(rec(1, "new a", { pid: 2 }), false);
  assert.deepEqual(k.forFile(FILE).map(e => [e.line, e.text, e.count]), [[0, "new a", 1], [1, "old b", 1]]);
});

test("paths are case-insensitive on Windows only", () => {
  const win = new Store(true);
  win.add(rec(1, "x"));
  assert.ok(win.at(FILE.toUpperCase(), 0));
  assert.equal(fileKey("C:\\A\\b.ts", true), fileKey("c:\\a\\B.TS", true));
  const posix = new Store(false);
  posix.add(rec(1, "x"));
  assert.equal(posix.at(FILE.toUpperCase(), 0), undefined);
});

test("values follow their lines while you edit", () => {
  const make = () => { const s = new Store(false); for (const l of [3, 5, 8]) s.add(rec(l + 1, `L${l}`)); return s; };
  const lines = s => s.forFile(FILE).map(e => `${e.line}:${e.text}`);

  let s = make(); s.shift(FILE, 4, 0, 4, 0, "a\nb\n");        // two lines typed above line 5
  assert.deepEqual(lines(s), ["3:L3", "7:L5", "10:L8"]);

  s = make(); s.shift(FILE, 5, 0, 6, 0, "");                   // line 5 deleted (Ctrl+Shift+K)
  assert.deepEqual(lines(s), ["3:L3", "7:L8"]);

  s = make(); s.shift(FILE, 5, 0, 5, 0, "\n");                 // Enter at the start of line 5
  assert.deepEqual(lines(s), ["3:L3", "6:L5", "9:L8"]);

  s = make(); s.shift(FILE, 5, 12, 5, 12, "\n");               // Enter at the end of line 5
  assert.deepEqual(lines(s), ["3:L3", "5:L5", "9:L8"]);

  s = make(); s.shift(FILE, 5, 2, 5, 6, "renamed");            // an edit inside a line
  assert.deepEqual(lines(s), ["3:L3", "5:L5", "8:L8"]);

  s = make(); s.shift(FILE, 4, 0, 7, 0, "");                   // lines 4-6 deleted
  assert.deepEqual(lines(s), ["3:L3", "5:L8"]);

  s = make(); s.shift(FILE, 4, 10, 5, 0, "");                  // line 5 joined onto line 4
  assert.deepEqual(lines(s), ["3:L3", "4:L5", "7:L8"]);
});

test("sparkline, ago and the inline text", () => {
  assert.equal(sparkline([1]), "");
  assert.equal(sparkline([0, 7]), "▁█");
  assert.equal(sparkline([5, 5, 5]), "▄▄▄");
  assert.equal(sparkline([0, 1, 2, 3, 4, 5, 6, 7]), "▁▂▃▄▅▆▇█");
  assert.equal(ago(1000, 1500), "now");
  assert.equal(ago(0, 45000), "45s ago");
  assert.equal(ago(0, 3 * 60000), "3m ago");
  assert.equal(ago(0, 5 * 3600000), "5h ago");
  assert.equal(ago(0, 2 * 86400000), "2d ago");

  const s = new Store(false);
  const e = s.add(rec(1, "user { id: 1 }"));
  assert.equal(inlineText(e), "▸ user { id: 1 }");
  s.add(rec(1, "user { id: 2 }"));
  assert.equal(inlineText(e), "▸ user { id: 2 }   ×2");
  assert.equal(inlineText(e, 10), "▸ user { id…   ×2");
  const w = s.add(rec(2, "slow", { level: "warn" }));
  assert.equal(inlineText(w), "⚠ slow");
  const c = s.add(rec(3, "TypeError: x is undefined", { level: "crash" }));
  assert.equal(inlineText(c), "💥 Crashed: TypeError: x is undefined");
});

test("the hover shows the full value, a chart of numbers and recent values", () => {
  const s = new Store(false);
  for (const [i, n] of [3, 9, 4, 12].entries()) s.add(rec(7, `total ${n}`, { num: n, t: 1000 + i * 1000, full: `total ${n}` }));
  const md = hoverMarkdown(s.at(FILE, 6), 10000);
  assert.match(md, /Live value\*\* · printed 4 times · 6s ago/);
  assert.match(md, /```text\ntotal 12\n```/);
  assert.match(md, /`▁▆▂█`  min \*\*3\*\* · max \*\*12\*\* · last \*\*12\*\*/);
  assert.match(md, /Before that[\s\S]*`total 4`[\s\S]*`total 3`/);
  // Backticks in a value can't break out of the code block.
  const t = s.add(rec(9, "a ``` b", { full: "a ``` b" }));
  assert.match(hoverMarkdown(t), /````text\na ``` b\n````/);
});

test("NODE_OPTIONS keeps what was there and adds the hook only once", () => {
  const hook = "C:\\Users\\Me Too\\ext\\runtime\\hook.js";
  const one = nodeOptions(hook);
  assert.equal(one, `--require "C:\\\\Users\\\\Me Too\\\\ext\\\\runtime\\\\hook.js"`);
  assert.equal(nodeOptions(hook, "--max-old-space-size=4096"), `${one} --max-old-space-size=4096`);
  assert.equal(nodeOptions(hook, one), one);
});

test("run commands for JavaScript and TypeScript files", () => {
  assert.equal(runCommand("/a/b c.js", false), `node "/a/b c.js"`);
  assert.equal(runCommand("/a/app.mjs", true), `node /a/app.mjs`);
  assert.equal(runCommand("src\\server.js", false), `node src\\server.js`);
  assert.equal(runCommand("C:\\My Projects\\app.js", false), `node "C:\\My Projects\\app.js"`);
  assert.equal(runCommand("/a/app.ts", true), `npx tsx /a/app.ts`);
  assert.equal(runCommand("/a/app.mts", false), `npx --yes tsx /a/app.mts`);
});
