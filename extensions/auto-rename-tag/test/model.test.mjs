import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

/** Types `text` at the "|" in `doc` (replacing a ⟦selection⟧ if there is one) and returns the document after the paired rename. */
function type(doc, text, html = true) {
  let offset, length = 0, before;
  if (doc.includes("⟦")) { offset = doc.indexOf("⟦"); length = doc.indexOf("⟧") - offset - 1; before = doc.replace("⟦", "").replace("⟧", ""); }
  else { offset = doc.indexOf("|"); before = doc.replace("|", ""); }
  const change = { offset, length, text };
  const after = m.apply(before, change);
  const paired = m.pairedEdit(before, change, html);
  return paired ? m.apply(after, paired) : after;
}

test("renames the closing tag when the opening one changes, and the other way round", () => {
  assert.equal(type("<div|>hi</div>", "x"), "<divx>hi</divx>");
  assert.equal(type("<⟦div⟧>hi</div>", "section"), "<section>hi</section>");
  assert.equal(type("<div>hi</⟦div⟧>", "p"), "<p>hi</p>");
  assert.equal(type("<|div>hi</div>", "x"), "<xdiv>hi</xdiv>");
});

test("deleting characters, and deleting the whole name", () => {
  assert.equal(type("<sec⟦t⟧ion>a</section>", ""), "<secion>a</secion>");
  assert.equal(type("<⟦div⟧>a</div>", ""), "<>a</>", "becomes a fragment");
});

test("nested tags with the same name pair correctly", () => {
  assert.equal(type("<div|><div></div><div><div></div></div></div>", "x"), "<divx><div></div><div><div></div></div></divx>");
  assert.equal(type("<div><div></div><div|></div></div>", "x"), "<div><div></div><divx></divx></div>");
  assert.equal(type("<div><div></div></div|>", "x"), "<divx><div></div></divx>");
});

test("attributes with > inside quotes and JSX braces", () => {
  assert.equal(type('<a| title="a > b" href=\'x>y\'>go</a>', "bbr"), '<abbr title="a > b" href=\'x>y\'>go</abbr>');
  assert.equal(type("<Button| onClick={() => a > b && go()}>Go</Button>", "s"), "<Buttons onClick={() => a > b && go()}>Go</Buttons>", false);
});

test("JSX: components, member names, fragments, self-closing", () => {
  assert.equal(type("<Foo.Bar|>x</Foo.Bar>", "z", false), "<Foo.Barz>x</Foo.Barz>");
  assert.equal(type("<|>x</>", "div", false), "<div>x</div>", "a fragment becomes an element");
  assert.equal(type("<Card|/><Card>x</Card>", "s", false), "<Cards/><Card>x</Card>", "self-closing tags have no pair");
  assert.equal(type("<Card| />", "s", false), "<Cards />");
  assert.equal(type("<my-el|>x</my-el>", "2"), "<my-el2>x</my-el2>");
});

test("case: HTML ignores it, JSX doesn't", () => {
  assert.equal(type("<DIV|>x</div>", "X"), "<DIVX>x</DIVX>");
  assert.equal(type("<Div|>x</div></Div>", "a", false), "<Diva>x</div></Diva>", "in JSX, </div> doesn't close <Div>");
});

test("comments, CDATA, doctype and script content are not tags", () => {
  assert.equal(type("<!DOCTYPE html><div|><!-- </div> --><![CDATA[</div>]]>x</div>", "x"), "<!DOCTYPE html><divx><!-- </div> --><![CDATA[</div>]]>x</divx>");
  assert.equal(type('<div|><script>const s = "</div>";</script></div>', "x"), '<divx><script>const s = "</div>";</script></divx>');
});

test("leaves things alone when it should", () => {
  assert.equal(type("<div|>x</div>", " "), "<div >x</div>", "a space starts the attributes");
  assert.equal(type('<div| class="a">x</div>', "-"), '<div- class="a">x</div->', "hyphens are fine");
  assert.equal(type("<div class|>x</div>", "s"), "<div classs>x</div>", "attributes aren't names");
  assert.equal(type("<div|>x", "x"), "<divx>x", "no closing tag");
  assert.equal(type("<⟦div⟧>x</div>", "1a"), "<1a>x</div>", "invalid names aren't copied");
  assert.equal(type("plain| text", "x"), "plainx text");
  assert.equal(type("if (a <b|) { c > d }", "x", false), "if (a <bx) { c > d }", "comparisons are left alone");
});

test("the other tag is found even when it comes first or the edit grows the text", () => {
  assert.equal(type("<ul><li>a</li><li>b</l|i></ul>", "XX"), "<ul><li>a</li><lXXi>b</lXXi></ul>");
  assert.equal(type("<⟦span⟧>a</span>", "strong"), "<strong>a</strong>");
});

test("a pair that already matches isn't touched (like after VS Code's own linked editing)", () => {
  const before = "<divx>x</div>";
  assert.equal(m.pairedEdit("<div>x</divx>", { offset: 4, length: 0, text: "x" }), undefined);
  void before;
});

test("tag scanning details", () => {
  const tags = m.scanTags('<a href="x"><b/><c></c></a><br>');
  assert.deepEqual(tags.map(t => `${t.kind}:${t.name}`), ["open:a", "self:b", "open:c", "close:c", "close:a", "open:br"]);
  assert.equal(m.matchTag(tags, 0)?.name, "a");
  assert.equal(m.matchTag(tags, 5), undefined, "void elements have no pair");
  assert.ok(m.maybeInTagName("<div", 4));
  assert.ok(m.maybeInTagName("</div", 3));
  assert.ok(!m.maybeInTagName("<div class", 10));
  assert.ok(m.validName("") && m.validName("x-y") && m.validName("svg:rect") && !m.validName("1x") && !m.validName("a b"));
});
