// Veyra Blast Radius: the engine. Pure TypeScript with no VS Code dependency, so it is unit-tested with node --test.
//
// Files are workspace-relative POSIX paths ("src/app/page.tsx"). The graph maps every file to the files it imports
// (forward) and to the files that import it (reverse). The blast radius of a change is everything reachable through
// the reverse graph: every file that could behave differently because the changed files changed.

export type Lang = "js" | "py";
export type Kind = "changed" | "test" | "route" | "component" | "config" | "source";

export const JS_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro"];
export const PY_EXTS = [".py"];
export const SOURCE_GLOB = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,astro,py}";

export function langOf(file: string): Lang | null {
  const ext = extOf(file);
  if (JS_EXTS.includes(ext)) return "js";
  if (PY_EXTS.includes(ext)) return "py";
  return null;
}
const extOf = (file: string) => { const m = /\.[^./]+$/.exec(file); return m ? m[0].toLowerCase() : ""; };

// ---------------------------------------------------------------- reading imports

/** Removes comments (keeping line breaks) so imports inside comments are not counted. Strings are left alone. */
export function stripJsComments(text: string): string {
  let out = "", i = 0;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) { if (text[i] === "\n") out += "\n"; i++; } i += 2; continue; }
    if (c === "'" || c === "\"" || c === "`") {
      const q = c; out += c; i++;
      while (i < text.length && text[i] !== q) { if (text[i] === "\\") { out += text[i++]; } if (i < text.length) out += text[i++]; }
      if (i < text.length) out += text[i++];
      continue;
    }
    out += c; i++;
  }
  return out;
}

const JS_PATTERNS = [
  /\bimport\s+(?:type\s+)?[\w*${}\s,]+?\s+from\s*["']([^"'\n]+)["']/g, // import x from "a", import { a } from "a", import type
  /\bimport\s*["']([^"'\n]+)["']/g,                                     // import "a" (side effects)
  /\bexport\s+(?:type\s+)?[\w*${}\s,]*?\s*from\s*["']([^"'\n]+)["']/g,  // export * from "a", export { a } from "a"
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,                          // require("a")
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,                           // import("a")
];

/** The module specifiers a JS/TS/Vue/Svelte file imports, in order, without duplicates. */
export function jsImports(text: string): string[] {
  const code = stripJsComments(text);
  const found = new Set<string>();
  for (const re of JS_PATTERNS) for (const m of code.matchAll(re)) found.add(m[1].trim());
  return [...found];
}

/** Python imports as dotted names; relative ones keep their leading dots ("..models", ".utils"). */
export function pyImports(text: string): string[] {
  const found = new Set<string>();
  const code = text.replace(/("""|''')[\s\S]*?\1/g, "").replace(/#.*$/gm, "");
  for (const m of code.matchAll(/^\s*from\s+(\.*[\w.]*)\s+import\s+\(?([^)\n]*(?:\n[^)\n]*)*?)\)?\s*$/gm)) {
    const base = m[1];
    found.add(base);
    // "from pkg import mod" may import a submodule: remember the candidates too.
    for (const name of m[2].split(/[,\s]+/).map(s => s.replace(/\bas\b.*$/, "").trim()).filter(s => /^\w+$/.test(s))) {
      found.add(base.endsWith(".") ? base + name : `${base}.${name}`);
    }
  }
  for (const m of code.matchAll(/^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)\s*$/gm)) {
    for (const part of m[1].split(",")) found.add(part.trim().split(/\s+/)[0]);
  }
  return [...found].filter(Boolean);
}

export const importsOf = (file: string, text: string) => (langOf(file) === "py" ? pyImports(text) : jsImports(text));

// ---------------------------------------------------------------- resolving imports to files

export type Alias = { prefix: string; targets: string[] }; // "@/" → ["src/"], "~lib/" → ["lib/"]
export type ResolveContext = {
  files: ReadonlySet<string>;
  /** Path aliases from tsconfig/jsconfig "paths", relative to the workspace. */
  aliases: Alias[];
  /** tsconfig "baseUrl", relative to the workspace ("" for the root). */
  baseUrls: string[];
  /** Folders Python imports are resolved from: the workspace root, src/ and any folder holding a top-level package. */
  pyRoots: string[];
};

export const dirOf = (file: string) => (file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "");
export function joinPath(dir: string, rel: string): string {
  const parts = (dir ? dir.split("/") : []).concat(rel.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") { if (out.length) out.pop(); else return "\u0000"; } // escapes the workspace
    else out.push(p);
  }
  return out.join("/");
}

function tryJsFile(base: string, files: ReadonlySet<string>): string | null {
  if (files.has(base) && langOf(base)) return base;
  // ESM TypeScript imports "./a.js" for a.ts.
  const swapped = base.replace(/\.(m|c)?js$/, (_, m) => `.${m ?? ""}ts`);
  if (swapped !== base) { if (files.has(swapped)) return swapped; if (files.has(swapped + "x")) return swapped + "x"; }
  for (const ext of JS_EXTS) if (files.has(base + ext)) return base + ext;
  for (const ext of JS_EXTS) if (files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

export function resolveJs(spec: string, from: string, ctx: ResolveContext): string | null {
  if (spec.startsWith(".")) return tryJsFile(joinPath(dirOf(from), spec), ctx.files);
  if (spec.startsWith("/")) return tryJsFile(joinPath("", spec), ctx.files);
  for (const a of ctx.aliases) {
    if (spec === a.prefix.replace(/\/$/, "") || spec.startsWith(a.prefix)) {
      const rest = spec.slice(a.prefix.length);
      for (const t of a.targets) { const hit = tryJsFile(joinPath("", t + rest), ctx.files); if (hit) return hit; }
    }
  }
  for (const b of ctx.baseUrls) { const hit = tryJsFile(joinPath(b, spec), ctx.files); if (hit) return hit; }
  return null; // a package from node_modules: outside the project
}

export function resolvePy(spec: string, from: string, ctx: ResolveContext): string | null {
  const dots = /^\.*/.exec(spec)![0].length;
  const name = spec.slice(dots).replace(/\./g, "/");
  const bases: string[] = [];
  if (dots) {
    let dir = dirOf(from);
    for (let i = 1; i < dots; i++) dir = dirOf(dir);
    bases.push(dir);
  } else bases.push(...ctx.pyRoots);
  for (const base of bases) {
    const p = name ? (base ? `${base}/${name}` : name) : base;
    if (name && ctx.files.has(`${p}.py`)) return `${p}.py`;
    if (ctx.files.has(p ? `${p}/__init__.py` : "__init__.py")) return p ? `${p}/__init__.py` : "__init__.py";
  }
  return null;
}

export const resolveImport = (spec: string, from: string, ctx: ResolveContext) =>
  langOf(from) === "py" ? resolvePy(spec, from, ctx) : resolveJs(spec, from, ctx);

// ---------------------------------------------------------------- tsconfig / jsconfig

/** Parses JSON with comments and trailing commas, as tsconfig.json allows. Returns null when it can't. */
export function parseJsonc(text: string): unknown {
  try {
    const noComments = stripJsComments(text).replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(noComments);
  } catch { return null; }
}

/** Reads "baseUrl" and "paths" from a tsconfig/jsconfig at `configPath` (workspace-relative). */
export function aliasesFromTsconfig(configPath: string, text: string): { aliases: Alias[]; baseUrl: string | null } {
  const json = parseJsonc(text) as { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | null;
  const opts = json?.compilerOptions;
  if (!opts) return { aliases: [], baseUrl: null };
  const dir = dirOf(configPath);
  const baseUrl = opts.baseUrl !== undefined ? joinPath(dir, opts.baseUrl) : null;
  const root = baseUrl ?? dir;
  const aliases: Alias[] = [];
  for (const [key, targets] of Object.entries(opts.paths ?? {})) {
    if (!Array.isArray(targets)) continue;
    const prefix = key.replace(/\*$/, "");
    const t = targets.map(x => { const p = joinPath(root, x.replace(/\*$/, "")); return x.endsWith("*") && p ? `${p}/` : p; });
    aliases.push({ prefix, targets: t });
  }
  // Longest prefixes first, so "@/components/" wins over "@/".
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return { aliases, baseUrl };
}

/** Python roots: the workspace root, src/, and any folder that holds a package directly (pkg/__init__.py). */
export function pythonRoots(files: Iterable<string>): string[] {
  const packages = new Set<string>();
  for (const f of files) if (f === "__init__.py" || f.endsWith("/__init__.py")) packages.add(dirOf(f));
  const roots = new Set<string>(["", "src"]);
  // A top-level package is one whose parent folder is not a package itself; that parent is an import root.
  for (const pkg of packages) if (pkg && !packages.has(dirOf(pkg))) roots.add(dirOf(pkg));
  return [...roots];
}

// ---------------------------------------------------------------- the graph

export class Graph {
  readonly forward = new Map<string, Set<string>>();
  readonly reverse = new Map<string, Set<string>>();

  /** Replaces what `file` imports. */
  setImports(file: string, targets: Iterable<string>) {
    for (const old of this.forward.get(file) ?? []) this.reverse.get(old)?.delete(file);
    const next = new Set([...targets].filter(t => t !== file));
    this.forward.set(file, next);
    for (const t of next) { let s = this.reverse.get(t); if (!s) this.reverse.set(t, s = new Set()); s.add(file); }
  }
  remove(file: string) {
    this.setImports(file, []);
    this.forward.delete(file);
  }
  importersOf = (file: string) => this.reverse.get(file) ?? new Set<string>();
  importsOf = (file: string) => this.forward.get(file) ?? new Set<string>();
  get size() { return this.forward.size; }
}

/** Builds the whole graph from file contents. `read` returns a file's text. */
export function buildGraph(files: string[], read: (file: string) => string, ctx: ResolveContext): Graph {
  const g = new Graph();
  for (const f of files) {
    if (!langOf(f)) continue;
    let text = "";
    try { text = read(f); } catch { /* unreadable: no imports */ }
    g.setImports(f, resolveAll(f, text, ctx));
  }
  return g;
}
/** The files whose imports would point at `missing` if it existed: who imported a file that was deleted. */
export function importersOfMissing(missing: string, specs: ReadonlyMap<string, string[]>, ctx: ResolveContext): string[] {
  const withIt: ResolveContext = { ...ctx, files: new Set([...ctx.files, missing]) };
  const out: string[] = [];
  for (const [file, list] of specs) if (file !== missing && list.some(s => resolveImport(s, file, withIt) === missing)) out.push(file);
  return out;
}

export function resolveAll(file: string, text: string, ctx: ResolveContext): string[] {
  const out = new Set<string>();
  for (const spec of importsOf(file, text)) { const hit = resolveImport(spec, file, ctx); if (hit) out.add(hit); }
  return [...out];
}

// ---------------------------------------------------------------- blast radius

export type Hit = { file: string; depth: number; via: string | null; kind: Kind };
export type Radius = {
  changed: string[];
  hits: Hit[];            // everything affected, changed files first, then by depth
  byKind: Record<Kind, Hit[]>;
  truncated: boolean;     // stopped at maxDepth with more to go
};

/**
 * Everything that depends on `changed`, breadth first. `extraImporters` adds importers the graph can't know about,
 * such as the files that still import a file you deleted.
 */
export function blastRadius(graph: Graph, changed: string[], maxDepth = 8, extraImporters?: (file: string) => Iterable<string>): Radius {
  const seen = new Map<string, Hit>();
  const queue: string[] = [];
  let truncated = false;
  for (const f of changed) { seen.set(f, { file: f, depth: 0, via: null, kind: "changed" }); queue.push(f); }
  while (queue.length) {
    const f = queue.shift()!;
    const d = seen.get(f)!.depth;
    const importers = new Set(graph.importersOf(f));
    if (extraImporters) for (const x of extraImporters(f)) importers.add(x);
    for (const importer of importers) {
      if (seen.has(importer)) continue;
      if (d + 1 > maxDepth) { truncated = true; continue; }
      seen.set(importer, { file: importer, depth: d + 1, via: f, kind: classify(importer) });
      queue.push(importer);
    }
  }
  const hits = [...seen.values()].sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file));
  const byKind: Record<Kind, Hit[]> = { changed: [], test: [], route: [], component: [], config: [], source: [] };
  for (const h of hits) byKind[h.kind].push(h);
  // A changed test file is still a test to run.
  for (const f of changed) if (classify(f) === "test") byKind.test.unshift({ file: f, depth: 0, via: null, kind: "test" });
  return { changed, hits, byKind, truncated };
}

/** The chain of imports from a changed file to `file`, e.g. ["src/db.ts", "src/users.ts", "app/page.tsx"]. */
export function pathTo(radius: Radius, file: string): string[] {
  const byFile = new Map(radius.hits.map(h => [h.file, h]));
  const chain: string[] = [];
  let cur: Hit | undefined = byFile.get(file);
  while (cur) { chain.unshift(cur.file); cur = cur.via ? byFile.get(cur.via) : undefined; }
  return chain;
}

// ---------------------------------------------------------------- what kind of file is it

const TEST_RE = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec|e2e)\.[^./]+$|(^|\/)test_[^/]+\.py$|_test\.py$|(^|\/)conftest\.py$/i;
const ROUTE_RE = /(^|\/)(app|pages|routes|api|views|controllers|endpoints|handlers)\/|(^|\/)(page|layout|route|loader|\+page|\+layout|\+server)\.[^./]+$|(^|\/)(urls|views|routes|api)\.py$/i;
const COMPONENT_RE = /(^|\/)(components?|ui|widgets|layouts)\/|\.(vue|svelte|astro)$|(^|\/)[A-Z][A-Za-z0-9]*\.(tsx|jsx)$/;
const CONFIG_RE = /(^|\/)[^/]*\.config\.[^./]+$|(^|\/)(settings|config|conftest)\.py$|(^|\/)(middleware|proxy|instrumentation)\.[^./]+$/i;

export function classify(file: string): Exclude<Kind, "changed"> {
  if (TEST_RE.test(file)) return "test";
  if (CONFIG_RE.test(file)) return "config";
  if (ROUTE_RE.test(file)) return "route";
  if (COMPONENT_RE.test(file)) return "component";
  return "source";
}

export const KIND_LABEL: Record<Kind, string> = {
  changed: "Changed", test: "Tests to run", route: "Routes, pages & APIs", component: "Components", config: "Config & middleware", source: "Other code",
};

// ---------------------------------------------------------------- running the affected tests

export type Runner = { name: string; command: (tests: string[]) => string };

const q = (f: string) => (/^[\w./@-]+$/.test(f) ? f : `"${f.replace(/"/g, "\\\"")}"`);

/** Picks the test runner from package.json (and Python files), so "Run Affected Tests" runs the right thing. */
export function detectRunner(packageJson: string | null, hasPython: boolean, tests: string[]): Runner | null {
  const py = tests.length > 0 && tests.every(t => t.endsWith(".py"));
  if (py || (hasPython && !packageJson)) return { name: "pytest", command: t => `python -m pytest ${t.map(q).join(" ")}` };
  const pkg = (packageJson ? parseJsonc(packageJson) : null) as { scripts?: Record<string, string>; devDependencies?: Record<string, string>; dependencies?: Record<string, string> } | null;
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const testScript = pkg.scripts?.test ?? "";
  if (deps.vitest || /\bvitest\b/.test(testScript)) return { name: "Vitest", command: t => `npx vitest run ${t.map(q).join(" ")}` };
  if (deps.jest || /\bjest\b/.test(testScript)) return { name: "Jest", command: t => `npx jest --runTestsByPath ${t.map(q).join(" ")}` };
  if (deps.mocha || /\bmocha\b/.test(testScript)) return { name: "Mocha", command: t => `npx mocha ${t.map(q).join(" ")}` };
  if (deps["@playwright/test"] || /playwright test/.test(testScript)) return { name: "Playwright", command: t => `npx playwright test ${t.map(q).join(" ")}` };
  if (/node\s+--test/.test(testScript)) return { name: "node --test", command: t => `node --test ${t.map(q).join(" ")}` };
  return null;
}

// ---------------------------------------------------------------- report

/** A Markdown impact report, ready for a pull request description. */
export function markdownReport(radius: Radius, runner: Runner | null): string {
  const lines = ["## Blast radius", ""];
  const n = radius.hits.length - radius.changed.length;
  lines.push(`**${radius.changed.length}** changed file${radius.changed.length === 1 ? "" : "s"} can affect **${n}** other file${n === 1 ? "" : "s"}.`, "");
  for (const kind of ["changed", "test", "route", "component", "config", "source"] as Kind[]) {
    const list = radius.byKind[kind];
    if (!list.length) continue;
    lines.push(`### ${KIND_LABEL[kind]} (${list.length})`, "");
    for (const h of list.slice(0, 50)) lines.push(`- \`${h.file}\`${h.depth ? ` (${h.depth} hop${h.depth === 1 ? "" : "s"}, via \`${h.via}\`)` : ""}`);
    if (list.length > 50) lines.push(`- …and ${list.length - 50} more`);
    lines.push("");
  }
  if (runner && radius.byKind.test.length) lines.push("Run the affected tests:", "", "```", runner.command([...new Set(radius.byKind.test.map(h => h.file))]), "```", "");
  if (radius.truncated) lines.push("_Some dependents are further away than the depth limit and are not listed._", "");
  lines.push("_Made with [Veyra Blast Radius](https://veyraeditor.com/blast-radius)._");
  return lines.join("\n");
}

// ---------------------------------------------------------------- git

/** Parses `git status --porcelain=v1 -z` into changed file paths (renames give the new path; deletions included). */
export function parseGitStatus(z: string): string[] {
  const out: string[] = [];
  const parts = z.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2), file = entry.slice(3);
    if (code.includes("R") || code.includes("C")) i++; // the next part is the old path
    if (code === "!!") continue;
    out.push(file.replace(/\\/g, "/"));
  }
  return [...new Set(out)];
}
