/* The pets' world: how they move, play and react. Pure and deterministic with a seeded random source, so it's tested in Node. */

export type Kind = "cat" | "dog" | "fox" | "bunny" | "panda";
export type Mode = "walk" | "run" | "idle" | "sit" | "sleep" | "chase" | "jump";
export interface PetInfo { id: string; kind: Kind; color: string; name: string }
export interface Pet extends PetInfo {
  x: number; jump: number; vy: number; vx: number; facing: 1 | -1;
  mode: Mode; until: number; phase: number;
  mood: "happy" | "worried" | undefined; moodUntil: number; blinkUntil: number; nextBlink: number;
}
export interface Ball { x: number; y: number; vx: number; vy: number; restingSince: number; caughtBy?: string; caughtAt?: number }
export interface Effect { kind: "heart" | "zzz" | "star" | "bang"; x: number; y: number; vx: number; vy: number; born: number; life: number; hue?: number }
export interface World { width: number; time: number; pets: Pet[]; ball?: Ball; effects: Effect[]; lastActivity: number; sleepAfter: number; spacing: number; margin: number }

export const SPEED = { walk: 26, run: 70, chase: 95 };
const GRAVITY = 520;

/** A small, seedable random source (mulberry32), so tests can replay the same day in the life of a pet. */
export function random(seed = Date.now()): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createWorld(width: number, now = 0): World {
  return { width, time: now, pets: [], effects: [], lastActivity: now, sleepAfter: 5 * 60, spacing: 30, margin: 22 };
}

/** Adds, keeps or removes pets to match the list from the extension, keeping where existing pets are. */
export function syncPets(world: World, infos: PetInfo[], rnd: () => number) {
  const byId = new Map(world.pets.map(p => [p.id, p]));
  world.pets = infos.map(info => {
    const existing = byId.get(info.id);
    if (existing) return Object.assign(existing, info);
    return {
      ...info, x: world.margin + rnd() * Math.max(1, world.width - world.margin * 2), jump: 0, vy: 0, vx: 0, facing: rnd() < 0.5 ? 1 : -1,
      mode: "idle", until: world.time + 0.5 + rnd(), phase: 0, mood: undefined, moodUntil: 0, blinkUntil: 0, nextBlink: world.time + 1 + rnd() * 3,
    } as Pet;
  });
}

function setMode(p: Pet, mode: Mode, now: number, rnd: () => number) {
  p.mode = mode;
  const span: Record<Mode, [number, number]> = { walk: [3, 8], run: [1.5, 3], idle: [2, 5], sit: [4, 9], sleep: [12, 30], chase: [999, 999], jump: [9, 9] };
  const [a, b] = span[mode];
  p.until = now + a + rnd() * (b - a);
  if (mode === "walk" || mode === "run") {
    if (rnd() < 0.35) p.facing = p.facing === 1 ? -1 : 1;
    p.vx = SPEED[mode] * p.facing;
  } else if (mode !== "jump") p.vx = 0;
}

/** What a pet does next when its current activity ends. */
function nextMode(p: Pet, w: World, rnd: () => number): Mode {
  if (w.time - w.lastActivity > w.sleepAfter) return "sleep";
  const r = rnd();
  if (p.mode === "sleep") return r < 0.6 ? "sit" : "idle";
  if (r < 0.45) return "walk";
  if (r < 0.65) return "idle";
  if (r < 0.88) return "sit";
  if (r < 0.98) return "run";
  return "sleep";
}

export function jump(p: Pet, strength = 170) { if (p.jump <= 0.01) { p.vy = strength; p.mode = p.mode === "sleep" ? "idle" : p.mode; } }

function puff(w: World, kind: Effect["kind"], x: number, y: number, rnd: () => number, n = 1) {
  for (let i = 0; i < n; i++) w.effects.push({ kind, x: x + (rnd() - 0.5) * 16, y: y + (rnd() - 0.5) * 6, vx: (rnd() - 0.5) * 30, vy: -26 - rnd() * 22, born: w.time, life: kind === "zzz" ? 2.4 : 1.4, hue: Math.floor(rnd() * 360) });
}

/** Moves the world on by dt seconds. */
export function step(w: World, dt: number, rnd: () => number) {
  dt = Math.min(dt, 0.1); // after a hidden tab, don't jump ahead
  w.time += dt;
  const ball = w.ball;
  if (ball && !ball.caughtBy) {
    ball.vy -= GRAVITY * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.y <= 0) { ball.y = 0; ball.vy = Math.abs(ball.vy) > 60 ? -ball.vy * 0.55 : 0; ball.vx *= 0.82; }
    if (ball.y === 0 && ball.vy === 0) ball.vx *= Math.pow(0.25, dt);
    if (ball.x < 6) { ball.x = 6; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > w.width - 6) { ball.x = w.width - 6; ball.vx = -Math.abs(ball.vx) * 0.7; }
    const resting = ball.y === 0 && Math.abs(ball.vx) < 4;
    if (!resting) ball.restingSince = w.time;
  }
  if (ball?.caughtBy && w.time - (ball.caughtAt ?? 0) > 1.2) w.ball = undefined;

  for (const p of w.pets) {
    // Jumps and falls.
    if (p.jump > 0 || p.vy > 0) { p.vy -= GRAVITY * dt; p.jump = Math.max(0, p.jump + p.vy * dt); if (p.jump === 0) p.vy = 0; }
    // Blinking.
    if (w.time > p.nextBlink) { p.blinkUntil = w.time + 0.14; p.nextBlink = w.time + 2 + rnd() * 4; }
    if (p.mood && w.time > p.moodUntil) p.mood = undefined;
    // Chasing the ball beats everything except sleep.
    if (w.ball && !w.ball.caughtBy && p.mode !== "sleep") {
      p.mode = "chase";
      const dx = w.ball.x - p.x;
      p.facing = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) > 8) p.vx = Math.sign(dx) * SPEED.chase;
      else {
        p.vx = 0;
        if (w.ball.y < 10) {
          w.ball.caughtBy = p.id; w.ball.caughtAt = w.time;
          // The others give up and wander off, each their own way.
          for (const other of w.pets) if (other !== p && other.mode === "chase") { setMode(other, "walk", w.time, rnd); other.facing = rnd() < 0.5 ? 1 : -1; other.vx = SPEED.walk * other.facing; }
          p.mood = "happy"; p.moodUntil = w.time + 2.5;
          jump(p, 150);
          puff(w, "heart", p.x, 40, rnd, 3);
        }
      }
    } else if (p.mode === "chase") setMode(p, "idle", w.time, rnd);
    else if (w.time > p.until) setMode(p, nextMode(p, w, rnd), w.time, rnd);

    // Walking, and turning around at the edges.
    if (p.vx) {
      p.x += p.vx * dt;
      if (p.x < w.margin) { p.x = w.margin; p.facing = 1; if (p.mode !== "chase") p.vx = Math.abs(p.vx); }
      if (p.x > w.width - w.margin) { p.x = w.width - w.margin; p.facing = -1; if (p.mode !== "chase") p.vx = -Math.abs(p.vx); }
      p.phase += Math.abs(p.vx) * dt * 0.28;
    }
    if (p.mode === "sleep" && rnd() < dt * 0.6) puff(w, "zzz", p.x + p.facing * 10, 26, rnd);
  }
  // A little personal space: resting or strolling pets that overlap drift apart (not while chasing).
  for (const p of w.pets) for (const q of w.pets) {
    if (p === q || p.mode === "chase" || p.mode === "run" || p.jump > 0) continue;
    const d = p.x - q.x;
    if (Math.abs(d) < w.spacing) p.x = Math.min(w.width - w.margin, Math.max(w.margin, p.x + (d === 0 ? (p.id < q.id ? -1 : 1) : Math.sign(d)) * 18 * dt));
  }
  w.effects = w.effects.filter(e => w.time - e.born < e.life);
  for (const e of w.effects) { e.x += e.vx * dt; e.y -= e.vy * dt * 0.6; }
}

// ---------- Things that happen ----------

export function throwBall(w: World, x: number, y: number, vx: number, vy: number) {
  w.ball = { x: Math.max(6, Math.min(w.width - 6, x)), y: Math.max(0, y), vx, vy, restingSince: w.time };
  for (const p of w.pets) if (p.mode === "sleep") p.mode = "idle";
}
export function petPet(w: World, id: string, rnd: () => number) {
  const p = w.pets.find(x => x.id === id);
  if (!p) return;
  p.mood = "happy"; p.moodUntil = w.time + 2.5;
  if (p.mode === "sleep") setMode(p, "sit", w.time, rnd);
  jump(p, 140);
  puff(w, "heart", p.x, 40, rnd, 3);
}
/** You saved a file: a happy hop. */
export function cheer(w: World, rnd: () => number) {
  for (const p of w.pets) if (p.mode !== "sleep") { jump(p, 120 + rnd() * 40); puff(w, "star", p.x, 40, rnd, 1); }
}
/** New errors appeared: the pets stop and look worried. */
export function worry(w: World, rnd: () => number) {
  for (const p of w.pets) if (p.mode !== "sleep") { p.mood = "worried"; p.moodUntil = w.time + 3; setMode(p, "sit", w.time, rnd); puff(w, "bang", p.x, 46, rnd); }
}
/** The last error is fixed: a celebration. */
export function party(w: World, rnd: () => number) {
  for (const p of w.pets) { if (p.mode === "sleep") p.mode = "idle"; p.mood = "happy"; p.moodUntil = w.time + 3; jump(p, 190); puff(w, "star", p.x, 40, rnd, 4); }
}
/** You're typing: sleepy pets wake up. */
export function activity(w: World, rnd: () => number) {
  w.lastActivity = w.time;
  for (const p of w.pets) if (p.mode === "sleep") setMode(p, "sit", w.time, rnd);
}

/** The pet under a point (x from the left, y up from the ground), if any. */
export function petAt(w: World, x: number, y: number, scale: number): Pet | undefined {
  return [...w.pets].reverse().find(p => Math.abs(p.x - x) < 18 * scale && y - p.jump >= -4 && y - p.jump < 40 * scale);
}

const NAMES = ["Mochi", "Biscuit", "Pixel", "Luna", "Nugget", "Maple", "Pepper", "Tofu", "Cookie", "Ziggy", "Peanut", "Sushi", "Waffles", "Bean", "Noodle", "Juniper", "Pudding", "Momo", "Kiwi", "Clover"];
/** A name that none of the other pets have yet. */
export function freshName(taken: string[], rnd: () => number): string {
  const free = NAMES.filter(n => !taken.includes(n));
  if (free.length) return free[Math.floor(rnd() * free.length)];
  return `${NAMES[Math.floor(rnd() * NAMES.length)]} ${taken.length + 1}`;
}
