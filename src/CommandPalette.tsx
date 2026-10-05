import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Braces, Command, CornerDownLeft, Hash, HelpCircle, ListFilter, Search } from "lucide-react";
import { DimensionalIcon } from "./DimensionalIcon";
import { rank } from "./fuzzy";
import { keys } from "./platform";

export type PaletteCommand = { id: string; name: string; shortcut?: string; category?: string; run: () => unknown };
export type QuickPick = { title: string; placeholder?: string; items: { label: string; detail?: string; active?: boolean; run: () => unknown }[] };
type Symbol = { name: string; line: number; kind?: string };
type Props = {
  initial: string; files: string[]; recentFiles: string[]; commands: PaletteCommand[]; recentCommands: string[];
  symbols: Symbol[]; lineCount: number; pick?: QuickPick | null; hasWorkspace: boolean;
  onOpenFile: (path: string) => void; onGotoLine: (line: number, column?: number) => void; onCommand: (command: PaletteCommand) => void; onClose: () => void;
};
type Row = { key: string; icon: ReactNode; label: string; indices: number[]; detail?: string; hint?: string; group?: string; run: () => void };

function highlight(text: string, indices: number[]) {
  if (!indices.length) return text;
  const set = new Set(indices);
  return [...text].map((ch, i) => set.has(i) ? <mark key={i}>{ch}</mark> : ch);
}

export function CommandPalette(props: Props) {
  const { pick } = props;
  const [value, setValue] = useState(pick ? "" : props.initial);
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const mode = pick ? "pick" : value.startsWith(">") ? "commands" : value.startsWith(":") ? "line" : value.startsWith("@") ? "symbols" : value.startsWith("?") ? "help" : "files";
  const query = mode === "files" || mode === "pick" ? value.trim() : value.slice(1).trim();

  const rows = useMemo<Row[]>(() => {
    const close = (fn: () => unknown) => () => { props.onClose(); void fn(); };
    if (mode === "pick" && pick) return rank(pick.items, query, item => item.label).map(({ item, indices }, i) => ({ key: item.label + i, icon: item.active ? <CornerDownLeft size={13}/> : <ListFilter size={13}/>, label: item.label, indices, detail: item.detail, run: close(item.run) }));
    if (mode === "commands") {
      const recent = props.recentCommands.map(id => props.commands.find(c => c.id === id)).filter((c): c is PaletteCommand => !!c);
      const ordered = query ? props.commands : [...recent, ...props.commands.filter(c => !recent.includes(c))];
      return rank(ordered, query, c => (c.category ? c.category + ": " : "") + c.name, 200).map(({ item, indices }, i) => ({
        key: item.id, icon: <Command size={14}/>, label: (item.category ? item.category + ": " : "") + item.name, indices, hint: keys(item.shortcut || ""),
        group: !query && i === 0 && recent.length ? "recently used" : !query && i === recent.length && recent.length ? "other commands" : undefined,
        run: () => { props.onClose(); props.onCommand(item); },
      }));
    }
    if (mode === "line") {
      const [line, column] = query.split(/[:,]/).map(n => parseInt(n, 10));
      const valid = line > 0;
      return [{ key: "line", icon: <Hash size={14}/>, label: valid ? `Go to line ${Math.min(line, props.lineCount)}${column ? `, column ${column}` : ""}` : `Type a line number between 1 and ${props.lineCount} to navigate to`, indices: [], run: valid ? close(() => props.onGotoLine(Math.min(line, props.lineCount), column || 1)) : () => {} }];
    }
    if (mode === "symbols") {
      if (!props.symbols.length) return [];
      return rank(props.symbols, query, s => s.name, 200).map(({ item, indices }) => ({ key: item.name + item.line, icon: <Braces size={13}/>, label: item.name, indices, hint: `${item.kind ? item.kind + " · " : ""}line ${item.line}`, run: close(() => props.onGotoLine(item.line)) }));
    }
    if (mode === "help") return [
      { prefix: "", label: "Go to file" }, { prefix: ">", label: "Show and run commands" }, { prefix: "@", label: "Go to symbol in editor" }, { prefix: ":", label: "Go to line / column" },
    ].map(item => ({ key: "help" + item.prefix, icon: <HelpCircle size={14}/>, label: `${item.prefix || "…"}  ${item.label}`, indices: [], run: () => { setValue(item.prefix); setSelected(0); } }));
    const recent = props.recentFiles.filter(path => props.files.includes(path));
    const pool = query ? props.files : [...recent, ...props.files.filter(path => !recent.includes(path))];
    return rank(pool, query, path => path, 80).map(({ item, indices }, i) => {
      const slash = item.lastIndexOf("/"), name = item.slice(slash + 1);
      return {
        key: item, icon: <DimensionalIcon path={item}/>, label: item, indices, detail: slash > 0 ? item.slice(0, slash) : undefined,
        hint: name, group: !query && recent.length && i === 0 ? "recently opened" : !query && recent.length && i === recent.length ? "files" : undefined,
        run: close(() => props.onOpenFile(item)),
      };
    });
  }, [mode, query, pick, props.files, props.recentFiles, props.commands, props.recentCommands, props.symbols, props.lineCount]);

  useEffect(() => setSelected(0), [mode, query]);
  useEffect(() => { list.current?.querySelector(".palette-row.selected")?.scrollIntoView({ block: "nearest" }); }, [selected]);

  const label = mode === "pick" ? pick!.title : mode === "commands" ? "COMMANDS" : mode === "line" ? "GO TO LINE" : mode === "symbols" ? "SYMBOLS IN EDITOR" : mode === "help" ? "AVAILABLE PREFIXES" : "WORKSPACE FILES";
  const placeholder = mode === "pick" ? pick!.placeholder || "Select an option" : props.initial === ">" ? "Type a command…" : "Search files by name (append : to go to a line, @ for symbols, > for commands)";
  const empty = mode === "symbols" ? "No symbols found in this editor." : mode === "files" && !props.hasWorkspace ? "Open a workspace first." : "No matching results.";

  return <div className="overlay" onMouseDown={props.onClose}>
    <div className="palette" role="dialog" aria-label="Command palette" onMouseDown={e => e.stopPropagation()}>
      <div className="palette-search"><Search size={19}/>
        <input autoFocus aria-label="Search commands or files" placeholder={placeholder} value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) { e.preventDefault(); setSelected(s => Math.min(rows.length - 1, s + 1)); }
            else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); }
            else if (e.key === "PageDown") { e.preventDefault(); setSelected(s => Math.min(rows.length - 1, s + 8)); }
            else if (e.key === "PageUp") { e.preventDefault(); setSelected(s => Math.max(0, s - 8)); }
            else if (e.key === "Enter") { e.preventDefault(); rows[selected]?.run(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); props.onClose(); }
          }}/>
        <kbd>esc</kbd></div>
      <div className="palette-label">{label}</div>
      <div className="palette-results" ref={list} role="listbox">
        {rows.map((row, i) => <div key={row.key}>
          {row.group && <div className="palette-group">{row.group}</div>}
          <button role="option" aria-selected={i === selected} className={"palette-row" + (i === selected ? " selected" : "")} onMouseMove={() => i !== selected && setSelected(i)} onClick={row.run}>
            {row.icon}<span>{mode === "files" ? <>{highlight(row.hint || row.label, row.indices.map(n => n - (row.label.length - (row.hint || row.label).length)).filter(n => n >= 0))}{row.detail && <small>{row.detail}</small>}</> : <>{highlight(row.label, row.indices)}{row.detail && <small>{row.detail}</small>}</>}</span>
            {row.hint && mode !== "files" ? <kbd>{row.hint}</kbd> : mode === "files" ? <ArrowUpRight size={13}/> : null}
          </button></div>)}
        {!rows.length && <p>{empty}</p>}
      </div>
      <div className="palette-footer">↑↓ to navigate · Enter to select · Esc to close{mode === "files" && " · type ? for help"}</div>
    </div>
  </div>;
}
