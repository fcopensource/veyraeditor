/* Pure logic for Path IntelliSense Veyra: what path is being typed, where it points, and how to write it. No VS Code here. */
import * as path from "node:path";

// ---------- Where the cursor is ----------

export type Kind = "import" | "require" | "css" | "html" | "markdown" | "string";
export interface PathContext {
  kind: Kind;
  /** What has been typed between the opening quote (or bracket) and the cursor. */
  typed: string;
  /** Column where the typed path starts, for the replace range. */
  start: number;
  /** Column where the whole path ends (the closing quote), for diagnostics. */
  end: number;
  quote?: string;
}

const JS = new Set(["javascript", "typescript", "javascriptreact", "typescriptreact", "vue", "svelte", "astro", "mdx"]);
const CSS = new Set(["css", "scss", "sass", "less", "stylus", "postcss"]);
const HTML = new Set(["html", "vue", "svelte", "astro", "php", "handlebars", "razor", "erb", "jinja", "django-html", "javascriptreact", "typescriptreact"]);

/** Whether a string looks like a path the user is writing (relative, absolute, or an alias), not a word or a URL. */
export function looksLikePath(typed: string, aliasPrefixes: string[] = []): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(typed) || typed.startsWith("//")) return false; // http:, data:, mailto:, //cdn
  if (typed.startsWith("./") || typed.startsWith("../") || typed === "." || typed === ".." || typed.startsWith("/")) return true;
  return aliasPrefixes.some(p => typed.startsWith(p) || p.startsWith(typed) && typed.length > 0 && /[@~#$]/.test(typed[0]));
}

/**
 * The path being typed at `col` in `line`, if any. Recognises imports, require(), dynamic import(), export … from,
 * CSS url() and @import, HTML src/href/srcset/poster/data, Markdown links and images, and other quoted strings
 * that look like paths.
 */
export function contextAt(line: string, col: number, languageId: string, aliasPrefixes: string[] = [], allowBare = false): PathContext | undefined {
  const before = line.slice(0, col);
  // Markdown: [text](path  or  ![alt](path
  if (languageId === "markdown" || languageId === "mdx") {
    const md = /!?\[[^\]]*\]\(([^)\s]*)$/.exec(before);
    if (md) {
      const start = col - md[1].length;
      const close = line.indexOf(")", col);
      // Markdown links are relative to the file, with or without "./"; URLs and #anchors are not paths.
      return /^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(md[1]) ? undefined : { kind: "markdown", typed: md[1], start, end: close < 0 ? line.length : close };
    }
  }
  // CSS url(path) without quotes
  if (CSS.has(languageId) || HTML.has(languageId)) {
    const url = /url\(\s*([^'")\s]*)$/.exec(before);
    if (url) {
      const start = col - url[1].length;
      const close = line.slice(col).search(/[)\s]/);
      return { kind: "css", typed: url[1], start, end: close < 0 ? line.length : col + close };
    }
  }
  // Inside a quoted string
  const str = openString(before);
  if (!str) return undefined;
  const { quote, start } = str;
  const typed = before.slice(start);
  const closeAt = line.indexOf(quote, col);
  const end = closeAt < 0 ? line.length : closeAt;
  const head = before.slice(0, start - 1);
  if (JS.has(languageId)) {
    const kind: Kind | undefined = /\b(import|export)\b[^'"`;]*\bfrom\s*$/.test(head) || /\bimport\s*$/.test(head) || /\bimport\s*\(\s*$/.test(head) ? "import"
      : /\brequire(\.resolve)?\s*\(\s*$/.test(head) || /\b(jest|vi)\.(mock|requireActual|importActual)\s*\(\s*$/.test(head) ? "require" : undefined;
    if (kind) {
      // Package names ("react", "lodash/fp") are npm's business. Paths start with ./ ../ / or an alias,
      // or, when the project has a tsconfig baseUrl, look like a folder path ("components/Header").
      const bareFolder = allowBare && /^[A-Za-z_][\w.-]*\//.test(typed);
      return looksLikePath(typed, aliasPrefixes) || bareFolder ? { kind, typed, start, end, quote } : undefined;
    }
  }
  if (CSS.has(languageId) && (/@(import|use|forward)\s*$/.test(head) || /url\(\s*$/.test(head))) return { kind: "css", typed, start, end, quote };
  if (HTML.has(languageId) && /\b(src|href|srcset|poster|data|action|component|template|templateUrl|styleUrls?)\s*=\s*\{?\s*$/i.test(head)) return { kind: "html", typed, start, end, quote };
  if (/\b(templateUrl|styleUrls?)\s*:\s*\[?\s*$/.test(head)) return { kind: "html", typed, start, end, quote };
  // Any other string that is clearly a path: "./data.json", '../assets/logo.png', "@/lib/x"
  if (looksLikePath(typed, aliasPrefixes) && (typed.includes("/") || typed.startsWith("."))) return { kind: "string", typed, start, end, quote };
  return undefined;
}
/** The open string around the cursor: its quote and the column after it. Skips escaped quotes and finished strings. */
function openString(before: string): { quote: string; start: number } | undefined {
  let open: { quote: string; start: number } | undefined;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (c === "\\" && open) { i++; continue; }
    if (open) { if (c === open.quote) open = undefined; continue; }
    if (c === '"' || c === "'" || c === "`") open = { quote: c, start: i + 1 };
    if (c === "/" && before[i + 1] === "/" && !open) break; // a // comment
  }
  if (open?.quote === "`" && /\$\{/.test(before.slice(open.start))) return undefined; // a template with expressions
  return open;
}

// ---------- tsconfig / jsconfig ----------

/** Reads JSON with comments and trailing commas (tsconfig style). */
export function parseJsonc(text: string): any {
  let out = "", i = 0, inString = false;
  while (i < text.length) {
    const c = text[i];
    if (inString) { out += c; if (c === "\\") { out += text[i + 1] ?? ""; i += 2; continue; } if (c === '"') inString = false; i++; continue; }
    if (c === '"') { inString = true; out += c; i++; continue; }
    if (text.startsWith("//", i)) { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (text.startsWith("/*", i)) { const e = text.indexOf("*/", i + 2); i = e < 0 ? text.length : e + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export interface Alias { pattern: string; targets: string[]; source: string }
export interface ProjectConfig { dir: string; baseUrl?: string; aliases: Alias[]; moduleResolution?: string; module?: string; allowImportingTsExtensions?: boolean; file?: string }

/**
 * Compiler options that matter for paths, following "extends" chains. `read` returns a file's text or undefined;
 * `resolvePackage` finds an extended config inside node_modules (like "@tsconfig/node20/tsconfig.json").
 */
export function readProjectConfig(file: string, read: (f: string) => string | undefined, resolvePackage?: (spec: string, from: string) => string | undefined, depth = 0): ProjectConfig | undefined {
  const text = read(file);
  if (text === undefined || depth > 8) return undefined;
  let json: any;
  try { json = parseJsonc(text); } catch { return undefined; }
  const dir = path.dirname(file);
  let base: ProjectConfig | undefined;
  for (const ext of ([] as string[]).concat(json.extends ?? [])) {
    const target = ext.startsWith(".") || path.isAbsolute(ext) ? path.resolve(dir, ext.endsWith(".json") ? ext : `${ext}.json`) : resolvePackage?.(ext, dir);
    const parent = target ? readProjectConfig(target, read, resolvePackage, depth + 1) : undefined;
    if (parent) base = { ...base, ...parent, aliases: parent.aliases.length ? parent.aliases : base?.aliases ?? [] };
  }
  const o = json.compilerOptions ?? {};
  const baseUrl = o.baseUrl !== undefined ? path.resolve(dir, o.baseUrl) : base?.baseUrl;
  const pathsRoot = o.baseUrl !== undefined ? baseUrl! : o.paths ? dir : base?.baseUrl ?? base?.dir ?? dir;
  const aliases = o.paths
    ? Object.entries(o.paths as Record<string, string[]>).map(([pattern, targets]) => ({ pattern, targets: targets.map(t => path.resolve(pathsRoot, t)), source: file }))
    : base?.aliases ?? [];
  return {
    dir, file, baseUrl, aliases,
    moduleResolution: (o.moduleResolution ?? base?.moduleResolution)?.toLowerCase(),
    module: (o.module ?? base?.module)?.toLowerCase(),
    allowImportingTsExtensions: o.allowImportingTsExtensions ?? base?.allowImportingTsExtensions,
  };
}

/** package.json "imports" (#alias) entries as aliases. */
export function packageImports(pkgDir: string, pkg: any): Alias[] {
  const imports = pkg?.imports;
  if (!imports || typeof imports !== "object") return [];
  const pick = (v: any): string | undefined => typeof v === "string" ? v : v && typeof v === "object" ? pick(v.types ?? v.import ?? v.node ?? v.default ?? v.require) : undefined;
  return Object.entries(imports).flatMap(([pattern, v]) => { const t = pick(v); return t && t.startsWith("./") ? [{ pattern, targets: [path.resolve(pkgDir, t)], source: path.join(pkgDir, "package.json") }] : []; });
}

/** The folder to list and the part of the name already typed, for a typed path. */
export interface Lookup { dir: string; partial: string; via?: Alias }
export function lookup(typed: string, fileDir: string, roots: { workspace: string; aliases: Alias[]; baseUrl?: string; absoluteRoot?: string }): Lookup[] {
  const slash = typed.lastIndexOf("/");
  const head = slash >= 0 ? typed.slice(0, slash + 1) : "";
  const partial = slash >= 0 ? typed.slice(slash + 1) : typed;
  if (typed.startsWith("./") || typed.startsWith("../") || typed === "." || typed === "..") return [{ dir: path.resolve(fileDir, head || "."), partial: typed === "." || typed === ".." ? "" : partial }];
  if (typed.startsWith("/")) return [{ dir: path.join(roots.absoluteRoot ?? roots.workspace, head), partial }];
  const out: Lookup[] = [];
  // "@/*" → ["src/*"]: what follows the prefix is a path inside the target folder.
  for (const alias of roots.aliases) {
    const star = alias.pattern.indexOf("*");
    if (star < 0) continue; // an exact alias like "config" names one file: nothing to list
    const prefix = alias.pattern.slice(0, star);
    if (!typed.startsWith(prefix)) continue;
    const rest = typed.slice(prefix.length);
    const restHead = rest.lastIndexOf("/") >= 0 ? rest.slice(0, rest.lastIndexOf("/") + 1) : "";
    for (const target of alias.targets) {
      const folder = target.includes("*") ? target.slice(0, target.indexOf("*")) : target;
      out.push({ dir: path.resolve(folder, restHead), partial, via: alias });
    }
  }
  if (!out.length && roots.baseUrl && /^[A-Za-z_]/.test(typed) && typed.includes("/")) out.push({ dir: path.resolve(roots.baseUrl, head), partial });
  return out;
}

/** Where a complete path points, before trying extensions: one entry per alias target that matches. */
export function resolveTargets(typed: string, fileDir: string, roots: { workspace: string; aliases: Alias[]; baseUrl?: string; absoluteRoot?: string }): string[] {
  const clean = typed.replace(/[?#].*$/, "");
  if (clean.startsWith("./") || clean.startsWith("../") || clean === "." || clean === "..") return [path.resolve(fileDir, clean)];
  if (clean.startsWith("/")) return [path.join(roots.absoluteRoot ?? roots.workspace, clean)];
  const out: string[] = [];
  for (const alias of roots.aliases) {
    const star = alias.pattern.indexOf("*");
    if (star < 0) { if (clean === alias.pattern) out.push(...alias.targets); continue; }
    const prefix = alias.pattern.slice(0, star), suffix = alias.pattern.slice(star + 1);
    if (!clean.startsWith(prefix) || !clean.endsWith(suffix) || clean.length < prefix.length + suffix.length) continue;
    const matched = clean.slice(prefix.length, clean.length - suffix.length);
    out.push(...alias.targets.map(t => t.replace("*", matched)));
  }
  if (!out.length && roots.baseUrl && /^[A-Za-z_]/.test(clean) && clean.includes("/")) out.push(path.resolve(roots.baseUrl, clean));
  return out;
}
/** The alias prefixes the user may start typing, like "@/", "~/", "#utils/". */
export function aliasPrefixes(aliases: Alias[]): string[] {
  return [...new Set(aliases.map(a => (a.pattern.includes("*") ? a.pattern.slice(0, a.pattern.indexOf("*")) : a.pattern)).filter(Boolean))];
}

// ---------- Writing import paths ----------

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i;
const TS_EXT = /\.(tsx?|mts|cts)$/i;
export interface ImportStyle { dropExtension: boolean; tsToJs: boolean; dropIndex: boolean }
/**
 * How imports should be written in this project:
 * - bundlers and classic Node resolution: no extension, and folders instead of /index;
 * - Node ESM (moduleResolution node16/nodenext, or "type": "module" without a bundler): keep the extension, and
 *   write .js for .ts files, because that's what Node loads after compiling.
 */
export function importStyle(config: ProjectConfig | undefined, packageType: string | undefined, languageId: string, override: "auto" | "always" | "never"): ImportStyle {
  if (override === "always") return { dropExtension: false, tsToJs: false, dropIndex: false };
  if (override === "never") return { dropExtension: true, tsToJs: false, dropIndex: true };
  const mr = config?.moduleResolution, mod = config?.module;
  const nodeEsm = mr === "node16" || mr === "nodenext" || (!mr && (mod === "node16" || mod === "nodenext")) || (!config && packageType === "module" && /^javascript/.test(languageId));
  if (config?.allowImportingTsExtensions) return { dropExtension: false, tsToJs: false, dropIndex: false };
  if (nodeEsm) return { dropExtension: false, tsToJs: !!config, dropIndex: false };
  return { dropExtension: true, tsToJs: false, dropIndex: true };
}
/** The name to insert for a file in an import, given the project's style. */
export function importName(fileName: string, style: ImportStyle): string {
  if (!CODE_EXT.test(fileName) || /\.d\.(m|c)?ts$/i.test(fileName)) return fileName.replace(/\.d\.(m|c)?ts$/i, "");
  if (style.dropExtension) return fileName.replace(CODE_EXT, "");
  if (style.tsToJs && TS_EXT.test(fileName)) return fileName.replace(/\.tsx?$/i, ".js").replace(/\.mts$/i, ".mjs").replace(/\.cts$/i, ".cjs");
  return fileName;
}

// ---------- Checking paths ----------

const RESOLVE_EXT = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json", ".vue", ".svelte", ".astro", ".css", ".scss", ".sass", ".less", ".node"];
/**
 * The files a path may point to, in the order a resolver tries them. For imports: as written, with each extension
 * added, the .js → .ts swap that TypeScript does, and a folder's index file.
 */
export function candidates(target: string, kind: Kind): string[] {
  const clean = target.replace(/[?#].*$/, "");
  if (kind !== "import" && kind !== "require") return [clean];
  const out = [clean];
  const swapped = clean.replace(/\.js$/i, ".ts").replace(/\.jsx$/i, ".tsx").replace(/\.mjs$/i, ".mts").replace(/\.cjs$/i, ".cts");
  if (swapped !== clean) out.push(swapped, clean.replace(/\.js$/i, ".tsx"), clean.replace(/\.js$/i, ".d.ts"));
  for (const ext of RESOLVE_EXT) out.push(clean + ext);
  for (const ext of RESOLVE_EXT) out.push(path.join(clean, "index" + ext));
  return out;
}

/** Edit distance, for "did you mean". */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** The closest names in a folder, ignoring case and extensions, for a missing path segment. */
export function suggest(wanted: string, names: string[], max = 3): string[] {
  const stem = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, "");
  const ext = (s: string) => /\.[^.]+$/.exec(s.toLowerCase())?.[0] ?? "";
  const w = stem(wanted);
  return names
    .map(n => ({ n, d: n.toLowerCase() === wanted.toLowerCase() ? 0 : distance(w, stem(n)), other: ext(n) === ext(wanted) ? 0 : 1 }))
    .filter(x => x.d <= Math.max(2, Math.floor(w.length / 3)))
    .sort((a, b) => a.d - b.d || a.other - b.other || a.n.localeCompare(b.n))
    .slice(0, max).map(x => x.n);
}

export const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i;
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1000, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
