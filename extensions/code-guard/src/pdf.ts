// A small PDF writer with no dependencies: A4 pages, the standard Helvetica and Courier fonts (measured exactly for
// wrapping), filled and stroked shapes, colours and compressed content. Coordinates start at the top-left, in points.
import { deflateSync } from "node:zlib";

export type Font = "regular" | "bold" | "mono" | "monoBold";
export type RGB = string; // "#rrggbb"
const FONT_NAMES: Record<Font, [string, string]> = { regular: ["F1", "Helvetica"], bold: ["F2", "Helvetica-Bold"], mono: ["F3", "Courier"], monoBold: ["F4", "Courier-Bold"] };

// Helvetica and Helvetica-Bold advance widths (per 1000) for characters 32-126, from the standard font metrics.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
// Characters outside ASCII that the standard fonts have (WinAnsi code, width regular, width bold).
const EXTRA: Record<string, [number, number, number]> = {
  "…": [0x85, 1000, 1000], "\u2013": [0x96, 556, 556], "\u2014": [0x97, 1000, 1000], "\u2018": [0x91, 222, 278], "\u2019": [0x92, 222, 278],
  "\u201c": [0x93, 333, 500], "\u201d": [0x94, 333, 500], "\u2022": [0x95, 350, 350], "·": [0xb7, 278, 278], "\u00a9": [0xa9, 737, 737], "\u00d7": [0xd7, 584, 584],
};

/** Map text to what the standard fonts can show: known extras kept, arrows spelled out, anything else as "?". */
function normalize(text: string) {
  return text.replace(/\u2192/g, "->").replace(/\u2190/g, "<-").replace(/\u2713|\u2714/g, "OK").replace(/[\t]/g, "    ")
    .replace(/[^\x20-\x7e]/g, c => (EXTRA[c] ? c : "?"));
}

export function textWidth(text: string, font: Font, size: number) {
  if (font === "mono" || font === "monoBold") return normalize(text).length * 600 * size / 1000;
  const table = font === "bold" ? HELV_BOLD : HELV;
  let w = 0;
  for (const c of normalize(text)) w += EXTRA[c] ? EXTRA[c][font === "bold" ? 2 : 1] : table[c.charCodeAt(0) - 32] ?? 556;
  return w * size / 1000;
}

/** Split text into lines no wider than maxWidth, breaking at spaces (and inside words that are too long). */
export function wrap(text: string, font: Font, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (textWidth(tryLine, font, size) <= maxWidth) { line = tryLine; continue; }
      if (line) lines.push(line);
      line = word;
      while (textWidth(line, font, size) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), font, size) > maxWidth) cut--;
        lines.push(line.slice(0, cut)); line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

const hex = (c: RGB) => [1, 3, 5].map(i => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const encode = (text: string) => "<" + [...normalize(text)].map(c => (EXTRA[c] ? EXTRA[c][0] : c.charCodeAt(0)).toString(16).padStart(2, "0")).join("") + ">";

export class Page {
  readonly ops: string[] = [];
  readonly links: Array<{ x: number; y: number; w: number; h: number; url: string }> = [];
  constructor(readonly width: number, readonly height: number) {}
  private y(y: number) { return this.height - y; }

  text(x: number, y: number, text: string, o: { font?: Font; size?: number; color?: RGB; align?: "left" | "right" | "center"; spacing?: number } = {}) {
    const font = o.font ?? "regular", size = o.size ?? 10;
    const w = textWidth(text, font, size) + (o.spacing ?? 0) * Math.max(0, text.length - 1);
    const x0 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT /${FONT_NAMES[font][0]} ${num(size)} Tf ${hex(o.color ?? "#000000")} rg ${o.spacing ? `${num(o.spacing)} Tc ` : ""}${num(x0)} ${num(this.y(y))} Td ${encode(text)} Tj ${o.spacing ? "0 Tc " : ""}ET`);
    return w;
  }

  /** Wrapped paragraph; returns the y below it. */
  paragraph(x: number, y: number, width: number, text: string, o: { font?: Font; size?: number; color?: RGB; leading?: number } = {}) {
    const size = o.size ?? 10, leading = o.leading ?? size * 1.45;
    for (const line of wrap(text, o.font ?? "regular", size, width)) { this.text(x, y + size, line, o); y += leading; }
    return y;
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; stroke?: RGB; lineWidth?: number; radius?: number } = {}) {
    const r = Math.min(o.radius ?? 0, w / 2, h / 2), Y = this.y(y + h);
    let path: string;
    if (r > 0) {
      const k = r * 0.5523;
      path = `${num(x + r)} ${num(Y)} m ${num(x + w - r)} ${num(Y)} l ${num(x + w - r + k)} ${num(Y)} ${num(x + w)} ${num(Y + r - k)} ${num(x + w)} ${num(Y + r)} c `
        + `${num(x + w)} ${num(Y + h - r)} l ${num(x + w)} ${num(Y + h - r + k)} ${num(x + w - r + k)} ${num(Y + h)} ${num(x + w - r)} ${num(Y + h)} c `
        + `${num(x + r)} ${num(Y + h)} l ${num(x + r - k)} ${num(Y + h)} ${num(x)} ${num(Y + h - r + k)} ${num(x)} ${num(Y + h - r)} c `
        + `${num(x)} ${num(Y + r)} l ${num(x)} ${num(Y + r - k)} ${num(x + r - k)} ${num(Y)} ${num(x + r)} ${num(Y)} c h`;
    } else path = `${num(x)} ${num(Y)} ${num(w)} ${num(h)} re`;
    this.paint(path, o);
  }

  circle(cx: number, cy: number, r: number, o: { fill?: RGB; stroke?: RGB; lineWidth?: number } = {}) {
    const k = r * 0.5523, Y = this.y(cy);
    this.paint(`${num(cx + r)} ${num(Y)} m ${num(cx + r)} ${num(Y + k)} ${num(cx + k)} ${num(Y + r)} ${num(cx)} ${num(Y + r)} c ${num(cx - k)} ${num(Y + r)} ${num(cx - r)} ${num(Y + k)} ${num(cx - r)} ${num(Y)} c `
      + `${num(cx - r)} ${num(Y - k)} ${num(cx - k)} ${num(Y - r)} ${num(cx)} ${num(Y - r)} c ${num(cx + k)} ${num(Y - r)} ${num(cx + r)} ${num(Y - k)} ${num(cx + r)} ${num(Y)} c h`, o);
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { stroke?: RGB; lineWidth?: number } = {}) {
    this.paint(`${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l`, { stroke: o.stroke ?? "#000000", lineWidth: o.lineWidth });
  }

  /** A closed shape through the given points, with optional rounded joins. */
  polygon(points: Array<[number, number]>, o: { fill?: RGB; stroke?: RGB; lineWidth?: number; round?: boolean } = {}) {
    const [first, ...rest] = points;
    this.paint(`${o.round ? "1 j 1 J " : ""}${num(first[0])} ${num(this.y(first[1]))} m ${rest.map(([x, y]) => `${num(x)} ${num(this.y(y))} l`).join(" ")} h`, o);
  }

  link(x: number, y: number, w: number, h: number, url: string) { this.links.push({ x, y: this.y(y + h), w, h, url }); }

  private paint(path: string, o: { fill?: RGB; stroke?: RGB; lineWidth?: number }) {
    const parts = ["q"];
    if (o.fill) parts.push(`${hex(o.fill)} rg`);
    if (o.stroke) parts.push(`${hex(o.stroke)} RG ${num(o.lineWidth ?? 1)} w`);
    parts.push(path, o.fill && o.stroke ? "B" : o.fill ? "f" : "S", "Q");
    this.ops.push(parts.join(" "));
  }
}

export class PdfDocument {
  readonly pages: Page[] = [];
  constructor(readonly info: { title: string; author?: string; subject?: string; keywords?: string } = { title: "Document" }) {}
  addPage(width = 595.28, height = 841.89) { const p = new Page(width, height); this.pages.push(p); return p; }

  toBuffer(): Buffer {
    const objects: Buffer[] = [];
    const add = (body: string | Buffer) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1")); return objects.length; };
    const stream = (dict: string, data: Buffer) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);
    const pdfString = (s: string) => "(" + normalize(s).replace(/[\\()]/g, m => "\\" + m) + ")";

    const catalog = add(""), pagesId = add("");
    const fontIds = Object.values(FONT_NAMES).map(([, base]) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`));
    const fontRes = Object.values(FONT_NAMES).map(([key], i) => `/${key} ${fontIds[i]} 0 R`).join(" ");
    const pageIds: number[] = [];
    for (const page of this.pages) {
      const content = add(stream("/Filter /FlateDecode", deflateSync(Buffer.from(page.ops.join("\n"), "latin1"))));
      const annots = page.links.map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${num(l.x)} ${num(l.y)} ${num(l.x + l.w)} ${num(l.y + l.h)}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(l.url)} >> >>`));
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fontRes} >> >> /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map(a => `${a} 0 R`).join(" ")}]` : ""} >>`));
    }
    objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
    objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");
    const date = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const info = add(`<< /Title ${pdfString(this.info.title)} /Author ${pdfString(this.info.author ?? "")} /Subject ${pdfString(this.info.subject ?? "")} /Keywords ${pdfString(this.info.keywords ?? "")} /Creator (Veyra Code Guard) /Producer (Veyra Code Guard) /CreationDate (D:${date}Z) >>`);

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets: number[] = [];
    let pos = chunks[0].length;
    objects.forEach((body, i) => {
      const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      offsets.push(pos); chunks.push(obj); pos += obj.length;
    });
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
    return Buffer.concat(chunks);
  }
}
