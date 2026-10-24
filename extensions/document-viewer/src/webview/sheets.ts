/* Pure helpers for spreadsheets and CSV. No DOM, so they're tested in Node. */

/** "A" → 0, "Z" → 25, "AA" → 26 */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
/** 0 → "A", 26 → "AA" */
export function columnName(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
/** "C12" → { row: 11, col: 2 } */
export function parseRef(ref: string): { row: number; col: number } | undefined {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  return m ? { col: columnIndex(m[1]), row: Number(m[2]) - 1 } : undefined;
}
/** "A1:C3" → corners */
export function parseRange(range: string) {
  const [a, b] = range.split(":");
  const s = parseRef(a), e = parseRef(b ?? a);
  return s && e ? { r1: Math.min(s.row, e.row), c1: Math.min(s.col, e.col), r2: Math.max(s.row, e.row), c2: Math.max(s.col, e.col) } : undefined;
}

// ---------- Numbers and dates ----------

/** Built-in number formats that Excel files refer to by id instead of spelling them out. */
export const BUILTIN_FORMATS: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?", 13: "# ??/??",
  14: "m/d/yyyy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yyyy h:mm",
  37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)", 39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};
/** Whether a format shows a date or time (ignoring text in quotes and colours in brackets). */
export function isDateFormat(format: string): boolean {
  const f = format.replace(/"[^"]*"/g, "").replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(f) && !/^[#0.,%E+\-\s?/]*$/.test(f);
}
/** Excel's day number (1 = 1900-01-01, with its 1900 leap-year bug) → a UTC Date. */
export function excelDate(serial: number, date1904 = false): Date {
  const days = date1904 ? serial + 1462 : serial;
  const epoch = Date.UTC(1899, 11, 30); // so that 1 → 1900-01-01, counting the fake 1900-02-29 (serial 60)
  const adjusted = !date1904 && days < 61 ? days + 1 : days;
  return new Date(epoch + Math.round(adjusted * 86400000));
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** Shows a cell's number the way its format says, for the formats people use most. */
export function formatNumber(value: number, format: string, date1904 = false): string {
  if (!format || /^general$/i.test(format)) return general(value);
  const section = format.split(";")[value < 0 && format.includes(";") ? 1 : 0] ?? format;
  if (isDateFormat(section)) {
    const d = excelDate(value, date1904);
    const f = section.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\(.)/g, "$1");
    const hasTime = /h/i.test(f), hasDate = /[dy]/i.test(f) || /m{3,}/i.test(f) || (/m/i.test(f) && !hasTime);
    const ampm = /AM\/PM/i.test(f);
    const parts: string[] = [];
    if (hasDate) parts.push(/mmm/i.test(f) && !/mmmm/i.test(f) ? `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(/yyyy/i.test(f) ? 0 : 2)}` : /^\s*d/i.test(f) ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    if (hasTime) {
      let h = d.getUTCHours();
      const suffix = ampm ? (h >= 12 ? " PM" : " AM") : "";
      if (ampm) h = h % 12 || 12;
      parts.push(`${ampm ? h : pad(h)}:${pad(d.getUTCMinutes())}${/s/i.test(f.replace(/AM\/PM/i, "")) ? `:${pad(d.getUTCSeconds())}` : ""}${suffix}`);
    }
    return parts.join(" ");
  }
  const clean = section.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/[_*\\]./g, "");
  const percent = clean.includes("%");
  const v = Math.abs(percent ? value * 100 : value);
  const decimals = (/\.(0+)/.exec(clean)?.[1].length) ?? 0;
  if (/E\+/i.test(clean)) return (value < 0 ? "-" : "") + scientific(v, decimals);
  let text = v.toFixed(decimals);
  if (clean.includes(",")) { const [i, f] = text.split("."); text = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? `.${f}` : ""); }
  // Literal text around the number: "$"#,##0.00, € #,##0, #,##0" kg", 0.00%
  const digits = /[#0?]/;
  const firstDigit = section.search(digits), lastDigit = Math.max(...[...section].map((ch, i) => (digits.test(ch) ? i : -1)));
  const literal = (s: string) => s.replace(/\[[^\]]*\]/g, "").replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1").replace(/[_*]./g, "").replace(/[(),]/g, "");
  const prefix = firstDigit > 0 ? literal(section.slice(0, firstDigit)) : "";
  const suffix = lastDigit >= 0 ? literal(section.slice(lastDigit + 1)).replace(/^[.,]+/, "") : "";
  const body = `${prefix}${text}${suffix}`;
  // With its own negative section ("#,##0;(#,##0)" or "#,##0;-#,##0"), the format decides how negatives look.
  if (value < 0 && format.includes(";")) return /\(/.test(section) ? `(${body})` : body;
  return `${value < 0 ? "-" : ""}${body}`;
}
/** Excel's "General": up to 11 significant characters. */
export function general(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e11) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e-4 && abs < 1e11) {
    // Round to what fits in 11 characters: 1/3 → 0.333333333, 123.456789012 → 123.4567890
    const whole = abs < 1 ? 1 : Math.floor(Math.log10(abs)) + 1;
    return String(Number(value.toFixed(Math.max(0, 10 - whole))));
  }
  return (value < 0 ? "-" : "") + scientific(abs, 5);
}
/** 12345 → "1.23E+04", like Excel. */
export function scientific(value: number, decimals: number): string {
  const [mantissa, exponent] = value.toExponential(decimals).split("e");
  const e = Number(exponent);
  return `${mantissa}E${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
}

// ---------- CSV ----------

/** Comma, semicolon, tab or pipe: whichever splits the first lines most evenly. */
export function detectDelimiter(text: string, fileName = ""): string {
  if (/\.tsv$/i.test(fileName)) return "\t";
  const sample = text.split(/\r?\n/).slice(0, 20).filter(l => l.trim());
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = sample.map(l => splitLine(l, d).length);
    if (!counts.length || counts[0] < 2) continue;
    const consistent = counts.filter(c => c === counts[0]).length;
    const score = consistent * 100 + counts[0];
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}
function splitLine(line: string, d: string): string[] { return parseCsv(line, d)[0] ?? [""]; }
/** RFC 4180: quoted fields, "" escapes, delimiters and line breaks inside quotes. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // byte order mark
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === '"' && field === "") { quoted = true; continue; }
    if (c === delimiter) { row.push(field); field = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
/** Sorts rows by a column: numbers as numbers, everything else alphabetically, empty cells last. */
export function compareCells(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const na = Number(a.replace(/[,$€£%\s]/g, "")), nb = Number(b.replace(/[,$€£%\s]/g, ""));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && /\d/.test(a) && /\d/.test(b)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// ---------- Office units ----------

/** English Metric Units (Office's measure) per point and per pixel at 96 dpi. */
export const EMU_PER_PT = 12700;
export const EMU_PER_PX = 9525;
