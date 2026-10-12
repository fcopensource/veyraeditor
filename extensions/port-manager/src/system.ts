// Veyra Port Manager: asks the operating system which programs listen on TCP ports, and stops them.
// Every command runs without a shell, with a timeout and without a console window; each platform has a fallback.
//
// Speed: listing sockets is cheap (netstat ~0.1 s, lsof), but reading process details is not (PowerShell ~1.5 s).
// The Scanner keeps a cache of process details keyed by PID and only looks up processes it hasn't seen.
// PIDs that stop listening are evicted, so a reused PID is always looked up again.
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { buildSnapshot, parseLsof, parseLsofCwd, parseNetstat, parsePs, parseSs, parseTasklistCsv, parseWindowsJson, type BuildOptions, type Listener, type ProcessInfo, type Snapshot } from "./model";

/** Runs a program and resolves with its output. `noMatchIsEmpty`: for lsof and ps, exit code 1 means
    "nothing matched" (for example, no port in use at all): an empty answer, not a failure. */
const run = (file: string, args: string[], timeout = 8000, noMatchIsEmpty = false) => new Promise<string>((resolve, reject) => {
  execFile(file, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
    const noMatch = noMatchIsEmpty && error && "code" in error && error.code === 1;
    if (error && !noMatch) reject(error);
    else resolve(stdout ?? "");
  });
});

const isWindows = process.platform === "win32";

/* ---------- Listening sockets ---------- */

/** Windows: netstat for both IP versions (fast, and parsed language-independently). */
async function windowsListeners(): Promise<Listener[]> {
  const [v4, v6] = await Promise.all([run("netstat", ["-ano", "-p", "TCP"]), run("netstat", ["-ano", "-p", "TCPv6"]).catch(() => "")]);
  return [...parseNetstat(v4), ...parseNetstat(v6)];
}

/** macOS/Linux: lsof (process name and owner included), or ss on Linux without lsof. */
async function unixListeners(): Promise<{ listeners: Listener[]; processes: Map<number, ProcessInfo> }> {
  try {
    return parseLsof(await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcLn"], 8000, true), os.userInfo().username);
  } catch (error) {
    if (process.platform !== "linux") throw error;
    return parseSs(await run("ss", ["-ltnpH"]));
  }
}

/* ---------- Process details ---------- */

/** Windows: name, executable path and command line for the given PIDs, in one PowerShell call. */
async function windowsProcesses(pids: number[]): Promise<Map<number, ProcessInfo>> {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const filter = pids.map(pid => `ProcessId=${pid}`).join(" OR ");
  const query = `$ErrorActionPreference='SilentlyContinue'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter '${filter}' | Select-Object ProcessId,Name,ExecutablePath,CommandLine)`;
  try {
    const json = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", query], 15000);
    const found = parseWindowsJson(`{"processes":${json.trim() || "[]"}}`, systemRoot).processes;
    if (found.size) return found;
  } catch { /* PowerShell unavailable or blocked: names only */ }
  const names = parseTasklistCsv(await run("tasklist", ["/fo", "csv", "/nh"]).catch(() => ""));
  return new Map(pids.flatMap(pid => names.has(pid) ? [[pid, names.get(pid)!] as const] : []));
}

/** macOS/Linux: full command lines and working directories for the given PIDs. */
async function unixDetails(pids: number[]): Promise<Map<number, { command?: string; cwd?: string }>> {
  const list = pids.join(",");
  const [commands, cwds] = await Promise.all([
    run("ps", ["-o", "pid=,args=", "-p", list], 8000, true).then(parsePs).catch(() => new Map<number, string>()),
    process.platform === "linux"
      ? Promise.all(pids.map(async pid => [pid, await fs.readlink(`/proc/${pid}/cwd`).catch(() => "")] as const)).then(pairs => new Map(pairs))
      : run("lsof", ["-a", "-d", "cwd", "-Fn", "-p", list], 8000, true).then(parseLsofCwd).catch(() => new Map<number, string>()),
  ]);
  return new Map(pids.map(pid => [pid, { command: commands.get(pid), cwd: cwds.get(pid) || undefined }]));
}

/* ---------- Scanner ---------- */

export class Scanner {
  /** Process details by PID, for the processes currently holding ports. */
  private readonly cache = new Map<number, ProcessInfo>();
  /** One scan at a time: callers asking meanwhile share the scan in flight. */
  private inFlight: Promise<Snapshot> | undefined;

  /** Everything listening right now. `fresh` ignores the cache (used before stopping a process). */
  scan(options: BuildOptions = {}, fresh = false): Promise<Snapshot> {
    if (fresh) return this.collect(options, true);
    this.inFlight ??= this.collect(options, false).finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  private async collect(options: BuildOptions, fresh: boolean): Promise<Snapshot> {
    let listeners: Listener[];
    const known = new Map<number, ProcessInfo>();
    if (isWindows) listeners = await windowsListeners();
    else {
      const result = await unixListeners();
      listeners = result.listeners;
      for (const [pid, info] of result.processes) known.set(pid, info);
    }

    const pids = new Set(listeners.map(listener => listener.pid));
    for (const pid of this.cache.keys()) if (!pids.has(pid)) this.cache.delete(pid);
    const missing = [...pids].filter(pid => pid > 0 && (fresh || !this.cache.has(pid)));
    if (missing.length) {
      if (isWindows) {
        const found = await windowsProcesses(missing);
        for (const pid of missing) this.cache.set(pid, found.get(pid) ?? { pid, name: `PID ${pid}`, owned: false });
      } else {
        const details = await unixDetails(missing);
        for (const pid of missing) this.cache.set(pid, { ...(known.get(pid) ?? { pid, name: `PID ${pid}`, owned: false }), ...details.get(pid) });
      }
    }
    // lsof's name and owner are always current; the cache adds the slower command line and folder.
    const processes = new Map<number, ProcessInfo>();
    for (const pid of pids) {
      const cached = this.cache.get(pid), live = known.get(pid);
      const info = live && cached ? { ...cached, name: live.name, owned: live.owned } : cached ?? live;
      if (info) processes.set(pid, info);
    }
    return buildSnapshot(listeners, processes, { caseInsensitivePaths: process.platform !== "linux", ...options });
  }
}

/* ---------- Stopping ---------- */

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

const until = async (done: () => boolean, ms: number) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(resolve => setTimeout(resolve, 100))) if (done()) return true;
  return done();
};

/**
 * Stops a process (and on Windows, the processes it started). macOS/Linux ask nicely first (SIGTERM);
 * `force` sends SIGKILL. Windows console programs can't be asked to close, so they are always ended.
 * Resolves with whether the process is gone.
 */
export async function stopProcess(pid: number, force = false): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 4 || pid === process.pid) throw new Error("That process can't be stopped.");
  if (isWindows) {
    await run("taskkill", ["/PID", String(pid), "/T", "/F"]).catch(error => { if (isAlive(pid)) throw error; });
  } else {
    try { process.kill(pid, force ? "SIGKILL" : "SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
  return until(() => !isAlive(pid), force || isWindows ? 3000 : 4000);
}
