import type JSZip from "jszip";
import { BUILTIN_FORMATS, formatNumber, parseRange, parseRef } from "./sheets";

/* Reads .xlsx and .xlsm workbooks: values as Excel shows them, formulas, styles that matter, merged cells and widths. */

export interface Cell { text: string; value?: string | number | boolean; formula?: string; bold?: boolean; italic?: boolean; color?: string; fill?: string; align?: string; number?: boolean }
export interface Sheet { name: string; rows: Map<number, Map<number, Cell>>; maxRow: number; maxCol: number; merges: { r1: number; c1: number; r2: number; c2: number }[]; widths: Map<number, number>; hidden: boolean }
export interface Workbook { sheets: Sheet[] }

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const els = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS(NS, name));
const first = (node: Document | Element, name: string) => node.getElementsByTagNameNS(NS, name)[0];
async function read(zip: JSZip, path: string) { return zip.file(path)?.async("string"); }
/** Text of a shared or inline string: plain <t>, or rich text runs <r><t>. */
const stringOf = (si: Element) => els(si, "t").filter(t => (t.parentElement?.localName ?? "") !== "rPh").map(t => t.textContent ?? "").join("");

/** "FF4472C4" or "4472C4" → "#4472c4"; theme and indexed colours are left out. */
const rgb = (el?: Element | null) => { const v = el?.getAttribute("rgb"); return v && /^[0-9a-f]{6,8}$/i.test(v) ? `#${v.slice(-6).toLowerCase()}` : undefined; };

export async function readXlsx(zip: JSZip): Promise<Workbook> {
  const workbook = xml((await read(zip, "xl/workbook.xml")) ?? "<workbook/>");
  const date1904 = first(workbook, "workbookPr")?.getAttribute("date1904") === "1" || first(workbook, "workbookPr")?.getAttribute("date1904") === "true";
  const rels = xml((await read(zip, "xl/_rels/workbook.xml.rels")) ?? "<Relationships/>");
  const target = (id: string) => {
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === id)?.getAttribute("Target") ?? "";
    return rel.startsWith("/") ? rel.slice(1) : `xl/${rel.replace(/^\.\//, "")}`;
  };
  const shared = els(xml((await read(zip, "xl/sharedStrings.xml")) ?? "<sst/>"), "si").map(stringOf);

  // Styles: number format, bold/italic/colour, fill and alignment for each cellXfs index.
  const styles = xml((await read(zip, "xl/styles.xml")) ?? "<styleSheet/>");
  const formats = new Map<number, string>(Object.entries(BUILTIN_FORMATS).map(([k, v]) => [Number(k), v]));
  for (const f of els(styles, "numFmt")) formats.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") ?? "General");
  const fonts = els(first(styles, "fonts") ?? styles, "font").map(f => ({ bold: !!first(f, "b") && first(f, "b").getAttribute("val") !== "0", italic: !!first(f, "i") && first(f, "i").getAttribute("val") !== "0", color: rgb(first(f, "color")) }));
  const fills = els(first(styles, "fills") ?? styles, "fill").map(f => { const p = first(f, "patternFill"); return p?.getAttribute("patternType") === "solid" ? rgb(first(p, "fgColor")) : undefined; });
  const xfs = els(first(styles, "cellXfs") ?? styles, "xf").map(x => ({
    format: formats.get(Number(x.getAttribute("numFmtId") ?? 0)) ?? "General",
    font: fonts[Number(x.getAttribute("fontId") ?? 0)],
    fill: fills[Number(x.getAttribute("fillId") ?? 0)],
    align: first(x, "alignment")?.getAttribute("horizontal") ?? undefined,
  }));

  const sheets: Sheet[] = [];
  for (const s of els(workbook, "sheet")) {
    const id = s.getAttributeNS(REL, "id") ?? s.getAttribute("r:id") ?? "";
    const text = await read(zip, target(id));
    if (!text) continue;
    const doc = xml(text);
    const sheet: Sheet = { name: s.getAttribute("name") ?? "Sheet", rows: new Map(), maxRow: -1, maxCol: -1, merges: [], widths: new Map(), hidden: s.getAttribute("state") === "hidden" || s.getAttribute("state") === "veryHidden" };
    for (const col of els(doc, "col")) {
      const width = Number(col.getAttribute("width"));
      for (let c = Number(col.getAttribute("min")) - 1; c < Number(col.getAttribute("max")) && c < 16384; c++) if (width) sheet.widths.set(c, width);
    }
    for (const m of els(doc, "mergeCell")) { const r = parseRange(m.getAttribute("ref") ?? ""); if (r) sheet.merges.push(r); }
    let rowIndex = -1;
    for (const row of els(doc, "row")) {
      rowIndex = row.getAttribute("r") ? Number(row.getAttribute("r")) - 1 : rowIndex + 1;
      let colIndex = -1;
      for (const c of els(row, "c")) {
        const ref = c.getAttribute("r");
        colIndex = ref ? (parseRef(ref)?.col ?? colIndex + 1) : colIndex + 1;
        const type = c.getAttribute("t") ?? "n";
        const raw = first(c, "v")?.textContent ?? undefined;
        const formula = first(c, "f")?.textContent || undefined;
        const xf = xfs[Number(c.getAttribute("s") ?? 0)];
        let value: Cell["value"], text = "";
        if (type === "s") { value = shared[Number(raw)] ?? ""; text = String(value); }
        else if (type === "inlineStr") { value = first(c, "is") ? stringOf(first(c, "is")) : ""; text = String(value); }
        else if (type === "str") { value = raw ?? ""; text = String(value); }
        else if (type === "b") { value = raw === "1"; text = value ? "TRUE" : "FALSE"; }
        else if (type === "e") { value = raw ?? "#ERROR"; text = String(value); }
        else if (raw !== undefined && raw !== "") { value = Number(raw); text = formatNumber(value, xf?.format ?? "General", date1904); }
        if (text === "" && !formula && !xf?.fill) continue;
        const cell: Cell = { text, value, formula, bold: xf?.font?.bold, italic: xf?.font?.italic, color: xf?.font?.color, fill: xf?.fill, align: xf?.align, number: typeof value === "number" };
        if (!sheet.rows.has(rowIndex)) sheet.rows.set(rowIndex, new Map());
        sheet.rows.get(rowIndex)!.set(colIndex, cell);
        sheet.maxRow = Math.max(sheet.maxRow, rowIndex);
        sheet.maxCol = Math.max(sheet.maxCol, colIndex);
      }
    }
    for (const m of sheet.merges) { sheet.maxRow = Math.max(sheet.maxRow, m.r2); sheet.maxCol = Math.max(sheet.maxCol, m.c2); }
    sheets.push(sheet);
  }
  return { sheets };
}
