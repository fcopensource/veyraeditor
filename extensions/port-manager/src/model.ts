// Veyra Port Manager: the data model. Pure functions with no VS Code or operating-system calls, so every
// rule here is unit-tested with real command output (test/model.test.mjs).
//
//   raw sockets ─┐
//                ├─ buildSnapshot ─▶ Snapshot { entries (sorted), byPort, byPid }
//   processes  ──┘                         │
//                                   diffSnapshots(previous, next) ─▶ { added, removed }

/** One listening TCP socket as the operating system reports it. */
export interface Listener { port: number; address: string; pid: number }

/** What we know about the program behind a socket. */
export interface ProcessInfo {
  pid: number;
  name: string;
  /** Full command line, when the system lets us read it. */
  command?: string;
  /** Executable path (Windows) or working directory (macOS/Linux), when readable. */
  path?: string;
  cwd?: string;
  /** Started by the current user (not a system service): only these can be stopped. */
  owned: boolean;
}

export type FrameworkKind = "web" | "database" | "runtime" | "tool" | "editor";
export interface Framework { id: string; label: string; kind: FrameworkKind }

/** One row in the Ports view: a program listening on a port (all its addresses merged). */
export interface PortEntry {
  /** Stable identity across scans: the same process on the same port. */
  key: string;
  port: number;
  /** Every address this port is bound to, e.g. ["0.0.0.0", "::"]. */
  addresses: string[];
  pid: number;
  process: ProcessInfo;
  framework?: Framework;
  /** Reachable only from this computer (every address is loopback). */
  localOnly: boolean;
  /** A system service, another user's program or a code editor (stopping it would close the editor):
      never offered for stopping. */
  protected: boolean;
  /** The workspace folder this program runs from, when we can tell. */
  workspace?: string;
}

export interface Snapshot {
  /** Sorted by port, then process ID. */
  entries: PortEntry[];
  byPort: Map<number, PortEntry[]>;
  byPid: Map<number, PortEntry[]>;
  takenAt: number;
}

export const entryKey = (pid: number, port: number) => `${pid}:${port}`;

/* ---------- Frameworks ---------- */

/** Recognised programs, most specific first: the first rule that matches "name + command line" wins. */
const RULES: ReadonlyArray<Framework & { pattern: RegExp }> = [
  // Code editors host language servers, debuggers and extensions such as Live Server. Matched on the program name.
  { id: "vscode", label: "VS Code", kind: "editor", pattern: /^(code( - insiders)?|code helper[^ ]*|codium|vscodium)(\.exe)?(\s|$)/i },
  { id: "cursor", label: "Cursor", kind: "editor", pattern: /^cursor( helper[^ ]*)?(\.exe)?(\s|$)/i },
  { id: "windsurf", label: "Windsurf", kind: "editor", pattern: /^windsurf(\.exe)?(\s|$)/i },
  { id: "veyra", label: "Veyra Studio", kind: "editor", pattern: /^veyra( studio)?(\.exe)?(\s|$)/i },
  { id: "vite", label: "Vite", kind: "web", pattern: /[\\/]vite[\\/]bin|\bvite(\.js)?(\s|$)|vite(\s+(dev|preview|serve))/i },
  { id: "next", label: "Next.js", kind: "web", pattern: /next-server|[\\/]next[\\/]dist|\bnext\s+(dev|start)\b/i },
  { id: "nuxt", label: "Nuxt", kind: "web", pattern: /\bnux[ti](\.mjs)?\b/i },
  { id: "astro", label: "Astro", kind: "web", pattern: /[\\/]astro[\\/]|\bastro\s+(dev|preview)\b/i },
  { id: "sveltekit", label: "SvelteKit", kind: "web", pattern: /svelte-kit|sveltekit/i },
  { id: "remix", label: "Remix", kind: "web", pattern: /[\\/]@remix-run[\\/]|\bremix\s+(dev|vite)/i },
  { id: "angular", label: "Angular", kind: "web", pattern: /@angular[\\/]cli|\bng(\.js)?\s+serve\b/i },
  { id: "cra", label: "Create React App", kind: "web", pattern: /react-scripts/i },
  { id: "gatsby", label: "Gatsby", kind: "web", pattern: /\bgatsby\b/i },
  { id: "storybook", label: "Storybook", kind: "web", pattern: /storybook/i },
  { id: "expo", label: "Expo", kind: "web", pattern: /\bexpo\b/i },
  { id: "webpack", label: "webpack", kind: "web", pattern: /webpack(-dev-server|\s+serve)/i },
  { id: "parcel", label: "Parcel", kind: "web", pattern: /[\\/]parcel[\\/]|\bparcel\s/i },
  { id: "liveserver", label: "Live Server", kind: "web", pattern: /live-server|five-server/i },
  { id: "django", label: "Django", kind: "web", pattern: /manage\.py["']?\s+runserver/i },
  { id: "flask", label: "Flask", kind: "web", pattern: /flask\s+run|-m\s+flask/i },
  { id: "uvicorn", label: "Uvicorn / FastAPI", kind: "web", pattern: /uvicorn|fastapi\s+(dev|run)/i },
  { id: "rails", label: "Rails", kind: "web", pattern: /\brails\s+s(erver)?\b|\bpuma\b/i },
  { id: "laravel", label: "Laravel", kind: "web", pattern: /artisan["']?\s+serve/i },
  { id: "php", label: "PHP server", kind: "web", pattern: /\bphp(\.exe)?["']?\s+-S\s/i },
  { id: "hugo", label: "Hugo", kind: "web", pattern: /\bhugo(\.exe)?["']?\s+server/i },
  { id: "jupyter", label: "Jupyter", kind: "web", pattern: /jupyter/i },
  { id: "spring", label: "Spring Boot", kind: "web", pattern: /spring-boot|org\.springframework/i },
  { id: "dotnet", label: ".NET", kind: "web", pattern: /\bdotnet(\.exe)?["']?\s+(run|watch)|aspnetcore/i },
  { id: "postgres", label: "PostgreSQL", kind: "database", pattern: /\bpostgres(\.exe)?\b/i },
  { id: "mysql", label: "MySQL", kind: "database", pattern: /\bmysqld(\.exe)?\b|\bmariadbd?\b/i },
  { id: "mongodb", label: "MongoDB", kind: "database", pattern: /\bmongod(\.exe)?\b/i },
  { id: "redis", label: "Redis", kind: "database", pattern: /redis-server/i },
  { id: "docker", label: "Docker", kind: "tool", pattern: /com\.docker|docker-proxy|\bvpnkit\b|wslrelay|docker desktop/i },
  { id: "deno", label: "Deno", kind: "runtime", pattern: /\bdeno(\.exe)?\b/i },
  { id: "bun", label: "Bun", kind: "runtime", pattern: /\bbun(\.exe)?\b/i },
  { id: "node", label: "Node.js", kind: "runtime", pattern: /\bnode(\.exe)?\b/i },
  { id: "python", label: "Python", kind: "runtime", pattern: /\bpython[\d.]*(\.exe)?\b/i },
  { id: "java", label: "Java", kind: "runtime", pattern: /\bjava(w)?(\.exe)?\b/i },
  { id: "ruby", label: "Ruby", kind: "runtime", pattern: /\bruby(\.exe)?\b/i },
  { id: "go", label: "Go", kind: "runtime", pattern: /go-build|\bgo\s+run\b/i },
];

export function detectFramework(process: Pick<ProcessInfo, "name" | "command">): Framework | undefined {
  const text = `${process.name} ${process.command ?? ""}`;
  const rule = RULES.find(rule => rule.pattern.test(text));
  return rule && { id: rule.id, label: rule.label, kind: rule.kind };
}

/** Whether "Open in Browser" makes sense: everything except databases (Docker and editors often serve web pages). */
export const isBrowsable = (entry: Pick<PortEntry, "framework">) => entry.framework?.kind !== "database";

/* ---------- Addresses ---------- */

export const isLoopback = (address: string) => /^(127\.|::1$|::ffff:127\.|localhost$)/i.test(address);
const isWildcard = (address: string) => address === "0.0.0.0" || address === "::" || address === "*" || address === "[::]";

/** The address to open in a browser: localhost unless the server listens on one specific other address. */
export function browserHost(entry: PortEntry): string {
  if (entry.addresses.some(a => isWildcard(a) || isLoopback(a))) return "localhost";
  const address = entry.addresses[0] ?? "localhost";
  return address.includes(":") ? `[${address}]` : address;
}
export const pageUrl = (entry: PortEntry) => `http://${browserHost(entry)}:${entry.port}/`;

/** "host:port", "[v6]:port" or "*:port" → [address, port]. */
export function splitHostPort(text: string): [string, number] | undefined {
  const match = /^\[?([^\]]*?)\]?:(\d+)$/.exec(text.trim());
  if (!match) return undefined;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  const address = match[1] === "*" ? "0.0.0.0" : match[1].replace(/%.*$/, ""); // drop IPv6 zone ("fe80::1%lo0")
  return [address, port];
}

/* ---------- Protection ---------- */

/** System programs that hold ports and must never be stopped from an editor. */
const SYSTEM_NAMES = new Set([
  "system", "idle", "svchost.exe", "services.exe", "lsass.exe", "wininit.exe", "winlogon.exe", "csrss.exe", "smss.exe",
  "spoolsv.exe", "searchindexer.exe", "msmpeng.exe", "launchd", "systemd", "systemd-resolved", "init", "sshd", "rapportd",
  "controlcenter", "mdnsresponder", "cupsd", "avahi-daemon", "dnsmasq", "chronyd", "rpcbind",
]);
export function isProtected(process: ProcessInfo): boolean {
  return process.pid <= 4 || !process.owned || SYSTEM_NAMES.has(process.name.toLowerCase());
}

/* ---------- Building and comparing snapshots ---------- */

export interface BuildOptions {
  /** Workspace folder paths, to mark programs running from them. */
  workspaces?: readonly string[];
  /** Include system services and other users' programs (shown, but never stoppable). */
  includeSystem?: boolean;
  /** Ports never shown. */
  hidden?: ReadonlySet<number>;
  /** Paths compare case-insensitively (Windows, macOS). */
  caseInsensitivePaths?: boolean;
  now?: number;
}

/** Turns raw sockets plus process details into the Ports view's rows: deduplicated, enriched, sorted and indexed. */
export function buildSnapshot(listeners: readonly Listener[], processes: ReadonlyMap<number, ProcessInfo>, options: BuildOptions = {}): Snapshot {
  const merged = new Map<string, { port: number; pid: number; addresses: Set<string> }>();
  for (const listener of listeners) {
    if (!Number.isInteger(listener.port) || listener.port < 1 || listener.port > 65535 || !Number.isInteger(listener.pid) || listener.pid < 0) continue;
    if (options.hidden?.has(listener.port)) continue;
    const key = entryKey(listener.pid, listener.port);
    const found = merged.get(key) ?? { port: listener.port, pid: listener.pid, addresses: new Set<string>() };
    found.addresses.add(listener.address);
    merged.set(key, found);
  }

  const fold = (text: string) => (options.caseInsensitivePaths ? text.toLowerCase() : text).replace(/[\\/]+$/, "");
  const workspaces = (options.workspaces ?? []).map(path => ({ path, folded: fold(path) })).sort((a, b) => b.folded.length - a.folded.length);
  const workspaceOf = (process: ProcessInfo) => {
    const places = [process.cwd, process.command, process.path].filter((text): text is string => !!text).map(fold);
    return workspaces.find(ws => places.some(place => place === ws.folded || place.includes(ws.folded + "/") || place.includes(ws.folded + "\\")))?.path;
  };

  const entries: PortEntry[] = [];
  for (const [key, { port, pid, addresses }] of merged) {
    const process = processes.get(pid) ?? { pid, name: pid === 0 ? "System" : `PID ${pid}`, owned: false };
    const isSystem = isProtected(process);
    if (isSystem && !options.includeSystem) continue;
    const sortedAddresses = [...addresses].sort();
    const framework = detectFramework(process);
    entries.push({
      key, port, pid, process, addresses: sortedAddresses, framework,
      localOnly: sortedAddresses.every(isLoopback),
      protected: isSystem || framework?.kind === "editor",
      workspace: workspaceOf(process),
    });
  }
  entries.sort((a, b) => a.port - b.port || a.pid - b.pid);

  const byPort = new Map<number, PortEntry[]>(), byPid = new Map<number, PortEntry[]>();
  for (const entry of entries) {
    (byPort.get(entry.port) ?? byPort.set(entry.port, []).get(entry.port)!).push(entry);
    (byPid.get(entry.pid) ?? byPid.set(entry.pid, []).get(entry.pid)!).push(entry);
  }
  return { entries, byPort, byPid, takenAt: options.now ?? Date.now() };
}

/* ---------- Grouping for the Ports view ---------- */

export type GroupId = "workspace" | "apps" | "editors" | "system";
export interface Group { id: GroupId; label: string; entries: PortEntry[] }
const GROUP_LABELS: Record<GroupId, string> = { workspace: "This Workspace", apps: "Apps & Dev Servers", editors: "Editors & Tools", system: "System & Other Users" };

export function groupOf(entry: PortEntry): GroupId {
  if (entry.protected && !entry.process.owned) return "system";
  if (entry.framework?.kind === "editor") return "editors";
  if (entry.workspace) return "workspace";
  return entry.framework?.kind === "tool" ? "editors" : "apps";
}

/** The view's sections, in a fixed order, leaving out empty ones (entries keep their port order). */
export function groupEntries(entries: readonly PortEntry[]): Group[] {
  const buckets = new Map<GroupId, PortEntry[]>((Object.keys(GROUP_LABELS) as GroupId[]).map(id => [id, []]));
  for (const entry of entries) buckets.get(groupOf(entry))!.push(entry);
  return [...buckets].filter(([, list]) => list.length).map(([id, list]) => ({ id, label: GROUP_LABELS[id], entries: list }));
}

/** What changed between two scans, by entry identity (process + port). */
export function diffSnapshots(previous: Snapshot | undefined, next: Snapshot): { added: PortEntry[]; removed: PortEntry[] } {
  if (!previous) return { added: [], removed: [] };
  const before = new Set(previous.entries.map(entry => entry.key));
  const after = new Set(next.entries.map(entry => entry.key));
  return {
    added: next.entries.filter(entry => !before.has(entry.key)),
    removed: previous.entries.filter(entry => !after.has(entry.key)),
  };
}

/* ---------- Parsers for each operating system's output ---------- */

type Json = Record<string, unknown>;
const asArray = (value: unknown): Json[] => Array.isArray(value) ? value as Json[] : value && typeof value === "object" ? [value as Json] : [];
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Windows: the JSON printed by our PowerShell query (Get-NetTCPConnection + Win32_Process).
    `systemRoot` is %SystemRoot%: programs inside it are system programs. */
export function parseWindowsJson(json: string, systemRoot = "C:\\Windows"): { listeners: Listener[]; processes: Map<number, ProcessInfo> } {
  const data = JSON.parse(json.replace(/^\uFEFF/, "")) as Json;
  const listeners: Listener[] = asArray(data.listeners).map(item => ({
    address: String(item.LocalAddress ?? ""), port: Number(item.LocalPort), pid: Number(item.OwningProcess),
  })).filter(listener => listener.port > 0);
  const root = systemRoot.toLowerCase().replace(/[\\/]+$/, "") + "\\";
  const processes = new Map<number, ProcessInfo>();
  for (const item of asArray(data.processes)) {
    const pid = Number(item.ProcessId);
    const path = text(item.ExecutablePath);
    // Without access to the executable path, the program belongs to the system or another user.
    processes.set(pid, { pid, name: text(item.Name) ?? `PID ${pid}`, path, command: text(item.CommandLine), owned: !!path && !path.toLowerCase().startsWith(root) });
  }
  return { listeners, processes };
}

/** Windows fallback: `netstat -ano -p TCP`. The state column is translated on non-English Windows,
    so listening sockets are recognised by their foreign address (0.0.0.0:0 or [::]:0) instead. */
export function parseNetstat(output: string): Listener[] {
  const listeners: Listener[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || !/^TCP/i.test(columns[0])) continue;
    if (!/^(0\.0\.0\.0|\[::\]|\*):(0|\*)$/.test(columns[2])) continue;
    const local = splitHostPort(columns[1]);
    const pid = Number(columns[columns.length - 1]);
    if (local && Number.isInteger(pid)) listeners.push({ address: local[0], port: local[1], pid });
  }
  return listeners;
}

/** Windows fallback: `tasklist /fo csv /nh` → process names (ownership unknown, so nothing is stoppable). */
export function parseTasklistCsv(output: string): Map<number, ProcessInfo> {
  const processes = new Map<number, ProcessInfo>();
  for (const line of output.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replace(/""/g, '"'));
    const pid = Number(cells[1]);
    if (cells.length >= 2 && Number.isInteger(pid)) processes.set(pid, { pid, name: cells[0], owned: false });
  }
  return processes;
}

/** macOS/Linux: `lsof -nP -iTCP -sTCP:LISTEN -F pcLn`. Each line is a field: p=PID, c=command, L=login, n=address. */
export function parseLsof(output: string, user?: string): { listeners: Listener[]; processes: Map<number, ProcessInfo> } {
  const listeners: Listener[] = [];
  const processes = new Map<number, ProcessInfo>();
  let current: ProcessInfo | undefined;
  for (const line of output.split(/\r?\n/)) {
    const field = line[0], value = line.slice(1);
    if (field === "p") {
      const pid = Number(value);
      current = processes.get(pid) ?? { pid, name: `PID ${pid}`, owned: user === undefined };
      processes.set(pid, current);
    } else if (!current) continue;
    else if (field === "c") current.name = value;
    else if (field === "L") current.owned = user === undefined || value === user;
    else if (field === "n") {
      const local = splitHostPort(value.split("->")[0]);
      if (local) listeners.push({ address: local[0], port: local[1], pid: current.pid });
    }
  }
  return { listeners, processes };
}

/** Linux fallback: `ss -ltnpH` (users:(("node",pid=1234,fd=23))). Only the user's own processes show a PID. */
export function parseSs(output: string): { listeners: Listener[]; processes: Map<number, ProcessInfo> } {
  const listeners: Listener[] = [];
  const processes = new Map<number, ProcessInfo>();
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 4 || !/^LISTEN$/i.test(columns[0])) continue;
    const local = splitHostPort(columns[3]);
    if (!local) continue;
    const owners = [...line.matchAll(/\("([^"]+)",pid=(\d+)/g)];
    for (const [, name, pid] of owners) {
      listeners.push({ address: local[0], port: local[1], pid: Number(pid) });
      if (!processes.has(Number(pid))) processes.set(Number(pid), { pid: Number(pid), name, owned: true });
    }
  }
  return { listeners, processes };
}

/** macOS/Linux: `ps -o pid=,args= -p …` → full command lines. */
export function parsePs(output: string): Map<number, string> {
  const commands = new Map<number, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (match) commands.set(Number(match[1]), match[2]);
  }
  return commands;
}

/** macOS: `lsof -a -d cwd -Fn -p 1,2,3` → each process's working directory. */
export function parseLsofCwd(output: string): Map<number, string> {
  const cwd = new Map<number, string>();
  let pid: number | undefined;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== undefined) cwd.set(pid, line.slice(1));
  }
  return cwd;
}
