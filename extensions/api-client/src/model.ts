// The parts of Veyra API Client that do not need VS Code: requests, variables, cURL, Postman, .http files
// and code snippets. Unit-tested.

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type Method = (typeof METHODS)[number] | string;

export interface KV { key: string; value: string; enabled: boolean }
export interface Variable extends KV { secret?: boolean }
export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; key: string; value: string; in: "header" | "query" };
export type BodyType = "none" | "json" | "text" | "xml" | "form" | "multipart" | "graphql";
export interface Body { type: BodyType; text: string; form: KV[]; variables: string }
export interface ApiRequest {
  id: string; name: string; method: Method; url: string;
  params: KV[]; headers: KV[]; body: Body; auth: Auth;
  folder?: string;
}
export interface Collection { id: string; name: string; requests: ApiRequest[] }
export interface Environment { id: string; name: string; variables: Variable[] }

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const emptyBody = (): Body => ({ type: "none", text: "", form: [], variables: "" });
export function newRequest(patch: Partial<ApiRequest> = {}): ApiRequest {
  return { id: newId(), name: "New request", method: "GET", url: "", params: [], headers: [], body: emptyBody(), auth: { type: "none" }, ...patch };
}

/** A request read from disk, with anything missing filled in, so older or hand-edited files still open. */
export function normalizeRequest(input: any): ApiRequest {
  const kv = (list: any): KV[] => (Array.isArray(list) ? list : []).filter(x => x && typeof x === "object")
    .map(x => ({ key: String(x.key ?? ""), value: String(x.value ?? ""), enabled: x.enabled !== false }));
  const body = input?.body ?? {};
  const types: BodyType[] = ["none", "json", "text", "xml", "form", "multipart", "graphql"];
  const auth = input?.auth;
  return {
    id: typeof input?.id === "string" && input.id ? input.id : newId(),
    name: typeof input?.name === "string" && input.name ? input.name : "Request",
    method: typeof input?.method === "string" && input.method ? input.method.toUpperCase() : "GET",
    url: typeof input?.url === "string" ? input.url : "",
    params: kv(input?.params), headers: kv(input?.headers),
    body: { type: types.includes(body.type) ? body.type : "none", text: String(body.text ?? ""), form: kv(body.form), variables: String(body.variables ?? "") },
    auth: auth?.type === "bearer" ? { type: "bearer", token: String(auth.token ?? "") }
      : auth?.type === "basic" ? { type: "basic", username: String(auth.username ?? ""), password: String(auth.password ?? "") }
      : auth?.type === "apikey" ? { type: "apikey", key: String(auth.key ?? ""), value: String(auth.value ?? ""), in: auth.in === "query" ? "query" : "header" }
      : { type: "none" },
    ...(typeof input?.folder === "string" && input.folder ? { folder: input.folder } : {}),
  };
}

// ---------- Variables ----------

const VAR = /\{\{\s*([$\w.-]+)\s*\}\}/g;
/** Names used as {{name}} in a text. */
export const variablesIn = (text: string) => [...new Set([...text.matchAll(VAR)].map(m => m[1]))];

function uuid() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = "4"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
/** Built-in values that change on every request. */
export const DYNAMIC: Record<string, () => string> = {
  $guid: uuid, $uuid: uuid,
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(Math.floor(Math.random() * 1000)),
  $randomEmail: () => `user${Math.floor(Math.random() * 100000)}@example.com`,
};

/** Replace {{name}} with its value. Unknown names are left as they are, and reported. */
export function resolve(text: string, vars: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const once = (input: string) => input.replace(VAR, (whole, name: string) => {
    if (name in vars) return vars[name];
    if (DYNAMIC[name]) return DYNAMIC[name]();
    missing.add(name);
    return whole;
  });
  // Values may refer to other variables ({{baseUrl}} = {{host}}/v1); follow a few levels.
  let out = text;
  for (let i = 0; i < 5; i++) { const next = once(out); if (next === out) break; out = next; missing.clear(); }
  once(out);
  return { text: out, missing: [...missing] };
}
/** The enabled variables of an environment, with private values laid over the shared ones. */
export function variableMap(...layers: (Variable[] | undefined)[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const layer of layers) for (const v of layer ?? []) if (v.enabled && v.key) map[v.key] = v.value;
  return map;
}

// ---------- URLs and query parameters ----------

/** Query parameters typed into a URL, for showing them in the Params table. */
export function paramsFromUrl(url: string): { base: string; params: KV[] } {
  const hash = url.indexOf("#"), q = url.indexOf("?");
  if (q < 0 || (hash >= 0 && hash < q)) return { base: url, params: [] };
  const base = url.slice(0, q), query = url.slice(q + 1, hash < 0 ? undefined : hash);
  const params = query.split("&").filter(Boolean).map(pair => {
    const eq = pair.indexOf("=");
    const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
    return { key: dec(eq < 0 ? pair : pair.slice(0, eq)), value: dec(eq < 0 ? "" : pair.slice(eq + 1)), enabled: true };
  });
  return { base, params };
}
const encode = (s: string) => encodeURIComponent(s).replace(/%7B%7B/g, "{{").replace(/%7D%7D/g, "}}");
/** A URL with the enabled params as its query string. */
export function urlWithParams(base: string, params: KV[]): string {
  const query = params.filter(p => p.enabled && p.key).map(p => `${encode(p.key)}=${encode(p.value)}`).join("&");
  return query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
}

// ---------- Preparing a request ----------

export interface Prepared { method: string; url: string; headers: [string, string][]; body?: string; missing: string[] }
const CONTENT_TYPES: Partial<Record<BodyType, string>> = {
  json: "application/json", text: "text/plain", xml: "application/xml", form: "application/x-www-form-urlencoded", graphql: "application/json",
};
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Everything needed to send the request: variables filled in, auth applied, body encoded. */
export function prepare(req: ApiRequest, vars: Record<string, string>): Prepared {
  const missing = new Set<string>();
  const r = (s: string) => { const out = resolve(s, vars); out.missing.forEach(m => missing.add(m)); return out.text; };
  const headers: [string, string][] = req.headers.filter(h => h.enabled && h.key).map(h => [r(h.key), r(h.value)]);
  const has = (name: string) => headers.some(([k]) => k.toLowerCase() === name.toLowerCase());
  const params = req.params.filter(p => p.enabled && p.key).map(p => ({ ...p, key: r(p.key), value: r(p.value) }));

  const auth = req.auth;
  if (auth.type === "bearer" && auth.token && !has("authorization")) headers.push(["Authorization", `Bearer ${r(auth.token)}`]);
  if (auth.type === "basic" && (auth.username || auth.password) && !has("authorization")) headers.push(["Authorization", `Basic ${b64(`${r(auth.username)}:${r(auth.password)}`)}`]);
  if (auth.type === "apikey" && auth.key) {
    if (auth.in === "query") params.push({ key: r(auth.key), value: r(auth.value), enabled: true });
    else if (!has(auth.key)) headers.push([r(auth.key), r(auth.value)]);
  }

  let body: string | undefined;
  const type = req.body.type;
  if (type === "json" || type === "text" || type === "xml") body = r(req.body.text);
  else if (type === "graphql") {
    let variables: unknown = undefined;
    const text = r(req.body.variables).trim();
    if (text) { try { variables = JSON.parse(text); } catch { variables = undefined; } }
    body = JSON.stringify(variables === undefined ? { query: r(req.body.text) } : { query: r(req.body.text), variables });
  } else if (type === "form") {
    body = req.body.form.filter(f => f.enabled && f.key).map(f => `${encodeURIComponent(r(f.key))}=${encodeURIComponent(r(f.value))}`).join("&");
  } else if (type === "multipart") {
    const boundary = `----VeyraBoundary${Math.random().toString(36).slice(2, 14)}`;
    body = req.body.form.filter(f => f.enabled && f.key)
      .map(f => `--${boundary}\r\nContent-Disposition: form-data; name="${r(f.key).replace(/"/g, "%22")}"\r\n\r\n${r(f.value)}\r\n`).join("") + `--${boundary}--\r\n`;
    if (!has("content-type")) headers.push(["Content-Type", `multipart/form-data; boundary=${boundary}`]);
  }
  if (body !== undefined && CONTENT_TYPES[type] && !has("content-type")) headers.push(["Content-Type", CONTENT_TYPES[type]!]);

  let url = r(req.url.trim());
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(url) ? "http://" : "https://") + url;
  const method = (req.method || "GET").toUpperCase();
  return { method, url: urlWithParams(url, params), headers, body: method === "GET" || method === "HEAD" ? (body || undefined) : body, missing: [...missing] };
}

// ---------- Code snippets ----------

const shellQuote = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
export function toCurl(p: Prepared): string {
  // One flag per line, with its value, as API docs show them.
  const lines = ["curl"];
  if (p.method !== "GET" || p.body !== undefined) lines.push(`-X ${p.method}`);
  lines.push(shellQuote(p.url));
  for (const [k, v] of p.headers) lines.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  if (p.body !== undefined) lines.push(`--data-raw ${shellQuote(p.body)}`);
  return lines.join(" \\\n  ");
}
export function toFetch(p: Prepared): string {
  const options: string[] = [`  method: ${JSON.stringify(p.method)},`];
  if (p.headers.length) options.push(`  headers: {\n${p.headers.map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}\n  },`);
  if (p.body !== undefined) {
    let body = JSON.stringify(p.body);
    try { if (/json/i.test(p.headers.find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "")) body = `JSON.stringify(${JSON.stringify(JSON.parse(p.body), null, 2).replace(/\n/g, "\n  ")})`; } catch { /* not JSON */ }
    options.push(`  body: ${body},`);
  }
  return `const response = await fetch(${JSON.stringify(p.url)}, {\n${options.join("\n")}\n});\nconst data = await response.json();\nconsole.log(data);`;
}
export function toPython(p: Prepared): string {
  const lines = ["import requests", "", `response = requests.request(`, `    ${JSON.stringify(p.method)},`, `    ${JSON.stringify(p.url)},`];
  if (p.headers.length) lines.push(`    headers={${p.headers.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")}},`);
  if (p.body !== undefined) lines.push(`    data=${JSON.stringify(p.body)},`);
  lines.push(")", "print(response.status_code)", "print(response.text)");
  return lines.join("\n");
}

// ---------- Importing cURL ----------

/** Split a shell command into words, honouring quotes, backslash and caret line continuations. */
export function shellWords(command: string): string[] {
  const text = command.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ").replace(/`\r?\n/g, " ");
  const words: string[] = [];
  let word = "", inWord = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") { const end = text.indexOf("'", i + 1); word += text.slice(i + 1, end < 0 ? undefined : end); i = end < 0 ? text.length : end + 1; inWord = true; continue; }
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') { if (text[i] === "\\" && /["\\$`]/.test(text[i + 1] ?? "")) i++; word += text[i++]; }
      i++; inWord = true; continue;
    }
    if (c === "$" && text[i + 1] === "'") { // $'...' with \n escapes
      const end = text.indexOf("'", i + 2);
      word += text.slice(i + 2, end < 0 ? undefined : end).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\'/g, "'");
      i = end < 0 ? text.length : end + 1; inWord = true; continue;
    }
    if (c === "\\" && i + 1 < text.length) { word += text[i + 1]; i += 2; inWord = true; continue; }
    if (/\s/.test(c)) { if (inWord) { words.push(word); word = ""; inWord = false; } i++; continue; }
    word += c; inWord = true; i++;
  }
  if (inWord) words.push(word);
  return words;
}

/** A request from a cURL command, as copied from a browser's developer tools or API docs. */
export function parseCurl(command: string): ApiRequest {
  const words = shellWords(command.trim());
  if (!/^curl(\.exe)?$/i.test(words[0] ?? "")) throw new Error("This is not a curl command. Paste a command that starts with curl.");
  const req = newRequest({ name: "Imported from cURL" });
  const data: string[] = [], form: KV[] = [];
  let method = "", get = false, json = false;
  const takes = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json", "-u", "--user", "-F", "--form", "--form-string", "-A", "--user-agent", "-b", "--cookie", "-e", "--referer", "--url", "-o", "--output", "--connect-timeout", "-m", "--max-time", "-x", "--proxy", "-w", "--write-out", "--cert", "--key", "--cacert", "-T", "--upload-file", "--retry"]);
  for (let i = 1; i < words.length; i++) {
    let flag = words[i], value: string | undefined;
    const long = flag.match(/^(--[\w-]+)=(.*)$/s);
    if (long) { flag = long[1]; value = long[2]; }
    else if (/^-[A-Za-z]./.test(flag) && takes.has(flag.slice(0, 2))) { value = flag.slice(2); flag = flag.slice(0, 2); }
    else if (takes.has(flag)) value = words[++i];
    if (value === undefined && !flag.startsWith("-")) { req.url = flag; continue; }
    const v = value ?? "";
    switch (flag) {
      case "-X": case "--request": method = v.toUpperCase(); break;
      case "--url": req.url = v; break;
      case "-H": case "--header": {
        const colon = v.indexOf(":");
        if (colon > 0) req.headers.push({ key: v.slice(0, colon).trim(), value: v.slice(colon + 1).trim(), enabled: true });
        break;
      }
      case "-A": case "--user-agent": req.headers.push({ key: "User-Agent", value: v, enabled: true }); break;
      case "-b": case "--cookie": if (v.includes("=")) req.headers.push({ key: "Cookie", value: v, enabled: true }); break;
      case "-e": case "--referer": req.headers.push({ key: "Referer", value: v, enabled: true }); break;
      case "-d": case "--data": case "--data-raw": case "--data-binary": case "--data-ascii": data.push(v); break;
      case "--data-urlencode": { const eq = v.indexOf("="); data.push(eq < 0 ? encodeURIComponent(v) : `${v.slice(0, eq)}=${encodeURIComponent(v.slice(eq + 1))}`); break; }
      case "--json": data.push(v); json = true; break;
      case "-F": case "--form": case "--form-string": { const eq = v.indexOf("="); if (eq > 0) form.push({ key: v.slice(0, eq), value: v.slice(eq + 1), enabled: true }); break; }
      case "-u": case "--user": { const colon = v.indexOf(":"); req.auth = { type: "basic", username: colon < 0 ? v : v.slice(0, colon), password: colon < 0 ? "" : v.slice(colon + 1) }; break; }
      case "-G": case "--get": get = true; break;
      case "-I": case "--head": method = "HEAD"; break;
    }
  }
  const auth = req.headers.find(h => h.key.toLowerCase() === "authorization");
  if (auth && /^bearer\s+/i.test(auth.value)) { req.auth = { type: "bearer", token: auth.value.replace(/^bearer\s+/i, "") }; req.headers = req.headers.filter(h => h !== auth); }
  const contentType = req.headers.find(h => h.key.toLowerCase() === "content-type")?.value ?? "";
  if (form.length) { req.body = { ...emptyBody(), type: "multipart", form }; req.headers = req.headers.filter(h => h.key.toLowerCase() !== "content-type"); }
  else if (data.length && get) { req.url = urlWithParams(req.url, data.join("&").split("&").map(pair => { const eq = pair.indexOf("="); return { key: eq < 0 ? pair : pair.slice(0, eq), value: eq < 0 ? "" : decodeURIComponent(pair.slice(eq + 1)), enabled: true }; })); }
  else if (data.length) {
    const text = data.join("&");
    const isJson = json || /json/i.test(contentType) || /^\s*[[{]/.test(text);
    if (!isJson && (/x-www-form-urlencoded/i.test(contentType) || (!contentType && /^[^=&\s]+=/.test(text)))) {
      req.body = { ...emptyBody(), type: "form", form: text.split("&").map(pair => { const eq = pair.indexOf("="); const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } }; return { key: dec(eq < 0 ? pair : pair.slice(0, eq)), value: dec(eq < 0 ? "" : pair.slice(eq + 1)), enabled: true }; }) };
    } else {
      let pretty = text;
      if (isJson) try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep as sent */ }
      req.body = { ...emptyBody(), type: isJson ? "json" : /xml/i.test(contentType) ? "xml" : "text", text: pretty };
    }
    if (req.body.type !== "text") req.headers = req.headers.filter(h => h.key.toLowerCase() !== "content-type" || !/json|x-www-form-urlencoded|xml/i.test(h.value));
  }
  req.method = method || (data.length && !get || form.length ? "POST" : "GET");
  const split = paramsFromUrl(req.url);
  req.url = split.base; req.params = split.params;
  if (!req.url) throw new Error("The curl command has no URL.");
  req.name = nameFor(req.method, req.url);
  return req;
}

/** A short name for a request: "GET /users/:id". */
export function nameFor(method: string, url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/\?.*$/, "") || "/";
  return `${method} ${path.length > 48 ? "…" + path.slice(-47) : path}`;
}

// ---------- Postman ----------

/** A Postman collection (v2.0 or v2.1 export) as a Veyra collection. Nested folders become "A / B". */
export function parsePostman(json: any): { collection: Collection; environment?: Environment } {
  if (!json?.info || !Array.isArray(json.item)) throw new Error("This is not a Postman collection export (v2.0 or v2.1).");
  const requests: ApiRequest[] = [];
  const text = (v: any) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const walk = (items: any[], folder: string | undefined) => {
    for (const item of items) {
      if (Array.isArray(item.item)) { walk(item.item, folder ? `${folder} / ${item.name}` : item.name); continue; }
      const r = item.request;
      if (!r) continue;
      const url = typeof r.url === "string" ? r.url : text(r.url?.raw);
      const split = paramsFromUrl(url);
      const req = newRequest({
        name: text(item.name) || nameFor(r.method ?? "GET", url), method: text(r.method || "GET").toUpperCase(), url: split.base,
        params: split.params.map(p => ({ ...p, enabled: !(r.url?.query ?? []).find((q: any) => q.key === p.key && q.disabled) })),
        headers: (Array.isArray(r.header) ? r.header : []).map((h: any) => ({ key: text(h.key), value: text(h.value), enabled: !h.disabled })),
        ...(folder ? { folder } : {}),
      });
      const b = r.body;
      if (b?.mode === "raw") {
        const lang = b.options?.raw?.language;
        req.body = { ...emptyBody(), type: lang === "json" || (!lang && /^\s*[[{]/.test(b.raw ?? "")) ? "json" : lang === "xml" ? "xml" : "text", text: text(b.raw) };
      } else if (b?.mode === "urlencoded") req.body = { ...emptyBody(), type: "form", form: (b.urlencoded ?? []).map((f: any) => ({ key: text(f.key), value: text(f.value), enabled: !f.disabled })) };
      else if (b?.mode === "formdata") req.body = { ...emptyBody(), type: "multipart", form: (b.formdata ?? []).filter((f: any) => f.type !== "file").map((f: any) => ({ key: text(f.key), value: text(f.value), enabled: !f.disabled })) };
      else if (b?.mode === "graphql") req.body = { ...emptyBody(), type: "graphql", text: text(b.graphql?.query), variables: text(b.graphql?.variables) };
      const a = r.auth;
      const field = (list: any[], key: string) => text((list ?? []).find((x: any) => x.key === key)?.value);
      if (a?.type === "bearer") req.auth = { type: "bearer", token: field(a.bearer, "token") };
      else if (a?.type === "basic") req.auth = { type: "basic", username: field(a.basic, "username"), password: field(a.basic, "password") };
      else if (a?.type === "apikey") req.auth = { type: "apikey", key: field(a.apikey, "key"), value: field(a.apikey, "value"), in: field(a.apikey, "in") === "query" ? "query" : "header" };
      requests.push(req);
    }
  };
  walk(json.item, undefined);
  const collection = { id: newId(), name: text(json.info.name) || "Imported collection", requests };
  const vars = Array.isArray(json.variable) ? json.variable : [];
  const environment = vars.length ? { id: newId(), name: `${collection.name} variables`, variables: vars.map((v: any) => ({ key: text(v.key), value: text(v.value), enabled: !v.disabled })) } : undefined;
  return { collection, environment };
}

/** A Veyra collection as a Postman v2.1 collection, so it can be shared with Postman users. */
export function toPostman(collection: Collection): any {
  const asItem = (req: ApiRequest) => {
    const request: any = { method: req.method, header: req.headers.map(h => ({ key: h.key, value: h.value, disabled: !h.enabled || undefined })), url: { raw: urlWithParams(req.url, req.params) } };
    const b = req.body;
    if (b.type === "json" || b.type === "text" || b.type === "xml") request.body = { mode: "raw", raw: b.text, options: { raw: { language: b.type === "text" ? "text" : b.type } } };
    else if (b.type === "form") request.body = { mode: "urlencoded", urlencoded: b.form.map(f => ({ key: f.key, value: f.value, disabled: !f.enabled || undefined })) };
    else if (b.type === "multipart") request.body = { mode: "formdata", formdata: b.form.map(f => ({ key: f.key, value: f.value, type: "text", disabled: !f.enabled || undefined })) };
    else if (b.type === "graphql") request.body = { mode: "graphql", graphql: { query: b.text, variables: b.variables } };
    const a = req.auth;
    if (a.type === "bearer") request.auth = { type: "bearer", bearer: [{ key: "token", value: a.token, type: "string" }] };
    else if (a.type === "basic") request.auth = { type: "basic", basic: [{ key: "username", value: a.username }, { key: "password", value: a.password }] };
    else if (a.type === "apikey") request.auth = { type: "apikey", apikey: [{ key: "key", value: a.key }, { key: "value", value: a.value }, { key: "in", value: a.in }] };
    return { name: req.name, request };
  };
  const root: any[] = [], folders = new Map<string, any[]>();
  for (const req of collection.requests) {
    if (!req.folder) { root.push(asItem(req)); continue; }
    if (!folders.has(req.folder)) { const items: any[] = []; folders.set(req.folder, items); root.push({ name: req.folder, item: items }); }
    folders.get(req.folder)!.push(asItem(req));
  }
  return { info: { name: collection.name, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" }, item: root };
}

// ---------- .http files (REST Client format) ----------

export interface HttpFileRequest { line: number; request: ApiRequest }
/** The requests in a .http or .rest file: blocks separated by ###, with @name = value file variables. */
export function parseHttpFile(text: string): { requests: HttpFileRequest[]; variables: Record<string, string> } {
  const lines = text.split(/\r?\n/);
  const variables: Record<string, string> = {};
  const requests: HttpFileRequest[] = [];
  let block: { start: number; lines: string[]; name?: string } | null = null;
  const flush = () => {
    if (!block) return;
    const body = block.lines;
    let i = 0;
    while (i < body.length && (/^\s*(#|\/\/)/.test(body[i]) || !body[i].trim())) i++;
    const first = body[i];
    const match = first?.match(/^\s*(?:([A-Z]+)\s+)?(\S.*?)(?:\s+HTTP\/[\d.]+)?\s*$/);
    if (match && (match[1] || /^(https?:|\{\{|\/|localhost)/i.test(match[2]))) {
      const req = newRequest({ method: match[1] ?? "GET" });
      const split = paramsFromUrl(match[2]);
      req.url = split.base; req.params = split.params;
      i++;
      // Query lines continued on the next lines: ?a=1 / &b=2
      while (i < body.length && /^\s*[?&]/.test(body[i])) { req.params.push(...paramsFromUrl("x" + body[i].trim().replace(/^&/, "?")).params); i++; }
      for (; i < body.length && body[i].trim(); i++) {
        const colon = body[i].indexOf(":");
        if (colon > 0) req.headers.push({ key: body[i].slice(0, colon).trim(), value: body[i].slice(colon + 1).trim(), enabled: true });
      }
      const rest = body.slice(i + 1).join("\n").trim();
      if (rest) {
        const type = req.headers.find(h => h.key.toLowerCase() === "content-type")?.value ?? "";
        req.body = { ...emptyBody(), type: /json/i.test(type) || /^[[{]/.test(rest) ? "json" : /x-www-form-urlencoded/i.test(type) ? "text" : /xml/i.test(type) ? "xml" : "text", text: rest };
      }
      req.name = block.name || nameFor(req.method, req.url);
      requests.push({ line: block.start + (body.indexOf(first)), request: req });
    }
    block = null;
  };
  lines.forEach((line, index) => {
    if (/^###/.test(line)) { flush(); block = { start: index + 1, lines: [], name: line.replace(/^###\s*/, "").trim() || undefined }; return; }
    const variable = line.match(/^\s*@([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (variable && !block?.lines.some(l => l.trim())) { variables[variable[1]] = variable[2]; return; }
    const name = line.match(/^\s*(?:#|\/\/)\s*@name\s+(.+?)\s*$/);
    if (!block) block = { start: index, lines: [] };
    if (name) block.name = name[1];
    block.lines.push(line);
  });
  flush();
  return { requests, variables };
}

// ---------- Responses ----------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export const formatDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

/** What kind of body a response has, for choosing how to show it. */
export function bodyKind(contentType: string, text: string): "json" | "html" | "xml" | "image" | "text" | "binary" {
  const t = contentType.toLowerCase();
  if (/^image\//.test(t)) return "image";
  if (/json/.test(t)) return "json";
  if (/html/.test(t)) return "html";
  if (/xml/.test(t)) return "xml";
  if (/^text\/|javascript|css|csv|yaml/.test(t)) return "text";
  if (/^\s*[[{]/.test(text)) { try { JSON.parse(text); return "json"; } catch { /* not JSON */ } }
  if (/octet-stream|pdf|zip|audio|video|font/.test(t)) return "binary";
  return "text";
}
/** Status text for common HTTP codes, for servers that do not send one. */
export const STATUS: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 415: "Unsupported Media Type",
  422: "Unprocessable Content", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

/** A file-system-friendly name: "Users API" → "users-api". */
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "collection";
