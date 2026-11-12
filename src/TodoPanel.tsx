import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCheck, ChevronDown, ChevronRight, ListTodo, RefreshCw } from "lucide-react";
import type { SearchHit } from "./SearchPanel";

// The TODO tool window: every TODO, FIXME, HACK, XXX and BUG comment in the workspace, grouped by file.
export const TODO_PATTERN = "\\b(TODO|FIXME|HACK|XXX|BUG)\\b";
const TAGS = ["TODO", "FIXME", "HACK", "XXX", "BUG"] as const;
type Tag = typeof TAGS[number];

export function todoTag(text: string): Tag {
  const found = text.match(/\b(TODO|FIXME|HACK|XXX|BUG)\b/);
  return (found ? found[1] : "TODO") as Tag;
}

type Props = { root: string; generation: number; openFile: (path: string, line: number, column: number) => void; onCount?: (count: number) => void };

export function TodoPanel({ root, generation, openFile, onCount }: Props) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState("");
  const [filter, setFilter] = useState<Tag | "ALL">("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!root) { setHits([]); onCount?.(0); return; }
    let stale = false;
    setLoading(true);
    invoke<SearchHit[]>("search_workspace", { query: TODO_PATTERN, options: { caseSensitive: true, wholeWord: false, regex: true, include: "", exclude: "" } })
      .then(results => { if (!stale) { setHits(results || []); setProblem(""); onCount?.((results || []).length); } })
      .catch(error => { if (!stale) { setHits([]); setProblem(String(error)); } })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [root, generation, refresh]);

  const counts = useMemo(() => {
    const map = new Map<Tag, number>();
    for (const hit of hits) map.set(todoTag(hit.text), (map.get(todoTag(hit.text)) || 0) + 1);
    return map;
  }, [hits]);
  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const hit of hits) if (filter === "ALL" || todoTag(hit.text) === filter) map.set(hit.path, [...(map.get(hit.path) || []), hit]);
    return [...map.entries()];
  }, [hits, filter]);
  const shown = groups.reduce((n, [, items]) => n + items.length, 0);

  return <div className="todo-panel">
    <div className="todo-toolbar">
      <button className={filter === "ALL" ? "active" : ""} onClick={() => setFilter("ALL")}>All <span>{hits.length}</span></button>
      {TAGS.filter(tag => counts.get(tag)).map(tag => <button key={tag} data-tag={tag} className={filter === tag ? "active" : ""} onClick={() => setFilter(tag)}>{tag} <span>{counts.get(tag)}</span></button>)}
      <div/>
      <small>{loading ? "Scanning…" : `${shown} items in ${groups.length} files`}</small>
      <button title="Scan again" aria-label="Scan again" onClick={() => setRefresh(n => n + 1)}><RefreshCw size={13} className={loading ? "spin" : ""}/></button>
    </div>
    <div className="todo-list">
      {problem && <div className="todo-empty">{problem}</div>}
      {!problem && !loading && !groups.length && <div className="todo-empty"><CheckCheck size={18}/>{root ? "Nothing left to do. No TODO or FIXME comments in this project." : "Open a project to see its TODOs."}</div>}
      {groups.map(([path, items]) => {
        const open = !collapsed.has(path);
        return <div key={path} className="todo-file">
          <button className="todo-file-head" onClick={() => setCollapsed(set => { const next = new Set(set); if (open) next.add(path); else next.delete(path); return next; })}>
            {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<ListTodo size={13}/><b>{path.slice(path.lastIndexOf("/") + 1)}</b><small>{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}</small><span>{items.length}</span>
          </button>
          {open && items.map((hit, i) => {
            const tag = todoTag(hit.text);
            const at = hit.text.search(/\b(TODO|FIXME|HACK|XXX|BUG)\b/);
            const note = (at >= 0 ? hit.text.slice(at + tag.length) : hit.text).replace(/^[\s:(\-\])]+/, "").replace(/\s*(\*\/|-->)\s*$/, "").trim();
            return <button key={i} className="todo-hit" title={`${path}:${hit.line}`} onClick={() => openFile(hit.path, hit.line, hit.column)}>
              <em data-tag={tag}>{tag}</em><span>{note || hit.text.trim()}</span><small>{hit.line}</small>
            </button>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
