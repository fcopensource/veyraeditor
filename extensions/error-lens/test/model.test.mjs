import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const p = (line, severity, message, source, code) => ({ line, severity, message, source, code });
const all = new Set(["error", "warning", "info", "hint"]);

test("reads every shape of diagnostic code", () => {
  assert.equal(m.codeText("TS2304"), "TS2304");
  assert.equal(m.codeText(2304), "2304");
  assert.equal(m.codeText({ value: "no-unused-vars", target: {} }), "no-unused-vars");
  assert.equal(m.codeText(undefined), undefined);
  assert.equal(m.codeText(""), undefined);
});

test("filters by severity, source and message", () => {
  const problems = [p(1, 0, "Cannot find name 'x'.", "ts"), p(2, 1, "Unknown word (teh)", "cSpell"), p(3, 2, "Line is long", "eslint"), p(4, 3, "Unused", "ts")];
  assert.equal(m.filterProblems(problems, { severities: all, excludeSources: [], excludeMessages: [] }).length, 4);
  assert.deepEqual(m.filterProblems(problems, { severities: new Set(["error", "warning"]), excludeSources: [], excludeMessages: [] }).map(x => x.line), [1, 2]);
  assert.deepEqual(m.filterProblems(problems, { severities: all, excludeSources: ["CSPELL"], excludeMessages: [] }).map(x => x.line), [1, 3, 4]);
  assert.deepEqual(m.filterProblems(problems, { severities: all, excludeSources: [], excludeMessages: m.compilePatterns(["^line is"]).regexes }).map(x => x.line), [1, 2, 4]);
});

test("bad patterns are reported, not thrown", () => {
  const { regexes, invalid } = m.compilePatterns(["ok", "(unclosed"]);
  assert.equal(regexes.length, 1);
  assert.deepEqual(invalid, ["(unclosed"]);
});

test("one entry per line, most severe first", () => {
  const lines = m.byLine([p(5, 1, "warn first"), p(5, 0, "the error"), p(5, 0, "second error"), p(2, 2, "info")]);
  assert.deepEqual(lines.map(l => l.line), [2, 5]);
  assert.equal(lines[1].top.message, "the error", "the earliest of the most severe");
  assert.equal(lines[1].count, 3);
  assert.deepEqual(lines[1].all.map(x => x.severity), [0, 0, 1]);
});

test("follows the cursor when asked", () => {
  const lines = m.byLine([p(2, 0, "a"), p(10, 1, "b"), p(30, 0, "c")]);
  assert.equal(m.pickLines(lines, "allLines", 0).length, 3);
  assert.deepEqual(m.pickLines(lines, "activeLine", 10).map(l => l.line), [10]);
  assert.deepEqual(m.pickLines(lines, "activeLine", 11), []);
  assert.deepEqual(m.pickLines(lines, "closestProblem", 25).map(l => l.line), [30]);
  assert.deepEqual(m.pickLines(lines, "closestProblem", 5).map(l => l.line), [2]);
  assert.deepEqual(m.pickLines([], "closestProblem", 5), []);
});

test("formats messages from the template", () => {
  const e = (top, count = 1) => ({ top, count });
  assert.equal(m.formatMessage("{message}", e(p(0, 0, "Cannot find name 'x'."))), "Cannot find name 'x'.");
  assert.equal(m.formatMessage("{source}: {message}", e(p(0, 0, "Bad", "ts"))), "ts: Bad");
  assert.equal(m.formatMessage("{source}: {message}", e(p(0, 0, "Bad"))), "Bad", "no dangling colon without a source");
  assert.equal(m.formatMessage("{message} ({code})", e(p(0, 0, "Bad"))), "Bad", "no empty brackets without a code");
  assert.equal(m.formatMessage("{message} [{code}]", e(p(0, 1, "Bad", "eslint", "no-var"))), "Bad [no-var]");
  assert.equal(m.formatMessage("{severity}: {message}", e(p(0, 1, "Hmm"))), "warning: Hmm");
  assert.equal(m.formatMessage("{message}", e(p(0, 0, "Type 'A'\n  is not assignable\tto 'B'."))), "Type 'A' is not assignable to 'B'.", "one line");
  assert.equal(m.formatMessage("{message}", e(p(0, 0, "First"), 3)), "First  (+2 more)");
  assert.equal(m.formatMessage("{count}× {message}", e(p(0, 0, "First"), 3)), "3× First", "no extra count when the template has one");
  assert.equal(m.formatMessage("{message}", e(p(0, 0, "x".repeat(50))), 20), "x".repeat(19) + "…");
});

test("hides the line you're typing on until you pause", () => {
  const edit = { line: 4, at: 1000 };
  assert.equal(m.hiddenWhileTyping("hideCurrentLine", 4, edit, 1300, 600), true);
  assert.equal(m.hiddenWhileTyping("hideCurrentLine", 4, edit, 1700, 600), false, "after the pause");
  assert.equal(m.hiddenWhileTyping("hideCurrentLine", 5, edit, 1300, 600), false, "other lines");
  assert.equal(m.hiddenWhileTyping("show", 4, edit, 1300, 600), false);
  assert.equal(m.hiddenWhileTyping("hideCurrentLine", 4, undefined, 1300, 600), false);
});

test("copies every problem on a line, and searches without local paths", () => {
  const [line] = m.byLine([p(1, 1, "Unexpected var", "eslint", "no-var"), p(1, 0, "Cannot find name 'x'.", "ts", "2304")]);
  assert.equal(m.describe(line), "error: Cannot find name 'x'. (ts 2304)\nwarning: Unexpected var (eslint no-var)");
  assert.equal(m.searchQuery(p(0, 0, "Cannot find module 'C:/Users/ada/app/util' or its type declarations.\nmore", "ts", "2307")), "ts 2307 Cannot find module or its type declarations.");
});
