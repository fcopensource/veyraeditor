// Unit tests for the data model, with real-world output from each operating system.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const m = require("../out/model.js");

const proc = (pid, name, extra = {}) => ({ pid, name, owned: true, ...extra });

test("Windows: PowerShell JSON, single objects as well as arrays", () => {
  const json = JSON.stringify({
    listeners: [
      { LocalAddress: "::", LocalPort: 5173, OwningProcess: 4120 },
      { LocalAddress: "0.0.0.0", LocalPort: 5173, OwningProcess: 4120 },
      { LocalAddress: "0.0.0.0", LocalPort: 135, OwningProcess: 1012 },
    ],
    processes: [
      { ProcessId: 4120, Name: "node.exe", ExecutablePath: "C:\\Program Files\\nodejs\\node.exe", CommandLine: "\"C:\\Program Files\\nodejs\\node.exe\" C:\\work\\shop\\node_modules\\vite\\bin\\vite.js" },
      { ProcessId: 1012, Name: "svchost.exe", ExecutablePath: null, CommandLine: null },
    ],
  });
  const { listeners, processes } = m.parseWindowsJson("\uFEFF" + json, "C:\\Windows");
  assert.equal(listeners.length, 3);
  assert.equal(processes.get(4120).owned, true);
  assert.equal(processes.get(1012).owned, false, "no access to the path: a system program");
  // PowerShell writes a single item as an object, not an array.
  const single = m.parseWindowsJson(JSON.stringify({ listeners: { LocalAddress: "127.0.0.1", LocalPort: 3000, OwningProcess: 7 }, processes: { ProcessId: 7, Name: "python.exe", ExecutablePath: "C:\\Windows\\py.exe" } }), "C:\\Windows\\");
  assert.equal(single.listeners.length, 1);
  assert.equal(single.processes.get(7).owned, false, "programs inside %SystemRoot% are system programs");
});

test("Windows fallback: netstat in any language, IPv4 and IPv6", () => {
  const output = [
    "Aktive Verbindungen",
    "  Proto  Lokale Adresse         Remoteadresse          Status           PID",
    "  TCP    0.0.0.0:135            0.0.0.0:0              ABHÖREN         1012",
    "  TCP    127.0.0.1:3000         0.0.0.0:0              ABHÖREN         9001",
    "  TCP    192.168.1.5:52000      140.82.112.4:443       HERGESTELLT     9001",
    "  TCP    [::]:5173              [::]:0                 ABHÖREN         4120",
    "  UDP    0.0.0.0:5353           *:*                                    2222",
  ].join("\r\n");
  assert.deepEqual(m.parseNetstat(output), [
    { address: "0.0.0.0", port: 135, pid: 1012 },
    { address: "127.0.0.1", port: 3000, pid: 9001 },
    { address: "", port: 5173, pid: 4120 },
  ].map(l => l.port === 5173 ? { ...l, address: "::" } : l));
  const names = m.parseTasklistCsv('"node.exe","4120","Console","1","95,512 K"\r\n"svchost.exe","1012","Services","0","12,000 K"');
  assert.equal(names.get(4120).name, "node.exe");
  assert.equal(names.get(4120).owned, false, "ownership unknown in the fallback: nothing is stoppable");
});

test("macOS/Linux: lsof field output, owner and IPv6", () => {
  const output = ["p501", "cnode", "Lvikram", "f23", "n*:3000", "f24", "n[::1]:3000", "p88", "cpostgres", "Lpostgres", "f7", "n127.0.0.1:5432", "p77", "cControlCe", "Lvikram", "f5", "n[fe80::1%lo0]:7000"].join("\n");
  const { listeners, processes } = m.parseLsof(output, "vikram");
  assert.deepEqual(listeners, [
    { address: "0.0.0.0", port: 3000, pid: 501 },
    { address: "::1", port: 3000, pid: 501 },
    { address: "127.0.0.1", port: 5432, pid: 88 },
    { address: "fe80::1", port: 7000, pid: 77 },
  ]);
  assert.equal(processes.get(501).owned, true);
  assert.equal(processes.get(88).owned, false, "another user's program");
  assert.equal(m.parseLsofCwd("p501\nfcwd\nn/home/vikram/shop\n").get(501), "/home/vikram/shop");
  assert.equal(m.parsePs("  501 node /home/vikram/shop/node_modules/.bin/next dev\n").get(501), "node /home/vikram/shop/node_modules/.bin/next dev");
});

test("Linux fallback: ss output", () => {
  const output = [
    'LISTEN 0      511          0.0.0.0:8000      0.0.0.0:*    users:(("python3",pid=2100,fd=3))',
    "LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*",
    'LISTEN 0      511             [::]:8000         [::]:*    users:(("python3",pid=2100,fd=4))',
  ].join("\n");
  const { listeners, processes } = m.parseSs(output);
  assert.deepEqual(listeners, [{ address: "0.0.0.0", port: 8000, pid: 2100 }, { address: "::", port: 8000, pid: 2100 }]);
  assert.equal(processes.get(2100).name, "python3");
});

test("frameworks are recognised from the command line, most specific first", () => {
  const cases = [
    ["node.exe", "node C:\\app\\node_modules\\vite\\bin\\vite.js", "vite"],
    ["node", "node /app/node_modules/.bin/next dev", "next"],
    ["node", "next-server (v15.1.0)", "next"],
    ["node", "node /app/node_modules/nuxt/bin/nuxt.mjs dev", "nuxt"],
    ["node", "node /app/node_modules/react-scripts/scripts/start.js", "cra"],
    ["python3", "python3 manage.py runserver", "django"],
    ["python", "python -m flask run", "flask"],
    ["Python", "/usr/bin/python3 -m uvicorn main:app --reload", "uvicorn"],
    ["ruby", "puma 6.4.2 (tcp://localhost:3000) [shop]", "rails"],
    ["php", "php artisan serve", "laravel"],
    ["postgres", "/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql", "postgres"],
    ["com.docker.backend", "", "docker"],
    ["node", "node server.js", "node"],
    ["mystery", "", undefined],
  ];
  for (const [name, command, id] of cases) assert.equal(m.detectFramework({ name, command })?.id, id, `${name} ${command}`);
  assert.equal(m.detectFramework({ name: "node", command: "node export.js" })?.id, "node", "\"export\" is not Expo");
});

test("snapshots merge addresses, hide system programs, index by port and process, and find the workspace", () => {
  const listeners = [
    { address: "::", port: 5173, pid: 10 }, { address: "0.0.0.0", port: 5173, pid: 10 },
    { address: "127.0.0.1", port: 9229, pid: 10 },
    { address: "127.0.0.1", port: 3000, pid: 20 },
    { address: "0.0.0.0", port: 135, pid: 1012 },
    { address: "0.0.0.0", port: 99999, pid: 30 }, { address: "0.0.0.0", port: 5037, pid: 40 },
  ];
  const processes = new Map([
    [10, proc(10, "node.exe", { command: "node C:\\Work\\Shop\\node_modules\\vite\\bin\\vite.js" })],
    [20, proc(20, "python.exe", { cwd: "/srv/other" })],
    [1012, proc(1012, "svchost.exe", { owned: false })],
    [40, proc(40, "adb.exe")],
  ]);
  const snapshot = m.buildSnapshot(listeners, processes, { workspaces: ["c:\\work\\shop"], caseInsensitivePaths: true, hidden: new Set([5037]), now: 1 });
  assert.deepEqual(snapshot.entries.map(e => `${e.port}/${e.pid}`), ["3000/20", "5173/10", "9229/10"], "sorted; system, hidden and invalid ports left out");
  const vite = snapshot.byPort.get(5173)[0];
  assert.deepEqual(vite.addresses, ["0.0.0.0", "::"]);
  assert.equal(vite.framework.id, "vite");
  assert.equal(vite.workspace, "c:\\work\\shop");
  assert.equal(vite.localOnly, false);
  assert.equal(snapshot.byPid.get(10).length, 2);
  assert.equal(snapshot.byPort.get(3000)[0].localOnly, true);
  assert.equal(snapshot.byPort.get(3000)[0].workspace, undefined);
  const withSystem = m.buildSnapshot(listeners, processes, { includeSystem: true });
  assert.equal(withSystem.byPort.get(135)[0].protected, true, "shown, but never stoppable");
});

test("diffs find new and stopped servers by identity", () => {
  // (Process IDs 0-4 belong to the operating system, so real programs have higher ones.)
  const p = new Map([[101, proc(101, "node")], [102, proc(102, "node")]]);
  const before = m.buildSnapshot([{ address: "::", port: 3000, pid: 101 }], p);
  const after = m.buildSnapshot([{ address: "::", port: 3000, pid: 101 }, { address: "::", port: 4000, pid: 102 }], p);
  assert.deepEqual(m.diffSnapshots(undefined, after), { added: [], removed: [] }, "the first scan announces nothing");
  const { added, removed } = m.diffSnapshots(before, after);
  assert.deepEqual(added.map(e => e.port), [4000]);
  assert.deepEqual(m.diffSnapshots(after, before).removed.map(e => e.port), [4000]);
  assert.equal(removed.length, 0);
});

test("browser addresses, ports and protection rules", () => {
  const entry = addresses => ({ port: 8080, addresses });
  assert.equal(m.pageUrl(entry(["0.0.0.0", "::"])), "http://localhost:8080/");
  assert.equal(m.pageUrl(entry(["::1"])), "http://localhost:8080/");
  assert.equal(m.pageUrl(entry(["192.168.1.5"])), "http://192.168.1.5:8080/");
  assert.equal(m.pageUrl(entry(["fe80::1"])), "http://[fe80::1]:8080/");
  assert.deepEqual(m.splitHostPort("[::1]:5173"), ["::1", 5173]);
  assert.deepEqual(m.splitHostPort("*:80"), ["0.0.0.0", 80]);
  assert.equal(m.splitHostPort("127.0.0.1:0"), undefined);
  assert.equal(m.splitHostPort("garbage"), undefined);
  assert.equal(m.isProtected(proc(4, "System")), true);
  assert.equal(m.isProtected(proc(500, "launchd")), true);
  assert.equal(m.isProtected(proc(501, "node", { owned: false })), true);
  assert.equal(m.isProtected(proc(502, "node")), false);
  assert.equal(m.isBrowsable({ framework: { kind: "database" } }), false);
  assert.equal(m.isBrowsable({ framework: undefined }), true);
});

test("code editors are recognised and protected, so stopping one can never close the editor", () => {
  for (const name of ["Code.exe", "Code - Insiders.exe", "Code Helper (Plugin)", "Cursor.exe", "Windsurf", "Veyra Studio.exe"]) {
    assert.equal(m.detectFramework({ name, command: "--type=utility --ms-enable-electron-run-as-node" })?.kind, "editor", name);
  }
  assert.equal(m.detectFramework({ name: "node.exe", command: "C:\Program Files\Microsoft VS Code\Code.exe --inspect" })?.id, "node", "only the program name decides");
  const snapshot = m.buildSnapshot([{ address: "127.0.0.1", port: 5500, pid: 900 }], new Map([[900, { pid: 900, name: "Code.exe", owned: true }]]));
  const entry = snapshot.entries[0];
  assert.equal(entry.protected, true);
  assert.equal(m.isBrowsable(entry), true, "Live Server inside VS Code still opens in the browser");
});

test("entries are grouped: this workspace, apps, editors and tools, system", () => {
  const listeners = [
    { address: "::", port: 5173, pid: 100 }, { address: "::", port: 8000, pid: 200 },
    { address: "127.0.0.1", port: 5500, pid: 300 }, { address: "0.0.0.0", port: 2375, pid: 400 },
    { address: "0.0.0.0", port: 445, pid: 500 },
  ];
  const processes = new Map([
    [100, { pid: 100, name: "node", owned: true, cwd: "/home/a/shop" }],
    [200, { pid: 200, name: "python3", owned: true, command: "python3 -m http.server" }],
    [300, { pid: 300, name: "code", owned: true }],
    [400, { pid: 400, name: "com.docker.backend", owned: true }],
    [500, { pid: 500, name: "smbd", owned: false }],
  ]);
  const groups = m.groupEntries(m.buildSnapshot(listeners, processes, { workspaces: ["/home/a/shop"], includeSystem: true }).entries);
  assert.deepEqual(groups.map(g => [g.id, g.entries.map(e => e.port)]), [
    ["workspace", [5173]], ["apps", [8000]], ["editors", [2375, 5500]], ["system", [445]],
  ]);
  assert.deepEqual(m.groupEntries([]), []);
});
