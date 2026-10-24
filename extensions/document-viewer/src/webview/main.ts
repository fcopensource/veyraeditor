import JSZip from "jszip";
import { renderAsync } from "docx-preview";
import { readPptx, drawSlide, slideText, type Deck } from "./pptx";
import { readXlsx, type Cell, type Workbook, type Sheet } from "./xlsx";
import { columnName, compareCells, detectDelimiter, parseCsv } from "./sheets";

/* The viewer: one toolbar for every format, and a view for Word, PowerPoint, Excel and CSV files. */

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): any; setState(s: unknown): void };
const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;
const send = (m: unknown) => vscode.postMessage(m);

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
// Line icons, 16 x 16, drawn with currentColor so they follow the VS Code theme.
const ICONS: Record<string, string> = {
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.2 10.2 13.5 13.5"/>',
  up: '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
  down: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  minus: '<path d="M4 8h8"/>',
  plus: '<path d="M4 8h8M8 4v8"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>',
  open: '<path d="M9.5 2.5h4v4M13.5 2.5 8 8M12 9.5v2.5a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 3 12V5.5A1.5 1.5 0 0 1 4.5 4H7"/>',
  play: '<path d="M5 3.2v9.6L12.8 8z" fill="currentColor" stroke="none"/>',
  filter: '<path d="M2.5 3.5h11L9.3 8.4v3.8l-2.6 1.3V8.4z"/>',
  notes: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5 6h6M5 8.5h6M5 11h3.5"/>',
  folder: '<path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h2.6l1.4 1.6h4A1.5 1.5 0 0 1 13.5 6v5.5A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
  table: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M2.5 9.75h11M6.5 6.5V13"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  alert: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.1"/>',
  check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
};
function icon(name: string, size = 16): SVGSVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("viewBox", "0 0 16 16"); el.setAttribute("width", String(size)); el.setAttribute("height", String(size));
  el.setAttribute("fill", "none"); el.setAttribute("stroke", "currentColor"); el.setAttribute("stroke-width", "1.4");
  el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round"); el.setAttribute("aria-hidden", "true");
  el.innerHTML = ICONS[name] ?? "";
  return el;
}
/** The coloured tile for a file type: W, P and X for Office files, a grid for tables. */
function fileTile(ext: string, large = false): HTMLElement {
  const kind = kindOf(ext);
  const letter = kind === "word" ? "W" : kind === "powerpoint" ? "P" : kind === "excel" ? "X" : "";
  return h("span", { class: `tile ${kind} ${large ? "large" : ""}`, "aria-hidden": "true" }, letter || icon(kind === "table" ? "table" : "alert", large ? 24 : 14));
}
function kindOf(ext: string): string {
  if (/^(docx|docm|dotx|doc)$/.test(ext)) return "word";
  if (/^(pptx|pptm|ppsx|ppt)$/.test(ext)) return "powerpoint";
  if (/^(xlsx|xlsm|xls)$/.test(ext)) return "excel";
  if (/^(csv|tsv)$/.test(ext)) return "table";
  return "other";
}
function loading(file: string, ext: string): HTMLElement {
  document.body.dataset.kind = kindOf(ext);
  return h("div", { class: "loading", role: "status" }, h("div", { class: "spinner" }), h("span", {}, `Opening ${file}…`));
}
let toastTimer: number | undefined;
function toast(text: string) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, icon("check", 14), text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2200);
}

// ---------- Shared chrome: toolbar, search and zoom ----------

interface View { content: HTMLElement; stats: string; text: () => string; zoomable: boolean; canvas?: boolean; sidebar?: HTMLElement; onZoom?: (z: number) => void; extraTools?: HTMLElement[] }
const KIND: Record<string, string> = { docx: "Word", docm: "Word", dotx: "Word", pptx: "PowerPoint", pptm: "PowerPoint", ppsx: "PowerPoint", xlsx: "Excel", xlsm: "Excel", csv: "CSV", tsv: "TSV" };
let zoom = 1;

function chrome(file: string, ext: string, view: View) {
  document.body.dataset.kind = kindOf(ext);
  const searchInput = h("input", { class: "search", type: "search", placeholder: "Find (Ctrl+F)", "aria-label": "Find in document" }) as HTMLInputElement;
  const count = h("span", { class: "count" });
  const zoomLabel = h("button", { class: "zoom-label", title: "Reset zoom (Ctrl+0)", onclick: () => setZoom(1) }, "100%");
  const setZoom = (z: number) => {
    zoom = Math.min(4, Math.max(0.25, Math.round(z * 100) / 100));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    if (view.onZoom) view.onZoom(zoom); else view.content.style.setProperty("--zoom", String(zoom));
    vscode.setState({ ...(vscode.getState() ?? {}), zoom });
  };
  const bar = h("header", { class: "bar" },
    fileTile(ext),
    h("div", { class: "title" },
      h("strong", { class: "file", title: file }, file),
      h("span", { class: "stats" }, h("span", { class: "kind-name" }, KIND[ext] ?? ext.toUpperCase()), view.stats)),
    h("div", { class: "grow" }),
    ...(view.extraTools ?? []),
    h("div", { class: "find pill" }, h("span", { class: "pill-icon" }, icon("search", 14)), searchInput, count,
      h("button", { class: "icon", title: "Previous match (Shift+Enter)", "aria-label": "Previous match", onclick: () => step(-1) }, icon("up")),
      h("button", { class: "icon", title: "Next match (Enter)", "aria-label": "Next match", onclick: () => step(1) }, icon("down"))),
    view.zoomable ? h("div", { class: "zoom pill" },
      h("button", { class: "icon", title: "Zoom out (Ctrl+-)", "aria-label": "Zoom out", onclick: () => setZoom(zoom - 0.1) }, icon("minus")), zoomLabel,
      h("button", { class: "icon", title: "Zoom in (Ctrl+=)", "aria-label": "Zoom in", onclick: () => setZoom(zoom + 0.1) }, icon("plus"))) : null,
    h("div", { class: "actions" },
      h("button", { class: "btn ghost", title: "Copy all the text", onclick: () => { send({ type: "copy", text: view.text() }); } }, icon("copy", 14), h("span", { class: "label" }, "Copy text")),
      h("button", { class: "btn ghost", title: "Open with the app your computer uses for this file", onclick: () => send({ type: "openDefault" }) }, icon("open", 14), h("span", { class: "label" }, "Open in app"))));
  const body = h("div", { class: "body" }, view.sidebar ?? null, h("main", { class: `content ${view.canvas ? "canvas" : ""}` }, view.content));
  app.replaceChildren(bar, body);

  // Search: highlight every match in the rendered document, step through them.
  let marks: HTMLElement[] = [], current = -1;
  const clear = () => { for (const m of marks) { const t = document.createTextNode(m.textContent ?? ""); m.replaceWith(t); t.parentNode?.normalize(); } marks = []; current = -1; };
  const run = () => {
    clear();
    const q = searchInput.value.trim().toLowerCase();
    count.textContent = "";
    if (q.length < 1) return;
    const walker = document.createTreeWalker(view.content, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.textContent?.toLowerCase().includes(q) && !(n.parentElement?.closest("script,style")) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      let text = node.textContent ?? "", at: number, cursor: Text = node;
      while ((at = text.toLowerCase().indexOf(q)) >= 0 && marks.length < 2000) {
        const match = cursor.splitText(at);
        const rest = match.splitText(q.length);
        const mark = h("mark", { class: "hit" }, match.textContent ?? "");
        match.replaceWith(mark);
        marks.push(mark);
        cursor = rest; text = rest.textContent ?? "";
      }
    }
    count.textContent = marks.length ? `${marks.length}` : "0";
    if (marks.length) step(1);
  };
  const step = (dir: number) => {
    if (!marks.length) return;
    marks[current]?.classList.remove("now");
    current = (current + dir + marks.length) % marks.length;
    marks[current].classList.add("now");
    marks[current].scrollIntoView({ block: "center", behavior: "smooth" });
    count.textContent = `${current + 1}/${marks.length}`;
  };
  let timer: number | undefined;
  searchInput.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(run, 180); });
  searchInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === "Escape") { searchInput.value = ""; run(); } });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) { e.preventDefault(); setZoom(zoom + 0.1); }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); setZoom(zoom - 0.1); }
    if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setZoom(1); }
  });
  if (view.zoomable) setZoom(vscode.getState()?.zoom ?? 1);
}

// ---------- Word ----------

async function showWord(bytes: Uint8Array, file: string, ext: string, theme: string) {
  const pages = h("div", { class: `docx-host ${theme === "dark" ? "dark-pages" : ""}` });
  const styles = h("div");
  app.replaceChildren(loading(file, ext), styles, pages);
  await renderAsync(new Blob([bytes as BlobPart]), pages, styles, {
    className: "docx", inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
    renderFootnotes: true, renderEndnotes: true, renderComments: false, useBase64URL: true, experimental: true,
  } as any);
  await applyTableBorders(bytes, pages);
  const pageCount = pages.querySelectorAll("section.docx").length;
  const text = () => Array.from(pages.querySelectorAll("section.docx article")).map(a => (a as HTMLElement).innerText).join("\n\n");
  const words = text().split(/\s+/).filter(Boolean).length;
  // Outline from heading paragraphs.
  const headings = Array.from(pages.querySelectorAll<HTMLElement>("article p")).filter(p => /heading|title/i.test(p.className) && p.textContent?.trim());
  const shown = headings.slice(0, 300);
  const links = shown.map(p => {
    const level = Number(/heading(\d)/i.exec(p.className)?.[1] ?? 1);
    return h("button", { class: `ol l${Math.min(level, 4)}`, title: p.textContent!.trim(), onclick: () => p.scrollIntoView({ behavior: "smooth", block: "start" }) }, p.textContent!.trim());
  });
  const sidebar = links.length ? h("nav", { class: "outline", "aria-label": "Outline" }, h("small", {}, "OUTLINE"), ...links) : undefined;
  const content = h("div", { class: "docx-zoom" }, styles, pages);
  chrome(file, ext, { content, canvas: true, stats: `${pageCount} page${pageCount === 1 ? "" : "s"} · ${words.toLocaleString()} words`, text, zoomable: true, sidebar, onZoom: z => { pages.style.zoom = String(z); } });
  // The outline marks the section you're reading.
  const scroller = content.closest("main")!;
  let queued = false;
  const track = () => {
    queued = false;
    const top = scroller.getBoundingClientRect().top + 90;
    let at = 0;
    shown.forEach((p, i) => { if (p.getBoundingClientRect().top <= top) at = i; });
    links.forEach((l, i) => l.classList.toggle("on", i === at));
  };
  scroller.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(track); } });
  if (links.length) track();
}

/**
 * docx-preview draws borders that come from a table style, but not ones written on the table itself
 * (<w:tblBorders> in the document). Read those and draw them, matching tables by their order in the file.
 */
async function applyTableBorders(bytes: Uint8Array, pages: HTMLElement) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string");
  if (!xml) return;
  const tables = Array.from(new DOMParser().parseFromString(xml, "application/xml").getElementsByTagNameNS(W, "tbl"));
  const rendered = Array.from(pages.querySelectorAll<HTMLTableElement>("article table"));
  if (tables.length !== rendered.length) return; // can't pair them safely
  const css = (b: Element | undefined) => {
    const val = b?.getAttributeNS(W, "val");
    if (!b || !val || val === "nil" || val === "none") return undefined;
    const pt = Math.max(0.5, Number(b.getAttributeNS(W, "sz") ?? 4) / 8);
    const color = b.getAttributeNS(W, "color");
    const style = /double/.test(val) ? "double" : /dot/i.test(val) ? "dotted" : /dash/i.test(val) ? "dashed" : "solid";
    return `${style === "double" ? Math.max(pt, 2.25) : pt}pt ${style} ${color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : "#000"}`;
  };
  tables.forEach((tbl, i) => {
    const borders = Array.from(tbl.childNodes).find((n): n is Element => (n as Element).localName === "tblPr");
    const set = borders && Array.from(borders.childNodes).find((n): n is Element => (n as Element).localName === "tblBorders");
    if (!set) return;
    const side = (name: string) => css(Array.from(set.children).find(c => c.localName === name));
    const table = rendered[i];
    table.style.borderCollapse = "collapse";
    const outer: [string, string | undefined][] = [["borderTop", side("top")], ["borderBottom", side("bottom")], ["borderLeft", side("left") ?? side("start")], ["borderRight", side("right") ?? side("end")]];
    for (const [prop, value] of outer) if (value && !table.style[prop as any]) table.style[prop as any] = value;
    const h = side("insideH"), v = side("insideV");
    for (const row of Array.from(table.rows)) for (const cell of Array.from(row.cells)) {
      if (h) { if (!cell.style.borderTop) cell.style.borderTop = h; if (!cell.style.borderBottom) cell.style.borderBottom = h; }
      if (v) { if (!cell.style.borderLeft) cell.style.borderLeft = v; if (!cell.style.borderRight) cell.style.borderRight = v; }
    }
  });
}

// ---------- PowerPoint ----------

async function showPowerPoint(bytes: Uint8Array, file: string, ext: string) {
  const deck: Deck = await readPptx(await JSZip.loadAsync(bytes));
  const holder = h("div", { class: "deck" });
  const thumbs = h("nav", { class: "thumbs", "aria-label": "Slides" });
  const notes = h("div", { class: "notes" });
  let current = 0;
  const fit = (el: HTMLElement, width: number) => { const s = width / deck.width; el.style.transform = `scale(${s})`; (el.parentElement as HTMLElement).style.height = `${deck.height * s}px`; (el.parentElement as HTMLElement).style.width = `${width}px`; };
  const slideWidth = () => Math.max(240, (holder.clientWidth || 900) - 48) * zoom;
  const pages = deck.slides.map((slide, i) => {
    const frame = h("div", { class: "slide-frame", id: `slide-${i + 1}` }, drawSlide(slide, deck));
    const wrap = h("section", { class: `slide-wrap ${slide.hidden ? "hidden-slide" : ""}`, "data-index": String(i), "aria-label": `Slide ${i + 1}` }, h("div", { class: "slide-num" }, `${i + 1}${slide.hidden ? " · hidden" : ""}`), frame);
    const thumb = h("button", { class: "thumb", title: `Slide ${i + 1}`, "aria-label": `Slide ${i + 1}`, onclick: () => go(i) }, h("span", {}, String(i + 1)), h("div", { class: "thumb-frame" }, drawSlide(slide, deck)));
    thumbs.append(thumb);
    holder.append(wrap);
    return { frame, thumb, wrap };
  });
  const layout = () => {
    const w = slideWidth();
    for (const p of pages) fit(p.frame.firstElementChild as HTMLElement, w);
    for (const p of pages) fit(p.thumb.querySelector(".thumb-frame")!.firstElementChild as HTMLElement, 148);
  };
  const go = (i: number) => {
    current = Math.max(0, Math.min(deck.slides.length - 1, i));
    pages.forEach((p, k) => p.thumb.classList.toggle("on", k === current));
    pages[current].wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    notes.textContent = deck.slides[current].notes || "No speaker notes.";
    notes.classList.toggle("empty", !deck.slides[current].notes);
  };
  // The topmost slide that's mostly in view is the current one: its thumbnail and notes follow scrolling.
  const inView = new Map<number, number>();
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) inView.set(Number((e.target as HTMLElement).dataset.index), e.intersectionRatio);
    const top = [...inView.entries()].filter(([, r]) => r >= 0.5).map(([i]) => i).sort((a, b) => a - b)[0];
    if (top === undefined || top === current) return;
    current = top;
    pages.forEach((p, k) => p.thumb.classList.toggle("on", k === current));
    notes.textContent = deck.slides[current].notes || "No speaker notes.";
    notes.classList.toggle("empty", !deck.slides[current].notes);
  }, { threshold: [0, 0.5, 1] });
  pages.forEach(p => observer.observe(p.wrap));

  // Present: one slide filling the panel, arrows and space to move, Esc to leave.
  const present = () => {
    let i = current;
    const stage = h("div", { class: "present", tabindex: "0", role: "dialog", "aria-label": "Presenting" });
    const counter = h("div", { class: "present-count" });
    const progress = h("div", { class: "present-progress" });
    const show = () => {
      const slide = drawSlide(deck.slides[i], deck);
      const s = Math.min(window.innerWidth / deck.width, window.innerHeight / deck.height);
      slide.style.transform = `scale(${s})`;
      const box = h("div", { class: "present-box" }, slide);
      box.style.width = `${deck.width * s}px`; box.style.height = `${deck.height * s}px`;
      stage.replaceChildren(box, counter, progress);
      counter.textContent = `${i + 1} / ${deck.slides.length} · Esc to exit`;
      progress.style.width = `${((i + 1) / deck.slides.length) * 100}%`;
    };
    // The pointer and the counter fade away while you talk, and come back when the mouse moves.
    let idle: number | undefined;
    const wake = () => { stage.classList.remove("idle"); clearTimeout(idle); idle = window.setTimeout(() => stage.classList.add("idle"), 1800); };
    stage.addEventListener("mousemove", wake);
    wake();
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { i = Math.min(deck.slides.length - 1, i + 1); show(); e.preventDefault(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { i = Math.max(0, i - 1); show(); e.preventDefault(); }
      else if (e.key === "Home") { i = 0; show(); } else if (e.key === "End") { i = deck.slides.length - 1; show(); }
      else if (e.key === "Escape") { close(); }
    };
    const close = () => { document.removeEventListener("keydown", key, true); clearTimeout(idle); stage.remove(); go(i); };
    stage.addEventListener("click", e => { i = e.clientX < window.innerWidth / 3 ? Math.max(0, i - 1) : Math.min(deck.slides.length - 1, i + 1); show(); });
    document.addEventListener("keydown", key, true);
    document.body.append(stage);
    show();
    stage.focus();
  };
  const sidebar = h("div", { class: "side" }, thumbs);
  // Speaker notes fold away to give the slides more room; the choice is remembered.
  const notesBox = h("aside", { class: `notes-box ${vscode.getState()?.notesHidden ? "collapsed" : ""}` },
    h("button", { class: "notes-head", "aria-label": "Show or hide speaker notes", onclick: () => {
      const hidden = notesBox.classList.toggle("collapsed");
      vscode.setState({ ...(vscode.getState() ?? {}), notesHidden: hidden });
    } }, icon("notes", 14), h("small", {}, "SPEAKER NOTES"), h("span", { class: "chev" }, icon("down", 14))),
    notes);
  const content = h("div", { class: "deck-host" }, holder, notesBox);
  chrome(file, ext, {
    content, sidebar, zoomable: true, canvas: true,
    stats: `${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}`,
    text: () => deck.slides.map((s, i) => `Slide ${i + 1}\n${slideText(s)}${s.notes ? `\n\nNotes: ${s.notes}` : ""}`).join("\n\n"),
    onZoom: () => layout(),
    extraTools: [h("button", { class: "btn primary", title: "Present from the current slide", onclick: present }, icon("play", 13), h("span", {}, "Present"))],
  });
  new ResizeObserver(() => layout()).observe(holder);
  layout();
  go(0);
}

// ---------- Excel ----------

async function showExcel(bytes: Uint8Array, file: string, ext: string, theme: string) {
  const book: Workbook = await readXlsx(await JSZip.loadAsync(bytes));
  const visible = book.sheets.filter(s => !s.hidden);
  if (!visible.length) throw new Error("This workbook has no visible sheets.");
  const grid = h("div", { class: `grid-host ${theme === "dark" ? "" : "paper"}` });
  const tabs = h("nav", { class: "tabs", "aria-label": "Sheets" });
  const formula = h("div", { class: "formula" }, h("span", { class: "ref", title: "Cell" }, ""), h("span", { class: "fx" }, "fx"), h("span", { class: "fval" }, "Click a cell to see its value and formula."));
  let active = 0;
  const showSheet = (i: number) => {
    active = i;
    Array.from(tabs.children).forEach((t, k) => t.classList.toggle("on", k === i));
    grid.replaceChildren(sheetTable(visible[i], (ref, cell) => {
      formula.children[0].textContent = ref;
      formula.children[2].textContent = cell?.formula ? `=${cell.formula}` : cell?.value !== undefined ? String(cell.value) : "";
    }));
    formula.children[0].textContent = ""; formula.children[2].textContent = "Click a cell to see its value and formula.";
  };
  visible.forEach((s, i) => tabs.append(h("button", { class: "tab", onclick: () => showSheet(i) }, s.name)));
  const content = h("div", { class: "book" }, formula, grid, tabs);
  const cells = visible.reduce((n, s) => n + [...s.rows.values()].reduce((m, r) => m + r.size, 0), 0);
  chrome(file, ext, {
    content, zoomable: true,
    stats: `${visible.length} sheet${visible.length === 1 ? "" : "s"} · ${cells.toLocaleString()} cells`,
    text: () => sheetToTsv(visible[active]),
    onZoom: z => { grid.style.setProperty("--zoom", String(z)); },
  });
  showSheet(0);
}
const MAX_ROWS = 20000, MAX_COLS = 400;
function sheetTable(sheet: Sheet, onPick: (ref: string, cell: Cell | undefined) => void): HTMLElement {
  if (sheet.maxRow < 0) return h("p", { class: "empty" }, "This sheet is empty.");
  // A small sheet still shows a page of grid around it, as Excel does.
  const rows = Math.max(30, Math.min(sheet.maxRow + 1, MAX_ROWS)), cols = Math.max(12, Math.min(sheet.maxCol + 1, MAX_COLS));
  const covered = new Set<string>(), spans = new Map<string, [number, number]>();
  for (const m of sheet.merges) {
    spans.set(`${m.r1}:${m.c1}`, [m.r2 - m.r1 + 1, m.c2 - m.c1 + 1]);
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`);
  }
  const table = h("table", { class: "grid" });
  const colgroup = h("colgroup", {}, h("col", { class: "rh" }));
  for (let c = 0; c < cols; c++) { const col = h("col"); col.style.width = `calc(${Math.max(40, Math.round((sheet.widths.get(c) ?? 9.14) * 7 + 5))}px * var(--zoom))`; colgroup.append(col); }
  table.append(colgroup);
  const head = h("tr", {}, h("th", { class: "corner" }));
  for (let c = 0; c < cols; c++) head.append(h("th", { class: "ch" }, columnName(c)));
  table.append(h("thead", {}, head));
  const body = h("tbody");
  for (let r = 0; r < rows; r++) {
    const tr = h("tr", {}, h("th", { class: "rn" }, String(r + 1)));
    const row = sheet.rows.get(r);
    for (let c = 0; c < cols; c++) {
      if (covered.has(`${r}:${c}`)) continue;
      const cell = row?.get(c);
      const td = h("td", { "data-ref": `${columnName(c)}${r + 1}` }, cell?.text ?? "");
      const span = spans.get(`${r}:${c}`);
      if (span) { td.rowSpan = span[0]; td.colSpan = span[1]; }
      if (cell) {
        if (cell.bold) td.style.fontWeight = "700";
        if (cell.italic) td.style.fontStyle = "italic";
        if (cell.color && cell.color !== "#000000") td.style.color = cell.color;
        if (cell.fill) { td.style.background = cell.fill; td.classList.add("filled"); }
        td.style.textAlign = cell.align && cell.align !== "general" ? cell.align : cell.number ? "right" : "left";
        if (cell.formula) td.classList.add("has-formula");
      }
      td.addEventListener("click", () => {
        table.querySelectorAll(".sel, .hl").forEach(el => el.classList.remove("sel", "hl"));
        td.classList.add("sel");
        // Like Excel, light up the cell's column letter and row number.
        head.children[c + 1]?.classList.add("hl");
        tr.firstElementChild?.classList.add("hl");
        onPick(td.dataset.ref!, cell);
      });
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  const wrap = h("div", { class: "grid-scroll" }, table);
  if (sheet.maxRow + 1 > MAX_ROWS || sheet.maxCol + 1 > MAX_COLS) wrap.append(h("p", { class: "more" }, `Showing the first ${MAX_ROWS.toLocaleString()} rows and ${MAX_COLS} columns. Open the file in its app to see the rest.`));
  return wrap;
}
function sheetToTsv(sheet: Sheet) {
  const lines: string[] = [];
  for (let r = 0; r <= sheet.maxRow; r++) { const row = sheet.rows.get(r); const cells: string[] = []; for (let c = 0; c <= sheet.maxCol; c++) cells.push(row?.get(c)?.text ?? ""); lines.push(cells.join("\t").replace(/\t+$/, "")); }
  return lines.join("\n");
}

// ---------- CSV / TSV ----------

function showCsv(bytes: Uint8Array, file: string, ext: string) {
  const text = new TextDecoder("utf-8").decode(bytes);
  const delimiter = detectDelimiter(text, file);
  const all = parseCsv(text, delimiter);
  const width = Math.max(...all.map(r => r.length), 0);
  const header = all[0] ?? [];
  let rows = all.slice(1);
  let sortCol = -1, sortDir = 1, filter = "";
  const grid = h("div", { class: "grid-scroll" });
  // Column widths from the longest value in the first rows, so a long column doesn't squeeze the others.
  const colgroup = h("colgroup", {}, h("col", { class: "rh" }));
  for (let c = 0; c < width; c++) {
    const longest = Math.max(...all.slice(0, 200).map(r => (r[c] ?? "").length));
    const col = h("col");
    col.style.width = `calc(${Math.min(320, Math.max(56, Math.round(longest * 7.5 + 22)))}px * var(--zoom))`;
    colgroup.append(col);
  }
  const draw = () => {
    const shown = (filter ? rows.filter(r => r.some(c => c.toLowerCase().includes(filter))) : rows).slice(0, MAX_ROWS);
    const table = h("table", { class: "grid csv" }, colgroup.cloneNode(true));
    const head = h("tr", {}, h("th", { class: "corner" }));
    for (let c = 0; c < width; c++) head.append(h("th", { class: `ch sortable ${sortCol === c ? (sortDir > 0 ? "asc" : "desc") : ""}`, title: "Sort", onclick: () => { sortDir = sortCol === c ? -sortDir : 1; sortCol = c; rows = [...rows].sort((a, b) => sortDir * compareCells(a[c] ?? "", b[c] ?? "")); draw(); } }, header[c] ?? columnName(c)));
    table.append(h("thead", {}, head));
    const body = h("tbody");
    shown.forEach((r, i) => { const tr = h("tr", {}, h("th", { class: "rn" }, String(i + 1))); for (let c = 0; c < width; c++) { const v = r[c] ?? ""; tr.append(h("td", { class: /^-?[\d,.]+%?$/.test(v.trim()) && v.trim() ? "num" : "" }, v)); } body.append(tr); });
    table.append(body);
    grid.replaceChildren(table);
    filterCount.textContent = filter ? `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} rows` : "";
  };
  const filterCount = h("span", { class: "count" });
  const filterInput = h("input", { class: "search filter", type: "search", placeholder: "Filter rows", oninput: (e: Event) => { filter = (e.target as HTMLInputElement).value.toLowerCase(); draw(); } });
  const content = h("div", { class: "book" }, grid);
  const names: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };
  chrome(file, ext, {
    content, zoomable: true,
    stats: `${rows.length.toLocaleString()} rows · ${width} columns · ${names[delimiter]}-separated`,
    text: () => text,
    onZoom: z => grid.style.setProperty("--zoom", String(z)),
    extraTools: [h("div", { class: "find pill" }, h("span", { class: "pill-icon" }, icon("filter", 14)), filterInput, filterCount)],
  });
  draw();
}

// ---------- Older formats and errors ----------

function showMessage(file: string, ext: string, title: string, detail: string, badge: "alert" | "lock" = "alert") {
  document.body.dataset.kind = kindOf(ext);
  app.replaceChildren(h("div", { class: "message-wrap" }, h("div", { class: "message" },
    h("div", { class: "msg-art" }, fileTile(ext, true), h("span", { class: `msg-badge ${badge}` }, icon(badge, 14))),
    h("h2", {}, title), h("p", {}, detail),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: () => send({ type: "openDefault" }) }, icon("open", 14), h("span", {}, "Open in default app")),
      h("button", { class: "btn", onclick: () => send({ type: "reveal" }) }, icon("folder", 14), h("span", {}, "Show in folder"))),
    h("small", { class: "muted file-name" }, file))));
}

window.addEventListener("message", async ({ data: msg }) => {
  if (msg.type === "toast") { toast(msg.text); return; }
  if (msg.type !== "open") return;
  const { file, ext, theme } = msg;
  const bytes: Uint8Array = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);
  try {
    if (["doc", "ppt", "xls"].includes(ext)) {
      showMessage(file, ext, `This is an older ${ext === "doc" ? "Word" : ext === "ppt" ? "PowerPoint" : "Excel"} file (.${ext})`, `Files from Office 97–2003 use a closed binary format this viewer can't read. Open it in its app and save it as .${ext}x to view it here.`);
      send({ type: "rendered" });
      return;
    }
    if (ext === "csv" || ext === "tsv") showCsv(bytes, file, ext);
    else if (/^(docx|docm|dotx)$/.test(ext)) await showWord(bytes, file, ext, theme);
    else if (/^(pptx|pptm|ppsx)$/.test(ext)) await showPowerPoint(bytes, file, ext);
    else if (/^(xlsx|xlsm)$/.test(ext)) await showExcel(bytes, file, ext, theme);
    else showMessage(file, ext, "This file type isn't supported", "Open it in its app instead.");
    send({ type: "rendered" });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    const encrypted = /encrypt|password|Corrupted zip|End of data reached|can't find end of central directory/i.test(message) && bytes[0] === 0xd0 && bytes[1] === 0xcf;
    showMessage(file, ext, encrypted ? "This file is password-protected" : "This file couldn't be opened", encrypted ? "Open it in its app and enter the password there." : `It may be damaged, or use a feature this viewer doesn't read yet. (${message})`, encrypted ? "lock" : "alert");
    send({ type: "rendered", error: message });
  }
});
send({ type: "ready" });
