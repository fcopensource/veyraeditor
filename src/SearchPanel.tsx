import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CaseSensitive, ChevronDown, ChevronRight, ListCollapse, MoreHorizontal, Regex, Replace, ReplaceAll, Search, WholeWord, X } from "lucide-react";
import { DimensionalIcon } from "./DimensionalIcon";

export type SearchHit = { path: string; line: number; column: number; text: string; start: number; end: number };
type Options = { caseSensitive: boolean; wholeWord: boolean; regex: boolean; include: string; exclude: string };
type Props = {
  root: string; seed: { text: string; n: number }; visible: boolean;
  openFile: (path: string, line: number, column?: number) => void;
  /** Resolve unsaved buffers for the affected files before writing to disk; false cancels. */
  beforeReplace: (paths: string[], count: number) => Promise<boolean>;
  afterReplace: (paths: string[], count: number) => void;
};

function preview(hit: SearchHit) {
  if (hit.start === undefined || hit.end === undefined) return hit.text;
  const chars = [...hit.text];
  return <>{chars.slice(0, hit.start).join("")}<mark>{chars.slice(hit.start, hit.end).join("")}</mark>{chars.slice(hit.end).join("")}</>;
}

export function SearchPanel({ root, seed, visible, openFile, beforeReplace, afterReplace }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [options, setOptions] = useState<Options>({ caseSensitive: false, wholeWord: false, regex: false, include: "", exclude: "" });
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => { if (seed.text) setQuery(seed.text); }, [seed]);
  useEffect(() => {
    if (!root || !query) { setHits([]); setProblem(""); return; }
    let stale = false;
    const timer = setTimeout(() => {
      setSearching(true);
      invoke<SearchHit[]>("search_workspace", { query, options })
        .then(results => { if (!stale) { setHits(results || []); setProblem(""); setDismissed(new Set()); } })
        .catch(error => { if (!stale) { setHits([]); setProblem(String(error)); } })
        .finally(() => { if (!stale) setSearching(false); });
    }, 300);
    return () => { stale = true; clearTimeout(timer); };
  }, [query, options, root, generation]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) if (!dismissed.has(hit.path)) map.set(hit.path, [...(map.get(hit.path) || []), hit]);
    return [...map.entries()];
  }, [hits, dismissed]);
  const total = groups.reduce((sum, [, items]) => sum + items.length, 0);

  async function replace(paths: string[]) {
    const count = groups.filter(([path]) => paths.includes(path)).reduce((sum, [, items]) => sum + items.length, 0);
    if (!paths.length || !await beforeReplace(paths, count)) return;
    try {
      const replaced = await invoke<number>("replace_in_files", { query, options, replacement, paths });
      afterReplace(paths, replaced);
      setGeneration(n => n + 1);
    } catch (error) { setProblem(String(error)); }
  }
  const toggle = (key: "caseSensitive" | "wholeWord" | "regex") => setOptions(o => ({ ...o, [key]: !o[key] }));
  const flag = (key: "caseSensitive" | "wholeWord" | "regex", title: string, Icon: typeof Regex) =>
    <button type="button" className={"search-flag" + (options[key] ? " on" : "")} title={title} aria-label={title} aria-pressed={options[key]} onClick={() => toggle(key)}><Icon size={15}/></button>;

  return <div className="panel-body search-panel" hidden={!visible}>
    <div className="search-form">
      <button className="replace-toggle" title="Toggle replace" aria-label="Toggle replace" aria-expanded={showReplace} onClick={() => setShowReplace(v => !v)}>{showReplace ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
      <div className="search-fields">
        <label className="search-input"><Search size={14}/><input autoFocus aria-label="Search in files" placeholder="Search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") setGeneration(n => n + 1); }}/>
          {flag("caseSensitive", "Match case", CaseSensitive)}{flag("wholeWord", "Match whole word", WholeWord)}{flag("regex", "Use regular expression", Regex)}</label>
        {showReplace && <label className="search-input"><Replace size={14}/><input aria-label="Replace" placeholder={options.regex ? "Replace ($1 for groups)" : "Replace"} value={replacement} onChange={e => setReplacement(e.target.value)}/>
          <button type="button" className="search-flag" title="Replace all" aria-label="Replace all" disabled={!total} onClick={() => void replace(groups.map(([path]) => path))}><ReplaceAll size={15}/></button></label>}
      </div>
    </div>
    <div className="search-details-toggle"><button title="Toggle search details" aria-label="Toggle search details" onClick={() => setShowDetails(v => !v)}><MoreHorizontal size={15}/></button></div>
    {showDetails && <div className="search-globs">
      <label>files to include<input placeholder="e.g. *.ts, src/**/*.{ts,tsx}" value={options.include} onChange={e => setOptions(o => ({ ...o, include: e.target.value }))}/></label>
      <label>files to exclude<input placeholder="e.g. **/*.test.ts, docs" value={options.exclude} onChange={e => setOptions(o => ({ ...o, exclude: e.target.value }))}/></label>
    </div>}
    <div className="search-summary">
      <small className={problem ? "search-problem" : "hint"}>{problem || (searching ? "Searching…" : query ? `${total} result${total === 1 ? "" : "s"} in ${groups.length} file${groups.length === 1 ? "" : "s"}${hits.length >= 2000 ? " (limited to 2,000)" : ""}` : "Search across your workspace. Dependency and build folders are skipped.")}</small>
      {groups.length > 0 && <button title="Collapse all" aria-label="Collapse all" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map(([path]) => path)))}><ListCollapse size={14}/></button>}
    </div>
    <div className="search-tree">
      {groups.map(([path, items]) => {
        const slash = path.lastIndexOf("/"), open = !collapsed.has(path);
        return <section key={path}>
          <div className="search-file">
            <button className="search-file-name" onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next; })}>
              {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}<DimensionalIcon path={path}/><b>{path.slice(slash + 1)}</b><small>{slash > 0 ? path.slice(0, slash) : ""}</small></button>
            <span className="search-count">{items.length}</span>
            <div className="search-file-actions">
              {showReplace && <button title="Replace all in file" aria-label={"Replace all in " + path} onClick={() => void replace([path])}><ReplaceAll size={13}/></button>}
              <button title="Dismiss" aria-label={"Dismiss " + path} onClick={() => setDismissed(previous => new Set(previous).add(path))}><X size={13}/></button>
            </div>
          </div>
          {open && items.map((hit, i) => <button key={i} className="search-hit" title={`${path}:${hit.line}:${hit.column}`} onClick={() => openFile(hit.path, hit.line, hit.column)}>
            <span>{preview(hit)}</span><small>{hit.line}</small></button>)}
        </section>;
      })}
    </div>
  </div>;
}
