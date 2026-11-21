// Unit tests for the Aura rules (compiled to out/ by `tsc -p .`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState, award, rankFor, RANKS, dayKey, activeMinute, isNight, judgeCommitMessage, classifyCommand, hasDebugger,
  lastWeek, topMoves, caption, liveStreak, fmt, signed, MOVES, MAX_EVENTS,
} from "../out/model.js";

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const DAY1 = at(2026, 11, 20), DAY2 = at(2026, 11, 21), DAY3 = at(2026, 11, 22), DAY5 = at(2026, 11, 24);

test("moves give and take aura, with the text filled in", () => {
  let s = emptyState();
  let r = award(s, "clearedErrors", DAY1, { file: "app.ts" });
  assert.equal(r.state.total, 15);
  assert.equal(r.events[0].text, "Cleared every error in app.ts");
  assert.equal(r.events[0].emoji, "🧹");
  r = award(r.state, "badCommitMessage", DAY1, { msg: "wip" });
  assert.equal(r.state.total, 10);
  assert.equal(r.events[0].text, "Commit message “wip” is giving nothing");
  assert.equal(r.state.days[dayKey(DAY1)], 10);
  assert.equal(s.total, 0, "the old state is not changed");
});

test("roast mode off means penalties are skipped", () => {
  const r = award(emptyState(), "forcePush", DAY1, {}, { roast: false });
  assert.equal(r.events.length, 0);
  assert.equal(r.state.total, 0);
  assert.equal(award(emptyState(), "forcePush", DAY1).state.total, -20);
});

test("daily limits stop aura farming, per key when given, and reset the next day", () => {
  let s = emptyState();
  for (let i = 0; i < 40; i++) s = award(s, "cleanSave", DAY1).state;
  assert.equal(s.total, MOVES.cleanSave.daily);
  // One debugger penalty per file per day.
  s = award(s, "debuggerLeft", DAY1, { file: "a.js" }, { key: "/a.js" }).state;
  s = award(s, "debuggerLeft", DAY1, { file: "a.js" }, { key: "/a.js" }).state;
  s = award(s, "debuggerLeft", DAY1, { file: "b.js" }, { key: "/b.js" }).state;
  assert.equal(s.total, MOVES.cleanSave.daily - 10);
  const next = award(s, "cleanSave", DAY2);
  assert.equal(next.events.at(-1).id, "cleanSave");
  assert.ok(Object.keys(next.state.counts).every(k => k.startsWith(dayKey(DAY2))), "old counters are dropped");
});

test("streaks grow on consecutive days with a bonus, and reset after a missed day", () => {
  let s = emptyState();
  s = award(s, "commit", DAY1).state;
  assert.equal(s.streak, 1);
  let r = award(s, "commit", DAY2);
  assert.equal(r.state.streak, 2);
  assert.deepEqual(r.events.map(e => [e.id, e.aura, e.text]), [["streak", 10, "2-day streak"], ["commit", 20, "Shipped a commit"]]);
  r = award(r.state, "commit", DAY2);
  assert.equal(r.events.length, 1, "the bonus comes once a day");
  s = award(r.state, "cleanSave", DAY3).state;
  assert.equal(s.streak, 3);
  assert.equal(liveStreak(s, DAY3), 3);
  assert.equal(liveStreak(s, DAY5), 0, "a missed day ends it");
  s = award(s, "commit", DAY5).state;
  assert.equal(s.streak, 1);
  assert.equal(s.bestStreak, 3);
  // A penalty doesn't start a day of the streak.
  const p = award(emptyState(), "testsFailed", DAY1);
  assert.equal(p.state.streak, 0);
  // The bonus is capped at 50.
  const long = award({ ...emptyState(), streak: 20, lastDay: dayKey(DAY1) }, "commit", DAY2);
  assert.equal(long.events[0].aura, 50);
});

test("ranks, progress and rank ups", () => {
  assert.equal(rankFor(0).rank.name, "NPC");
  assert.equal(rankFor(99).rank.name, "NPC");
  assert.equal(rankFor(100).rank.name, "Side Character");
  assert.equal(rankFor(200).progress, 0.5);
  assert.equal(rankFor(300).rank.name, "Main Character");
  assert.equal(rankFor(-5).rank.name, "Negative Aura");
  assert.equal(rankFor(50000).rank.name, "Final Boss");
  assert.equal(rankFor(50000).next, undefined);
  assert.deepEqual(RANKS.map(r => r.min), [0, 100, 300, 700, 1500, 3000, 6000, 10000]);
  const r = award({ ...emptyState(), total: 95 }, "commit", DAY1);
  assert.equal(r.rankUp.name, "Side Character");
  assert.equal(award({ ...emptyState(), total: 10 }, "commit", DAY1).rankUp, undefined);
});

test("events are capped", () => {
  let s = emptyState();
  for (let d = 0; d < 30; d++) for (let i = 0; i < 10; i++) s = award(s, "testsPassed", at(2026, 10, 1 + d)).state;
  assert.equal(s.events.length, MAX_EVENTS);
});

test("every 25 active minutes is locked in; after midnight is night owl", () => {
  let s = emptyState(), locked = 0;
  for (let i = 0; i < 60; i++) { const r = activeMinute(s, DAY1 + i * 60000); s = r.state; if (r.lockedIn) locked++; }
  assert.equal(locked, 2);
  assert.equal(activeMinute(s, DAY2).minutes, 1, "a new day starts again");
  assert.equal(isNight(at(2026, 11, 21, 1, 30)), true);
  assert.equal(isNight(at(2026, 11, 21, 9)), false);
});

test("commit messages: good, bad and ok", () => {
  for (const m of ["wip", "fix", "asdf", ".", "update", "stuff", "x", "ok", "final"]) assert.equal(judgeCommitMessage(m), "bad", m);
  for (const m of ["feat: add dark mode toggle", "fix(api): retry on 503 errors", "Handle empty carts in the checkout total"]) assert.equal(judgeCommitMessage(m), "good", m);
  assert.equal(judgeCommitMessage("Bump version"), "ok");
  assert.equal(judgeCommitMessage("feat: x"), "ok");
});

test("terminal commands: tests, builds and force pushes", () => {
  for (const c of ["npm test", "npm run test -- --watch=false", "pnpm test", "yarn test", "npx vitest run", "pytest -q", "go test ./...", "cargo test", "npx playwright test", "dotnet test"]) assert.equal(classifyCommand(c), "test", c);
  for (const c of ["npm run build", "pnpm build", "tsc -p .", "cargo build --release", "go build", "next build", "make"]) assert.equal(classifyCommand(c), "build", c);
  for (const c of ["git push --force", "git push -f origin main", "git push origin +main"]) assert.equal(classifyCommand(c), "forcePush", c);
  for (const c of ["git push", "git push --force-with-lease", "git status", "ls -la", "npm install"]) assert.equal(classifyCommand(c), undefined, c);
});

test("debugger statements", () => {
  assert.equal(hasDebugger("function a() {\n  debugger;\n}"), true);
  assert.equal(hasDebugger("debugger"), true);
  assert.equal(hasDebugger("const debuggerName = 1; // no debugger here"), false);
});

test("the week, best moves, caption and number formats", () => {
  let s = emptyState();
  s = award(s, "commit", DAY1).state;
  s = award(s, "commit", DAY2).state;
  s = award(s, "clearedErrors", DAY2, { file: "a" }).state;
  s = award(s, "forcePush", DAY2).state;
  const week = lastWeek(s, DAY2);
  assert.equal(week.length, 7);
  assert.equal(week[6].key, dayKey(DAY2));
  assert.equal(week[6].aura, 10 + 20 + 15 - 20);
  assert.equal(week[5].aura, 20);
  assert.deepEqual(topMoves(s, DAY2).map(m => [m.label, m.aura, m.times]), [["Commits", 40, 2], ["Errors cleared", 15, 1]]);
  assert.equal(caption(s, DAY2), "My code aura: 45 (NPC 🧍) · 🔥 2-day streak · +45 this week. Built different. #VeyraAura #coding\nveyraeditor.com/aura");
  assert.equal(fmt(12345), "12,345");
  assert.equal(fmt(-20), "−20");
  assert.equal(signed(5), "+5");
  assert.equal(signed(-5), "−5");
  assert.equal(signed(0), "±0");
});
