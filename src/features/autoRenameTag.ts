/* Auto Rename Tag, built in: rename an HTML, XML or JSX tag and its pair changes with it. One undo puts both
   back. Uses the VS Code extension's tested model (extensions/auto-rename-tag). */
import { monaco } from "../editor";
import { pairedEdit } from "../../extensions/auto-rename-tag/src/model";
import { isNativeOn } from "./native";

const MARKUP = new Set(["html", "xml", "handlebars", "razor", "php", "vue", "svelte", "astro", "markdown"]);
const JSX_FILE = /\.(jsx|tsx)$/i;

/** Which files get paired renames, and whether they're HTML (void elements like <br>) or JSX. */
export function tagMode(languageId: string, path: string): "html" | "jsx" | null {
  if (JSX_FILE.test(path)) return "jsx";
  if (MARKUP.has(languageId) || /\.(html?|xml|svg|vue|svelte|astro|xhtml)$/i.test(path)) return "html";
  return null;
}

const snapshots = new Map<string, string>();
let applying = false;

function watch(model: monaco.editor.ITextModel) {
  const key = model.uri.toString();
  const mode = () => tagMode(model.getLanguageId(), model.uri.path);
  if (mode()) snapshots.set(key, model.getValue());
  model.onDidChangeLanguage(() => { if (mode()) snapshots.set(key, model.getValue()); else snapshots.delete(key); });
  model.onWillDispose(() => snapshots.delete(key));
  model.onDidChangeContent(event => {
    const kind = mode();
    if (!kind) return;
    const before = snapshots.get(key);
    snapshots.set(key, model.getValue());
    if (applying || before === undefined || !isNativeOn("auto-rename-tag")) return;
    if (event.isUndoing || event.isRedoing || event.isFlush || event.changes.length !== 1) return;
    const [change] = event.changes;
    const paired = pairedEdit(before, { offset: change.rangeOffset, length: change.rangeLength, text: change.text }, kind === "html");
    if (!paired) return;
    const version = model.getVersionId();
    queueMicrotask(() => {
      if (model.isDisposed() || model.getVersionId() !== version) return;
      const start = model.getPositionAt(paired.offset), end = model.getPositionAt(paired.offset + paired.length);
      const edit = { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), text: paired.text };
      const editor = monaco.editor.getEditors().find(e => e.getModel() === model);
      applying = true;
      try {
        // Through the editor, the paired edit joins the typing's undo step, so one undo reverts both tags.
        if (editor) editor.executeEdits("veyra.autoRenameTag", [edit]);
        else model.pushEditOperations(null, [edit], () => null);
      } finally { applying = false; snapshots.set(key, model.getValue()); }
    });
  });
}

let started = false;
export function startAutoRenameTag() {
  if (started) return; started = true;
  monaco.editor.getModels().forEach(watch);
  monaco.editor.onDidCreateModel(watch);
}
