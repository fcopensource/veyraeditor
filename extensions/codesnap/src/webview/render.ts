import { BACKGROUNDS, layout, type Layout, type Options, type Snippet, type Token } from "../model";

/* Draws a snap on a canvas: background, window, title bar, line numbers and the highlighted code. */

export interface Look { background: string; solidColor: string; shadow: boolean; scale: number }
export interface Drawn { layout: Layout; firstLine: number; rows: number }

/** Is a colour light? (#rgb, #rrggbb, #rrggbbaa or rgb()). */
export function isLight(color: string): boolean {
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1].length <= 4 ? hex[1].split("").map(c => c + c).join("") : hex[1];
    [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (m) [r, g, b] = m[1].split(",").map(Number);
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
const fontFor = (t: Token | undefined, s: Snippet) => `${t?.italic ? "italic " : ""}${t?.bold ? "bold " : ""}${s.fontSize}px ${s.fontFamily}`;

export function drawSnap(canvas: HTMLCanvasElement, s: Snippet, o: Options, look: Look, highlights: Set<number>, firstLine: number): Drawn {
  const ctx = canvas.getContext("2d")!;
  ctx.font = fontFor(undefined, s);
  const charWidth = ctx.measureText("M").width || s.fontSize * 0.6;
  const lineHeight = Math.max(s.lineHeight, Math.round(s.fontSize * 1.45));
  const widest = Math.max(1, ...s.lines.map(line => line.reduce((w, t) => { ctx.font = fontFor(t, s); return w + ctx.measureText(t.text).width; }, 0)));
  const L = layout(o, s.lines.length, widest / charWidth, charWidth, lineHeight, firstLine);
  canvas.width = Math.round(L.width * look.scale);
  canvas.height = Math.round(L.height * look.scale);
  ctx.setTransform(look.scale, 0, 0, look.scale, 0, 0);
  ctx.clearRect(0, 0, L.width, L.height);

  // Background.
  const g = BACKGROUNDS[look.background];
  if (g) {
    const a = ((g.angle - 90) * Math.PI) / 180, cx = L.width / 2, cy = L.height / 2;
    const r = (Math.abs(L.width * Math.cos(a)) + Math.abs(L.height * Math.sin(a))) / 2;
    const grad = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stops.forEach((c, i) => grad.addColorStop(i / (g.stops.length - 1), c));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, L.width, L.height);
  } else if (look.background === "solid") { ctx.fillStyle = look.solidColor; ctx.fillRect(0, 0, L.width, L.height); }

  // The window, with a soft shadow.
  const w = L.window, radius = 12, light = isLight(s.background);
  ctx.save();
  if (look.shadow && look.background !== "transparent") { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20; }
  ctx.beginPath(); ctx.roundRect(w.x, w.y, w.width, w.height, radius); ctx.fillStyle = s.background; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(w.x + 0.5, w.y + 0.5, w.width - 1, w.height - 1, radius); ctx.strokeStyle = light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.1)"; ctx.lineWidth = 1; ctx.stroke();
  const faint = (alpha: number) => { ctx.globalAlpha = alpha; ctx.fillStyle = s.foreground; ctx.strokeStyle = s.foreground; };

  // Title bar.
  if (o.frame === "macos") {
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { ctx.beginPath(); ctx.arc(w.x + 22 + i * 20, w.y + 20, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
    if (o.title) { faint(0.6); ctx.font = `500 13px -apple-system, "Segoe UI", system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.title, w.x + w.width / 2, w.y + 20); ctx.textAlign = "left"; }
  } else if (o.frame === "windows") {
    faint(0.65);
    if (o.title) { ctx.font = `500 12.5px "Segoe UI", system-ui, sans-serif`; ctx.textBaseline = "middle"; ctx.fillText(o.title, w.x + 18, w.y + 20); }
    ctx.lineWidth = 1.2; const right = w.x + w.width;
    ctx.beginPath(); ctx.moveTo(right - 94, w.y + 20); ctx.lineTo(right - 84, w.y + 20); ctx.stroke();
    ctx.strokeRect(right - 62, w.y + 15, 10, 10);
    ctx.beginPath(); ctx.moveTo(right - 30, w.y + 15); ctx.lineTo(right - 20, w.y + 25); ctx.moveTo(right - 20, w.y + 15); ctx.lineTo(right - 30, w.y + 25); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Lines: a band behind highlighted ones, the others fade back.
  const any = highlights.size > 0;
  ctx.textBaseline = "middle";
  s.lines.forEach((line, i) => {
    const n = firstLine + i, y = L.codeY + i * lineHeight, mid = y + lineHeight / 2, on = highlights.has(n);
    if (on) {
      ctx.fillStyle = light ? "rgba(99,102,241,.12)" : "rgba(129,140,248,.16)"; ctx.fillRect(w.x, y, w.width, lineHeight);
      ctx.fillStyle = "#818cf8"; ctx.fillRect(w.x, y, 3, lineHeight);
    }
    if (o.lineNumbers) {
      faint(on ? 0.85 : any ? 0.22 : 0.38);
      ctx.font = fontFor(undefined, s); ctx.textAlign = "right";
      ctx.fillText(String(n), L.codeX - charWidth * 1.3, mid);
      ctx.textAlign = "left";
    }
    ctx.globalAlpha = any && !on ? 0.42 : 1;
    let x = L.codeX;
    for (const t of line) {
      ctx.font = fontFor(t, s); ctx.fillStyle = t.color ?? s.foreground;
      ctx.fillText(t.text, x, mid);
      const width = ctx.measureText(t.text).width;
      if (t.underline) ctx.fillRect(x, mid + s.fontSize * 0.55, width, 1);
      x += width;
    }
    ctx.globalAlpha = 1;
  });
  return { layout: L, firstLine, rows: s.lines.length };
}

/** The line number under a point on the canvas (in CSS pixels), if it's on a line. */
export function lineAt(d: Drawn, canvas: HTMLCanvasElement, clientX: number, clientY: number): number | undefined {
  const r = canvas.getBoundingClientRect();
  const k = d.layout.width / r.width;
  const x = (clientX - r.left) * k, y = (clientY - r.top) * k;
  const w = d.layout.window;
  if (x < w.x || x > w.x + w.width) return undefined;
  const row = Math.floor((y - d.layout.codeY) / d.layout.lineHeight);
  return row >= 0 && row < d.rows ? d.firstLine + row : undefined;
}
