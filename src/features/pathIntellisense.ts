/* Path IntelliSense, built in: complete file and folder paths as you type them in imports, require, src/href,
   CSS url() and @import, and Markdown links, from the project's own file list. Same rules as the VS Code
   extension (extensions/path-intellisense): JS/TS imports drop .js/.ts/.jsx/.tsx, folders end in "/". */
import { monaco } from "../editor";
import { isNativeOn, project, relativePath } from "./native";

// The extension's model imports Node's path module, so this one rule is repeated here rather than imported.
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i;

export type PathKind = "import" | "html" | "css" | "markdown";
export interface PathContext { kind: PathKind; typed: string }

const PATTERNS: [PathKind, RegExp][] = [
  ["import", /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bexport\s[^'"`]*?from\s*)(['"`])([^'"`]*)$/],
  ["html", /\b(?:src|href|poster|srcset|action|data)\s*=\s*(['"])([^'"]*)$/i],
  ["css", /(?:url\(\s*(['"]?)|@import\s+(['"]))([^'")]*)$/],
  ["markdown", /!?\[[^\]]*\]\(()([^)\s]*)$/],
];

/** What's being typed at the cursor, if it's a path. JS/TS imports only count once they start with ./ ../ or /. */
export function pathContext(beforeCursor: string): PathContext | null {
  for (const [kind, pattern] of PATTERNS) {
    const match = beforeCursor.match(pattern);
    if (!match) continue;
    const typed = match[match.length - 1];
    if (/^[a-z][a-z0-9+.-]*:|^#|^\/\//i.test(typed)) return null; // URLs, anchors, protocol-relative links
    if (kind === "import" && !/^\.{1,2}(\/|$)|^\//.test(typed)) return null; // bare names are packages (npm IntelliSense)
    return { kind, typed };
  }
  return null;
}

const normalize = (parts: string[]) => {
  const out: string[] = [];
  for (const part of parts) { if (!part || part === ".") continue; if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part); }
  return out.join("/");
};

export interface Entry { name: string; folder: boolean }
/** The files and folders in the folder a typed path points into, relative to the current file. */
export function entriesFor(typed: string, currentFile: string, files: string[]): { entries: Entry[]; partial: string } | null {
  const slash = typed.lastIndexOf("/");
  const dirPart = slash >= 0 ? typed.slice(0, slash + 1) : "", partial = slash >= 0 ? typed.slice(slash + 1) : typed;
  const base = dirPart.startsWith("/") ? [] : currentFile.split("/").slice(0, -1);
  const dir = normalize([...base, ...dirPart.split("/")]);
  if (dir === null) return null;
  const prefix = dir ? dir + "/" : "";
  const seen = new Map<string, boolean>();
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length), next = rest.indexOf("/");
    const name = next < 0 ? rest : rest.slice(0, next);
    if (name && !seen.has(name)) seen.set(name, next >= 0); else if (name && next >= 0) seen.set(name, true);
  }
  return { entries: [...seen].map(([name, folder]) => ({ name, folder })), partial };
}

/** How a file is written in an import: TS/JS files without their extension, like the bundlers expect. */
export const importName = (name: string) => name.replace(/\.(tsx?|jsx?|mts|cts)$/, "").replace(/\.d$/, "");

let started = false;
export function startPathIntellisense() {
  if (started) return; started = true;
  const languages = ["javascript", "typescript", "html", "css", "scss", "less", "markdown", "vue", "svelte", "astro", "php"];
  monaco.languages.registerCompletionItemProvider(languages, {
    triggerCharacters: ["/", ".", "'", '"', "("],
    provideCompletionItems(model, position) {
      if (!isNativeOn("path-intellisense")) return { suggestions: [] };
      const current = relativePath(model.uri);
      if (!current) return { suggestions: [] };
      const context = pathContext(model.getLineContent(position.lineNumber).slice(0, position.column - 1));
      if (!context) return { suggestions: [] };
      if (context.typed === "" || context.typed === "." || context.typed === "..") {
        if (context.kind === "import" && context.typed === "") return { suggestions: [] };
        const range = new monaco.Range(position.lineNumber, position.column - context.typed.length, position.lineNumber, position.column);
        return { suggestions: ["./", "../"].map((text, i) => ({ label: text, kind: monaco.languages.CompletionItemKind.Folder, insertText: text, range, sortText: String(i),
          command: { id: "editor.action.triggerSuggest", title: "Suggest" } })) };
      }
      const found = entriesFor(context.typed, current, project().files);
      if (!found) return { suggestions: [] };
      const range = new monaco.Range(position.lineNumber, position.column - found.partial.length, position.lineNumber, position.column);
      const seen = new Set<string>();
      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const entry of found.entries.sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))) {
        const text = entry.folder ? entry.name + "/" : context.kind === "import" ? importName(entry.name) : entry.name;
        if (seen.has(text)) continue; seen.add(text);
        suggestions.push({
          label: { label: text, description: entry.folder ? "folder" : IMAGE.test(entry.name) ? "image" : undefined },
          kind: entry.folder ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
          insertText: text, range, sortText: (entry.folder ? "0" : "1") + entry.name, detail: entry.folder ? "Folder" : entry.name,
          command: entry.folder ? { id: "editor.action.triggerSuggest", title: "Suggest" } : undefined,
        });
      }
      return { suggestions };
    },
  });
}
