/*
 * JSON Viewer Veyra: the parts with no page in them. Parsing (with exact big numbers), paths, search, formatting.
 * Runs in the browser (window.VJV) and in Node for the tests (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VJV = Object.assign(root.VJV || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** A number whose text JavaScript can't hold exactly, like 12345678901234567890, or one written differently, like 1.50. */
  class Num {
    constructor(source) { this.source = source; }
    toString() { return this.source; }
  }

  /** Content types that hold JSON: application/json, text/json, application/ld+json, application/vnd.api+json, … */
  function isJsonType(contentType) {
    const t = String(contentType || '').split(';')[0].trim().toLowerCase();
    return /^(application|text)\/(.+\+)?json$/.test(t) || t === 'application/x-json';
  }

  /** Text that could be JSON: starts and ends like an object or an array. */
  function looksLikeJson(text) {
    const t = stripPrefix(text).body.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
  }

  /** Takes off a byte-order mark and the anti-hijacking prefixes some APIs put before JSON, like )]}' and while(1); */
  function stripPrefix(text) {
    let body = String(text);
    if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
    const m = body.match(/^\s*(\)\]\}',?|while\s*\(\s*1\s*\)\s*;|for\s*\(\s*;\s*;\s*\)\s*;)/);
    if (m) return { body: body.slice(m[0].length), prefix: m[1] };
    return { body, prefix: '' };
  }

  /**
   * The offset of the first mistake in JSON text, found by a small strict scanner (browsers don't always say where).
   * Returns -1 if the text is valid JSON.
   */
  function errorOffset(text) {
    let i = 0;
    const n = text.length;
    class Stop { constructor(at) { this.at = at; } }
    const fail = at => { throw new Stop(at); };
    const ws = () => { while (i < n && ' \t\n\r'.includes(text[i])) i++; };
    const word = w => { for (let k = 0; k < w.length; k++) if (text[i + k] !== w[k]) fail(i + k); i += w.length; };
    function str() {
      i++; // the opening quote
      while (i < n) {
        const c = text[i];
        if (c === '"') { i++; return; }
        if (c === '\\') {
          const e = text[i + 1];
          if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i); i += 6; continue; }
          if (!'"\\/bfnrt'.includes(e) || e === undefined) fail(i);
          i += 2; continue;
        }
        if (c < ' ') fail(i);
        i++;
      }
      fail(n);
    }
    function num() {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
      if (!m) fail(i);
      i += m[0].length;
    }
    function value() {
      ws();
      const c = text[i];
      if (c === '{') {
        i++; ws();
        if (text[i] === '}') { i++; return; }
        for (;;) {
          ws(); if (text[i] !== '"') fail(i);
          str(); ws(); if (text[i] !== ':') fail(i); i++;
          value(); ws();
          if (text[i] === ',') { i++; continue; }
          if (text[i] === '}') { i++; return; }
          fail(i);
        }
      }
      if (c === '[') {
        i++; ws();
        if (text[i] === ']') { i++; return; }
        for (;;) {
          value(); ws();
          if (text[i] === ',') { i++; continue; }
          if (text[i] === ']') { i++; return; }
          fail(i);
        }
      }
      if (c === '"') return str();
      if (c === 't') return word('true');
      if (c === 'f') return word('false');
      if (c === 'n') return word('null');
      if (c === '-' || (c >= '0' && c <= '9')) return num();
      fail(i);
    }
    try { value(); ws(); return i < n ? i : -1; } catch (e) { if (e instanceof Stop) return Math.min(e.at, n); throw e; }
  }

  /** A 1-based line and column for an offset in the text. */
  function lineColumn(text, offset) {
    const before = text.slice(0, offset).split('\n');
    return { line: before.length, column: before[before.length - 1].length + 1 };
  }

  /**
   * Parses JSON text. Numbers whose text would change in JavaScript (too big, too precise, or written like 1.50)
   * are kept as Num with their exact text, using the source text the browser gives the reviver.
   */
  function parse(text) {
    const { body, prefix } = stripPrefix(text);
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: 'There is nothing here.', prefix };
    try {
      const value = JSON.parse(trimmed, function (key, v, context) {
        if (typeof v === 'number' && context && typeof context.source === 'string' && context.source !== String(v)) return new Num(context.source);
        return v;
      });
      return { ok: true, value, prefix };
    } catch (e) {
      const lead = body.length - body.trimStart().length;
      const at = errorOffset(trimmed);
      const where = at >= 0 ? lineColumn(body, lead + at) : null;
      const message = e.message.replace(/^JSON\.parse: /, '').replace(/,? ?".*" is not valid JSON$/s, '').replace(/ in JSON at position \d+.*$/s, '');
      return { ok: false, error: at >= 0 ? (hintAt(trimmed, at) || message) : message, where, prefix };
    }
  }

  /** The everyday mistakes, said plainly: a comma before } or ], single quotes, keys without quotes, a missing comma. */
  function hintAt(text, at) {
    const c = text[at];
    let b = at - 1;
    while (b >= 0 && ' \t\n\r'.includes(text[b])) b--;
    const prev = text[b];
    if ((c === '}' || c === ']') && prev === ',') return `There's an extra comma before this ${c}. JSON doesn't allow a comma after the last item.`;
    if (c === "'") return 'JSON needs double quotes ("like this"), not single quotes.';
    if (/[A-Za-z_$]/.test(c || '') && (prev === '{' || prev === ',')) return 'Keys need double quotes in JSON, like "name": …';
    if ((c === '"' || c === '{' || c === '[') && (prev === '"' || prev === '}' || prev === ']' || /[\deE]/.test(prev || ''))) return 'A comma is missing before this value.';
    if (c === undefined) return 'The JSON ends too early: something isn’t closed.';
    return '';
  }

  const kindOf = v => v === null ? 'null' : v instanceof Num ? 'number' : Array.isArray(v) ? 'array' : typeof v;

  /** A JavaScript-style path to a value: $.users[2].email, or $["odd key"] for keys that aren't identifiers. */
  function pathOf(parts) {
    let out = '$';
    for (const p of parts) {
      if (typeof p === 'number') out += `[${p}]`;
      else if (/^[A-Za-z_$][\w$]*$/.test(p)) out += '.' + p;
      else out += `[${JSON.stringify(p)}]`;
    }
    return out;
  }

  /** JSON text for a value, keeping Num exactly as written. indent: 0 for one line, a number of spaces, or '\t'. */
  function stringify(value, indent) {
    const unit = indent === '\t' ? '\t' : ' '.repeat(Math.max(0, +indent || 0));
    const nl = unit ? '\n' : '';
    const sep = unit ? ': ' : ':';
    function go(v, pad) {
      if (v instanceof Num) return v.source;
      if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
      const inner = pad + unit;
      if (Array.isArray(v)) {
        if (!v.length) return '[]';
        return '[' + nl + v.map(x => inner + go(x, inner)).join(',' + nl) + nl + pad + ']';
      }
      const keys = Object.keys(v);
      if (!keys.length) return '{}';
      return '{' + nl + keys.map(k => inner + JSON.stringify(k) + sep + go(v[k], inner)).join(',' + nl) + nl + pad + '}';
    }
    return go(value, '');
  }

  /** A short description of a value: "3 keys", "120 items", or the value itself. */
  function describe(v) {
    const k = kindOf(v);
    if (k === 'array') return v.length === 1 ? '1 item' : `${v.length} items`;
    if (k === 'object') { const n = Object.keys(v).length; return n === 1 ? '1 key' : `${n} keys`; }
    return k;
  }

  /**
   * Finds keys and values containing the query (case-insensitive). Returns the paths (as arrays) of the matches,
   * in document order, at most `limit` of them.
   */
  function search(value, query, limit = 2000) {
    const q = String(query || '').trim().toLowerCase();
    const hits = [];
    if (!q) return hits;
    (function walk(v, parts) {
      if (hits.length >= limit) return;
      if (v !== null && typeof v === 'object' && !(v instanceof Num)) {
        const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
        for (const [k, x] of entries) {
          if (hits.length >= limit) return;
          const here = parts.concat([k]);
          const leaf = x === null || typeof x !== 'object' || x instanceof Num;
          if ((typeof k === 'string' && k.toLowerCase().includes(q)) || (leaf && String(x).toLowerCase().includes(q))) hits.push(here);
          if (!leaf) walk(x, here);
        }
      }
    })(value, []);
    return hits;
  }

  /** How many values there are in all, to decide how much to open at first. Stops counting at `cap`. */
  function countNodes(value, cap = 100000) {
    let n = 0;
    (function walk(v) {
      if (n >= cap) return;
      n++;
      if (v !== null && typeof v === 'object' && !(v instanceof Num)) for (const x of Array.isArray(v) ? v : Object.values(v)) { if (n >= cap) return; walk(x); }
    })(value);
    return n;
  }

  const isLink = s => typeof s === 'string' && s.length < 2048 && /^https?:\/\/[^\s"<>]+$/i.test(s);

  /** Splits pretty JSON into tokens for colouring: [type, text] with type key, string, number, boolean, null, punct or space. */
  function tokenize(text) {
    const out = [];
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}\[\],:])|(\s+)|([^\s])/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) { out.push([m[2] ? 'key' : 'string', m[1]]); if (m[2]) out.push(['punct', m[2]]); }
      else if (m[3]) out.push(['number', m[3]]);
      else if (m[4]) out.push(['boolean', m[4]]);
      else if (m[5]) out.push(['null', m[5]]);
      else if (m[6]) out.push(['punct', m[6]]);
      else if (m[7]) out.push(['space', m[7]]);
      else out.push(['punct', m[8]]);
    }
    return out;
  }

  return { Num, isJsonType, looksLikeJson, stripPrefix, errorOffset, lineColumn, parse, kindOf, pathOf, stringify, describe, search, countNodes, isLink, tokenize };
});
