/* Veyra Code Garden: the rules of the garden, with no VS Code or drawing in them, so they can be tested.
   Coding grows the plants, saving waters them, fixing errors brings butterflies and committing makes buds bloom.
   Nothing ever dies: a dry garden only droops and grows more slowly until the next save. */

export type SpeciesId = "daisy" | "tulip" | "sunflower" | "lavender" | "cactus" | "mushroom" | "rose" | "cherry" | "veyra";

export interface Species {
  id: SpeciesId;
  name: string;
  /** How it's unlocked, in plain words. */
  how: string;
  /** Growth points to reach each stage: sprout, leaves, bud, bloom. Bigger plants take longer. */
  stages: [number, number, number, number];
  unlocked: (g: Garden) => boolean;
}

export const SPECIES: Species[] = [
  { id: "daisy", name: "Daisy", how: "Your first flower", stages: [3, 10, 22, 36], unlocked: () => true },
  { id: "tulip", name: "Tulip", how: "Code on 2 days in a row", stages: [3, 11, 24, 40], unlocked: g => g.streak.best >= 2 },
  { id: "sunflower", name: "Sunflower", how: "Code for 3 hours in total", stages: [4, 14, 30, 52], unlocked: g => g.totals.minutes >= 180 },
  { id: "lavender", name: "Lavender", how: "Save 100 times", stages: [3, 12, 26, 44], unlocked: g => g.totals.saves >= 100 },
  { id: "cactus", name: "Cactus", how: "Fix 10 errors (it thrives on trouble)", stages: [4, 14, 30, 50], unlocked: g => g.totals.fixes >= 10 },
  { id: "mushroom", name: "Glow Mushroom", how: "Code for an hour after 10 pm", stages: [2, 8, 18, 30], unlocked: g => g.totals.nightMinutes >= 60 },
  { id: "rose", name: "Rose", how: "Make 15 commits", stages: [4, 15, 32, 56], unlocked: g => g.totals.commits >= 15 },
  { id: "cherry", name: "Cherry Blossom", how: "Code on 7 days in a row", stages: [6, 20, 44, 80], unlocked: g => g.streak.best >= 7 },
  { id: "veyra", name: "Veyra Bloom", how: "Code on 30 days in a row, or press 40 flowers", stages: [8, 26, 56, 100], unlocked: g => g.streak.best >= 30 || pressedTotal(g) >= 40 },
];
export const species = (id: SpeciesId) => SPECIES.find(s => s.id === id)!;

export interface Plant {
  id: string;
  species: SpeciesId;
  /** Where it stands, 0 (left) to 1 (right). */
  x: number;
  growth: number;
  planted: number;
  /** Growth gathered after it bloomed: once it's been in bloom a while and the garden is full, it's pressed. */
  afterBloom: number;
}

export interface Garden {
  v: 1;
  plants: Plant[];
  /** Soil moisture, 0 (dry) to 1 (just watered). */
  moisture: number;
  /** When the moisture was last brought up to date. */
  checked: number;
  totals: { minutes: number; nightMinutes: number; saves: number; fixes: number; commits: number; sprouts: number };
  streak: { days: number; best: number; last: string };
  /** Flowers pressed into the herbarium, by species. */
  pressed: Partial<Record<SpeciesId, number>>;
  /** Species already announced as unlocked. */
  known: SpeciesId[];
  /** The species the next seed will be, if chosen. */
  nextSeed?: SpeciesId;
  created: number;
}

/** What happened, for the view's little celebrations and the notifications. */
export type Event =
  | { type: "sprout"; plant: Plant }
  | { type: "bloom"; plant: Plant }
  | { type: "pressed"; species: SpeciesId }
  | { type: "unlock"; species: SpeciesId }
  | { type: "streak"; days: number }
  | { type: "rain" }
  | { type: "butterflies"; count: number }
  | { type: "sparkle"; plant: Plant };

export const MAX_PLANTS = 12;
/** A new seed sprouts after this many minutes of coding. */
export const MINUTES_PER_SPROUT = 20;
/** How long a fully watered garden takes to dry out. */
export const DRY_AFTER_MS = 10 * 60 * 60 * 1000;
/** Growth a bloom gathers before it can be pressed to make room. */
const PRESS_AFTER = 30;

/** A small repeatable random source (mulberry32), so tests can replay a garden exactly. */
export function random(seed = Date.now()): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The local calendar day, as "2026-11-15". */
export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number), [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

export function pressedTotal(g: Garden): number {
  return Object.values(g.pressed).reduce((a, n) => a + (n ?? 0), 0);
}

/** 0 seed, 1 sprout, 2 leaves, 3 bud, 4 bloom. */
export function stageOf(p: Plant): number {
  const s = species(p.species).stages;
  let stage = 0;
  for (const need of s) if (p.growth >= need) stage++;
  return stage;
}
export const STAGE_NAMES = ["Seed", "Sprout", "Leaves", "Bud", "In bloom"];

/** A new garden, with one daisy seed already in the soil. */
export function newGarden(now: number, rnd: () => number): Garden {
  const g: Garden = {
    v: 1, plants: [], moisture: 0.8, checked: now,
    totals: { minutes: 0, nightMinutes: 0, saves: 0, fixes: 0, commits: 0, sprouts: 0 },
    streak: { days: 0, best: 0, last: "" }, pressed: {}, known: ["daisy"], created: now,
  };
  sow(g, "daisy", now, rnd);
  return g;
}

/** Fills in anything an older or damaged saved garden is missing, so the extension never breaks on load. */
export function repair(raw: unknown, now: number, rnd: () => number): Garden {
  const g = (raw && typeof raw === "object" ? raw : {}) as Partial<Garden>;
  if (g.v !== 1 || !Array.isArray(g.plants)) return newGarden(now, rnd);
  const ids = new Set(SPECIES.map(s => s.id));
  return {
    v: 1,
    plants: g.plants.filter(p => p && ids.has(p.species) && Number.isFinite(p.growth)).slice(0, MAX_PLANTS)
      .map(p => ({ ...p, x: clamp(Number(p.x) || 0.5, 0.04, 0.96), afterBloom: Number(p.afterBloom) || 0 })),
    moisture: clamp(Number(g.moisture) || 0, 0, 1),
    checked: Number(g.checked) || now,
    totals: { minutes: 0, nightMinutes: 0, saves: 0, fixes: 0, commits: 0, sprouts: 0, ...g.totals },
    streak: { days: 0, best: 0, last: "", ...g.streak },
    pressed: { ...g.pressed },
    known: Array.isArray(g.known) ? g.known.filter(k => ids.has(k)) : ["daisy"],
    nextSeed: g.nextSeed && ids.has(g.nextSeed) ? g.nextSeed : undefined,
    created: Number(g.created) || now,
  };
}

/** The soil dries a little with every hour that passes. */
export function evaporate(g: Garden, now: number): void {
  const elapsed = Math.max(0, now - g.checked);
  g.moisture = clamp(g.moisture - elapsed / DRY_AFTER_MS, 0, 1);
  g.checked = now;
}

/** How fast plants grow right now: watered soil grows them at full speed, dry soil at half. */
export const growthRate = (g: Garden) => 0.5 + 0.5 * Math.min(1, g.moisture * 2);

/** One more minute of coding: everything grows, the streak counts the day, and every so often a seed sprouts. */
export function codeMinute(g: Garden, now: number, rnd: () => number): Event[] {
  evaporate(g, now);
  const events: Event[] = [];
  g.totals.minutes++;
  const hour = new Date(now).getHours();
  if (hour >= 22 || hour < 5) g.totals.nightMinutes++;

  // The streak: one more day if yesterday was a coding day, a fresh start after a gap.
  const today = dayKey(now);
  if (g.streak.last !== today) {
    const gap = g.streak.last ? daysBetween(g.streak.last, today) : Infinity;
    g.streak.days = gap === 1 ? g.streak.days + 1 : 1;
    g.streak.best = Math.max(g.streak.best, g.streak.days);
    g.streak.last = today;
    if (g.streak.days > 1) events.push({ type: "streak", days: g.streak.days });
  }

  const rate = growthRate(g);
  for (const p of g.plants) events.push(...grow(p, rate));

  if (Math.floor(g.totals.minutes / MINUTES_PER_SPROUT) > g.totals.sprouts) {
    g.totals.sprouts++;
    events.push(...makeRoom(g));
    if (g.plants.length < MAX_PLANTS) {
      const plant = sow(g, g.nextSeed ?? pickSpecies(g, rnd), now, rnd);
      g.nextSeed = undefined;
      events.push({ type: "sprout", plant });
    }
  }
  events.push(...checkUnlocks(g));
  return events;
}

/** Saving waters the garden. */
export function save(g: Garden, now: number, rnd: () => number): Event[] {
  evaporate(g, now);
  const wasDry = g.moisture < 0.35;
  g.moisture = 1;
  g.totals.saves++;
  const events: Event[] = [];
  if (wasDry) events.push({ type: "rain" });
  const young = g.plants.filter(p => stageOf(p) < 4);
  if (young.length) events.push(...grow(young[Math.floor(rnd() * young.length)], 0.5));
  return [...events, ...checkUnlocks(g)];
}

/** The last error was fixed: butterflies visit, and the budding plants get a boost. */
export function fixed(g: Garden, errorsFixed: number): Event[] {
  g.totals.fixes += Math.max(1, errorsFixed);
  const events: Event[] = [{ type: "butterflies", count: Math.min(6, 1 + errorsFixed) }];
  for (const p of g.plants) events.push(...grow(p, 1.5));
  return [...events, ...checkUnlocks(g)];
}

/** A commit: the most grown plant that isn't in bloom yet bursts into flower. */
export function commit(g: Garden): Event[] {
  g.totals.commits++;
  const events: Event[] = [];
  const target = g.plants.filter(p => stageOf(p) < 4).sort((a, b) => progress(b) - progress(a))[0];
  if (target) {
    const need = species(target.species).stages[3];
    target.growth = Math.max(target.growth, need);
    events.push({ type: "sparkle", plant: target }, { type: "bloom", plant: target });
  }
  return [...events, ...checkUnlocks(g)];
}

/** Picks the species of the next sprout, if it's one you've unlocked. */
export function chooseNextSeed(g: Garden, id: SpeciesId): boolean {
  if (!species(id).unlocked(g)) return false;
  g.nextSeed = id;
  return true;
}

/** How far along a plant is, 0 to 1 (1 = in bloom). */
export function progress(p: Plant): number {
  return Math.min(1, p.growth / species(p.species).stages[3]);
}

// ---------- inside the garden ----------

function grow(p: Plant, amount: number): Event[] {
  const before = stageOf(p);
  if (before >= 4) { p.afterBloom += amount; return []; }
  p.growth += amount;
  return stageOf(p) >= 4 ? [{ type: "bloom", plant: p }] : [];
}

/** When the garden is full, the oldest flower that's been in bloom long enough is pressed into the herbarium. */
function makeRoom(g: Garden): Event[] {
  if (g.plants.length < MAX_PLANTS) return [];
  const ready = g.plants.filter(p => stageOf(p) >= 4 && p.afterBloom >= PRESS_AFTER).sort((a, b) => a.planted - b.planted)[0];
  if (!ready) return [];
  g.plants = g.plants.filter(p => p !== ready);
  g.pressed[ready.species] = (g.pressed[ready.species] ?? 0) + 1;
  return [{ type: "pressed", species: ready.species }];
}

/** New species are more likely to be chosen, so a fresh unlock shows up soon. */
function pickSpecies(g: Garden, rnd: () => number): SpeciesId {
  const open = SPECIES.filter(s => s.unlocked(g));
  const weights = open.map(s => (g.plants.some(p => p.species === s.id) ? 1 : 3) * (s.id === "veyra" ? 0.5 : 1));
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < open.length; i++) { r -= weights[i]; if (r <= 0) return open[i].id; }
  return open[open.length - 1].id;
}

/** Puts a seed in the widest gap in the soil, so plants spread out evenly. */
function sow(g: Garden, id: SpeciesId, now: number, rnd: () => number): Plant {
  const xs = [0.02, ...g.plants.map(p => p.x).sort((a, b) => a - b), 0.98];
  let best = 0.5, widest = -1;
  for (let i = 0; i < xs.length - 1; i++) {
    const gap = xs[i + 1] - xs[i];
    if (gap > widest) { widest = gap; best = (xs[i] + xs[i + 1]) / 2; }
  }
  const x = clamp(best + (rnd() - 0.5) * widest * 0.2, 0.06, 0.94);
  const plant: Plant = { id: `${now.toString(36)}${Math.floor(rnd() * 1e6).toString(36)}`, species: id, x, growth: 0, planted: now, afterBloom: 0 };
  g.plants.push(plant);
  return plant;
}

function checkUnlocks(g: Garden): Event[] {
  const events: Event[] = [];
  for (const s of SPECIES) if (!g.known.includes(s.id) && s.unlocked(g)) { g.known.push(s.id); events.push({ type: "unlock", species: s.id }); }
  return events;
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
