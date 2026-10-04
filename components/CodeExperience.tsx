"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, Play, Sparkles } from "lucide-react";
const source = [
  ["muted", "// Build with focus. Ship with confidence."],
  ["code", "const editor = await Veyra.open({"],
  ["accent", '  intelligence: "local",'],
  ["violet", '  model: "qwen-coder",'],
  ["code", "  reviewChanges: true,"],
  ["code", "});"],
  ["code", ""],
  ["code", 'editor.on("idea", async (intent) => {'],
  ["accent", "  const patch = await editor.create(intent);"],
  ["code", "  return editor.review(patch);"],
  ["code", "});"],
] as const;
export function CodeExperience() {
  const [visible, setVisible] = useState(1);
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(source.length);
      return;
    }
    const timer = setInterval(
      () => setVisible((value) => (value >= source.length ? 1 : value + 1)),
      380,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (visible === source.length) {
      const timer = setTimeout(() => setRun(true), 250);
      return () => clearTimeout(timer);
    }
    setRun(false);
  }, [visible]);
  return (
    <section id="live-code" className="code-experience">
      <div className="code-copy">
        <span>// LIVE WORKSPACE</span>
        <h2>
          Code that feels
          <br />
          <em>alive.</em>
        </h2>
        <p>
          Veyra keeps the signal close: intelligent completions, instant
          feedback and every proposed change visible before it becomes yours.
        </p>
        <div className="code-stats">
          <div>
            <b>12ms</b>
            <small>EDITOR RESPONSE</small>
          </div>
          <div>
            <b>LOCAL</b>
            <small>MODEL ROUTE</small>
          </div>
          <div>
            <b>100%</b>
            <small>YOUR CONTROL</small>
          </div>
        </div>
      </div>
      <div className="code-window">
        <header>
          <div>
            <i />
            <i />
            <i />
          </div>
          <span>src / studio.ts</span>
          <button
            onClick={() => {
              setVisible(source.length);
              setRun(true);
            }}
          >
            <Play />
            Run
          </button>
        </header>
        <div className="code-body">
          <aside>
            {source.map((_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </aside>
          <pre>
            {source.map(([tone, line], index) => (
              <div
                key={index}
                className={`${tone} ${index < visible ? "shown" : ""}`}
              >
                <code>{line || " "}</code>
                {index === visible - 1 && visible < source.length ? (
                  <i className="caret" />
                ) : null}
              </div>
            ))}
          </pre>
        </div>
        <footer className={run ? "complete" : ""}>
          <span>
            <Sparkles />
            Veyra Intelligence
          </span>
          <p>
            {run
              ? "Patch ready for review"
              : "Understanding workspace context…"}
          </p>
          {run ? (
            <b>
              <Check />3 checks passed
            </b>
          ) : (
            <i />
          )}
        </footer>
        <div className="scanline" />
      </div>
    </section>
  );
}
export function CodeBackdrop() {
  const snippets = [
    "const idea = ✦",
    'git commit -m "create"',
    "await model.think()",
    "fn build_future()",
    "npm run imagine",
    "<Veyra intelligence />",
    "review → apply",
    "local-first",
  ];
  return (
    <div className="code-backdrop" aria-hidden="true">
      {snippets.map((snippet, index) => (
        <span key={snippet} style={{ "--i": index } as CSSProperties}>
          {snippet}
        </span>
      ))}
    </div>
  );
}
