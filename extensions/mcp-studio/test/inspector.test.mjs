// The Inspector against real MCP servers: stdio, Streamable HTTP, a crashing server, a missing command and a 401.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Session, formFields, argumentsFrom } = require("../out/inspector.js");
const { explainFailure } = require("../out/model.js");
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "server.mjs");
const stdio = { name: "test", transport: "stdio", command: process.execPath, args: [fixture], env: { TEST_VALUE: "from-env" } };

test("connects over stdio, lists everything and calls tools", async () => {
  const log = [];
  const s = await Session.open(stdio, { onLog: e => log.push(e) });
  try {
    assert.equal(s.info.name, "veyra-test-server");
    assert.equal(s.info.version, "1.2.3");
    assert.equal(s.info.instructions, "A test server.");
    assert.match(s.info.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(s.has, { tools: true, resources: true, prompts: true });
    const tools = await s.tools();
    assert.deepEqual(tools.map(t => t.name), ["add", "greet", "broken"]);
    const r = await s.callTool("add", { a: 2, b: 3 });
    assert.equal(r.content[0].text, "5");
    assert.equal((await s.callTool("greet", { name: "Ana", loud: true, style: "formal" })).content[0].text, "Good day, Ana! env=from-env");
    const broken = await s.callTool("broken", {});
    assert.equal(broken.isError, true);
    assert.match(broken.content[0].text, /Something went wrong inside the tool/);
    assert.deepEqual((await s.resources()).map(r => r.uri), ["note://readme"]);
    assert.equal((await s.readResource("note://readme")).contents[0].text, "Hello from a resource");
    assert.deepEqual((await s.resourceTemplates()).map(t => t.uriTemplate), ["user://{id}"]);
    assert.equal((await s.readResource("user://42")).contents[0].text, "User 42");
    const prompt = await s.getPrompt("review", { language: "Rust" });
    assert.equal(prompt.messages[0].content.text, "Review this Rust code.");
    assert.ok(log.some(e => e.kind === "sent" && e.text.includes('"method":"initialize"')), "logs the handshake it sends");
    assert.ok(log.some(e => e.kind === "received" && e.text.includes('"serverInfo"')), "logs the handshake it receives");
  } finally { await s.close(); }
});

test("builds tool forms and converts what is typed", async () => {
  const s = await Session.open(stdio);
  try {
    const greet = (await s.tools()).find(t => t.name === "greet");
    const fields = formFields(greet.inputSchema);
    assert.deepEqual(fields.map(f => [f.name, f.type, f.required]), [["name", "string", true], ["loud", "boolean", false], ["style", "enum", false]]);
    assert.deepEqual(fields[2].options, ["formal", "casual"]);
    const add = formFields((await s.tools()).find(t => t.name === "add").inputSchema);
    assert.deepEqual(argumentsFrom(add, { a: "2.5", b: "4" }).args, { a: 2.5, b: 4 });
    assert.match(argumentsFrom(add, { a: "x", b: "1" }).error, /"a" must be a number/);
    assert.match(argumentsFrom(add, { a: "", b: "1" }).error, /Fill in "a"/);
  } finally { await s.close(); }
  const json = formFields({ properties: { tags: { type: "array" }, n: { type: "integer" } }, required: ["n"] });
  assert.deepEqual(argumentsFrom(json, { tags: '["a"]', n: "3" }).args, { tags: ["a"], n: 3 });
  assert.match(argumentsFrom(json, { tags: "[a", n: "3" }).error, /valid JSON/);
  assert.match(argumentsFrom(json, { n: "3.5" }).error, /whole number/);
});

let httpServer, port;
before(async () => {
  port = 39000 + Math.floor(Math.random() * 1000);
  httpServer = spawn(process.execPath, [fixture, "--http", String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => { httpServer.stdout.once("data", resolve); httpServer.once("error", reject); });
});
after(() => httpServer?.kill());

test("connects over Streamable HTTP", async () => {
  const s = await Session.open({ name: "remote", transport: "http", url: `http://127.0.0.1:${port}/mcp` });
  try {
    assert.equal(s.info.name, "veyra-test-server");
    assert.equal((await s.callTool("add", { a: 10, b: 32 })).content[0].text, "42");
  } finally { await s.close(); }
});

test("explains a server that crashes on start, with what it printed", async () => {
  const def = { ...stdio, args: [fixture, "--crash"] };
  const error = await Session.open(def, { timeoutMs: 20000 }).then(() => null, e => e);
  assert.ok(error, "fails");
  const why = explainFailure(error, def, error.stderr);
  assert.match(why.title, /stopped before it was ready/);
  assert.match(why.detail, /TEST_API_KEY is not set/);
});

test("explains a command that is not installed", async () => {
  const def = { name: "x", transport: "stdio", command: "veyra-no-such-program-xyz" };
  const error = await Session.open(def, { timeoutMs: 15000 }).then(() => null, e => e);
  assert.ok(error);
  assert.match(explainFailure(error, def, error.stderr ?? "").title, /was not found/);
});

test("explains a remote server that needs sign-in", async () => {
  const auth = http.createServer((req, res) => res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="mcp"' }).end("Unauthorized"));
  await new Promise(r => auth.listen(0, "127.0.0.1", r));
  const def = { name: "a", transport: "http", url: `http://127.0.0.1:${auth.address().port}/mcp` };
  try {
    const error = await Session.open(def, { timeoutMs: 15000 }).then(() => null, e => e);
    assert.ok(error);
    assert.match(explainFailure(error, def, "").title, /sign in/, String(error?.message));
  } finally { auth.close(); }
});
