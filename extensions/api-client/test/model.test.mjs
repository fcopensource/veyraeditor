// Unit tests for everything that does not need VS Code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const m = require("../out/model.js");
const kv = (key, value, enabled = true) => ({ key, value, enabled });

test("fills in variables, nested ones too, and reports unknown ones", () => {
  const vars = { host: "api.shop.dev", baseUrl: "https://{{host}}/v1", token: "abc" };
  assert.deepEqual(m.resolve("{{baseUrl}}/users?t={{ token }}", vars), { text: "https://api.shop.dev/v1/users?t=abc", missing: [] });
  assert.deepEqual(m.resolve("{{baseUrl}}/{{nope}}", vars).missing, ["nope"]);
  assert.match(m.resolve("{{$guid}}", {}).text, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(m.resolve("{{$timestamp}}", {}).text, /^\d{10}$/);
  assert.deepEqual(m.variablesIn("{{a}} and {{ b }} and {{a}}"), ["a", "b"]);
  assert.deepEqual(m.variableMap([kv("a", "1"), kv("b", "2"), kv("c", "3", false)], [kv("b", "private")]), { a: "1", b: "private" });
});

test("moves query parameters between the URL and the Params table", () => {
  assert.deepEqual(m.paramsFromUrl("https://x.dev/search?q=hello+world&page=2&flag"), {
    base: "https://x.dev/search", params: [kv("q", "hello world"), kv("page", "2"), kv("flag", "")],
  });
  assert.equal(m.urlWithParams("https://x.dev/s", [kv("q", "a b&c"), kv("off", "1", false), kv("t", "{{token}}")]), "https://x.dev/s?q=a%20b%26c&t={{token}}");
  assert.equal(m.urlWithParams("https://x.dev/s?a=1", [kv("b", "2")]), "https://x.dev/s?a=1&b=2");
});

test("prepares requests: variables, auth, every body type and default content types", () => {
  const vars = { base: "https://api.dev", token: "T0K", user: "ana" };
  const json = m.prepare(m.newRequest({ method: "post", url: "{{base}}/users", headers: [kv("X-Trace", "1"), kv("Off", "x", false)], body: { ...m.emptyBody(), type: "json", text: '{"name":"{{user}}"}' }, auth: { type: "bearer", token: "{{token}}" } }), vars);
  assert.equal(json.method, "POST");
  assert.equal(json.url, "https://api.dev/users");
  assert.deepEqual(json.headers, [["X-Trace", "1"], ["Authorization", "Bearer T0K"], ["Content-Type", "application/json"]]);
  assert.equal(json.body, '{"name":"ana"}');

  const basic = m.prepare(m.newRequest({ url: "localhost:3000/me", auth: { type: "basic", username: "a", password: "b" } }), {});
  assert.equal(basic.url, "http://localhost:3000/me");
  assert.deepEqual(basic.headers, [["Authorization", "Basic YTpi"]]);
  assert.equal(m.prepare(m.newRequest({ url: "example.com" }), {}).url, "https://example.com");

  const key = m.prepare(m.newRequest({ url: "https://x.dev", params: [kv("a", "1")], auth: { type: "apikey", key: "api_key", value: "K", in: "query" } }), {});
  assert.equal(key.url, "https://x.dev?a=1&api_key=K");

  const form = m.prepare(m.newRequest({ method: "POST", url: "https://x.dev", body: { ...m.emptyBody(), type: "form", form: [kv("name", "Ana B"), kv("x", "&=")] } }), {});
  assert.equal(form.body, "name=Ana%20B&x=%26%3D");
  assert.deepEqual(form.headers, [["Content-Type", "application/x-www-form-urlencoded"]]);

  const multi = m.prepare(m.newRequest({ method: "POST", url: "https://x.dev", body: { ...m.emptyBody(), type: "multipart", form: [kv("title", "Hi")] } }), {});
  const boundary = multi.headers[0][1].split("boundary=")[1];
  assert.equal(multi.body, `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nHi\r\n--${boundary}--\r\n`);

  const gql = m.prepare(m.newRequest({ method: "POST", url: "https://x.dev/graphql", body: { ...m.emptyBody(), type: "graphql", text: "query { me { id } }", variables: '{"a":1}' } }), {});
  assert.deepEqual(JSON.parse(gql.body), { query: "query { me { id } }", variables: { a: 1 } });

  const own = m.prepare(m.newRequest({ method: "POST", url: "https://x.dev", headers: [kv("content-type", "application/vnd.api+json")], body: { ...m.emptyBody(), type: "json", text: "{}" } }), {});
  assert.deepEqual(own.headers, [["content-type", "application/vnd.api+json"]]);
  assert.deepEqual(m.prepare(m.newRequest({ url: "{{nope}}/x" }), {}).missing, ["nope"]);
});

test("imports cURL commands from browsers, docs and Windows", () => {
  const chrome = `curl 'https://api.shop.dev/v1/orders?status=open&page=2' \\
  -H 'accept: application/json' \\
  -H 'authorization: Bearer eyJhbGc' \\
  -H 'content-type: application/json' \\
  --data-raw '{"item":"pen","qty":2}' \\
  --compressed`;
  const r = m.parseCurl(chrome);
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://api.shop.dev/v1/orders");
  assert.deepEqual(r.params, [kv("status", "open"), kv("page", "2")]);
  assert.deepEqual(r.auth, { type: "bearer", token: "eyJhbGc" });
  assert.deepEqual(r.headers, [kv("accept", "application/json")]);
  assert.equal(r.body.type, "json");
  assert.deepEqual(JSON.parse(r.body.text), { item: "pen", qty: 2 });
  assert.equal(r.name, "POST /v1/orders");

  const win = m.parseCurl(`curl "https://x.dev/login" ^\n  -X PUT ^\n  -H "Content-Type: application/x-www-form-urlencoded" ^\n  -d "user=ana&pass=a%20b"`);
  assert.equal(win.method, "PUT");
  assert.deepEqual(win.body.form, [kv("user", "ana"), kv("pass", "a b")]);

  assert.deepEqual(m.parseCurl(`curl -u ana:secret https://x.dev/me`).auth, { type: "basic", username: "ana", password: "secret" });
  assert.deepEqual(m.parseCurl(`curl -F title=Hi -F 'note=a b' https://x.dev/upload`).body.form, [kv("title", "Hi"), kv("note", "a b")]);
  const get = m.parseCurl(`curl -G https://x.dev/search --data-urlencode "q=a b" -d page=2`);
  assert.equal(get.method, "GET");
  assert.deepEqual(get.params, [kv("q", "a b"), kv("page", "2")]);
  assert.equal(m.parseCurl(`curl --json '{"a":1}' https://x.dev`).body.type, "json");
  assert.equal(m.parseCurl(`curl -XDELETE https://x.dev/items/1`).method, "DELETE");
  assert.throws(() => m.parseCurl("wget https://x.dev"), /not a curl command/);
  assert.throws(() => m.parseCurl("curl -H 'a: b'"), /no URL/);
});

test("exports requests as cURL, fetch and Python", () => {
  const p = m.prepare(m.newRequest({ method: "POST", url: "https://x.dev/users", headers: [kv("X-Note", "it's")], body: { ...m.emptyBody(), type: "json", text: '{"a":1}' } }), {});
  const curl = m.toCurl(p);
  assert.equal(curl, `curl \\\n  -X POST \\\n  https://x.dev/users \\\n  -H 'X-Note: it'\\''s' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{"a":1}'`);
  // The exported command imports back to the same request.
  const back = m.parseCurl(curl);
  assert.equal(back.method, "POST");
  assert.equal(back.url, "https://x.dev/users");
  assert.deepEqual(back.headers, [kv("X-Note", "it's")]);
  assert.match(m.toFetch(p), /body: JSON\.stringify\(\{\n {4}"a": 1\n {2}\}\)/);
  assert.match(m.toPython(p), /requests\.request\(\n {4}"POST",/);
});

test("imports and exports Postman collections", () => {
  const postman = {
    info: { name: "Shop API", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      { name: "Health", request: { method: "GET", url: { raw: "{{base}}/health?verbose=1" } } },
      { name: "Users", item: [
        { name: "Create user", request: { method: "POST", header: [{ key: "X-A", value: "1" }, { key: "X-B", value: "2", disabled: true }], url: "{{base}}/users",
          body: { mode: "raw", raw: '{"name":"Ana"}', options: { raw: { language: "json" } } }, auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] } } },
        { name: "Admin", item: [{ name: "Login", request: { method: "POST", url: "{{base}}/login", body: { mode: "urlencoded", urlencoded: [{ key: "u", value: "a" }] } } }] },
      ] },
    ],
    variable: [{ key: "base", value: "https://api.shop.dev" }],
  };
  const { collection, environment } = m.parsePostman(postman);
  assert.equal(collection.name, "Shop API");
  assert.deepEqual(collection.requests.map(r => [r.name, r.method, r.folder ?? ""]), [["Health", "GET", ""], ["Create user", "POST", "Users"], ["Login", "POST", "Users / Admin"]]);
  const create = collection.requests[1];
  assert.deepEqual(create.headers, [kv("X-A", "1"), kv("X-B", "2", false)]);
  assert.equal(create.body.type, "json");
  assert.deepEqual(create.auth, { type: "bearer", token: "{{token}}" });
  assert.deepEqual(collection.requests[0].params, [kv("verbose", "1")]);
  assert.deepEqual(environment.variables, [kv("base", "https://api.shop.dev")]);
  assert.throws(() => m.parsePostman({ foo: 1 }), /not a Postman collection/);

  const back = m.parsePostman(m.toPostman(collection)).collection;
  assert.deepEqual(back.requests.map(r => [r.name, r.method, r.folder ?? "", r.url]), collection.requests.map(r => [r.name, r.method, r.folder ?? "", r.url]));
  assert.deepEqual(back.requests[1].auth, create.auth);
});

test("reads .http files with file variables, names, headers and bodies", () => {
  const file = [
    "@base = https://api.shop.dev",
    "@token = abc",
    "",
    "### List users",
    "GET {{base}}/users?page=1",
    "Authorization: Bearer {{token}}",
    "",
    "###",
    "# @name createUser",
    "POST {{base}}/users HTTP/1.1",
    "Content-Type: application/json",
    "",
    "{",
    '  "name": "Ana"',
    "}",
    "",
    "### Plain",
    "https://example.com",
  ].join("\n");
  const { requests, variables } = m.parseHttpFile(file);
  assert.deepEqual(variables, { base: "https://api.shop.dev", token: "abc" });
  assert.deepEqual(requests.map(r => [r.line, r.request.name, r.request.method, r.request.url]), [
    [4, "List users", "GET", "{{base}}/users"],
    [9, "createUser", "POST", "{{base}}/users"],
    [17, "Plain", "GET", "https://example.com"],
  ]);
  assert.deepEqual(requests[0].request.params, [kv("page", "1")]);
  assert.deepEqual(requests[0].request.headers, [kv("Authorization", "Bearer {{token}}")]);
  assert.equal(requests[1].request.body.type, "json");
  assert.equal(requests[1].request.body.text, '{\n  "name": "Ana"\n}');
});

test("formats response details and recognises body kinds", () => {
  assert.equal(m.formatBytes(512), "512 B");
  assert.equal(m.formatBytes(1536), "1.5 KB");
  assert.equal(m.formatBytes(3 * 1024 * 1024), "3.0 MB");
  assert.equal(m.formatDuration(83.4), "83 ms");
  assert.equal(m.formatDuration(1520), "1.52 s");
  assert.equal(m.bodyKind("application/json; charset=utf-8", ""), "json");
  assert.equal(m.bodyKind("text/plain", '{"a":1}'), "text");
  assert.equal(m.bodyKind("", '{"a":1}'), "json");
  assert.equal(m.bodyKind("image/png", ""), "image");
  assert.equal(m.bodyKind("text/html", ""), "html");
  assert.equal(m.bodyKind("application/pdf", ""), "binary");
  assert.equal(m.slug("Shop API (v2)"), "shop-api-v2");
  assert.equal(m.nameFor("GET", "https://x.dev/users/1?x=1"), "GET /users/1");
});

test("opens hand-edited or older request files safely", () => {
  const r = m.normalizeRequest({ name: "X", method: "post", headers: [{ key: "A", value: 1 }, null], body: { type: "weird" }, auth: { type: "apikey", key: "k" } });
  assert.equal(r.method, "POST");
  assert.deepEqual(r.headers, [kv("A", "1")]);
  assert.equal(r.body.type, "none");
  assert.deepEqual(r.auth, { type: "apikey", key: "k", value: "", in: "header" });
  assert.ok(r.id);
});
