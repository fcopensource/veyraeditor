/* Pure helpers: reading git's output and laying out the graph. No VS Code or DOM, so they're tested in Node. */

export interface Commit { hash: string; parents: string[]; author: string; email: string; date: number; subject: string }
export interface Ref { hash: string; name: string; full: string; kind: "head" | "remote" | "tag"; upstream?: string; ahead?: number; behind?: number; gone?: boolean }
export interface FileChange { path: string; oldPath?: string; status: string; added?: number; removed?: number; binary?: boolean }

/** The id of the "uncommitted changes" row that sits above HEAD. */
export const UNCOMMITTED = "*";
/** git log --format: fields split by \x1f, commits by \x1e. */
export const LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s%x1e";
/** git for-each-ref --format: the tag's own object, the commit a tag points to, the name, its upstream and how far ahead or behind it is. */
export const REF_FORMAT = "%(objectname)%1f%(*objectname)%1f%(refname)%1f%(upstream:short)%1f%(upstream:track)";

export function parseLog(text: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of text.split("\x1e")) {
    const fields = record.replace(/^\s+/, "").split("\x1f");
    if (fields.length < 6 || !/^[0-9a-f]{40,64}$/.test(fields[0])) continue;
    const [hash, parents, author, email, date, ...subject] = fields;
    commits.push({ hash, parents: parents.split(" ").filter(Boolean), author, email, date: Number(date), subject: subject.join("\x1f").trimEnd() });
  }
  return commits;
}

export function parseRefs(text: string): Ref[] {
  const refs: Ref[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [object, peeled, full, upstream, track] = line.split("\x1f");
    if (!full) continue;
    const hash = peeled || object;
    let kind: Ref["kind"], name: string;
    if (full.startsWith("refs/heads/")) { kind = "head"; name = full.slice(11); }
    else if (full.startsWith("refs/remotes/")) { kind = "remote"; name = full.slice(13); if (name.endsWith("/HEAD")) continue; }
    else if (full.startsWith("refs/tags/")) { kind = "tag"; name = full.slice(10); }
    else continue; // stash, notes and others
    const ref: Ref = { hash, name, full, kind };
    if (upstream) {
      ref.upstream = upstream;
      ref.ahead = Number(/ahead (\d+)/.exec(track ?? "")?.[1] ?? 0);
      ref.behind = Number(/behind (\d+)/.exec(track ?? "")?.[1] ?? 0);
      if (/gone/.test(track ?? "")) ref.gone = true;
    }
    refs.push(ref);
  }
  return refs;
}

// ---------- Graph layout ----------

export interface Line { lane: number; color: number }
/** One row of the graph: the commit's lane, lines passing by, lines coming in from above and going out below. */
export interface Row { col: number; color: number; pass: Line[]; incoming: Line[]; outgoing: Line[]; width: number }

/**
 * Lays commits (children before parents, as git log prints them) out in lanes.
 * Each lane remembers which commit it is heading to; a commit takes the lane that expects it,
 * other lanes expecting it merge in, its first parent continues the lane and other parents get their own.
 */
export function layoutGraph(commits: Pick<Commit, "hash" | "parents">[]): Row[] {
  const lanes: (string | null)[] = [], colors: number[] = [];
  let nextColor = 0;
  const free = (avoid = -1) => { const i = lanes.findIndex((l, k) => l === null && k !== avoid); return i >= 0 ? i : lanes.length; };
  const rows: Row[] = [];
  for (const commit of commits) {
    let col = lanes.indexOf(commit.hash);
    const incoming: Line[] = [], pass: Line[] = [];
    if (col === -1) { col = free(); colors[col] = nextColor++; }
    else incoming.push({ lane: col, color: colors[col] });
    lanes.forEach((target, j) => {
      if (j === col || target === null) return;
      if (target === commit.hash) { incoming.push({ lane: j, color: colors[j] }); lanes[j] = null; }
      else pass.push({ lane: j, color: colors[j] });
    });
    const color = colors[col];
    const outgoing: Line[] = [];
    const [first, ...others] = commit.parents;
    lanes[col] = first ?? null;
    if (first) outgoing.push({ lane: col, color });
    for (const parent of others) {
      let k = lanes.indexOf(parent);
      if (k === -1) { k = free(col); lanes[k] = parent; colors[k] = nextColor++; }
      outgoing.push({ lane: k, color: colors[k] });
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    const width = Math.max(col, ...pass.map(l => l.lane), ...incoming.map(l => l.lane), ...outgoing.map(l => l.lane)) + 1;
    rows.push({ col, color, pass, incoming, outgoing, width });
  }
  return rows;
}

// ---------- Commit files and working tree ----------

/** Combines `git diff --name-status -z -M` and `git diff --numstat -z -M` into one list. */
export function parseChanges(nameStatus: string, numstat: string): FileChange[] {
  const files: FileChange[] = [];
  const parts = nameStatus.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i];
    if (!code) continue;
    if (/^[RC]/.test(code)) { files.push({ status: code[0], oldPath: parts[i + 1], path: parts[i + 2] }); i += 2; }
    else { files.push({ status: code[0], path: parts[i + 1] }); i += 1; }
  }
  const counts = new Map<string, { added?: number; removed?: number; binary?: boolean }>();
  const n = numstat.split("\0");
  for (let i = 0; i < n.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(n[i]);
    if (!m) continue;
    let path = m[3];
    if (path === "") { path = n[i + 2]; i += 2; } // a rename: the old and new paths follow
    counts.set(path, m[1] === "-" ? { binary: true } : { added: Number(m[1]), removed: Number(m[2]) });
  }
  for (const f of files) Object.assign(f, counts.get(f.path) ?? {});
  return files;
}

/** `git status --porcelain=v1 -z`: what changed in the working tree and the index. */
export function parseStatus(text: string): FileChange[] {
  const files: FileChange[] = [];
  const parts = text.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2), path = entry.slice(3);
    const status = xy === "??" ? "U" : xy.includes("D") ? "D" : xy.includes("A") ? "A" : /R/.test(xy) ? "R" : "M";
    if (/R|C/.test(xy[0])) { files.push({ status, path, oldPath: parts[i + 1] }); i++; }
    else files.push({ status, path });
  }
  return files;
}

// ---------- Display ----------

export function formatDate(seconds: number, mode: string, now = Date.now()): string {
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (mode === "date") return day;
  if (mode === "dateTime") return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  const units: [number, string][] = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, unit] of units) if (s >= size) { const n = Math.floor(s / size); return `${n} ${unit}${n === 1 ? "" : "s"} ago`; }
  return "just now";
}
/** "Ada Lovelace" → "AL", "ada" → "AD" */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
}
/** A steady hue for each author, so their initials always have the same colour. */
export function hue(text: string): number {
  let h = 0;
  for (const ch of text.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
/** Whether a commit matches a search: words in the message, the author, or the start of the hash. */
export function matches(commit: Commit, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return commit.subject.toLowerCase().includes(q) || commit.author.toLowerCase().includes(q) || commit.email.toLowerCase().includes(q) || (q.length >= 4 && commit.hash.startsWith(q));
}
/** Names git accepts for a new branch or tag. */
export function validRefName(name: string): string | undefined {
  if (!name.trim()) return "Enter a name.";
  if (/\s/.test(name)) return "Names can't contain spaces.";
  if (/(^[-./])|(\.\.)|[~^:?*[\\]|@\{|\/$|\.lock$|\.$|\/\//.test(name)) return `"${name}" isn't a valid git name.`;
  return undefined;
}
