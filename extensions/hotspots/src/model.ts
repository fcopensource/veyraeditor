// Veyra Hotspots: the engine. Pure TypeScript with no VS Code or DOM dependency, unit-tested with node --test.
//
// A hotspot is code that is both complicated and changed often: that is where bugs, slow reviews and surprises
// concentrate. We read the project's own git history (how often each file changed, who changed it, what changed
// with it) and each file's shape today (lines of code, how deeply it is indented), and rank every file.

// ------------------------------------------------------------------------------------------------ git history

export type FileChange = { path: string; added: number; deleted: number };
export type Commit = { hash: string; time: number; author: string; email: string; files: FileChange[] };

/** The `git log` format parseGitLog reads: a record separator, then hash, unix time, author and email. */
export const GIT_LOG_FORMAT = "%x1e%H%x1f%at%x1f%an%x1f%ae";

/** Parses `git log --numstat --format=<GIT_LOG_FORMAT>`. Binary files ("-\t-") count as one changed line. */
export function parseGitLog(text: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of text.split("\x1e")) {
    if (!record.trim()) continue;
    const nl = record.indexOf("\n");
    const head = (nl < 0 ? record : record.slice(0, nl)).split("\x1f");
    if (head.length < 4) continue;
    const files: FileChange[] = [];
    for (const line of (nl < 0 ? "" : record.slice(nl + 1)).split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trimEnd());
      if (!m) continue;
      files.push({ path: unquote(m[3]), added: m[1] === "-" ? 1 : +m[1], deleted: m[2] === "-" ? 0 : +m[2] });
    }
    commits.push({ hash: head[0].trim(), time: +head[1] * 1000, author: head[2], email: head[3].trim().toLowerCase(), files });
  }
  return commits;
}

/** git quotes unusual paths: "src/\303\251t\303\251.ts" → src/été.ts. */
function unquote(p: string): string {
  if (!(p.startsWith("\"") && p.endsWith("\""))) return p;
  const bytes: number[] = [];
  const body = p.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) {
      const n = body[i + 1];
      if (/[0-7]/.test(n)) { bytes.push(parseInt(body.slice(i + 1, i + 4), 8)); i += 3; continue; }
      bytes.push(({ n: 10, t: 9, "\"": 34, "\\": 92 } as Record<string, number>)[n] ?? n.charCodeAt(0)); i++; continue;
    }
    bytes.push(...new TextEncoder().encode(c));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ------------------------------------------------------------------------------------------------ the shape of a file

export type Shape = { loc: number; complexity: number; maxDepth: number };

const COMMENT_LINE = /^\s*(\/\/|#(?!include|define|if|pragma|region|endregion)|\*|\/\*|<!--|--(?!-)|;|%|')/;

/**
 * Lines of code and "indentation complexity": the sum of every code line's indentation depth. Deeply nested code
 * (ifs inside loops inside callbacks) is harder to change safely, and indentation measures it the same way in any
 * language. The indentation unit is detected per file (2 spaces, 4 spaces or tabs).
 */
export function measure(text: string): Shape {
  const lines = text.split(/\r?\n/);
  const indents: number[] = [];
  let unit = 0;
  for (const line of lines) {
    if (!line.trim() || COMMENT_LINE.test(line)) { indents.push(-1); continue; }
    const ws = /^[ \t]*/.exec(line)![0];
    const width = ws.replace(/\t/g, "    ").length;
    indents.push(width);
    if (width > 0 && (unit === 0 || width < unit)) unit = width;
  }
  unit = unit >= 2 && unit <= 8 ? unit : unit === 1 ? 1 : 4;
  let loc = 0, complexity = 0, maxDepth = 0;
  for (const w of indents) {
    if (w < 0) continue;
    loc++;
    const depth = Math.round(w / unit);
    complexity += depth;
    if (depth > maxDepth) maxDepth = depth;
  }
  return { loc, complexity, maxDepth };
}

// ------------------------------------------------------------------------------------------------ statistics

export type Author = { name: string; email: string; changes: number; commits: number; last: number };
export type FileStat = {
  path: string;
  commits: number;          // revisions in the period
  churn: number;            // lines added + deleted in the period
  loc: number;
  complexity: number;
  maxDepth: number;
  lastChange: number | null;   // ms; null if not changed in the period
  firstChange: number | null;
  authors: Author[];        // most changes first
  mainShare: number;        // 0..1, how much of the churn is the main author's
  score: number;            // hotspot score 0..1
  rank: number;             // 1 = hottest; 0 = not ranked (never changed)
  knowledge: "shared" | "single" | "lost"; // lost: one person wrote it and has not committed for a long time
};
export type Coupling = { a: string; b: string; shared: number; degree: number };
export type Analysis = {
  files: FileStat[];        // every current file with a shape, hottest first
  byPath: Map<string, FileStat>;
  coupling: Coupling[];     // strongest first
  commits: number;          // commits in the period
  authors: number;
  since: number | null;     // ms, start of the period
  until: number;
  maxCommits: number;
  maxComplexity: number;
};

export type AnalyzeOptions = {
  now: number;
  /** Start of the period in ms, or null for all history. */
  since: number | null;
  /** Ignore commits touching more files than this when measuring coupling (mass renames, formatting runs). */
  maxFilesPerCommit?: number;
  /** A pair must share at least this many commits to count as coupled. */
  minShared?: number;
  /** ...and change together at least this often (0..1). */
  minDegree?: number;
  /** An author who hasn't committed for this long has "left" (ms). */
  inactiveAfter?: number;
};

export const DAY = 86_400_000;

/** Combines history and shapes into ranked files, coupling and knowledge. `shapes` has every current file. */
export function analyze(commits: Commit[], shapes: ReadonlyMap<string, Shape>, opt: AnalyzeOptions): Analysis {
  const maxFiles = opt.maxFilesPerCommit ?? 40, minShared = opt.minShared ?? 4, minDegree = opt.minDegree ?? 0.4;
  const inactiveAfter = opt.inactiveAfter ?? 180 * DAY;
  const inPeriod = commits.filter(c => opt.since === null || c.time >= opt.since);

  // Each author's latest commit anywhere in the history we have, to know who is still around.
  const lastSeen = new Map<string, number>();
  for (const c of commits) lastSeen.set(c.email, Math.max(lastSeen.get(c.email) ?? 0, c.time));

  type Acc = { commits: number; churn: number; last: number; first: number; authors: Map<string, Author> };
  const acc = new Map<string, Acc>();
  const pair = new Map<string, number>();
  const people = new Set<string>();
  for (const c of inPeriod) {
    people.add(c.email);
    const current = c.files.filter(f => shapes.has(f.path));
    for (const f of current) {
      let a = acc.get(f.path);
      if (!a) acc.set(f.path, a = { commits: 0, churn: 0, last: 0, first: Infinity, authors: new Map() });
      a.commits++; a.churn += f.added + f.deleted;
      a.last = Math.max(a.last, c.time); a.first = Math.min(a.first, c.time);
      let au = a.authors.get(c.email);
      if (!au) a.authors.set(c.email, au = { name: c.author, email: c.email, changes: 0, commits: 0, last: 0 });
      au.changes += f.added + f.deleted; au.commits++; au.last = Math.max(au.last, c.time);
    }
    if (current.length >= 2 && current.length <= maxFiles) {
      const paths = [...new Set(current.map(f => f.path))].sort();
      for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
        const k = paths[i] + "\0" + paths[j];
        pair.set(k, (pair.get(k) ?? 0) + 1);
      }
    }
  }

  let maxCommits = 0, maxComplexity = 0;
  for (const a of acc.values()) maxCommits = Math.max(maxCommits, a.commits);
  for (const s of shapes.values()) maxComplexity = Math.max(maxComplexity, s.complexity || s.loc);

  const files: FileStat[] = [];
  for (const [path, shape] of shapes) {
    const a = acc.get(path);
    const authors = a ? [...a.authors.values()].sort((x, y) => y.changes - x.changes || y.commits - x.commits) : [];
    const total = authors.reduce((n, x) => n + x.changes, 0);
    const mainShare = authors.length ? (total ? authors[0].changes / total : 1) : 0;
    const main = authors[0];
    const knowledge: FileStat["knowledge"] = !main || authors.length > 1 && mainShare < 0.8 ? "shared"
      : opt.now - (lastSeen.get(main.email) ?? 0) > inactiveAfter ? "lost" : "single";
    files.push({
      path, commits: a?.commits ?? 0, churn: a?.churn ?? 0, loc: shape.loc, complexity: shape.complexity, maxDepth: shape.maxDepth,
      lastChange: a ? a.last : null, firstChange: a ? a.first : null, authors, mainShare, knowledge,
      score: hotspotScore(a?.commits ?? 0, shape.complexity || shape.loc, maxCommits, maxComplexity), rank: 0,
    });
  }
  files.sort((x, y) => y.score - x.score || y.commits - x.commits || x.path.localeCompare(y.path));
  let rank = 0;
  for (const f of files) f.rank = f.commits > 0 && f.score > 0 ? ++rank : 0;

  const byPath = new Map(files.map(f => [f.path, f]));
  const coupling: Coupling[] = [];
  for (const [k, shared] of pair) {
    if (shared < minShared) continue;
    const [a, b] = k.split("\0");
    const ra = byPath.get(a)!.commits, rb = byPath.get(b)!.commits;
    const degree = shared / ((ra + rb) / 2);
    if (degree >= minDegree) coupling.push({ a, b, shared, degree: Math.min(1, degree) });
  }
  coupling.sort((x, y) => y.degree * y.shared - x.degree * x.shared || y.shared - x.shared);

  return { files, byPath, coupling, commits: inPeriod.length, authors: people.size, since: opt.since, until: opt.now, maxCommits, maxComplexity };
}

/** 0..1: how often it changes times how complex it is, each on a log scale so one monster file doesn't flatten the rest. */
export function hotspotScore(commits: number, complexity: number, maxCommits: number, maxComplexity: number): number {
  if (!commits || !maxCommits || !maxComplexity) return 0;
  const c = Math.log1p(commits) / Math.log1p(maxCommits);
  const x = Math.log1p(Math.max(0, complexity)) / Math.log1p(maxComplexity);
  return Math.round(c * x * 1000) / 1000;
}

export type Level = "critical" | "high" | "medium" | "low" | "none";
export function level(score: number): Level {
  return score >= 0.6 ? "critical" : score >= 0.4 ? "high" : score >= 0.2 ? "medium" : score > 0 ? "low" : "none";
}
export const LEVEL_LABEL: Record<Level, string> = { critical: "Critical hotspot", high: "Hotspot", medium: "Warm", low: "Cool", none: "Not changed" };

/** The files that most often change together with `path`. */
export function coupledWith(analysis: Analysis, path: string): { path: string; shared: number; degree: number }[] {
  return analysis.coupling.filter(c => c.a === path || c.b === path)
    .map(c => ({ path: c.a === path ? c.b : c.a, shared: c.shared, degree: c.degree }));
}

// ------------------------------------------------------------------------------------------------ colours

export type ColorMode = "hotspot" | "churn" | "complexity" | "age" | "knowledge";
export const COLOR_MODES: { id: ColorMode; label: string; hint: string }[] = [
  { id: "hotspot", label: "Hotspots", hint: "Changed often and complex: where bugs live" },
  { id: "churn", label: "Change frequency", hint: "How many commits touched the file" },
  { id: "complexity", label: "Complexity", hint: "How deeply nested the code is" },
  { id: "age", label: "Code age", hint: "How long since it last changed" },
  { id: "knowledge", label: "Knowledge risk", hint: "Files only one person knows" },
];

/** The value a colour mode shows, 0..1 (higher = more attention needed), or -1 for "no data". */
export function modeValue(f: FileStat, mode: ColorMode, a: Pick<Analysis, "maxCommits" | "maxComplexity" | "until" | "since">): number {
  switch (mode) {
    case "hotspot": return f.commits ? f.score : -1;
    case "churn": return f.commits && a.maxCommits ? Math.log1p(f.commits) / Math.log1p(a.maxCommits) : -1;
    case "complexity": return a.maxComplexity ? Math.log1p(f.complexity || f.loc) / Math.log1p(a.maxComplexity) : 0;
    case "age": {
      if (f.lastChange === null) return 1;
      const span = Math.max(DAY, a.until - (a.since ?? (a.until - 730 * DAY)));
      return Math.min(1, (a.until - f.lastChange) / span);
    }
    case "knowledge": return !f.commits ? -1 : f.knowledge === "lost" ? 1 : f.knowledge === "single" ? 0.6 : Math.max(0, (f.mainShare - 0.4) * 0.8);
  }
}

const STOPS = [[0, [38, 52, 74]], [0.3, [47, 90, 122]], [0.52, [122, 90, 168]], [0.76, [255, 122, 61]], [1, [255, 61, 98]]] as const;
/** Cool slate → blue → violet → orange → hot coral. -1 (no data) is a quiet grey. */
export function heatColor(v: number): string {
  if (v < 0) return "#3a3d46";
  const t = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k));
      return `#${c.map(x => x.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return "#ff3d62";
}

// ------------------------------------------------------------------------------------------------ treemap

export type TreeNode = { name: string; path: string; size: number; children?: TreeNode[] };
export type Rect = { path: string; name: string; x: number; y: number; w: number; h: number; dir: boolean; depth: number };

/** Folder tree with sizes summed from the files (size = lines of code, at least 1). */
export function buildTree(files: { path: string; loc: number }[]): TreeNode {
  const root: TreeNode = { name: "", path: "", size: 0, children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join("/");
      let child = node.children!.find(c => c.children && c.name === parts[i]);
      if (!child) node.children!.push(child = { name: parts[i], path: p, size: 0, children: [] });
      node = child;
    }
    node.children!.push({ name: parts[parts.length - 1], path: f.path, size: Math.max(1, f.loc) });
  }
  const sum = (n: TreeNode): number => (n.children ? (n.size = n.children.reduce((s, c) => s + sum(c), 0)) : n.size);
  sum(root);
  // A folder with a single sub-folder is shown as one ("src/lib"), like most file trees.
  const compact = (n: TreeNode): TreeNode => {
    if (!n.children) return n;
    n.children = n.children.map(compact);
    if (n.path && n.children.length === 1 && n.children[0].children) {
      const only = n.children[0];
      return { ...only, name: `${n.name}/${only.name}` };
    }
    return n;
  };
  return compact(root);
}

/** Squarified treemap (Bruls, Huizing, van Wijk). Folders get a header strip when there's room for a label. */
export function layoutTreemap(root: TreeNode, width: number, height: number, header = 16, pad = 2): Rect[] {
  const out: Rect[] = [];
  const place = (node: TreeNode, x: number, y: number, w: number, h: number, depth: number) => {
    if (w < 1 || h < 1) return;
    if (!node.children) { out.push({ path: node.path, name: node.name, x, y, w, h, dir: false, depth }); return; }
    let ix = x, iy = y, iw = w, ih = h;
    if (node.path) {
      out.push({ path: node.path, name: node.name, x, y, w, h, dir: true, depth });
      const showHeader = w > 44 && h > header * 2;
      ix += pad; iw -= pad * 2; iy += showHeader ? header : pad; ih -= (showHeader ? header : pad) + pad;
      if (iw < 1 || ih < 1) return;
    }
    const kids = node.children.filter(c => c.size > 0).sort((a, b) => b.size - a.size);
    const total = kids.reduce((s, c) => s + c.size, 0);
    if (!total) return;
    const scale = (iw * ih) / total;
    squarify(kids.map(c => ({ node: c, area: c.size * scale })), ix, iy, iw, ih, (n, rx, ry, rw, rh) => place(n, rx, ry, rw, rh, depth + 1));
  };
  place(root, 0, 0, width, height, 0);
  return out;
}

type Item = { node: TreeNode; area: number };
function squarify(items: Item[], x: number, y: number, w: number, h: number, emit: (n: TreeNode, x: number, y: number, w: number, h: number) => void) {
  let i = 0;
  while (i < items.length) {
    const short = Math.min(w, h);
    const row: Item[] = [items[i]];
    let worst = worstRatio(row, short);
    let j = i + 1;
    while (j < items.length) {
      const next = worstRatio([...row, items[j]], short);
      if (next > worst) break;
      row.push(items[j]); worst = next; j++;
    }
    const rowArea = row.reduce((s, r) => s + r.area, 0);
    if (w >= h) {
      const rw = rowArea / h;
      let ry = y;
      for (const r of row) { const rh = r.area / rw; emit(r.node, x, ry, rw, rh); ry += rh; }
      x += rw; w -= rw;
    } else {
      const rh = rowArea / w;
      let rx = x;
      for (const r of row) { const rw = r.area / rh; emit(r.node, rx, y, rw, rh); rx += rw; }
      y += rh; h -= rh;
    }
    i = j;
  }
}
function worstRatio(row: Item[], side: number): number {
  const s = row.reduce((n, r) => n + r.area, 0);
  let max = 0, min = Infinity;
  for (const r of row) { max = Math.max(max, r.area); min = Math.min(min, r.area); }
  const s2 = s * s, side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

// ------------------------------------------------------------------------------------------------ words

export function ago(ms: number | null, now: number): string {
  if (ms === null) return "not in this period";
  const d = Math.floor((now - ms) / DAY);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30.4);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

export function periodLabel(months: number): string {
  return months <= 0 ? "all history" : months % 12 === 0 ? `the last ${months / 12 === 1 ? "year" : `${months / 12} years`}` : `the last ${months} months`;
}

/** Why a file is (or isn't) a hotspot, in one sentence. */
export function explain(f: FileStat, a: Analysis): string {
  if (!f.commits) return `Not changed in this period · ${f.loc} lines of code.`;
  const parts = [`Changed in ${f.commits} commit${f.commits === 1 ? "" : "s"}`, `${f.loc} lines`, `nested up to ${f.maxDepth} level${f.maxDepth === 1 ? "" : "s"} deep`];
  const who = f.authors.length === 1 ? `only ${f.authors[0].name}` : `${f.authors.length} people, mostly ${f.authors[0].name} (${Math.round(f.mainShare * 100)}%)`;
  const coupled = coupledWith(a, f.path);
  return `${parts.join(" · ")}. Changed by ${who}${coupled.length ? `. Usually changes with ${coupled[0].path.split("/").pop()} (${Math.round(coupled[0].degree * 100)}% of the time)` : ""}.`;
}

/** A Markdown report for a pull request, an issue or a team meeting. */
export function markdownReport(a: Analysis, months: number, project: string): string {
  const top = a.files.filter(f => f.rank > 0).slice(0, 10);
  const lines = [`## Code hotspots: ${project}`, "", `${a.commits} commits by ${a.authors} people in ${periodLabel(months)}, across ${a.files.length} files.`, ""];
  if (top.length) {
    lines.push("### Top hotspots", "", "| # | File | Commits | Lines | Depth | Main author |", "|---|---|---:|---:|---:|---|");
    for (const f of top) lines.push(`| ${f.rank} | \`${f.path}\` | ${f.commits} | ${f.loc} | ${f.maxDepth} | ${f.authors[0]?.name ?? "—"} (${Math.round(f.mainShare * 100)}%) |`);
    lines.push("");
  }
  if (a.coupling.length) {
    lines.push("### Files that change together", "");
    for (const c of a.coupling.slice(0, 8)) lines.push(`- \`${c.a}\` ↔ \`${c.b}\`: ${c.shared} commits together (${Math.round(c.degree * 100)}%)`);
    lines.push("");
  }
  const risky = a.files.filter(f => f.knowledge !== "shared" && f.commits >= 3).sort((x, y) => (x.knowledge === "lost" ? -1 : 0) - (y.knowledge === "lost" ? -1 : 0) || y.score - x.score).slice(0, 8);
  if (risky.length) {
    lines.push("### Knowledge risks", "");
    for (const f of risky) lines.push(`- \`${f.path}\`: ${f.knowledge === "lost" ? `written by ${f.authors[0].name}, who hasn't committed in over 6 months` : `only ${f.authors[0].name} has changed it`}`);
    lines.push("");
  }
  lines.push("_Made with [Veyra Hotspots](https://veyraeditor.com/hotspots)._");
  return lines.join("\n");
}

// ------------------------------------------------------------------------------------------------ globs

/** A glob like "**​/node_modules/**" or "**​/*.min.*" as a RegExp over workspace-relative POSIX paths. */
const SPECIAL = /[.+^$()|[\]\\]/g, SPECIAL_ONE = /[.+^$()|[\]\\]/;
export function globToRegExp(glob: string): RegExp {
  let re = "", i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*"; i += slash ? 3 : 2; continue;
    }
    if (c === "*") { re += "[^/]*"; i++; continue; }
    if (c === "?") { re += "[^/]"; i++; continue; }
    if (c === "{") { const end = glob.indexOf("}", i); if (end > i) { re += `(?:${glob.slice(i + 1, end).split(",").map(p => p.replace(SPECIAL, "\\$&").replace(/\*/g, "[^/]*")).join("|")})`; i = end + 1; continue; } }
    re += SPECIAL_ONE.test(c) ? `\\${c}` : c; i++;
  }
  return new RegExp(`^${re}$`);
}
export const excluded = (path: string, globs: RegExp[]) => globs.some(g => g.test(path) || g.test(path + "/"));
