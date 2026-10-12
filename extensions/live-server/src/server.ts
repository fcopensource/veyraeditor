// Veyra Live Server for VS Code: the server. Plain Node.js with no dependencies (and no VS Code API),
// so it can be tested on its own. Behaves like Veyra's built-in server (src-tauri/src/live_server.rs):
// same routes, same injected script, same rules for what counts as a change.
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

export const CLIENT_PATH = "/__veyra_live/client.js";
export const EVENTS_PATH = "/__veyra_live/events";
const SCRIPT_TAG = '<script src="/__veyra_live/client.js"></script>';
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

/** Adds the live reload script before the last </body>, or at the end when there is none. */
export function inject(html: Buffer): Buffer {
  const at = html.toString("latin1").toLowerCase().lastIndexOf("</body>"); // latin1 keeps byte offsets
  const index = at < 0 ? html.length : at;
  return Buffer.concat([html.subarray(0, index), Buffer.from(SCRIPT_TAG), html.subarray(index)]);
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

/** "css" when only stylesheets changed (swapped in place), otherwise "reload". */
export function changeKind(files: string[]): "css" | "reload" | undefined {
  if (!files.length) return undefined;
  return files.every(file => path.extname(file).toLowerCase() === ".css") ? "css" : "reload";
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const page = (title: string, body: string) => inject(Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>`
  + `<style>body{font:15px system-ui,sans-serif;margin:32px;color:#1f2933}a{color:#0b6bcb;text-decoration:none}a:hover{text-decoration:underline}li{margin:6px 0;list-style:none}small{color:#6b7785}</style>`
  + `</head><body>${body}</body></html>`));

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

export class LiveServer {
  private clients = new Set<http.ServerResponse>();
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout;

  private constructor(private server: http.Server, readonly root: string, readonly port: number, private clientScript: string) {
    // Comments keep proxies and browsers from closing idle connections.
    this.heartbeat = setInterval(() => this.send(":\n\n"), 15000);
    this.heartbeat.unref();
  }

  /** Serve `root` on 127.0.0.1, on `port` or the next free port after it. */
  static async start(root: string, port: number, clientScript: string): Promise<LiveServer> {
    const real = fs.realpathSync(root);
    if (!fs.statSync(real).isDirectory()) throw new Error(`${root} is not a folder`);
    let live: LiveServer | undefined;
    const server = http.createServer((req, res) => live?.handle(req, res));
    // A malformed request or a dropped connection must never take the server down.
    server.on("clientError", (_error, socket) => { if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"); else socket.destroy(); });
    const listen = (p: number) => new Promise<boolean>(done => {
      const fail = () => { server.off("listening", ok); done(false); };
      const ok = () => { server.off("error", fail); done(true); };
      server.once("error", fail); server.once("listening", ok);
      server.listen(p, "127.0.0.1");
    });
    let bound = false;
    for (let p = port; p < port + 20 && !bound; p++) bound = await listen(p);
    if (!bound && !(await listen(0))) throw new Error("No free port for Live Server");
    live = new LiveServer(server, real, (server.address() as { port: number }).port, clientScript);
    return live;
  }

  get url() { return `http://127.0.0.1:${this.port}/`; }

  /** Report changed files; one event is sent once changes are quiet for 120 ms. */
  notify(files: string[]) {
    for (const file of files) if (!ignored(file)) this.pending.add(file);
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

  private route(req: http.IncomingMessage, res: http.ServerResponse) {
    const headOnly = req.method === "HEAD";
    const reply = (status: number, headers: Record<string, string>, body: Buffer | string = "") => {
      const data = typeof body === "string" ? Buffer.from(body) : body;
      res.writeHead(status, { "Content-Length": String(data.length), "Cache-Control": "no-store", ...headers });
      res.end(headOnly ? undefined : data);
    };
    if (req.method !== "GET" && !headOnly) return reply(405, { Allow: "GET, HEAD" });
    const urlPath = (req.url || "/").split(/[?#]/)[0];

    if (urlPath === CLIENT_PATH) return reply(200, { "Content-Type": "text/javascript; charset=utf-8" }, this.clientScript);
    if (urlPath === EVENTS_PATH) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 1000\n\n");
      this.clients.add(res);
      req.on("close", () => this.clients.delete(res));
      return;
    }

    const file = resolve(this.root, urlPath);
    const html = { "Content-Type": "text/html; charset=utf-8" };
    if (!file) {
      let shown = urlPath; try { shown = decodeURIComponent(urlPath); } catch { /* keep as sent */ }
      return reply(404, html, page("Not found", `<h1>404</h1><p>${escape(shown)} was not found.</p>`));
    }
    try {
      if (fs.statSync(file).isDirectory()) {
        if (!urlPath.endsWith("/")) return reply(301, { Location: urlPath + "/" });
        const index = ["index.html", "index.htm"].map(name => path.join(file, name)).find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (index) return reply(200, { "Content-Type": mime(index) }, inject(fs.readFileSync(index)));
        const entries = fs.readdirSync(file, { withFileTypes: true }).filter(e => !e.name.startsWith("."))
          .map(e => ({ dir: e.isDirectory(), name: e.name }))
          .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        let shown = urlPath; try { shown = decodeURIComponent(urlPath); } catch { /* keep as sent */ }
        const list = (urlPath === "/" ? "" : '<li><a href="../">../</a></li>')
          + entries.map(e => `<li><a href="${encodeURIComponent(e.name)}${e.dir ? "/" : ""}">${escape(e.name)}${e.dir ? "/" : ""}</a></li>`).join("");
        return reply(200, html, page(`Index of ${escape(shown)}`, `<h1>Index of ${escape(shown)}</h1><ul>${list}</ul><small>Veyra Live Server</small>`));
      }
      if (isHtml(file)) return reply(200, { "Content-Type": mime(file) }, inject(fs.readFileSync(file)));
      return this.stream(req, res, file, headOnly);
    } catch (error) {
      return reply(500, html, page("Error", `<h1>500</h1><p>${escape(String(error))}</p>`));
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
}
