import { invoke } from "@tauri-apps/api/core";
import { monaco } from "./editor";

export type HealthStatus = "ok" | "warn" | "fail" | "info";
export type HealthCheck = { id: string; label: string; group: string; status: HealthStatus; detail: string; hint?: string; ms?: number };
export type HealthReport = { score: number; grade: "excellent" | "good" | "degraded" | "critical"; checks: HealthCheck[]; at: number; errors: AppError[] };
export type AppError = { message: string; at: number };
type Context = { root: string; openFiles: number; unsaved: number; errorMarkers: number };

/** Checks whose failure makes Veyra unusable weigh more than optional or cosmetic ones. */
const critical = new Set(["bridge", "workspace", "storage", "responsiveness"]);
const errors: AppError[] = [];
const lags: number[] = [];
let longTasks = 0;
let started = false;

/** Start passive monitoring once: uncaught errors, event-loop lag and long tasks. */
export function startMonitor() {
  if (started) return;
  started = true;
  const record = (message: string) => { errors.push({ message: message.slice(0, 300), at: Date.now() }); if (errors.length > 50) errors.shift(); };
  window.addEventListener("error", event => record(event.message || "Script error"));
  window.addEventListener("unhandledrejection", event => record(String((event as PromiseRejectionEvent).reason ?? "Unhandled promise rejection")));
  // A 500 ms timer that fires late means the UI thread was blocked for that long.
  let last = performance.now();
  window.setInterval(() => { const now = performance.now(); lags.push(Math.max(0, now - last - 500)); if (lags.length > 120) lags.shift(); last = now; }, 500);
  try { new PerformanceObserver(list => { longTasks += list.getEntries().length; }).observe({ type: "longtask", buffered: true }); } catch { /* not supported */ }
}

export function clearErrors() { errors.length = 0; }

const percentile = (values: number[], p: number) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; };

export function scoreChecks(checks: HealthCheck[]) {
  let score = 100;
  for (const check of checks) {
    if (check.status === "fail") score -= critical.has(check.id) ? 30 : 15;
    else if (check.status === "warn") score -= critical.has(check.id) ? 10 : 5;
  }
  score = Math.max(0, Math.min(100, score));
  const grade: HealthReport["grade"] = score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 50 ? "degraded" : "critical";
  return { score, grade };
}

export async function runHealth(context: Context): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  const started = performance.now();
  let native: HealthCheck[] = [];
  let bridgeError = "";
  try { native = (await invoke<HealthCheck[] | null>("health_check")) || []; } catch (error) { bridgeError = String(error); }
  const latency = Math.round(performance.now() - started);
  checks.push(bridgeError
    ? { id: "bridge", label: "Native backend", group: "Editor", status: "fail", detail: bridgeError, hint: "Restart Veyra. If it persists, rebuild with npm run tauri dev." }
    : { id: "bridge", label: "Native backend", group: "Editor", status: latency > 1500 ? "warn" : "ok", detail: `Responded in ${latency} ms`, hint: latency > 1500 ? "The backend is slow; a large workspace or busy disk may be the cause." : "", ms: latency });

  const p95 = Math.round(percentile(lags, 0.95));
  checks.push({ id: "responsiveness", label: "UI responsiveness", group: "Editor", status: p95 > 250 ? "fail" : p95 > 60 ? "warn" : "ok",
    detail: lags.length ? `95% of frames delayed ≤ ${p95} ms · ${longTasks} long task${longTasks === 1 ? "" : "s"}` : "Measuring…",
    hint: p95 > 60 ? "Close large files or unused terminals; very long lines and huge files slow the editor." : "" });

  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (memory) {
    const used = memory.usedJSHeapSize / memory.jsHeapSizeLimit, mb = Math.round(memory.usedJSHeapSize / 1048576);
    checks.push({ id: "memory", label: "Editor memory", group: "Editor", status: used > 0.85 ? "fail" : used > 0.6 ? "warn" : "ok", detail: `${mb} MB in use (${Math.round(used * 100)}% of limit)`, hint: used > 0.6 ? "Close editors you are not using to free memory." : "" });
  } else checks.push({ id: "memory", label: "Editor memory", group: "Editor", status: "info", detail: "Not reported by this webview" });

  const recent = errors.filter(error => Date.now() - error.at < 10 * 60 * 1000);
  checks.push({ id: "errors", label: "Runtime errors", group: "Editor", status: recent.length > 3 ? "fail" : recent.length ? "warn" : "ok",
    detail: recent.length ? `${recent.length} in the last 10 minutes · latest: ${recent.at(-1)!.message}` : "None in the last 10 minutes", hint: recent.length ? "Details are listed below. Reloading the window clears transient errors." : "" });

  const models = monaco.editor.getModels().length;
  checks.push({ id: "models", label: "Editor buffers", group: "Editor", status: models > context.openFiles * 3 + 10 ? "warn" : "ok",
    detail: `${models} buffer${models === 1 ? "" : "s"} for ${context.openFiles} open file${context.openFiles === 1 ? "" : "s"}`, hint: models > context.openFiles * 3 + 10 ? "Buffers are not being released; closing the folder frees them." : "" });
  checks.push({ id: "unsaved", label: "Unsaved changes", group: "Workspace", status: context.unsaved ? "info" : "ok", detail: context.unsaved ? `${context.unsaved} file${context.unsaved === 1 ? "" : "s"} not yet saved` : "Everything is saved" });
  checks.push({ id: "diagnostics", label: "Code problems", group: "Workspace", status: context.errorMarkers ? "info" : "ok", detail: context.errorMarkers ? `${context.errorMarkers} error${context.errorMarkers === 1 ? "" : "s"} in open files` : "No errors in open files" });

  checks.push(...native.map(check => ({ ...check, group: check.id === "workspace" || check.id === "git" ? "Workspace" : check.group })));
  return { ...scoreChecks(checks), checks, at: Date.now(), errors: [...errors] };
}
