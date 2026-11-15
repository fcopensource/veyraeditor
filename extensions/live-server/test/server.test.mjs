// Tests for the Live Server used by the VS Code extension (run: npm test). Same cases as the Rust
// tests for Veyra's built-in server, so both behave the same.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LiveServer, changeKind, inject, mime, resolve, urlFor, globToRegExp, proxyRules, CLIENT_PATH, EVENTS_PATH, LOG_PATH } = require("../out/server.js");
const script = fs.readFileSync(new URL("../media/live-reload.js", import.meta.url), "utf8");
const TAG = '<script src="/__veyra_live/client.js"></script>';

function get(port, urlPath) {
  return new Promise((done, fail) => http.get({ host: "127.0.0.1", port, path: urlPath }, res => {
    const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  }).on("error", fail));
}

/** Opens the event stream; next() resolves with the next "event:" name. */
function events(port) {
  return new Promise((done, fail) => http.get({ host: "127.0.0.1", port, path: EVENTS_PATH }, res => {
    const waiting = []; let buffer = "";
    res.setEncoding("utf8");
    res.on("data", text => {
      buffer += text;
      let match;
      while ((match = buffer.match(/event: (\w+)\n/))) { buffer = buffer.slice(match.index + match[0].length); waiting.shift()?.(match[1]); }
    });
    done({ status: res.statusCode, next: (ms = 5000) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error("no event")), ms); waiting.push(name => { clearTimeout(t); ok(name); }); }), close: () => res.destroy() });
  }).on("error", fail));
}

test("script goes before the last body tag", () => {
  assert.equal(inject(Buffer.from("<html><BODY>hi</BODY></html>")).toString(), `<html><BODY>hi${TAG}</BODY></html>`);
  assert.equal(inject(Buffer.from("<p>no body")).toString(), `<p>no body${TAG}`);
  const utf8 = Buffer.from("<body>héllo ✓</body>");
  assert.equal(inject(utf8).toString(), `<body>héllo ✓${TAG}</body>`);
});

test("paths never leave the folder", () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-")));
  fs.mkdirSync(path.join(base, "site")); fs.writeFileSync(path.join(base, "site", "a b.html"), "x"); fs.writeFileSync(path.join(base, "secret.txt"), "x");
  const site = path.join(base, "site");
  assert.equal(resolve(site, "/a%20b.html?v=1"), path.join(site, "a b.html"));
  assert.equal(resolve(site, "/"), site);
  for (const bad of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/..%5csecret.txt", "/C:/Windows/win.ini", "/missing.html", "/%E0%A4%A"]) assert.equal(resolve(site, bad), undefined, bad);
});

test("content types, URLs and change kinds", () => {
  assert.equal(mime("a/index.HTML"), "text/html; charset=utf-8");
  assert.equal(mime("logo.svg"), "image/svg+xml");
  assert.equal(urlFor("pages\\about me.html"), "/pages/about%20me.html");
  assert.equal(changeKind(["a.css", "b.CSS"]), "css");
  assert.equal(changeKind(["a.css", "index.html"]), "reload");
  assert.equal(changeKind([]), undefined);
});

test("serves pages and reloads on change", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<html><body><h1>Hello</h1></body></html>");
  fs.writeFileSync(path.join(dir, "style.css"), "h1{color:red}");
  fs.mkdirSync(path.join(dir, "docs")); fs.writeFileSync(path.join(dir, "docs", "notes.txt"), "n");
  const server = await LiveServer.start(dir, 0, script);
  try {
    const home = await get(server.port, "/");
    assert.equal(home.status, 200);
    assert.ok(home.body.includes(`<h1>Hello</h1>${TAG}</body>`), home.body);
    const css = await get(server.port, "/style.css");
    assert.ok(css.headers["content-type"].startsWith("text/css") && css.body === "h1{color:red}");
    assert.ok((await get(server.port, CLIENT_PATH)).body.includes("EventSource"));
    assert.equal((await get(server.port, "/docs")).status, 301);
    assert.ok((await get(server.port, "/docs/")).body.includes("notes.txt"));
    assert.equal((await get(server.port, "/../index.html")).status, 404);
    assert.equal((await get(server.port, "/nope.html")).status, 404);

    const stream = await events(server.port);
    assert.equal(stream.status, 200);
    await new Promise(r => setTimeout(r, 100));
    server.notify([path.join(dir, "style.css")]);
    assert.equal(await stream.next(), "css");
    server.notify([path.join(dir, "node_modules", "x", "index.js"), path.join(dir, ".git", "index")]);
    server.notify([path.join(dir, "index.html")]);
    assert.equal(await stream.next(), "reload");
    stream.close();
  } finally {
    await server.close();
  }
  await assert.rejects(get(server.port, "/"), "the server stops when closed");
});

test("uses the next free port when the preferred one is busy", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-"));
  const first = await LiveServer.start(dir, 0, script);
  const second = await LiveServer.start(dir, first.port, script);
  try { assert.notEqual(second.port, first.port); } finally { await second.close(); await first.close(); }
});

test("byte ranges let audio and video seek", () => {
  const { parseRange } = require("../out/server.js");
  assert.deepEqual(parseRange("bytes=0-99", 1000), [0, 99]);
  assert.deepEqual(parseRange("bytes=900-", 1000), [900, 999]);
  assert.deepEqual(parseRange("bytes=-100", 1000), [900, 999]);
  assert.deepEqual(parseRange("bytes=500-5000", 1000), [500, 999]);
  assert.equal(parseRange("bytes=1000-", 1000), "invalid");
  assert.equal(parseRange(undefined, 1000), undefined);
  assert.equal(parseRange("bytes=0-1,5-9", 1000), undefined, "several ranges: send the whole file");
});

test("streams files with Range support, and survives malformed requests", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-"));
  const media = Buffer.alloc(3 * 1024 * 1024, 7); media.write("VEYRA", 0); // a 3 MB "video"
  fs.writeFileSync(path.join(dir, "clip.mp4"), media);
  fs.writeFileSync(path.join(dir, "empty.txt"), "");
  const server = await LiveServer.start(dir, 0, script);
  const raw = (headers, method = "GET", urlPath = "/clip.mp4") => new Promise((done, fail) => {
    const req = http.request({ host: "127.0.0.1", port: server.port, path: urlPath, method, headers }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", fail); req.end();
  });
  try {
    const full = await raw({});
    assert.equal(full.status, 200);
    assert.equal(full.headers["accept-ranges"], "bytes");
    assert.equal(full.body.length, media.length);
    const part = await raw({ Range: "bytes=0-4" });
    assert.equal(part.status, 206);
    assert.equal(part.headers["content-range"], `bytes 0-4/${media.length}`);
    assert.equal(part.body.toString(), "VEYRA");
    assert.equal((await raw({ Range: `bytes=${media.length}-` })).status, 416);
    const head = await raw({}, "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-length"], String(media.length));
    assert.equal(head.body.length, 0);
    assert.equal((await raw({}, "GET", "/empty.txt")).status, 200);
    // A garbage request gets a 400 and the server keeps working.
    await new Promise(done => { const socket = net.connect(server.port, "127.0.0.1", () => socket.end("NOT HTTP AT ALL\r\n\r\n")); socket.on("data", () => {}); socket.on("close", done); socket.on("error", done); });
    // A browser that disconnects mid-download doesn't break anything either.
    await new Promise(done => { const req = http.get({ host: "127.0.0.1", port: server.port, path: "/clip.mp4" }, res => { res.once("data", () => { req.destroy(); done(); }); }); req.on("error", () => {}); });
    assert.equal((await raw({ Range: "bytes=0-4" })).body.toString(), "VEYRA");
  } finally {
    await server.close();
  }
});

test("explains a missing folder instead of failing obscurely", async () => {
  await assert.rejects(LiveServer.start(path.join(os.tmpdir(), "veyra-does-not-exist-" + Date.now()), 0, script), /ENOENT|does not exist|no such file/i);
});

// ---------- 1.4.0 ----------

function request(port, urlPath, { method = "GET", body, headers = {} } = {}) {
  return new Promise((done, fail) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", fail);
    if (body) req.write(body);
    req.end();
  });
}
const site = files => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-")); for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); } return dir; };

test("Veyra Studio's script tag is unchanged; the console flag is only added when asked", () => {
  assert.equal(inject(Buffer.from("<body></body>")).toString(), `<body>${TAG}</body>`);
  assert.equal(inject(Buffer.from("<body></body>"), true).toString(), '<body><script src="/__veyra_live/client.js" data-console="1"></script></body>');
  // With the console on and a <head>, the script comes first, so it hears every console call.
  assert.equal(inject(Buffer.from('<!doctype html><html><HEAD lang="x"><title>t</title></head><body><script>console.log(1)</script></body></html>'), true).toString(),
    '<!doctype html><html><HEAD lang="x"><script src="/__veyra_live/client.js" data-console="1"></script><title>t</title></head><body><script>console.log(1)</script></body></html>');
  assert.ok(!inject(Buffer.from("<html><header>not the head</header><body></body></html>"), true).toString().startsWith("<html><header><script"), "<header> is not <head>");
});

test("ignore patterns", () => {
  const t = (glob, file) => globToRegExp(glob).test(file);
  assert.ok(t("*.log", "debug.log") && t("*.log", "logs/today.log"), "a name pattern matches in any folder");
  assert.ok(t("**/*.log", "a/b/c.log") && t("**/*.log", "c.log"));
  assert.ok(t("drafts/**", "drafts/x/y.html") && !t("drafts/**", "pages/drafts.html"));
  assert.ok(t("dist/*.map", "dist/app.js.map") && !t("dist/*.map", "dist/sub/app.js.map"));
  assert.ok(!t("*.log", "debug.logs") && t("file?.txt", "file1.txt") && !t("file?.txt", "file10.txt"));
});

test("only changes inside the served folder, and not ignored, reload the page", async () => {
  const dir = fs.realpathSync(site({ "public/index.html": "<body>hi</body>", "public/app.log": "x", "src/main.ts": "x" }));
  const live = await LiveServer.start(path.join(dir, "public"), 0, script, { ignore: ["*.log"] });
  // Record every event the page would get.
  const got = [];
  const stream = await new Promise(done => http.get({ host: "127.0.0.1", port: live.port, path: EVENTS_PATH }, res => {
    res.setEncoding("utf8"); res.on("data", t => { for (const m of t.matchAll(/event: (\w+)/g)) got.push(m[1]); }); done(res);
  }));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    live.notify([path.join(dir, "src", "main.ts"), path.join(dir, "public", "app.log"), path.join(dir, "public", "node_modules", "x.js")]);
    await wait(500);
    assert.deepEqual(got, [], "a sibling folder, an ignored file or node_modules does not reload");
    live.notify([path.join(dir, "public", "index.html")]);
    await wait(500);
    assert.deepEqual(got, ["reload"]);
  } finally { stream.destroy(); await live.close(); }
});

test("single-page apps get index.html for their routes", async () => {
  const dir = site({ "index.html": "<html><body><div id=app></div></body></html>", "assets/app.js": "1" });
  const spa = await LiveServer.start(dir, 0, script, { spa: true });
  try {
    for (const route of ["/about", "/users/42", "/deep/route/"]) {
      const res = await get(spa.port, route);
      assert.equal(res.status, 200, route);
      assert.ok(res.body.includes("<div id=app></div>") && res.body.includes(TAG), route);
    }
    assert.equal((await get(spa.port, "/assets/missing.js")).status, 404, "a missing file is still a 404");
    assert.equal((await get(spa.port, "/assets/app.js")).body, "1");
  } finally { await spa.close(); }
  const plain = await LiveServer.start(dir, 0, script);
  try { assert.equal((await get(plain.port, "/about")).status, 404, "off by default"); } finally { await plain.close(); }
});

test("the API proxy forwards any method, path, query and body to the backend", async () => {
  const seen = [];
  const backend = http.createServer((req, res) => {
    let body = ""; req.on("data", c => body += c);
    req.on("end", () => { seen.push({ method: req.method, url: req.url, body, host: req.headers.host }); res.writeHead(201, { "Content-Type": "application/json", "X-Backend": "yes" }); res.end(JSON.stringify({ ok: true })); });
  });
  await new Promise(r => backend.listen(0, "127.0.0.1", r));
  const target = `http://127.0.0.1:${backend.address().port}`;
  const live = await LiveServer.start(site({ "index.html": "<body></body>" }), 0, script, { proxy: { "/api": target, "/bad": "ftp://nope", "/v2/": target + "/base" } });
  try {
    const got = await request(live.port, "/api/users?page=2");
    assert.equal(got.status, 201); assert.equal(got.headers["x-backend"], "yes"); assert.equal(got.body, '{"ok":true}');
    const posted = await request(live.port, "/api/login", { method: "POST", body: '{"user":"a"}', headers: { "Content-Type": "application/json" } });
    assert.equal(posted.status, 201);
    await request(live.port, "/v2/items");
    assert.deepEqual(seen.map(s => `${s.method} ${s.url} ${s.body}`), ["GET /api/users?page=2 ", 'POST /api/login {"user":"a"}', "GET /base/v2/items "]);
    assert.equal(seen[0].host, `127.0.0.1:${backend.address().port}`);
    assert.equal((await get(live.port, "/apiary.html")).status, 404, "a longer name is not the /api prefix");
    assert.equal((await request(live.port, "/bad/x", { method: "POST" })).status, 405, "invalid targets are ignored");
  } finally { await live.close(); await new Promise(r => backend.close(r)); }
  const dead = await LiveServer.start(site({ "index.html": "<body></body>" }), 0, script, { proxy: { "/api": "http://127.0.0.1:1" } });
  try {
    const res = await get(dead.port, "/api/x");
    assert.equal(res.status, 502); assert.match(res.body, /Is your backend running/);
  } finally { await dead.close(); }
  assert.deepEqual(proxyRules({ "/a": "http://x", "/a/b": "http://y" }).map(r => r[0]), ["/a/b", "/a"], "longest prefix first");
});

test("the page's console messages reach the editor, and only when the console is on", async () => {
  const received = [];
  const dir = site({ "index.html": "<body>hi</body>" });
  const live = await LiveServer.start(dir, 0, script, { onConsole: e => received.push(e) });
  try {
    assert.ok((await get(live.port, "/")).body.includes('data-console="1"'), "pages are told to send their console");
    const sent = await request(live.port, LOG_PATH, { method: "POST", body: JSON.stringify({ level: "error", text: "Uncaught TypeError: x is undefined", page: "/" }) });
    assert.equal(sent.status, 204);
    await request(live.port, LOG_PATH, { method: "POST", body: JSON.stringify({ level: "nonsense", text: "hello", page: "/a" }) });
    await request(live.port, LOG_PATH, { method: "POST", body: "not json" });
    assert.deepEqual(received, [{ level: "error", text: "Uncaught TypeError: x is undefined", page: "/" }, { level: "log", text: "hello", page: "/a" }]);
  } finally { await live.close(); }
  const quiet = await LiveServer.start(dir, 0, script);
  try {
    assert.ok(!(await get(quiet.port, "/")).body.includes("data-console"));
    assert.equal((await request(quiet.port, LOG_PATH, { method: "POST", body: "{}" })).status, 204);
  } finally { await quiet.close(); }
});

test("sharing on the network still answers on this computer, and lists the network addresses", async () => {
  const live = await LiveServer.start(site({ "index.html": "<body>phone</body>" }), 0, script, { network: true });
  try {
    assert.equal((await get(live.port, "/")).status, 200);
    for (const url of live.networkUrls) assert.match(url, /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/$/);
  } finally { await live.close(); }
  const local = await LiveServer.start(site({ "index.html": "<body></body>" }), 0, script);
  try { assert.deepEqual(local.networkUrls, [], "not shared unless asked"); } finally { await local.close(); }
});
