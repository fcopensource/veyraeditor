/* Error Lens, built in: each problem's message at the end of its line, and the line gently tinted.
   Same rules as the VS Code extension (extensions/error-lens): errors, warnings and info, the most severe
   problem per line, "(+N more)", and a line you're typing on waits for a pause before its message returns. */
import { monaco } from "../editor";
import { byLine, filterProblems, formatMessage, hiddenWhileTyping, type Problem, type Severity } from "../../extensions/error-lens/src/model";
import { isNativeOn, onNativeChange } from "./native";

// Class names are prefixed (lens-warning, not warning): Veyra has unrelated global styles for .warning and .error.
const NAMES = ["error", "warning", "info", "hint"] as const;
const FILTERS = { severities: new Set(["error", "warning", "info"]), excludeSources: [] as string[], excludeMessages: [] as RegExp[] };
const TYPING_DELAY = 600;

const toSeverity = (s: monaco.MarkerSeverity): Severity =>
  s === monaco.MarkerSeverity.Error ? 0 : s === monaco.MarkerSeverity.Warning ? 1 : s === monaco.MarkerSeverity.Info ? 2 : 3;

/** The problems a model's markers describe, as Error Lens's model sees them (0-based lines, like VS Code). */
export function problemsOf(markers: monaco.editor.IMarker[]): Problem[] {
  return markers.map(m => ({
    line: m.startLineNumber - 1, severity: toSeverity(m.severity), message: m.message, source: m.source || m.owner,
    code: typeof m.code === "object" && m.code ? String(m.code.value) : m.code ? String(m.code) : undefined,
  }));
}

/* Monaco's injected text doesn't render in this build, so a message is drawn the way VS Code draws extension
   decorations: an empty span after the line's last character, whose ::after shows the text from a generated CSS rule. */
const messageClasses = new Map<string, string>();
let sheet: HTMLStyleElement | null = null;
/** A CSS string literal: backslashes and quotes escaped, line breaks turned into spaces. */
export const cssString = (text: string) => '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ") + '"';
/** The class whose ::after shows this message (one generated rule per distinct message). */
function messageClass(text: string) {
  let name = messageClasses.get(text);
  if (name) return name;
  if (!sheet || messageClasses.size > 2000) {
    sheet?.remove(); messageClasses.clear();
    sheet = document.createElement("style"); sheet.id = "veyra-error-lens"; document.head.appendChild(sheet);
  }
  name = "veyra-lens-m" + messageClasses.size;
  messageClasses.set(text, name);
  sheet.appendChild(document.createTextNode(`.${name}::after{content:${cssString(text)}}\n`));
  return name;
}

const collections = new Map<string, string[]>();
const lastEdit = new Map<string, { line: number; at: number }>();
let timer = 0;

function render(model: monaco.editor.ITextModel) {
  const key = model.uri.toString();
  const old = collections.get(key) || [];
  if (!isNativeOn("error-lens") || model.isDisposed()) { if (!model.isDisposed()) model.deltaDecorations(old, []); collections.delete(key); return; }
  const problems = filterProblems(problemsOf(monaco.editor.getModelMarkers({ resource: model.uri })), FILTERS);
  const now = Date.now();
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (const entry of byLine(problems)) {
    const lineNumber = entry.line + 1;
    if (lineNumber > model.getLineCount()) continue;
    const name = NAMES[entry.top.severity];
    decorations.push({ range: new monaco.Range(lineNumber, 1, lineNumber, 1), options: { isWholeLine: true, className: `veyra-lens-line lens-${name}`, stickiness: 1 } });
    if (hiddenWhileTyping("hideCurrentLine", entry.line, lastEdit.get(key), now, TYPING_DELAY)) continue;
    const end = model.getLineMaxColumn(lineNumber);
    if (end <= 1) continue; // an empty line has no character to hang the message on; its tint still shows
    decorations.push({ range: new monaco.Range(lineNumber, end - 1, lineNumber, end), options: {
      afterContentClassName: `veyra-lens-text lens-${name} ${messageClass(formatMessage("{message}", entry, 200))}`,
      hoverMessage: { value: entry.all.map(p => `**${NAMES[p.severity]}**: ${p.message}${p.source ? ` _(${p.source})_` : ""}`).join("\n\n") },
      stickiness: 1,
    } });
  }
  collections.set(key, model.deltaDecorations(old, decorations));
}
const renderAll = () => monaco.editor.getModels().forEach(render);

let started = false;
/** Call once: Error Lens follows markers on every model from then on. */
export function startErrorLens() {
  if (started) return; started = true;
  monaco.editor.onDidChangeMarkers(uris => uris.forEach(uri => { const model = monaco.editor.getModel(uri); if (model) render(model); }));
  const watch = (model: monaco.editor.ITextModel) => {
    model.onDidChangeContent(event => {
      const line = (event.changes[0]?.range.startLineNumber ?? 1) - 1;
      lastEdit.set(model.uri.toString(), { line, at: Date.now() });
      window.clearTimeout(timer); timer = window.setTimeout(renderAll, TYPING_DELAY + 20);
    });
    model.onWillDispose(() => { collections.delete(model.uri.toString()); lastEdit.delete(model.uri.toString()); });
  };
  monaco.editor.getModels().forEach(watch);
  monaco.editor.onDidCreateModel(watch);
  onNativeChange(renderAll);
  renderAll();
}
