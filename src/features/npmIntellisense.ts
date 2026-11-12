/* npm IntelliSense, built in: complete package names, their versions and Node built-ins inside import and
   require strings, and warn about imports whose package isn't in package.json. Uses the VS Code extension's
   tested model (extensions/npm-intellisense). */
import { invoke } from "@tauri-apps/api/core";
import { monaco } from "../editor";
import {
  DEFAULT_IGNORE, KIND_LABEL, aliasPrefixes, checkImports, findImportsIn, importContextAt, parseJsonc, readManifest, type Manifest,
} from "../../extensions/npm-intellisense/src/model";
import { isNativeOn, onNativeChange, onProjectChange, project, relativePath } from "./native";

/** Node.js built-in modules (node:module's builtinModules, without the internal ones). */
export const NODE_BUILTINS = new Set(["assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2", "https", "inspector", "module", "net", "os", "path", "path/posix", "path/win32", "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl", "stream", "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers", "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types", "v8", "vm", "wasi", "worker_threads", "zlib", "test"]);

const LANGUAGES = ["javascript", "typescript", "vue", "svelte", "astro"];
const OWNER = "npm-intellisense";

let manifest: Manifest | null = null;
let aliases: string[] = [];
let loadedFor = "", loading: Promise<void> | null = null;

async function readText(path: string): Promise<string | null> {
  try { return await invoke<string>("read_file", { path }); } catch { return null; }
}
/** Reads the project's package.json (and tsconfig/jsconfig aliases). Cheap to call: it caches per project. */
export async function loadManifest(force = false) {
  const { root, files } = project();
  if (!root) { manifest = null; aliases = []; loadedFor = ""; return; }
  if (!force && loadedFor === root) return loading ?? undefined;
  loadedFor = root;
  loading = (async () => {
    const text = files.includes("package.json") ? await readText("package.json") : null;
    manifest = text ? readManifest(text, "package.json") : null;
    const config = files.includes("tsconfig.json") ? await readText("tsconfig.json") : files.includes("jsconfig.json") ? await readText("jsconfig.json") : null;
    aliases = config ? aliasPrefixes(parseJsonc(config)) : [];
  })().finally(() => { loading = null; });
  return loading;
}

/** Imports whose package isn't declared, as Monaco markers. Workspaces (monorepos) are skipped: their packages live elsewhere. */
export function checkModel(model: monaco.editor.ITextModel) {
  if (model.isDisposed()) return;
  const usable = isNativeOn("npm-intellisense") && manifest && !manifest.workspaces && LANGUAGES.includes(model.getLanguageId()) && relativePath(model.uri);
  if (!usable) { monaco.editor.setModelMarkers(model, OWNER, []); return; }
  const text = model.getValue();
  const declared = new Set(manifest!.deps.map(d => d.name));
  const problems = checkImports(findImportsIn(text, model.getLanguageId()), { declared, self: manifest!.name, installed: () => false, builtins: NODE_BUILTINS, ignore: [...DEFAULT_IGNORE, ...aliases] });
  monaco.editor.setModelMarkers(model, OWNER, problems.filter(p => p.code === "missing").map(p => {
    const start = model.getPositionAt(p.start), end = model.getPositionAt(p.end);
    return { severity: monaco.MarkerSeverity.Warning, message: `'${p.pkg}' isn't in package.json. Install it, or add it to your dependencies.`, source: "npm IntelliSense",
      startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
  }));
}
const checkAll = () => monaco.editor.getModels().forEach(checkModel);

let started = false;
export function startNpmIntellisense() {
  if (started) return; started = true;
  monaco.languages.registerCompletionItemProvider(LANGUAGES, {
    triggerCharacters: ["'", '"', "`", "/", "@"],
    async provideCompletionItems(model, position) {
      if (!isNativeOn("npm-intellisense")) return { suggestions: [] };
      const context = importContextAt(model.getLineContent(position.lineNumber), position.column - 1);
      if (!context || /^[./]/.test(context.prefix)) return { suggestions: [] };
      await loadManifest();
      const range = new monaco.Range(position.lineNumber, context.start + 1, position.lineNumber, context.end + 1);
      const suggestions: monaco.languages.CompletionItem[] = (manifest?.deps || []).map(dep => ({
        label: { label: dep.name, description: dep.version }, kind: monaco.languages.CompletionItemKind.Module, insertText: dep.name, range,
        detail: KIND_LABEL[dep.kind], sortText: "0" + dep.name, documentation: `${dep.name} ${dep.version} · ${KIND_LABEL[dep.kind]} in package.json`,
      }));
      if (!context.prefix.startsWith("@")) for (const name of NODE_BUILTINS) suggestions.push({
        label: { label: "node:" + name, description: "Node.js" }, kind: monaco.languages.CompletionItemKind.Module, insertText: "node:" + name,
        filterText: name + " node:" + name, range, detail: "Node.js built-in module", sortText: "1" + name,
      });
      return { suggestions };
    },
  });
  const watch = (model: monaco.editor.ITextModel) => {
    let timer = 0;
    model.onDidChangeContent(() => {
      if (relativePath(model.uri) === "package.json") { window.clearTimeout(timer); timer = window.setTimeout(() => void loadManifest(true).then(checkAll), 800); return; }
      window.clearTimeout(timer); timer = window.setTimeout(() => checkModel(model), 500);
    });
    void loadManifest().then(() => checkModel(model));
  };
  monaco.editor.getModels().forEach(watch);
  monaco.editor.onDidCreateModel(watch);
  onProjectChange(() => void loadManifest(true).then(checkAll));
  onNativeChange(checkAll);
}
