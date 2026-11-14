import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const HOUR = 3600_000, DAY = 24 * HOUR;
// Noon on a fixed day, so day and night are predictable.
const NOON = new Date(2026, 10, 15, 12, 0, 0).getTime();
const garden = (seed = 1) => { const rnd = m.random(seed); return { g: m.newGarden(NOON, rnd), rnd }; };
const code = (g, rnd, minutes, start = NOON) => { const events = []; for (let i = 0; i < minutes; i++) { m.save(g, start + i * 60_000, rnd); events.push(...m.codeMinute(g, start + i * 60_000, rnd)); } return events; };

test("a new garden starts with one daisy seed and only daisies unlocked", () => {
  const { g } = garden();
  assert.equal(g.plants.length, 1);
  assert.equal(g.plants[0].species, "daisy");
  assert.equal(m.stageOf(g.plants[0]), 0);
  assert.deepEqual(g.known, ["daisy"]);
});

test("coding grows a plant from seed to bloom, through every stage", () => {
  const { g, rnd } = garden();
  const first = g.plants[0];
  const seen = new Set();
  for (let i = 0; i < 60; i++) { m.save(g, NOON + i * 60_000, rnd); m.codeMinute(g, NOON + i * 60_000, rnd); seen.add(m.stageOf(first)); }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4].filter(s => seen.has(s)).sort());
  assert.equal(m.stageOf(first), 4, "the daisy is in bloom after an hour of watered coding");
  assert.ok(seen.has(1) && seen.has(2) && seen.has(3), `passed through sprout, leaves and bud: ${[...seen]}`);
});

test("a new seed sprouts every 20 minutes of coding, up to a full garden", () => {
  const { g, rnd } = garden();
  const events = code(g, rnd, 60);
  assert.equal(events.filter(e => e.type === "sprout").length, 3);
  assert.equal(g.plants.length, 4);
  code(g, rnd, 20 * 30, NOON + HOUR);
  assert.ok(g.plants.length <= m.MAX_PLANTS);
});

test("plants spread out instead of piling up in one spot", () => {
  const { g, rnd } = garden(5);
  code(g, rnd, 20 * 8);
  const xs = g.plants.map(p => p.x).sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 0.03, `gap ${xs[i] - xs[i - 1]}`);
  assert.ok(xs.every(x => x >= 0.04 && x <= 0.96));
});

test("dry soil slows growth to half, and saving waters it again; nothing ever dies", () => {
  const { g, rnd } = garden();
  m.evaporate(g, NOON + 20 * HOUR);
  assert.equal(g.moisture, 0);
  assert.equal(m.growthRate(g), 0.5);
  const before = g.plants[0].growth;
  m.codeMinute(g, NOON + 20 * HOUR, rnd);
  assert.equal(g.plants[0].growth - before, 0.5);
  const events = m.save(g, NOON + 20 * HOUR, rnd);
  assert.equal(g.moisture, 1);
  assert.ok(events.some(e => e.type === "rain"), "watering a dry garden makes it rain");
  m.evaporate(g, NOON + 400 * DAY);
  assert.equal(g.plants.length, 1, "a forgotten garden is still there");
});

test("the streak counts days in a row and starts again after a gap", () => {
  const { g, rnd } = garden();
  m.codeMinute(g, NOON, rnd);
  m.codeMinute(g, NOON + 3 * HOUR, rnd);
  assert.equal(g.streak.days, 1, "the same day counts once");
  const events = m.codeMinute(g, NOON + DAY, rnd);
  assert.equal(g.streak.days, 2);
  assert.ok(events.some(e => e.type === "streak" && e.days === 2));
  m.codeMinute(g, NOON + 2 * DAY, rnd);
  m.codeMinute(g, NOON + 5 * DAY, rnd);
  assert.equal(g.streak.days, 1, "a gap starts a new streak");
  assert.equal(g.streak.best, 3, "the best streak is kept");
});

test("two days in a row unlocks the tulip, once", () => {
  const { g, rnd } = garden();
  m.codeMinute(g, NOON, rnd);
  const events = m.codeMinute(g, NOON + DAY, rnd);
  assert.ok(events.some(e => e.type === "unlock" && e.species === "tulip"));
  assert.ok(!m.codeMinute(g, NOON + DAY + 60_000, rnd).some(e => e.type === "unlock"));
});

test("late-night coding unlocks the glow mushroom", () => {
  const { g, rnd } = garden();
  const night = new Date(2026, 10, 15, 23, 0, 0).getTime();
  let unlocked = false;
  for (let i = 0; i < 60; i++) unlocked ||= m.codeMinute(g, night + i * 60_000, rnd).some(e => e.type === "unlock" && e.species === "mushroom");
  assert.ok(unlocked);
  assert.equal(g.totals.nightMinutes, 60);
});

test("fixing errors brings butterflies, grows plants, and ten fixes unlock the cactus", () => {
  const { g } = garden();
  const before = g.plants[0].growth;
  const events = m.fixed(g, 3);
  assert.deepEqual(events.find(e => e.type === "butterflies"), { type: "butterflies", count: 4 });
  assert.ok(g.plants[0].growth > before);
  assert.ok(m.fixed(g, 7).some(e => e.type === "unlock" && e.species === "cactus"));
});

test("a commit makes the most grown plant that isn't in bloom burst into flower", () => {
  const { g, rnd } = garden();
  code(g, rnd, 41);
  const unbloomed = g.plants.filter(p => m.stageOf(p) < 4);
  const target = unbloomed.sort((a, b) => m.progress(b) - m.progress(a))[0];
  const events = m.commit(g);
  assert.equal(m.stageOf(target), 4);
  assert.ok(events.some(e => e.type === "bloom" && e.plant.id === target.id));
  assert.equal(g.totals.commits, 1);
});

test("a full garden presses its oldest long-bloomed flower into the collection to make room", () => {
  const { g, rnd } = garden(3);
  code(g, rnd, 20 * 40);
  assert.equal(g.plants.length, m.MAX_PLANTS);
  assert.ok(m.pressedTotal(g) > 0, "some flowers were pressed");
  assert.ok(Object.keys(g.pressed).every(k => m.SPECIES.some(s => s.id === k)));
});

test("you can only choose a seed you've unlocked, and the next sprout is that seed", () => {
  const { g, rnd } = garden();
  assert.equal(m.chooseNextSeed(g, "cherry"), false);
  assert.equal(m.chooseNextSeed(g, "daisy"), true);
  const sprout = code(g, rnd, 20).find(e => e.type === "sprout");
  assert.equal(sprout.plant.species, "daisy");
  assert.equal(g.nextSeed, undefined);
});

test("a damaged or old saved garden is repaired instead of crashing", () => {
  const rnd = m.random(1);
  assert.equal(m.repair(undefined, NOON, rnd).plants.length, 1);
  assert.equal(m.repair({ v: 7 }, NOON, rnd).plants.length, 1);
  const fixedUp = m.repair({ v: 1, plants: [{ id: "a", species: "daisy", x: 9, growth: 5, planted: 1 }, { id: "b", species: "dragonfruit", x: 0.5, growth: 1 }], moisture: 3, known: ["daisy", "nope"] }, NOON, rnd);
  assert.equal(fixedUp.plants.length, 1);
  assert.equal(fixedUp.plants[0].x, 0.96);
  assert.equal(fixedUp.moisture, 1);
  assert.deepEqual(fixedUp.known, ["daisy"]);
  assert.equal(fixedUp.totals.saves, 0);
});

test("every species has an unlock rule, a name and four growing stages", () => {
  assert.equal(m.SPECIES.length, 9);
  for (const s of m.SPECIES) {
    assert.ok(s.name && s.how);
    assert.equal(s.stages.length, 4);
    for (let i = 1; i < 4; i++) assert.ok(s.stages[i] > s.stages[i - 1]);
  }
});
