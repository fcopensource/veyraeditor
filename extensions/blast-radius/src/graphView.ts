// The Blast Radius graph: a self-contained HTML page for a webview (no external scripts, strict CSP).
// Changed files sit in the middle; every ring outwards is one more import hop away.

import type { Kind } from "./model";

export type GraphNode = { id: string; label: string; dir: string; kind: Kind; depth: number; via: string | null };
export type GraphData = {
  title: string;
  subtitle: string;
  nodes: GraphNode[];
  edges: [string, string][]; // [importer, imported]
  hidden: number;             // nodes left out to keep the picture readable
  canRunTests: boolean;
};

export const KIND_COLOR: Record<Kind, string> = {
  changed: "#ff4f6d", test: "#3fb950", route: "#e3a008", component: "#a371f7", config: "#4aa3ff", source: "#8b949e",
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]!);

export function graphHtml(data: GraphData, nonce: string, cspSource: string): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const legend = (Object.keys(KIND_COLOR) as Kind[])
    .filter(k => data.nodes.some(n => n.kind === k))
    .map(k => `<span class="chip"><i class="k-${k}"></i>${{ changed: "Changed", test: "Tests", route: "Routes & pages", component: "Components", config: "Config", source: "Other code" }[k]} <b>${data.nodes.filter(n => n.kind === k).length}</b></span>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
  :root{color-scheme:light dark}
  body{margin:0;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);overflow:hidden;height:100vh;display:flex;flex-direction:column}
  header{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border,#8884);flex-wrap:wrap}
  h1{font-size:15px;margin:0;font-weight:600} h1 small{display:block;font-weight:400;opacity:.75;margin-top:2px;font-size:12px}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
  .chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:var(--vscode-badge-background,#8882);color:var(--vscode-badge-foreground,inherit);font-size:12px}
  .chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
  ${(Object.keys(KIND_COLOR) as Kind[]).map(k => `.k-${k}{background:${KIND_COLOR[k]}}`).join("")}
  button{font:inherit;border:0;border-radius:4px;padding:5px 11px;cursor:pointer;background:var(--vscode-button-secondaryBackground,#8883);color:var(--vscode-button-secondaryForeground,inherit)}
  button.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  button:hover{filter:brightness(1.1)}
  #wrap{flex:1;position:relative} svg{width:100%;height:100%;cursor:grab;display:block} svg.drag{cursor:grabbing}
  .ring{fill:none;stroke:var(--vscode-foreground);stroke-opacity:.07;stroke-dasharray:3 5}
  .ringlabel{fill:var(--vscode-foreground);opacity:.35;font-size:10px}
  .edge{stroke:var(--vscode-foreground);stroke-opacity:.16;stroke-width:1;fill:none}
  .edge.tree{stroke-opacity:.32;stroke-width:1.4}
  .edge.on{stroke:var(--vscode-focusBorder,#4af);stroke-opacity:.95;stroke-width:2.2}
  .node{cursor:pointer} .node circle{stroke:var(--vscode-editor-background);stroke-width:2}
  .node text{fill:var(--vscode-foreground);font-size:11px;paint-order:stroke;stroke:var(--vscode-editor-background);stroke-width:3px;stroke-linejoin:round}
  .node.dim{opacity:.18} .node.on circle{stroke:var(--vscode-focusBorder,#4af);stroke-width:3}
  #tip{position:absolute;pointer-events:none;background:var(--vscode-editorHoverWidget-background,#222);color:var(--vscode-editorHoverWidget-foreground,inherit);border:1px solid var(--vscode-editorHoverWidget-border,#8886);padding:7px 9px;border-radius:5px;font-size:12px;max-width:480px;display:none;line-height:1.5}
  #tip code{font-family:var(--vscode-editor-font-family);font-size:11.5px}
  .empty{padding:40px;text-align:center;opacity:.75}
  footer{padding:6px 16px;font-size:11.5px;opacity:.7;border-top:1px solid var(--vscode-panel-border,#8884)}
</style></head><body>
<header>
  <h1>${esc(data.title)}<small>${esc(data.subtitle)}</small></h1>
  ${data.canRunTests ? `<button class="primary" id="run">Run affected tests</button>` : ""}
  <button id="copy">Copy report</button>
  <button id="fit">Fit</button>
  <div class="chips">${legend}</div>
</header>
<div id="wrap">${data.nodes.length ? `<svg id="svg"><g id="view"></g></svg>` : `<div class="empty">Nothing to show yet. Change a JavaScript, TypeScript or Python file, or open one, and its blast radius appears here.</div>`}<div id="tip"></div></div>
<footer>Changed files in the middle · each ring is one import hop further · hover to trace the path · click to open · scroll to zoom, drag to move${data.hidden ? ` · ${data.hidden} more files not drawn` : ""}</footer>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const data = ${json};
const COLORS = ${JSON.stringify(KIND_COLOR)};
const $ = id => document.getElementById(id);
$("copy").onclick = () => vscode.postMessage({ type: "copy" });
if ($("run")) $("run").onclick = () => vscode.postMessage({ type: "run" });
const svg = $("svg"), view = $("view"), tip = $("tip");
if (svg) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || view).appendChild(e); return e; };
  // Layout: one ring per depth; within a ring, children sit near their parent's angle.
  const byDepth = new Map();
  for (const n of data.nodes) { if (!byDepth.has(n.depth)) byDepth.set(n.depth, []); byDepth.get(n.depth).push(n); }
  const pos = new Map(), angle = new Map();
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const R0 = data.nodes.filter(n => n.depth === 0).length > 1 ? 70 : 0, STEP = 150;
  for (const d of depths) {
    const ring = byDepth.get(d);
    ring.forEach((n, i) => { n._t = n.via && angle.has(n.via) ? angle.get(n.via) : (i / ring.length) * Math.PI * 2; });
    ring.sort((a, b) => a._t - b._t || a.id.localeCompare(b.id));
    const r = d === 0 ? R0 : R0 + d * STEP + Math.max(0, ring.length - 24) * 2.2;
    if (d > 0) el("circle", { class: "ring", cx: 0, cy: 0, r });
    if (d > 0) { const la = -Math.PI * 0.75; el("text", { class: "ringlabel", x: Math.cos(la) * r - 6, y: Math.sin(la) * r - 6, "text-anchor": "end" }).textContent = d + (d === 1 ? " hop" : " hops"); }
    ring.forEach((n, i) => {
      const a = ring.length === 1 && d > 0 ? n._t : (i / ring.length) * Math.PI * 2 - Math.PI / 2 + (d % 2 ? 0.2 : 0);
      angle.set(n.id, a);
      pos.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, a });
    });
  }
  const edges = data.edges.filter(([a, b]) => pos.has(a) && pos.has(b)).map(([a, b]) => {
    const p = pos.get(a), q = pos.get(b);
    const tree = data.nodes.find(n => n.id === a)?.via === b;
    const mx = (p.x + q.x) / 2 * 0.86, my = (p.y + q.y) / 2 * 0.86;
    return { a, b, e: el("path", { class: "edge" + (tree ? " tree" : ""), d: "M" + q.x + "," + q.y + " Q" + mx + "," + my + " " + p.x + "," + p.y }) };
  });
  const nodes = new Map();
  for (const n of data.nodes) {
    const p = pos.get(n.id);
    const g = el("g", { class: "node", transform: "translate(" + p.x + "," + p.y + ")", tabindex: 0 });
    el("circle", { r: n.depth === 0 ? 9 : 6.5, fill: COLORS[n.kind] }, g);
    const right = Math.cos(p.a) >= -0.01 || n.depth === 0;
    const t = el("text", { x: right ? 12 : -12, y: 4, "text-anchor": right ? "start" : "end" }, g);
    t.textContent = n.label;
    if (n.depth === 0) t.setAttribute("font-weight", "700");
    nodes.set(n.id, g);
    const chain = () => { const out = [n.id]; let cur = n; while (cur && cur.via) { out.unshift(cur.via); cur = data.nodes.find(x => x.id === cur.via); } return out; };
    g.addEventListener("mouseenter", ev => {
      const c = new Set(chain());
      for (const [id, node] of nodes) node.classList.toggle(c.has(id) ? "on" : "dim", true);
      for (const x of edges) if (c.has(x.a) && c.has(x.b)) x.e.classList.add("on");
      tip.innerHTML = "<b>" + escapeHtml(n.id) + "</b><br>" + (n.depth ? "Affected " + n.depth + " hop" + (n.depth > 1 ? "s" : "") + " away, through:<br><code>" + chain().map(escapeHtml).join(" → ") + "</code>" : "Changed");
      tip.style.display = "block";
    });
    g.addEventListener("mousemove", ev => { tip.style.left = Math.min(ev.offsetX + 14, innerWidth - 300) + "px"; tip.style.top = ev.offsetY + 14 + "px"; });
    g.addEventListener("mouseleave", () => { for (const node of nodes.values()) node.classList.remove("on", "dim"); for (const x of edges) x.e.classList.remove("on"); tip.style.display = "none"; });
    g.addEventListener("click", () => vscode.postMessage({ type: "open", file: n.id }));
    g.addEventListener("keydown", e => { if (e.key === "Enter") vscode.postMessage({ type: "open", file: n.id }); });
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;" })[c]); }
  // Pan and zoom.
  let k = 1, tx = 0, ty = 0;
  const apply = () => view.setAttribute("transform", "translate(" + tx + "," + ty + ") scale(" + k + ")");
  const fit = () => {
    const b = view.getBBox(), w = svg.clientWidth, h = svg.clientHeight;
    k = Math.min(2, Math.max(0.15, Math.min(w / (b.width + 80), h / (b.height + 60))));
    tx = w / 2 - (b.x + b.width / 2) * k; ty = h / 2 - (b.y + b.height / 2) * k; apply();
  };
  $("fit").onclick = fit; addEventListener("resize", fit); fit();
  svg.addEventListener("wheel", e => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015), nk = Math.min(4, Math.max(0.1, k * f)); tx = e.offsetX - (e.offsetX - tx) * (nk / k); ty = e.offsetY - (e.offsetY - ty) * (nk / k); k = nk; apply(); }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", e => { if (e.target.closest(".node")) return; drag = { x: e.clientX - tx, y: e.clientY - ty }; svg.classList.add("drag"); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", e => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); });
  svg.addEventListener("pointerup", () => { drag = null; svg.classList.remove("drag"); });
}
</script></body></html>`;
}
