/* Pure helpers: reading VS Code's highlighted HTML, tidying the code, and laying out the image. Tested in Node. */

export interface Token { text: string; color?: string; bold?: boolean; italic?: boolean; underline?: boolean }
export interface Snippet { background: string; foreground: string; fontFamily: string; fontSize: number; lineHeight: number; lines: Token[][] }

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, name: string) => {
    if (name[0] === "#") return String.fromCodePoint(name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
    return ENTITIES[name.toLowerCase()] ?? all;
  });
}
function styleOf(attrs: string): Record<string, string> {
  const m = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrs);
  const out: Record<string, string> = {};
  for (const part of (m?.[1] ?? m?.[2] ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

/**
 * Reads the HTML VS Code puts on the clipboard for "Copy with Syntax Highlighting":
 * an outer <div> with the editor's colours and font, one <div> per line, and coloured <span>s.
 */
export function parseSnippetHtml(html: string): Snippet {
  const snippet: Snippet = { background: "#1e1e1e", foreground: "#d4d4d4", fontFamily: "Consolas, 'Courier New', monospace", fontSize: 14, lineHeight: 19, lines: [] };
  const spans: Partial<Token>[] = [];
  let depth = 0, line: Token[] | undefined, sawOuter = false;
  const tag = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html))) {
    const [, closing, nameRaw, attrs, text] = m;
    if (text !== undefined) {
      if (depth < 1) continue;
      const decoded = decode(text).replace(/\r?\n/g, "");
      if (!decoded) continue;
      line ??= [];
      const style = Object.assign({}, ...spans);
      line.push({ text: decoded, ...style });
      continue;
    }
    const name = nameRaw.toLowerCase();
    if (name === "div") {
      if (!closing) {
        depth++;
        if (depth === 1 && !sawOuter) {
          sawOuter = true;
          const s = styleOf(attrs);
          if (s["background-color"]) snippet.background = s["background-color"];
          if (s.color) snippet.foreground = s.color;
          if (s["font-family"]) snippet.fontFamily = s["font-family"];
          if (s["font-size"]) snippet.fontSize = parseFloat(s["font-size"]) || snippet.fontSize;
          if (s["line-height"]) snippet.lineHeight = parseFloat(s["line-height"]) || snippet.lineHeight;
        } else if (depth >= 2) line = [];
      } else {
        if (depth >= 2 && line) { snippet.lines.push(line); line = undefined; }
        depth = Math.max(0, depth - 1);
      }
    } else if (name === "br") {
      if (depth === 1) snippet.lines.push([]); // an empty line between line <div>s
      else if (depth >= 2) line ??= [];       // <div><br></div> is an empty line
    } else if (name === "span") {
      if (closing) spans.pop();
      else {
        const s = styleOf(attrs);
        const t: Partial<Token> = {};
        if (s.color) t.color = s.color;
        if (/bold|[6-9]00/.test(s["font-weight"] ?? "")) t.bold = true;
        if (s["font-style"] === "italic") t.italic = true;
        if (/underline/.test(s["text-decoration"] ?? "")) t.underline = true;
        spans.push(t);
      }
    }
  }
  if (line) snippet.lines.push(line);
  return snippet;
}

/** Plain text as one-colour lines, when no highlighted HTML is available. */
export function plainSnippet(text: string, foreground = "#d4d4d4", background = "#1e1e1e"): Snippet {
  return { background, foreground, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 14, lineHeight: 19, lines: text.replace(/\r\n/g, "\n").split("\n").map(l => (l ? [{ text: l }] : [])) };
}

/** Tabs become spaces, so columns line up in the image. */
export function expandTabs(lines: Token[][], tabSize = 4): Token[][] {
  return lines.map(line => {
    let col = 0;
    return line.map(t => {
      let out = "";
      for (const ch of t.text) { if (ch === "\t") { const n = tabSize - (col % tabSize); out += " ".repeat(n); col += n; } else { out += ch; col++; } }
      return { ...t, text: out };
    });
  });
}

/** Removes the indentation every non-empty line shares, and empty lines at the start and end. */
export function dedent(lines: Token[][]): Token[][] {
  const textOf = (l: Token[]) => l.map(t => t.text).join("");
  let start = 0, end = lines.length;
  while (start < end && !textOf(lines[start]).trim()) start++;
  while (end > start && !textOf(lines[end - 1]).trim()) end--;
  const body = lines.slice(start, end);
  const indents = body.map(textOf).filter(t => t.trim()).map(t => t.length - t.trimStart().length);
  let cut = indents.length ? Math.min(...indents) : 0;
  if (!cut) return body;
  return body.map(line => {
    let left = cut;
    const out: Token[] = [];
    for (const t of line) {
      if (left <= 0) { out.push(t); continue; }
      const lead = t.text.length - t.text.trimStart().length;
      const take = Math.min(left, lead, t.text.length);
      left -= take;
      if (t.text.length > take) out.push({ ...t, text: t.text.slice(take) });
      if (take < t.text.length && left > 0) left = 0;
    }
    return out;
  });
}

// ---------- Backgrounds ----------

export interface Gradient { angle: number; stops: string[] }
export const BACKGROUNDS: Record<string, Gradient> = {
  aurora: { angle: 135, stops: ["#22d3ee", "#6366f1", "#d946ef"] },
  sunset: { angle: 135, stops: ["#f97316", "#ec4899", "#8b5cf6"] },
  ocean: { angle: 140, stops: ["#0ea5e9", "#2563eb", "#1e3a8a"] },
  candy: { angle: 120, stops: ["#f9a8d4", "#c4b5fd", "#93c5fd"] },
  forest: { angle: 135, stops: ["#34d399", "#059669", "#065f46"] },
  midnight: { angle: 160, stops: ["#1e293b", "#312e81", "#0f172a"] },
  peach: { angle: 135, stops: ["#fde68a", "#fca5a5", "#f472b6"] },
  lavender: { angle: 135, stops: ["#e9d5ff", "#a78bfa", "#6d28d9"] },
  mono: { angle: 135, stops: ["#e5e7eb", "#9ca3af"] },
  veyra: { angle: 135, stops: ["#22d3ee", "#6366f1", "#d946ef", "#fb923c"] },
};

// ---------- Layout ----------

export interface Options { padding: number; frame: "macos" | "windows" | "none"; lineNumbers: boolean; size: "auto" | "square" | "wide" | "linkedin"; title: string }
export interface Layout {
  width: number; height: number;
  window: { x: number; y: number; width: number; height: number };
  header: number; gutter: number; codeX: number; codeY: number; lineHeight: number;
}
export const RATIOS: Record<Options["size"], number | undefined> = { auto: undefined, square: 1, wide: 16 / 9, linkedin: 1.91 };

/** Where everything goes, for code that is `columns` characters wide and `rows` lines tall. */
export function layout(o: Options, rows: number, columns: number, charWidth: number, lineHeight: number, firstLine: number): Layout {
  const header = o.frame === "none" ? 0 : 40;
  const gutter = o.lineNumbers ? Math.ceil(String(firstLine + Math.max(rows, 1) - 1).length * charWidth + charWidth * 2.2) : 0;
  const inner = 22; // space inside the window around the code
  const winW = Math.ceil(Math.max(columns * charWidth + gutter + inner * 2, o.frame === "none" ? 120 : 260, o.title ? o.title.length * charWidth * 0.95 + 150 : 0));
  const top = header ? 8 : inner; // under a title bar the code starts sooner
  const winH = Math.ceil(header + top + Math.max(rows, 1) * lineHeight + inner);
  let width = winW + o.padding * 2, height = winH + o.padding * 2;
  const ratio = RATIOS[o.size];
  if (ratio) { if (width / height < ratio) width = Math.ceil(height * ratio); else height = Math.ceil(width / ratio); }
  const x = Math.round((width - winW) / 2), y = Math.round((height - winH) / 2);
  return { width, height, window: { x, y, width: winW, height: winH }, header, gutter, codeX: x + inner + gutter, codeY: y + header + top, lineHeight };
}

/** The file name shown in the window's title bar. */
export function titleFor(path: string): string { return path.split(/[\\/]/).pop() ?? ""; }
/** A file name for the saved image: "app.ts" lines 12–30 → "app.ts-12-30.png". */
export function imageName(title: string, from: number, to: number): string {
  const base = (title || "code").replace(/[^\w.-]+/g, "-").replace(/-+\./g, ".").replace(/^-+|-+$/g, "") || "code";
  return `${base}-${from}${to > from ? `-${to}` : ""}.png`;
}
