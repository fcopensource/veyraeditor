import type { SpeciesId } from "../model";

/* Everything in the garden is drawn here with canvas paths: the sky for the time of day, the soil, and nine
   species in five stages each (seed, sprout, leaves, bud, bloom). Plants sway in the breeze and droop when dry. */

export type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

// ---------- Sky ----------

export type Sky = { top: string; bottom: string; night: number; sun: string; glow: string };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, "0")).join("");
}
const KEYS: [number, string, string, number][] = [ // hour, sky top, sky bottom, how much it's night
  [0, "#070a1f", "#1a1f45", 1], [5, "#141a40", "#3b2f5c", 0.9], [6.5, "#f6a37a", "#fde3c0", 0.25], [8, "#8cc8f5", "#e2f3ff", 0],
  [16.5, "#86c3f2", "#e6f4ff", 0], [18.5, "#5a4f9e", "#ff9f7a", 0.3], [20, "#191c45", "#3b2a5a", 0.85], [24, "#070a1f", "#1a1f45", 1],
];
/** The sky at a given hour of the day (0 to 24, with fractions). */
export function skyAt(hour: number): Sky {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const [h0, t0, b0, n0] = KEYS[i], [h1, t1, b1, n1] = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (hour - h0) / (h1 - h0)));
  const night = lerp(n0, n1, t);
  return { top: mix(t0, t1, t), bottom: mix(b0, b1, t), night, sun: night > 0.5 ? "#f4f1ff" : "#ffe08a", glow: night > 0.5 ? "rgba(220,225,255,.35)" : "rgba(255,214,120,.5)" };
}

export function paintSky(g: Ctx, W: number, ground: number, sky: Sky, hour: number, stars: [number, number, number][], t: number) {
  const grad = g.createLinearGradient(0, 0, 0, ground);
  grad.addColorStop(0, sky.top); grad.addColorStop(1, sky.bottom);
  g.fillStyle = grad; g.fillRect(0, 0, W, ground + 2);
  if (sky.night > 0.3) {
    g.save(); g.globalAlpha = Math.min(1, (sky.night - 0.3) * 1.6);
    for (const [x, y, s] of stars) { g.globalAlpha *= 1; g.fillStyle = `rgba(255,255,255,${0.45 + 0.45 * Math.sin(t * 1.6 + s * 40)})`; g.fillRect(x * W, y * ground * 0.8, s * 1.8, s * 1.8); }
    g.restore();
  }
  // The sun by day, the moon by night, moving across the sky.
  const isNight = sky.night > 0.5;
  const span = isNight ? ((hour + 24 - 19) % 24) / 11 : (hour - 6) / 13;
  const p = Math.min(1, Math.max(0, span));
  const cx = W * (0.12 + 0.76 * p), cy = ground * (0.75 - Math.sin(p * Math.PI) * 0.55);
  const r = Math.max(9, Math.min(18, W / 22));
  const halo = g.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 3);
  halo.addColorStop(0, sky.glow); halo.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, r * 3, 0, TAU); g.fill();
  g.fillStyle = sky.sun; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  if (isNight) { g.fillStyle = sky.top; g.beginPath(); g.arc(cx + r * 0.45, cy - r * 0.2, r * 0.85, 0, TAU); g.fill(); }
}

export function paintClouds(g: Ctx, W: number, ground: number, t: number, night: number) {
  if (night > 0.7) return;
  g.save(); g.globalAlpha = 0.75 * (1 - night);
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 3; i++) {
    const x = ((t * (6 + i * 3) + i * 170) % (W + 160)) - 80, y = ground * (0.18 + i * 0.13), s = 0.7 + i * 0.25;
    g.beginPath(); g.ellipse(x, y, 26 * s, 9 * s, 0, 0, TAU); g.ellipse(x + 16 * s, y - 6 * s, 16 * s, 10 * s, 0, 0, TAU); g.ellipse(x - 14 * s, y - 3 * s, 13 * s, 8 * s, 0, 0, TAU); g.fill();
  }
  g.restore();
}

/** The hills, fence and soil bed. The soil darkens when it's watered. */
export function paintGround(g: Ctx, W: number, H: number, ground: number, moisture: number, night: number, pebbles: [number, number, number][]) {
  const dim = (c: string) => mix(c, "#0c0f24", night * 0.55);
  const hill = (color: string, base: number, amp: number, seed: number) => {
    g.fillStyle = dim(color); g.beginPath(); g.moveTo(0, ground);
    for (let x = 0; x <= W + 20; x += 18) g.lineTo(x, ground - base - Math.sin(x / 80 + seed) * amp - Math.sin(x / 31 + seed * 2) * amp * 0.3);
    g.lineTo(W, ground); g.closePath(); g.fill();
  };
  hill("#a6d98f", ground * 0.16, ground * 0.05, 1.3);
  hill("#8acb72", ground * 0.08, ground * 0.035, 4.1);
  // A low wooden fence behind the bed.
  const fy = ground - Math.max(14, ground * 0.11);
  g.fillStyle = dim("#c99a62");
  g.fillRect(0, fy + 3, W, 3); g.fillRect(0, fy + 11, W, 3);
  for (let x = 8; x < W; x += 26) { g.fillRect(x, fy, 5, ground - fy); g.beginPath(); g.moveTo(x, fy); g.lineTo(x + 2.5, fy - 4); g.lineTo(x + 5, fy); g.fill(); }
  // Grass edge and the soil, darker and glossier the wetter it is.
  g.fillStyle = dim("#6fbf55"); g.fillRect(0, ground - 3, W, 5);
  const soil = g.createLinearGradient(0, ground, 0, H);
  soil.addColorStop(0, dim(mix("#a9784a", "#5d3b22", moisture))); soil.addColorStop(1, dim(mix("#8b5f38", "#3f2614", moisture)));
  g.fillStyle = soil; g.fillRect(0, ground + 2, W, H - ground);
  for (const [x, y, s] of pebbles) { g.fillStyle = dim(mix("#c8a57c", "#7b5536", moisture)); g.beginPath(); g.ellipse(x * W, ground + 6 + y * (H - ground - 10), s * 2.2, s * 1.4, 0, 0, TAU); g.fill(); }
  if (moisture > 0.6) { // a little shine on wet soil
    g.fillStyle = `rgba(255,255,255,${(moisture - 0.6) * 0.12})`;
    for (let x = 10; x < W; x += 47) g.fillRect(x, ground + 5 + ((x * 7) % (H - ground - 10)), 14, 1.5);
  }
}

// ---------- Plants ----------

export type PlantPose = { species: SpeciesId; stage: number; frac: number; x: number; base: number; scale: number; sway: number; droop: number; night: number; t: number; seed: number };

/** Draws one plant with its base at (x, base). `frac` is progress within the current stage (0 to 1). */
export function drawPlant(g: Ctx, p: PlantPose) {
  g.save();
  g.translate(p.x, p.base);
  g.scale(p.scale, p.scale);
  if (p.stage === 0) { seed(g, p); g.restore(); return; }
  g.rotate(p.sway * 0.06 + p.droop * 0.28);
  const draw = SPECIES_DRAW[p.species];
  draw(g, p);
  g.restore();
}

function seed(g: Ctx, p: PlantPose) {
  g.fillStyle = "#6a4426"; g.beginPath(); g.ellipse(0, 0, 10, 4, 0, Math.PI, 0); g.fill();
  g.fillStyle = "#e9d2a0"; g.beginPath(); g.ellipse(0, -2.5, 3, 2, 0.4, 0, TAU); g.fill();
  if (p.frac > 0.5) { g.strokeStyle = "#7cc35a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -3); g.quadraticCurveTo(1, -6, 3, -7); g.stroke(); }
}

const LEAF = "#5fae45", LEAF_DARK = "#468f34";
function stem(g: Ctx, height: number, bend: number, color = "#5a9e3f", width = 2.4) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round";
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(bend, -height * 0.55, bend * 0.4, -height); g.stroke();
}
function leaf(g: Ctx, x: number, y: number, len: number, angle: number, color = LEAF) {
  g.save(); g.translate(x, y); g.rotate(angle);
  g.fillStyle = color; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0); g.fill();
  g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.85, 0); g.stroke();
  g.restore();
}
/** The green part most flowers share: a stem with leaves that fill in as it grows. */
function greens(g: Ctx, p: PlantPose, height: number) {
  const h = p.stage === 1 ? height * (0.25 + 0.15 * p.frac) : p.stage === 2 ? height * (0.55 + 0.3 * p.frac) : height;
  stem(g, h, 3 + p.sway);
  if (p.stage === 1) { leaf(g, 0, -h, 7, -2.5); leaf(g, 0, -h, 7, -0.6); return h; }
  leaf(g, 0, -h * 0.25, 11, -2.7, LEAF_DARK); leaf(g, 0, -h * 0.35, 12, -0.45);
  if (p.stage >= 3 || p.frac > 0.5) { leaf(g, 1, -h * 0.58, 9, -2.4); leaf(g, 1, -h * 0.62, 9, -0.7, LEAF_DARK); }
  return h;
}
function bud(g: Ctx, y: number, color: string, size = 5) {
  g.fillStyle = LEAF_DARK; g.beginPath(); g.ellipse(0, y + size * 0.5, size * 0.75, size * 0.55, 0, 0, TAU); g.fill();
  g.fillStyle = color; g.beginPath(); g.ellipse(0, y - size * 0.3, size * 0.6, size, 0, 0, TAU); g.fill();
}
function petalRing(g: Ctx, y: number, count: number, len: number, wid: number, color: string, rot = 0) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) { const a = rot + (i / count) * TAU; g.beginPath(); g.ellipse(Math.cos(a) * len * 0.55, y + Math.sin(a) * len * 0.55, len * 0.55, wid, a, 0, TAU); g.fill(); }
}

const SPECIES_DRAW: Record<SpeciesId, (g: Ctx, p: PlantPose) => void> = {
  daisy(g, p) {
    const h = greens(g, p, 34);
    if (p.stage === 3) bud(g, -h, "#ffffff", 4.5);
    if (p.stage === 4) { petalRing(g, -h, 12, 13, 2.6, "#ffffff", p.t * 0.05); g.fillStyle = "#ffcc33"; g.beginPath(); g.arc(0, -h, 4.2, 0, TAU); g.fill(); g.fillStyle = "#f0a020"; g.beginPath(); g.arc(1, -h + 1, 2, 0, TAU); g.fill(); }
  },
  tulip(g, p) {
    const h = greens(g, p, 38);
    if (p.stage === 3) bud(g, -h, "#ff6b8b", 5);
    if (p.stage === 4) {
      const colors = ["#ff5a7a", "#ffb347", "#c77dff"]; const c = colors[p.seed % colors.length];
      g.fillStyle = c;
      g.beginPath(); g.moveTo(-8, -h - 2); g.quadraticCurveTo(-9, -h - 16, -4, -h - 19); g.lineTo(-2, -h - 12); g.lineTo(0, -h - 20); g.lineTo(2, -h - 12); g.lineTo(4, -h - 19); g.quadraticCurveTo(9, -h - 16, 8, -h - 2); g.quadraticCurveTo(0, -h + 4, -8, -h - 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.ellipse(-3, -h - 9, 2, 6, 0.2, 0, TAU); g.fill();
    }
  },
  sunflower(g, p) {
    const h = greens(g, p, 62);
    if (p.stage >= 3) { leaf(g, 1, -h * 0.8, 13, -2.6); leaf(g, 1, -h * 0.84, 13, -0.5); }
    if (p.stage === 3) bud(g, -h, "#7fbf4a", 7);
    if (p.stage === 4) {
      g.save(); g.translate(0, -h); g.rotate(0.15 + Math.sin(p.t * 0.3) * 0.05);
      petalRing(g, 0, 18, 22, 3.6, "#ffc21a", 0); petalRing(g, 0, 18, 18, 3, "#ffd84d", 0.17);
      g.fillStyle = "#6b3e1e"; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
      g.fillStyle = "#3d2210"; for (let i = 0; i < 16; i++) { const a = i * 2.4, r = Math.sqrt(i) * 1.7; g.fillRect(Math.cos(a) * r - 0.6, Math.sin(a) * r - 0.6, 1.2, 1.2); }
      g.restore();
    }
  },
  lavender(g, p) {
    const stems = p.stage === 1 ? 2 : p.stage === 2 ? 3 : 5;
    const h = (p.stage === 1 ? 14 : p.stage === 2 ? 26 : 40) * (0.85 + 0.15 * p.frac);
    for (let i = 0; i < stems; i++) {
      const a = (i - (stems - 1) / 2) * 0.16;
      g.save(); g.rotate(a); stem(g, h, 1, "#6a9e57", 1.6);
      if (p.stage >= 3) {
        const color = p.stage === 4 ? "#9b6ad6" : "#b9a3d6";
        for (let j = 0; j < 7; j++) { g.fillStyle = j % 2 ? color : "#8656c4"; g.beginPath(); g.ellipse(((j % 2) - 0.5) * 2.4, -h + j * 2.6, 2, 2.6, 0, 0, TAU); g.fill(); }
      }
      g.restore();
    }
    leaf(g, 0, -3, 10, -2.9, LEAF_DARK); leaf(g, 0, -3, 10, -0.25, LEAF_DARK);
  },
  cactus(g, p) {
    const h = (p.stage === 1 ? 10 : p.stage === 2 ? 22 : 34) * (0.8 + 0.2 * p.frac), w = p.stage === 1 ? 6 : 9;
    g.fillStyle = "#c4693f"; g.fillRect(-11, -4, 22, 8); g.fillStyle = "#a9552f"; g.fillRect(-12, -6, 24, 3); // a little pot
    g.translate(0, -5);
    const body = (x: number, y: number, ww: number, hh: number) => { g.fillStyle = "#4fa66a"; g.beginPath(); g.roundRect(x - ww, y - hh, ww * 2, hh, [ww, ww, 2, 2]); g.fill(); g.strokeStyle = "#3d8a55"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - hh + 2); g.lineTo(x, y); g.stroke(); };
    body(0, 0, w, h);
    if (p.stage >= 2) { body(-w - 4, -h * 0.35, 3.5, h * 0.35); g.fillStyle = "#4fa66a"; g.fillRect(-w - 2, -h * 0.4, 4, 3.5); }
    if (p.stage >= 3) { body(w + 4, -h * 0.5, 3.5, h * 0.3); g.fillStyle = "#4fa66a"; g.fillRect(w - 2, -h * 0.55, 4, 3.5); }
    g.strokeStyle = "#e9f5d8"; g.lineWidth = 0.7;
    for (let i = 0; i < 8; i++) { const y = -4 - (i * h) / 9, x = (i % 2 ? -1 : 1) * w * 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x > 0 ? 2.5 : -2.5), y - 1); g.stroke(); }
    if (p.stage === 3) { g.fillStyle = "#ff8fb1"; g.beginPath(); g.arc(0, -h - 1, 2.5, 0, TAU); g.fill(); }
    if (p.stage === 4) { petalRing(g, -h - 2, 7, 8, 2.2, "#ff6fa0", p.t * 0.1); g.fillStyle = "#ffe066"; g.beginPath(); g.arc(0, -h - 2, 2, 0, TAU); g.fill(); }
  },
  mushroom(g, p) {
    const s = p.stage === 1 ? 0.45 : p.stage === 2 ? 0.7 : p.stage === 3 ? 0.85 : 1;
    const caps: [number, number, number][] = p.stage === 4 ? [[0, 1, 0], [-10, 0.6, 1], [9, 0.5, 2]] : p.stage >= 2 ? [[0, 1, 0], [-9, 0.5, 1]] : [[0, 1, 0]];
    for (const [x, k, i] of caps) {
      const r = 11 * s * k, hgt = 16 * s * k;
      g.fillStyle = "#efe6d4"; g.fillRect(x - r * 0.28, -hgt, r * 0.56, hgt);
      const glow = 0.25 + p.night * (0.55 + 0.2 * Math.sin(p.t * 2 + i));
      const halo = g.createRadialGradient(x, -hgt, 1, x, -hgt, r * 2.6);
      halo.addColorStop(0, `rgba(90,240,220,${glow * 0.6})`); halo.addColorStop(1, "rgba(90,240,220,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(x, -hgt, r * 2.6, 0, TAU); g.fill();
      g.fillStyle = mix("#2fb7a5", "#7ffff0", p.night * 0.7); g.beginPath(); g.ellipse(x, -hgt, r, r * 0.62, 0, Math.PI, 0); g.fill();
      g.fillStyle = "rgba(255,255,255,.75)"; for (let d = 0; d < 3; d++) { g.beginPath(); g.arc(x - r * 0.45 + d * r * 0.45, -hgt - r * 0.32 + (d % 2) * 2, r * 0.11, 0, TAU); g.fill(); }
    }
  },
  rose(g, p) {
    const h = greens(g, p, 44);
    g.strokeStyle = "#3d7a2c"; g.lineWidth = 1; for (let i = 1; i < 4; i++) { const y = -h * i * 0.22; g.beginPath(); g.moveTo(0.6, y); g.lineTo(3, y - 1.5); g.stroke(); }
    if (p.stage === 3) bud(g, -h, "#d81b45", 5.5);
    if (p.stage === 4) {
      g.save(); g.translate(0, -h - 4);
      const layers: [number, string][] = [[11, "#b5102f"], [8.5, "#d81b45"], [6, "#ef3b60"], [3.4, "#ff6b86"]];
      for (const [r, c] of layers) { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r; g.ellipse(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.3, r * 0.62, r * 0.5, a, 0, TAU); } g.fill(); }
      g.strokeStyle = "rgba(90,0,20,.45)"; g.lineWidth = 0.8; g.beginPath(); g.arc(0, 0, 2.2, 0.5, 5); g.stroke();
      g.restore();
    }
  },
  cherry(g, p) {
    const h = (p.stage === 1 ? 14 : p.stage === 2 ? 34 : 52) * (0.85 + 0.15 * p.frac);
    g.strokeStyle = "#7a4e32"; g.lineCap = "round"; g.lineWidth = p.stage === 1 ? 2.5 : 5;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-2, -h * 0.5, 1, -h); g.stroke();
    if (p.stage === 1) { leaf(g, 1, -h, 7, -2.4); leaf(g, 1, -h, 7, -0.7); return; }
    g.lineWidth = 2.6; const branches: [number, number, number][] = [[-0.62, -16, -12], [-0.75, 15, -14], [-0.9, -10, -8], [-0.88, 11, -9]];
    for (const [k, dx, dy] of branches) { g.beginPath(); g.moveTo(0, h * k); g.lineTo(dx, h * k + dy); g.stroke(); }
    const crown = p.stage === 2 ? LEAF : p.stage === 3 ? "#ffd1dc" : "#ffb7c9";
    const blobs: [number, number, number][] = [[0, -h - 4, 15], [-16, -h * 0.72 - 10, 12], [15, -h * 0.78 - 12, 12], [-8, -h - 12, 10], [9, -h - 10, 10]];
    for (const [x, y, r] of blobs) { g.fillStyle = crown; g.beginPath(); g.arc(x, y, r * (p.stage === 2 ? 0.75 : 1), 0, TAU); g.fill(); }
    if (p.stage === 4) { g.fillStyle = "#ff8fab"; for (let i = 0; i < 24; i++) { const [x, y, r] = blobs[i % blobs.length]; const a = i * 2.3; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, 1.6, 0, TAU); g.fill(); } }
  },
  veyra(g, p) {
    const h = greens(g, p, 46);
    if (p.stage === 3) { bud(g, -h, "#f0a540", 6); return; }
    if (p.stage === 4) {
      g.save(); g.translate(0, -h - 3); g.rotate(p.t * 0.25);
      const glow = g.createRadialGradient(0, 0, 2, 0, 0, 30);
      glow.addColorStop(0, "rgba(255,190,120,.55)"); glow.addColorStop(1, "rgba(149,88,236,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
      const colors = ["#f0a540", "#ec5f74", "#9558ec"];
      for (let i = 0; i < 6; i++) { g.save(); g.rotate((i / 6) * TAU); g.fillStyle = colors[i % 3]; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(7, -8, 0, -18); g.quadraticCurveTo(-7, -8, 0, 0); g.fill(); g.restore(); }
      g.fillStyle = "#fff6e0"; g.beginPath(); g.arc(0, 0, 3.6, 0, TAU); g.fill();
      g.restore();
      for (let i = 0; i < 3; i++) { const a = p.t * 1.4 + i * 2.1, r = 22 + Math.sin(p.t + i) * 4; sparkle(g, Math.cos(a) * r, -h - 3 + Math.sin(a) * r * 0.7, 2.4, 0.6 + 0.4 * Math.sin(p.t * 3 + i)); }
    }
  },
};

/** A four-pointed twinkle. */
export function sparkle(g: Ctx, x: number, y: number, r: number, alpha: number, color = "255,240,200") {
  g.fillStyle = `rgba(${color},${Math.max(0, alpha)})`;
  g.beginPath(); g.moveTo(x, y - r * 2); g.lineTo(x + r * 0.45, y - r * 0.45); g.lineTo(x + r * 2, y); g.lineTo(x + r * 0.45, y + r * 0.45);
  g.lineTo(x, y + r * 2); g.lineTo(x - r * 0.45, y + r * 0.45); g.lineTo(x - r * 2, y); g.lineTo(x - r * 0.45, y - r * 0.45); g.closePath(); g.fill();
}

/** A butterfly with flapping wings. */
export function butterfly(g: Ctx, x: number, y: number, flap: number, color: string, size = 1) {
  g.save(); g.translate(x, y); g.scale(size, size);
  const w = 0.35 + 0.65 * Math.abs(Math.sin(flap));
  g.fillStyle = color;
  g.beginPath(); g.ellipse(-4 * w, -2, 4.5 * w, 3.6, -0.5, 0, TAU); g.ellipse(4 * w, -2, 4.5 * w, 3.6, 0.5, 0, TAU); g.fill();
  g.globalAlpha = 0.8; g.beginPath(); g.ellipse(-3 * w, 2.5, 3 * w, 2.4, 0.4, 0, TAU); g.ellipse(3 * w, 2.5, 3 * w, 2.4, -0.4, 0, TAU); g.fill();
  g.globalAlpha = 1; g.fillStyle = "#2b2233"; g.fillRect(-0.7, -4, 1.4, 8);
  g.restore();
}

/** A bee, for sunny watered gardens. */
export function bee(g: Ctx, x: number, y: number, flap: number) {
  g.save(); g.translate(x, y);
  g.fillStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.ellipse(-1, -3.5, 2.6, 1.6 + Math.abs(Math.sin(flap)) * 1.2, -0.4, 0, TAU); g.ellipse(2, -3.5, 2.6, 1.6 + Math.abs(Math.sin(flap)) * 1.2, 0.4, 0, TAU); g.fill();
  g.fillStyle = "#ffcc33"; g.beginPath(); g.ellipse(0, 0, 4.4, 3, 0, 0, TAU); g.fill();
  g.fillStyle = "#2b2233"; g.fillRect(-1.6, -2.8, 1.3, 5.6); g.fillRect(1, -2.6, 1.2, 5.2);
  g.restore();
}
