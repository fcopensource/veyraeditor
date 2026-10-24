import { BACKGROUNDS, dedent, expandTabs, parseSnippetHtml, plainSnippet, type Options, type Snippet } from "../model";
import { drawSnap, lineAt, type Drawn, type Look } from "./render";

/* The CodeSnap panel: a toolbar of choices, the live preview, and Copy / Save. */

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const send = (m: unknown) => vscode.postMessage(m);
const app = document.getElementById("app")!;

interface Settings { background: string; solidColor: string; frame: Options["frame"]; padding: number; lineNumbers: boolean; shadow: boolean; size: Options["size"]; scale: number }
let settings: Settings = { background: "aurora", solidColor: "#1f2937", frame: "macos", padding: 56, lineNumbers: true, shadow: true, size: "auto", scale: 2 };
let snippet: Snippet | undefined;
let firstLine = 1, title = "", tabSize = 4;
const highlights = new Set<number>();
let drawn: Drawn | undefined;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (k === "value") (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

// ---------- Layout ----------

const canvas = h("canvas", { class: "snap", role: "img", "aria-label": "A preview of your code as an image. Click a line to highlight it." });
const stage = h("div", { class: "stage" }, canvas);
const titleInput = h("input", { class: "title-input", type: "text", "aria-label": "Window title", placeholder: "Title" }) as HTMLInputElement;
const status = h("span", { class: "status", role: "status" });
const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Background" });

function setting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  send({ type: "setting", key, value });
  render();
  syncControls();
}
const select = (key: "frame" | "size", options: [string, string][], label: string) =>
  h("label", { class: "field" }, h("span", {}, label), h("select", { "data-key": key, onchange: (e: Event) => setting(key, (e.target as HTMLSelectElement).value as never) }, ...options.map(([v, t]) => h("option", { value: v }, t))));
const toggle = (key: "lineNumbers" | "shadow", label: string) =>
  h("label", { class: "toggle" }, h("input", { type: "checkbox", "data-key": key, onchange: (e: Event) => setting(key, (e.target as HTMLInputElement).checked) }), h("span", {}, label));

function buildSwatches() {
  const names = [...Object.keys(BACKGROUNDS), "solid", "transparent"];
  swatches.replaceChildren(...names.map(name => {
    const g = BACKGROUNDS[name];
    const style = g ? `background:linear-gradient(${g.angle}deg,${g.stops.join(",")})` : name === "solid" ? `background:${settings.solidColor}` : "";
    return h("button", { class: `swatch ${name}`, type: "button", role: "radio", title: name[0].toUpperCase() + name.slice(1), "aria-label": `${name} background`, "data-name": name, style, onclick: () => setting("background", name) });
  }));
}

function syncControls() {
  for (const el of document.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-key]")) {
    const v = settings[el.dataset.key as keyof Settings];
    if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = !!v;
    else el.value = String(v);
  }
  for (const b of swatches.querySelectorAll<HTMLElement>(".swatch")) b.setAttribute("aria-checked", String(b.dataset.name === settings.background));
  const solid = swatches.querySelector<HTMLElement>(".swatch.solid");
  if (solid) solid.style.background = settings.solidColor;
  const padding = document.querySelector<HTMLOutputElement>(".padding-value");
  if (padding) padding.value = `${settings.padding}`;
}

app.replaceChildren(
  h("header", { class: "toolbar" },
    h("div", { class: "group" }, h("span", { class: "label" }, "Background"), swatches),
    h("div", { class: "group" },
      select("frame", [["macos", "macOS"], ["windows", "Windows"], ["none", "No window"]], "Window"),
      select("size", [["auto", "Fit the code"], ["square", "Square 1:1"], ["wide", "Wide 16:9"], ["linkedin", "LinkedIn 1.91:1"]], "Size"),
      h("label", { class: "field" }, h("span", {}, "Padding"), h("input", { type: "range", min: "0", max: "160", step: "4", "data-key": "padding", oninput: (e: Event) => setting("padding", Number((e.target as HTMLInputElement).value)) }), h("output", { class: "padding-value" })),
      toggle("lineNumbers", "Line numbers"), toggle("shadow", "Shadow")),
    h("div", { class: "group actions" },
      h("label", { class: "field" }, h("span", {}, "Title"), titleInput),
      h("button", { class: "btn", type: "button", onclick: () => save() }, "Save PNG"),
      h("button", { class: "btn primary", type: "button", onclick: () => copy() }, "Copy image"))),
  h("main", { class: "preview" }, stage, h("p", { class: "hint" }, "Click a line to highlight it. ", status)),
);
titleInput.addEventListener("input", () => { title = titleInput.value; render(); });
buildSwatches();
syncControls();

// ---------- Drawing ----------

function render() {
  if (!snippet) { stage.classList.add("empty"); return; }
  stage.classList.remove("empty");
  stage.classList.toggle("checker", settings.background === "transparent");
  const look: Look = { background: settings.background, solidColor: settings.solidColor, shadow: settings.shadow, scale: settings.scale };
  drawn = drawSnap(canvas, snippet, { padding: settings.padding, frame: settings.frame, lineNumbers: settings.lineNumbers, size: settings.size, title }, look, highlights, firstLine);
  canvas.style.aspectRatio = `${drawn.layout.width} / ${drawn.layout.height}`;
  canvas.style.maxWidth = `${drawn.layout.width}px`;
}
canvas.addEventListener("click", e => {
  if (!drawn) return;
  const n = lineAt(drawn, canvas, e.clientX, e.clientY);
  if (n === undefined) return;
  if (highlights.has(n)) highlights.delete(n); else highlights.add(n);
  render();
});

function load(html: string | undefined, text: string) {
  let s = html ? parseSnippetHtml(html) : undefined;
  if (!s || !s.lines.length) s = plainSnippet(text);
  const leading = s.lines.findIndex(l => l.some(t => t.text.trim()));
  snippet = { ...s, lines: dedent(expandTabs(s.lines, tabSize)) };
  if (leading > 0) firstLine += leading; // blank lines trimmed from the top don't count
  highlights.clear();
  render();
}

function blob(): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("The image couldn't be made."))), "image/png"));
}
async function copy() {
  if (!snippet) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob() })]);
    flash("Copied! Paste it anywhere.");
  } catch {
    // Some setups don't allow images on the clipboard from here; saving always works.
    flash("Couldn't copy the image here, so you can save it instead.");
    save();
  }
}
async function save() {
  if (!snippet) return;
  const b = await blob();
  const bytes = new Uint8Array(await b.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  send({ type: "save", data: btoa(binary), title, firstLine, lastLine: firstLine + (snippet.lines.length - 1) });
}
let flashTimer: number | undefined;
function flash(text: string) { status.textContent = text; clearTimeout(flashTimer); flashTimer = window.setTimeout(() => (status.textContent = ""), 3000); }

// ---------- Messages ----------

let pending: { text: string } | undefined;
let lastPaste = { exec: false, html: false, focused: false };
document.addEventListener("paste", e => {
  if (!pending) return;
  e.preventDefault();
  const html = e.clipboardData?.getData("text/html") || undefined;
  lastPaste.html = !!html;
  const text = pending.text;
  pending = undefined;
  load(html, text);
  send({ type: "pasted", html: !!html });
});

/** Reads the coloured HTML the extension just copied: the async clipboard first, then a paste, then plain text. */
async function readClipboard(text: string) {
  // The extension is handing this panel focus; reading the clipboard needs it.
  for (let i = 0; i < 50 && !document.hasFocus(); i++) await new Promise(r => setTimeout(r, 30));
  lastPaste = { exec: false, html: false, focused: document.hasFocus(), via: "" } as typeof lastPaste;
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes("text/html")) {
        const html = await (await item.getType("text/html")).text();
        if (html) { lastPaste.html = true; (lastPaste as any).via = "read"; load(html, text); send({ type: "pasted", html: true }); return; }
      }
    }
  } catch (e) { (lastPaste as any).readError = String(e).slice(0, 80); }
  pending = { text };
  lastPaste.exec = document.execCommand("paste");
  if (!lastPaste.exec) { pending = undefined; load(undefined, text); send({ type: "pasted", html: false }); }
}

window.addEventListener("message", ({ data: m }) => {
  switch (m.type) {
    case "settings":
      settings = { ...settings, ...m.settings };
      buildSwatches(); syncControls(); render();
      break;
    case "snap":
      firstLine = m.firstLine ?? 1; title = m.title ?? ""; tabSize = m.tabSize ?? 4;
      titleInput.value = title;
      if (m.settings) { settings = { ...settings, ...m.settings }; buildSwatches(); syncControls(); }
      if (m.html !== undefined || !m.paste) load(m.html, m.text ?? "");
      else {
        // The extension just copied the selection with its colours: read it back from the clipboard.
        readClipboard(m.text ?? "");
      }
      break;
    case "copy": copy(); break;
    case "saveNow": save(); break;
    case "saved": flash(m.text); break;
    case "probe": send({ type: "probe", lines: snippet?.lines.length ?? 0, firstLine, title, width: canvas.width, height: canvas.height, highlights: [...highlights], background: settings.background, paste: lastPaste, colors: snippet ? new Set(snippet.lines.flat().map(t => t.color).filter(Boolean)).size : 0 }); break;
  }
});
send({ type: "ready" });
