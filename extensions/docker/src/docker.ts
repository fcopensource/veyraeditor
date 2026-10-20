import { spawn } from "node:child_process";
import * as m from "./model";

/* Talks to Docker through its command line, so it works with Docker Desktop, Docker Engine and Docker contexts alike. No VS Code here. */

export class DockerError extends Error {
  constructor(message: string, readonly output: string, readonly code?: string | number) { super(message); }
  get explained() { return m.explainError(`${this.code === "ENOENT" ? "spawn ENOENT docker " : ""}${this.output || this.message}`); }
}

export interface Stream { stop(): void; readonly done: Promise<number | null> }

export class Docker {
  constructor(public command = "docker", private readonly env: NodeJS.ProcessEnv = process.env) {}

  /** Runs one docker command and returns what it printed. Rejects with a DockerError that can explain itself. */
  run(args: string[], opts: { timeoutMs?: number; cwd?: string; input?: string } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      let out = "", err = "", settled = false;
      const child = spawn(this.command, args, { cwd: opts.cwd, env: { ...this.env, DOCKER_CLI_HINTS: "false" }, windowsHide: true });
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
      const timer = setTimeout(() => { child.kill(); finish(() => reject(new DockerError(`docker ${args[0]} timed out`, `${err}\ntimed out`, "TIMEOUT"))); }, opts.timeoutMs ?? 30000);
      child.stdout.on("data", d => (out += d));
      child.stderr.on("data", d => (err += d));
      child.on("error", (e: NodeJS.ErrnoException) => finish(() => reject(new DockerError(e.message, e.message, e.code))));
      child.on("close", code => finish(() => (code === 0 ? resolve(out) : reject(new DockerError(lastLine(err) || `docker ${args[0]} failed with code ${code}`, err || out, code ?? undefined)))));
      if (opts.input !== undefined) child.stdin.end(opts.input); else child.stdin.end();
    });
  }

  /** Runs a long command (logs -f, events) and hands over each line as it arrives. */
  stream(args: string[], onLine: (line: string, from: "stdout" | "stderr") => void, opts: { cwd?: string } = {}): Stream {
    const child = spawn(this.command, args, { cwd: opts.cwd, env: { ...this.env, DOCKER_CLI_HINTS: "false" }, windowsHide: true });
    const pump = (from: "stdout" | "stderr") => {
      let buffer = "";
      return (data: Buffer) => {
        buffer += data.toString("utf8");
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) onLine(line, from);
      };
    };
    child.stdout.on("data", pump("stdout"));
    child.stderr.on("data", pump("stderr"));
    const done = new Promise<number | null>(resolve => { child.on("close", code => resolve(code)); child.on("error", () => resolve(-1)); });
    return { stop: () => { if (child.exitCode === null) child.kill(); }, done };
  }

  // ---------- Reading ----------

  async version(): Promise<{ client: string; server: string; os: string; context: string }> {
    const v = JSON.parse(await this.run(["version", "--format", "{{json .}}"], { timeoutMs: 15000 }));
    if (!v.Server) throw new DockerError("Docker is not running", "Cannot connect to the Docker daemon");
    let context = "";
    try { context = (await this.run(["context", "show"], { timeoutMs: 5000 })).trim(); } catch { /* older Docker */ }
    return { client: v.Client?.Version ?? "", server: v.Server?.Version ?? "", os: `${v.Server?.Os ?? ""}/${v.Server?.Arch ?? ""}`, context };
  }
  async containers() { return m.jsonLines(await this.run(["ps", "-a", "--format", "{{json .}}"])).map(m.parseContainer); }
  async images() { return m.jsonLines(await this.run(["images", "--format", "{{json .}}"])).map(m.parseImage); }
  async volumes() { return m.jsonLines(await this.run(["volume", "ls", "--format", "{{json .}}"])).map(m.parseVolume); }
  async networks() { return m.jsonLines(await this.run(["network", "ls", "--format", "{{json .}}"])).map(m.parseNetwork); }
  async stats() { return m.jsonLines(await this.run(["stats", "--no-stream", "--format", "{{json .}}"], { timeoutMs: 20000 })).map(m.parseStats); }
  async diskUsage() { return m.jsonLines(await this.run(["system", "df", "--format", "{{json .}}"], { timeoutMs: 60000 })).map(m.parseDiskUsage); }
  async composeProjects() {
    try { return m.parseComposeProjects(await this.run(["compose", "ls", "-a", "--format", "json"])); }
    catch { return []; } // Compose v1 or no compose plugin
  }
  async inspect(id: string, kind: "container" | "image" | "volume" | "network" = "container") {
    return JSON.parse(await this.run([kind, "inspect", id]))[0];
  }

  // ---------- Changing ----------

  containerAction(action: "start" | "stop" | "restart" | "pause" | "unpause" | "kill", ids: string[]) { return this.run([action, ...ids], { timeoutMs: 120000 }); }
  removeContainers(ids: string[], force = false) { return this.run(["rm", ...(force ? ["-f"] : []), "-v", ...ids], { timeoutMs: 120000 }); }
  removeImage(id: string, force = false) { return this.run(["rmi", ...(force ? ["-f"] : []), id], { timeoutMs: 120000 }); }
  removeVolume(name: string) { return this.run(["volume", "rm", name]); }
  removeNetwork(id: string) { return this.run(["network", "rm", id]); }
  tag(source: string, target: string) { return this.run(["tag", source, target]); }

  /** The cleanup buttons. Each returns the bytes Docker said it freed, and how many things were removed when it counts them. */
  async prune(what: "containers" | "danglingImages" | "unusedImages" | "volumes" | "networks" | "buildCache"): Promise<{ bytes: number; count?: number }> {
    if (what === "volumes") return { bytes: 0, count: await this.pruneAnonymousVolumes() };
    const args = {
      containers: ["container", "prune", "-f"], danglingImages: ["image", "prune", "-f"], unusedImages: ["image", "prune", "-a", "-f"],
      networks: ["network", "prune", "-f"], buildCache: ["builder", "prune", "-f"],
    }[what];
    return { bytes: reclaimed(await this.run(args, { timeoutMs: 600000 })) };
  }
  /**
   * Deletes unused anonymous volumes only. Not `docker volume prune`: before Docker 23 that also deletes named volumes,
   * which hold real data (databases), so the names are checked here on every version.
   */
  async pruneAnonymousVolumes(): Promise<number> {
    const unused = (await this.run(["volume", "ls", "-q", "--filter", "dangling=true"])).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const anonymous = unused.filter(name => /^[0-9a-f]{64}$/.test(name));
    if (anonymous.length) await this.run(["volume", "rm", ...anonymous], { timeoutMs: 600000 });
    return anonymous.length;
  }
}

const lastLine = (text: string) => text.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
/** "Total reclaimed space: 1.2GB" → bytes */
export function reclaimed(output: string): number {
  const match = /Total reclaimed space:\s*([\d.]+\s*[kmgt]?i?b)/i.exec(output);
  return match ? m.parseSize(match[1].replace(/\s+/g, "")) : 0;
}
