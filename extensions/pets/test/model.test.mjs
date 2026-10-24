import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

const run = (w, seconds, rnd) => { for (let t = 0; t < seconds; t += 1 / 60) m.step(w, 1 / 60, rnd); };
const world = (width = 300, pets = [{ id: "a", kind: "cat", color: "orange", name: "Mochi" }], seed = 1) => {
  const rnd = m.random(seed);
  const w = m.createWorld(width);
  m.syncPets(w, pets, rnd);
  return { w, rnd };
};

test("the random source is repeatable", () => {
  const a = m.random(42), b = m.random(42);
  const xs = [a(), a(), a()], ys = [b(), b(), b()];
  assert.deepEqual(xs, ys);
  assert.ok(xs.every(x => x >= 0 && x < 1));
});

test("pets stay inside the panel, whatever they get up to", () => {
  const { w, rnd } = world(240, [1, 2, 3].map(i => ({ id: String(i), kind: "dog", color: "brown", name: String(i) })), 7);
  const modes = new Set();
  for (let i = 0; i < 60 * 120; i++) { m.step(w, 1 / 60, rnd); for (const p of w.pets) { assert.ok(p.x >= 22 && p.x <= 218, `x=${p.x}`); modes.add(p.mode); } }
  for (const mode of ["walk", "idle", "sit"]) assert.ok(modes.has(mode), `saw ${mode}: ${[...modes]}`);
});

test("keeps positions when the list changes, and adds or removes pets", () => {
  const { w, rnd } = world();
  run(w, 3, rnd);
  const x = w.pets[0].x;
  m.syncPets(w, [{ id: "a", kind: "cat", color: "black", name: "Luna" }, { id: "b", kind: "fox", color: "red", name: "Kiwi" }], rnd);
  assert.equal(w.pets.length, 2);
  assert.equal(w.pets[0].x, x, "same place");
  assert.equal(w.pets[0].color, "black", "new colour and name");
  assert.equal(w.pets[0].name, "Luna");
  m.syncPets(w, [{ id: "b", kind: "fox", color: "red", name: "Kiwi" }], rnd);
  assert.deepEqual(w.pets.map(p => p.id), ["b"]);
});

test("a thrown ball bounces, rolls to a stop, and gets caught", () => {
  const { w, rnd } = world(400);
  w.pets[0].x = 40;
  m.throwBall(w, 300, 60, -80, 120);
  let bounced = false, chased = false;
  for (let i = 0; i < 60 * 10 && w.ball && !w.ball.caughtBy; i++) {
    const before = w.ball.vy;
    m.step(w, 1 / 60, rnd);
    if (w.ball && before < 0 && w.ball.vy > 0) bounced = true;
    if (w.pets[0].mode === "chase") chased = true;
    assert.ok(!w.ball || w.ball.y >= 0, "never below the ground");
  }
  assert.ok(bounced, "it bounced");
  assert.ok(chased, "the pet chased it");
  assert.equal(w.ball?.caughtBy, "a", "the pet caught it");
  assert.equal(w.pets[0].mood, "happy");
  assert.ok(w.effects.some(e => e.kind === "heart"));
  run(w, 2, rnd);
  assert.equal(w.ball, undefined, "the ball goes away after it's caught");
  assert.notEqual(w.pets[0].mode, "chase");
});

test("petting makes a pet happy and hop", () => {
  const { w, rnd } = world();
  m.petPet(w, "a", rnd);
  assert.equal(w.pets[0].mood, "happy");
  m.step(w, 0.05, rnd);
  assert.ok(w.pets[0].jump > 0, "in the air");
  run(w, 3, rnd);
  assert.equal(w.pets[0].jump, 0, "back on the ground");
  assert.equal(w.pets[0].mood, undefined, "the mood passes");
});

test("pets nap when you're away and wake up when you type", () => {
  const { w, rnd } = world();
  w.sleepAfter = 10;
  run(w, 25, rnd);
  assert.equal(w.pets[0].mode, "sleep");
  run(w, 3, rnd);
  assert.ok(w.effects.some(e => e.kind === "zzz"), "Zzz");
  m.activity(w, rnd);
  assert.equal(w.pets[0].mode, "sit", "awake");
  m.throwBall(w, 100, 50, 0, 0);
  m.step(w, 0.02, rnd);
  assert.equal(w.pets[0].mode, "chase");
});

test("reactions to code: cheer, worry and party", () => {
  const { w, rnd } = world(300, [{ id: "a", kind: "cat", color: "orange", name: "A" }, { id: "b", kind: "bunny", color: "white", name: "B" }]);
  m.cheer(w, rnd);
  m.step(w, 0.05, rnd);
  assert.ok(w.pets.every(p => p.jump > 0), "everyone hops on save");
  run(w, 2, rnd);
  m.worry(w, rnd);
  assert.ok(w.pets.every(p => p.mood === "worried" && p.mode === "sit"));
  assert.ok(w.effects.some(e => e.kind === "bang"));
  m.party(w, rnd);
  assert.ok(w.pets.every(p => p.mood === "happy"));
  assert.ok(w.effects.filter(e => e.kind === "star").length >= 8);
});

test("finding the pet under the mouse", () => {
  const { w } = world();
  w.pets[0].x = 100;
  assert.equal(m.petAt(w, 105, 10, 1)?.id, "a");
  assert.equal(m.petAt(w, 160, 10, 1), undefined);
  assert.equal(m.petAt(w, 100, 80, 1), undefined, "above its head");
});

test("fresh names", () => {
  const rnd = m.random(3);
  const a = m.freshName([], rnd);
  assert.ok(a.length > 1);
  assert.notEqual(m.freshName([a], rnd), a);
  assert.match(m.freshName(Array(20).fill(0).map((_, i) => ["Mochi", "Biscuit", "Pixel", "Luna", "Nugget", "Maple", "Pepper", "Tofu", "Cookie", "Ziggy", "Peanut", "Sushi", "Waffles", "Bean", "Noodle", "Juniper", "Pudding", "Momo", "Kiwi", "Clover"][i]), rnd), / 21$/);
});

test("a long pause doesn't make pets teleport", () => {
  const { w, rnd } = world();
  const p = w.pets[0];
  p.mode = "run"; p.vx = 70; p.until = 99;
  const x = p.x;
  m.step(w, 30, rnd); // a hidden tab coming back
  assert.ok(Math.abs(p.x - x) <= 7.1, `moved ${p.x - x}`);
});

test("after a catch, nobody stays piled up", () => {
  const { w, rnd } = world(400, [1, 2, 3, 4].map(i => ({ id: String(i), kind: "cat", color: "grey", name: String(i) })), 5);
  w.pets.forEach((p, i) => (p.x = 40 + i * 10));
  m.throwBall(w, 200, 30, 0, 0);
  run(w, 12, rnd);
  const xs = w.pets.map(p => p.x).sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(gaps.filter(g => g < 12).length <= 1, `spread out: ${xs.map(Math.round)}`);
});
