/* The pets, drawn with simple shapes on a canvas. Every pet stands with its feet at (0, 0), facing right; the caller flips it. */

export type Kind = "cat" | "dog" | "fox" | "bunny" | "panda";
export type Pose = "walk" | "run" | "idle" | "sit" | "sleep" | "jump";
export interface Look { kind: Kind; color: string; pose: Pose; phase: number; time: number; blink: boolean; happy: boolean }
interface Palette { body: string; dark: string; light: string; accent?: string }

export const COLORS: Record<Kind, Record<string, Palette>> = {
  cat: {
    orange: { body: "#f2a14e", dark: "#d97f2a", light: "#fde6c8" },
    black: { body: "#3b3b46", dark: "#26262e", light: "#5c5c69" },
    white: { body: "#f6f3ee", dark: "#d9d2c6", light: "#ffffff" },
    grey: { body: "#9da3ad", dark: "#7c838e", light: "#dde0e5" },
  },
  dog: {
    brown: { body: "#b97c4c", dark: "#8d5b33", light: "#f0d6b8" },
    golden: { body: "#e9b75c", dark: "#c99538", light: "#f8e4b8" },
    black: { body: "#3c3431", dark: "#251f1d", light: "#cfa57f" },
    white: { body: "#f3f0ea", dark: "#d6cfc3", light: "#ffffff" },
  },
  fox: {
    red: { body: "#ea7a3f", dark: "#c95e26", light: "#fff5ec", accent: "#3a2a24" },
    arctic: { body: "#eef2f6", dark: "#cfd7e0", light: "#ffffff", accent: "#8f9aa8" },
  },
  bunny: {
    white: { body: "#f6f4f1", dark: "#ddd6cd", light: "#ffffff" },
    brown: { body: "#b98f6c", dark: "#97704f", light: "#efdccb" },
    grey: { body: "#aab0b8", dark: "#8b929b", light: "#e6e8eb" },
  },
  panda: {
    classic: { body: "#f7f7f4", dark: "#2c2c31", light: "#ffffff" },
  },
};
export const KINDS = Object.keys(COLORS) as Kind[];

const EYE = "#1f2328", PINK = "#ff9db0", NOSE = "#4a3a3a";

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function poly(ctx: CanvasRenderingContext2D, pts: number[], fill: string) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
/** A leg hanging from (x, top) to the ground, its foot swung forward or back. */
function leg(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, swing: number, fill: string, foot?: string) {
  const bottom = 0, fx = x + swing;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, top); ctx.lineTo(x + w / 2, top); ctx.lineTo(fx + w / 2, bottom - w / 2);
  ctx.quadraticCurveTo(fx + w / 2, bottom, fx, bottom); ctx.quadraticCurveTo(fx - w / 2, bottom, fx - w / 2, bottom - w / 2);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (foot) ellipse(ctx, fx, bottom - w * 0.35, w * 0.55, w * 0.38, foot);
}
function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number, blink: boolean, happy: boolean) {
  for (const ex of [x - gap / 2, x + gap / 2]) {
    if (blink || happy) {
      // Closed (blink) or smiling (happy) eyes are little arcs.
      ctx.beginPath(); ctx.lineWidth = r * 0.75; ctx.strokeStyle = EYE; ctx.lineCap = "round";
      if (happy && !blink) ctx.arc(ex, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85); else ctx.arc(ex, y - r * 0.2, r * 0.9, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      ellipse(ctx, ex, y, r, r * 1.15, EYE);
      ellipse(ctx, ex + r * 0.35, y - r * 0.4, r * 0.38, r * 0.38, "#ffffff");
    }
  }
}
function cheeks(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, r: number) {
  ctx.globalAlpha = 0.45; ellipse(ctx, x - gap / 2, y, r, r * 0.6, PINK); ellipse(ctx, x + gap / 2, y, r, r * 0.6, PINK); ctx.globalAlpha = 1;
}
function tailStroke(ctx: CanvasRenderingContext2D, pts: number[], width: number, color: string) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  ctx.lineWidth = width; ctx.lineCap = "round"; ctx.strokeStyle = color; ctx.stroke();
}

/** Draws one pet. */
export function drawPet(ctx: CanvasRenderingContext2D, look: Look) {
  const p = COLORS[look.kind][look.color] ?? Object.values(COLORS[look.kind])[0];
  ctx.save();
  if (look.kind === "bunny") drawBunny(ctx, look, p);
  else if (look.pose === "sleep") drawSleeping(ctx, look, p);
  else if (look.pose === "sit") drawSitting(ctx, look, p);
  else drawStanding(ctx, look, p);
  ctx.restore();
}

/** Body sizes per kind: [body rx, body ry, leg length, head r]. */
const SHAPE: Record<Exclude<Kind, "bunny">, [number, number, number, number]> = { cat: [14, 8.5, 9, 9.5], dog: [15, 9.5, 11, 10], fox: [14, 8, 10, 9], panda: [16, 11, 8, 11] };

function drawStanding(ctx: CanvasRenderingContext2D, look: Look, p: Palette) {
  const kind = look.kind as Exclude<Kind, "bunny">;
  const [rx, ry, legLen, hr] = SHAPE[kind];
  const moving = look.pose === "walk" || look.pose === "run" || look.pose === "jump";
  const stride = look.pose === "run" ? 4.5 : look.pose === "jump" ? 0 : 3;
  const s = (o: number) => (moving ? Math.sin(look.phase + o) * stride : 0);
  const bob = moving && look.pose !== "jump" ? Math.abs(Math.sin(look.phase)) * -1.2 : Math.sin(look.time * 2) * 0.4;
  const bodyY = -legLen - ry * 0.55 + bob;
  const legTop = bodyY + ry * 0.3;
  const legColor = kind === "panda" ? p.dark : kind === "fox" ? p.accent ?? p.dark : p.body;
  const farLeg = kind === "panda" || kind === "fox" ? p.dark : p.dark;
  const lw = kind === "panda" ? 6 : kind === "dog" ? 4.6 : 4;
  // Legs on the far side first, a shade darker.
  leg(ctx, -rx * 0.55, legTop, lw, s(Math.PI), farLeg);
  leg(ctx, rx * 0.5, legTop, lw, s(0), farLeg);
  // Tail behind the body.
  drawTail(ctx, kind, p, -rx * 0.9, bodyY - ry * 0.2, look);
  // Body.
  ellipse(ctx, 0, bodyY, rx, ry, p.body);
  if (kind === "panda") { ctx.save(); ctx.beginPath(); ctx.ellipse(0, bodyY, rx, ry, 0, 0, Math.PI * 2); ctx.clip(); ellipse(ctx, rx * 0.35, bodyY - ry * 0.1, rx * 0.32, ry * 1.2, p.dark); ctx.restore(); }
  else ellipse(ctx, rx * 0.15, bodyY + ry * 0.45, rx * 0.65, ry * 0.45, p.light);
  if (kind === "cat" && look.color === "orange") for (const sx of [-6, -1.5, 3]) ellipse(ctx, sx, bodyY - ry * 0.75, 1.3, 3, p.dark, 0.15);
  // Near legs.
  leg(ctx, -rx * 0.35, legTop, lw, s(0), legColor);
  leg(ctx, rx * 0.72, legTop, lw, s(Math.PI), legColor, kind === "fox" && p.accent ? undefined : undefined);
  drawHead(ctx, kind, p, rx * 0.95, bodyY - ry * 0.9 - hr * 0.45, hr, look);
}

function drawSitting(ctx: CanvasRenderingContext2D, look: Look, p: Palette) {
  const kind = look.kind as Exclude<Kind, "bunny">;
  const [rx, ry, legLen, hr] = SHAPE[kind];
  const breathe = Math.sin(look.time * 2) * 0.5;
  drawTail(ctx, kind, p, -rx * 0.55, -3, { ...look, pose: "sit" });
  // Haunch, upright body, front legs.
  ellipse(ctx, -rx * 0.35, -ry * 0.75, ry * 0.95, ry * 0.8, kind === "panda" ? p.dark : p.body);
  if (kind !== "panda") { ctx.beginPath(); ctx.lineWidth = 1; ctx.strokeStyle = p.dark; ctx.lineCap = "round"; ctx.arc(-rx * 0.35, -ry * 0.75, ry * 0.62, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke(); }
  ellipse(ctx, 0, -legLen - ry * 0.35 + breathe, rx * 0.72, ry * 1.25, p.body, -0.35);
  const lw = kind === "panda" ? 6 : 4.4;
  const legColor = kind === "panda" ? p.dark : kind === "fox" ? p.accent ?? p.dark : p.body;
  leg(ctx, rx * 0.25, -legLen * 0.9, lw, 0, legColor);
  leg(ctx, rx * 0.55, -legLen * 0.9, lw, 0, legColor);
  // The chest goes over the tops of the front legs, so they come out from under it.
  if (kind === "panda") ellipse(ctx, rx * 0.15, -legLen - ry * 0.75 + breathe, rx * 0.62, ry * 0.45, p.dark, -0.35);
  else ellipse(ctx, rx * 0.22, -legLen * 0.75 + breathe, rx * 0.36, ry * 0.75, p.light, -0.35);
  drawHead(ctx, kind, p, rx * 0.3, -legLen - ry * 1.55 - hr * 0.55 + breathe, hr, look);
}

function drawSleeping(ctx: CanvasRenderingContext2D, look: Look, p: Palette) {
  const kind = look.kind as Exclude<Kind, "bunny">;
  const [rx, ry, , hr] = SHAPE[kind];
  const breathe = Math.sin(look.time * 1.6) * 0.8;
  drawTail(ctx, kind, p, -rx * 0.8, -ry * 0.5, { ...look, pose: "sleep" });
  ellipse(ctx, 0, -ry * 0.75 - breathe * 0.4, rx * 1.05, ry * 0.8 + breathe * 0.4, p.body);
  if (kind === "panda") ellipse(ctx, rx * 0.4, -ry * 0.7, rx * 0.3, ry * 0.75, p.dark);
  drawHead(ctx, kind, p, rx * 0.95, -hr * 0.85, hr * 0.95, { ...look, blink: true, happy: false });
}

function drawTail(ctx: CanvasRenderingContext2D, kind: Exclude<Kind, "bunny">, p: Palette, x: number, y: number, look: Look) {
  const wag = Math.sin(look.time * (kind === "dog" ? 9 : 2.5)) * (look.pose === "sleep" ? 0.5 : 1);
  if (look.pose === "sleep") {
    if (kind === "fox") { ellipse(ctx, x + 4, y + 4, 13, 5.5, p.body, 0.05); ellipse(ctx, x + 15, y + 5, 4, 3.4, p.light); }
    else if (kind !== "panda") tailStroke(ctx, [x, y, x - 8, y + 4, x - 2, y + 9, x + 12, y + 8], 4, p.body);
    return;
  }
  if (kind === "fox" && look.pose === "sit") {
    // Sitting, the fox's tail rests along the ground beside it.
    ellipse(ctx, x - 7, -4.6, 12.5, 4.4, p.body, -0.04 + wag * 0.02); ellipse(ctx, x - 17.5, -4.2, 4.2, 3.4, p.light);
    return;
  }
  if (kind === "cat") tailStroke(ctx, [x, y, x - 9, y - 2, x - 10 + wag * 2, y - 14, x - 4 + wag * 3, y - 19], 4, p.body);
  else if (kind === "dog") tailStroke(ctx, [x, y, x - 5, y - 3, x - 7 + wag * 2, y - 8, x - 6 + wag * 3, y - 12], 4.2, p.body);
  else if (kind === "fox") {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35 + wag * 0.08);
    ellipse(ctx, -10, 1, 12, 5.5, p.body, 0.15); ellipse(ctx, -19, 2.5, 4.5, 3.6, p.light, 0.15);
    ctx.restore();
  } else ellipse(ctx, x + 1, y + 1, 3.2, 3, p.dark);
}

function drawHead(ctx: CanvasRenderingContext2D, kind: Exclude<Kind, "bunny">, p: Palette, x: number, y: number, r: number, look: Look) {
  const earWiggle = Math.sin(look.time * 1.3) > 0.97 ? 1.5 : 0;
  if (kind === "cat") {
    poly(ctx, [x - r * 0.85, y - r * 0.35, x - r * 0.62, y - r * 1.35 - earWiggle, x - r * 0.05, y - r * 0.75], p.body);
    poly(ctx, [x + r * 0.05, y - r * 0.75, x + r * 0.62, y - r * 1.35, x + r * 0.88, y - r * 0.3], p.body);
    poly(ctx, [x - r * 0.68, y - r * 0.55, x - r * 0.58, y - r * 1.05 - earWiggle, x - r * 0.28, y - r * 0.75], PINK);
    poly(ctx, [x + r * 0.28, y - r * 0.75, x + r * 0.58, y - r * 1.05, x + r * 0.7, y - r * 0.52], PINK);
  } else if (kind === "fox") {
    poly(ctx, [x - r * 0.9, y - r * 0.25, x - r * 0.7, y - r * 1.55 - earWiggle, x - r * 0.05, y - r * 0.75], p.body);
    poly(ctx, [x + r * 0.05, y - r * 0.75, x + r * 0.72, y - r * 1.55, x + r * 0.92, y - r * 0.2], p.body);
    poly(ctx, [x - r * 0.72, y - r * 0.5, x - r * 0.66, y - r * 1.2 - earWiggle, x - r * 0.32, y - r * 0.75], p.accent ?? p.dark);
    poly(ctx, [x + r * 0.32, y - r * 0.75, x + r * 0.68, y - r * 1.2, x + r * 0.74, y - r * 0.48], p.accent ?? p.dark);
  } else if (kind === "panda") {
    ellipse(ctx, x - r * 0.72, y - r * 0.78, r * 0.38, r * 0.36, p.dark);
    ellipse(ctx, x + r * 0.72, y - r * 0.78, r * 0.38, r * 0.36, p.dark);
  }
  if (kind === "dog") {
    // Floppy ears behind the head.
    const flop = Math.sin(look.time * 9) * 0.06;
    ellipse(ctx, x - r * 0.88, y - r * 0.05, r * 0.36, r * 0.72, p.dark, 0.35 + flop);
    ellipse(ctx, x + r * 0.88, y - r * 0.05, r * 0.36, r * 0.72, p.dark, -0.35 - flop);
  }
  ellipse(ctx, x, y, r, r * 0.92, p.body);
  if (kind === "fox") { poly(ctx, [x - r, y + r * 0.05, x, y + r * 0.95, x + r, y + r * 0.05, x + r * 0.5, y + r * 0.3, x - r * 0.5, y + r * 0.3], p.light); }
  if (kind === "dog") ellipse(ctx, x + r * 0.1, y + r * 0.42, r * 0.55, r * 0.4, p.light);
  if (kind === "panda") { ellipse(ctx, x - r * 0.38, y + r * 0.02, r * 0.26, r * 0.34, p.dark, -0.5); ellipse(ctx, x + r * 0.38, y + r * 0.02, r * 0.26, r * 0.34, p.dark, 0.5); }
  const eyeY = y + (kind === "dog" ? -r * 0.05 : r * 0.02);
  if (kind === "panda") {
    // Eyes sit inside the patches, light so they show on black.
    for (const ex of [x - r * 0.36, x + r * 0.36]) {
      if (look.blink) { ctx.beginPath(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#fff"; ctx.arc(ex, eyeY - 0.5, r * 0.12, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
      else { ellipse(ctx, ex, eyeY, r * 0.12, r * 0.14, "#fff"); ellipse(ctx, ex + 0.3, eyeY + 0.2, r * 0.07, r * 0.08, EYE); }
    }
  } else eyes(ctx, x, eyeY, r * 0.78, r * 0.13, look.blink, look.happy);
  // Nose and mouth.
  const ny = y + r * (kind === "dog" ? 0.3 : 0.32);
  ellipse(ctx, x, ny, r * (kind === "dog" ? 0.17 : 0.1), r * (kind === "dog" ? 0.12 : 0.07), kind === "cat" ? PINK : NOSE);
  ctx.beginPath(); ctx.lineWidth = 0.9; ctx.strokeStyle = NOSE; ctx.lineCap = "round";
  ctx.moveTo(x, ny + r * 0.06); ctx.quadraticCurveTo(x - r * 0.12, ny + r * 0.24, x - r * 0.24, ny + r * 0.14);
  ctx.moveTo(x, ny + r * 0.06); ctx.quadraticCurveTo(x + r * 0.12, ny + r * 0.24, x + r * 0.24, ny + r * 0.14);
  ctx.stroke();
  if (kind === "cat") {
    ctx.beginPath(); ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(60,50,50,.5)";
    for (const d of [-1, 1]) for (const dy of [-0.04, 0.1]) { ctx.moveTo(x + d * r * 0.35, ny + r * dy); ctx.lineTo(x + d * r * 0.95, ny + r * (dy - 0.06)); }
    ctx.stroke();
  }
  if (kind !== "panda") cheeks(ctx, x, y + r * 0.3, r * 1.15, r * 0.16);
}

function drawBunny(ctx: CanvasRenderingContext2D, look: Look, p: Palette) {
  const moving = look.pose === "walk" || look.pose === "run" || look.pose === "jump";
  const hop = moving ? Math.max(0, Math.sin(look.phase)) * (look.pose === "run" ? 9 : 6) : 0;
  const sleeping = look.pose === "sleep";
  const squash = sleeping ? 0.8 : 1;
  const y = -hop;
  // Tail puff, back haunch, body.
  ellipse(ctx, -12, y - 9, 3.6, 3.4, p.light);
  ellipse(ctx, -5, y - 6, 8, 6 * squash, p.dark);
  ellipse(ctx, 0, y - 10 * squash, 12, 9.5 * squash, p.body);
  ellipse(ctx, 3, y - 7 * squash, 7, 5 * squash, p.light);
  // Feet.
  ellipse(ctx, -5 + (moving ? -Math.cos(look.phase) * 2 : 0), y - 1.6, 5.5, 2.2, p.dark);
  ellipse(ctx, 7, y - 1.8, 3, 2, p.body);
  // Head and long ears.
  const hx = 9, hy = y - (sleeping ? 12 : 19);
  const earTilt = sleeping ? 1.25 : -0.12 + Math.sin(look.time * 1.5) * 0.05 - (moving ? 0.25 : 0);
  for (const [dx, tilt] of [[-3, earTilt - 0.12], [2, earTilt + 0.12]] as const) {
    ctx.save(); ctx.translate(hx + dx, hy - 6); ctx.rotate(tilt);
    ellipse(ctx, 0, -8, 3.2, 9, p.body); ellipse(ctx, 0, -8, 1.6, 6.5, PINK);
    ctx.restore();
  }
  ellipse(ctx, hx, hy, 8.5, 7.8, p.body);
  eyes(ctx, hx + 0.5, hy - 0.5, 6.4, 1.1, sleeping || look.blink, look.happy);
  ellipse(ctx, hx + 0.5, hy + 2.6, 1.1, 0.8, PINK);
  cheeks(ctx, hx + 0.5, hy + 2.6, 9, 1.4);
}

/** The area around a pet's feet that it can draw in, in pet units. */
export const BOX = { left: 46, right: 46, top: 68, bottom: 10 };
let off: HTMLCanvasElement | undefined;
/**
 * Draws a pet at (x, y) on the target, scaled and flipped, with a soft outline around its whole silhouette
 * (so white pets show on light backgrounds) and a little shadow under it.
 */
export function renderPet(target: CanvasRenderingContext2D, look: Look, x: number, y: number, scale: number, flip: boolean, pixelRatio = 1) {
  const w = (BOX.left + BOX.right) * scale, h = (BOX.top + BOX.bottom) * scale;
  const pw = Math.ceil(w * pixelRatio), ph = Math.ceil(h * pixelRatio);
  off ??= document.createElement("canvas");
  if (off.width < pw || off.height < ph) { off.width = Math.max(off.width, pw); off.height = Math.max(off.height, ph); }
  const o = off.getContext("2d")!;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, pw, ph);
  o.setTransform(scale * pixelRatio * (flip ? -1 : 1), 0, 0, scale * pixelRatio, (flip ? BOX.right : BOX.left) * scale * pixelRatio, BOX.top * scale * pixelRatio);
  drawPet(o, look);
  target.save();
  target.globalAlpha = 0.16;
  target.fillStyle = "#000";
  target.beginPath(); target.ellipse(x, y + 0.5 * scale, 15 * scale, 2.6 * scale, 0, 0, Math.PI * 2); target.fill();
  target.globalAlpha = 1;
  target.filter = `drop-shadow(0 0 ${Math.max(0.6, 0.55 * scale)}px rgba(0,0,0,.45))`;
  target.drawImage(off, 0, 0, pw, ph, x - (flip ? BOX.right : BOX.left) * scale, y - BOX.top * scale, w, h);
  target.restore();
}
