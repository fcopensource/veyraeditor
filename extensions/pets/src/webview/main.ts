import { activity, cheer, createWorld, party, petAt, petPet, random, step, syncPets, throwBall, worry, type Effect, type Pet, type PetInfo, type World } from "../model";
import { renderPet, type Pose } from "./draw";

/* The scene: a background, the pets, the ball and little effects, drawn on one canvas and animated. */

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const rnd = random();
const world: World = createWorld(300, 0);
const SIZES: Record<string, number> = { small: 0.8, medium: 1.05, large: 1.4 };
let settings = { background: "meadow", size: "medium", showNames: true };
let W = 300, H = 200, dpr = 1;
let hover: { x: number; y: number } | undefined;
let backdrop: HTMLCanvasElement | undefined;
const ground = () => (settings.background === "plain" ? H - 10 : H - Math.round(16 * Math.min(2, Math.max(1, H / 230))));
// Pets grow with taller panels (the bigger panel), up to twice their size.
const scale = () => (SIZES[settings.size] ?? 1.05) * Math.min(2, Math.max(1, H / 230));

// ---------- Size and background ----------

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = Math.max(120, canvas.clientWidth); H = Math.max(90, canvas.clientHeight);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  world.width = W;
  world.spacing = 40 * scale(); world.margin = 26 * scale();
  for (const p of world.pets) p.x = Math.min(Math.max(p.x, world.margin), W - world.margin);
  backdrop = paintBackdrop();
}
new ResizeObserver(resize).observe(canvas);

/** The still parts of the background, painted once per size or theme. */
function paintBackdrop(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  const gy = ground();
  const sky = (top: string, bottom: string) => { const grad = g.createLinearGradient(0, 0, 0, gy); grad.addColorStop(0, top); grad.addColorStop(1, bottom); g.fillStyle = grad; g.fillRect(0, 0, W, gy + 2); };
  const hills = (color: string, base: number, height: number, seed: number) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, gy);
    for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, gy - base - Math.sin(x / 70 + seed) * height - Math.sin(x / 23 + seed * 2) * height * 0.25);
    g.lineTo(W, gy); g.closePath(); g.fill();
  };
  const pick = random(7);
  if (settings.background === "meadow") {
    sky("#bfe3ff", "#eef8ff");
    const sun = g.createRadialGradient(W - 40, 34, 4, W - 40, 34, 34);
    sun.addColorStop(0, "rgba(255,236,150,1)"); sun.addColorStop(0.35, "rgba(255,226,120,.9)"); sun.addColorStop(1, "rgba(255,226,120,0)");
    g.fillStyle = sun; g.beginPath(); g.arc(W - 40, 34, 34, 0, 7); g.fill();
    hills("#b9e3a0", 18, 8, 1);
    hills("#9fd685", 8, 5, 3);
    g.fillStyle = "#7fc45e"; g.fillRect(0, gy, W, H - gy);
    g.fillStyle = "#6db14f"; g.fillRect(0, gy, W, 3);
    for (let x = 4; x < W; x += 9 + pick() * 14) { // grass tufts and a few flowers
      g.strokeStyle = "#5ea343"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, gy + 1); g.lineTo(x - 2, gy - 4); g.moveTo(x, gy + 1); g.lineTo(x + 1.5, gy - 5); g.stroke();
      if (pick() < 0.18) { g.fillStyle = ["#ffffff", "#ffd6e7", "#fff3a6"][Math.floor(pick() * 3)]; g.beginPath(); g.arc(x + 4, gy + 6 + pick() * 6, 1.6, 0, 7); g.fill(); }
    }
  } else if (settings.background === "night") {
    sky("#151a36", "#2d3768");
    g.fillStyle = "#fdf6d8"; g.beginPath(); g.arc(W - 38, 30, 13, 0, 7); g.fill();
    g.fillStyle = "#2d3768"; g.beginPath(); g.arc(W - 31, 26, 11, 0, 7); g.fill();
    hills("#25304f", 14, 7, 2);
    g.fillStyle = "#26402f"; g.fillRect(0, gy, W, H - gy);
    g.fillStyle = "#1f3527"; g.fillRect(0, gy, W, 3);
  } else if (settings.background === "beach") {
    sky("#9fd6ff", "#e7f6ff");
    g.fillStyle = "#4fb3d9"; g.fillRect(0, gy - 22, W, 22);
    g.fillStyle = "#7ccbe6"; g.fillRect(0, gy - 22, W, 3);
    g.fillStyle = "#f1d9a6"; g.beginPath(); g.moveTo(0, gy - 6); for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, gy - 6 + Math.sin(x / 30) * 2); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = "#e6c98e"; for (let i = 0; i < W / 18; i++) { g.beginPath(); g.arc(pick() * W, gy + 2 + pick() * (H - gy - 4), 0.9, 0, 7); g.fill(); }
  } else {
    const line = getComputedStyle(document.documentElement).getPropertyValue("--vscode-panel-border").trim() || "rgba(128,128,128,.35)";
    g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(8, gy + 0.5); g.lineTo(W - 8, gy + 0.5); g.stroke();
  }
  return c;
}

/** The moving parts of the background: clouds, twinkling stars, waves. */
function paintLive(t: number) {
  const gy = ground();
  if (settings.background === "meadow" || settings.background === "beach") {
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const [i, y, s] of [[0, 22, 1], [1, 40, 0.75], [2, 16, 0.6]] as const) {
      const x = ((t * (4 + i * 2) + i * 170) % (W + 120)) - 60;
      ctx.beginPath(); ctx.ellipse(x, y, 20 * s, 7 * s, 0, 0, 7); ctx.ellipse(x + 12 * s, y - 5 * s, 12 * s, 8 * s, 0, 0, 7); ctx.ellipse(x - 10 * s, y - 3 * s, 10 * s, 6 * s, 0, 0, 7); ctx.fill();
    }
  }
  if (settings.background === "night") {
    const pick = random(11);
    for (let i = 0; i < W / 9; i++) {
      const x = pick() * W, y = pick() * (gy - 30), tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.6 + pick()) + i));
      ctx.globalAlpha = tw; ctx.fillStyle = "#fffbe6"; ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }
  if (settings.background === "beach") {
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1.2;
    for (let row = 0; row < 2; row++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) { const y = gy - 16 + row * 7 + Math.sin(x / 14 + t * 1.6 + row) * 1.4; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
}

// ---------- Drawing the pets and effects ----------

function poseOf(p: Pet): Pose {
  if (p.jump > 0.5) return "jump";
  if (p.mode === "sleep") return "sleep";
  if (p.mode === "sit") return "sit";
  if (p.mode === "run" || (p.mode === "chase" && p.vx)) return "run";
  if (p.mode === "walk") return "walk";
  return "idle";
}

function drawBall(x: number, y: number, t: number) {
  const gy = ground(), r = 5.5 * scale();
  ctx.globalAlpha = 0.18; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(x, gy + 1, r * (1 - Math.min(y, 80) / 160), 1.6, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(x, gy - y - r); ctx.rotate(x / r);
  ctx.fillStyle = "#ff5a5f"; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = r * 0.35; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, -0.6, 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.62, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
  ctx.restore();
  void t;
}

function drawEffect(e: Effect) {
  const age = (world.time - e.born) / e.life;
  const x = e.x, y = ground() - e.y * scale();
  ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age * age); ctx.translate(x, y);
  const s = scale() * (0.8 + age * 0.4);
  if (e.kind === "heart") {
    ctx.scale(s, s); ctx.fillStyle = "#ff5d8f";
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-6, -2, -3, -7, 0, -4); ctx.bezierCurveTo(3, -7, 6, -2, 0, 3); ctx.fill();
  } else if (e.kind === "star") {
    ctx.scale(s, s); ctx.rotate(age * 3); ctx.fillStyle = `hsl(${e.hue ?? 45} 90% 62%)`;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 2 : 4.6, a = (i * Math.PI) / 5; ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r); } ctx.closePath(); ctx.fill();
  } else if (e.kind === "zzz") {
    ctx.fillStyle = settings.background === "night" ? "#dfe6ff" : "#5a6b8c"; ctx.font = `600 ${Math.round(9 * s)}px "Segoe UI", sans-serif`; ctx.fillText("z", 0, 0);
  } else if (e.kind === "bang") {
    ctx.scale(scale(), scale());
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(-5, -9, 10, 11, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f0883e"; ctx.fillRect(-0.9, -7, 1.8, 5); ctx.fillRect(-0.9, -1, 1.8, 1.6);
  }
  ctx.restore();
}

function drawNames() {
  if (!settings.showNames || !hover) return;
  const p = petAt(world, hover.x, ground() - hover.y, scale());
  if (!p) return;
  const x = p.x, y = ground() - p.jump - 46 * scale();
  ctx.font = '600 11px "Segoe UI", sans-serif';
  const w = ctx.measureText(p.name).width + 14;
  ctx.fillStyle = "rgba(20,22,28,.82)"; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 16, w, 18, 9); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(p.name, x, y - 3); ctx.textAlign = "left";
}

let last = performance.now();
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  step(world, dt, rnd);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backdrop) ctx.drawImage(backdrop, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintLive(world.time);
  const gy = ground(), s = scale();
  for (const p of [...world.pets].sort((a, b) => a.x - b.x)) {
    renderPet(ctx, { kind: p.kind, color: p.color, pose: poseOf(p), phase: p.phase, time: world.time + p.id.length, blink: world.time < p.blinkUntil, happy: p.mood === "happy" }, p.x, gy - p.jump, s, p.facing === -1, dpr);
  }
  if (world.ball) drawBall(world.ball.caughtBy ? world.pets.find(p => p.id === world.ball!.caughtBy)?.x ?? world.ball.x : world.ball.x, world.ball.caughtBy ? 22 * s : world.ball.y, world.time);
  for (const e of world.effects) drawEffect(e);
  drawNames();
  requestAnimationFrame(frame);
}

// ---------- Mouse ----------

let press: { x: number; y: number; t: number } | undefined;
const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener("pointermove", e => { hover = local(e); hover = { x: hover.x, y: ground() - hover.y }; canvas.style.cursor = petAt(world, hover.x, hover.y, scale()) ? "pointer" : "grab"; });
canvas.addEventListener("pointerleave", () => { hover = undefined; });
canvas.addEventListener("pointerdown", e => { const p = local(e); press = { ...p, t: performance.now() }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointerup", e => {
  if (!press) return;
  const p = local(e), dx = p.x - press.x, dy = p.y - press.y;
  const target = petAt(world, press.x, ground() - press.y, scale());
  if (Math.hypot(dx, dy) < 6) {
    if (target) petPet(world, target.id, rnd);
    else throwBall(world, press.x, Math.max(20, ground() - press.y), (rnd() - 0.5) * 60, 40);
  } else {
    // Drag to throw: the ball flies the way you dragged.
    const ms = Math.max(60, performance.now() - press.t);
    throwBall(world, p.x, Math.max(10, ground() - p.y), Math.max(-500, Math.min(500, (dx / ms) * 1000 * 0.6)), Math.max(-200, Math.min(420, (-dy / ms) * 1000 * 0.6)));
  }
  press = undefined;
});

// ---------- Messages from the extension ----------

window.addEventListener("message", ({ data: m }) => {
  switch (m.type) {
    case "pets": {
      const changed = m.settings && (m.settings.background !== settings.background || m.settings.size !== settings.size);
      if (m.settings) settings = m.settings;
      world.spacing = 40 * scale(); world.margin = 26 * scale();
      syncPets(world, m.pets as PetInfo[], rnd);
      if (changed) backdrop = paintBackdrop();
      break;
    }
    case "throw": throwBall(world, 10 + rnd() * 30, 60, 160 + rnd() * 120, 160); break;
    case "cheer": cheer(world, rnd); break;
    case "worry": worry(world, rnd); break;
    case "party": party(world, rnd); break;
    case "activity": activity(world, rnd); break;
    case "probe": vscode.postMessage({ type: "probe", pets: world.pets.map(p => ({ id: p.id, name: p.name, kind: p.kind, mode: p.mode, mood: p.mood, x: Math.round(p.x) })), ball: !!world.ball, effects: world.effects.map(e => e.kind), background: settings.background }); break;
  }
});
resize();
requestAnimationFrame(frame);
vscode.postMessage({ type: "ready" });
