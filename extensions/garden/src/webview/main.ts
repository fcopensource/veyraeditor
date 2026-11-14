import { MAX_PLANTS, pressedTotal, progress, random, SPECIES, species, STAGE_NAMES, stageOf, type Event, type Garden, type Plant } from "../model";
import { bee, butterfly, drawPlant, paintClouds, paintGround, paintSky, skyAt, sparkle, type Ctx } from "./draw";

/* The garden scene: sky, soil, plants and visitors on one canvas, plus a small line of stats and a hover card. */

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hud = document.getElementById("hud")!;
const tip = document.getElementById("tip")!;
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rnd = random();

let garden: Garden | undefined;
let sky = "auto";
let W = 300, H = 220, dpr = 1;
const stars: [number, number, number][] = Array.from({ length: 46 }, () => [rnd(), rnd(), 0.6 + rnd() * 0.9]);
const pebbles: [number, number, number][] = Array.from({ length: 22 }, () => [rnd(), rnd(), 0.6 + rnd() * 1.2]);

// ---------- Visitors and celebrations ----------
type Particle = { kind: "drop" | "spark" | "petal" | "leaf"; x: number; y: number; vx: number; vy: number; life: number; max: number; color?: string };
type Flyer = { x: number; y: number; tx: number; ty: number; phase: number; color: string; until: number; kind: "butterfly" | "bee" | "firefly" };
let particles: Particle[] = [];
let flyers: Flyer[] = [];
let banner: { text: string; until: number } | undefined;
const pops = new Map<string, number>(); // plant id -> when it last sprouted or bloomed, for a little bounce
let effectsSeen: string[] = []; // for tests

const ground = () => Math.round(H * 0.7);
const plantScale = () => Math.min(2.2, Math.max(0.9, Math.min(H / 210, W / 260)));
const plantX = (p: Plant) => 14 + p.x * (W - 28);
const plantBase = (p: Plant) => ground() + 8 + ((p.x * 997) % 1) * Math.max(4, (H - ground()) * 0.3);
const seedOf = (p: Plant) => [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = Math.max(160, canvas.clientWidth); H = Math.max(140, canvas.clientHeight);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}
new ResizeObserver(resize).observe(canvas);

function hourNow() {
  if (sky === "day") return 12;
  if (sky === "night") return 23;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// ---------- Drawing ----------
function render(g: Ctx, t: number, w = W, h = H) {
  const hour = hourNow(), s = skyAt(hour), gy = ground();
  paintSky(g, w, gy, s, hour, stars, t);
  paintClouds(g, w, gy, calm ? 0 : t, s.night);
  paintGround(g, w, h, gy, garden?.moisture ?? 0.5, s.night, pebbles);
  if (!garden) return;
  const droop = Math.max(0, 0.3 - garden.moisture) / 0.3; // 0 when watered, 1 when bone dry
  const sorted = [...garden.plants].sort((a, b) => plantBase(a) - plantBase(b));
  for (const p of sorted) {
    const stage = stageOf(p), stages = species(p.species).stages;
    const lo = stage === 0 ? 0 : stages[stage - 1], hi = stage >= 4 ? lo + 1 : stages[stage];
    const popAge = (performance.now() - (pops.get(p.id) ?? -1e9)) / 1000;
    const bounce = popAge < 0.6 ? 1 + Math.sin(popAge * Math.PI / 0.6) * 0.18 : 1;
    const seed = seedOf(p);
    drawPlant(g, {
      species: p.species, stage, frac: Math.min(1, (p.growth - lo) / Math.max(1, hi - lo)), x: plantX(p), base: plantBase(p),
      scale: plantScale() * bounce, sway: calm ? 0 : Math.sin(t * 1.3 + seed) * (1 + droop * 0.2), droop: droop * (seed % 2 ? 1 : -1), night: s.night, t, seed,
    });
  }
}

function frame(now: number) {
  const t = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(ctx, t);
  if (garden) { visitors(t); drawEffects(t); }
  requestAnimationFrame(frame);
}

/** Butterflies after a fix, bees on sunny watered days, fireflies at night. */
function visitors(t: number) {
  const s = skyAt(hourNow()), now = performance.now();
  if (!calm) {
    const want = (kind: Flyer["kind"], n: number) => { while (flyers.filter(f => f.kind === kind && f.until > now).length < n) flyers.push(newFlyer(kind, now + 1e9)); };
    if (s.night > 0.6) want("firefly", Math.min(8, 3 + Math.floor(W / 90)));
    else if (garden!.moisture > 0.5 && garden!.plants.some(p => stageOf(p) >= 4)) want("bee", 1);
  }
  flyers = flyers.filter(f => f.until > now && !(f.kind === "firefly" && s.night <= 0.6) && !(f.kind === "bee" && (s.night > 0.6 || garden!.moisture <= 0.5)));
  for (const f of flyers) {
    if (Math.hypot(f.tx - f.x, f.ty - f.y) < 6) { f.tx = 20 + rnd() * (W - 40); f.ty = 20 + rnd() * (ground() + 10); }
    const speed = f.kind === "firefly" ? 0.012 : 0.02;
    f.x += (f.tx - f.x) * speed + Math.sin(t * 3 + f.phase) * 0.6; f.y += (f.ty - f.y) * speed + Math.cos(t * 2.4 + f.phase) * 0.5;
    if (f.kind === "butterfly") butterfly(ctx, f.x, f.y, t * 14 + f.phase, f.color, Math.max(1, plantScale() * 0.9));
    else if (f.kind === "bee") bee(ctx, f.x, f.y, t * 40);
    else { const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + f.phase)); const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 7); glow.addColorStop(0, `rgba(230,255,140,${a})`); glow.addColorStop(1, "rgba(230,255,140,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, 7); ctx.fill(); }
  }
}
function newFlyer(kind: Flyer["kind"], until: number): Flyer {
  const colors = ["#ff8fb1", "#ffd166", "#8fd3ff", "#c39bff", "#ffffff", "#ffa94d"];
  const fromEdge = kind === "butterfly";
  return { kind, until, phase: rnd() * 10, color: colors[Math.floor(rnd() * colors.length)],
    x: fromEdge ? (rnd() < 0.5 ? -10 : W + 10) : rnd() * W, y: fromEdge ? 20 + rnd() * ground() * 0.6 : rnd() * ground(),
    tx: 20 + rnd() * (W - 40), ty: 20 + rnd() * ground() };
}

function drawEffects(t: number) {
  particles = particles.filter(p => p.life < p.max);
  for (const p of particles) {
    p.life += 1 / 60; p.x += p.vx; p.y += p.vy;
    const a = 1 - p.life / p.max;
    if (p.kind === "drop") { p.vy += 0.15; if (p.y > ground() + 8) p.life = p.max; ctx.strokeStyle = `rgba(140,200,255,${a})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx, p.y - 6); ctx.stroke(); }
    else if (p.kind === "spark") sparkle(ctx, p.x, p.y, 2.2, a, p.color);
    else if (p.kind === "petal") { p.vx = Math.sin(t * 2 + p.max) * 0.5; ctx.fillStyle = `rgba(255,170,195,${a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 2.6, 1.6, t * 2, 0, 7); ctx.fill(); }
    else { p.vy += 0.04; ctx.fillStyle = `rgba(120,200,90,${a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3, 1.6, p.life * 6, 0, 7); ctx.fill(); }
  }
  // Cherry trees in bloom drop a petal now and then.
  if (!calm) for (const p of garden!.plants) if (p.species === "cherry" && stageOf(p) >= 4 && rnd() < 0.02) particles.push({ kind: "petal", x: plantX(p) + (rnd() - 0.5) * 40, y: plantBase(p) - 60 * plantScale(), vx: 0, vy: 0.4 + rnd() * 0.3, life: 0, max: 4 + rnd() * 3 });
  if (banner && banner.until > performance.now()) {
    const a = Math.min(1, (banner.until - performance.now()) / 600);
    ctx.save(); ctx.globalAlpha = a; ctx.font = `600 ${Math.max(12, Math.min(16, W / 22))}px system-ui, sans-serif`; ctx.textAlign = "center";
    const tw = ctx.measureText(banner.text).width + 26, bx = W / 2 - tw / 2, by = ground() * 0.42;
    ctx.fillStyle = "rgba(20,16,38,.82)"; ctx.beginPath(); ctx.roundRect(bx, by - 18, tw, 30, 15); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(banner.text, W / 2, by + 2); ctx.restore();
  }
}

/** Plays the little celebration for each thing that happened. */
function celebrate(events: Event[]) {
  const now = performance.now();
  for (const e of events) {
    effectsSeen.push(e.type);
    if (e.type === "rain") for (let i = 0; i < (calm ? 0 : 70); i++) particles.push({ kind: "drop", x: rnd() * W, y: -rnd() * 80, vx: -0.4, vy: 3 + rnd() * 2, life: 0, max: 3 });
    else if (e.type === "butterflies") { for (let i = 0; i < e.count; i++) flyers.push(newFlyer("butterfly", now + 18000 + i * 1500)); banner = { text: "Bug fixed! Butterflies are here 🦋", until: now + 3500 }; }
    else if (e.type === "sprout" || e.type === "bloom" || e.type === "sparkle") {
      pops.set(e.plant.id, now);
      const x = plantX(e.plant), y = plantBase(e.plant) - (e.type === "sprout" ? 6 : 34 * plantScale());
      const n = calm ? 0 : e.type === "sprout" ? 6 : 12;
      for (let i = 0; i < n; i++) particles.push({ kind: e.type === "sprout" ? "leaf" : "spark", x, y, vx: (rnd() - 0.5) * 2.4, vy: -1 - rnd() * 1.6, life: 0, max: 1.2 + rnd() * 0.6, color: e.type === "sprout" ? undefined : rnd() < 0.5 ? "255,226,140" : "255,190,220" });
      if (e.type === "sprout") banner = { text: `A ${species(e.plant.species).name} sprouted 🌱`, until: now + 2600 };
    }
    else if (e.type === "unlock") banner = { text: `New plant unlocked: ${species(e.species).name} ✨`, until: now + 4000 };
    else if (e.type === "streak") banner = { text: `${e.days}-day streak 🔥`, until: now + 3000 };
    else if (e.type === "pressed") banner = { text: `A ${species(e.species).name} was pressed into your collection 📖`, until: now + 3000 };
  }
  effectsSeen = effectsSeen.slice(-30);
}

// ---------- Stats line, hover card and the accessible description ----------
function updateHud() {
  if (!garden) return;
  const blooms = garden.plants.filter(p => stageOf(p) >= 4).length;
  const water = Math.round(garden.moisture * 100);
  hud.innerHTML = `<span title="Days in a row with some coding">🔥 ${garden.streak.days}</span><span title="Plants in bloom">🌼 ${blooms}/${garden.plants.length}</span><span title="Flowers pressed into your collection">📖 ${pressedTotal(garden)}</span><span title="Soil moisture. Saving a file waters it.">💧 ${water}%</span>`;
  const next = 20 - (garden.totals.minutes % 20);
  canvas.setAttribute("aria-label", `Your code garden: ${garden.plants.length} of ${MAX_PLANTS} plants, ${blooms} in bloom, a ${garden.streak.days}-day coding streak, ${pressedTotal(garden)} pressed flowers, soil ${water}% watered. The next seed sprouts in ${next} minutes of coding.`);
}

canvas.addEventListener("pointermove", e => {
  if (!garden) return;
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = garden.plants.map(p => ({ p, d: Math.abs(plantX(p) - x) })).filter(({ p, d }) => d < 16 * plantScale() && y < plantBase(p) + 8 && y > plantBase(p) - 90 * plantScale()).sort((a, b) => a.d - b.d)[0]?.p;
  if (!hit) { tip.hidden = true; return; }
  const stage = stageOf(hit), pct = Math.round(progress(hit) * 100);
  const days = Math.floor((Date.now() - hit.planted) / 86400000);
  tip.innerHTML = `<b>${species(hit.species).name}</b><span>${STAGE_NAMES[stage]}${stage < 4 ? ` · ${pct}%` : ""}</span><i style="--p:${pct}%"></i><small>Planted ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}</small>`;
  tip.hidden = false;
  tip.style.left = `${Math.min(W - tip.offsetWidth - 6, Math.max(6, x - tip.offsetWidth / 2))}px`;
  tip.style.top = `${Math.max(30, y - tip.offsetHeight - 14)}px`;
});
canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
// A click on the soil sprinkles a little water, just for fun (it doesn't change the garden).
canvas.addEventListener("click", e => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
  for (let i = 0; i < (calm ? 0 : 14); i++) particles.push({ kind: "drop", x: x + (rnd() - 0.5) * 30, y: e.clientY - r.top - 40 - rnd() * 30, vx: 0, vy: 2 + rnd() * 2, life: 0, max: 2 });
});

/** A picture to share: the garden at twice the size, with a caption. */
function snapshot(): string {
  const scale = 2, capH = 46;
  const c = document.createElement("canvas");
  c.width = W * scale; c.height = (H + capH) * scale;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  render(g, performance.now() / 1000);
  g.fillStyle = "#14121f"; g.fillRect(0, H, W, capH);
  const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, "#f0a540"); grad.addColorStop(0.5, "#ec5f74"); grad.addColorStop(1, "#9558ec");
  g.fillStyle = grad; g.fillRect(0, H, W, 2);
  const blooms = garden ? garden.plants.filter(p => stageOf(p) >= 4).length : 0;
  g.fillStyle = "#ffffff"; g.font = "600 13px system-ui, sans-serif"; g.textAlign = "left";
  g.fillText(`My Code Garden · ${garden?.streak.days ?? 0}-day streak · ${blooms} in bloom · ${garden?.known.length ?? 1}/${SPECIES.length} species`, 12, H + 21);
  g.fillStyle = "#a8a3bd"; g.font = "11px system-ui, sans-serif"; g.fillText("Grown by coding in VS Code · Code Garden Veyra", 12, H + 37);
  return c.toDataURL("image/png");
}

window.addEventListener("message", ev => {
  const m = ev.data;
  if (m?.type === "garden") { garden = m.garden; sky = m.settings?.sky ?? "auto"; updateHud(); }
  else if (m?.type === "events") celebrate(m.events);
  else if (m?.type === "snapshot") vscode.postMessage({ type: "snapshot", dataUrl: snapshot() });
  else if (m?.type === "probe") vscode.postMessage({ type: "probe", state: {
    plants: garden?.plants.map(p => ({ species: p.species, stage: stageOf(p) })) ?? [], moisture: garden?.moisture,
    effects: effectsSeen, butterflies: flyers.filter(f => f.kind === "butterfly" && f.until > performance.now()).length, hud: hud.textContent, size: [W, H],
  } });
});

resize();
requestAnimationFrame(frame);
vscode.postMessage({ type: "ready" });
