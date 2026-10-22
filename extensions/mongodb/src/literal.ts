/*
 * A forgiving reader for the object and array literals people pass to MongoDB: JavaScript, TypeScript and Python.
 * Literal values are kept; anything else (a variable, a call, a template string) becomes a "var" with its source
 * text, so the query's shape is known even when its values come from the program.
 */

export type Value =
  | { kind: "object"; entries: Entry[]; start: number; end: number }
  | { kind: "array"; items: Value[]; start: number; end: number }
  | { kind: "string"; value: string; start: number; end: number }
  | { kind: "number"; value: number; start: number; end: number }
  | { kind: "boolean"; value: boolean; start: number; end: number }
  | { kind: "null"; start: number; end: number }
  | { kind: "regex"; source: string; flags: string; start: number; end: number }
  | { kind: "var"; text: string; start: number; end: number };
export interface Entry { key: string; keyStart: number; value: Value }

const ID = /[A-Za-z_$À-￿]/;
const ID_PART = /[A-Za-z0-9_$À-￿]/;

export class Reader {
  i: number;
  constructor(readonly text: string, start = 0, readonly end = text.length) { this.i = start; }

  /** Skips spaces and comments (// and block comments for JS, # for Python). */
  ws() {
    const t = this.text;
    for (;;) {
      while (this.i < this.end && /\s/.test(t[this.i])) this.i++;
      if (t.startsWith("//", this.i)) { while (this.i < this.end && t[this.i] !== "\n") this.i++; continue; }
      if (t.startsWith("/*", this.i)) { const e = t.indexOf("*/", this.i + 2); this.i = e < 0 ? this.end : e + 2; continue; }
      if (t[this.i] === "#" && !/[\w)]/.test(t[this.i - 1] ?? "")) { while (this.i < this.end && t[this.i] !== "\n") this.i++; continue; }
      return;
    }
  }
  peek() { this.ws(); return this.text[this.i]; }

  value(): Value {
    this.ws();
    const t = this.text, start = this.i, c = t[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c === "(") {
      // A Python tuple ("a", -1) reads as an array; a parenthesised expression stays one value.
      const items = this.array(")") as Extract<Value, { kind: "array" }>;
      const inner = this.text.slice(start + 1, this.i - 1);
      if (items.items.length === 1 && !/,\s*$/.test(inner.trim()) && !inner.includes(",")) {
        if (this.continuesExpression()) return this.expression(start);
        return items.items[0];
      }
      return items;
    }
    if (c === '"' || c === "'" || c === "`") {
      const s = this.string();
      if (s.template) return { kind: "var", text: t.slice(start, this.i), start, end: this.i };
      // Python string prefixes like r"…" are handled in the identifier branch.
      return { kind: "string", value: s.value, start, end: this.i };
    }
    if (c === "/" && t[this.i + 1] !== "/" && t[this.i + 1] !== "*") {
      const r = this.regex();
      if (r) return { kind: "regex", source: r.source, flags: r.flags, start, end: this.i };
    }
    if (/[-+.\d]/.test(c ?? "") && /^[-+]?(\d|\.\d)/.test(t.slice(this.i, this.i + 3))) {
      const m = /^[-+]?(0x[\da-f]+|\d[\d_]*(\.\d+)?(e[-+]?\d+)?|\.\d+)n?/i.exec(t.slice(this.i));
      if (m) {
        this.i += m[0].length;
        if (!this.continuesExpression()) return { kind: "number", value: Number(m[0].replace(/_/g, "").replace(/n$/, "")), start, end: this.i };
        return this.expression(start);
      }
    }
    if (/^(r|b|f|rb|br|u)["']/i.test(t.slice(this.i, this.i + 3))) {
      const prefix = /^[a-z]+/i.exec(t.slice(this.i))![0];
      this.i += prefix.length;
      const s = this.string();
      return /f/i.test(prefix) ? { kind: "var", text: t.slice(start, this.i), start, end: this.i } : { kind: "string", value: s.value, start, end: this.i };
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(t.slice(this.i))?.[0];
    if (word && !this.continuesExpressionAfter(this.i + word.length)) {
      const lit: Record<string, Value["kind"]> = { true: "boolean", True: "boolean", false: "boolean", False: "boolean", null: "null", None: "null", undefined: "null" };
      if (lit[word]) {
        this.i += word.length;
        return lit[word] === "boolean" ? { kind: "boolean", value: word.toLowerCase() === "true", start, end: this.i } : { kind: "null", start, end: this.i };
      }
    }
    return this.expression(start);
  }

  /** Anything else: read until a comma or closing bracket at the same depth, and keep its text. */
  expression(start = this.i): Value {
    const t = this.text;
    let depth = 0;
    while (this.i < this.end) {
      const c = t[this.i];
      if (c === '"' || c === "'" || c === "`") { this.string(); continue; }
      if (c === "/" && t[this.i + 1] === "/") break;
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
      else if ((c === "," || c === ":") && depth === 0) {
        // a ? b : c is one expression; a key's ":" is not ours to take.
        if (c === ":" && /\?[^:]*$/.test(t.slice(start, this.i))) { this.i++; continue; }
        break;
      }
      else if (c === "\n" && depth === 0 && /^\s*[A-Za-z_$"'\]}]/.test(t.slice(this.i + 1)) && !/[.+\-*/|&?=(]\s*$/.test(t.slice(start, this.i))) break;
      this.i++;
    }
    const text = t.slice(start, this.i).trim();
    return { kind: "var", text, start, end: start + text.length };
  }
  private continuesExpression() { return this.continuesExpressionAfter(this.i); }
  private continuesExpressionAfter(at: number) {
    let j = at;
    while (j < this.end && (this.text[j] === " " || this.text[j] === "\t")) j++;
    const c = this.text[j];
    return c !== undefined && (/[.([]/.test(c) || /^(\+|-|\*|\/(?![/*])|\?\?|\|\||&&|\?)/.test(this.text.slice(j, j + 2)) || ID_PART.test(this.text[at] ?? ""));
  }

  string(): { value: string; template: boolean } {
    const t = this.text, q = t[this.i];
    const triple = (q === '"' || q === "'") && t.startsWith(q.repeat(3), this.i);
    this.i += triple ? 3 : 1;
    let value = "", template = false;
    while (this.i < this.end) {
      const c = t[this.i];
      if (c === "\\") { value += t[this.i + 1] ?? ""; this.i += 2; continue; }
      if (q === "`" && c === "$" && t[this.i + 1] === "{") {
        template = true;
        let depth = 0;
        for (this.i += 1; this.i < this.end; this.i++) { if (t[this.i] === "{") depth++; else if (t[this.i] === "}" && --depth === 0) break; }
        this.i++;
        continue;
      }
      if (triple ? t.startsWith(q.repeat(3), this.i) : c === q) { this.i += triple ? 3 : 1; return { value, template }; }
      if (c === "\n" && q !== "`" && !triple) break;
      value += c; this.i++;
    }
    return { value, template };
  }
  private regex(): { source: string; flags: string } | undefined {
    const t = this.text;
    let j = this.i + 1, inClass = false;
    for (; j < this.end; j++) {
      const c = t[j];
      if (c === "\\") { j++; continue; }
      if (c === "\n") return undefined;
      if (c === "[") inClass = true; else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
    }
    if (j >= this.end) return undefined;
    const source = t.slice(this.i + 1, j);
    const flags = /^[a-z]*/.exec(t.slice(j + 1))![0];
    this.i = j + 1 + flags.length;
    return { source, flags };
  }

  object(): Value {
    const start = this.i;
    this.i++; // {
    const entries: Entry[] = [];
    for (;;) {
      const c = this.peek();
      if (c === undefined || this.i >= this.end) break;
      if (c === "}") { this.i++; break; }
      if (c === ",") { this.i++; continue; }
      if (this.text.startsWith("...", this.i) || this.text.startsWith("**", this.i)) { this.i += this.text[this.i] === "." ? 3 : 2; this.expression(); continue; }
      const keyStart = this.i;
      let key: string | undefined;
      if (c === '"' || c === "'" || c === "`") { const s = this.string(); key = s.template ? undefined : s.value; }
      else if (c === "[") { this.skipBalanced(); key = undefined; }
      else if (ID.test(c) || /\d/.test(c)) { const m = /^[\w$.À-￿]+/.exec(this.text.slice(this.i))!; key = m[0]; this.i += m[0].length; }
      else { this.i++; continue; }
      const next = this.peek();
      if (next === ":") {
        this.i++;
        const value = this.value();
        if (key !== undefined) entries.push({ key, keyStart, value });
      } else if (next === "(") {
        // a method like `validate() { … }`: skip it
        this.skipBalanced(); if (this.peek() === "{") this.skipBalanced();
      } else if (key !== undefined && (next === "," || next === "}")) {
        entries.push({ key, keyStart, value: { kind: "var", text: key, start: keyStart, end: keyStart + key.length } }); // { status } shorthand
      }
    }
    return { kind: "object", entries, start, end: this.i };
  }
  array(close = "]"): Value {
    const start = this.i;
    this.i++; // [ or (
    const items: Value[] = [];
    for (;;) {
      const c = this.peek();
      if (c === undefined || this.i >= this.end) break;
      if (c === close) { this.i++; break; }
      if (c === ",") { this.i++; continue; }
      if (this.text.startsWith("...", this.i)) { this.i += 3; this.expression(); continue; }
      const before = this.i;
      items.push(this.value());
      if (this.i === before) this.i++;
    }
    return { kind: "array", items, start, end: this.i };
  }
  /** Skips a (…), […] or {…} group, respecting strings. */
  skipBalanced() {
    const t = this.text;
    let depth = 0;
    while (this.i < this.end) {
      const c = t[this.i];
      if (c === '"' || c === "'" || c === "`") { this.string(); continue; }
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) { depth--; if (depth === 0) { this.i++; return; } }
      this.i++;
    }
  }
}

export function parseValue(text: string, start = 0): Value { return new Reader(text, start).value(); }

/** The plain JavaScript value of a literal, with `fill` deciding what variables become. */
export function toPlain(v: Value, fill: (v: Extract<Value, { kind: "var" }>, path: string) => unknown = () => null, path = ""): unknown {
  switch (v.kind) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const e of v.entries) out[e.key] = toPlain(e.value, fill, e.key.startsWith("$") ? path : path ? `${path}.${e.key}` : e.key);
      return out;
    }
    case "array": return v.items.map(item => toPlain(item, fill, path));
    case "string": case "number": case "boolean": return v.value;
    case "null": return null;
    case "regex": return new RegExp(v.source, v.flags.replace(/[^gimsuy]/g, ""));
    case "var": return fill(v, path);
  }
}
export function get(v: Value | undefined, key: string): Value | undefined {
  return v?.kind === "object" ? v.entries.find(e => e.key === key)?.value : undefined;
}
