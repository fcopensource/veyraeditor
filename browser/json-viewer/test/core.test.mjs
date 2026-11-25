import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const V = createRequire(import.meta.url)("../src/core.js");

test("knows JSON content types", () => {
  for (const t of ["application/json", "application/json; charset=utf-8", "text/json", "application/ld+json", "application/vnd.api+json", "application/problem+json"]) assert.ok(V.isJsonType(t), t);
  for (const t of ["text/html", "text/plain", "application/javascript", "", undefined]) assert.ok(!V.isJsonType(t), String(t));
});

test("spots JSON in plain text, and strips anti-hijacking prefixes", () => {
  assert.ok(V.looksLikeJson('  {"a":1}\n'));
  assert.ok(V.looksLikeJson("[1,2]"));
  assert.ok(V.looksLikeJson(")]}',\n{\"a\":1}"));
  assert.ok(!V.looksLikeJson("hello {world}"));
  assert.deepEqual(V.stripPrefix("﻿{}"), { body: "{}", prefix: "" });
  assert.equal(V.stripPrefix("while(1);[1]").body, "[1]");
  assert.equal(V.stripPrefix("for(;;);[1]").prefix, "for(;;);");
});

test("keeps big and exactly-written numbers exactly", () => {
  const r = V.parse('{"id": 12345678901234567890, "price": 1.50, "n": 42, "f": 0.5, "e": 1e3}');
  assert.ok(r.ok);
  assert.ok(r.value.id instanceof V.Num);
  assert.equal(r.value.id.source, "12345678901234567890");
  assert.equal(String(r.value.price), "1.50");
  assert.equal(r.value.n, 42);
  assert.equal(r.value.f, 0.5);
  assert.equal(V.stringify(r.value, 0), '{"id":12345678901234567890,"price":1.50,"n":42,"f":0.5,"e":1e3}');
  assert.equal(V.kindOf(r.value.id), "number");
});

test("reports where broken JSON breaks", () => {
  const text = '{\n  "a": 1,\n  "b": 2,\n}';
  const r = V.parse(text);
  assert.equal(r.ok, false);
  assert.ok(r.where, "has a location");
  assert.equal(r.where.line, 4);
  const lead = V.parse('\n\n{"a": }');
  assert.equal(lead.where.line, 3, "blank lines before the JSON still count");
  assert.equal(V.parse("   ").ok, false);
});

test("parses with a prefix and remembers it", () => {
  const r = V.parse(")]}'\n[1, 2]");
  assert.ok(r.ok);
  assert.deepEqual(r.value, [1, 2]);
  assert.equal(r.prefix, ")]}'");
});

test("paths", () => {
  assert.equal(V.pathOf([]), "$");
  assert.equal(V.pathOf(["users", 2, "email"]), "$.users[2].email");
  assert.equal(V.pathOf(["odd key", "$ok", "9x"]), '$["odd key"].$ok["9x"]');
});

test("formats with 2, 4 or tab indents, or on one line", () => {
  const v = { a: [1, { b: null }], c: {}, d: [] };
  assert.equal(V.stringify(v, 2), JSON.stringify(v, null, 2));
  assert.equal(V.stringify(v, 4), JSON.stringify(v, null, 4));
  assert.equal(V.stringify(v, "\t"), JSON.stringify(v, null, "\t"));
  assert.equal(V.stringify(v, 0), JSON.stringify(v));
  assert.equal(V.stringify("a\"b", 2), '"a\\"b"');
});

test("describes values", () => {
  assert.equal(V.describe([1]), "1 item");
  assert.equal(V.describe([1, 2]), "2 items");
  assert.equal(V.describe({ a: 1 }), "1 key");
  assert.equal(V.describe({}), "0 keys");
  assert.equal(V.describe("x"), "string");
});

test("search finds keys and values, case-insensitively, in order", () => {
  const v = { users: [{ name: "Ada", email: "ada@example.com" }, { name: "Linus", city: "Helsinki" }], Admin: true, big: new V.Num("98765432109876543210") };
  assert.deepEqual(V.search(v, "ada"), [["users", 0, "name"], ["users", 0, "email"]]);
  assert.deepEqual(V.search(v, "ADMIN"), [["Admin"]]);
  assert.deepEqual(V.search(v, "876543"), [["big"]]);
  assert.deepEqual(V.search(v, "  "), []);
  assert.equal(V.search({ a: Array(50).fill("x") }, "x", 10).length, 10);
});

test("counts values, up to a cap", () => {
  assert.equal(V.countNodes({ a: [1, 2], b: null }), 5);
  assert.equal(V.countNodes(Array(1000).fill(1), 100), 100);
});

test("links are only http and https", () => {
  assert.ok(V.isLink("https://example.com/a?b=1"));
  assert.ok(!V.isLink("javascript:alert(1)"));
  assert.ok(!V.isLink("https://a b"));
  assert.ok(!V.isLink(42));
});

test("tokenizes pretty JSON for colouring, losing nothing", () => {
  const text = V.stringify({ a: "x", n: -1.5e3, t: true, z: null, l: [1] }, 2);
  const tokens = V.tokenize(text);
  assert.equal(tokens.map(t => t[1]).join(""), text);
  const types = tokens.filter(t => t[0] !== "space" && t[0] !== "punct").map(t => t[0]);
  assert.deepEqual(types, ["key", "string", "key", "number", "key", "boolean", "key", "null", "key", "number"]);
});

test("the error scanner agrees with JSON.parse", () => {
  const good = ['{"a":[1,2,{"b":null}],"c":"x\\n\\u00e9"}', "[]", "-0.5e+3", '"s"', "true", ' { } '];
  for (const t of good) { assert.equal(V.errorOffset(t.trim()), -1, t); JSON.parse(t); }
  const bad = [["{\"a\":1,}", 7], ["[1 2]", 3], ["{a:1}", 1], ["[01]", 2], ['"\\x"', 1], ["nul", 3], ["[1]x", 3], ["{\"a\" 1}", 5]];
  for (const [t] of bad) assert.throws(() => JSON.parse(t), t);
  for (const [t, at] of bad) assert.equal(V.errorOffset(t), at, t);
  assert.deepEqual(V.lineColumn("ab\ncd", 4), { line: 2, column: 2 });
});

test("says the everyday mistakes plainly", () => {
  assert.match(V.parse('{"a": 1,\n}').error, /extra comma before this }/);
  assert.match(V.parse('[1, 2, ]').error, /extra comma before this ]/);
  assert.match(V.parse("{'a': 1}").error, /double quotes/);
  assert.match(V.parse('{name: "x"}').error, /Keys need double quotes/);
  assert.match(V.parse('{"a": 1 "b": 2}').error, /comma is missing/);
  assert.match(V.parse('{"a": [1, 2').error, /ends too early/);
});
