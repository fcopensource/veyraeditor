import { useEffect, useState } from "react";
import { ArrowDownToDot, ArrowUpFromDot, Bug, ChevronDown, ChevronRight, CircleAlert, Download, LoaderCircle, Pause, Play, Plus, RedoDot, RotateCcw, Square, Trash2, X } from "lucide-react";
import { allBreakpoints, clearBreakpoints, onBreakpointsChange, removeBreakpoint } from "./debug/breakpoints";
import { continueRun, debugState, evaluate, isDebugging, onDebugChange, pauseRun, restartDebugging, selectFrame, startDebugging, stepInto, stepOut, stepOver, stopDebugging, variables, type DebugState, type Variable } from "./debug/session";
import { environment, installTool, onToolsChange, refreshTools, toolState } from "./lsp/tools";
import { isMac } from "./platform";
import "./debug/debug.css";

export const debugKeys = { start: "F5", stop: "⇧F5", restart: isMac ? "⇧⌘F5" : "Ctrl+Shift+F5", over: "F10", into: "F11", out: "⇧F11", toggle: "F9" };
export function useDebugState() {
  const [state, setState] = useState<DebugState>(debugState());
  useEffect(() => onDebugChange(setState), []);
  return state;
}

/** One variable; objects, lists and dicts expand to load their children on demand. */
function VariableNode({ variable, depth, stamp }: { variable: Variable; depth: number; stamp: string }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Variable[] | null>(null);
  useEffect(() => { if (open && variable.ref) void variables(variable.ref).then(setChildren); }, [open, variable.ref, stamp]);
  return <>
    <button className="dbg-var" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => variable.ref && setOpen(v => !v)} title={variable.type ? `${variable.name}: ${variable.type}` : variable.name}>
      {variable.ref ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <i className="dbg-leaf" />}
      <span className="dbg-name">{variable.name}</span><span className="dbg-value">{variable.value}</span>
    </button>
    {open && (children ? children.map(child => <VariableNode key={child.name} variable={child} depth={depth + 1} stamp={stamp} />) : <div className="dbg-loading" style={{ paddingLeft: 22 + depth * 14 }}>Loading…</div>)}
  </>;
}

function ScopeNode({ name, ref, stamp, defaultOpen }: { name: string; ref: number; stamp: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState<Variable[] | null>(null);
  useEffect(() => { if (open) void variables(ref).then(setItems); }, [open, ref, stamp]);
  return <>
    <button className="dbg-scope" onClick={() => setOpen(v => !v)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{name}</button>
    {open && (items ? (items.length ? items.map(v => <VariableNode key={v.name} variable={v} depth={1} stamp={stamp} />) : <div className="dbg-empty">No variables</div>) : <div className="dbg-loading">Loading…</div>)}
  </>;
}

function Section({ title, count, children, actions }: { title: string; count?: number; children: React.ReactNode; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return <section className="dbg-section">
    <header><button onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>{title}</span>{count !== undefined && count > 0 && <i>{count}</i>}</button>{actions}</header>
    {open && <div className="dbg-section-body">{children}</div>}
  </section>;
}

function Watch({ state }: { state: DebugState }) {
  const [expressions, setExpressions] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("veyra.watch") || "[]"); } catch { return []; } });
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  useEffect(() => { try { localStorage.setItem("veyra.watch", JSON.stringify(expressions)); } catch { /* blocked */ } }, [expressions]);
  useEffect(() => {
    if (state.status !== "paused") { setValues({}); return; }
    let current = true;
    void Promise.all(expressions.map(e => evaluate(e, "watch").then(r => [e, r.value] as const).catch(error => [e, String(error.message || error)] as const)))
      .then(results => { if (current) setValues(Object.fromEntries(results)); });
    return () => { current = false; };
  }, [expressions, state.status, state.frameId]);
  return <>
    {expressions.map(expression => <div className="dbg-watch" key={expression}><span className="dbg-name">{expression}</span><span className="dbg-value">{values[expression] ?? (state.status === "paused" ? "…" : "not available")}</span><button title="Remove watch" aria-label={`Remove watch ${expression}`} onClick={() => setExpressions(all => all.filter(e => e !== expression))}><X size={11} /></button></div>)}
    <form className="dbg-watch-add" onSubmit={event => { event.preventDefault(); const value = draft.trim(); if (value && !expressions.includes(value)) setExpressions(all => [...all, value]); setDraft(""); }}>
      <Plus size={12} /><input aria-label="Add watch expression" placeholder="Add expression to watch" value={draft} onChange={e => setDraft(e.target.value)} />
    </form>
  </>;
}

export function DebugPanel({ active, onOpen, notify }: { active: string; onOpen: (path: string, line: number) => void; notify: (message: string) => void }) {
  const state = useDebugState();
  const [, setTick] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void refreshTools(); const a = onToolsChange(() => setTick(n => n + 1)); const b = onBreakpointsChange(() => setTick(n => n + 1)); return () => { a(); b(); }; }, []);
  const tool = toolState("debugpy");
  const env = environment();
  const python = active.toLowerCase().endsWith(".py") ? active : "";
  const running = isDebugging();
  const target = running ? state.program : python;
  const stamp = state.frames.map(f => f.id).join(",") + ":" + state.frameId;
  const breakpoints = allBreakpoints();

  async function start() {
    setError("");
    if (!target) return;
    try { await startDebugging(target); } catch (e) { setError(String((e as Error).message || e)); }
  }
  async function install() {
    setInstalling(true); setError("");
    try { await installTool("debugpy"); notify("Python Debugger installed."); } catch (e) { setError(String(e)); } finally { setInstalling(false); }
  }

  return <section className="debug-panel" aria-label="Run and Debug">
    {!tool.installed ? <div className="dbg-setup">
      <Bug size={22} />
      <b>Debug Python with breakpoints</b>
      <p>Step through code, inspect variables and evaluate expressions. Powered by debugpy, the engine inside Microsoft&apos;s Python Debugger.</p>
      {env.python ? <small>Uses Python {env.python}{env.pythonPath ? ` · ${env.pythonPath}` : ""}</small> : <p className="extension-warning">Install <b>Python 3.8 or newer</b> from python.org, then restart Veyra.</p>}
      <button className="dbg-primary" disabled={installing || tool.busy || !env.python} onClick={() => void install()}>{installing || tool.busy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{installing || tool.busy ? "Installing…" : "Install Python Debugger"}</button>
    </div> : <>
      <div className="dbg-launch">
        {!running
          ? <button className="dbg-primary" disabled={!target} onClick={() => void start()} title={`Start debugging · ${debugKeys.start}`}><Play size={14} />{target ? `Debug ${target.split("/").pop()}` : "Run and Debug"}</button>
          : <div className="dbg-toolbar" role="toolbar" aria-label="Debug controls">
            {state.status === "paused"
              ? <button title={`Continue · ${debugKeys.start}`} aria-label="Continue" onClick={() => void continueRun()}><Play size={15} /></button>
              : <button title="Pause" aria-label="Pause" disabled={state.status !== "running"} onClick={() => void pauseRun()}><Pause size={15} /></button>}
            <button title={`Step over · ${debugKeys.over}`} aria-label="Step over" disabled={state.status !== "paused"} onClick={() => void stepOver()}><RedoDot size={15} /></button>
            <button title={`Step into · ${debugKeys.into}`} aria-label="Step into" disabled={state.status !== "paused"} onClick={() => void stepInto()}><ArrowDownToDot size={15} /></button>
            <button title={`Step out · ${debugKeys.out}`} aria-label="Step out" disabled={state.status !== "paused"} onClick={() => void stepOut()}><ArrowUpFromDot size={15} /></button>
            <button title={`Restart · ${debugKeys.restart}`} aria-label="Restart" onClick={() => void restartDebugging()}><RotateCcw size={15} /></button>
            <button title={`Stop · ${debugKeys.stop}`} aria-label="Stop" className="dbg-stop" onClick={() => void stopDebugging()}><Square size={14} /></button>
          </div>}
        <p className="dbg-status">{running
          ? (state.status === "paused" ? <><i className="dbg-dot paused" />Paused{state.reason ? ` on ${state.reason}` : ""}</> : state.status === "starting" ? <><LoaderCircle size={12} className="spin" />Starting {state.program}…</> : <><i className="dbg-dot running" />Running {state.program}</>)
          : target ? <>Click left of a line number (or press {debugKeys.toggle}) to add a breakpoint, then {debugKeys.start}.</> : <>Open a Python file to debug it.</>}</p>
        {(error || state.error) && <p className="extension-error" role="alert"><CircleAlert size={12} /> {error || state.error}</p>}
      </div>

      <Section title="Variables">
        {state.status === "paused" ? state.scopes.map((scope, i) => <ScopeNode key={scope.name + stamp} name={scope.name} ref={scope.ref} stamp={stamp} defaultOpen={i === 0} />) : <div className="dbg-empty">{running ? "Variables appear when execution pauses." : "Not debugging."}</div>}
      </Section>
      <Section title="Watch"><Watch state={state} /></Section>
      <Section title="Call stack" count={state.frames.length}>
        {state.frames.length ? state.frames.map(frame => <button key={frame.id} className={"dbg-frame" + (frame.id === state.frameId ? " current" : "") + (frame.path ? "" : " external")} onClick={() => void selectFrame(frame.id)}>
          <span>{frame.name}</span><small>{frame.path ? `${frame.path.split("/").pop()}:${frame.line}` : (frame.absolute.split(/[\\/]/).pop() || "") + (frame.line ? `:${frame.line}` : "")}</small>
        </button>) : <div className="dbg-empty">{running ? "Running…" : "Not debugging."}</div>}
      </Section>
      <Section title="Breakpoints" count={breakpoints.reduce((n, [, lines]) => n + lines.length, 0)} actions={breakpoints.length ? <button className="dbg-icon" title="Remove all breakpoints" aria-label="Remove all breakpoints" onClick={clearBreakpoints}><Trash2 size={12} /></button> : undefined}>
        {breakpoints.length ? breakpoints.flatMap(([path, lines]) => lines.map(line => <div key={path + line} className="dbg-breakpoint">
          <i className="dbg-dot breakpoint" /><button onClick={() => onOpen(path, line)}><span>{path.split("/").pop()}</span><small>{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) + " · " : ""}line {line}</small></button>
          <button className="dbg-icon" title="Remove breakpoint" aria-label={`Remove breakpoint ${path}:${line}`} onClick={() => removeBreakpoint(path, line)}><X size={11} /></button>
        </div>)) : <div className="dbg-empty">Click left of a line number to add one.</div>}
      </Section>
    </>}
  </section>;
}
