import type JSZip from "jszip";
import { EMU_PER_PX } from "./sheets";

/* Reads .pptx slides (with their layout and master), and draws each one as positioned HTML. */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface Run { text: string; bold?: boolean; italic?: boolean; underline?: boolean; size?: number; color?: string; font?: string; br?: boolean }
export interface Para { align: string; runs: Run[]; bullet?: string; level: number; size?: number }
interface Box { x: number; y: number; w: number; h: number; rot: number }
export type El =
  | ({ kind: "shape"; fill?: string; line?: string; lineWidth?: number; radius?: string; paras: Para[]; anchor: string; inset: [number, number, number, number]; vertical?: boolean } & Box)
  | ({ kind: "image"; src?: string; label: string } & Box)
  | ({ kind: "table"; cols: number[]; rows: { h: number; cells: { paras: Para[]; fill?: string; span: number }[] }[] } & Box);
export interface Slide { index: number; elements: El[]; background: string; backgroundImage?: string; notes: string; hidden: boolean }
export interface Deck { width: number; height: number; slides: Slide[] }

const xml = (t: string) => new DOMParser().parseFromString(t, "application/xml");
const kids = (el: Element | null | undefined, ns: string, name: string) => (el ? Array.from(el.children).filter(c => c.namespaceURI === ns && c.localName === name) : []);
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0];
const deep = (el: Element | Document | null | undefined, ns: string, name: string) => (el ? el.getElementsByTagNameNS(ns, name)[0] : undefined);
const emu = (v: string | null | undefined) => (Number(v) || 0) / EMU_PER_PX;

// ---------- Colours ----------

type Theme = Record<string, string>;
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) { const v = Math.round(l * 255); return `#${[v, v, v].map(x => x.toString(16).padStart(2, "0")).join("")}`; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return `#${[f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
/** A colour element (srgbClr, schemeClr, sysClr, prstClr) with lumMod/lumOff/tint/shade/alpha applied. */
function colorOf(holder: Element | null | undefined, theme: Theme): string | undefined {
  if (!holder) return undefined;
  const c = Array.from(holder.children).find(e => e.namespaceURI === A && /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr)$/.test(e.localName));
  if (!c) return undefined;
  let hex = c.localName === "srgbClr" ? `#${c.getAttribute("val")}`
    : c.localName === "sysClr" ? `#${c.getAttribute("lastClr") ?? (c.getAttribute("val") === "window" ? "FFFFFF" : "000000")}`
    : c.localName === "schemeClr" ? theme[c.getAttribute("val") ?? ""] ?? "#000000"
    : c.localName === "prstClr" ? ({ black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", gray: "#808080" } as Record<string, string>)[c.getAttribute("val") ?? ""] ?? "#000000"
    : "#000000";
  hex = hex.toLowerCase();
  let [h, s, l] = hexToHsl(hex);
  let alpha = 1;
  for (const mod of Array.from(c.children)) {
    const v = Number(mod.getAttribute("val")) / 100000;
    if (mod.localName === "lumMod") l *= v;
    else if (mod.localName === "lumOff") l += v;
    else if (mod.localName === "tint") l = l + (1 - l) * (1 - v);
    else if (mod.localName === "shade") l *= v;
    else if (mod.localName === "alpha") alpha = v;
  }
  const out = hslToHex(h, s, Math.min(1, Math.max(0, l)));
  if (alpha < 1) { const n = parseInt(out.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha.toFixed(2)})`; }
  return out;
}
/** The fill of a shape properties element: solid, the first gradient stop, none, or undefined (not set). */
function fillOf(spPr: Element | undefined, theme: Theme): string | null | undefined {
  if (!spPr) return undefined;
  if (kid(spPr, A, "noFill")) return null;
  const solid = kid(spPr, A, "solidFill");
  if (solid) return colorOf(solid, theme);
  const grad = kid(spPr, A, "gradFill");
  if (grad) { const stops = Array.from(grad.getElementsByTagNameNS(A, "gs")); return stops.length ? `linear-gradient(${90 + (Number(deep(grad, A, "lin")?.getAttribute("ang") ?? 0) / 60000)}deg, ${stops.map(s => `${colorOf(s, theme)} ${Number(s.getAttribute("pos")) / 1000}%`).join(", ")})` : undefined; }
  return undefined;
}

// ---------- Text ----------

const DEFAULT_SIZES: Record<string, number[]> = { title: [44], body: [28, 24, 20, 20, 20], other: [18] };
function parasOf(txBody: Element | undefined, theme: Theme, kind: "title" | "body" | "other", inherited?: Para[]): Para[] {
  if (!txBody) return [];
  const scale = Number(deep(kid(txBody, A, "bodyPr"), A, "normAutofit")?.getAttribute("fontScale") ?? 100000) / 100000;
  return kids(txBody, A, "p").map((p, i) => {
    const pPr = kid(p, A, "pPr");
    const level = Number(pPr?.getAttribute("lvl") ?? 0);
    const sizes = DEFAULT_SIZES[kind];
    const base = inherited?.[0]?.size ?? sizes[Math.min(level, sizes.length - 1)];
    const runs: Run[] = [];
    for (const r of Array.from(p.children)) {
      if (r.namespaceURI !== A) continue;
      if (r.localName === "br") { runs.push({ text: "", br: true }); continue; }
      if (r.localName !== "r" && r.localName !== "fld") continue;
      const rPr = kid(r, A, "rPr");
      const size = rPr?.getAttribute("sz") ? (Number(rPr.getAttribute("sz")) / 100) * scale : base * scale;
      runs.push({
        text: kid(r, A, "t")?.textContent ?? "",
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        underline: !!rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none",
        size, color: colorOf(kid(rPr, A, "solidFill"), theme), font: kid(rPr, A, "latin")?.getAttribute("typeface") ?? undefined,
      });
    }
    const end = kid(p, A, "endParaRPr")?.getAttribute("sz");
    const bullet = kid(pPr, A, "buNone") ? undefined : kid(pPr, A, "buChar")?.getAttribute("char") ?? (kid(pPr, A, "buAutoNum") ? `${i + 1}.` : kind === "body" && runs.some(r => r.text.trim()) ? "•" : undefined);
    const align = pPr?.getAttribute("algn") ?? inherited?.[0]?.align;
    return { align: ({ ctr: "center", r: "right", just: "justify", center: "center", right: "right", justify: "justify" } as Record<string, string>)[align ?? ""] ?? "left", runs, bullet, level, size: end ? (Number(end) / 100) * scale : base * scale };
  });
}

// ---------- Reading ----------

interface Part { doc: Document; path: string; rels: Map<string, { target: string; type: string }> }
async function part(zip: JSZip, path: string): Promise<Part | undefined> {
  const text = await zip.file(path)?.async("string");
  if (!text) return undefined;
  const dir = path.slice(0, path.lastIndexOf("/") + 1), name = path.slice(path.lastIndexOf("/") + 1);
  const relText = await zip.file(`${dir}_rels/${name}.rels`)?.async("string");
  const rels = new Map<string, { target: string; type: string }>();
  if (relText) for (const r of Array.from(xml(relText).getElementsByTagName("Relationship"))) {
    const t = r.getAttribute("Target") ?? "";
    rels.set(r.getAttribute("Id") ?? "", { target: r.getAttribute("TargetMode") === "External" ? t : resolvePath(dir, t), type: (r.getAttribute("Type") ?? "").split("/").pop() ?? "" });
  }
  return { doc: xml(text), path, rels };
}
function resolvePath(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dir + target).split("/");
  const out: string[] = [];
  for (const p of parts) { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); }
  return out.join("/");
}
const relOfType = (p: Part | undefined, type: string) => p && [...p.rels.values()].find(r => r.type === type)?.target;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", svg: "image/svg+xml", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff" };

export async function readPptx(zip: JSZip): Promise<Deck> {
  const pres = await part(zip, "ppt/presentation.xml");
  if (!pres) throw new Error("This file has no ppt/presentation.xml. It may not be a PowerPoint file.");
  const size = deep(pres.doc, P, "sldSz");
  const width = emu(size?.getAttribute("cx") ?? "12192000"), height = emu(size?.getAttribute("cy") ?? "6858000");
  const images = new Map<string, string | undefined>();
  const image = async (path: string) => {
    if (!images.has(path)) {
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const data = MIME[ext] ? await zip.file(path)?.async("blob") : undefined;
      images.set(path, data ? URL.createObjectURL(new Blob([data], { type: MIME[ext] })) : undefined);
    }
    return images.get(path);
  };
  const themes = new Map<string, Theme>();
  const themeOf = async (master: Part | undefined) => {
    const path = relOfType(master, "theme");
    if (!path) return {};
    if (!themes.has(path)) {
      const t = await part(zip, path);
      const scheme = deep(t?.doc, A, "clrScheme");
      const theme: Theme = {};
      for (const c of Array.from(scheme?.children ?? [])) theme[c.localName] = colorOf(c, {}) ?? "#000000";
      Object.assign(theme, { tx1: theme.dk1, bg1: theme.lt1, tx2: theme.dk2, bg2: theme.lt2 });
      themes.set(path, theme);
    }
    return themes.get(path)!;
  };

  const ids = kids(deep(pres.doc, P, "sldIdLst"), P, "sldId");
  const slides: Slide[] = [];
  for (const [index, id] of ids.entries()) {
    const path = pres.rels.get(id.getAttributeNS(R, "id") ?? "")?.target;
    const slide = path ? await part(zip, path) : undefined;
    if (!slide) continue;
    const layout = await part(zip, relOfType(slide, "slideLayout") ?? "");
    const master = await part(zip, relOfType(layout, "slideMaster") ?? "");
    const theme = await themeOf(master);
    const parts = [slide, layout, master].filter(Boolean) as Part[];
    // Placeholders on the layout and master give position and default text size to the slide's placeholders.
    const placeholders = (p?: Part) => Array.from(p?.doc.getElementsByTagNameNS(P, "sp") ?? []).map(sp => ({ sp, ph: deep(kid(sp, P, "nvSpPr"), P, "ph") })).filter(x => x.ph);
    const inheritFrom = [...placeholders(layout), ...placeholders(master)];
    /** The layout's and then the master's matching placeholders, nearest first: each may set only some properties. */
    const findInherited = (ph: Element) => {
      const type = ph.getAttribute("type") ?? "body", idx = ph.getAttribute("idx");
      const same = (t: string | null) => (t ?? "body") === type || (type === "ctrTitle" && t === "title") || (type === "subTitle" && (t ?? "body") === "body");
      return inheritFrom.filter(x => (idx !== null && x.ph!.getAttribute("idx") === idx) || same(x.ph!.getAttribute("type")));
    };
    const elements: El[] = [];
    const showMaster = kid(slide.doc.documentElement, P, "cSld") && slide.doc.documentElement.getAttribute("showMasterSp") !== "0";
    // Decorations (logos, lines) on the master and layout, then the slide's own shapes on top.
    if (showMaster) for (const p of [master, layout]) if (p) await collect(kid(kid(p.doc.documentElement, P, "cSld"), P, "spTree"), p, true);
    await collect(kid(kid(slide.doc.documentElement, P, "cSld"), P, "spTree"), slide, false);

    async function collect(tree: Element | undefined, owner: Part, decorationOnly: boolean, group?: { ox: number; oy: number; sx: number; sy: number; cx: number; cy: number }) {
      for (const node of Array.from(tree?.children ?? [])) {
        const xfrmOf = (el: Element | undefined) => {
          const x = el && (deep(kid(el, P, "spPr"), A, "xfrm") ?? deep(kid(el, P, "xfrm"), A, "off")?.parentElement ?? kid(el, P, "xfrm"));
          const off = deep(x, A, "off"), ext = deep(x, A, "ext");
          return off && ext ? { x: emu(off.getAttribute("x")), y: emu(off.getAttribute("y")), w: emu(ext.getAttribute("cx")), h: emu(ext.getAttribute("cy")), rot: Number(x!.getAttribute("rot") ?? 0) / 60000 } : undefined;
        };
        const place = (b: Box) => (group ? { x: group.ox + (b.x - group.cx) * group.sx, y: group.oy + (b.y - group.cy) * group.sy, w: b.w * group.sx, h: b.h * group.sy, rot: b.rot } : b);
        if (node.namespaceURI !== P) continue;
        if (node.localName === "grpSp") {
          const x = deep(kid(node, P, "grpSpPr"), A, "xfrm");
          const off = deep(x, A, "off"), ext = deep(x, A, "ext"), choff = deep(x, A, "chOff"), chext = deep(x, A, "chExt");
          const g = { ox: emu(off?.getAttribute("x")), oy: emu(off?.getAttribute("y")), cx: emu(choff?.getAttribute("x")), cy: emu(choff?.getAttribute("y")), sx: emu(ext?.getAttribute("cx")) / (emu(chext?.getAttribute("cx")) || 1), sy: emu(ext?.getAttribute("cy")) / (emu(chext?.getAttribute("cy")) || 1) };
          const outer = group ? { ...g, ox: group.ox + (g.ox - group.cx) * group.sx, oy: group.oy + (g.oy - group.cy) * group.sy, sx: g.sx * group.sx, sy: g.sy * group.sy } : g;
          await collect(node, owner, decorationOnly, outer);
          continue;
        }
        if (node.localName === "sp") {
          const ph = deep(kid(node, P, "nvSpPr"), P, "ph");
          if (decorationOnly && ph) continue; // placeholders on layouts and masters only hold defaults
          const chain = ph && !decorationOnly ? findInherited(ph) : [];
          const box = xfrmOf(node) ?? chain.map(x => xfrmOf(x.sp)).find(Boolean);
          const inherited = chain.find(x => kid(x.sp, P, "txBody"));
          if (!box) continue;
          const spPr = kid(node, P, "spPr");
          const fill = fillOf(spPr, theme) ?? (deep(kid(node, P, "style"), A, "fillRef") && !kid(spPr, A, "noFill") && !ph ? colorOf(deep(kid(node, P, "style"), A, "fillRef"), theme) : undefined);
          const ln = kid(spPr, A, "ln");
          const line = ln && !kid(ln, A, "noFill") ? colorOf(kid(ln, A, "solidFill"), theme) : undefined;
          const geom = kid(spPr, A, "prstGeom")?.getAttribute("prst") ?? "rect";
          const type = ph?.getAttribute("type") ?? (ph ? "body" : "");
          const kind = /title|ctrTitle/i.test(type) ? "title" : type === "body" || type === "subTitle" || (ph && !type) ? "body" : "other";
          const bodyPr = kid(kid(node, P, "txBody"), A, "bodyPr");
          const ins = (a: string, d: number) => emu(bodyPr?.getAttribute(a) ?? String(d));
          const inheritedParas = inherited ? parasOf(kid(inherited.sp, P, "txBody"), theme, kind) : undefined;
          const paras = parasOf(kid(node, P, "txBody"), theme, kind, inheritedParas?.length ? inheritedParas : undefined);
          if (kind === "title") for (const p of paras) if (p.align === "left" && /ctrTitle/.test(type)) p.align = "center";
          const at = place(box);
          // A rounded rectangle's corners are a share of its shorter side: 16.667% unless the file says otherwise.
          const adj = /val (d+)/.exec(deep(kid(spPr, A, "prstGeom"), A, "gd")?.getAttribute("fmla") ?? "")?.[1];
          elements.push({
            kind: "shape", ...at, fill: fill ?? undefined, line, lineWidth: ln ? Math.max(1, emu(ln.getAttribute("w") ?? "12700")) : undefined,
            radius: geom === "ellipse" ? "50%" : geom === "roundRect" ? `${(Math.min(at.w, at.h) * Number(adj ?? 16667)) / 100000}px` : undefined,
            paras, anchor: ({ ctr: "center", b: "flex-end" } as Record<string, string>)[bodyPr?.getAttribute("anchor") ?? (kind === "title" ? "ctr" : "t")] ?? "flex-start",
            inset: [ins("tIns", 45720), ins("rIns", 91440), ins("bIns", 45720), ins("lIns", 91440)], vertical: /vert/.test(bodyPr?.getAttribute("vert") ?? "horz") && bodyPr?.getAttribute("vert") !== "horz",
          });
          continue;
        }
        if (node.localName === "pic") {
          const box = xfrmOf(node);
          if (!box) continue;
          const embed = deep(kid(node, P, "blipFill"), A, "blip")?.getAttributeNS(R, "embed");
          const target = embed ? owner.rels.get(embed)?.target : undefined;
          elements.push({ kind: "image", ...place(box), src: target ? await image(target) : undefined, label: target?.split("/").pop() ?? "image" });
          continue;
        }
        if (node.localName === "graphicFrame") {
          const box = xfrmOf(node);
          const tbl = deep(node, A, "tbl");
          if (!box) continue;
          if (!tbl) { elements.push({ kind: "image", ...place(box), label: "chart or diagram" }); continue; }
          const cols = kids(kid(tbl, A, "tblGrid"), A, "gridCol").map(c => emu(c.getAttribute("w")));
          const rows = kids(tbl, A, "tr").map(tr => ({
            h: emu(tr.getAttribute("h")),
            cells: kids(tr, A, "tc").filter(tc => tc.getAttribute("hMerge") !== "1" && tc.getAttribute("vMerge") !== "1").map(tc => ({ paras: parasOf(kid(tc, A, "txBody"), theme, "other"), fill: fillOf(kid(tc, A, "tcPr"), theme) ?? undefined, span: Number(tc.getAttribute("gridSpan") ?? 1) })),
          }));
          elements.push({ kind: "table", ...place(box), cols, rows });
        }
      }
    }

    // Background: the slide's, else the layout's, else the master's.
    let background = "#ffffff", backgroundImage: string | undefined;
    for (const p of parts) {
      const bg = kid(kid(p.doc.documentElement, P, "cSld"), P, "bg");
      if (!bg) continue;
      const bgPr = kid(bg, P, "bgPr");
      const fill = fillOf(bgPr, theme);
      const blip = deep(kid(bgPr, A, "blipFill"), A, "blip")?.getAttributeNS(R, "embed");
      if (blip) { const t = p.rels.get(blip)?.target; backgroundImage = t ? await image(t) : undefined; }
      else if (fill) background = fill;
      else if (kid(bg, P, "bgRef")) background = colorOf(kid(bg, P, "bgRef"), theme) ?? background;
      break;
    }
    const notesPart = await part(zip, relOfType(slide, "notesSlide") ?? "");
    const notes = notesPart ? Array.from(notesPart.doc.getElementsByTagNameNS(P, "sp")).filter(sp => (deep(sp, P, "ph")?.getAttribute("type") ?? (deep(sp, P, "ph") ? "body" : "")) === "body").map(sp => Array.from(sp.getElementsByTagNameNS(A, "p")).map(p => Array.from(p.getElementsByTagNameNS(A, "t")).map(t => t.textContent).join("")).join("\n")).join("\n").trim() : "";
    slides.push({ index, elements, background, backgroundImage, notes, hidden: slide.doc.documentElement.getAttribute("show") === "0" });
  }
  return { width, height, slides };
}

// ---------- Drawing ----------

const PT_TO_PX = 96 / 72;
function drawParas(paras: Para[], into: HTMLElement) {
  for (const p of paras) {
    const div = document.createElement("div");
    div.className = "pp";
    div.style.textAlign = p.align;
    if (p.level) div.style.paddingLeft = `${p.level * 28}px`;
    const size = p.runs.find(r => r.size)?.size ?? p.size ?? 18;
    div.style.fontSize = `${size * PT_TO_PX}px`;
    if (p.bullet && p.runs.some(r => r.text.trim())) { const b = document.createElement("span"); b.className = "bu"; b.textContent = p.bullet; div.append(b); }
    for (const r of p.runs) {
      if (r.br) { div.append(document.createElement("br")); continue; }
      const span = document.createElement("span");
      span.textContent = r.text;
      if (r.bold) span.style.fontWeight = "700";
      if (r.italic) span.style.fontStyle = "italic";
      if (r.underline) span.style.textDecoration = "underline";
      if (r.size) span.style.fontSize = `${r.size * PT_TO_PX}px`;
      if (r.color) span.style.color = r.color;
      if (r.font && !/^\+/.test(r.font)) span.style.fontFamily = `"${r.font}", var(--slide-font)`;
      div.append(span);
    }
    if (!p.runs.length || p.runs.every(r => !r.text && !r.br)) div.innerHTML = "&nbsp;";
    into.append(div);
  }
}
/** One slide as an absolutely positioned page, at its native size in pixels (scale it with CSS). */
export function drawSlide(slide: Slide, deck: Deck): HTMLElement {
  const page = document.createElement("div");
  page.className = "slide";
  page.style.width = `${deck.width}px`;
  page.style.height = `${deck.height}px`;
  page.style.background = slide.backgroundImage ? `center / cover no-repeat url("${slide.backgroundImage}")` : slide.background;
  for (const el of slide.elements) {
    const box = document.createElement("div");
    box.className = `el ${el.kind}`;
    Object.assign(box.style, { left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px`, transform: el.rot ? `rotate(${el.rot}deg)` : "" });
    if (el.kind === "shape") {
      if (el.fill) box.style.background = el.fill;
      if (el.line) box.style.border = `${el.lineWidth}px solid ${el.line}`;
      if (el.radius) box.style.borderRadius = el.radius;
      box.style.justifyContent = el.anchor;
      box.style.padding = el.inset.map(v => `${v}px`).join(" ");
      if (el.vertical) box.style.writingMode = "vertical-rl";
      drawParas(el.paras, box);
    } else if (el.kind === "image") {
      if (el.src) { const img = document.createElement("img"); img.src = el.src; img.alt = el.label; box.append(img); }
      else { box.classList.add("missing"); box.textContent = el.label; }
    } else {
      const table = document.createElement("table");
      const cg = document.createElement("colgroup");
      for (const w of el.cols) { const c = document.createElement("col"); c.style.width = `${w}px`; cg.append(c); }
      table.append(cg);
      for (const row of el.rows) {
        const tr = document.createElement("tr");
        tr.style.height = `${row.h}px`;
        for (const cell of row.cells) { const td = document.createElement("td"); if (cell.span > 1) td.colSpan = cell.span; if (cell.fill) td.style.background = cell.fill; drawParas(cell.paras, td); tr.append(td); }
        table.append(tr);
      }
      box.append(table);
    }
    page.append(box);
  }
  return page;
}
/** All the text of a slide, for search and copy. */
export const slideText = (slide: Slide) => slide.elements.flatMap(e => (e.kind === "shape" ? e.paras : e.kind === "table" ? e.rows.flatMap(r => r.cells.flatMap(c => c.paras)) : [])).map(p => p.runs.map(r => (r.br ? "\n" : r.text)).join("")).filter(Boolean).join("\n");
