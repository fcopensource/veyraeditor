import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");
const text = lines => lines.map(l => l.map(t => t.text).join(""));

// What VS Code puts on the clipboard for "Copy with Syntax Highlighting".
const VSCODE_HTML = `<meta charset='utf-8'><div style="color: #cccccc;background-color: #1f1f1f;font-family: Consolas, 'Courier New', monospace;font-weight: normal;font-size: 15px;line-height: 20px;white-space: pre;"><div><span style="color: #569cd6;">export</span><span style="color: #cccccc;"> </span><span style="color: #569cd6;">function</span><span style="color: #cccccc;"> </span><span style="color: #dcdcaa;">add</span><span style="color: #cccccc;">(</span><span style="color: #9cdcfe;">a</span><span style="color: #cccccc;">: </span><span style="color: #4ec9b0;">number</span><span style="color: #cccccc;">) {</span></div><div><span style="color: #cccccc;">&nbsp; </span><span style="color: #c586c0;">return</span><span style="color: #cccccc;"> </span><span style="color: #9cdcfe;">a</span><span style="color: #cccccc;"> &lt; </span><span style="color: #b5cea8;">10</span><span style="color: #cccccc;"> &amp;&amp; </span><span style="color: #ce9178;">"&lt;ok&gt;"</span><span style="color: #cccccc;">;</span></div><br><div><span style="color: #6a9955;font-style: italic;">// done</span></div><div><span style="color: #cccccc;">}</span></div></div>`;

test("reads VS Code's highlighted HTML", () => {
  const s = m.parseSnippetHtml(VSCODE_HTML);
  assert.equal(s.background, "#1f1f1f");
  assert.equal(s.foreground, "#cccccc");
  assert.equal(s.fontSize, 15);
  assert.equal(s.lineHeight, 20);
  assert.match(s.fontFamily, /Consolas/);
  assert.deepEqual(text(s.lines), ["export function add(a: number) {", "  return a < 10 && \"<ok>\";", "", "// done", "}"]);
  assert.deepEqual(s.lines[0][0], { text: "export", color: "#569cd6" });
  assert.equal(s.lines[3][0].italic, true);
});

test("empty lines written as <div><br></div>, and bold spans", () => {
  const s = m.parseSnippetHtml(`<div style="color:#000;background-color:#fff"><div><span style="color:#00f;font-weight:bold">a</span></div><div><br></div><div>b</div></div>`);
  assert.deepEqual(text(s.lines), ["a", "", "b"]);
  assert.equal(s.lines[0][0].bold, true);
  assert.equal(s.background, "#fff");
});

test("entities", () => {
  assert.equal(m.decode("&lt;div&gt; &amp; &quot;x&quot; &#39;y&#39; &#x41;&#66;&nbsp;"), "<div> & \"x\" 'y' AB ");
  assert.equal(m.decode("&unknown;"), "&unknown;");
});

test("plain text fallback", () => {
  const s = m.plainSnippet("a\r\n\r\nb");
  assert.deepEqual(text(s.lines), ["a", "", "b"]);
});

test("tabs line up, shared indentation goes", () => {
  const lines = m.expandTabs([[{ text: "\tif (x) {" }], [{ text: "\t\treturn;" }], [{ text: "a\tb" }]], 4);
  assert.deepEqual(text(lines), ["    if (x) {", "        return;", "a   b"]);
  const d = m.dedent([[], [{ text: "    " }, { text: "if", color: "#f00" }], [{ text: "        x" }], [{ text: "" }], [{ text: "    }" }], []]);
  assert.deepEqual(text(d), ["if", "    x", "", "}"]);
  assert.equal(d[0][0].color, "#f00", "colours are kept");
  assert.deepEqual(text(m.dedent([[{ text: "a" }], [{ text: "  b" }]])), ["a", "  b"], "nothing shared, nothing removed");
});

test("layout: auto fits the code; fixed sizes keep the window centred", () => {
  const o = { padding: 50, frame: "macos", lineNumbers: true, size: "auto", title: "" };
  const a = m.layout(o, 10, 40, 8, 20, 1);
  assert.equal(a.header, 40);
  assert.ok(a.gutter > 0);
  assert.equal(a.width, a.window.width + 100);
  assert.equal(a.height, a.window.height + 100);
  const wide = m.layout({ ...o, size: "wide" }, 10, 40, 8, 20, 1);
  assert.ok(Math.abs(wide.width / wide.height - 16 / 9) < 0.01);
  assert.equal(wide.window.x, Math.round((wide.width - wide.window.width) / 2));
  const square = m.layout({ ...o, size: "square" }, 3, 80, 8, 20, 1);
  assert.equal(square.width, square.height);
  const bare = m.layout({ ...o, frame: "none", lineNumbers: false }, 1, 5, 8, 20, 1);
  assert.equal(bare.header, 0);
  assert.equal(bare.gutter, 0);
  const far = m.layout(o, 2, 10, 8, 20, 998);
  assert.ok(far.gutter > a.gutter, "line 999 needs a wider gutter");
});

test("names", () => {
  assert.equal(m.titleFor("C:\\code\\src\\app.ts"), "app.ts");
  assert.equal(m.titleFor("/home/a/b.py"), "b.py");
  assert.equal(m.imageName("app.ts", 12, 30), "app.ts-12-30.png");
  assert.equal(m.imageName("my file (1).ts", 3, 3), "my-file-1.ts-3.png");
  assert.equal(m.imageName("", 1, 2), "code-1-2.png");
});

test("every background has colours", () => {
  for (const [name, g] of Object.entries(m.BACKGROUNDS)) { assert.ok(g.stops.length >= 2, name); assert.ok(g.stops.every(c => /^#[0-9a-f]{6}$/i.test(c)), name); }
});
