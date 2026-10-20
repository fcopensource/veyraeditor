import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

// Lines exactly as `docker ps -a --format "{{json .}}"` prints them (Docker 27).
const PS = [
  `{"Command":"\\"docker-entrypoint.s…\\"","CreatedAt":"2026-10-20 10:00:00 +0530 IST","ID":"a1b2c3d4e5f6","Image":"postgres:16","Labels":"com.docker.compose.project=shop,com.docker.compose.service=db,com.docker.compose.project.config_files=C:\\\\work\\\\shop\\\\compose.yaml,com.docker.compose.version=2.29.1","LocalVolumes":"1","Mounts":"shop_pgdata","Names":"shop-db-1","Networks":"shop_default","Ports":"0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp","RunningFor":"2 hours ago","Size":"63B (virtual 432MB)","State":"running","Status":"Up 2 hours (healthy)"}`,
  `{"Command":"\\"/docker-entrypoint.…\\"","ID":"b2c3d4e5f6a1","Image":"nginx:alpine","Labels":"com.docker.compose.project=shop,com.docker.compose.service=web","Names":"shop-web-1","Ports":"0.0.0.0:8080->80/tcp, 443/tcp","RunningFor":"2 hours ago","State":"exited","Status":"Exited (137) 5 minutes ago"}`,
  `{"Command":"\\"redis-server\\"","ID":"c3d4e5f6a1b2","Image":"redis:7","Labels":"","Names":"cache","Ports":"6379/tcp","RunningFor":"3 days ago","State":"running","Status":"Up 3 days"}`,
  `{"ID":"d4e5f6a1b2c3","Image":"hello-world","Labels":"","Names":"eager_turing","Ports":"","State":"exited","Status":"Exited (0) 3 days ago"}`,
  `WARNING: something unrelated`,
].join("\n");

test("parses containers from docker ps, including compose labels with commas in values", () => {
  const list = m.jsonLines(PS).map(m.parseContainer);
  assert.equal(list.length, 4);
  const db = list[0];
  assert.equal(db.name, "shop-db-1");
  assert.equal(db.state, "running");
  assert.equal(db.health, "healthy");
  assert.equal(db.project, "shop");
  assert.equal(db.service, "db");
  assert.deepEqual(db.configFiles, ["C:\\work\\shop\\compose.yaml"]);
  assert.deepEqual(db.ports.map(p => p.hostPort), [5432], "IPv4 and IPv6 bindings of one port count once");
  assert.equal(list[1].state, "exited");
  assert.deepEqual(list[1].exposed, ["443/tcp"]);
  assert.equal(m.shortStatus(list[1]), "exited with code 137 5 minutes ago");
  assert.equal(m.shortStatus(list[3]), "exited 3 days ago");
  assert.equal(m.shortStatus(db), "up 2 hours");
});

test("parses port ranges and specific host addresses", () => {
  const { published } = m.parsePorts("127.0.0.1:3000-3002->3000-3002/tcp, 0.0.0.0:53->53/udp");
  assert.deepEqual(published.map(p => `${p.hostIp}:${p.hostPort}->${p.containerPort}/${p.protocol}`), ["127.0.0.1:3000->3000/tcp", "127.0.0.1:3001->3001/tcp", "127.0.0.1:3002->3002/tcp", "0.0.0.0:53->53/udp"]);
  assert.equal(m.portUrl(published[0]), "http://127.0.0.1:3000");
  assert.equal(m.portUrl({ hostIp: "0.0.0.0", hostPort: 8443, containerPort: 443, protocol: "tcp" }), "https://localhost:8443");
  assert.equal(m.portUrl({ hostIp: "::", hostPort: 80, containerPort: 80, protocol: "tcp" }), "http://localhost:80");
});

test("groups compose projects first, running containers first", () => {
  const groups = m.groupContainers(m.jsonLines(PS).map(m.parseContainer));
  assert.deepEqual(groups.map(g => g.project ?? "other"), ["shop", "other"]);
  assert.deepEqual(groups[0].containers.map(c => c.service), ["db", "web"]);
  assert.equal(groups[0].running, 1);
  assert.deepEqual(groups[1].containers.map(c => c.name), ["cache", "eager_turing"]);
});

test("parses images, volumes, networks, stats, disk usage and compose projects", () => {
  const images = m.jsonLines(`{"Containers":"N/A","CreatedAt":"2026-10-01","CreatedSince":"3 weeks ago","ID":"sha256:9c7a","Repository":"nginx","Size":"47.9MB","Tag":"alpine"}\n{"ID":"4f2e","Repository":"<none>","Size":"1.21GB","Tag":"<none>","CreatedSince":"2 days ago"}`).map(m.parseImage);
  assert.equal(images[0].bytes, 47_900_000);
  assert.equal(images[1].dangling, true);
  const volumes = m.jsonLines(`{"Driver":"local","Labels":"com.docker.compose.project=shop,com.docker.compose.volume=pgdata","Name":"shop_pgdata"}`).map(m.parseVolume);
  assert.equal(volumes[0].project, "shop");
  const networks = m.jsonLines(`{"Driver":"bridge","ID":"1","Name":"bridge","Scope":"local"}\n{"Driver":"bridge","ID":"2","Name":"shop_default","Scope":"local"}`).map(m.parseNetwork);
  assert.deepEqual(networks.map(n => n.builtIn), [true, false]);
  const [stats] = m.jsonLines(`{"BlockIO":"0B / 0B","CPUPerc":"12.53%","Container":"a1b2c3d4e5f6","ID":"a1b2c3d4e5f6","MemPerc":"1.30%","MemUsage":"101.5MiB / 7.6GiB","Name":"shop-db-1","NetIO":"1.2kB / 0B","PIDs":"7"}`).map(m.parseStats);
  assert.equal(stats.cpu, 12.53);
  assert.equal(stats.memUsed, Math.round(101.5 * 1024 ** 2));
  assert.equal(stats.pids, 7);
  const disk = m.jsonLines(`{"Active":"2","Reclaimable":"1.2GB (40%)","Size":"3GB","TotalCount":"9","Type":"Images"}\n{"Active":"0","Reclaimable":"512MB","Size":"512MB","TotalCount":"14","Type":"Build Cache"}`).map(m.parseDiskUsage);
  assert.equal(disk[0].reclaimable, 1.2e9);
  assert.equal(disk[1].size, 512e6);
  const projects = m.parseComposeProjects(`[{"Name":"shop","Status":"running(1), exited(1)","ConfigFiles":"C:\\\\work\\\\shop\\\\compose.yaml"}]`);
  assert.deepEqual(projects, [{ name: "shop", status: "running(1), exited(1)", configFiles: ["C:\\work\\shop\\compose.yaml"] }]);
});

test("sizes", () => {
  assert.equal(m.parseSize("0B"), 0);
  assert.equal(m.parseSize("1.5kB"), 1500);
  assert.equal(m.parseSize("2GiB"), 2 * 1024 ** 3);
  assert.equal(m.formatSize(0), "0 B");
  assert.equal(m.formatSize(47_900_000), "47.9 MB");
  assert.equal(m.formatSize(1_234_567_890), "1.2 GB");
  assert.equal(m.formatSize(512), "512 B");
});

test("explains Docker errors in plain words", () => {
  assert.equal(m.explainError("error during connect: Get \"http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.47/containers/json\": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.").title, "Docker is not running");
  assert.equal(m.explainError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?", "linux").detail, "Start the Docker service with: sudo systemctl start docker");
  assert.equal(m.explainError("spawn docker ENOENT").title, "Docker is not installed");
  assert.equal(m.explainError("permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock", "linux").title, "No permission to use Docker");
  assert.equal(m.explainError("Error response from daemon: driver failed programming external connectivity on endpoint web: Bind for 0.0.0.0:8080 failed: port is already allocated").title, "Port 8080 is already in use");
  assert.equal(m.explainError("Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:3000 -> 0.0.0.0:0: listen tcp 0.0.0.0:3000: bind: Only one usage of each socket address").title, "Port 3000 is already in use");
  assert.equal(m.explainError("Error response from daemon: pull access denied for nopee, repository does not exist or may require 'docker login'").title, "Image not found");
  assert.equal(m.explainError("toomanyrequests: You have reached your pull rate limit.").action, "login");
  assert.equal(m.explainError("write /var/lib/docker/tmp/x: no space left on device").action, "cleanup");
  assert.equal(m.explainError("Error response from daemon: conflict: unable to remove repository reference \"nginx\" (must force) - container 1a2b3c4d5e6f is using its referenced image 9c7a").title, "The image is in use");
  assert.equal(m.explainError('docker: Error response from daemon: Conflict. The container name "/web" is already in use by container "abc".').title, 'The name "web" is taken');
  assert.equal(m.explainError("something odd\nreally odd").title, "Docker reported an error");
});

test("Dockerfile checks find common mistakes, with fixes", () => {
  const text = [
    "FROM node",
    "MAINTAINER Ana <ana@example.com>",
    "RUN apt-get update && apt-get install curl",
    "ADD . /app",
    "RUN cd /app",
    "RUN npm install",
    "ENV API_TOKEN=abc123",
    "EXPOSE 3000 99999",
    "CMD node server.js",
  ].join("\n");
  const findings = m.lintDockerfile(text, { hasDockerignore: false });
  const codes = findings.map(f => f.code);
  for (const code of ["pin-version", "maintainer", "apt-yes", "apt-clean", "use-copy", "use-workdir", "npm-ci", "secret", "bad-port", "exec-form", "root-user"])
    assert.ok(codes.includes(code), `finds ${code}, got ${codes.join(", ")}`);
  const fix = code => findings.find(f => f.code === code).fix?.text;
  assert.equal(fix("maintainer"), 'LABEL maintainer="Ana <ana@example.com>"');
  assert.equal(fix("apt-yes"), "RUN apt-get update && apt-get install -y curl");
  assert.equal(fix("use-copy"), "COPY . /app");
  assert.equal(fix("use-workdir"), "WORKDIR /app");
  assert.equal(fix("npm-ci"), "RUN npm ci");
  assert.equal(fix("exec-form"), 'CMD ["node", "server.js"]');
  const pin = findings.find(f => f.code === "pin-version");
  assert.deepEqual([pin.line, pin.start, pin.end], [0, 5, 9], "points at the image name");
});

test("a good Dockerfile has no findings", () => {
  const text = [
    "# syntax=docker/dockerfile:1",
    "FROM node:22-slim AS build",
    "WORKDIR /app",
    "COPY package*.json ./",
    "RUN npm ci",
    "COPY . .",
    "RUN npm run build",
    "",
    "FROM node:22-slim",
    "RUN apt-get update \\",
    "    && apt-get install -y --no-install-recommends tini \\",
    "    && rm -rf /var/lib/apt/lists/*",
    "WORKDIR /app",
    "COPY --from=build /app/dist ./dist",
    "USER node",
    "EXPOSE 3000",
    'ENTRYPOINT ["tini", "--"]',
    'CMD ["node", "dist/server.js"]',
  ].join("\n");
  assert.deepEqual(m.lintDockerfile(text, { hasDockerignore: true }), []);
  assert.deepEqual(m.exposedPorts(text), [3000]);
});

test("Dockerfile checks: stage names, ARG before FROM, scratch, shell CMD with pipes", () => {
  const text = ["ARG VERSION=3.20", "FROM alpine:${VERSION} AS base", "FROM base", "RUN apk add curl", "USER 1000", 'CMD echo "hi" | cat'].join("\n");
  const findings = m.lintDockerfile(text);
  const codes = findings.map(f => f.code);
  assert.ok(!codes.includes("pin-version"), "a stage name and a variable tag are fine");
  assert.ok(!codes.includes("from-first"));
  assert.ok(!codes.includes("root-user"));
  assert.ok(codes.includes("apk-cache"));
  assert.equal(findings.find(f => f.code === "exec-form").fix, undefined, "no automatic fix when the command needs a shell");
  assert.deepEqual(m.lintDockerfile("FROM scratch\nCOPY app /app\n").map(f => f.code), []);
  assert.deepEqual(m.lintDockerfile("RUN echo hi").map(f => f.code), ["no-from"]);
});

test("finds services in compose files", () => {
  const text = [
    "name: shop",
    "services:",
    "  web:",
    "    build: .",
    "    ports:",
    '      - "8080:80"',
    "      - target: 443",
    "        published: 8443",
    "  db:",
    "    image: postgres:16 # the database",
    "    ports: [\"5432:5432\"]",
    "  'worker':",
    "    image: busybox",
    "volumes:",
    "  pgdata: {}",
  ].join("\n");
  assert.deepEqual(m.composeServices(text), [
    { name: "web", line: 2, build: true, ports: ["8080:80", "8443"] },
    { name: "db", line: 8, image: "postgres:16", build: false, ports: ["5432:5432"] },
    { name: "worker", line: 11, image: "busybox", build: false, ports: [] },
  ]);
  assert.ok(m.COMPOSE_FILE.test("compose.yaml") && m.COMPOSE_FILE.test("docker-compose.override.yml") && m.COMPOSE_FILE.test("compose.prod.yml") && !m.COMPOSE_FILE.test("config.yaml"));
});

test("log lines from docker logs and docker compose logs", () => {
  assert.deepEqual(m.parseLogLine("2026-10-20T10:00:00.123456789Z listening on :80", false), { time: "2026-10-20T10:00:00.123456789Z", source: undefined, text: "listening on :80" });
  assert.deepEqual(m.parseLogLine("web-1  | 2026-10-20T10:00:00.000000000Z GET / 200", true), { time: "2026-10-20T10:00:00.000000000Z", source: "web-1", text: "GET / 200" });
  assert.deepEqual(m.parseLogLine("plain line", false), { text: "plain line", source: undefined });
});

test("names and run arguments", () => {
  assert.equal(m.imageNameFor("My Shop_API!"), "my-shop_api");
  assert.equal(m.imageNameFor("---"), "app");
  assert.deepEqual(m.runArgs("shop:latest", [3000, 9229], "shop"), ["run", "--rm", "-it", "--name", "shop", "-p", "3000:3000", "-p", "9229:9229", "shop:latest"]);
  assert.equal(m.shellQuote("it's", "posix"), `'it'\\''s'`);
  assert.equal(m.shellQuote("a b", "powershell"), "'a b'");
});
