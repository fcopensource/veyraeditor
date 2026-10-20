/* Pure logic for Veyra Container Studio: parsing Docker's output, explaining errors and checking Dockerfiles. No VS Code here. */

// ---------- Docker objects ----------

export type State = "running" | "paused" | "restarting" | "exited" | "created" | "dead" | "removing";
export interface Port { hostIp: string; hostPort: number; containerPort: number; protocol: string }
export interface Container {
  id: string; name: string; image: string; command: string; state: State; status: string; created: string;
  ports: Port[]; exposed: string[]; labels: Record<string, string>; project?: string; service?: string; configFiles?: string[];
  health?: "healthy" | "unhealthy" | "starting";
}
export interface Image { id: string; repository: string; tag: string; size: string; bytes: number; created: string; dangling: boolean }
export interface Volume { name: string; driver: string; labels: Record<string, string>; project?: string }
export interface Network { id: string; name: string; driver: string; scope: string; builtIn: boolean }
export interface Stats { id: string; name: string; cpu: number; memUsed: number; memLimit: number; memPercent: number; netIO: string; blockIO: string; pids: number }
export interface DiskUsage { type: string; total: number; active: number; size: number; reclaimable: number }
export interface ComposeProject { name: string; status: string; configFiles: string[] }

/** Docker prints one JSON object per line with --format "{{json .}}". Bad lines (warnings) are skipped. */
export function jsonLines<T = Record<string, any>>(text: string): T[] {
  const out: T[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) { try { return JSON.parse(trimmed); } catch { /* fall through to lines */ } }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try { out.push(JSON.parse(t)); } catch { /* not JSON */ }
  }
  return out;
}

/** "a=1,b=2" (docker ps) or { a: "1" } (docker inspect) */
export function parseLabels(labels: unknown): Record<string, string> {
  if (labels && typeof labels === "object") return { ...(labels as Record<string, string>) };
  const out: Record<string, string> = {};
  if (typeof labels !== "string" || !labels) return out;
  // Values can contain commas (config file lists), so split only before "key=".
  for (const part of labels.split(/,(?=[\w.\-/]+=)/)) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

/** "0.0.0.0:8080->80/tcp, :::8080->80/tcp, 443/tcp" → published ports (one per host port) and exposed-only ports. */
export function parsePorts(ports: string): { published: Port[]; exposed: string[] } {
  const published: Port[] = [], exposed: string[] = [];
  const seen = new Set<string>();
  for (const raw of (ports || "").split(/,\s*/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(.*):(\d+)(?:-(\d+))?->(\d+)(?:-(\d+))?\/(\w+)$/.exec(part);
    if (m) {
      const [, ip, hostStart, hostEnd, ctrStart, , protocol] = m;
      const count = hostEnd ? Number(hostEnd) - Number(hostStart) + 1 : 1;
      for (let i = 0; i < Math.min(count, 50); i++) {
        const hostPort = Number(hostStart) + i, containerPort = Number(ctrStart) + i;
        const key = `${hostPort}/${protocol}`;
        if (seen.has(key)) continue;
        seen.add(key);
        published.push({ hostIp: ip.replace(/^\[|\]$/g, ""), hostPort, containerPort, protocol });
      }
    } else if (/^\d+(-\d+)?\/\w+$/.test(part)) exposed.push(part);
  }
  return { published, exposed };
}

const STATES: State[] = ["running", "paused", "restarting", "exited", "created", "dead", "removing"];
export function parseContainer(row: Record<string, any>): Container {
  const labels = parseLabels(row.Labels);
  const status = String(row.Status ?? "");
  const state = (STATES.includes(String(row.State).toLowerCase() as State) ? String(row.State).toLowerCase() : /^up/i.test(status) ? (/paused/i.test(status) ? "paused" : "running") : "exited") as State;
  const { published, exposed } = parsePorts(String(row.Ports ?? ""));
  const health = /\(healthy\)/.test(status) ? "healthy" : /\(unhealthy\)/.test(status) ? "unhealthy" : /health: starting/.test(status) ? "starting" : undefined;
  const configFiles = labels["com.docker.compose.project.config_files"];
  return {
    id: String(row.ID ?? ""), name: String(row.Names ?? "").split(",")[0], image: String(row.Image ?? ""), command: String(row.Command ?? "").replace(/^"|"$/g, ""),
    state, status, created: String(row.RunningFor ?? row.CreatedAt ?? ""), ports: published, exposed, labels,
    project: labels["com.docker.compose.project"], service: labels["com.docker.compose.service"],
    configFiles: configFiles ? configFiles.split(",").filter(Boolean) : undefined, health,
  };
}

export function parseImage(row: Record<string, any>): Image {
  const repository = String(row.Repository ?? "<none>"), tag = String(row.Tag ?? "<none>");
  return { id: String(row.ID ?? ""), repository, tag, size: String(row.Size ?? ""), bytes: parseSize(String(row.Size ?? "")), created: String(row.CreatedSince ?? row.CreatedAt ?? ""), dangling: repository === "<none>" && tag === "<none>" };
}
export function parseVolume(row: Record<string, any>): Volume {
  const labels = parseLabels(row.Labels);
  return { name: String(row.Name ?? ""), driver: String(row.Driver ?? ""), labels, project: labels["com.docker.compose.project"] };
}
const BUILT_IN_NETWORKS = new Set(["bridge", "host", "none", "nat", "default"]);
export function parseNetwork(row: Record<string, any>): Network {
  const name = String(row.Name ?? "");
  return { id: String(row.ID ?? ""), name, driver: String(row.Driver ?? ""), scope: String(row.Scope ?? ""), builtIn: BUILT_IN_NETWORKS.has(name) };
}
export function parseStats(row: Record<string, any>): Stats {
  const [used, limit] = String(row.MemUsage ?? "").split("/").map(s => parseSize(s.trim()));
  return {
    id: String(row.ID ?? row.Container ?? ""), name: String(row.Name ?? ""), cpu: parseFloat(String(row.CPUPerc ?? "0")) || 0,
    memUsed: used || 0, memLimit: limit || 0, memPercent: parseFloat(String(row.MemPerc ?? "0")) || 0,
    netIO: String(row.NetIO ?? ""), blockIO: String(row.BlockIO ?? ""), pids: Number(row.PIDs ?? 0) || 0,
  };
}
export function parseDiskUsage(row: Record<string, any>): DiskUsage {
  return { type: String(row.Type ?? ""), total: Number(row.TotalCount ?? 0) || 0, active: Number(row.Active ?? 0) || 0, size: parseSize(String(row.Size ?? "")), reclaimable: parseSize(String(row.Reclaimable ?? "").replace(/\s*\(.*\)$/, "")) };
}
export function parseComposeProjects(text: string): ComposeProject[] {
  return jsonLines(text).map(row => ({ name: String(row.Name ?? ""), status: String(row.Status ?? ""), configFiles: String(row.ConfigFiles ?? "").split(",").filter(Boolean) }));
}

// ---------- Sizes ----------

const UNITS: Record<string, number> = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
/** "13.3MB", "1.2GiB", "512B", "0B" → bytes */
export function parseSize(text: string): number {
  const m = /^([\d.]+)\s*([kmgt]?i?b)$/i.exec(text.trim());
  return m ? Math.round(parseFloat(m[1]) * (UNITS[m[2].toLowerCase()] ?? 1)) : 0;
}
export function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(bytes)) / 3));
  const value = bytes / 1000 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// ---------- Grouping ----------

export interface ContainerGroup { project?: string; containers: Container[]; running: number; configFiles?: string[] }
/** Compose projects first (as folders), then other containers; running ones first inside each group. */
export function groupContainers(containers: Container[]): ContainerGroup[] {
  const byProject = new Map<string, Container[]>();
  const loose: Container[] = [];
  for (const c of containers) {
    if (c.project) { const list = byProject.get(c.project) ?? []; list.push(c); byProject.set(c.project, list); }
    else loose.push(c);
  }
  const rank = (c: Container) => (c.state === "running" ? 0 : c.state === "paused" || c.state === "restarting" ? 1 : 2);
  const sort = (list: Container[]) => list.sort((a, b) => rank(a) - rank(b) || (a.service ?? a.name).localeCompare(b.service ?? b.name));
  const groups: ContainerGroup[] = [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([project, list]) => ({
    project, containers: sort(list), running: list.filter(c => c.state === "running").length, configFiles: list.find(c => c.configFiles)?.configFiles,
  }));
  if (loose.length) groups.push({ containers: sort(loose), running: loose.filter(c => c.state === "running").length });
  return groups;
}

/** The address to open in a browser for a published port. */
export function portUrl(port: Port): string {
  const host = !port.hostIp || port.hostIp === "0.0.0.0" || port.hostIp === "::" ? "localhost" : port.hostIp.includes(":") ? `[${port.hostIp}]` : port.hostIp;
  const scheme = port.containerPort === 443 || port.containerPort === 8443 ? "https" : "http";
  return `${scheme}://${host}:${port.hostPort}`;
}

/** Short status for the sidebar: "Up 3 minutes" → "up 3 minutes", "Exited (0) 2 hours ago" → "exited 2 hours ago". */
export function shortStatus(c: Container): string {
  const s = c.status.replace(/\s*\((healthy|unhealthy|health: starting)\)/, "");
  const exited = /^Exited \((\d+)\) (.*)$/.exec(s);
  if (exited) return exited[1] === "0" ? `exited ${exited[2]}` : `exited with code ${exited[1]} ${exited[2]}`;
  return s.replace(/^Up /, "up ").replace(/^Created$/, "created").replace(/\(Paused\)/i, "· paused").trim();
}

// ---------- Errors ----------

export interface Explanation { title: string; detail: string; action?: "startDocker" | "install" | "login" | "cleanup" | "ports" }
/** Turns Docker's error output into a sentence a person can act on. */
export function explainError(text: string, platform: NodeJS.Platform = process.platform): Explanation {
  const t = text.trim();
  if (/ENOENT|not recognized as an internal or external command|command not found|executable file not found/i.test(t) && /docker|podman|spawn/i.test(t))
    return { title: "Docker is not installed", detail: "Install Docker Desktop (or Docker Engine on Linux), then restart VS Code so it can find the docker command.", action: "install" };
  if (/permission denied.*docker(\.sock| daemon socket)/i.test(t))
    return { title: "No permission to use Docker", detail: platform === "linux" ? "Add yourself to the docker group with: sudo usermod -aG docker $USER, then sign out and back in." : "Your account is not allowed to use the Docker engine. Restart Docker Desktop, or run VS Code as a user with access." };
  if (/Cannot connect to the Docker daemon|error during connect|docker daemon is not running|dockerDesktopLinuxEngine|docker_engine.*The system cannot find the file|Is the docker daemon running|failed to connect to the docker API/i.test(t))
    return { title: "Docker is not running", detail: platform === "linux" ? "Start the Docker service with: sudo systemctl start docker" : "Start Docker Desktop and wait until it says it is running, then try again.", action: "startDocker" };
  const port = /(?:Bind for [\d.:\[\]]*:(\d+) failed: port is already allocated|ports are not available: .*?:(\d+)|address already in use.*?:(\d+)|listen tcp[46]? [\d.:\[\]]*:(\d+): bind)/i.exec(t);
  if (port || /port is already allocated|address already in use/i.test(t)) {
    const n = port ? port.slice(1).find(Boolean) : undefined;
    return { title: n ? `Port ${n} is already in use` : "A port is already in use", detail: `Another program or container is using ${n ? `port ${n}` : "that port"}. Stop it, or publish the container on a different host port${n ? ` (for example ${Number(n) + 1}:${"<container port>"})` : ""}.`, action: "ports" };
  }
  if (/no space left on device/i.test(t)) return { title: "The disk is full", detail: "Docker ran out of space. Open the Dashboard and clean up unused images, containers and build cache.", action: "cleanup" };
  if (/toomanyrequests|rate limit/i.test(t)) return { title: "Docker Hub download limit reached", detail: "Sign in with docker login to get a higher limit, or wait a few hours.", action: "login" };
  if (/pull access denied|repository does not exist|manifest unknown|manifest for .* not found|not found: manifest|No such image/i.test(t))
    return { title: "Image not found", detail: "Check the image name and tag. If it is private, sign in first with docker login.", action: "login" };
  if (/unauthorized|authentication required|denied: requested access/i.test(t)) return { title: "Sign-in needed", detail: "This registry needs you to sign in. Run docker login (with the registry's address if it is not Docker Hub).", action: "login" };
  const inUse = /unable to (?:remove|delete) .*?(?:is being used by|is using its referenced image|image is being used by (?:running|stopped) container) ?([0-9a-f]{6,})?/i.exec(t);
  if (inUse) return { title: "The image is in use", detail: `A container${inUse[1] ? ` (${inUse[1].slice(0, 12)})` : ""} still uses this image. Remove that container first, or force the removal.` };
  const nameTaken = /The container name "\/?([^"]+)" is already in use/i.exec(t);
  if (nameTaken) return { title: `The name "${nameTaken[1]}" is taken`, detail: "Another container already has this name. Remove it, or choose a different name." };
  if (/volume is in use/i.test(t)) return { title: "The volume is in use", detail: "A container still uses this volume. Remove that container first." };
  if (/has active endpoints|network .* is in use/i.test(t)) return { title: "The network is in use", detail: "Containers are still connected to this network. Stop or remove them first." };
  if (/is not running/i.test(t)) return { title: "The container is not running", detail: "Start it first." };
  if (/no configuration file provided|no such file or directory.*compose|Can't find a suitable configuration file/i.test(t)) return { title: "Compose file not found", detail: "Open a folder that has a compose.yaml or docker-compose.yml file." };
  if (/failed to solve|failed to compute cache key|executor failed running/i.test(t)) return { title: "The image failed to build", detail: lastLines(t, 6) };
  if (/timed out|timeout/i.test(t)) return { title: "Docker did not answer in time", detail: "Docker may be starting or busy. Try again in a moment." };
  return { title: "Docker reported an error", detail: lastLines(t, 8) || "No details were given." };
}
const lastLines = (text: string, n: number) => text.split(/\r?\n/).filter(l => l.trim()).slice(-n).join("\n");

// ---------- Dockerfile checks ----------

export type Severity = "error" | "warning" | "info";
export interface Finding { line: number; start: number; end: number; severity: Severity; code: string; message: string; fix?: { text: string; title: string } }
interface Instruction { line: number; endLine: number; keyword: string; args: string; raw: string; indent: number }

/** Joins "\" continuations, skips comments, keeps line numbers. Handles "# escape=`" directives. */
export function instructions(text: string): Instruction[] {
  const lines = text.split(/\r?\n/);
  const escape = /^#\s*escape\s*=\s*`/i.test(lines.find(l => l.trim()) ?? "") ? "`" : "\\";
  const out: Instruction[] = [];
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i];
    if (!first.trim() || first.trim().startsWith("#")) continue;
    let raw = first, end = i;
    while (raw.trimEnd().endsWith(escape) && end + 1 < lines.length) {
      end++;
      const next = lines[end];
      if (next.trim().startsWith("#")) continue;
      raw = raw.trimEnd().slice(0, -1) + " " + next.trim();
    }
    const m = /^(\s*)([A-Za-z]+)\s*(.*)$/.exec(raw);
    if (m) out.push({ line: i, endLine: end, keyword: m[2].toUpperCase(), args: m[3].trim(), raw: first, indent: m[1].length });
    i = end;
  }
  return out;
}

const SECRET_NAME = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)/i;
/** Best-practice checks, like a friendly hadolint. `hasDockerignore` tells whether the build folder has a .dockerignore. */
export function lintDockerfile(text: string, opts: { hasDockerignore?: boolean } = {}): Finding[] {
  const list = instructions(text);
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  const at = (ins: Instruction, word: string, severity: Severity, code: string, message: string, fix?: Finding["fix"]): void => {
    const lineText = lines[ins.line];
    let start = lineText.toLowerCase().indexOf(word.toLowerCase());
    let end = start + word.length;
    if (start < 0) { start = ins.indent; end = lineText.length; }
    findings.push({ line: ins.line, start, end, severity, code, message, fix });
  };
  const stageNames = new Set<string>();
  let cmdCount = 0, entryCount = 0;
  const stages: { from: Instruction; user?: Instruction }[] = [];

  for (const ins of list) {
    const args = ins.args;
    switch (ins.keyword) {
      case "FROM": {
        cmdCount = 0; entryCount = 0;
        const parts = args.split(/\s+/).filter(p => !p.startsWith("--"));
        const image = parts[0] ?? "";
        const asName = /\bAS\s+(\S+)/i.exec(args)?.[1];
        stages.push({ from: ins });
        if (image && !stageNames.has(image.toLowerCase()) && image.toLowerCase() !== "scratch" && !image.includes("$") && !image.includes("@sha256:")) {
          const lastSegment = image.split("/").pop() ?? image;
          if (!lastSegment.includes(":")) at(ins, image, "warning", "pin-version", `"${image}" has no tag, so it means "${image}:latest", which changes over time. Pin a version, like ${image}:<version>, for repeatable builds.`);
          else if (/:latest$/i.test(image)) at(ins, image, "warning", "pin-version", `"latest" changes over time. Pin a version for repeatable builds.`);
        }
        if (asName) stageNames.add(asName.toLowerCase());
        break;
      }
      case "MAINTAINER":
        at(ins, "MAINTAINER", "warning", "maintainer", "MAINTAINER is deprecated. Use LABEL maintainer=\"…\" instead.", { title: "Use LABEL maintainer", text: `LABEL maintainer="${args.replace(/^"|"$/g, "").replace(/"/g, '\\"')}"` });
        break;
      case "ADD": {
        const sources = args.replace(/--\S+\s*/g, "").split(/\s+/).slice(0, -1);
        if (sources.length && sources.every(s => !/^https?:\/\//i.test(s) && !/\.(tar|tgz|tar\.gz|tar\.bz2|tar\.xz|txz)$/i.test(s) && !/^git@|\.git$/i.test(s)))
          at(ins, "ADD", "warning", "use-copy", "Use COPY for local files. ADD also unpacks archives and downloads URLs, which can surprise you.", { title: "Change ADD to COPY", text: lines[ins.line].replace(/\bADD\b/i, "COPY") });
        break;
      }
      case "RUN": {
        if (/\bapt-get\s+(?:\S+\s+)*install\b/.test(args)) {
          if (!/\s(-y|--yes|-qq|--assume-yes)\b/.test(args)) at(ins, "apt-get", "error", "apt-yes", "apt-get install asks for confirmation and the build stops. Add -y.", { title: "Add -y", text: lines[ins.line].replace(/apt-get(\s+)install/, "apt-get$1install -y") });
          if (!/rm\s+-rf?\s+\/var\/lib\/apt\/lists/.test(args)) at(ins, "apt-get", "info", "apt-clean", "Add && rm -rf /var/lib/apt/lists/* to the same RUN to keep the image smaller.");
          if (!/--no-install-recommends/.test(args)) at(ins, "apt-get", "info", "apt-recommends", "Add --no-install-recommends to avoid installing extra packages.");
        }
        if (/\bapt-get\s+(dist-)?upgrade\b/.test(args)) at(ins, "upgrade", "info", "apt-upgrade", "Upgrading every package makes builds unpredictable. Use a newer base image instead.");
        if (/\bapk\s+add\b/.test(args) && !/--no-cache/.test(args)) at(ins, "apk", "info", "apk-cache", "Add --no-cache to apk add to keep the image smaller.", { title: "Add --no-cache", text: lines[ins.line].replace(/apk(\s+)add/, "apk$1add --no-cache") });
        if (/\bpip3?\s+install\b/.test(args) && !/--no-cache-dir/.test(args))
          at(ins, "pip", "info", "pip-cache", "Add --no-cache-dir to pip install to keep the image smaller.", lines[ins.line].match(/pip3?\s+install/) ? { title: "Add --no-cache-dir", text: lines[ins.line].replace(/(pip3?\s+install)/, "$1 --no-cache-dir") } : undefined);
        if (/(^|&&|;)\s*npm\s+install\s*($|&&|;)/.test(args) || /(^|&&|;)\s*npm\s+i\s*($|&&|;)/.test(args)) at(ins, "npm", "info", "npm-ci", "Use npm ci for repeatable installs from package-lock.json.", lines[ins.line].match(/npm\s+(install|i)\b/) ? { title: "Use npm ci", text: lines[ins.line].replace(/npm\s+(install|i)\b/, "npm ci") } : undefined);
        if (/(^|&&|;)\s*sudo\s/.test(args)) at(ins, "sudo", "warning", "sudo", "Builds already run as root, so sudo is not needed (and is usually not installed).");
        if (/^cd\s+\S+\s*$/.test(args)) at(ins, "cd", "warning", "use-workdir", "A cd in its own RUN has no effect on later lines. Use WORKDIR to change folder.", { title: "Use WORKDIR", text: lines[ins.line].replace(/RUN\s+cd\s+/i, "WORKDIR ") });
        if (/curl\s[^|]*\|\s*(ba)?sh\b/.test(args)) at(ins, "curl", "info", "pipe-shell", "Piping a download into a shell runs whatever the server sends. Download, check, then run it if you can.");
        break;
      }
      case "CMD":
        cmdCount++;
        if (cmdCount > 1) at(ins, "CMD", "warning", "multiple-cmd", "Only the last CMD in a stage is used.");
        if (args && !args.startsWith("[")) at(ins, "CMD", "info", "exec-form", 'Use the JSON form, like CMD ["node", "server.js"], so the app gets stop signals and shuts down cleanly.', execFix(lines[ins.line], "CMD", args));
        break;
      case "ENTRYPOINT":
        entryCount++;
        if (entryCount > 1) at(ins, "ENTRYPOINT", "warning", "multiple-entrypoint", "Only the last ENTRYPOINT in a stage is used.");
        if (args && !args.startsWith("[")) at(ins, "ENTRYPOINT", "info", "exec-form", 'Use the JSON form, like ENTRYPOINT ["node", "server.js"], so the app gets stop signals.', execFix(lines[ins.line], "ENTRYPOINT", args));
        break;
      case "ENV":
      case "ARG": {
        const names = ins.keyword === "ENV" ? [...args.matchAll(/(?:^|\s)([A-Za-z_][\w]*)(?:=|\s+\S)/g)].map(m => m[1]) : [/^([A-Za-z_][\w]*)/.exec(args)?.[1] ?? ""];
        const valued = ins.keyword === "ARG" ? /=\S/.test(args) : true;
        const secret = names.find(n => SECRET_NAME.test(n));
        if (secret && valued) at(ins, secret, "warning", "secret", `${secret} looks like a secret. Values in ENV and ARG are saved in the image for anyone to read. Pass it at run time, or use a build secret (RUN --mount=type=secret).`);
        break;
      }
      case "EXPOSE":
        for (const p of args.split(/\s+/)) {
          const n = Number(p.split("/")[0].split("-")[0]);
          if (!p.includes("$") && (!Number.isInteger(n) || n < 1 || n > 65535)) at(ins, p, "error", "bad-port", `"${p}" is not a valid port.`);
        }
        break;
      case "USER":
        if (stages.length) stages[stages.length - 1].user = ins;
        break;
      case "WORKDIR":
        if (args && !/^(\/|\$|[A-Za-z]:[\\/])/.test(args.replace(/^"|"$/g, ""))) at(ins, args, "info", "workdir-absolute", "Use an absolute path in WORKDIR, like /app.");
        break;
    }
  }
  if (!list.length) return findings;
  const copyAll = list.find(i => (i.keyword === "COPY" || i.keyword === "ADD") && !/--from=/.test(i.args) && /^(--\S+\s+)*\.\/?\s+/.test(i.args));
  if (copyAll && opts.hasDockerignore === false)
    at(copyAll, copyAll.keyword, "info", "dockerignore", `${copyAll.keyword} . copies everything, including node_modules, .git and .env files. Add a .dockerignore file next to the Dockerfile.`);
  if (!list.some(i => i.keyword === "FROM")) findings.push({ line: list[0].line, start: 0, end: lines[list[0].line].length, severity: "error", code: "no-from", message: "A Dockerfile must start with FROM." });
  else if (list[0].keyword !== "FROM" && list[0].keyword !== "ARG") findings.push({ line: list[0].line, start: 0, end: lines[list[0].line].length, severity: "error", code: "from-first", message: "The first instruction must be FROM (only ARG may come before it)." });
  const last = stages[stages.length - 1];
  if (last && !/^scratch\b/i.test(last.from.args.replace(/--\S+\s*/g, "")) && (!last.user || /^(root|0)(:|$)/.test(last.user.args))) {
    findings.push({ line: (last.user ?? last.from).line, start: 0, end: lines[(last.user ?? last.from).line].length, severity: "info", code: "root-user", message: last.user ? "The container runs as root. Switch to a normal user for safety." : "The container runs as root. Add USER with a normal user (for example USER node, or one you create) for safety." });
  }
  return findings;
}

function execFix(line: string, keyword: string, args: string): Finding["fix"] | undefined {
  if (/[|&;<>$`*?]/.test(args) || /["']/.test(args)) return undefined; // needs a shell: leave it
  const words = args.split(/\s+/).filter(Boolean);
  return { title: "Use the JSON form", text: line.replace(new RegExp(`(${keyword})\\s+.*$`, "i"), `$1 ${JSON.stringify(words).replace(/","/g, '", "')}`) };
}

/** EXPOSEd ports of the final stage, to publish with docker run. */
export function exposedPorts(text: string): number[] {
  const list = instructions(text);
  const lastFrom = list.map(i => i.keyword).lastIndexOf("FROM");
  const ports = new Set<number>();
  for (const ins of list.slice(Math.max(0, lastFrom))) {
    if (ins.keyword !== "EXPOSE") continue;
    for (const p of ins.args.split(/\s+/)) { const n = Number(p.split("/")[0]); if (Number.isInteger(n) && n > 0 && n < 65536) ports.add(n); }
  }
  return [...ports];
}

/** An image name docker accepts: lowercase letters, digits, and . _ - */
export function imageNameFor(folderName: string): string {
  const name = folderName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return name || "app";
}

// ---------- Compose files ----------

export const COMPOSE_FILE = /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i;
export interface ComposeService { name: string; line: number; image?: string; build: boolean; ports: string[] }
/** Finds services in a compose file without a YAML library: the keys one level under the top-level "services:". */
export function composeServices(text: string): ComposeService[] {
  const lines = text.split(/\r?\n/);
  const services: ComposeService[] = [];
  let inServices = false, serviceIndent = -1;
  let current: ComposeService | undefined, propIndent = -1, inPorts = false, portsIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      inServices = /^services\s*:\s*(#.*)?$/.test(line);
      serviceIndent = -1; current = undefined; inPorts = false;
      continue;
    }
    if (!inServices) continue;
    if (serviceIndent < 0) serviceIndent = indent;
    if (indent === serviceIndent) {
      const m = /^\s*(["']?)([\w.\-]+)\1\s*:/.exec(line);
      if (m) { current = { name: m[2], line: i, build: false, ports: [] }; services.push(current); propIndent = -1; inPorts = false; }
      continue;
    }
    if (!current || indent < serviceIndent) continue;
    if (propIndent < 0) propIndent = indent;
    if (indent === propIndent) {
      inPorts = false;
      const prop = /^\s*([\w.\-]+)\s*:\s*(.*)$/.exec(line);
      if (!prop) continue;
      const [, key, value] = prop;
      if (key === "image") current.image = value.replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
      if (key === "build") current.build = true;
      if (key === "ports") {
        if (value.startsWith("[")) current.ports.push(...value.replace(/[[\]"']/g, "").split(",").map(s => s.trim()).filter(Boolean));
        else { inPorts = true; portsIndent = -1; }
      }
    } else if (inPorts) {
      if (portsIndent < 0) portsIndent = indent;
      const longForm = /^\s*-?\s*[\w]+\s*:(\s|$)/.test(line); // "- target: 443" style, read via "published" below
      const item = /^\s*-\s*["']?([^"'#\s]+)["']?/.exec(line);
      if (item && indent === portsIndent && !longForm) current.ports.push(item[1]);
      const published = /^\s*-?\s*published\s*:\s*["']?(\d+)/.exec(line);
      if (published) current.ports.push(published[1]);
    }
  }
  return services;
}

// ---------- Logs ----------

export interface LogLine { time?: string; source?: string; text: string }
/** "2026-10-20T10:00:00.123456789Z hello" (docker logs -t), or "web-1  | 2026-…Z hello" (docker compose logs -t). */
export function parseLogLine(line: string, compose: boolean): LogLine {
  let rest = line, source: string | undefined;
  if (compose) {
    const m = /^(\S+?)\s+\|\s?(.*)$/.exec(line);
    if (m) { source = m[1]; rest = m[2]; }
  }
  const t = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s?(.*)$/.exec(rest);
  return t ? { time: t[1], source, text: t[2] } : { source, text: rest };
}

/** Arguments for docker run: --name and -p for each exposed port. */
export function runArgs(image: string, ports: number[], name?: string): string[] {
  return ["run", "--rm", "-it", ...(name ? ["--name", name] : []), ...ports.flatMap(p => ["-p", `${p}:${p}`]), image];
}

/** Quotes an argument for the terminal: PowerShell on Windows, POSIX shells elsewhere. */
export function shellQuote(arg: string, shell: "powershell" | "cmd" | "posix"): string {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  if (shell === "powershell") return `'${arg.replace(/'/g, "''")}'`;
  if (shell === "cmd") return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}
