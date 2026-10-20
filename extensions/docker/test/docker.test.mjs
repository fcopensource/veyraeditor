// Runs Container Studio's Docker code against a real Docker engine (GitHub Actions has one). Skips when Docker is not running.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Docker, DockerError } = require("../out/docker.js");
const m = require("../out/model.js");

const docker = new Docker(process.env.DOCKER_COMMAND || "docker");
let available = true;
try { await docker.version(); } catch (error) {
  available = false;
  if (process.env.CI) throw new Error(`Docker is expected on CI but is not available: ${error.message}`);
}
const it = available ? test : test.skip;
const P = "veyratest";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyra-docker-"));
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(check, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await check(); if (v) return v; await wait(300); }
  throw new Error(`Timed out waiting for ${what}`);
}
const cleanup = async () => {
  await docker.run(["rm", "-f", `${P}-web`, `${P}-clash`]).catch(() => {});
  await docker.run(["compose", "-p", P, "down", "-v"], { timeoutMs: 120000 }).catch(() => {});
  await docker.run(["volume", "rm", `${P}-data`]).catch(() => {});
  await docker.run(["network", "rm", `${P}-net`]).catch(() => {});
  await docker.run(["rmi", `${P}/nginx:copy`, `${P}/built:1`]).catch(() => {});
};
before(async () => { if (available) await cleanup(); });
after(async () => { if (available) await cleanup(); fs.rmSync(dir, { recursive: true, force: true }); });

it("reads the Docker version", async () => {
  const v = await docker.version();
  assert.match(v.server, /^\d+\./);
  assert.match(v.os, /\//);
});

it("runs a container and reads it back: state, ports, stats, inspect", async () => {
  await docker.run(["run", "-d", "--name", `${P}-web`, "-p", "18080:80", "nginx:alpine"], { timeoutMs: 180000 });
  const c = await until(async () => (await docker.containers()).find(x => x.name === `${P}-web` && x.state === "running"), "the container to run");
  assert.equal(c.image, "nginx:alpine");
  assert.deepEqual(c.ports.map(p => [p.hostPort, p.containerPort, p.protocol]), [[18080, 80, "tcp"]]);
  assert.equal(m.portUrl(c.ports[0]), "http://localhost:18080");
  const stats = await docker.stats();
  const s = stats.find(x => x.name === `${P}-web`);
  assert.ok(s && s.memUsed > 0 && s.memLimit > 0, JSON.stringify(s));
  const info = await docker.inspect(c.id);
  assert.equal(info.Name, `/${P}-web`);
});

it("streams logs, and reads them the same way the Logs panel does", async () => {
  const lines = [];
  const stream = docker.stream(["logs", "-f", "--tail", "50", "--timestamps", `${P}-web`], (line, from) => lines.push({ ...m.parseLogLine(line, false), from }));
  await until(async () => { await fetch("http://localhost:18080/veyra-check").catch(() => {}); return lines.some(l => l.text.includes("/veyra-check")); }, "the access log line");
  stream.stop();
  const hit = lines.find(l => l.text.includes("/veyra-check"));
  assert.match(hit.time, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(lines.some(l => l.from === "stderr"), "nginx prints its start-up notes to stderr");
});

it("follows docker events", async () => {
  const events = [];
  const stream = docker.stream(["events", "--format", "{{json .}}"], line => events.push(JSON.parse(line)));
  await wait(500);
  await docker.containerAction("restart", [`${P}-web`]);
  await until(() => events.some(e => (e.Action === "restart" || e.status === "restart") && e.Actor?.Attributes?.name === `${P}-web`), "a restart event");
  stream.stop();
});

it("stops, pauses and starts containers", async () => {
  const state = async () => (await docker.containers()).find(x => x.name === `${P}-web`)?.state;
  await docker.containerAction("pause", [`${P}-web`]);
  assert.equal(await state(), "paused");
  await docker.containerAction("unpause", [`${P}-web`]);
  await docker.containerAction("stop", [`${P}-web`]);
  assert.equal(await state(), "exited");
  await docker.containerAction("start", [`${P}-web`]);
  assert.equal(await state(), "running");
});

it("explains real errors: a taken port, a missing image, an image in use", async () => {
  await assert.rejects(docker.run(["run", "-d", "--name", `${P}-clash`, "-p", "18080:80", "nginx:alpine"]), e => {
    assert.ok(e instanceof DockerError);
    assert.equal(e.explained.title, "Port 18080 is already in use", e.output);
    return true;
  });
  await docker.run(["rm", "-f", `${P}-clash`]).catch(() => {});
  await assert.rejects(docker.run(["pull", "veyra-does-not-exist-9f2a/nothing:1"], { timeoutMs: 120000 }), e => {
    assert.match(e.explained.title, /Image not found|Sign-in needed/, e.output);
    return true;
  });
  await assert.rejects(docker.removeImage("nginx:alpine"), e => {
    assert.equal(e.explained.title, "The image is in use", e.output);
    return true;
  });
});

it("lists, tags and removes images", async () => {
  await docker.tag("nginx:alpine", `${P}/nginx:copy`);
  const images = await docker.images();
  const copy = images.find(i => i.repository === `${P}/nginx` && i.tag === "copy");
  assert.ok(copy && copy.bytes > 1e6, JSON.stringify(copy));
  await docker.removeImage(`${P}/nginx:copy`);
  assert.ok(!(await docker.images()).some(i => i.repository === `${P}/nginx`));
});

it("lists volumes and networks, and removes them", async () => {
  await docker.run(["volume", "create", `${P}-data`]);
  await docker.run(["network", "create", `${P}-net`]);
  assert.ok((await docker.volumes()).some(v => v.name === `${P}-data`));
  const net = (await docker.networks()).find(n => n.name === `${P}-net`);
  assert.equal(net.builtIn, false);
  assert.equal((await docker.networks()).find(n => n.name === "bridge").builtIn, true);
  await docker.removeVolume(`${P}-data`);
  await docker.removeNetwork(net.id);
  assert.ok(!(await docker.volumes()).some(v => v.name === `${P}-data`));
});

it("Compose: up, group by project, find the compose file, stream logs with service names, down", async () => {
  const file = path.join(dir, "compose.yaml");
  fs.writeFileSync(file, [
    "services:",
    "  web:",
    "    image: nginx:alpine",
    "    ports:",
    '      - "18081:80"',
    "  worker:",
    "    image: busybox:1.36",
    '    command: ["sh", "-c", "while true; do echo tick; sleep 1; done"]',
    "",
  ].join("\n"));
  assert.deepEqual(m.composeServices(fs.readFileSync(file, "utf8")).map(s => s.name), ["web", "worker"]);
  await docker.run(["compose", "-p", P, "-f", file, "up", "-d"], { cwd: dir, timeoutMs: 300000 });
  const containers = await docker.containers();
  const group = m.groupContainers(containers).find(g => g.project === P);
  assert.ok(group, "the project is a group");
  assert.deepEqual(group.containers.map(c => c.service).sort(), ["web", "worker"]);
  assert.equal(fs.realpathSync(group.configFiles[0]), fs.realpathSync(file), "the compose file is found from the labels");
  const projects = await docker.composeProjects();
  assert.ok(projects.some(p => p.name === P), JSON.stringify(projects));
  const lines = [];
  const stream = docker.stream(["compose", "-p", P, "-f", file, "logs", "-f", "--tail", "20", "--timestamps", "--no-color"], line => lines.push(m.parseLogLine(line, true)), { cwd: dir });
  await until(() => lines.some(l => l.text === "tick" && /^worker/.test(l.source ?? "")), "worker log lines");
  stream.stop();
  assert.match(lines.find(l => l.text === "tick").time, /^\d{4}-/);
  await docker.run(["compose", "-p", P, "-f", file, "down"], { cwd: dir, timeoutMs: 120000 });
  assert.ok(!(await docker.containers()).some(c => c.project === P));
});

it("builds a Dockerfile that passes the checks, and runs it", async () => {
  const build = path.join(dir, "app");
  fs.mkdirSync(build, { recursive: true });
  const dockerfile = ["FROM busybox:1.36", "WORKDIR /app", "COPY hello.txt ./", "USER 1000", 'CMD ["cat", "/app/hello.txt"]', ""].join("\n");
  fs.writeFileSync(path.join(build, "Dockerfile"), dockerfile);
  fs.writeFileSync(path.join(build, "hello.txt"), "hello from veyra\n");
  fs.writeFileSync(path.join(build, ".dockerignore"), ".git\n");
  assert.deepEqual(m.lintDockerfile(dockerfile, { hasDockerignore: true }), []);
  await docker.run(["build", "-t", `${P}/built:1`, build], { timeoutMs: 300000 });
  const out = await docker.run(["run", "--rm", `${P}/built:1`]);
  assert.equal(out.trim(), "hello from veyra");
});

it("cleans up and measures disk use", async () => {
  await docker.containerAction("stop", [`${P}-web`]);
  const freed = await docker.prune("containers");
  assert.ok(freed.bytes >= 0);
  assert.ok(!(await docker.containers()).some(c => c.name === `${P}-web`), "stopped containers are removed");
  const disk = await docker.diskUsage();
  assert.deepEqual(disk.map(d => d.type).sort(), ["Build Cache", "Containers", "Images", "Local Volumes"]);
  assert.ok(disk.find(d => d.type === "Images").size > 0);
});

it("volume cleanup deletes unused anonymous volumes and keeps named ones", async () => {
  await docker.run(["volume", "create", `${P}-keep`]);
  const anonymous = (await docker.run(["volume", "create"])).trim();
  assert.match(anonymous, /^[0-9a-f]{64}$/);
  const result = await docker.prune("volumes");
  assert.ok(result.count >= 1);
  const names = (await docker.volumes()).map(v => v.name);
  assert.ok(names.includes(`${P}-keep`), "the named volume is kept");
  assert.ok(!names.includes(anonymous), "the anonymous volume is deleted");
  await docker.removeVolume(`${P}-keep`);
});

test("explains a missing docker command", async () => {
  const missing = new Docker("veyra-no-such-docker-command");
  await assert.rejects(missing.version(), e => { assert.equal(e.explained.title, "Docker is not installed"); return true; });
});
