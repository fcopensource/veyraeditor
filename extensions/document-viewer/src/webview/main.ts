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
let toastTimer: number | undefined;
function toast(text: string) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 2200);
}

// ---------- Shared chrome: toolbar, search and zoom ----------

interface View { content: HTMLElement; stats: string; text: () => string; zoomable: boolean; sidebar?: HTMLElement; onZoom?: (z: number) => void; extraTools?: HTMLElement[] }
const KIND: Record<string, string> = { docx: "Word", docm: "Word", dotx: "Word", pptx: "PowerPoint", pptm: "PowerPoint", ppsx: "PowerPoint", xlsx: "Excel", xlsm: "Excel", csv: "CSV", tsv: "TSV" };
let zoom = 1;

function chrome(file: string, ext: string, view: View) {
  const searchInput = h("input", { class: "search", type: "search", placeholder: "Find (Ctrl+F)", "aria-label": "Find in document" }) as HTMLInputElement;
  const count = h("span", { class: "count" });
  const zoomLabel = h("span", { class: "zoom-label" }, "100%");
  const setZoom = (z: number) => {
    zoom = Math.min(4, Math.max(0.25, Math.round(z * 100) / 100));
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    if (view.onZoom) view.onZoom(zoom); else view.content.style.setProperty("--zoom", String(zoom));
    vscode.setState({ ...(vscode.getState() ?? {}), zoom });
  };
  const bar = h("header", { class: "bar" },
    h("span", { class: `badge ${KIND[ext]?.toLowerCase() ?? ""}` }, KIND[ext] ?? ext.toUpperCase()),
    h("strong", { class: "file", title: file }, file),
    h("span", { class: "stats" }, view.stats),
    h("div", { class: "grow" }),
    ...(view.extraTools ?? []),
    h("div", { class: "find" }, searchInput, count,
      h("button", { class: "icon", title: "Previous (Shift+Enter)", onclick: () => step(-1) }, "↑"),
      h("button", { class: "icon", title: "Next (Enter)", onclick: () => step(1) }, "↓")),
    view.zoomable ? h("div", { class: "zoom" }, h("button", { class: "icon", title: "Zoom out", onclick: () => setZoom(zoom - 0.1) }, "−"), zoomLabel, h("button", { class: "icon", title: "Zoom in", onclick: () => setZoom(zoom + 0.1) }, "+")) : null,
    h("button", { class: "btn", title: "Copy all the text", onclick: () => { send({ type: "copy", text: view.text() }); } }, "Copy text"),
    h("button", { class: "btn", title: "Open with the app your computer uses for this file", onclick: () => send({ type: "openDefault" }) }, "Open in app"));
  const body = h("div", { class: "body" }, view.sidebar ?? null, h("main", { class: "content" }, view.content));
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
  app.replaceChildren(h("div", { class: "loading" }, "Opening…"), styles, pages);
  await renderAsync(new Blob([bytes as BlobPart]), pages, styles, {
    className: "docx", inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true,
    renderFootnotes: true, renderEndnotes: true, renderComments: false, useBase64URL: true, experimental: true,
  } as any);
  const pageCount = pages.querySelectorAll("section.docx").length;
  const text = () => Array.from(pages.querySelectorAll("section.docx article")).map(a => (a as HTMLElement).innerText).join("\n\n");
  const words = text().split(/\s+/).filter(Boolean).length;
  // Outline from heading paragraphs.
  const headings = Array.from(pages.querySelectorAll<HTMLElement>("article p")).filter(p => /heading|title/i.test(p.className) && p.textContent?.trim());
  const sidebar = headings.length ? h("nav", { class: "outline", "aria-label": "Outline" }, h("small", {}, "OUTLINE"), ...headings.slice(0, 300).map(p => {
    const level = Number(/heading(\d)/i.exec(p.className)?.[1] ?? 1);
    return h("button", { class: `ol l${Math.min(level, 4)}`, onclick: () => p.scrollIntoView({ behavior: "smooth", block: "start" }) }, p.textContent!.trim());
  })) : undefined;
  const content = h("div", { class: "docx-zoom" }, styles, pages);
  chrome(file, ext, { content, stats: `${pageCount} page${pageCount === 1 ? "" : "s"} · ${words.toLocaleString()} words`, text, zoomable: true, sidebar, onZoom: z => { pages.style.zoom = String(z); } });
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
    const wrap = h("section", { class: `slide-wrap ${slide.hidden ? "hidden-slide" : ""}`, "data-index": String(i) }, h("div", { class: "slide-num" }, `${i + 1}${slide.hidden ? " · hidden" : ""}`), frame);
    const thumb = h("button", { class: "thumb", title: `Slide ${i + 1}`, onclick: () => go(i) }, h("span", {}, String(i + 1)), h("div", { class: "thumb-frame" }, drawSlide(slide, deck)));
    thumbs.append(thumb);
    holder.append(wrap);
    return { frame, thumb, wrap };
  });
  const layout = () => {
    const w = slideWidth();
    for (const p of pages) fit(p.frame.firstElementChild as HTMLElement, w);
    for (const p of pages) fit(p.thumb.querySelector(".thumb-frame")!.firstElementChild as HTMLElement, 150);
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
    const stage = h("div", { class: "present", tabindex: "0" });
    const counter = h("div", { class: "present-count" });
    const show = () => {
      const slide = drawSlide(deck.slides[i], deck);
      const s = Math.min(window.innerWidth / deck.width, window.innerHeight / deck.height);
      slide.style.transform = `scale(${s})`;
      const box = h("div", { class: "present-box" }, slide);
      box.style.width = `${deck.width * s}px`; box.style.height = `${deck.height * s}px`;
      stage.replaceChildren(box, counter);
      counter.textContent = `${i + 1} / ${deck.slides.length} · Esc to exit`;
    };
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { i = Math.min(deck.slides.length - 1, i + 1); show(); e.preventDefault(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { i = Math.max(0, i - 1); show(); e.preventDefault(); }
      else if (e.key === "Home") { i = 0; show(); } else if (e.key === "End") { i = deck.slides.length - 1; show(); }
      else if (e.key === "Escape") { close(); }
    };
    const close = () => { document.removeEventListener("keydown", key, true); stage.remove(); go(i); };
    stage.addEventListener("click", e => { i = e.clientX < window.innerWidth / 3 ? Math.max(0, i - 1) : Math.min(deck.slides.length - 1, i + 1); show(); });
    document.addEventListener("keydown", key, true);
    document.body.append(stage);
    show();
    stage.focus();
  };
  const sidebar = h("div", { class: "side" }, thumbs);
  const content = h("div", { class: "deck-host" }, holder, h("aside", { class: "notes-box" }, h("small", {}, "SPEAKER NOTES"), notes));
  chrome(file, ext, {
    content, sidebar, zoomable: true,
    stats: `${deck.slides.length} slide${deck.slides.length === 1 ? "" : "s"}`,
    text: () => deck.slides.map((s, i) => `Slide ${i + 1}\n${slideText(s)}${s.notes ? `\n\nNotes: ${s.notes}` : ""}`).join("\n\n"),
    onZoom: () => layout(),
    extraTools: [h("button", { class: "btn primary", title: "Present from the current slide", onclick: present }, "▶ Present")],
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
  const formula = h("div", { class: "formula" }, h("span", { class: "ref" }, ""), h("span", { class: "fx" }, "fx"), h("span", { class: "fval" }, "Click a cell to see its value and formula."));
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
  const rows = Math.min(sheet.maxRow + 1, MAX_ROWS), cols = Math.min(sheet.maxCol + 1, MAX_COLS);
  if (rows <= 0) return h("p", { class: "empty" }, "This sheet is empty.");
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
      td.addEventListener("click", () => { table.querySelector("td.sel")?.classList.remove("sel"); td.classList.add("sel"); onPick(td.dataset.ref!, cell); });
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
    extraTools: [h("div", { class: "find" }, filterInput, filterCount)],
  });
  draw();
}

// ---------- Older formats and errors ----------

function showMessage(file: string, title: string, detail: string) {
  app.replaceChildren(h("div", { class: "message" },
    h("div", { class: "msg-icon" }, "!"), h("h2", {}, title), h("p", {}, detail),
    h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => send({ type: "openDefault" }) }, "Open in default app"), h("button", { class: "btn", onclick: () => send({ type: "reveal" }) }, "Show in folder")),
    h("small", { class: "muted" }, file)));
}

window.addEventListener("message", async ({ data: msg }) => {
  if (msg.type === "toast") { toast(msg.text); return; }
  if (msg.type !== "open") return;
  const { file, ext, theme } = msg;
  const bytes: Uint8Array = msg.bytes instanceof Uint8Array ? msg.bytes : new Uint8Array(msg.bytes);
  try {
    if (["doc", "ppt", "xls"].includes(ext)) {
      showMessage(file, `This is an older ${ext === "doc" ? "Word" : ext === "ppt" ? "PowerPoint" : "Excel"} file (.${ext})`, `Files from Office 97–2003 use a closed binary format this viewer can't read. Open it in its app and save it as .${ext}x to view it here.`);
      send({ type: "rendered" });
      return;
    }
    if (ext === "csv" || ext === "tsv") showCsv(bytes, file, ext);
    else if (/^(docx|docm|dotx)$/.test(ext)) await showWord(bytes, file, ext, theme);
    else if (/^(pptx|pptm|ppsx)$/.test(ext)) await showPowerPoint(bytes, file, ext);
    else if (/^(xlsx|xlsm)$/.test(ext)) await showExcel(bytes, file, ext, theme);
    else showMessage(file, "This file type isn't supported", "Open it in its app instead.");
    send({ type: "rendered" });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    const encrypted = /encrypt|password|Corrupted zip|End of data reached|can't find end of central directory/i.test(message) && bytes[0] === 0xd0 && bytes[1] === 0xcf;
    showMessage(file, encrypted ? "This file is password-protected" : "This file couldn't be opened", encrypted ? "Open it in its app and enter the password there." : `It may be damaged, or use a feature this viewer doesn't read yet. (${message})`);
    send({ type: "rendered", error: message });
  }
});
send({ type: "ready" });
