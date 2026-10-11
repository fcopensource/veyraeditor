import { useEffect, useRef, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { clearConsole, consoleEvaluate } from "./debug/session";
import { useDebugState } from "./DebugPanel";

/** Program output and an expression prompt that evaluates in the paused frame (like VS Code's Debug Console). */
export function DebugConsole() {
  const state = useDebugState();
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [state.output.length]);
  const paused = state.status === "paused";
  return <div className="debug-console">
    <div className="dbg-output" ref={list} role="log" aria-label="Debug console output">
      {state.output.length ? state.output.map((line, i) => <span key={i} className={"dbg-out " + line.category}>{line.text}</span>) : <span className="dbg-out console">Program output and evaluation results appear here.</span>}
    </div>
    <form className="dbg-repl" onSubmit={event => {
      event.preventDefault(); const expression = draft.trim(); if (!expression) return;
      void consoleEvaluate(expression); setHistory(h => [expression, ...h.filter(e => e !== expression)].slice(0, 50)); setDraft(""); setCursor(-1);
    }}>
      <ChevronRight size={14} />
      <input aria-label="Evaluate expression" disabled={!paused} placeholder={paused ? "Evaluate an expression in the current frame" : "Pause at a breakpoint to evaluate expressions"} value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "ArrowUp" && history.length) { e.preventDefault(); const next = Math.min(cursor + 1, history.length - 1); setCursor(next); setDraft(history[next]); }
          if (e.key === "ArrowDown") { e.preventDefault(); const next = cursor - 1; setCursor(next); setDraft(next >= 0 ? history[next] : ""); }
        }} />
      <button type="button" title="Clear console" aria-label="Clear debug console" onClick={clearConsole}><Trash2 size={13} /></button>
    </form>
  </div>;
}
