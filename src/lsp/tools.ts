import { invoke } from "@tauri-apps/api/core";
import { monaco } from "../editor";
import { LspClient, type Host, type ServerOptions } from "./client";

/* Web language tools: what VS Code's most-installed web extensions provide, run as language servers. */

export type Tool = ServerOptions & {
  description: string; publisher: string; kind: "server" | "formatter";
  /** Open VSX / VS Code Marketplace ids this tool stands in for. */
  replaces: string[];
  beta?: boolean;
  /** Monaco's built-in TypeScript features are switched off while this server runs, to avoid duplicates. */
  replacesBuiltinTypeScript?: boolean;
};
export type ToolState = { installed: boolean; version: string; enabled: boolean; running: "off" | "starting" | "running" | "failed"; error: string; busy: boolean };

const JS = ["javascript", "typescript"];
const STYLE = ["css", "scss", "less"];
let toolsDir = "";

const eslintSettings = (root: string) => ({
  validate: "on", packageManager: "npm", useESLintClass: false, experimental: {}, run: "onType", nodePath: null, quiet: false, onIgnoredFiles: "off",
  options: {}, rulesCustomizations: [], format: false, problems: { shortenToSingleLine: false }, codeActionOnSave: { enable: false, mode: "all" },
  codeAction: { disableRuleComment: { enable: true, location: "separateLine" }, showDocumentation: { enable: true } },
  workingDirectory: { mode: "location" }, workspaceFolder: { name: root.split(/[\\/]/).pop(), uri: monaco.Uri.file(root).toString() },
});
const tailwindSettings = {
  emmetCompletions: false, includeLanguages: {}, classAttributes: ["class", "className", "ngClass", "class:list"], classFunctions: [],
  validate: true, hovers: true, suggestions: true, codeActions: true, colorDecorators: true, showPixelEquivalents: true, rootFontSize: 16,
  lint: { cssConflict: "warning", invalidApply: "error", invalidScreen: "error", invalidVariant: "error", invalidConfigPath: "error", invalidTailwindDirective: "error", invalidSourceDirective: "error", recommendedVariantOrder: "warning" },
  experimental: { classRegex: [], configFile: null }, files: { exclude: ["**/.git/**", "**/node_modules/**", "**/.hg/**", "**/.svn/**"] },
};

export const TOOLS: Tool[] = [
  { key: "typescript", name: "TypeScript & JavaScript (Node.js)", publisher: "typescript-language-server", kind: "server", languages: JS,
    description: "Full IntelliSense using your project's tsconfig and node_modules types: errors, auto-imports, refactors, organize imports, Node.js and React types.",
    replaces: ["vscode.typescript-language-features", "ms-vscode.vscode-typescript-next", "vscode.javascript", "vscode.typescript"], replacesBuiltinTypeScript: true,
    initializationOptions: () => ({ hostInfo: "veyra", preferences: { includeCompletionsForModuleExports: true, includeCompletionsWithInsertText: true, includeCompletionsWithSnippetText: true, includeInlayParameterNameHints: "literals", includeInlayFunctionLikeReturnTypeHints: false } }),
    settings: section => section === "" ? {} : section.startsWith("typescript") || section.startsWith("javascript") ? { format: {}, preferences: {} } : null },
  { key: "eslint", name: "ESLint", publisher: "Microsoft vscode-eslint", kind: "server", languages: [...JS, "vue", "svelte"],
    description: "Lint errors and warnings from your project's ESLint config as you type, with quick fixes and \"fix all\".",
    replaces: ["dbaeumer.vscode-eslint"], settings: (_section, root) => eslintSettings(root) },
  { key: "prettier", name: "Prettier", publisher: "Prettier", kind: "formatter", languages: [...JS, ...STYLE, "html", "json", "markdown", "yaml", "vue", "svelte", "graphql"],
    description: "Opinionated formatting with your project's Prettier version and config. Use Format Document, or turn on Format on save.",
    replaces: ["esbenp.prettier-vscode", "prettier.prettier-vscode"] },
  { key: "tailwind", name: "Tailwind CSS IntelliSense", publisher: "Tailwind Labs", kind: "server", languages: ["html", ...STYLE, ...JS, "vue", "svelte"],
    description: "Class name completion, hover previews of generated CSS, colour swatches and linting for Tailwind projects.",
    replaces: ["bradlc.vscode-tailwindcss"], settings: section => section === "editor" ? { tabSize: 2 } : section.startsWith("tailwindCSS") ? tailwindSettings : null },
  { key: "emmet", name: "Emmet", publisher: "olrtg/emmet-language-server", kind: "server", languages: ["html", ...STYLE, ...JS, "vue", "svelte"],
    description: "Expand abbreviations like ul>li*3 or div.card into full HTML and CSS, in markup, JSX and stylesheets.",
    replaces: ["vscode.emmet"], initializationOptions: () => ({ showSuggestionsAsSnippets: true, showExpandedAbbreviation: "always" }) },
  { key: "svelte", name: "Svelte", publisher: "Svelte", kind: "server", languages: ["svelte"],
    description: "Syntax, diagnostics, completions and go-to-definition for .svelte components.",
    replaces: ["svelte.svelte-vscode"], settings: () => ({}) },
  { key: "vue", name: "Vue (Volar)", publisher: "Vue", kind: "server", languages: ["vue"], beta: true,
    description: "Language support for .vue single-file components: template, script and style.",
    replaces: ["vue.volar", "Vue.volar", "octref.vetur"],
    initializationOptions: () => ({ typescript: { tsdk: `${toolsDir}/vue/node_modules/typescript/lib` }, vue: { hybridMode: false } }), settings: () => ({}) },
];
export const toolFor = (extensionId: string) => TOOLS.find(tool => tool.replaces.some(id => id.toLowerCase() === extensionId.toLowerCase()));

/* ---------- Manager ---------- */
const enabledKey = "veyra.tools.enabled";
const readEnabled = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(enabledKey) || "[]")); } catch { return new Set<string>(); } };
let enabled = readEnabled();
const installed = new Map<string, string>(); // key -> version
const clients = new Map<string, LspClient>();
const busy = new Set<string>();
let host: Host | null = null;
let nodeVersion = "", npmAvailable = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
export const onToolsChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const environment = () => ({ node: nodeVersion, npm: npmAvailable });

export function toolState(key: string): ToolState {
  const client = clients.get(key), version = installed.get(key) || "";
  return { installed: !!version, version, enabled: enabled.has(key), busy: busy.has(key), error: client?.error || "",
    running: !client ? "off" : client.state === "running" ? "running" : client.state === "failed" ? "failed" : client.state === "starting" ? "starting" : "off" };
}

export async function refreshTools() {
  try {
    const status = await invoke<{ node: string; npm: boolean; dir?: string; tools: { key: string; installed: boolean; version: string }[] } | null>("lsp_status");
    if (status) {
      nodeVersion = status.node; npmAvailable = status.npm; toolsDir = (status.dir || "").replace(/\\/g, "/");
      installed.clear(); for (const tool of status.tools) if (tool.installed) installed.set(tool.key, tool.version);
    }
  } catch { /* browser preview or backend unavailable */ }
  changed();
}

function saveEnabled() { localStorage.setItem(enabledKey, JSON.stringify([...enabled])); }

/** Built-in TypeScript features step aside while the real TypeScript server runs. */
function setBuiltinTypeScript(on: boolean) {
  const ts = monaco.languages.typescript;
  const mode = { completionItems: on, hovers: on, documentSymbols: on, definitions: on, references: on, documentHighlights: on, rename: on, diagnostics: on, documentRangeFormattingEdits: on, signatureHelp: on, onTypeFormattingEdits: on, codeActions: on, inlayHints: on };
  ts.typescriptDefaults.setModeConfiguration(mode); ts.javascriptDefaults.setModeConfiguration(mode);
}

async function startTool(tool: Tool) {
  if (!host || !host.root() || tool.kind !== "server" || clients.has(tool.key)) return;
  const client = new LspClient(tool, host);
  client.onChange = () => {
    if (tool.replacesBuiltinTypeScript) setBuiltinTypeScript(client.state !== "running");
    if (client.state === "stopped") clients.delete(tool.key);
    changed();
  };
  clients.set(tool.key, client);
  changed();
  await client.start();
}

/** Start every enabled, installed server that has an open file in one of its languages. */
export function ensureServers() {
  if (!host?.root()) return;
  const languages = new Set(monaco.editor.getModels().map(model => model.getLanguageId()));
  for (const tool of TOOLS) if (tool.kind === "server" && enabled.has(tool.key) && installed.has(tool.key) && tool.languages.some(l => languages.has(l))) void startTool(tool);
}

export async function stopAll() {
  await Promise.all([...clients.values()].map(client => client.stop()));
  clients.clear(); setBuiltinTypeScript(true); changed();
}

export async function installTool(key: string) {
  const tool = TOOLS.find(t => t.key === key); if (!tool) throw new Error("Unknown tool");
  busy.add(key); changed();
  try {
    const version = await invoke<string>("lsp_install", { key });
    installed.set(key, version); enabled.add(key); saveEnabled();
    ensureServers();
    return version;
  } finally { busy.delete(key); changed(); }
}
export async function uninstallTool(key: string) {
  busy.add(key); changed();
  try {
    await clients.get(key)?.stop();
    await stopAll(); // the backend stops servers while files are removed
    await invoke("lsp_uninstall", { key });
    installed.delete(key); enabled.delete(key); saveEnabled();
    ensureServers();
  } finally { busy.delete(key); changed(); }
}
export async function setToolEnabled(key: string, on: boolean) {
  if (on) enabled.add(key); else enabled.delete(key);
  saveEnabled();
  if (!on) await clients.get(key)?.stop();
  ensureServers(); changed();
}
export async function restartTool(key: string) { await clients.get(key)?.stop(); clients.delete(key); ensureServers(); }

let initialised = false;
/** Call once from the workbench. */
export function initLanguageTools(nextHost: Host) {
  host = nextHost;
  if (initialised) return;
  initialised = true;
  void refreshTools().then(ensureServers);
  monaco.editor.onDidCreateModel(() => setTimeout(ensureServers, 0));

  // Prettier: a formatter rather than a server. Registered once; active while enabled and installed.
  const prettier = TOOLS.find(t => t.key === "prettier")!;
  for (const language of prettier.languages) monaco.languages.registerDocumentFormattingEditProvider(language, {
    displayName: "Prettier",
    async provideDocumentFormattingEdits(model) {
      if (!host || !enabled.has("prettier") || !installed.has("prettier")) return [];
      const root = monaco.Uri.file(host.root()).path, path = decodeURIComponent(model.uri.path);
      if (!path.toLowerCase().startsWith(decodeURIComponent(root).toLowerCase() + "/")) return [];
      try {
        const text = await invoke<string>("prettier_format", { path: path.slice(decodeURIComponent(root).length + 1), text: model.getValue() });
        return text === model.getValue() ? [] : [{ range: model.getFullModelRange(), text }];
      } catch (error) { host.notify(String(error)); return []; }
    },
  });

  // Navigation (go to definition, references, symbols) into another file opens it as a tab.
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selection) {
      if (!host) return false;
      const root = decodeURIComponent(monaco.Uri.file(host.root()).path), path = decodeURIComponent(resource.path);
      if (!path.toLowerCase().startsWith(root.toLowerCase() + "/")) return false;
      const position = selection && "startLineNumber" in selection ? { line: selection.startLineNumber, column: selection.startColumn } : selection && "lineNumber" in selection ? { line: selection.lineNumber, column: selection.column } : { line: 1, column: 1 };
      host.openFile(path.slice(root.length + 1), position.line, position.column);
      return true;
    },
  });
}
