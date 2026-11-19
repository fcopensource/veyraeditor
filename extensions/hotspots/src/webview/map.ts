// The Hotspot Map webview: a zoomable treemap of the codebase, coloured by risk. Runs in the browser (bundled to
// bundle/map.js); the extension sends it the analysis and opens files it asks for.
import { COLOR_MODES, DAY, LEVEL_LABEL, ago, buildTree, heatColor, layoutTreemap, level, modeValue, type ColorMode, type FileStat, type Rect, type TreeNode } from "../model";

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): unknown; setState(s: unknown): void };
const vscode = acquireVsCodeApi();

type Payload = {
  project: string; periodLabel: string; months: number;
  files: FileStat[]; coupling: { a: string; b: string; shared: number; degree: number }[];
  stats: { commits: number; authors: number; maxCommits: number; maxComplexity: number; since: number | null; until: number };
  mode: ColorMode;
};

let data: Payload | null = null;
let mode: ColorMode = "hotspot";
let focus = "";                 // folder zoomed into ("" = whole project)
let selected: string | null = null;
let hover: Rect | null = null;
let query = "";
let rects: Rect[] = [];
let byPath = new Map<string, FileStat>();
let together = new Map<string, { path: string; shared: number; degree: number }[]>();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("map"), ctx = canvas.getContext("2d")!;
const tip = $("tip"), side = $("side"), crumbs = $("crumbs"), modes = $("modes"), legend = $("legend"), search = $<HTMLInputElement>("search");
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);
const css = (name: string) => getComputedStyle(document.body).getPropertyValue(name).trim();

// ------------------------------------------------------------------------------------------------ messages

window.addEventListener("message", e => {
  const m = e.data as { type: string; payload?: Payload; path?: string };
  if (m.type === "data" && m.payload) {
    data = m.payload; mode = m.payload.mode;
    byPath = new Map(data.files.map(f => [f.path, f]));
    together = new Map();
    for (const c of data.coupling) {
      for (const [x, y] of [[c.a, c.b], [c.b, c.a]]) { if (!together.has(x)) together.set(x, []); together.get(x)!.push({ path: y, shared: c.shared, degree: c.degree }); }
    }
    if (focus && !data.files.some(f => f.path.startsWith(focus + "/"))) focus = "";
    if (selected && !byPath.has(selected)) selected = null;
    renderChrome(); layout(); draw(); renderSide();
  } else if (m.type === "reveal" && m.path && byPath.has(m.path)) {
    selected = m.path;
    const dir = m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/")) : "";
    if (focus && !m.path.startsWith(focus + "/")) focus = "";
    if (!rects.some(r => r.path === m.path && r.w > 6 && r.h > 6)) focus = dir;
    layout(); draw(); renderSide(); renderCrumbs();
  }
});
vscode.postMessage({ type: "ready" });

// ------------------------------------------------------------------------------------------------ layout & drawing

function visibleFiles(): FileStat[] {
  if (!data) return [];
  return data.files.filter(f => !focus || f.path.startsWith(focus + "/"));
}

function layout() {
  const box = canvas.parentElement!.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(box.width * dpr)); canvas.height = Math.max(1, Math.floor(box.height * dpr));
  canvas.style.width = `${box.width}px`; canvas.style.height = `${box.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const files = visibleFiles().map(f => ({ path: focus ? f.path.slice(focus.length + 1) : f.path, loc: f.loc }));
  const tree: TreeNode = buildTree(files);
  rects = layoutTreemap(tree, box.width, box.height, 17, 2).map(r => ({ ...r, path: focus && r.path ? `${focus}/${r.path}` : r.path }));
}

function valueOf(f: FileStat) { return data ? modeValue(f, mode, data.stats) : -1; }

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (!data) return;
  const bg = css("--vscode-editor-background") || "#1e1e1e", fg = css("--vscode-foreground") || "#ccc";
  const q = query.toLowerCase();
  const related = new Set((selected ? together.get(selected) ?? [] : []).map(t => t.path));
  for (const r of rects) {
    if (r.dir) {
      ctx.fillStyle = shade(bg, 0.06 + r.depth * 0.025);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (r.w > 44 && r.h > 34) {
        ctx.fillStyle = fg; ctx.globalAlpha = 0.75; ctx.font = "600 11px var(--vscode-font-family), sans-serif";
        ctx.fillText(clip(r.name + "/", r.w - 8), r.x + 5, r.y + 12);
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const f = byPath.get(r.path);
    if (!f) continue;
    const dim = q && !f.path.toLowerCase().includes(q);
    ctx.globalAlpha = dim ? 0.15 : 1;
    ctx.fillStyle = heatColor(valueOf(f));
    ctx.fillRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1));
    if (r.w > 38 && r.h > 16) {
      const v = valueOf(f);
      ctx.fillStyle = v > 0.45 ? "#1a0a10" : "#f2f4f8"; ctx.globalAlpha = dim ? 0.15 : 0.92;
      ctx.font = `${r.w > 110 && r.h > 34 ? "600 12px" : "11px"} var(--vscode-font-family), sans-serif`;
      ctx.fillText(clip(r.name, r.w - 8), r.x + 4, r.y + 13);
      if (r.h > 34 && r.w > 70 && f.rank && f.rank <= 30) { ctx.globalAlpha = dim ? 0.12 : 0.75; ctx.font = "10px var(--vscode-font-family), sans-serif"; ctx.fillText(`#${f.rank} · ${f.commits} commits`, r.x + 4, r.y + 27); }
    }
    ctx.globalAlpha = 1;
  }
  // Files that change with the selected one: dashed outlines and links.
  const sel = selected ? rects.find(r => r.path === selected) : undefined;
  if (sel) {
    ctx.save();
    for (const r of rects) if (related.has(r.path)) {
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
      ctx.setLineDash([]); ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.moveTo(sel.x + sel.w / 2, sel.y + sel.h / 2); ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.strokeRect(sel.x + 1.5, sel.y + 1.5, sel.w - 3, sel.h - 3);
    ctx.restore();
  }
  if (hover && !hover.dir && hover.path !== selected) { ctx.lineWidth = 2; ctx.strokeStyle = css("--vscode-focusBorder") || "#4af"; ctx.strokeRect(hover.x + 1, hover.y + 1, hover.w - 2, hover.h - 2); }
}

function clip(text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t.length > 1 ? t + "…" : "";
}
function shade(color: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return `rgba(127,127,127,${amount})`;
  const n = parseInt(m[1], 16), light = ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 140;
  const k = light ? -amount : amount;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ------------------------------------------------------------------------------------------------ interaction

function hit(x: number, y: number): Rect | null {
  let best: Rect | null = null;
  for (const r of rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) if (!best || r.depth >= best.depth) best = r;
  return best;
}
function inHeader(r: Rect, y: number) { return r.dir && y - r.y < 17; }

canvas.addEventListener("mousemove", e => {
  const r = hit(e.offsetX, e.offsetY);
  if (r !== hover) { hover = r; draw(); }
  canvas.style.cursor = r && (!r.dir || inHeader(r, e.offsetY)) ? "pointer" : "default";
  if (!r || !data) { tip.style.display = "none"; return; }
  if (r.dir) {
    const inside = data.files.filter(f => f.path.startsWith(r.path + "/"));
    const hot = inside.filter(f => f.rank).sort((a, b) => a.rank - b.rank)[0];
    tip.innerHTML = `<b>${esc(r.path)}/</b><br>${inside.length} files · ${inside.reduce((n, f) => n + f.loc, 0).toLocaleString()} lines${hot ? `<br>Hottest: ${esc(hot.path.split("/").pop()!)} (#${hot.rank})` : ""}<br><span class="dim">Click the name to zoom in</span>`;
  } else {
    const f = byPath.get(r.path);
    if (!f) return;
    const lv = level(f.score);
    tip.innerHTML = `<b>${esc(f.path)}</b><br><span class="chip lv-${lv}">${f.rank ? `#${f.rank} · ` : ""}${LEVEL_LABEL[lv]}</span><br>${f.commits} commit${f.commits === 1 ? "" : "s"} · ${f.loc.toLocaleString()} lines · depth ${f.maxDepth}<br>Last changed ${ago(f.lastChange, data.stats.until)}${f.authors[0] ? `<br>Mostly ${esc(f.authors[0].name)} (${Math.round(f.mainShare * 100)}%)` : ""}`;
  }
  tip.style.display = "block";
  const box = canvas.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = `${Math.min(e.offsetX + 14, box.width - tw - 6)}px`;
  tip.style.top = `${Math.min(e.offsetY + 16, box.height - th - 6)}px`;
});
canvas.addEventListener("mouseleave", () => { hover = null; tip.style.display = "none"; draw(); });
canvas.addEventListener("click", e => {
  const r = hit(e.offsetX, e.offsetY);
  if (!r) return;
  if (r.dir) { if (inHeader(r, e.offsetY) || r.w < 60) { focus = r.path; selected = null; layout(); draw(); renderCrumbs(); renderSide(); } return; }
  selected = r.path === selected ? null : r.path; draw(); renderSide();
});
canvas.addEventListener("dblclick", e => { const r = hit(e.offsetX, e.offsetY); if (r && !r.dir) vscode.postMessage({ type: "open", path: r.path }); });
window.addEventListener("keydown", e => {
  if (e.target === search) return;
  if (e.key === "Escape") { if (selected) selected = null; else if (focus) focus = focus.includes("/") ? focus.slice(0, focus.lastIndexOf("/")) : ""; layout(); draw(); renderSide(); renderCrumbs(); }
  if (e.key === "Enter" && selected) vscode.postMessage({ type: "open", path: selected });
  if (e.key === "/") { e.preventDefault(); search.focus(); }
});
search.addEventListener("input", () => { query = search.value.trim(); draw(); renderSide(); });
window.addEventListener("resize", () => { layout(); draw(); });
$("period").addEventListener("click", () => vscode.postMessage({ type: "period" }));
$("report").addEventListener("click", () => vscode.postMessage({ type: "report" }));

// ------------------------------------------------------------------------------------------------ chrome

function renderChrome() {
  if (!data) return;
  $("title").textContent = `Hotspots · ${data.project}`;
  $("sub").textContent = `${data.stats.commits.toLocaleString()} commits by ${data.stats.authors} ${data.stats.authors === 1 ? "person" : "people"} in ${data.periodLabel} · ${data.files.length.toLocaleString()} files`;
  modes.innerHTML = COLOR_MODES.map(m => `<button data-mode="${m.id}" class="${m.id === mode ? "on" : ""}" title="${esc(m.hint)}">${esc(m.label)}</button>`).join("");
  modes.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { mode = (b as HTMLElement).dataset.mode as ColorMode; vscode.postMessage({ type: "mode", mode }); renderChrome(); draw(); renderSide(); }));
  const hint = COLOR_MODES.find(m => m.id === mode)!;
  const ends = ({ hotspot: ["calm", "hot"], churn: ["rarely", "constantly"], complexity: ["simple", "deeply nested"], age: ["fresh", "untouched"], knowledge: ["shared", "one person"] } as Record<ColorMode, [string, string]>)[mode];
  legend.innerHTML = `<span>${ends[0]}</span><i class="ramp"></i><span>${ends[1]}</span><span class="dim">· ${esc(hint.hint)} · tile size = lines of code</span>`;
  renderCrumbs();
}

function renderCrumbs() {
  if (!data) return;
  const parts = focus ? focus.split("/") : [];
  crumbs.innerHTML = [`<a data-f="">${esc(data.project)}</a>`, ...parts.map((p, i) => `<a data-f="${esc(parts.slice(0, i + 1).join("/"))}">${esc(p)}</a>`)].join(`<span>›</span>`);
  crumbs.querySelectorAll("a").forEach(a => a.addEventListener("click", () => { focus = (a as HTMLElement).dataset.f ?? ""; selected = null; layout(); draw(); renderSide(); renderCrumbs(); }));
}

function renderSide() {
  renderSideHtml();
  side.querySelectorAll<HTMLElement>("[data-bg]").forEach(el => { el.style.background = el.dataset.bg!; });
  side.querySelectorAll<HTMLElement>("[data-w]").forEach(el => { el.style.setProperty("--w", `${el.dataset.w}%`); });
}

function renderSideHtml() {
  if (!data) return;
  const until = data.stats.until;
  if (selected && byPath.has(selected)) {
    const f = byPath.get(selected)!, lv = level(f.score);
    const total = f.authors.reduce((n, a) => n + a.changes, 0) || 1;
    const tog = (together.get(f.path) ?? []).sort((a, b) => b.degree - a.degree).slice(0, 6);
    const age = f.lastChange === null ? null : (until - f.lastChange) / DAY;
    side.innerHTML = `
      <button class="back" id="back">← Top hotspots</button>
      <h2 title="${esc(f.path)}">${esc(f.path.split("/").pop()!)}</h2><p class="path">${esc(f.path)}</p>
      <span class="chip lv-${lv}">${f.rank ? `#${f.rank} · ` : ""}${LEVEL_LABEL[lv]}</span>
      <div class="stats">
        <div><b>${f.commits}</b><small>commits</small></div><div><b>${f.loc.toLocaleString()}</b><small>lines</small></div>
        <div><b>${f.maxDepth}</b><small>max depth</small></div><div><b>${age === null ? "—" : age < 1 ? "today" : Math.round(age) + "d"}</b><small>since last change</small></div>
      </div>
      ${f.knowledge !== "shared" && f.commits ? `<p class="warn">${f.knowledge === "lost" ? `⚠ Only ${esc(f.authors[0].name)} has worked on this, and they haven't committed in over 6 months.` : `Only ${esc(f.authors[0].name)} has changed this file. Pair on the next change to share what they know.`}</p>` : ""}
      ${f.authors.length ? `<h3>Who knows it</h3>${f.authors.slice(0, 5).map(a => `<div class="bar"><span>${esc(a.name)}</span><i data-w="${Math.round(a.changes / total * 100)}"></i><small>${Math.round(a.changes / total * 100)}%</small></div>`).join("")}` : ""}
      ${tog.length ? `<h3>Changes together with</h3>${tog.map(t => `<a class="link" data-p="${esc(t.path)}">${esc(t.path.split("/").pop()!)}<small>${Math.round(t.degree * 100)}% · ${t.shared} commits</small></a>`).join("")}` : ""}
      <div class="actions"><button class="primary" id="open">Open file</button><button id="hist">File history</button></div>`;
    $("back").onclick = () => { selected = null; draw(); renderSide(); };
    $("open").onclick = () => vscode.postMessage({ type: "open", path: f.path });
    $("hist").onclick = () => vscode.postMessage({ type: "history", path: f.path });
    side.querySelectorAll<HTMLElement>("a.link").forEach(a => a.onclick = () => { selected = a.dataset.p!; if (!rects.some(r => r.path === selected)) { focus = ""; layout(); renderCrumbs(); } draw(); renderSide(); });
    return;
  }
  const q = query.toLowerCase();
  const list = visibleFiles().filter(f => f.rank && (!q || f.path.toLowerCase().includes(q))).slice(0, 25);
  side.innerHTML = `<h2>Top hotspots${focus ? ` in ${esc(focus.split("/").pop()!)}` : ""}</h2><p class="path">Complex code that changes often. Start refactoring here.</p>
    ${list.length ? list.map(f => `<a class="row" data-p="${esc(f.path)}"><span class="rank">${f.rank}</span><span class="name"><b>${esc(f.path.split("/").pop()!)}</b><small>${esc(f.path)}</small></span><i class="heat" data-bg="${heatColor(f.score)}"></i></a>`).join("") : `<p class="dim">No files changed in this period${q ? " match your search" : ""}.</p>`}`;
  side.querySelectorAll<HTMLElement>("a.row").forEach(a => {
    a.onclick = () => { selected = a.dataset.p!; if (!rects.some(r => r.path === selected)) { focus = ""; layout(); renderCrumbs(); } draw(); renderSide(); };
    a.ondblclick = () => vscode.postMessage({ type: "open", path: a.dataset.p });
  });
}
