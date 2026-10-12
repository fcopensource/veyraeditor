// Real-system test: start an actual server, find it with scan(), stop it, and check the port is free.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Scanner, stopProcess, isAlive } = require("../out/system.js");
const scanner = new Scanner();
const scan = (options) => scanner.scan(options);

/** A child process listening on a free port; resolves with its pid and port. */
function startServer() {
  const child = spawn(process.execPath, ["-e", "const s=require('http').createServer((q,r)=>r.end('ok')).listen(0,'127.0.0.1',()=>console.log(s.address().port))"], { stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolve, reject) => {
    child.stdout.once("data", data => resolve({ child, pid: child.pid, port: Number(String(data).trim()) }));
    child.once("error", reject);
  });
}

test("scan finds a real server with its program, and stopProcess frees the port", { timeout: 60000 }, async () => {
  const { child, pid, port } = await startServer();
  try {
    const snapshot = await scan();
    const entry = snapshot.byPort.get(port)?.find(e => e.pid === pid);
    assert.ok(entry, `port ${port} (pid ${pid}) was found among ${snapshot.entries.length} entries`);
    assert.equal(entry.process.owned, true, "our own program");
    assert.equal(entry.protected, false);
    assert.equal(entry.localOnly, true, "listening on 127.0.0.1 only");
    assert.equal(entry.framework?.id, "node");
    assert.ok(snapshot.byPid.get(pid)?.some(e => e.port === port), "indexed by process too");
    assert.ok(snapshot.entries.every(e => e.process.owned), "system programs and other users' programs are hidden by default");
    assert.ok(snapshot.entries.filter(e => e.protected).every(e => e.framework?.kind === "editor"), "the only protected entries shown are code editors");

    assert.equal(await stopProcess(pid), true, "stopped");
    assert.equal(isAlive(pid), false);
    const after = await scan();
    assert.equal(after.byPort.get(port)?.some(e => e.pid === pid) ?? false, false, "the port is free");
  } finally {
    if (isAlive(pid)) child.kill("SIGKILL");
  }
});

test("refuses to stop system processes or itself", async () => {
  await assert.rejects(stopProcess(4), /can't be stopped/);
  await assert.rejects(stopProcess(0), /can't be stopped/);
  await assert.rejects(stopProcess(process.pid), /can't be stopped/);
});
