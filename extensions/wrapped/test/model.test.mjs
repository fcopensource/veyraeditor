import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLog, summarize, personalityOf, periodFor, isMe, isGenerated, languageOf, parseIdent } from "../out/model.js";

const R = "\x1e", F = "\x1f";
const commit = (hash, author, email, date, subject, numstat = "") => `${R}${hash}${F}${author}${F}${email}${F}${date}${F}${subject}\n\n${numstat}`;
const meta = { repo: "demo", who: "Ada", team: false, period: { label: "2026", from: "2026-01-01", to: "2026-12-31" } };

test("parses commits, numstat lines, binary files and renames", () => {
  const text = [
    commit("a1", "Ada", "ada@x.dev", "2026-03-01T23:15:00+05:30", "Add parser", "10\t2\tsrc/parse.ts\n-\t-\tlogo.png\n4\t1\tsrc/{old => new}/util.ts\n3\t0\tdocs/a.md => docs/b.md\n"),
    commit("b2", "Bob", "bob@x.dev", "2026-03-02T09:00:00Z", "Fix crash"),
  ].join("");
  const commits = parseLog(text);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].files.map(f => f.path), ["src/parse.ts", "logo.png", "src/new/util.ts", "docs/b.md"]);
  assert.deepEqual(commits[0].files[1], { path: "logo.png", added: 0, deleted: 0 });
  assert.equal(commits[1].files.length, 0);
  assert.equal(commits[1].subject, "Fix crash");
});

test("summarizes lines, streaks, the busiest day and the author's local hours", () => {
  const text = [
    commit("1", "Ada", "ada@x.dev", "2026-03-01T23:15:00+05:30", "Build the parser", "100\t10\tsrc/a.ts\n5000\t0\tpackage-lock.json\n"),
    commit("2", "Ada", "ada@x.dev", "2026-03-02T22:40:00+05:30", "Parser tests", "40\t5\tsrc/a.test.ts\n"),
    commit("3", "Ada", "ada@x.dev", "2026-03-02T23:59:00+05:30", "Fix parser bug", "2\t2\tsrc/a.ts\n"),
    commit("4", "Ada", "ada@x.dev", "2026-03-03T01:10:00+05:30", "Styles", "20\t0\tsrc/app.css\n"),
    commit("5", "Ada", "ada@x.dev", "2026-03-07T10:00:00+05:30", "Docs", "8\t0\tREADME.md\n"),
  ].join("");
  const w = summarize(parseLog(text), meta);
  assert.equal(w.commits, 5);
  assert.equal(w.added, 170, "the lockfile is not counted as written code");
  assert.equal(w.deleted, 17);
  assert.equal(w.activeDays, 4);
  assert.equal(w.longestStreak, 3);
  assert.deepEqual(w.busiestDay, { date: "2026-03-02", count: 2 });
  assert.equal(w.hours[23], 2, "hours come from the author's own timezone, not UTC");
  assert.equal(w.peakHour, 23);
  assert.equal(w.weekdays[5], 1, "7 March 2026 is a Saturday");
  assert.equal(w.languages[0].name, "TypeScript");
  assert.equal(w.topFiles[0].path, "src/a.ts");
  assert.equal(w.topFiles[0].commits, 2);
  assert.equal(w.biggest.subject, "Build the parser");
  assert.ok(w.words.some(x => x.word === "parser"));
  assert.equal(w.personality.id, "night-owl");
});

test("an empty history still produces a valid summary", () => {
  const w = summarize([], meta);
  assert.equal(w.commits, 0);
  assert.equal(w.busiestDay, null);
  assert.equal(w.personality.id, "steady");
});

test("personality picks the strongest trait, or Steady Shipper when none stands out", () => {
  const base = { commits: 50, added: 5000, deleted: 1000, files: 40, longestStreak: 3, nightShare: 0.1, morningShare: 0.1, weekendShare: 0.1, fixShare: 0.05 };
  assert.equal(personalityOf(base).id, "steady");
  assert.equal(personalityOf({ ...base, weekendShare: 0.5 }).id, "weekend-warrior");
  assert.equal(personalityOf({ ...base, deleted: 9000 }).id, "refactorer");
  assert.equal(personalityOf({ ...base, longestStreak: 30, weekendShare: 0.32 }).id, "marathoner");
  assert.equal(personalityOf({ ...base, fixShare: 0.6 }).id, "bug-hunter");
  assert.equal(personalityOf({ ...base, commits: 2, nightShare: 1 }).id, "steady", "too few commits to judge");
});

test("periods, generated files, languages and who 'me' is", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  assert.equal(periodFor("thisYear", now).since, "2026-01-01");
  assert.equal(periodFor("last12Months", now).since, "2025-11-01");
  assert.equal(periodFor("allTime", now).since, undefined);
  assert.ok(isGenerated("web/package-lock.json") && isGenerated("dist/app.js") && isGenerated("a.min.js"));
  assert.ok(!isGenerated("src/distance.ts"));
  assert.deepEqual(languageOf("src/x.rs"), ["Rust", "#dea584"]);
  assert.equal(languageOf("Makefile"), undefined);
  assert.deepEqual(parseIdent("Ada Lovelace <ada@x.dev> 1761980000 +0530\n"), { name: "Ada Lovelace", email: "ada@x.dev" });
  assert.deepEqual(parseIdent(""), { name: "", email: "" });
  const c = { author: "Ada Lovelace", email: "ADA@x.dev" };
  assert.ok(isMe(c, { email: "ada@x.dev" }) && isMe(c, { name: "ada lovelace" }) && !isMe(c, { email: "bob@x.dev" }));
});
