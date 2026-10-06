"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, FileCode2, GitBranch, HeartPulse, Play, Sparkles, TerminalSquare } from "lucide-react";

/* A scripted, three-act tour of Veyra: write with autocomplete and AI ghost text,
   review an AI edit as a diff, then run the tests in the terminal. */

type Step =
  | { kind: "type"; text: string }
  | { kind: "popup"; items: string[]; pick: number; insert: string }
  | { kind: "ghost"; text: string }
  | { kind: "pause"; ms: number };

const WRITE: Step[] = [
  { kind: "type", text: 'import { scan } from "./lexer";\n\nexport function parse(input: string) {\n  const source = input.' },
  { kind: "popup", items: ["trim()", "trimEnd()", "trimStart()", "toLowerCase()"], pick: 0, insert: "trim();" },
  { kind: "type", text: "\n  " },
  { kind: "ghost", text: "if (!source) return [];" },
  { kind: "type", text: "\n  return scan(source).map(toNode);\n}" },
  { kind: "pause", ms: 1800 },
];
const DIFF = [
  { tone: "ctx", text: "export function parse(input: string) {" },
  { tone: "del", text: "  const tokens = scan(input);" },
  { tone: "add", text: "  const source = input.trim();" },
  { tone: "add", text: "  if (!source) return [];" },
  { tone: "add", text: "  const tokens = scan(source);" },
  { tone: "ctx", text: "  return tokens.map(toNode);" },
  { tone: "ctx", text: "}" },
];
const TERMINAL = [
  { tone: "cmd", text: "$ npm test" },
  { tone: "dim", text: " RUN  v2.1.4  ~/projects/parser" },
  { tone: "ok", text: " ✓ parse › returns [] for empty input   1ms" },
  { tone: "ok", text: " ✓ parse › trims surrounding whitespace 1ms" },
  { tone: "ok", text: " ✓ lexer › tokenizes keywords           2ms" },
  { tone: "ok", text: " ✓ lexer › handles unicode identifiers  3ms" },
  { tone: "dim", text: "" },
  { tone: "sum", text: " Test Files  4 passed (4)" },
  { tone: "sum", text: "      Tests  42 passed (42)" },
  { tone: "dim", text: "   Duration  412ms" },
];
const ACTS = [
  { id: "write", label: "Write", icon: FileCode2, blurb: "Autocomplete and AI suggestions as you type" },
  { id: "review", label: "Review", icon: Sparkles, blurb: "Every AI edit arrives as a diff you approve" },
  { id: "run", label: "Run", icon: TerminalSquare, blurb: "A real terminal, right beside your code" },
] as const;

function highlight(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\/\/.*$)|("[^"]*"?|'[^']*'?)|\b(import|from|export|function|const|let|return|if|await|async|type|new)\b|\b(\d+)\b|([A-Za-z_$][\w$]*)(?=\()|([A-Z][\w]*)|([{}()[\];,.:=<>!?+|&]+)/g;
  let last = 0, match: RegExpExecArray | null, key = 0;
  while ((match = pattern.exec(line))) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const cls = match[1] ? "c" : match[2] ? "s" : match[3] ? "k" : match[4] ? "n" : match[5] ? "f" : match[6] ? "t" : "p";
    parts.push(<span key={key++} className={"tok-" + cls}>{match[0]}</span>);
    last = match.index + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

const sleep = (ms: number, signal: { stop: boolean }) => new Promise<void>((resolve, reject) => setTimeout(() => (signal.stop ? reject(new Error("stopped")) : resolve()), ms));

export function LiveIDE() {
  const [act, setAct] = useState(0);
  const [progress, setProgress] = useState(0);
  const [doc, setDoc] = useState("");
  const [popup, setPopup] = useState<{ items: string[]; active: number } | null>(null);
  const [ghost, setGhost] = useState("");
  const [diffShown, setDiffShown] = useState(0);
  const [applied, setApplied] = useState(false);
  const [terminal, setTerminal] = useState(0);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  const manual = useRef(false);

  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const signal = { stop: false };
    const reset = () => { setDoc(""); setPopup(null); setGhost(""); setDiffShown(0); setApplied(false); setTerminal(0); setProgress(0); };
    const finalState = () => {
      if (act === 0) setDoc(WRITE.reduce((text, step) => text + (step.kind === "type" ? step.text : step.kind === "popup" ? step.insert : step.kind === "ghost" ? step.text : ""), ""));
      if (act === 1) { setDiffShown(DIFF.length); setApplied(true); }
      if (act === 2) setTerminal(TERMINAL.length);
      setProgress(1);
    };
    reset();
    if (reduced || !inView) { finalState(); return; }

    (async () => {
      try {
        if (act === 0) {
          let text = "", steps = 0;
          for (const step of WRITE) {
            if (step.kind === "type") {
              for (const ch of step.text) { text += ch; setDoc(text); await sleep(ch === "\n" ? 140 : 26 + Math.random() * 38, signal); }
            } else if (step.kind === "popup") {
              setPopup({ items: step.items, active: 0 }); await sleep(650, signal);
              setPopup({ items: step.items, active: step.pick }); await sleep(450, signal);
              setPopup(null); text += step.insert; setDoc(text); await sleep(250, signal);
            } else if (step.kind === "ghost") {
              setGhost(step.text); await sleep(1500, signal); setGhost(""); text += step.text; setDoc(text); await sleep(300, signal);
            } else await sleep(step.ms, signal);
            setProgress(++steps / WRITE.length);
          }
        } else if (act === 1) {
          for (let i = 1; i <= DIFF.length; i++) { setDiffShown(i); setProgress(i / (DIFF.length + 2)); await sleep(380, signal); }
          await sleep(900, signal); setApplied(true); setProgress(1); await sleep(2200, signal);
        } else {
          for (let i = 1; i <= TERMINAL.length; i++) { setTerminal(i); setProgress(i / TERMINAL.length); await sleep(i === 1 ? 700 : 260, signal); }
          await sleep(2600, signal);
        }
        if (!manual.current) setAct(a => (a + 1) % ACTS.length);
        manual.current = false;
      } catch { /* superseded by another act */ }
    })();
    return () => { signal.stop = true; };
  }, [act, inView]);

  const lines = doc.split("\n");
  const Icon = ACTS[act].icon;
  return (
    <section id="live-code" className="live-ide" ref={root} data-reveal>
      <div className="live-copy">
        <span>// SEE IT WORK</span>
        <h2>From idea to <em>shipped</em>,<br />in one window.</h2>
        <p>Write with intelligent completions, review every AI change as a diff, and run your tests, all without leaving Veyra.</p>
        <div className="act-list" role="tablist" aria-label="Veyra workflow demo">
          {ACTS.map((item, index) => {
            const ActIcon = item.icon;
            return (
              <button key={item.id} role="tab" aria-selected={act === index} className={act === index ? "active" : ""} onClick={() => { manual.current = true; setAct(index); }}>
                <ActIcon size={17} />
                <span><b>0{index + 1} · {item.label}</b><small>{item.blurb}</small></span>
                <i style={{ transform: `scaleX(${act === index ? progress : index < act ? 1 : 0})` }} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="ide-window">
        <header>
          <div className="dots"><i /><i /><i /></div>
          <span><Icon size={13} /> {act === 0 ? "src / parser.ts" : act === 1 ? "Review AI edit · parser.ts" : "Terminal · pwsh"}</span>
          <b className="health"><HeartPulse size={12} /> 98</b>
        </header>
        <div className="ide-body">
          {act === 0 && (
            <div className="ide-code">
              <aside>{lines.map((_, i) => <span key={i} className="git-added">{i + 1}</span>)}</aside>
              <pre>
                {lines.map((line, i) => (
                  <div key={i}>
                    {highlight(line)}
                    {i === lines.length - 1 && <>{ghost && <span className="ghost">{ghost}<kbd>Tab</kbd></span>}<i className="caret" /></>}
                    {i === lines.length - 1 && popup && (
                      <ul className="completions">
                        {popup.items.map((item, k) => <li key={item} className={k === popup.active ? "active" : ""}><span className="tok-f">ƒ</span>{item}<small>string</small></li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </pre>
            </div>
          )}
          {act === 1 && (
            <div className="ide-review">
              <div className="ai-bubble"><Sparkles size={14} /><p>Empty input crashed the lexer. I trim the input and return early. Here is the change:</p></div>
              <pre className="review-diff">
                {DIFF.slice(0, diffShown).map((line, i) => <div key={i} className={line.tone}><b>{line.tone === "add" ? "+" : line.tone === "del" ? "−" : " "}</b>{highlight(line.text)}</div>)}
              </pre>
              <div className={"review-actions" + (applied ? " applied" : "")}>
                {applied ? <><Check size={14} />Applied to the buffer · Ctrl/⌘Z to undo</> : <><button>Discard</button><button className={diffShown === DIFF.length ? "pulse" : ""}>Apply edit</button></>}
              </div>
            </div>
          )}
          {act === 2 && (
            <pre className="ide-terminal">
              {TERMINAL.slice(0, terminal).map((line, i) => <div key={i} className={"t-" + line.tone}>{line.text || " "}</div>)}
              {terminal < TERMINAL.length && <i className="caret" />}
            </pre>
          )}
        </div>
        <div className="ide-status">
          <span><GitBranch size={12} /> main {act === 0 ? "· 1 modified" : act === 1 ? "· AI edit pending" : "↑1"}</span>
          <span>{act === 2 && terminal === TERMINAL.length ? <><Check size={12} /> 42 tests passed</> : act === 0 ? <><Sparkles size={12} /> Veyra AI · local</> : <><Play size={12} /> Ready</>}</span>
          <span>TypeScript · UTF-8</span>
        </div>
        <div className="ide-sheen" />
      </div>
    </section>
  );
}
