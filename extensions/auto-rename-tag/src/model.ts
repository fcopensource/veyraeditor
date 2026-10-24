/* Pure helpers: finding tags, pairing them, and working out the rename. No VS Code, so they're tested in Node. */

export interface Tag { kind: "open" | "close" | "self"; name: string; nameStart: number; nameEnd: number; start: number; end: number }
export interface Change { offset: number; length: number; text: string }

const NAME_START = /[A-Za-z_$]/;
const NAME = /[\w:.$\-]/;
/** Elements whose content is text, not tags (in HTML). */
const RAW = new Set(["script", "style", "textarea", "title"]);

/** Every tag in a document. Forgiving: comments, CDATA, <?…?>, quoted and {…} attributes, and stray "<" are handled. */
export function scanTags(text: string, html = true): Tag[] {
  const tags: Tag[] = [];
  let i = 0;
  const skipTo = (marker: string, from: number) => { const at = text.indexOf(marker, from); return at < 0 ? text.length : at + marker.length; };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) break;
    i = lt + 1;
    if (text.startsWith("<!--", lt)) { i = skipTo("-->", lt + 4); continue; }
    if (text.startsWith("<![CDATA[", lt)) { i = skipTo("]]>", lt + 9); continue; }
    if (text[lt + 1] === "?" || text[lt + 1] === "!") { i = skipTo(">", lt + 2); continue; }
    if (text[lt + 1] === "/") {
      // </name> or the fragment </>
      let e = lt + 2;
      if (text[e] !== ">" && !NAME_START.test(text[e] ?? "")) continue;
      while (e < text.length && NAME.test(text[e])) e++;
      let close = e;
      while (close < text.length && /\s/.test(text[close])) close++;
      if (text[close] !== ">") continue;
      tags.push({ kind: "close", name: text.slice(lt + 2, e), nameStart: lt + 2, nameEnd: e, start: lt, end: close + 1 });
      i = close + 1;
      continue;
    }
    // <name …>, <name …/>, or the fragment <>
    let e = lt + 1;
    if (text[e] !== ">" && !NAME_START.test(text[e] ?? "")) continue;
    while (e < text.length && NAME.test(text[e])) e++;
    const end = tagEnd(text, e);
    if (end < 0) continue;
    const self = text[end - 1] === "/";
    const name = text.slice(lt + 1, e);
    tags.push({ kind: self ? "self" : "open", name, nameStart: lt + 1, nameEnd: e, start: lt, end: end + 1 });
    i = end + 1;
    if (html && !self && RAW.has(name.toLowerCase())) {
      // Skip to this element's closing tag, so "<div>" inside a script isn't a tag.
      const m = new RegExp(`</${name}\\s*>`, "i").exec(text.slice(i));
      if (m) i += m.index;
    }
  }
  return tags;
}

/** Where a start tag ends (the index of its ">"), stepping over quoted values and {…}; -1 if it isn't a tag after all. */
function tagEnd(text: string, from: number): number {
  let braces = 0, quote = "";
  const limit = Math.min(text.length, from + 20000);
  for (let k = from; k < limit; k++) {
    const c = text[k];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'" || (c === "`" && braces > 0)) { quote = c; continue; }
    if (c === "{") { braces++; continue; }
    if (c === "}") { if (braces > 0) braces--; continue; }
    if (braces > 0) continue;
    if (c === ">") return k;
    if (c === "<") return -1; // another tag started first: this "<" was a comparison or a generic
  }
  return -1;
}

const same = (a: string, b: string, html: boolean) => (html ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The tag that closes an open tag, or opens a closing one, skipping nested tags with the same name. */
export function matchTag(tags: Tag[], index: number, html = true): Tag | undefined {
  const tag = tags[index];
  if (!tag || tag.kind === "self") return undefined;
  let depth = 0;
  if (tag.kind === "open") {
    for (let j = index + 1; j < tags.length; j++) {
      const t = tags[j];
      if (t.kind === "self" || !same(t.name, tag.name, html)) continue;
      if (t.kind === "open") depth++;
      else if (depth === 0) return t;
      else depth--;
    }
  } else {
    for (let j = index - 1; j >= 0; j--) {
      const t = tags[j];
      if (t.kind === "self" || !same(t.name, tag.name, html)) continue;
      if (t.kind === "close") depth++;
      else if (depth === 0) return t;
      else depth--;
    }
  }
  return undefined;
}

/** A quick check before scanning the whole file: is this position inside a tag's name, right after "<" or "</"? */
export function maybeInTagName(text: string, offset: number): boolean {
  let k = offset - 1;
  while (k >= 0 && NAME.test(text[k])) k--;
  return text[k] === "<" || (text[k] === "/" && text[k - 1] === "<");
}

/** A valid tag name, or empty for a fragment. */
export const validName = (name: string) => name === "" || /^[A-Za-z_$][\w:.$\-]*$/.test(name);

/**
 * Given the text before an edit and the edit, the matching edit for the paired tag, in the edited text's positions.
 * Undefined when the edit isn't inside a tag name, the new name isn't valid, or there's no pair.
 */
export function pairedEdit(before: string, change: Change, html = true): Change | undefined {
  if (!maybeInTagName(before, change.offset)) return undefined;
  const tags = scanTags(before, html);
  const index = tags.findIndex(t => t.nameStart <= change.offset && change.offset + change.length <= t.nameEnd);
  if (index < 0) return undefined;
  const tag = tags[index];
  if (tag.kind === "self") return undefined;
  const from = change.offset - tag.nameStart;
  const name = tag.name.slice(0, from) + change.text + tag.name.slice(from + change.length);
  if (name === tag.name || !validName(name)) return undefined;
  const match = matchTag(tags, index, html);
  if (!match) return undefined;
  if (match.name === name) return undefined; // already in step (another tool renamed it)
  const delta = change.text.length - change.length;
  const at = match.nameStart > tag.nameStart ? match.nameStart + delta : match.nameStart;
  return { offset: at, length: match.nameEnd - match.nameStart, text: name };
}

/** Applies an edit to text (for tests and checks). */
export function apply(text: string, c: Change): string { return text.slice(0, c.offset) + c.text + text.slice(c.offset + c.length); }
