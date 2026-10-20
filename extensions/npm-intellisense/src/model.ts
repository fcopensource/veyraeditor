// The parts of Veyra npm IntelliSense that do not need VS Code: finding imports, reading package.json,
// working out what a module specifier refers to, and choosing package-manager commands. Unit-tested.

export type DepKind = "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
export const DEP_KINDS: DepKind[] = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
export const KIND_LABEL: Record<DepKind, string> = {
  dependencies: "dependency", devDependencies: "dev dependency", peerDependencies: "peer dependency", optionalDependencies: "optional dependency",
};

export interface Dependency { name: string; version: string; kind: DepKind; manifest: string }
export interface Manifest { path: string; name?: string; deps: Dependency[]; scripts: string; packageManager?: string; workspaces: boolean }

/** JSON with comments and trailing commas, as tsconfig.json and jsconfig.json allow. Returns null if unreadable. */
export function parseJsonc(text: string): any {
  let out = "", i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      out += text.slice(start, ++i);
    } else if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; }
    else if (c === "/" && text[i + 1] === "*") { i = text.indexOf("*/", i + 2); i = i < 0 ? text.length : i + 2; }
    else { out += c; i++; }
  }
  try { return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")); } catch { return null; }
}

/** The dependencies, scripts and settings of one package.json. */
export function readManifest(text: string, path: string): Manifest | null {
  const json = parseJsonc(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const deps: Dependency[] = [];
  for (const kind of DEP_KINDS) {
    const list = json[kind];
    if (list && typeof list === "object") for (const [name, version] of Object.entries(list)) {
      if (!deps.some(d => d.name === name)) deps.push({ name, version: String(version), kind, manifest: path });
    }
  }
  return {
    path, name: typeof json.name === "string" ? json.name : undefined, deps,
    scripts: json.scripts && typeof json.scripts === "object" ? Object.values(json.scripts).join("\n") : "",
    packageManager: typeof json.packageManager === "string" ? json.packageManager : undefined,
    workspaces: Boolean(json.workspaces),
  };
}

/** Dependencies of the nearest package.json first, then of its parents (a monorepo root), without repeats. */
export function mergeDependencies(manifests: Manifest[]): Dependency[] {
  const seen = new Set<string>(), all: Dependency[] = [];
  for (const manifest of manifests) for (const dep of manifest.deps) if (!seen.has(dep.name)) { seen.add(dep.name); all.push(dep); }
  return all;
}

// ---------- Module specifiers ----------

const NAME = /^(?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*$/i;
/** The package a bare specifier belongs to: "@scope/pkg/sub" → "@scope/pkg", "lodash/fp" → "lodash". */
export function packageNameOf(spec: string): string | null {
  if (!spec || /^[./]|^[a-z]:[\\/]|^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return NAME.test(name) && (!spec.startsWith("@") || parts.length >= 2) ? name : null;
}
/** The part after the package name: "next/navigation" → "navigation". */
export const subpathOf = (spec: string) => { const name = packageNameOf(spec); return name ? spec.slice(name.length + 1) : ""; };

/** Aliases that look like packages but are not: @/, ~/, #imports, virtual modules and framework modules. */
export const DEFAULT_IGNORE = ["@/", "~/", "#", "virtual:", "$app/", "$lib", "$env/", "$service-worker", "astro:", "bun:", "cloudflare:", "~icons/", "uno.css", "virtual-"];

/** Alias prefixes from tsconfig/jsconfig "paths", e.g. {"@app/*": [...]} → "@app/". */
export function aliasPrefixes(tsconfig: any): string[] {
  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") return [];
  return Object.keys(paths).map(key => key.replace(/\*.*$/, "")).filter(Boolean);
}

export type SpecifierKind = "relative" | "builtin" | "ignored" | "package" | "other";
export function classify(spec: string, builtins: Set<string>, ignore: string[]): SpecifierKind {
  if (/^\.{1,2}(\/|$)|^\//.test(spec)) return "relative";
  if (spec.startsWith("node:") || builtins.has(spec)) return "builtin";
  if (ignore.some(prefix => spec === prefix || spec.startsWith(prefix))) return "ignored";
  return packageNameOf(spec) ? "package" : "other";
}

// ---------- Finding imports ----------

/**
 * The source with comments blanked out and the inside of every string replaced by a placeholder, keeping
 * the quotes and the length, so offsets still match. Text inside strings then cannot look like code,
 * while a module name's position is still found and read back from the original text.
 */
export function maskSource(text: string): string {
  const out = text.split("");
  let i = 0;
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      const start = ++i;
      while (i < text.length && text[i] !== c && !(c !== "`" && text[i] === "\n")) i += text[i] === "\\" ? 2 : 1;
      for (let k = start; k < Math.min(i, text.length); k++) if (out[k] !== "\n") out[k] = "\u0001";
      i++;
    } else if (c === "/" && text[i + 1] === "/") { const end = text.indexOf("\n", i); blank(i, end < 0 ? text.length : end); i = end < 0 ? text.length : end; }
    else if (c === "/" && text[i + 1] === "*") { const close = text.indexOf("*/", i + 2), end = close < 0 ? text.length : close + 2; blank(i, end); i = end; }
    else i++;
  }
  return out.join("");
}

export interface FoundImport { spec: string; start: number; end: number }
const IMPORT = /(?:\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s*)?|\bexport\s+(?:type\s+)?(?:[\w$*{}\s,]*?\s*)from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\b(?:jest|vi)\.(?:mock|doMock|requireActual|importActual)\s*\(\s*)(['"])([^'"\n]+)\1/g;
/** Every module specifier in a file: import, export … from, import(), require() and test mocks. Offsets point at the text inside the quotes. */
export function findImports(text: string): FoundImport[] {
  const found: FoundImport[] = [];
  for (const match of maskSource(text).matchAll(IMPORT)) {
    const start = match.index! + match[0].length - match[2].length - 1;
    found.push({ spec: text.slice(start, start + match[2].length), start, end: start + match[2].length });
  }
  return found;
}

// For files like .vue, .svelte and .astro, only the script parts are code.
export function scriptRanges(text: string, languageId: string): { start: number; end: number }[] {
  if (languageId === "astro") { const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/); return m ? [{ start: 4, end: 4 + m[1].length }] : []; }
  if (languageId !== "vue" && languageId !== "svelte") return [{ start: 0, end: text.length }];
  const ranges: { start: number; end: number }[] = [];
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) { const start = m.index! + m[0].indexOf(">") + 1; ranges.push({ start, end: start + m[1].length }); }
  return ranges;
}
export function findImportsIn(text: string, languageId: string): FoundImport[] {
  return scriptRanges(text, languageId).flatMap(r => findImports(text.slice(r.start, r.end)).map(f => ({ ...f, start: f.start + r.start, end: f.end + r.start })));
}

/** If the cursor sits inside the module string of an import, the text typed so far and where the string's content starts and ends. */
export interface ImportContext { prefix: string; start: number; end: number }
const BEFORE = /(?:\bfrom|\bimport\s*\(?|\brequire\s*\(|\b(?:jest|vi)\.(?:mock|doMock|requireActual|importActual)\s*\()\s*(['"`])([^'"`\\]*)$/;
export function importContextAt(line: string, column: number): ImportContext | null {
  const match = line.slice(0, column).match(BEFORE);
  if (!match) return null;
  const quote = match[1], start = column - match[2].length;
  const close = line.indexOf(quote, column);
  return { prefix: match[2], start, end: close < 0 ? column : close };
}

// ---------- Checks ----------

/** The DefinitelyTyped package for a package: "express" → "@types/express", "@scope/pkg" → "@types/scope__pkg". */
export const typesPackage = (pkg: string) => `@types/${pkg.startsWith("@") ? pkg.slice(1).replace("/", "__") : pkg}`;

export interface Problem { spec: string; pkg: string; start: number; end: number; code: "missing" | "transitive" | "not-installed" }
/**
 * Imports whose package is not in package.json ("missing"; "transitive" when it only works because another
 * package installed it), and declared packages that are not installed ("not-installed").
 */
export function checkImports(imports: FoundImport[], o: { declared: Set<string>; self?: string; installed: (pkg: string) => boolean; builtins: Set<string>; ignore: string[] }): Problem[] {
  const problems: Problem[] = [];
  for (const found of imports) {
    if (classify(found.spec, o.builtins, o.ignore) !== "package") continue;
    const pkg = packageNameOf(found.spec)!;
    if (pkg === o.self) continue;
    // Modules the runtime provides, like "vscode" in a VS Code extension, are declared only as @types/….
    if (!o.declared.has(pkg) && o.declared.has(typesPackage(pkg))) continue;
    if (!o.declared.has(pkg)) {
      problems.push({ ...found, pkg, code: o.installed(pkg) ? "transitive" : "missing" });
    } else if (!o.installed(pkg)) problems.push({ ...found, pkg, code: "not-installed" });
  }
  return problems;
}

/** Tools that are used from scripts or config, not imported: never reported as unused. */
const TOOLING = /^(typescript|tslib|eslint|prettier|vite|vitest|jest|ts-node|tsx|nodemon|husky|lint-staged|tailwindcss|postcss|autoprefixer|sass|less|concurrently|rimraf|cross-env|npm-run-all2?|webpack|webpack-cli|rollup|esbuild|turbo|nx|lerna|@biomejs\/biome|biome|stylelint|commitizen|semantic-release|patch-package|dotenv-cli|serve|http-server|wrangler|vercel|netlify-cli|playwright|@playwright\/test|cypress|electron|electron-builder|@tauri-apps\/cli|@vscode\/vsce|vsce|@vscode\/test-electron|next|nuxt|astro|@sveltejs\/kit|svelte-check|vue-tsc|@angular\/cli|@angular-devkit\/build-angular|react-scripts|expo|gatsby)$|^(eslint-|@eslint\/|@typescript-eslint\/|prettier-|@vitejs\/|vite-plugin-|@tailwindcss\/|postcss-|@babel\/|babel-|@types\/|@commitlint\/|@storybook\/|@testing-library\/jest-dom$)/;

export interface Unused { dep: Dependency; reason: string }
/** Declared dependencies that no source file imports. Build tools, @types and anything named in scripts are skipped. */
export function unusedDependencies(manifest: Manifest, used: Set<string>): Unused[] {
  const unused: Unused[] = [];
  for (const dep of manifest.deps) {
    if (dep.kind === "peerDependencies" || used.has(dep.name) || TOOLING.test(dep.name)) continue;
    const bin = dep.name.replace(/^@[^/]+\//, "");
    if (new RegExp(`(^|[\\s/"'&|;(])(${escape(dep.name)}|${escape(bin)})([\\s"'&|;)]|$)`).test(manifest.scripts)) continue;
    unused.push({ dep, reason: dep.kind === "devDependencies" ? "not imported; check it is not used by a tool's config" : "not imported anywhere" });
  }
  return unused;
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- Package managers ----------

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
/** From package.json's "packageManager" field, else the lockfile next to it. */
export function detectPackageManager(files: string[], packageManagerField?: string): PackageManager {
  const field = packageManagerField?.split("@")[0];
  if (field === "pnpm" || field === "yarn" || field === "bun" || field === "npm") return field;
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  return "npm";
}
const quoteArg = (name: string) => (/^[@\w./~^-]+$/.test(name) ? name : `"${name.replace(/"/g, "")}"`);
export function installCommand(pm: PackageManager, packages: string[], dev = false): string {
  const names = packages.map(quoteArg).join(" ");
  if (!names) return pm === "yarn" ? "yarn install" : `${pm} install`;
  if (pm === "npm") return `npm install ${dev ? "--save-dev " : ""}${names}`;
  if (pm === "bun") return `bun add ${dev ? "--dev " : ""}${names}`;
  return `${pm} add ${dev ? "-D " : ""}${names}`;
}
export function uninstallCommand(pm: PackageManager, packages: string[]): string {
  const names = packages.map(quoteArg).join(" ");
  return pm === "npm" ? `npm uninstall ${names}` : `${pm} remove ${names}`;
}

// ---------- Package details ----------

/** Subpaths a package exports, from its package.json "exports": {"./client": …} → ["client"]. */
export function exportedSubpaths(pkg: any): string[] {
  const exports = pkg?.exports;
  if (!exports || typeof exports !== "object" || Array.isArray(exports)) return [];
  return Object.keys(exports).filter(key => key.startsWith("./") && !key.includes("*")).map(key => key.slice(2)).filter(Boolean).sort();
}

/** A name for a package's default import: "@tanstack/react-query" → reactQuery, "lodash.debounce" → lodashDebounce. */
export function importName(spec: string): string {
  const last = (packageNameOf(spec) ?? spec).replace(/^@[^/]+\//, "").replace(/^node:/, "");
  const sub = subpathOf(spec).split("/").pop();
  const base = (sub || last).replace(/\.[cm]?[jt]sx?$/, "");
  const words = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  let name = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("") || "module";
  if (/^\d/.test(name)) name = "_" + name;
  return RESERVED.has(name) ? name + "Module" : name;
}
const RESERVED = new Set(["break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "enum", "await", "implements", "package", "protected", "interface", "private", "public"]);

/** Whether a file is written with require() (CommonJS) rather than import. */
export function usesRequire(text: string, fileName: string): boolean {
  if (/\.cjs$/.test(fileName)) return true;
  if (/\.(mjs|mts|ts|tsx|jsx|vue|svelte|astro)$/.test(fileName)) return false;
  const code = maskSource(text);
  return /\brequire\s*\(/.test(code) && !/^\s*(import|export)\s/m.test(code);
}
/** Whether a file already writes built-ins as "node:fs". */
export const usesNodeProtocol = (text: string) => /(['"])node:[a-z_/]+\1/.test(text);

/** The line after the last top-level import or require, where a new one goes (0-based). */
export function importInsertLine(text: string): number {
  const lines = text.split(/\r?\n/);
  let last = -1, inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inBlock) { if (/\bfrom\s*['"]|^\s*\}?\s*from\b|['"];?\s*$/.test(line)) { inBlock = false; last = i; } continue; }
    if (/^\s*(['"]use (strict|client|server)['"];?|#!)/.test(line) && last === -1) { last = i; continue; }
    if (/^\s*import\b/.test(line) || /^\s*(const|let|var)\s+[\w${}\s,:]+=\s*require\s*\(/.test(line)) {
      last = i;
      if (/^\s*import\s*(type\s+)?\{[^}]*$/.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() && !/^\s*(\/\/|\/\*|\*)/.test(line)) break;
  }
  return last + 1;
}
