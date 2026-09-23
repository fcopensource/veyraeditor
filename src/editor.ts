import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = { getWorker: (_, label) => {
  if (label === "json") return new JsonWorker();
  if (["css", "scss", "less"].includes(label)) return new CssWorker();
  if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker();
  if (["typescript", "javascript"].includes(label)) return new TsWorker();
  return new EditorWorker();
}};
loader.config({ monaco });
monaco.editor.defineTheme("veyra", {
  base: "vs-dark", inherit: true,
  rules: [
    { token: "comment", foreground: "657587", fontStyle: "italic" },
    { token: "keyword", foreground: "C6A3F4" },
    { token: "string", foreground: "A6D9AF" },
    { token: "number", foreground: "E6B88F" },
    { token: "type.identifier", foreground: "7BCCC6" },
  ],
  colors: { "editor.background": "#171b22", "editor.foreground": "#D5DEEB", "editorLineNumber.foreground": "#485464", "editorLineNumber.activeForeground": "#B3C1D3", "editor.lineHighlightBackground": "#1D242E", "editor.selectionBackground": "#354659", "editorCursor.foreground": "#8EDAD0", "editorIndentGuide.background1": "#26303B", "editorWidget.background": "#202732", "editorWidget.border": "#344050" },
});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  allowNonTsExtensions: true, allowJs: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
});
export const languageFor = (path: string) => {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "makefile";
  const languages: Record<string, string> = { ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",mjs:"javascript",cjs:"javascript",json:"json",css:"css",scss:"scss",less:"less",html:"html",htm:"html",md:"markdown",mdx:"markdown",py:"python",rs:"rust",java:"java",go:"go",php:"php",sql:"sql",yaml:"yaml",yml:"yaml",xml:"xml",svg:"xml",sh:"shell",zsh:"shell",bash:"shell",c:"c",h:"c",cpp:"cpp",hpp:"cpp",swift:"swift",rb:"ruby",toml:"ini",ini:"ini",vue:"html",svelte:"html",txt:"plaintext",gitignore:"plaintext",env:"ini" };
  return languages[name.split(".").pop()!] || "plaintext";
};
export { monaco };
