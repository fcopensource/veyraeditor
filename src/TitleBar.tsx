import { useEffect, useRef, useState } from "react";
import { ChevronRight, Menu, Minus, Square, Copy, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMac, keys } from "./platform";

/* On Windows and Linux the toolbar is the title bar, as in Android Studio: the main menu sits behind ☰ and the
   window buttons on the right. macOS keeps its own menu bar and window buttons. */

/** Only in the desktop app (not in a browser preview) and not on macOS. */
export const customTitleBar = !isMac && typeof window !== "undefined" && !!(window as { __TAURI_INTERNALS__?: { metadata?: unknown } }).__TAURI_INTERNALS__?.metadata;

type Item = [id: string, label: string, shortcut?: string] | "-";
const MENU: [string, Item[]][] = [
  ["File", [["file.new", "New File…", "⌘N"], ["file.open", "Open Folder…", "⌘O"], "-", ["file.save", "Save", "⌘S"], ["file.saveAll", "Save All", "⇧⌘S"], "-", ["file.closeEditor", "Close Editor", "⌘W"], ["file.closeFolder", "Close Folder"]]],
  ["Edit", [["edit.undo", "Undo", "⌘Z"], ["edit.redo", "Redo", "⇧⌘Z"], "-", ["edit.cut", "Cut", "⌘X"], ["edit.copy", "Copy", "⌘C"], ["edit.paste", "Paste", "⌘V"], ["edit.selectAll", "Select All", "⌘A"], "-", ["edit.find", "Find", "⌘F"], ["edit.replace", "Replace", "⌥⌘F"], ["edit.findFiles", "Find in Files", "⇧⌘F"], "-", ["edit.toggleLineComment", "Toggle Line Comment", "⌘/"], ["edit.toggleBlockComment", "Toggle Block Comment", "⌥⌘A"]]],
  ["Selection", [["selection.expand", "Expand Selection", "⌃⇧→"], ["selection.shrink", "Shrink Selection", "⌃⇧←"], "-", ["selection.copyUp", "Copy Line Up", "⌥⇧↑"], ["selection.copyDown", "Copy Line Down", "⌥⇧↓"], ["selection.moveUp", "Move Line Up", "⌥↑"], ["selection.moveDown", "Move Line Down", "⌥↓"], "-", ["selection.cursorAbove", "Add Cursor Above", "⌥⌘↑"], ["selection.cursorBelow", "Add Cursor Below", "⌥⌘↓"], ["selection.nextMatch", "Add Next Occurrence", "⌘D"], ["selection.allMatches", "Select All Occurrences", "⇧⌘L"]]],
  ["View", [["view.palette", "Command Palette…", "⇧⌘P"], "-", ["view.explorer", "Project", "⇧⌘E"], ["view.search", "Find in Files", "⇧⌘F"], ["view.git", "Commit", "⌃⇧G"], ["view.extensions", "Extensions", "⇧⌘X"], ["view.problems", "Problems", "⇧⌘M"], ["view.terminal", "Terminal", "⌃`"], "-", ["view.wordWrap", "Word Wrap", "⌥Z"], ["view.split", "Split Editor", "⌘\\"]]],
  ["Go", [["go.file", "Go to File…", "⌘P"], ["go.symbol", "Go to Symbol…", "⇧⌘O"], ["go.line", "Go to Line…", "⌃G"], "-", ["go.definition", "Go to Definition", "F12"], ["go.references", "Go to References", "⇧F12"], "-", ["go.nextProblem", "Next Problem", "F8"], ["go.previousProblem", "Previous Problem", "⇧F8"]]],
  ["Run", [["run.active", "Run Active File", "⌃⌥N"], ["run.debug", "Start Debugging", "F5"], ["run.breakpoint", "Toggle Breakpoint", "F9"]]],
  ["Terminal", [["terminal.new", "New Terminal", "⌃⇧`"], ["terminal.runActive", "Run Active File", "⌃⌥N"]]],
  ["Help", [["help.commands", "Show All Commands", "⇧⌘P"], ["help.updates", "Check for Updates…"], ["help.about", "About Veyra"]]],
];

const run = (id: string) => window.dispatchEvent(new CustomEvent("veyra-menu", { detail: id }));

export function MainMenu() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", close, true); window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  return <div className="main-menu" ref={root}>
    <button className="icon-button" aria-label="Main menu" aria-haspopup="menu" aria-expanded={open} title="Main menu" onClick={() => setOpen(v => !v)}><Menu size={17} /></button>
    {open && <div className="main-menu-panel" role="menu" aria-label="Main menu">
      <div className="main-menu-sections">{MENU.map(([name], i) => <button key={name} role="menuitem" aria-haspopup="menu" className={i === section ? "active" : ""} onPointerEnter={() => setSection(i)} onClick={() => setSection(i)}>{name}<ChevronRight size={13} /></button>)}</div>
      <div className="main-menu-items" role="menu" aria-label={MENU[section][0]}>{MENU[section][1].map((item, i) => item === "-" ? <i key={i} /> :
        <button key={item[0]} role="menuitem" onClick={() => { setOpen(false); run(item[0]); }}><span>{item[1]}</span>{item[2] && <kbd>{keys(item[2])}</kbd>}</button>)}</div>
    </div>}
  </div>;
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized).catch(() => {});
    const off = win.onResized(() => { void win.isMaximized().then(setMaximized).catch(() => {}); });
    return () => { void off.then(dispose => dispose()); };
  }, []);
  const win = () => getCurrentWindow();
  return <div className="window-controls">
    <button aria-label="Minimize" title="Minimize" onClick={() => void win().minimize()}><Minus size={15} /></button>
    <button aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} onClick={() => void win().toggleMaximize()}>{maximized ? <Copy size={13} /> : <Square size={12} />}</button>
    <button className="close" aria-label="Close" title="Close" onClick={() => void win().close()}><X size={16} /></button>
  </div>;
}
