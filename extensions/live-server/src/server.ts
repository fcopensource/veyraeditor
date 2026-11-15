// Veyra Live Server for VS Code: the server. Plain Node.js with no dependencies (and no VS Code API),
// so it can be tested on its own. Behaves like Veyra's built-in server (src-tauri/src/live_server.rs):
// same routes, same injected script, same rules for what counts as a change. The extras here (network sharing,
// the browser console, the API proxy and single-page apps) are options, off unless the extension turns them on.
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";

export const CLIENT_PATH = "/__veyra_live/client.js";
export const EVENTS_PATH = "/__veyra_live/events";
/** Where the page sends its console messages when the browser console is on. */
export const LOG_PATH = "/__veyra_live/log";
const SCRIPT_TAG = '<script src="/__veyra_live/client.js"></script>';
const SCRIPT_TAG_CONSOLE = '<script src="/__veyra_live/client.js" data-console="1"></script>';
/** Same default as Live Server, so bookmarks keep working. */
export const DEFAULT_PORT = 5500;

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8", map: "application/json; charset=utf-8", webmanifest: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", wasm: "application/wasm", pdf: "application/pdf",
};
export const mime = (file: string) => TYPES[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";
const isHtml = (file: string) => /\.html?$/i.test(file);

/** Adds the live reload script before the last </body>, or at the end when there is none. With the browser
    console on it goes at the top of <head> instead, so it hears the page's console from the very first script. */
export function inject(html: Buffer, withConsole = false): Buffer {
  const text = html.toString("latin1").toLowerCase(); // latin1 keeps byte offsets
  let index = withConsole ? afterHeadTag(text) : -1;
  if (index < 0) { const at = text.lastIndexOf("</body>"); index = at < 0 ? html.length : at; }
  return Buffer.concat([html.subarray(0, index), Buffer.from(withConsole ? SCRIPT_TAG_CONSOLE : SCRIPT_TAG), html.subarray(index)]);
}

/** Where the first <head> or <head …> tag ends (not <header>), or -1. One pass, so no page can make it slow. */
function afterHeadTag(text: string): number {
  for (let i = text.indexOf("<head"); i >= 0; i = text.indexOf("<head", i + 5)) {
    const next = text.charAt(i + 5);
    if (next === ">") return i + 6;
    if (next === " " || next === "\t" || next === "\n" || next === "\r" || next === "\f") {
      const close = text.indexOf(">", i + 5);
      return close < 0 ? -1 : close + 1;
    }
  }
  return -1;
}

/** `file` itself when it's the served folder or inside it, otherwise undefined. A second, local check on top of
    resolve(), in the form code scanners recognise, wherever a path from a request reaches the file system. */
function inside(root: string, file: string | undefined): string | undefined {
  if (!file) return undefined;
  const absolute = path.resolve(file);
  return absolute === root || absolute.startsWith(root.endsWith(path.sep) ? root : root + path.sep) ? absolute : undefined;
}

/** The file a URL path refers to, inside `root` (a real path). Undefined for anything that escapes it. */
export function resolve(root: string, urlPath: string): string | undefined {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath.split(/[?#]/)[0]); } catch { return undefined; }
  let file = root;
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === ".." || /[\\:\0]/.test(segment)) return undefined;
    file = path.join(file, segment);
  }
  // Symbolic links may point anywhere: the real location must still be inside the folder.
  let real: string;
  try { real = fs.realpathSync(file); } catch { return undefined; }
  return real === root || real.startsWith(root.endsWith(path.sep) ? root : root + path.sep) ? real : undefined;
}

const ignored = (file: string) => file.split(/[\\/]/).some(part => part === ".git" || part === "node_modules" || part === ".DS_Store");

/** A glob ("**\/*.log", "drafts/**", "*.tmp") as a regular expression over "/"-separated relative paths. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  const g = glob.trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") { source += g[i + 2] === "/" ? "(?:.*/)?" : ".*"; i += g[i + 2] === "/" ? 2 : 1; }
    else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // A pattern without "/" matches the name anywhere ("*.log" is the same as "**/*.log").
  return new RegExp(`^${g.includes("/") ? "" : "(?:.*/)?"}${source}$`, process.platform === "win32" ? "i" : "");
}

/** "css" when only stylesheets changed (swapped in place), otherwise "reload". */
export function changeKind(files: string[]): "css" | "reload" | undefined {
  if (!files.length) return undefined;
  return files.every(file => path.extname(file).toLowerCase() === ".css") ? "css" : "reload";
}

/** The computer's addresses on the local network (Wi-Fi or Ethernet), for opening the page on a phone. */
export function networkAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list ?? []) {
    if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(a.address);
  }
  return out;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A single byte range from a Range header ("bytes=0-99", "bytes=100-", "bytes=-50"), so media can seek.
    Undefined: no range, or several ranges (the whole file is sent). "invalid": the range is outside the file. */
export function parseRange(header: string | undefined, size: number): [number, number] | "invalid" | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  let start: number, end: number;
  if (!match[1]) { const suffix = Number(match[2]); if (!suffix) return "invalid"; start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  return start > end || start >= size ? "invalid" : [start, end];
}

/** A workspace-relative file as a URL path: "pages/about me.html" → "/pages/about%20me.html". */
export const urlFor = (relative: string) => "/" + relative.split(/[\\/]/).filter(p => p && p !== "." && p !== "..").map(encodeURIComponent).join("/");

/** A message from the page's console. */
export type ConsoleEntry = { level: "log" | "info" | "warn" | "error" | "debug"; text: string; page: string };

export type ServerOptions = {
  /** Also listen on the local network so phones and tablets can open the page (off: this computer only). */
  network?: boolean;
  /** Single-page apps: an unknown path with no file extension gets the root index.html instead of a 404. */
  spa?: boolean;
  /** Paths forwarded to another server, for example { "/api": "http://localhost:3000" }. */
  proxy?: Record<string, string>;
  /** Changes to files matching these globs (relative to the served folder) don't reload the page. */
  ignore?: string[];
  /** Receives the page's console messages and errors. Without it, pages don't send them. */
  onConsole?: (entry: ConsoleEntry) => void;
};

/** Proxy rules, longest prefix first, keeping only valid http(s) targets. */
export function proxyRules(proxy: Record<string, string> | undefined): [string, URL][] {
  const rules: [string, URL][] = [];
  for (const [prefix, target] of Object.entries(proxy ?? {})) {
    if (typeof target !== "string" || !prefix.startsWith("/")) continue;
    try { const url = new URL(target); if (url.protocol === "http:" || url.protocol === "https:") rules.push([prefix.replace(/\/+$/, "") || "/", url]); } catch { /* skip invalid */ }
  }
  return rules.sort((a, b) => b[0].length - a[0].length);
}
const matchesPrefix = (urlPath: string, prefix: string) => prefix === "/" || urlPath === prefix || urlPath.startsWith(prefix + "/") || urlPath.startsWith(prefix + "?");

export class LiveServer {
  private clients = new Set<http.ServerResponse>();
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout;
  private ignores: RegExp[];
  private rules: [string, URL][];
  private logBudget = { at: 0, count: 0 };

  private constructor(private server: http.Server, readonly root: string, readonly port: number, private clientScript: string, readonly options: ServerOptions) {
    // Comments keep proxies and browsers from closing idle connections.
    this.heartbeat = setInterval(() => this.send(":\n\n"), 15000);
    this.heartbeat.unref();
    this.ignores = (options.ignore ?? []).filter(g => g.trim()).map(globToRegExp);
    this.rules = proxyRules(options.proxy);
  }

  /** Serve `root` on `port` (or the next free port after it): this computer only, or the network too. */
  static async start(root: string, port: number, clientScript: string, options: ServerOptions = {}): Promise<LiveServer> {
    const real = fs.realpathSync(root);
    if (!fs.statSync(real).isDirectory()) throw new Error(`${root} is not a folder`);
    let live: LiveServer | undefined;
    const server = http.createServer((req, res) => live?.handle(req, res));
    // A malformed request or a dropped connection must never take the server down.
    server.on("clientError", (_error, socket) => { if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); else socket.destroy(); });
    const host = options.network ? "0.0.0.0" : "127.0.0.1";
    const listen = (p: number) => new Promise<boolean>(done => {
      const fail = () => { server.off("listening", ok); done(false); };
      const ok = () => { server.off("error", fail); done(true); };
      server.once("error", fail); server.once("listening", ok);
      server.listen(p, host);
    });
    let bound = false;
    for (let p = port; p < port + 20 && !bound; p++) bound = await listen(p);
    if (!bound && !(await listen(0))) throw new Error("No free port for Live Server");
    live = new LiveServer(server, real, (server.address() as { port: number }).port, clientScript, options);
    return live;
  }

  get url() { return `http://127.0.0.1:${this.port}/`; }
  /** Addresses for other devices on the network, when sharing is on. */
  get networkUrls() { return this.options.network ? networkAddresses().map(a => `http://${a}:${this.port}/`) : []; }

  /** Report changed files; one event is sent once changes are quiet for 120 ms. Only files inside the served
      folder count, and not .git, node_modules or anything matching the ignore globs. */
  notify(files: string[]) {
    for (const file of files) {
      if (ignored(file)) continue;
      const relative = path.relative(this.root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      const slashed = relative.split(path.sep).join("/");
      if (this.ignores.some(re => re.test(slashed))) continue;
      this.pending.add(file);
    }
    if (!this.pending.size) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const changed = [...this.pending]; this.pending.clear();
      const kind = changeKind(changed);
      if (kind) this.send(`event: ${kind}\ndata: ${changed.length}\n\n`);
    }, 120);
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat); clearTimeout(this.timer);
    for (const client of this.clients) client.end();
    this.clients.clear();
    return new Promise(done => { this.server.close(() => done()); this.server.closeAllConnections?.(); });
  }

  private send(message: string) { for (const client of this.clients) client.write(message); }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.on("error", () => { /* the browser went away mid-response */ });
    try { this.route(req, res); }
    catch (error) {
      if (!res.headersSent) { res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end(`Live Server error: ${String(error)}`); }
      else res.destroy();
    }
  }

  private page(title: string, body: string) {
    return inject(Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>`
      + `<style>body{font:15px system-ui,sans-serif;margin:32px;color:#1f2933}a{color:#0b6bcb;text-decoration:none}a:hover{text-decoration:underline}li{margin:6px 0;list-style:none}small{color:#6b7785}code{background:#f1f3f5;padding:1px 5px;border-radius:4px}</style>`
      + `</head><body>${body}</body></html>`), !!this.options.onConsole);
  }

  private route(req: http.IncomingMessage, res: http.ServerResponse) {
    const headOnly = req.method === "HEAD";
    const reply = (status: number, headers: Record<string, string>, body: Buffer | string = "") => {
      const data = typeof body === "string" ? Buffer.from(body) : body;
      res.writeHead(status, { "Content-Length": String(data.length), "Cache-Control": "no-store", ...headers });
      res.end(headOnly ? undefined : data);
    };
    const urlPath = (req.url || "/").split(/[?#]/)[0];

    // The API proxy takes any method, before anything else.
    const rule = this.rules.find(([prefix]) => matchesPrefix(urlPath, prefix));
    if (rule && !urlPath.startsWith("/__veyra_live/")) return this.forward(req, res, rule[1]);

    if (urlPath === LOG_PATH && req.method === "POST") return this.receiveLog(req, res);
    if (req.method !== "GET" && !headOnly) return reply(405, { Allow: "GET, HEAD" });

    if (urlPath === CLIENT_PATH) return reply(200, { "Content-Type": "text/javascript; charset=utf-8" }, this.clientScript);
    if (urlPath === EVENTS_PATH) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 1000\n\n");
      this.clients.add(res);
      req.on("close", () => this.clients.delete(res));
      return;
    }

    const html = { "Content-Type": "text/html; charset=utf-8" };
    const withConsole = !!this.options.onConsole;
    const file = inside(this.root, resolve(this.root, urlPath));
    // Single-page apps: /about, /users/42 and the like are routes, not files: serve the app's index.html.
    if (!file && this.options.spa && !path.extname(urlPath.split("/").pop() || "") && (req.headers.accept || "text/html").includes("text/html")) {
      const index = ["index.html", "index.htm"].map(name => path.join(this.root, name)).find(p => fs.existsSync(p));
      if (index) return reply(200, { "Content-Type": mime(index) }, inject(fs.readFileSync(index), withConsole));
    }
    if (!file) {
      let shown = urlPath; try { shown = decodeURIComponent(urlPath); } catch { /* keep as sent */ }
      return reply(404, html, this.page("Not found", `<h1>404</h1><p>${escape(shown)} was not found.</p>`));
    }
    try {
      if (fs.statSync(file).isDirectory()) {
        if (!urlPath.endsWith("/")) return reply(301, { Location: urlPath + "/" });
        const index = ["index.html", "index.htm"].map(name => inside(this.root, path.join(file, name))).find((p): p is string => !!p && fs.existsSync(p) && fs.statSync(p).isFile());
        if (index) return reply(200, { "Content-Type": mime(index) }, inject(fs.readFileSync(index), withConsole));
        const entries = fs.readdirSync(file, { withFileTypes: true }).filter(e => !e.name.startsWith("."))
          .map(e => ({ dir: e.isDirectory(), name: e.name }))
          .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        let shown = urlPath; try { shown = decodeURIComponent(urlPath); } catch { /* keep as sent */ }
        const list = (urlPath === "/" ? "" : '<li><a href="../">../</a></li>')
          + entries.map(e => `<li><a href="${encodeURIComponent(e.name)}${e.dir ? "/" : ""}">${escape(e.name)}${e.dir ? "/" : ""}</a></li>`).join("");
        return reply(200, html, this.page(`Index of ${escape(shown)}`, `<h1>Index of ${escape(shown)}</h1><ul>${list}</ul><small>Veyra Live Server</small>`));
      }
      if (isHtml(file)) return reply(200, { "Content-Type": mime(file) }, inject(fs.readFileSync(file), withConsole));
      return this.stream(req, res, file, headOnly);
    } catch (error) {
      return reply(500, html, this.page("Error", `<h1>500</h1><p>${escape(String(error))}</p>`));
    }
  }

  /** Other files stream from disk (large videos never sit in memory), honouring Range requests so media can seek. */
  private stream(req: http.IncomingMessage, res: http.ServerResponse, file: string, headOnly: boolean) {
    const size = fs.statSync(file).size;
    const range = parseRange(req.headers.range, size);
    if (range === "invalid") { res.writeHead(416, { "Content-Range": `bytes */${size}`, "Cache-Control": "no-store" }); res.end(); return; }
    const [start, end] = range ?? [0, Math.max(0, size - 1)];
    const length = size === 0 ? 0 : end - start + 1;
    res.writeHead(range ? 206 : 200, {
      "Content-Type": mime(file), "Content-Length": String(length), "Accept-Ranges": "bytes", "Cache-Control": "no-store",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (headOnly || length === 0) { res.end(); return; }
    const reader = fs.createReadStream(file, { start, end });
    reader.on("error", () => res.destroy());
    res.on("close", () => reader.destroy());
    reader.pipe(res);
  }

  /** Forwards a request to the proxy target (keeping its path), streaming both ways. */
  private forward(req: http.IncomingMessage, res: http.ServerResponse, target: URL) {
    const base = target.pathname.replace(/\/+$/, "");
    const request = (target.protocol === "https:" ? https : http).request({
      protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method,
      path: base + (req.url || "/"),
      headers: { ...req.headers, host: target.host, "x-forwarded-host": req.headers.host ?? "", "x-forwarded-proto": "http" },
    }, upstream => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    });
    request.setTimeout(30000, () => request.destroy(new Error("timed out")));
    request.on("error", error => {
      if (res.headersSent) { res.destroy(); return; }
      const body = this.page("Proxy error", `<h1>502</h1><p>Live Server couldn't reach <code>${escape(target.origin)}</code> for <code>${escape(req.url || "/")}</code>: ${escape(error.message)}.</p><p>Is your backend running?</p>`);
      res.writeHead(502, { "Content-Type": "text/html; charset=utf-8", "Content-Length": String(body.length), "Cache-Control": "no-store" });
      res.end(body);
    });
    req.pipe(request);
  }

  /** A console message from the page (sent with navigator.sendBeacon). At most 64 KB each, and 200 a second. */
  private receiveLog(req: http.IncomingMessage, res: http.ServerResponse) {
    const done = () => { res.writeHead(204, { "Cache-Control": "no-store" }); res.end(); };
    if (!this.options.onConsole) { req.resume(); return done(); }
    const now = Date.now();
    if (now - this.logBudget.at > 1000) this.logBudget = { at: now, count: 0 };
    if (++this.logBudget.count > 200) { req.resume(); return done(); }
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (chunk: Buffer) => { size += chunk.length; if (size <= 65536) chunks.push(chunk); });
    req.on("end", () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const level = ["log", "info", "warn", "error", "debug"].includes(data?.level) ? data.level : "log";
        if (typeof data?.text === "string") this.options.onConsole!({ level, text: data.text.slice(0, 20000), page: String(data.page ?? "").slice(0, 300) });
      } catch { /* not a console message */ }
      done();
    });
  }
}
