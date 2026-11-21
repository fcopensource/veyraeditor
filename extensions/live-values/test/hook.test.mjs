// Runs real Node processes with the hook (runtime/hook.js) and checks what it records.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hook = path.join(root, "runtime", "hook.js");

function run(files, entry, { roots, env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-live-hook-"));
  for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); fs.writeFileSync(path.join(dir, name), text); }
  const log = path.join(dir, "live.jsonl");
  const result = spawnSync(process.execPath, [path.join(dir, entry)], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(hook)}`, VEYRA_LIVE_FILE: log, VEYRA_LIVE_ROOTS: roots ?? dir, ...env },
  });
  const records = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
  return { dir, records, stdout: result.stdout, stderr: result.stderr, status: result.status };
}

test("records each console call with its file and line, and prints exactly as before", () => {
  const { dir, records, stdout, stderr, status } = run({
    "app.js": [
      "const user = { id: 7, name: 'Ada', tags: ['a', 'b'] };",
      "console.log('user', user);",
      "for (let i = 1; i <= 3; i++) console.log('i =', i * 10);",
      "console.warn('slow query: %dms', 812);",
      "console.error(new Error('boom').message);",
      "console.info('done');",
    ].join("\n"),
  }, "app.js");
  assert.equal(status, 0);
  assert.equal(stdout, "user { id: 7, name: 'Ada', tags: [ 'a', 'b' ] }\ni = 10\ni = 20\ni = 30\ndone\n");
  assert.equal(stderr, "slow query: 812ms\nboom\n");
  assert.deepEqual(records.map(r => [r.line, r.level, r.text]), [
    [2, "log", "user { id: 7, name: 'Ada', tags: [ 'a', 'b' ] }"],
    [3, "log", "i = 10"], [3, "log", "i = 20"], [3, "log", "i = 30"],
    [4, "warn", "slow query: 812ms"],
    [5, "error", "boom"],
    [6, "info", "done"],
  ]);
  assert.equal(records[0].file, path.join(dir, "app.js"));
  assert.deepEqual(records.slice(1, 4).map(r => r.num), [10, 20, 30]);
  assert.ok(records.every(r => r.pid > 0 && r.t > 0));
});

test("follows calls into other files and ES modules", () => {
  const { dir, records } = run({
    "main.mjs": "import { greet } from './lib/greet.mjs';\ngreet('Ben');\nconsole.log('main done');\n",
    "lib/greet.mjs": "export function greet(name) {\n  console.log(`hello ${name}`);\n}\n",
  }, "main.mjs");
  assert.deepEqual(records.map(r => [path.relative(dir, r.file), r.line, r.text]), [
    [path.join("lib", "greet.mjs"), 2, "hello Ben"],
    ["main.mjs", 3, "main done"],
  ]);
});

test("ignores logs from node_modules and from outside the project", () => {
  const { records } = run({
    "node_modules/chatty/index.js": "module.exports = () => console.log('from a library');\n",
    "app.js": "require('chatty')();\nconsole.log('mine');\n",
  }, "app.js");
  // The library's own console.log is reported at the line of your code that called it.
  assert.deepEqual(records.map(r => [r.line, r.text]), [[1, "from a library"], [2, "mine"]]);

  const outside = run({ "app.js": "console.log('elsewhere');\n" }, "app.js", { roots: path.join(os.tmpdir(), "not-this-project") });
  assert.deepEqual(outside.records, []);
});

test("records a crash at the line that threw, and Node still crashes the same way", () => {
  const { records, status, stderr } = run({
    "crash.js": "function parse(json) {\n  return JSON.parse(json).user.name;\n}\nconsole.log('start');\nparse('{}');\n",
  }, "crash.js");
  assert.equal(status, 1);
  assert.match(stderr, /TypeError: Cannot read properties of undefined/);
  const crash = records.find(r => r.level === "crash");
  assert.ok(crash, "the crash is recorded");
  assert.equal(crash.line, 2);
  assert.match(crash.text, /^TypeError: Cannot read properties of undefined/);
  assert.match(crash.full, /at parse/);
});

test("records unhandled promise rejections", () => {
  const { records, status } = run({ "reject.js": "async function load() {\n  throw new RangeError('no data');\n}\nload();\n" }, "reject.js");
  assert.equal(status, 1);
  const crash = records.find(r => r.level === "crash");
  assert.equal(crash.line, 2);
  assert.equal(crash.text, "RangeError: no data");
  assert.equal(crash.origin, "unhandledRejection");
});

test("long and multi-line values are shortened inline but kept in full", () => {
  const { records } = run({ "big.js": "console.log({ list: Array.from({ length: 50 }, (_, i) => i), deep: { a: { b: { c: { d: 1 } } } } });\nconsole.log('line one\\nline two');\n" }, "big.js");
  assert.match(records[0].text, /more items/);
  assert.match(records[0].text, /\[Object\]/);
  assert.match(records[0].full, /d: 1/);
  assert.equal(records[1].text, "line one ⏎ line two");
  assert.equal(records[1].full, "line one\nline two");
});

test("does nothing without VEYRA_LIVE_FILE, and never breaks a program", () => {
  const plain = spawnSync(process.execPath, ["-e", "console.log(typeof globalThis.__veyraLiveValues)"], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(hook)}`, VEYRA_LIVE_FILE: "" },
  });
  assert.equal(plain.stdout, "undefined\n");
  // A value whose inspect() throws (plain Node's console.log throws too, so the program catches it), and a log file
  // that can't be written.
  const odd = run({ "odd.js": "const bad = { [require('util').inspect.custom]() { throw new Error('nope'); } };\nconsole.log('still', 1);\ntry { console.log(bad); } catch {}\nconsole.log('after');\n" }, "odd.js");
  assert.equal(odd.status, 0);
  assert.deepEqual(odd.records.map(r => r.text), ["still 1", "after"]);
  const blocked = run({ "ok.js": "console.log('fine');\n" }, "ok.js", { env: { VEYRA_LIVE_FILE: path.join(os.tmpdir(), "no-such-dir-veyra", "x", "live.jsonl") } });
  assert.equal(blocked.status, 0);
  assert.equal(blocked.stdout, "fine\n");
});

test("TypeScript run through a source-mapped build points at the .ts line", () => {
  // A tiny "compiled" file with an inline source map back to app.ts, like tsc --sourceMap or tsx produce.
  const map = { version: 3, file: "app.js", sources: ["app.ts"], names: [], mappings: "AAAA;AACA;AACA" };
  const js = "\nconsole.log('from ts');\n\n//# sourceMappingURL=data:application/json;base64," + Buffer.from(JSON.stringify({ ...map, mappings: ";AAEA" })).toString("base64") + "\n";
  const { dir, records } = run({ "app.ts": "const a: number = 1;\n\nconsole.log('from ts');\n", "app.js": js }, "app.js");
  assert.equal(records.length, 1);
  assert.equal(records[0].file, path.join(dir, "app.ts"));
  assert.equal(records[0].line, 3);
});
