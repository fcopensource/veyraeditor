import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { conf as htmlConf, language as htmlLanguage } from "monaco-editor/esm/vs/basic-languages/html/html.js";

self.MonacoEnvironment = {
  getWorker: (_, label) => {
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker();
    if (["typescript", "javascript"].includes(label)) return new TsWorker();
    return new EditorWorker();
  }
};
loader.config({ monaco });
monaco.editor.defineTheme("veyra", {
  base: "vs-dark", inherit: true,
  // A calm IDE palette: orange keywords, green strings, cyan numbers, blue functions, grey comments.
  rules: [
    { token: "", foreground: "BCBEC4" },
    { token: "comment", foreground: "7A7E85", fontStyle: "italic" },
    { token: "keyword", foreground: "CF8E6D" },
    { token: "string", foreground: "6AAB73" },
    { token: "string.escape", foreground: "CF8E6D" },
    { token: "number", foreground: "2AACB8" },
    { token: "regexp", foreground: "42C3D4" },
    { token: "type.identifier", foreground: "C77DBB" },
    { token: "identifier.function", foreground: "56A8F5" },
    { token: "delimiter", foreground: "BCBEC4" },
    { token: "tag", foreground: "D5B778" },
    { token: "attribute.name", foreground: "BABABA" },
    { token: "attribute.value", foreground: "6AAB73" },
    { token: "metatag", foreground: "B3AE60" },
    { token: "annotation", foreground: "B3AE60" },
  ],
  colors: {
    "editor.background": "#191A1E", "editor.foreground": "#BCBEC4",
    "editorLineNumber.foreground": "#4B5059", "editorLineNumber.activeForeground": "#B3B4B8",
    "editor.lineHighlightBackground": "#1F2024", "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#2B4371", "editor.inactiveSelectionBackground": "#2B3A55",
    "editorCursor.foreground": "#CED0D6", "editorIndentGuide.background1": "#313438", "editorIndentGuide.activeBackground1": "#4B4E55",
    "editorWidget.background": "#2B2D30", "editorWidget.border": "#43454A", "editorSuggestWidget.selectedBackground": "#2E436E",
    "editorGutter.background": "#191A1E", "scrollbarSlider.background": "#4D515866", "scrollbarSlider.hoverBackground": "#5A5E6599",
    "editorBracketMatch.background": "#43454A", "editorBracketMatch.border": "#00000000",
  },
});
// Monaco measures character widths once; measure again when the bundled editor font has loaded.
void document.fonts?.load("14px 'JetBrains Mono'").then(() => monaco.editor.remeasureFonts()).catch(() => {});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  allowNonTsExtensions: true, allowJs: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
});
// Vue and Svelte components: HTML highlighting until full grammars arrive; their language servers add the intelligence.
for (const id of ["vue", "svelte"]) {
  monaco.languages.register({ id, extensions: ["." + id], aliases: [id === "vue" ? "Vue" : "Svelte"] });
  monaco.languages.setMonarchTokensProvider(id, { ...(htmlLanguage as monaco.languages.IMonarchLanguage), tokenPostfix: "." + id });
  monaco.languages.setLanguageConfiguration(id, htmlConf as monaco.languages.LanguageConfiguration);
}
export const languageFor = (path: string) => {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const languages: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", json: "json", css: "css", scss: "scss", less: "less", html: "html", htm: "html", md: "markdown", mdx: "markdown", py: "python", rs: "rust", java: "java", go: "go", php: "php", sql: "sql", yaml: "yaml", yml: "yaml", xml: "xml", svg: "xml", sh: "shell", zsh: "shell", bash: "shell", c: "c", h: "c", cpp: "cpp", hpp: "cpp", swift: "swift", rb: "ruby", toml: "ini", ini: "ini", vue: "vue", svelte: "svelte", txt: "plaintext", gitignore: "plaintext", env: "ini" };
  return languages[name.split(".").pop()!] || "plaintext";
};
export { monaco };
