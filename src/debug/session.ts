import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { allBreakpoints, breakpointsFor, onBreakpointsChange } from "./breakpoints";

/* A Debug Adapter Protocol client. The Rust side (src-tauri/src/dap.rs) runs the adapter process and relays
   messages; this file speaks the protocol: launch, breakpoints, stopping, stepping, variables, evaluation. */

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Status = "idle" | "starting" | "running" | "paused" | "ended";
export type Frame = { id: number; name: string; path: string; absolute: string; line: number; column: number };
export type Scope = { name: string; ref: number; expensive: boolean };
export type Variable = { name: string; value: string; type: string; ref: number };
export type OutputLine = { category: "stdout" | "stderr" | "console" | "important" | "input" | "result" | "error"; text: string };
export type DebugState = {
  status: Status; program: string; reason: string; threadId: number; frames: Frame[]; frameId: number;
  scopes: Scope[]; output: OutputLine[]; error: string; exitCode: number | null;
};
const initial = (): DebugState => ({ status: "idle", program: "", reason: "", threadId: 0, frames: [], frameId: 0, scopes: [], output: [], error: "", exitCode: null });
let state = initial();
const listeners = new Set<(state: DebugState) => void>();
const set = (next: Partial<DebugState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener(state)); };
export const debugState = () => state;
export const onDebugChange = (listener: (state: DebugState) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** What the session needs from the workbench. */
export type DebugHost = { root: () => string; reveal: (path: string, line: number) => void; saveAll: () => Promise<void> };
let host: DebugHost | null = null;
export function setDebugHost(next: DebugHost) { host = next; }

/* ---------- Paths: the adapter uses absolute paths, Veyra uses workspace-relative ones ---------- */
const separator = (root: string) => root.includes("\\") ? "\\" : "/";
const absolute = (root: string, relative: string) => root.replace(/[\\/]+$/, "") + separator(root) + relative.split("/").join(separator(root));
function relative(root: string, path: string) {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const base = norm(root), full = norm(path);
  return full.toLowerCase().startsWith(base.toLowerCase() + "/") ? full.slice(base.length + 1) : "";
}

/* ---------- Transport ---------- */
let sessionId = 0, seq = 0;
const pending = new Map<number, { resolve: (body: Json) => void; reject: (error: Error) => void }>();
let unlisten: UnlistenFn[] = [];
let breakpointWatch: (() => void) | null = null;
let syncedFiles = new Set<string>();
let launchConfig: { program: string; python: string } | null = null;

function send(message: Json) { return invoke("dap_send", { id: sessionId, message: JSON.stringify(message) }); }
function request<T = Json>(command: string, args?: Json): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ seq: id, type: "request", command, arguments: args }).catch(error => { pending.delete(id); reject(new Error(String(error))); });
  });
}
const output = (category: OutputLine["category"], text: string) => set({ output: [...state.output, { category, text }].slice(-2000) });

async function handle(message: Json) {
  if (message.type === "response") {
    const waiting = pending.get(message.request_seq); if (!waiting) return;
    pending.delete(message.request_seq);
    if (message.success) waiting.resolve(message.body ?? {}); else waiting.reject(new Error(message.body?.error?.format || message.message || `${message.command} failed`));
    return;
  }
  if (message.type === "request") {
    // Reverse requests Veyra doesn't support (runInTerminal, startDebugging) are declined politely.
    await send({ seq: ++seq, type: "response", request_seq: message.seq, command: message.command, success: false, message: "Not supported by Veyra yet" });
    return;
  }
  const body = message.body || {};
  switch (message.event) {
    case "output":
      if (body.category !== "telemetry" && typeof body.output === "string") output(body.category === "stderr" ? "stderr" : body.category === "important" ? "important" : body.category === "console" ? "console" : "stdout", body.output);
      break;
    case "stopped": await paused(body.threadId, body.reason || "pause", body.description || body.text || ""); break;
    case "continued": set({ status: "running", frames: [], scopes: [], reason: "" }); break;
    case "exited": set({ exitCode: typeof body.exitCode === "number" ? body.exitCode : null }); break;
    case "terminated": await finish(); break;
  }
}

async function paused(threadId: number | undefined, reason: string, description: string) {
  let thread = threadId;
  if (!thread) { const threads = await request("threads").catch(() => ({ threads: [] })); thread = threads.threads?.[0]?.id ?? 0; }
  const trace = await request("stackTrace", { threadId: thread, startFrame: 0, levels: 50 }).catch(() => ({ stackFrames: [] }));
  const root = host?.root() || "";
  const frames: Frame[] = (trace.stackFrames || []).map((f: Json) => ({ id: f.id, name: f.name, absolute: f.source?.path || "", path: f.source?.path ? relative(root, f.source.path) : "", line: f.line, column: f.column }));
  set({ status: "paused", threadId: thread || 0, frames, reason: description || reason });
  // Show the first frame that is in the workspace (skip library code).
  const first = frames.find(frame => frame.path) || frames[0];
  if (first) await selectFrame(first.id);
}

/** Select a call-stack frame: loads its scopes and reveals its line in the editor. */
export async function selectFrame(frameId: number) {
  const frame = state.frames.find(f => f.id === frameId); if (!frame) return;
  const result = await request("scopes", { frameId }).catch(() => ({ scopes: [] }));
  set({ frameId, scopes: (result.scopes || []).map((s: Json) => ({ name: s.name, ref: s.variablesReference, expensive: !!s.expensive })) });
  if (frame.path) host?.reveal(frame.path, frame.line);
}

export async function variables(ref: number): Promise<Variable[]> {
  if (!ref) return [];
  const result = await request("variables", { variablesReference: ref }).catch(() => ({ variables: [] }));
  return (result.variables || []).map((v: Json) => ({ name: v.name, value: v.value, type: v.type || "", ref: v.variablesReference || 0 }));
}

/* ---------- Breakpoints ---------- */
async function syncBreakpoints(path: string) {
  const root = host?.root(); if (!root || sessionId === 0) return;
  const lines = breakpointsFor(path);
  await request("setBreakpoints", { source: { path: absolute(root, path) }, breakpoints: lines.map(line => ({ line })), lines }).catch(() => {});
  if (lines.length) syncedFiles.add(path); else syncedFiles.delete(path);
}
async function syncAllBreakpoints() {
  const files = new Set([...syncedFiles, ...allBreakpoints().map(([path]) => path)]);
  for (const path of files) await syncBreakpoints(path);
}

/* ---------- Lifecycle ---------- */
async function finish() {
  if (sessionId === 0) return;
  const id = sessionId; sessionId = 0;
  unlisten.forEach(stop => stop()); unlisten = [];
  breakpointWatch?.(); breakpointWatch = null; syncedFiles = new Set();
  pending.forEach(({ reject }) => reject(new Error("The debug session ended"))); pending.clear();
  void invoke("dap_stop", { id }).catch(() => {});
  set({ status: "ended", frames: [], scopes: [], threadId: 0, frameId: 0, reason: "" });
  output("important", `\nProcess finished${state.exitCode !== null ? ` with exit code ${state.exitCode}` : ""}.\n`);
}

/** Debug a Python file (workspace-relative path). */
export async function startDebugging(program: string) {
  const root = host?.root();
  if (!root) throw new Error("Open a folder first.");
  if (sessionId) await stopDebugging();
  await host?.saveAll();
  sessionId = Math.floor(Math.random() * 2 ** 31) + 1; seq = 0;
  set({ ...initial(), status: "starting", program, output: [{ category: "important", text: `Debugging ${program}\n` }] });
  const id = sessionId;
  try {
    unlisten.push(await listen<{ id: number; message: string }>("dap-message", event => { if (event.payload.id === id) void handle(JSON.parse(event.payload.message)); }));
    unlisten.push(await listen<{ id: number; code: number | null; log: string }>("dap-exit", event => {
      if (event.payload.id !== id) return;
      if (state.status === "starting" && event.payload.log) set({ error: event.payload.log.trim().split("\n").slice(-3).join(" ") });
      void finish();
    }));
    const started = await invoke<{ python: string }>("dap_start", { id, adapter: "python" });
    launchConfig = { program, python: started.python };
    await request("initialize", { clientID: "veyra", clientName: "Veyra Studio", adapterID: "python", pathFormat: "path", linesStartAt1: true, columnsStartAt1: true, supportsVariableType: true, supportsRunInTerminalRequest: false, locale: "en" });
    // The adapter answers `launch` only after configurationDone, so don't wait for it here.
    const launched = request("launch", { name: `Python: ${program}`, type: "python", request: "launch", program: absolute(root, program), cwd: root, console: "internalConsole", justMyCode: true, showReturnValue: true, python: [started.python] });
    await syncAllBreakpoints();
    breakpointWatch = onBreakpointsChange(() => { void syncAllBreakpoints(); });
    await request("configurationDone");
    await launched;
    if (state.status === "starting") set({ status: "running" });
  } catch (error) {
    const message = String((error as Error)?.message || error);
    set({ error: message });
    output("error", message + "\n");
    await finish();
    throw error;
  }
}

export async function stopDebugging() {
  if (!sessionId) return;
  await Promise.race([request("disconnect", { terminateDebuggee: true }).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500))]);
  await finish();
}
export async function restartDebugging() { const program = launchConfig?.program || state.program; await stopDebugging(); if (program) await startDebugging(program); }

const step = (command: string) => async () => { if (!sessionId || !state.threadId) return; await request(command, { threadId: state.threadId }).catch(error => output("error", String(error.message || error) + "\n")); };
export const continueRun = step("continue");
export const stepOver = step("next");
export const stepInto = step("stepIn");
export const stepOut = step("stepOut");
export async function pauseRun() { if (!sessionId || state.status !== "running") return; const threads = await request("threads").catch(() => ({ threads: [] })); await request("pause", { threadId: threads.threads?.[0]?.id ?? 0 }).catch(() => {}); }

/** Evaluate an expression in the selected frame (Debug Console / Watch). */
export async function evaluate(expression: string, context: "repl" | "watch" = "repl"): Promise<{ value: string; ref: number }> {
  if (!sessionId) throw new Error("Start debugging to evaluate expressions.");
  const result = await request("evaluate", { expression, frameId: state.frameId || undefined, context });
  return { value: result.result ?? "", ref: result.variablesReference || 0 };
}
export async function consoleEvaluate(expression: string) {
  output("input", "> " + expression + "\n");
  try { const result = await evaluate(expression, "repl"); output("result", result.value + "\n"); }
  catch (error) { output("error", String((error as Error).message || error) + "\n"); }
}
export const clearConsole = () => set({ output: [] });
export const isDebugging = () => state.status === "starting" || state.status === "running" || state.status === "paused";
