// Tests for the Live Server used by the VS Code extension (run: npm test). Same cases as the Rust
// tests for Veyra's built-in server, so both behave the same.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LiveServer, changeKind, inject, mime, resolve, urlFor, CLIENT_PATH, EVENTS_PATH } = require("../out/server.js");
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
