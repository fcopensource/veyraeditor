import { UNCOMMITTED, formatDate, hue, initials, layoutGraph, matches, type Commit, type FileChange, type Ref, type Row } from "../model";

/* The graph view: a virtual list of commits with their lanes, a details pane, menus, search and keys. */

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): any; setState(s: unknown): void };
const vscode = acquireVsCodeApi();
const send = (m: unknown) => vscode.postMessage(m);
const app = document.getElementById("app")!;
const ROW = 30, LANE = 16, MAX_LANES = 14;
const PALETTE = ["#4f8ef7", "#f0883e", "#3fb950", "#d2a8ff", "#ff7b72", "#39c5cf", "#e3b341", "#f778ba", "#a5d6ff", "#7ee787"];
const laneColor = (i: number) => PALETTE[i % PALETTE.length];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const SVG = "http://www.w3.org/2000/svg";
function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
const ICONS: Record<string, string> = {
  branch: '<circle cx="5" cy="3.5" r="1.6"/><circle cx="5" cy="12.5" r="1.6"/><circle cx="11" cy="5.5" r="1.6"/><path d="M5 5.1v5.8M11 7.1c0 2.4-2 3-6 3.8"/>',
  cloud: '<path d="M4.5 12.5h7a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.2 7.3 2.6 2.6 0 0 0 4.5 12.5z"/>',
  tag: '<path d="M2.5 2.5h5.2l6 6-5.2 5.2-6-6z"/><circle cx="5.4" cy="5.4" r=".9"/>',
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.2 10.2 13.5 13.5"/>',
  up: '<path d="M4.5 9.5 8 6l3.5 3.5"/>', down: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.46-3.54M13 2.8v2.7h-2.7"/>',
  fetch: '<path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>',
  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
  check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
  graph: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="8" r="1.5"/><path d="M4.5 5v6M4.5 6.2c0 1.6 2.6 1.8 5.6 1.8"/>',
  compare: '<path d="M5 2.5v11M11 2.5v11M2.5 5H5M11 11h2.5"/>',
};
function icon(name: string, size = 14): SVGSVGElement {
  const el = document.createElementNS(SVG, "svg") as SVGSVGElement;
  for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) el.setAttribute(k, String(v));
  el.innerHTML = ICONS[name] ?? "";
  return el;
}
let toastTimer: number | undefined;
function toast(text: string) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, icon("check"), text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2400);
}

// ---------- State ----------

interface Graph { repo: string; commits: Commit[]; refs: Ref[]; head: { hash?: string; branch?: string }; more: boolean; branch: string; dateFormat: string; remotes: boolean }
let data: Graph | undefined;
let rows: Row[] = [];
let refsByHash = new Map<string, Ref[]>();
let selected = -1, compare = -1;
let hits: number[] = [], hit = -1;
let askedMore = false;
const saved = vscode.getState() ?? {};
let detailsHeight: number = saved.detailsHeight ?? 300;

// ---------- Layout ----------

const searchInput = h("input", { class: "search", type: "search", placeholder: "Find commits (Ctrl+F)", "aria-label": "Find commits" }) as HTMLInputElement;
const hitCount = h("span", { class: "count" });
const branchSelect = h("select", { class: "select", "aria-label": "Branches", title: "Show the commits of" }) as HTMLSelectElement;
const repoName = h("strong", { class: "repo" });
const headPill = h("span", { class: "head-pill" });
const busyBar = h("div", { class: "busy-bar" });
const list = h("div", { class: "list", tabindex: "0", role: "grid", "aria-label": "Commits" });
const spacer = h("div", { class: "spacer" });
const rowsHost = h("div", { class: "rows" });
const details = h("section", { class: "details", "aria-label": "Commit details" });
const handle = h("div", { class: "handle", role: "separator", "aria-orientation": "horizontal", title: "Drag to resize" });
list.append(spacer, rowsHost);

function chrome() {
  const bar = h("header", { class: "bar" },
    h("span", { class: "tile", "aria-hidden": "true" }, icon("graph", 18)),
    h("div", { class: "title" }, repoName, headPill),
    h("div", { class: "grow" }),
    h("label", { class: "pill select-pill" }, icon("branch"), branchSelect),
    h("div", { class: "pill find" }, h("span", { class: "pill-icon" }, icon("search")), searchInput, hitCount,
      h("button", { class: "icon", title: "Previous match (Shift+Enter)", "aria-label": "Previous match", onclick: () => stepHit(-1) }, icon("up", 16)),
      h("button", { class: "icon", title: "Next match (Enter)", "aria-label": "Next match", onclick: () => stepHit(1) }, icon("down", 16))),
    h("div", { class: "actions" },
      h("button", { class: "btn ghost", title: "Fetch from all remotes", onclick: () => send({ type: "fetch" }) }, icon("fetch"), h("span", { class: "label" }, "Fetch")),
      h("button", { class: "btn ghost", title: "Refresh", "aria-label": "Refresh", onclick: () => send({ type: "refresh" }) }, icon("refresh"))),
    busyBar);
  const head = h("div", { class: "cols", role: "row" }, h("span", { class: "c-graph" }, "Graph"), h("span", { class: "c-desc" }, "Description"), h("span", { class: "c-date" }, "Date"), h("span", { class: "c-author" }, "Author"), h("span", { class: "c-hash" }, "Commit"));
  app.replaceChildren(bar, h("div", { class: "main" }, head, list, handle, details));
  details.hidden = true;
}

function setGraph(next: Graph) {
  const keep = selected >= 0 ? data?.commits[selected]?.hash : undefined;
  data = next;
  rows = layoutGraph(data.commits);
  refsByHash = new Map();
  for (const r of data.refs) { const list = refsByHash.get(r.hash) ?? []; list.push(r); refsByHash.set(r.hash, list); }
  const lanes = Math.min(MAX_LANES, Math.max(1, ...rows.map(r => r.width)));
  document.documentElement.style.setProperty("--graph-w", `${Math.max(64, lanes * LANE + 14)}px`);
  repoName.textContent = data.repo;
  headPill.replaceChildren(icon("branch", 12), data.head.branch ?? (data.head.hash ? `detached at ${data.head.hash.slice(0, 7)}` : "no commits yet"));
  headPill.title = data.head.branch ? `You're on ${data.head.branch}` : "Not on a branch";
  // Branch filter: all branches, or one of them.
  const options = [h("option", { value: "" }, data.remotes ? "All branches" : "All local branches"),
    ...data.refs.filter(r => r.kind !== "tag").map(r => h("option", { value: r.name, selected: r.name === data!.branch }, r.name))];
  branchSelect.replaceChildren(...options);
  branchSelect.value = data.branch;
  spacer.style.height = `${data.commits.length * ROW + (data.more ? ROW : 0)}px`;
  selected = keep ? data.commits.findIndex(c => c.hash === keep) : -1;
  compare = -1;
  askedMore = false;
  runSearch(false);
  render();
  if (!data.commits.length) rowsHost.replaceChildren(h("div", { class: "empty" }, h("strong", {}, "No commits yet"), h("span", {}, "Make your first commit and it will show up here.")));
  send({ type: "rendered", rows: data.commits.length });
}

// ---------- Rows ----------

function render() {
  if (!data) return;
  const top = list.scrollTop, height = list.clientHeight || 600;
  const first = Math.max(0, Math.floor(top / ROW) - 10), last = Math.min(data.commits.length, Math.ceil((top + height) / ROW) + 10);
  const frag = document.createDocumentFragment();
  for (let i = first; i < last; i++) frag.append(rowEl(i));
  if (data.more && last >= data.commits.length) {
    const more = h("div", { class: "row more", style: `top:${data.commits.length * ROW}px` }, h("div", { class: "spinner small" }), "Loading more commits…");
    frag.append(more);
    if (!askedMore) { askedMore = true; send({ type: "more" }); }
  }
  rowsHost.replaceChildren(frag);
}
list.addEventListener("scroll", () => requestAnimationFrame(render));
new ResizeObserver(() => render()).observe(list);

function graphCell(i: number): SVGSVGElement {
  const row = rows[i], c = data!.commits[i];
  const width = Math.min(MAX_LANES, Math.max(1, row.width)) * LANE + 14;
  const el = svg("svg", { class: "g", width, height: ROW, viewBox: `0 0 ${width} ${ROW}` }) as SVGSVGElement;
  const x = (lane: number) => 7 + lane * LANE + LANE / 2, mid = ROW / 2;
  const dashed = c.hash === UNCOMMITTED;
  const line = (d: string, color: number, dash = false) => el.append(svg("path", { d, stroke: laneColor(color), "stroke-width": 2, fill: "none", "stroke-linecap": "round", ...(dash ? { "stroke-dasharray": "3 3" } : {}) }));
  for (const p of row.pass) if (p.lane < MAX_LANES) line(`M${x(p.lane)} 0V${ROW}`, p.color);
  for (const l of row.incoming) if (l.lane < MAX_LANES) line(l.lane === row.col ? `M${x(l.lane)} 0V${mid}` : `M${x(l.lane)} 0C${x(l.lane)} ${mid * 0.85} ${x(row.col)} ${mid * 0.35} ${x(row.col)} ${mid}`, l.color);
  for (const l of row.outgoing) if (l.lane < MAX_LANES) line(l.lane === row.col ? `M${x(row.col)} ${mid}V${ROW}` : `M${x(row.col)} ${mid}C${x(row.col)} ${mid + mid * 0.65} ${x(l.lane)} ${mid + mid * 0.15} ${x(l.lane)} ${ROW}`, l.color, dashed);
  if (row.col < MAX_LANES) {
    const cx = x(row.col), color = laneColor(row.color);
    const isHead = c.hash === data!.head.hash;
    if (dashed) el.append(svg("circle", { cx, cy: mid, r: 5, fill: "var(--bg)", stroke: color, "stroke-width": 2, "stroke-dasharray": "2.5 2" }));
    else if (isHead) { el.append(svg("circle", { cx, cy: mid, r: 7.5, fill: "none", stroke: color, "stroke-width": 1.5, opacity: 0.45 })); el.append(svg("circle", { cx, cy: mid, r: 5, fill: "var(--bg)", stroke: color, "stroke-width": 2.5 })); }
    else if (c.parents.length > 1) el.append(svg("circle", { cx, cy: mid, r: 3.5, fill: color, stroke: "var(--bg)", "stroke-width": 1.5 }));
    else el.append(svg("circle", { cx, cy: mid, r: 4.5, fill: color, stroke: "var(--bg)", "stroke-width": 1.5 }));
  }
  return el;
}

function badges(hash: string, color: number): HTMLElement[] {
  const refs = refsByHash.get(hash) ?? [];
  const out: HTMLElement[] = [];
  const remotesShown = new Set<string>();
  // A local branch and its remote copy on the same commit share one badge.
  const heads = refs.filter(r => r.kind === "head").sort((a, b) => (a.name === data!.head.branch ? -1 : b.name === data!.head.branch ? 1 : a.name.localeCompare(b.name)));
  for (const r of heads) {
    const twin = refs.find(x => x.kind === "remote" && x.name === r.upstream);
    if (twin) remotesShown.add(twin.name);
    const current = r.name === data!.head.branch;
    const el = h("span", { class: `ref head ${current ? "current" : ""}`, style: `--c:${laneColor(color)}`, title: `${current ? "Current branch: " : "Branch "}${r.name}${r.upstream ? ` → ${r.upstream}` : ""}${r.gone ? " (gone from the remote)" : ""}\nDouble-click to check out, right-click for more`, "data-ref": r.name, "data-kind": "head" },
      icon(current ? "check" : "branch", 11), r.name);
    if (twin) el.append(h("span", { class: "twin" }, icon("cloud", 11), r.upstream!.split("/")[0]));
    if (r.ahead || r.behind) el.append(h("span", { class: "track", title: `${r.ahead ?? 0} to push, ${r.behind ?? 0} to pull` }, r.ahead ? `↑${r.ahead}` : "", r.behind ? `↓${r.behind}` : ""));
    out.push(el);
  }
  for (const r of refs.filter(x => x.kind === "remote" && !remotesShown.has(x.name)))
    out.push(h("span", { class: "ref remote", style: `--c:${laneColor(color)}`, title: `Remote branch ${r.name}\nDouble-click to check out`, "data-ref": r.name, "data-kind": "remote" }, icon("cloud", 11), r.name));
  for (const r of refs.filter(x => x.kind === "tag"))
    out.push(h("span", { class: "ref tag", title: `Tag ${r.name}`, "data-ref": r.name, "data-kind": "tag" }, icon("tag", 11), r.name));
  return out;
}

function rowEl(i: number): HTMLElement {
  const c = data!.commits[i];
  const isUncommitted = c.hash === UNCOMMITTED;
  const cls = ["row", i === selected ? "sel" : "", i === compare ? "cmp" : "", hits.includes(i) ? "hit" : "", hits[hit] === i ? "now" : "", isUncommitted ? "wip" : "", c.parents.length > 1 ? "merge" : ""].filter(Boolean).join(" ");
  const el = h("div", { class: cls, style: `top:${i * ROW}px`, role: "row", "data-i": String(i), "aria-selected": i === selected ? "true" : "false" },
    h("span", { class: "c-graph" }, graphCell(i)),
    h("span", { class: "c-desc" }, ...badges(c.hash, rows[i].color), h("span", { class: "subject", title: c.subject }, c.subject)),
    h("span", { class: "c-date", title: new Date(c.date * 1000).toLocaleString() }, isUncommitted ? "" : formatDate(c.date, data!.dateFormat)),
    h("span", { class: "c-author", title: c.email }, isUncommitted ? "" : avatar(c.author), isUncommitted ? "" : c.author),
    h("span", { class: "c-hash" }, isUncommitted ? "" : c.hash.slice(0, 7)));
  return el;
}
function avatar(name: string, size = "") {
  return h("span", { class: `avatar ${size}`, style: `--h:${hue(name)}`, "aria-hidden": "true" }, initials(name));
}

// ---------- Selection and details ----------

function select(i: number, open = true) {
  if (!data || i < 0 || i >= data.commits.length) return;
  selected = i; compare = -1;
  scrollToRow(i);
  render();
  if (open) showDetails();
}
function scrollToRow(i: number) {
  const top = i * ROW;
  if (top < list.scrollTop) list.scrollTop = top - ROW;
  else if (top + ROW > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight + ROW * 2;
}
function showDetails() {
  if (!data || selected < 0) return;
  const c = data.commits[selected];
  const base = compare >= 0 ? data.commits[Math.max(selected, compare)].hash : undefined;
  const hash = compare >= 0 ? data.commits[Math.min(selected, compare)].hash : c.hash;
  details.hidden = false;
  details.style.height = `${detailsHeight}px`;
  details.replaceChildren(h("div", { class: "loading small" }, h("div", { class: "spinner small" }), "Loading…"));
  send({ type: "details", hash, base });
}
function closeDetails() { details.hidden = true; selected = -1; compare = -1; render(); list.focus(); }

function renderDetails(m: { hash: string; base?: string; info?: any; files: FileChange[] }) {
  if (!data) return;
  const close = h("button", { class: "icon close", title: "Close (Esc)", "aria-label": "Close details", onclick: closeDetails }, icon("close", 16));
  const files = fileList(m.files, m.hash, m.base);
  if (m.hash === UNCOMMITTED) {
    details.replaceChildren(h("div", { class: "d-head" }, h("div", {}, h("h2", {}, "Uncommitted changes"), h("p", { class: "muted" }, `${m.files.length} file${m.files.length === 1 ? "" : "s"} changed in your working tree`)), close),
      h("div", { class: "d-body" }, files));
    return;
  }
  if (m.base) {
    const a = data.commits.find(c => c.hash === m.base), b = data.commits.find(c => c.hash === m.hash);
    details.replaceChildren(h("div", { class: "d-head" }, h("div", {}, h("h2", {}, icon("compare", 16), "Comparing two commits"),
      h("p", { class: "muted" }, h("code", {}, m.base.slice(0, 7)), ` ${a?.subject ?? ""}  →  `, h("code", {}, m.hash.slice(0, 7)), ` ${b?.subject ?? ""}`)), close),
      h("div", { class: "d-body" }, files));
    return;
  }
  const info = m.info;
  const [subject, ...rest] = String(info.body).split(/\r?\n/);
  const body = rest.join("\n").trim();
  const meta = h("dl", { class: "meta" },
    h("dt", {}, "Author"), h("dd", {}, avatar(info.author, "sm"), h("span", {}, info.author), h("span", { class: "muted" }, ` <${info.email}>`)),
    h("dt", {}, "Date"), h("dd", {}, new Date(info.date * 1000).toLocaleString(), h("span", { class: "muted" }, `  ·  ${formatDate(info.date, "relative")}`)),
    ...(info.committer !== info.author ? [h("dt", {}, "Committer"), h("dd", {}, info.committer)] : []),
    h("dt", {}, "Commit"), h("dd", {}, h("code", { class: "hash" }, info.hash), h("button", { class: "icon", title: "Copy the hash", "aria-label": "Copy the hash", onclick: () => send({ type: "copy", text: info.hash, what: "the hash" }) }, icon("copy"))),
    ...(info.parents.length ? [h("dt", {}, info.parents.length > 1 ? "Parents" : "Parent"), h("dd", {}, ...info.parents.map((p: string) => h("button", { class: "link", title: "Go to this commit", onclick: () => { const i = data!.commits.findIndex(c => c.hash === p); if (i >= 0) select(i); } }, h("code", {}, p.slice(0, 7)))))] : []));
  const refs = badges(info.hash, rows[selected]?.color ?? 0);
  details.replaceChildren(
    h("div", { class: "d-head" }, h("div", {}, h("h2", {}, subject), refs.length ? h("div", { class: "d-refs" }, ...refs) : null), close),
    h("div", { class: "d-body" }, h("div", { class: "d-info" }, body ? h("pre", { class: "message" }, body) : null, meta), files));
}

function fileList(files: FileChange[], hash: string, base?: string): HTMLElement {
  const total = files.reduce((n, f) => n + (f.added ?? 0) + (f.removed ?? 0), 0);
  const added = files.reduce((n, f) => n + (f.added ?? 0), 0), removed = files.reduce((n, f) => n + (f.removed ?? 0), 0);
  const names: Record<string, string> = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", C: "Copied", U: "Untracked", T: "Type changed" };
  return h("div", { class: "files" },
    h("div", { class: "files-head" }, h("strong", {}, `${files.length} file${files.length === 1 ? "" : "s"} changed`), total ? h("span", { class: "sum" }, h("span", { class: "add" }, `+${added}`), h("span", { class: "del" }, `−${removed}`)) : null),
    h("ul", {}, ...files.map(f => {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
      const name = f.path.slice(dir.length);
      const size = (f.added ?? 0) + (f.removed ?? 0);
      const bar = h("span", { class: "stat-bar", title: f.binary ? "Binary file" : `+${f.added ?? 0} −${f.removed ?? 0}` });
      if (!f.binary && size) { const blocks = Math.max(1, Math.min(5, Math.round(Math.log2(size + 1)))); const green = Math.round(blocks * (f.added ?? 0) / size); for (let k = 0; k < 5; k++) bar.append(h("i", { class: k < green ? "a" : k < blocks ? "d" : "" })); }
      return h("li", {},
        h("button", { class: "file", title: `${names[f.status] ?? f.status}: ${f.oldPath ? `${f.oldPath} → ` : ""}${f.path}\nClick to see the changes`, onclick: () => send({ type: "diff", hash, base, file: f }) },
          h("span", { class: `st st-${f.status}` }, f.status), h("span", { class: "fname" }, name), h("span", { class: "fdir" }, f.oldPath ? `${f.oldPath} → ${dir}` : dir),
          f.binary ? h("span", { class: "bin" }, "binary") : h("span", { class: "nums" }, f.added ? h("span", { class: "add" }, `+${f.added}`) : null, f.removed ? h("span", { class: "del" }, `−${f.removed}`) : null), bar),
        f.status !== "D" ? h("button", { class: "icon open", title: "Open the file", "aria-label": `Open ${name}`, onclick: () => send({ type: "openFile", path: f.path }) }, icon("file")) : null);
    })));
}

// Resize the details pane by dragging the handle above it.
handle.addEventListener("pointerdown", e => {
  if (details.hidden) return;
  handle.setPointerCapture(e.pointerId);
  const startY = e.clientY, start = details.offsetHeight;
  const move = (ev: PointerEvent) => { detailsHeight = Math.max(140, Math.min(window.innerHeight - 160, start + startY - ev.clientY)); details.style.height = `${detailsHeight}px`; };
  const up = () => { handle.removeEventListener("pointermove", move); vscode.setState({ ...(vscode.getState() ?? {}), detailsHeight }); };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up, { once: true });
});

// ---------- Search ----------

function runSearch(jump = true) {
  hits = [];
  hit = -1;
  const q = searchInput.value;
  if (data && q.trim()) data.commits.forEach((c, i) => { if (c.hash !== UNCOMMITTED && matches(c, q)) hits.push(i); });
  hitCount.textContent = q.trim() ? (hits.length ? `${hits.length}` : "0") : "";
  if (jump && hits.length) stepHit(1); else render();
}
function stepHit(dir: number) {
  if (!hits.length) return;
  hit = (hit + dir + hits.length) % hits.length;
  hitCount.textContent = `${hit + 1}/${hits.length}`;
  const i = hits[hit];
  list.scrollTop = Math.max(0, i * ROW - list.clientHeight / 2);
  render();
}
let searchTimer: number | undefined;
searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => runSearch(), 150); });
searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); if (hit >= 0 && e.altKey) select(hits[hit]); else stepHit(e.shiftKey ? -1 : 1); }
  if (e.key === "Escape") { searchInput.value = ""; runSearch(); list.focus(); }
});
branchSelect.addEventListener("change", () => send({ type: "branch", branch: branchSelect.value }));

// ---------- Menus ----------

interface Item { label: string; action?: () => void; danger?: boolean; hint?: string }
function menu(x: number, y: number, title: string, items: (Item | "-")[]) {
  closeMenu();
  const el = h("div", { class: "menu", role: "menu" }, h("div", { class: "menu-title" }, title),
    ...items.map(item => item === "-" ? h("div", { class: "sep" }) : h("button", { class: `mi ${item.danger ? "danger" : ""}`, role: "menuitem", onclick: () => { closeMenu(); item.action?.(); } }, h("span", {}, item.label), item.hint ? h("kbd", {}, item.hint) : null)));
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  el.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  (el.querySelector(".mi") as HTMLElement)?.focus();
}
function closeMenu() { document.querySelector(".menu")?.remove(); }
const act = (action: string, extra: Record<string, unknown>) => send({ type: "action", action, ...extra });

function commitMenu(x: number, y: number, i: number) {
  const c = data!.commits[i];
  if (c.hash === UNCOMMITTED) return menu(x, y, "Uncommitted changes", [
    { label: "Open Source Control", action: () => act("openScm", {}) },
    { label: "Stash Changes", action: () => act("stash", {}) },
  ]);
  const merge = c.parents.length > 1;
  const payload = { hash: c.hash, subject: c.subject, merge };
  const canCompare = selected >= 0 && selected !== i && data!.commits[selected].hash !== UNCOMMITTED;
  const items: (Item | "-")[] = [
    { label: "Create Branch Here…", action: () => act("createBranch", payload) },
    { label: "Create Tag Here…", action: () => act("createTag", payload) },
    { label: "Check Out This Commit…", action: () => act("checkoutCommit", payload) },
    "-",
    { label: "Cherry-Pick…", action: () => act("cherryPick", payload) },
    { label: "Revert…", action: () => act("revert", payload) },
    { label: `Reset ${data!.head.branch ?? "HEAD"} to Here…`, action: () => act("reset", payload), danger: true },
    "-",
    ...(canCompare ? [{ label: "Compare with Selected", action: () => { compare = i; render(); showDetails(); }, hint: "Ctrl+Click" }] : []),
    { label: "Copy Hash", action: () => send({ type: "copy", text: c.hash, what: "the hash" }) },
    { label: "Copy Message", action: () => send({ type: "copy", text: c.subject, what: "the message" }) },
  ];
  menu(x, y, `Commit ${c.hash.slice(0, 7)}`, items);
}
function refMenu(x: number, y: number, ref: string, kind: string) {
  const current = kind === "head" && ref === data!.head.branch;
  if (kind === "tag") return menu(x, y, `Tag ${ref}`, [
    { label: "Push Tag", action: () => act("pushTag", { ref }) },
    { label: "Copy Name", action: () => send({ type: "copy", text: ref, what: "the tag name" }) },
    "-",
    { label: "Delete Tag…", action: () => act("deleteTag", { ref }), danger: true },
  ]);
  if (kind === "remote") return menu(x, y, `Remote branch ${ref}`, [
    { label: "Check Out", action: () => act("checkoutBranch", { ref, kind }) },
    { label: `Merge into ${data!.head.branch ?? "HEAD"}…`, action: () => act("mergeBranch", { ref }) },
    { label: "Copy Name", action: () => send({ type: "copy", text: ref, what: "the branch name" }) },
  ]);
  const items: (Item | "-")[] = current ? [] : [{ label: "Check Out", action: () => act("checkoutBranch", { ref, kind }) }, { label: `Merge into ${data!.head.branch ?? "HEAD"}…`, action: () => act("mergeBranch", { ref }) }];
  menu(x, y, `Branch ${ref}`, [...items, { label: "Push", action: () => act("pushBranch", { ref }) }, { label: "Rename…", action: () => act("renameBranch", { ref }) },
    { label: "Copy Name", action: () => send({ type: "copy", text: ref, what: "the branch name" }) },
    ...(current ? [] : ["-" as const, { label: "Delete…", action: () => act("deleteBranch", { ref }), danger: true }])]);
}

// ---------- Mouse and keys ----------

rowsHost.addEventListener("click", e => {
  const row = (e.target as HTMLElement).closest<HTMLElement>(".row[data-i]");
  if (!row) return;
  // Double-click a branch label to check it out. (The first click redraws the row, so count clicks instead of waiting for dblclick.)
  const badge = (e.target as HTMLElement).closest<HTMLElement>(".ref[data-ref]");
  if (badge && e.detail === 2) {
    if (badge.dataset.kind !== "tag" && badge.dataset.ref !== data?.head.branch) act("checkoutBranch", { ref: badge.dataset.ref, kind: badge.dataset.kind });
    return;
  }
  const i = Number(row.dataset.i);
  if ((e.ctrlKey || e.metaKey) && selected >= 0 && selected !== i && data!.commits[i].hash !== UNCOMMITTED && data!.commits[selected].hash !== UNCOMMITTED) { compare = i; render(); showDetails(); return; }
  if (i === selected && !details.hidden && compare < 0) { closeDetails(); return; }
  select(i);
});
document.addEventListener("contextmenu", e => {
  const target = e.target as HTMLElement;
  const badge = target.closest<HTMLElement>(".ref[data-ref]");
  const row = target.closest<HTMLElement>(".row[data-i]");
  if (!badge && !row) return;
  e.preventDefault();
  if (badge) refMenu(e.clientX, e.clientY, badge.dataset.ref!, badge.dataset.kind!);
  else commitMenu(e.clientX, e.clientY, Number(row!.dataset.i));
});
document.addEventListener("mousedown", e => { if (!(e.target as HTMLElement).closest(".menu")) closeMenu(); });
document.addEventListener("keydown", e => {
  const menuOpen = document.querySelector(".menu");
  if (menuOpen) {
    const items = Array.from(menuOpen.querySelectorAll<HTMLElement>(".mi")), at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { closeMenu(); e.preventDefault(); }
    if (e.key === "ArrowDown") { items[(at + 1) % items.length]?.focus(); e.preventDefault(); }
    if (e.key === "ArrowUp") { items[(at - 1 + items.length) % items.length]?.focus(); e.preventDefault(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); searchInput.focus(); searchInput.select(); return; }
  if (document.activeElement === searchInput || document.activeElement === branchSelect) return;
  if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); select(Math.min((data?.commits.length ?? 1) - 1, selected + 1), !details.hidden); }
  else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); select(Math.max(0, selected - 1), !details.hidden); }
  else if (e.key === "Enter" && selected >= 0) { e.preventDefault(); if (details.hidden) showDetails(); else closeDetails(); }
  else if (e.key === "Escape" && !details.hidden) { e.preventDefault(); closeDetails(); }
  else if (e.key === "Home") { e.preventDefault(); select(0, !details.hidden); }
  else if (e.key === "End" && data) { e.preventDefault(); select(data.commits.length - 1, !details.hidden); }
});

// ---------- Messages from the extension ----------

window.addEventListener("message", ({ data: m }) => {
  switch (m.type) {
    case "graph": if (!document.querySelector(".bar")) chrome(); setGraph(m); break;
    case "details": if (!details.hidden) renderDetails(m); break;
    case "toast": toast(m.text); break;
    case "busy": busyBar.classList.toggle("on", !!m.busy); break;
  }
});
send({ type: "ready" });
