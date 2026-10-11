import { monaco } from "../editor";
import { breakpointsFor, hasBreakpoint, moveBreakpoints, onBreakpointsChange, toggleBreakpoint } from "./breakpoints";
import { debugState, onDebugChange } from "./session";

/* Breakpoints and the paused line in a Monaco editor, VS Code style: click the glyph margin (left of the line
   numbers) to toggle a breakpoint; a faint dot previews where it will go; the line where execution is paused
   is highlighted with an arrow. */
export function attachDebugging(editor: monaco.editor.IStandaloneCodeEditor, pathOf: () => string): monaco.IDisposable {
  const breakpoints = editor.createDecorationsCollection();
  const stopped = editor.createDecorationsCollection();
  const hint = editor.createDecorationsCollection();
  const range = (line: number) => new monaco.Range(line, 1, line, 1);
  let rendering = false;

  function render() {
    const path = pathOf();
    rendering = true;
    breakpoints.set(path ? breakpointsFor(path).map(line => ({
      range: range(line),
      options: { glyphMarginClassName: "veyra-breakpoint", glyphMarginHoverMessage: { value: "Breakpoint · click to remove" }, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
    })) : []);
    const state = debugState(), frame = state.frames.find(f => f.id === state.frameId);
    stopped.set(state.status === "paused" && frame && frame.path === path ? [{
      range: new monaco.Range(frame.line, 1, frame.line, 1),
      options: { isWholeLine: true, className: "veyra-stopped-line", glyphMarginClassName: hasBreakpoint(path, frame.line) ? "veyra-stopped-breakpoint" : "veyra-stopped-arrow", stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges },
    }] : []);
    rendering = false;
  }

  const disposables: monaco.IDisposable[] = [
    editor.onMouseDown(event => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !event.target.position) return;
      const path = pathOf(); if (!path) return;
      toggleBreakpoint(path, event.target.position.lineNumber);
    }),
    editor.onMouseMove(event => {
      const line = event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ? event.target.position?.lineNumber : undefined;
      hint.set(line && !hasBreakpoint(pathOf(), line) ? [{ range: range(line), options: { glyphMarginClassName: "veyra-breakpoint-hint" } }] : []);
    }),
    editor.onMouseLeave(() => hint.clear()),
    // Breakpoint decorations move with the text; keep the saved line numbers in step.
    editor.onDidChangeModelContent(() => {
      if (rendering) return;
      const path = pathOf(); if (!path) return;
      moveBreakpoints(path, breakpoints.getRanges().map(r => r.startLineNumber));
    }),
    editor.onDidChangeModel(() => setTimeout(render, 0)),
  ];
  const stopBreakpoints = onBreakpointsChange(render);
  const stopDebug = onDebugChange(render);
  render();
  return { dispose() { disposables.forEach(d => d.dispose()); stopBreakpoints(); stopDebug(); breakpoints.clear(); stopped.clear(); hint.clear(); } };
}

/** F9: toggle a breakpoint on the cursor's line. */
export function toggleBreakpointAtCursor(editor: monaco.editor.IStandaloneCodeEditor | null, path: string) {
  const line = editor?.getPosition()?.lineNumber;
  if (editor && path && line) toggleBreakpoint(path, line);
}
