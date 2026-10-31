/* The Wrapped story: full-screen slides, then a share card drawn on a canvas. All text from the repository is set as text, never HTML. */
import type { PersonalityId, Wrapped } from "../model";

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;

type Child = Node | string | null | undefined | false;
function h(tag: string, cls = "", ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children) if (c) el.append(c);
  return el;
}
const svgNS = "http://www.w3.org/2000/svg";
function s(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}k` : fmt(n);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const hourLabel = (h24: number) => h24 === 0 ? "midnight" : h24 === 12 ? "noon" : `${h24 % 12} ${h24 < 12 ? "AM" : "PM"}`;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dateLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = one + "s") => `${fmt(n)} ${n === 1 ? one : many}`;

/** A number that counts up when its slide appears. */
const count = (n: number, cls = "big") => { const el = h("b", `${cls} count`, "0"); el.dataset.to = String(n); return el; };

function animateCounts(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".count").forEach(el => {
    const to = Number(el.dataset.to), start = performance.now(), dur = 1200;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const ICONS: Record<PersonalityId, string> = {
  "night-owl": "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  "early-bird": "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  "weekend-warrior": "M3 9h18M7 3v3m10-3v3M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3 9 2.5 2.5L16 12",
  refactorer: "M14.5 4.5 19.5 9.5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z",
  "bug-hunter": "M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0zm4 0v9M4 12h4m8 0h4M5 7l3 2m11-2-3 2M5 18l3-2m11 2-3-2",
  marathoner: "M12 2s4 4.5 4 9a4 4 0 0 1-8 0c0-2 1-3.5 1-3.5S10 10 12 10c0-4 0-8 0-8zM6 14a6 6 0 0 0 12 0",
  architect: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 11h.01M15 11h.01",
  steady: "M5 12h14m-6-6 6 6-6 6",
};

function badge(id: PersonalityId) {
  const svg = s("svg", { viewBox: "0 0 120 120", class: "badge" });
  const defs = s("defs", {});
  const g = s("linearGradient", { id: "bg-badge", x1: 0, y1: 0, x2: 1, y2: 1 });
  g.append(s("stop", { offset: 0, "stop-color": "#ffd36b" }), s("stop", { offset: 0.5, "stop-color": "#ff6fb5" }), s("stop", { offset: 1, "stop-color": "#7c6bff" }));
  defs.append(g);
  svg.append(defs, s("circle", { cx: 60, cy: 60, r: 56, fill: "url(#bg-badge)" }), s("circle", { cx: 60, cy: 60, r: 56, fill: "none", stroke: "#fff", "stroke-opacity": 0.4, "stroke-width": 2 }));
  const icon = s("g", { transform: "translate(30 30) scale(2.5)", fill: "none", stroke: "#fff", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" });
  icon.append(s("path", { d: ICONS[id] }));
  svg.append(icon);
  return svg;
}

function clock(hours: number[], peak: number) {
  const svg = s("svg", { viewBox: "0 0 300 300", class: "clock" });
  const max = Math.max(1, ...hours);
  svg.append(s("circle", { cx: 150, cy: 150, r: 64, fill: "none", stroke: "#ffffff22", "stroke-width": 1 }));
  hours.forEach((v, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2, len = 10 + (v / max) * 72;
    const x1 = 150 + Math.cos(a) * 72, y1 = 150 + Math.sin(a) * 72, x2 = 150 + Math.cos(a) * (72 + len), y2 = 150 + Math.sin(a) * (72 + len);
    const bar = s("line", { x1, y1, x2, y2, "stroke-width": 7, "stroke-linecap": "round", class: i === peak ? "peak" : "" });
    (bar as SVGElement).style.animationDelay = `${i * 0.03}s`;
    svg.append(bar);
  });
  for (const [i, t] of [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"]] as [number, string][]) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const label = s("text", { x: 150 + Math.cos(a) * 50, y: 150 + Math.sin(a) * 50 + 4, "text-anchor": "middle", class: "tick" });
    label.textContent = t;
    svg.append(label);
  }
  return svg;
}

interface Slide { bg: string; el: HTMLElement }

function slides(d: Wrapped): Slide[] {
  const you = d.team ? "The team" : "You";
  const out: Slide[] = [];
  const add = (bg: string, ...children: Child[]) => out.push({ bg, el: h("section", "slide-body", ...children) });

  add("bg-intro",
    h("span", "kicker", "VEYRA WRAPPED"),
    h("h1", "hero", d.team ? `${d.repo}:` : `${d.who},`, h("br"), h("em", "", `your ${d.period.label} in code.`)),
    h("p", "sub", d.team ? `The whole team's story, from ${plural(d.contributors.length, "person", "people")}.` : `Straight from the history of ${d.repo}.`),
    h("p", "hint", "Tap or press → to continue"));

  if (!d.commits) {
    add("bg-commits", h("h2", "", "A quiet chapter."), h("p", "sub", `No commits in ${d.period.label} yet. Try a longer period: your story is waiting.`), again(d));
    return out;
  }

  const perDay = d.commits / Math.max(d.activeDays, 1);
  add("bg-commits",
    h("p", "lead", `${you} made`), count(d.commits), h("p", "unit", d.commits === 1 ? "commit" : "commits"),
    h("p", "sub", `on ${plural(d.activeDays, "day")} of coding. That's ${perDay.toFixed(1)} commits on a day you code.`));

  const pages = Math.max(1, Math.round(d.added / 30));
  const max = Math.max(d.added, d.deleted, 1);
  const bar = (cls: string, v: number, label: string) => { const b = h("div", `lines-bar ${cls}`, h("span", "", label)); b.style.setProperty("--w", `${Math.max(6, (v / max) * 100)}%`); return b; };
  add("bg-lines",
    h("p", "lead", `${you} wrote`), count(d.added), h("p", "unit", "lines of code"),
    h("div", "lines", bar("add", d.added, `+${compact(d.added)} added`), bar("del", d.deleted, `−${compact(d.deleted)} removed`)),
    h("p", "sub", d.deleted > d.added ? "You removed more than you added. The best code is the code you delete." : `That's about ${plural(pages, "page")} of a novel, in ${plural(d.files, "file")}.`));

  const hourCopy = d.nightShare >= 0.35 ? `${pct(d.nightShare)} of your commits landed after 9 PM.` : d.morningShare >= 0.3 ? `${pct(d.morningShare)} of your commits landed before 9 AM.` : `Your code comes alive around ${hourLabel(d.peakHour)}.`;
  add("bg-clock", h("p", "lead", "Your coding hours"), clock(d.hours, d.peakHour), h("h2", "", `Peak hour: ${hourLabel(d.peakHour)}`), h("p", "sub", hourCopy));

  const wmax = Math.max(1, ...d.weekdays);
  const week = h("div", "week");
  d.weekdays.forEach((v, i) => { const col = h("div", `day ${i === d.peakWeekday ? "peak" : ""}`, h("i", ""), h("span", "", WEEKDAYS[i].slice(0, 3))); col.style.setProperty("--h", `${Math.max(4, (v / wmax) * 100)}%`); col.style.setProperty("--delay", `${i * 0.08}s`); week.append(col); });
  add("bg-week", h("p", "lead", "Your favourite day to ship"), h("h2", "", WEEKDAYS[d.peakWeekday]), week,
    h("p", "sub", d.weekendShare >= 0.25 ? `${pct(d.weekendShare)} of your commits were on weekends. Who needs a day off?` : `Only ${pct(d.weekendShare)} on weekends. Balance: unlocked.`));

  add("bg-streak", h("p", "lead", "Your longest streak"), count(d.longestStreak), h("p", "unit", d.longestStreak === 1 ? "day in a row" : "days in a row"),
    d.busiestDay && h("p", "sub", `Your busiest day was ${dateLabel(d.busiestDay.date)}, with ${plural(d.busiestDay.count, "commit")}.`));

  if (d.languages.length) {
    const list = h("div", "langs");
    d.languages.forEach((l, i) => { const row = h("div", "lang", h("span", "", l.name), h("b", "", pct(l.share))); row.style.setProperty("--w", `${Math.max(3, l.share * 100)}%`); row.style.setProperty("--c", l.color); row.style.setProperty("--delay", `${i * 0.12}s`); list.append(row); });
    add("bg-langs", h("p", "lead", d.languages.length > 1 ? `${you} spoke ${plural(d.languages.length, "language")}` : "Your language"), h("h2", "", d.languages[0].name), list);
  }

  if (d.topFiles.length) {
    const list = h("ol", "files");
    d.topFiles.forEach(f => list.append(h("li", "", h("span", "", f.path), h("b", "", plural(f.commits, "commit")))));
    add("bg-files", h("p", "lead", "The files you couldn't stop editing"), list);
  }

  if (d.words.length || d.biggest) {
    const cloud = h("div", "words");
    const wmaxc = Math.max(1, ...d.words.map(w => w.count));
    d.words.forEach((w, i) => { const chip = h("span", "", w.word); chip.style.setProperty("--s", String(0.85 + (w.count / wmaxc) * 0.9)); chip.style.setProperty("--delay", `${i * 0.06}s`); cloud.append(chip); });
    add("bg-words", h("p", "lead", "Your favourite words in commit messages"), cloud,
      d.biggest && h("div", "biggest", h("small", "", `BIGGEST COMMIT · ${dateLabel(d.biggest.date)} · ${compact(d.biggest.lines)} lines`), h("q", "", d.biggest.subject)));
  }

  if (d.team && d.contributors.length > 1) {
    const list = h("ol", "files people");
    d.contributors.forEach(c => list.append(h("li", "", h("span", "", c.name), h("b", "", plural(c.commits, "commit")))));
    add("bg-files", h("p", "lead", "The people behind the code"), list);
  }

  add("bg-persona", h("p", "lead", d.team ? "Your team's coding personality" : "Your coding personality is…"), badge(d.personality.id), h("h2", "persona", d.personality.title), h("p", "sub", d.personality.line));

  const canvas = document.createElement("canvas");
  drawCard(canvas, d, 2);
  const status = h("p", "status", "");
  const save = h("button", "btn primary", "Save image");
  save.onclick = () => vscode.postMessage({ type: "save", data: canvas.toDataURL("image/png").split(",")[1], name: `wrapped-${d.repo}-${d.period.label}.png` });
  const copy = h("button", "btn", "Copy image");
  copy.onclick = () => canvas.toBlob(async blob => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]); status.textContent = "Copied. Paste it into X, LinkedIn or Slack."; }
    catch { status.textContent = "Copying images isn't allowed here. Use Save image instead."; }
  });
  const replay = h("button", "btn", "Watch again");
  replay.onclick = () => go(0);
  add("bg-share", h("p", "lead", "Share your year"), h("div", "card-frame", canvas), h("div", "actions", save, copy, replay, again(d)), status);
  return out;
}

function again(d: Wrapped) {
  const b = h("button", "btn", d.team ? "My Wrapped" : "The team's Wrapped");
  b.onclick = () => vscode.postMessage({ type: "again", team: !d.team });
  return b;
}

/** The 1200×630 share card, drawn at `scale` for a sharp image. */
export function drawCard(canvas: HTMLCanvasElement, d: Wrapped, scale: number) {
  const W = 1200, H = 630;
  canvas.width = W * scale; canvas.height = H * scale;
  const c = canvas.getContext("2d")!;
  c.scale(scale, scale);
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1b0b3f"); bg.addColorStop(0.55, "#3a0f62"); bg.addColorStop(1, "#0c3a5e");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [[1040, 80, 360, "#ff4fa344"], [120, 640, 380, "#25d6c933"], [700, 320, 300, "#7c6bff2e"]] as [number, number, number, string][]) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "transparent"); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const font = (w: number, px: number) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  const fit = (text: string, max: number) => { let t = text; while (c.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + "…"; return t; };

  c.fillStyle = "#ffd36b"; c.font = font(800, 18); c.fillText("VEYRA WRAPPED", 64, 82);
  c.fillStyle = "#fff"; c.font = font(800, 54);
  c.fillText(fit(d.team ? `${d.repo}'s ${d.period.label}` : `My ${d.period.label} in code`, 760), 64, 150);
  c.font = font(500, 22); c.fillStyle = "#ffffffaa"; c.fillText(fit(d.team ? `${plural(d.contributors.length, "contributor")} · ${d.repo}` : d.repo, 760), 66, 190);

  const tag = d.personality.title.toUpperCase();
  c.font = font(800, 20);
  const tw = c.measureText(tag).width + 48;
  const pill = c.createLinearGradient(64, 0, 64 + tw, 0); pill.addColorStop(0, "#ffd36b"); pill.addColorStop(0.5, "#ff6fb5"); pill.addColorStop(1, "#7c6bff");
  c.fillStyle = pill; roundRect(c, 64, 216, tw, 44, 22); c.fill();
  c.fillStyle = "#1b0b3f"; c.fillText(tag, 88, 245);

  const stats: [string, string][] = [
    ["COMMITS", compact(d.commits)], ["LINES ADDED", compact(d.added)], ["ACTIVE DAYS", compact(d.activeDays)],
    ["LONGEST STREAK", `${d.longestStreak} ${d.longestStreak === 1 ? "day" : "days"}`], ["PEAK HOUR", hourLabel(d.peakHour)], ["TOP LANGUAGE", d.languages[0]?.name ?? "—"],
  ];
  stats.forEach(([k, v], i) => {
    const x = 64 + (i % 3) * 362, y = 300 + Math.floor(i / 3) * 132;
    c.fillStyle = "#ffffff14"; roundRect(c, x, y, 342, 112, 20); c.fill();
    c.strokeStyle = "#ffffff26"; c.lineWidth = 1.5; roundRect(c, x, y, 342, 112, 20); c.stroke();
    c.fillStyle = "#ffffffb3"; c.font = font(700, 15); c.fillText(k, x + 24, y + 38);
    c.fillStyle = "#fff"; c.font = font(800, 42); c.fillText(fit(v, 300), x + 24, y + 88);
  });
  c.fillStyle = "#ffffff99"; c.font = font(600, 17);
  c.fillText("#VeyraWrapped", 64, 600);
  c.textAlign = "right"; c.fillText("veyraeditor.com/wrapped", W - 64, 600); c.textAlign = "left";
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h2: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h2, r); c.arcTo(x + w, y + h2, x, y + h2, r); c.arcTo(x, y + h2, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ── The story player ──────────────────────────────────
let deck: Slide[] = [];
let index = 0, timer: number | undefined, autoPlay = true, paused = false;
const DURATION = 6500;

function render(d: Wrapped) {
  deck = slides(d);
  app.replaceChildren();
  const bars = h("div", "bars");
  deck.forEach(() => bars.append(h("i", "", h("b", ""))));
  const stage = h("div", "stage");
  const prev = h("button", "zone prev", ""); prev.setAttribute("aria-label", "Previous");
  const next = h("button", "zone next", ""); next.setAttribute("aria-label", "Next");
  prev.onclick = () => go(index - 1);
  next.onclick = () => go(index + 1);
  const pause = h("button", "pause", "Pause");
  pause.onclick = () => { paused = !paused; pause.textContent = paused ? "Play" : "Pause"; schedule(); };
  app.append(h("div", "story", bars, stage, prev, next, pause));
  go(0);
  vscode.postMessage({ type: "rendered", slides: deck.length });
}

function go(i: number) {
  index = Math.max(0, Math.min(deck.length - 1, i));
  const story = app.querySelector<HTMLElement>(".story")!;
  story.className = `story ${deck[index].bg}`;
  const stage = story.querySelector(".stage")!;
  const el = deck[index].el;
  el.classList.remove("in"); void el.offsetWidth; el.classList.add("in");
  stage.replaceChildren(el);
  animateCounts(el);
  // Interactive slides (the last one) take clicks, so the tap zones step aside there.
  story.classList.toggle("last", index === deck.length - 1);
  story.querySelectorAll(".bars i").forEach((b, j) => { b.className = j < index ? "done" : j === index ? "now" : ""; });
  schedule();
}

function schedule() {
  clearTimeout(timer);
  const now = app.querySelector<HTMLElement>(".bars i.now b");
  if (now) { now.style.animation = "none"; void now.offsetWidth; now.style.animation = ""; now.style.animationDuration = `${DURATION}ms`; now.style.animationPlayState = paused || !autoPlay ? "paused" : "running"; }
  if (!autoPlay || paused || index >= deck.length - 1) return;
  timer = window.setTimeout(() => go(index + 1), DURATION);
}

window.addEventListener("keydown", e => {
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(index + 1); }
  if (e.key === "ArrowLeft") go(index - 1);
  if (e.key.toLowerCase() === "p") app.querySelector<HTMLButtonElement>(".pause")?.click();
});

window.addEventListener("message", e => {
  const m = e.data;
  if (m?.type === "data") { autoPlay = m.autoPlay !== false; paused = false; render(m.data as Wrapped); }
});
vscode.postMessage({ type: "ready" });
