/* Pure helpers: finding tags in comments, grouping them, and writing a checklist. No VS Code, so they're tested in Node. */

export interface Todo { line: number; column: number; length: number; tag: string; text: string; owner?: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Comment starts in common languages: //, #, /*, *, <!--, --, ;, %, ', REM, and Markdown list or heading starts. */
const COMMENT = String.raw`(?:\/\/+!?|#+|\/\*+!?|\*|<!--|--|;+|%+|'|\bREM\b|\{-|\(\*|^\s*[-+]\s(?:\[[ xX]\]\s)?)`;

/** A regular expression that finds a tag after a comment start: "// TODO(ada): tidy" → tag, owner, text. */
export function tagPattern(tags: string[]): RegExp | undefined {
  const words = tags.map(t => t.trim()).filter(Boolean).map(escape);
  if (!words.length) return undefined;
  return new RegExp(String.raw`${COMMENT}[ \t]*(${words.join("|")})(?![\w-])(?:\(([^)\n]{1,40})\))?:?(.*)$`, "m");
}

/** Every tag in a file's text, with its position and the words after it. */
export function findTodos(text: string, tags: string[]): Todo[] {
  const re = tagPattern(tags);
  if (!re || !tags.some(t => text.includes(t))) return [];
  const out: Todo[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!tags.some(t => line.includes(t))) continue;
    const m = re.exec(line);
    if (!m) continue;
    const tag = m[1];
    const column = line.indexOf(tag, m.index);
    let rest = m[3].replace(/\s*(\*\/|-->|-\}|\*\))\s*$/, "").trim();
    rest = rest.replace(/^[-–:]\s*/, "");
    const owner = m[2]?.trim().replace(/^@/, "") || undefined;
    out.push({ line: i, column, length: tag.length, tag, text: rest, owner });
  }
  return out;
}

export interface FileTodos { path: string; todos: Todo[] }
export interface Folder { name: string; path: string; folders: Folder[]; files: FileTodos[] }

/** Builds folders from paths ("src/app/a.ts"), joining folders that only hold one folder ("src/app"). */
export function buildTree(files: FileTodos[]): Folder {
  const root: Folder = { name: "", path: "", folders: [], files: [] };
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = file.path.split("/");
    let at = root;
    for (const part of parts.slice(0, -1)) {
      let next = at.folders.find(f => f.name === part);
      if (!next) { next = { name: part, path: at.path ? `${at.path}/${part}` : part, folders: [], files: [] }; at.folders.push(next); }
      at = next;
    }
    at.files.push(file);
  }
  const compact = (f: Folder): Folder => {
    f.folders = f.folders.map(compact);
    if (f !== root && f.files.length === 0 && f.folders.length === 1) {
      const only = f.folders[0];
      return { ...only, name: `${f.name}/${only.name}` };
    }
    return f;
  };
  return compact(root);
}

export function countIn(folder: Folder): number {
  return folder.files.reduce((n, f) => n + f.todos.length, 0) + folder.folders.reduce((n, f) => n + countIn(f), 0);
}

/** Keeps the todos whose tag, owner, text or file path contains the filter. */
export function filterTodos(files: FileTodos[], filter: string): FileTodos[] {
  const q = filter.trim().toLowerCase();
  if (!q) return files;
  return files.map(f => ({ path: f.path, todos: f.todos.filter(t => `${t.tag} ${t.owner ?? ""} ${t.text}`.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) })).filter(f => f.todos.length);
}

/** A Markdown checklist, grouped by tag in the order of the tags setting. */
export function toMarkdown(files: FileTodos[], tags: string[]): string {
  const sections: string[] = [];
  const order = [...tags, ...new Set(files.flatMap(f => f.todos.map(t => t.tag)))];
  for (const tag of [...new Set(order)]) {
    const items = files.flatMap(f => f.todos.filter(t => t.tag === tag).map(t => `- [ ] ${t.text || "(no text)"}${t.owner ? ` (@${t.owner})` : ""} — \`${f.path}:${t.line + 1}\``));
    if (items.length) sections.push(`## ${tag} (${items.length})\n\n${items.join("\n")}`);
  }
  return sections.join("\n\n") + (sections.length ? "\n" : "");
}

/** Which colour group a tag belongs to. */
export function colorKey(tag: string): "todo" | "fixme" | "hack" | "note" {
  if (/^(FIXME|BUG|ERROR|BROKEN)$/.test(tag)) return "fixme";
  if (/^(HACK|XXX|WARN|WARNING)$/.test(tag)) return "hack";
  if (/^(NOTE|INFO|IDEA|REVIEW)$/.test(tag)) return "note";
  return "todo";
}

// Turns a glob (like any-depth node_modules folders, or src/*.{ts,js}) into a regular expression for paths with "/".
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // "**/" matches any number of folders, including none; a trailing "**" matches everything below.
        if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) { re += "\\{"; continue; }
      re += `(?:${glob.slice(i + 1, end).split(",").map(p => p.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("|")})`;
      i = end;
    }
    else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}
/** Whether a workspace-relative path matches any of the globs. */
export function excludedBy(path: string, globs: RegExp[]): boolean {
  return globs.some(g => g.test(path));
}
