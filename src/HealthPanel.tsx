import { AlertTriangle, CheckCircle2, Info, RefreshCw, Trash2, XCircle } from "lucide-react";
import type { HealthReport, HealthStatus } from "./health";

const icons: Record<HealthStatus, typeof Info> = { ok: CheckCircle2, warn: AlertTriangle, fail: XCircle, info: Info };
const labels: Record<HealthReport["grade"], string> = { excellent: "Excellent", good: "Good", degraded: "Needs attention", critical: "Critical" };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function HealthPanel({ report, running, onRun, onClearErrors }: { report: HealthReport | null; running: boolean; onRun: () => void; onClearErrors: () => void }) {
  const groups = report ? [...new Set(report.checks.map(check => check.group))] : [];
  const issues = report ? report.checks.filter(check => check.status === "warn" || check.status === "fail").length : 0;
  return <div className="panel-body health-panel">
    <section className={"health-summary " + (report?.grade || "")}>
      <div className="health-ring" style={{ ["--score" as string]: report?.score ?? 0 }} role="img" aria-label={report ? `Health score ${report.score} of 100` : "Health not checked yet"}>
        <b>{report ? report.score : "–"}</b><small>/100</small>
      </div>
      <div>
        <h3>{report ? labels[report.grade] : "Checking…"}</h3>
        <p className="hint">{report ? (issues ? `${issues} issue${issues === 1 ? "" : "s"} found` : "Everything is running correctly") + " · checked " + time(report.at) : "Running the first health check"}</p>
        <button className="secondary" disabled={running} onClick={onRun}><RefreshCw size={13} className={running ? "spin" : ""}/>{running ? "Checking…" : "Run checks"}</button>
      </div>
    </section>
    {groups.map(group => <section key={group} className="health-group">
      <h4>{group.toUpperCase()}</h4>
      {report!.checks.filter(check => check.group === group).map(check => {
        const Icon = icons[check.status];
        return <article key={check.id} className={"health-check " + check.status}>
          <Icon size={15}/>
          <div><b>{check.label}</b><span>{check.detail}</span>{check.hint && <small>{check.hint}</small>}</div>
          {check.ms !== undefined && check.ms > 0 && <em>{check.ms} ms</em>}
        </article>;
      })}
    </section>)}
    {report && report.errors.length > 0 && <section className="health-group">
      <h4>RECENT ERRORS <button title="Clear error log" aria-label="Clear error log" onClick={onClearErrors}><Trash2 size={12}/></button></h4>
      {report.errors.slice(-8).reverse().map((error, i) => <article key={i} className="health-check fail"><XCircle size={15}/><div><span>{error.message}</span><small>{time(error.at)}</small></div></article>)}
    </section>}
    <p className="hint">Veyra re-checks itself every minute in the background. The score drops for failing or degraded checks; optional tools only show as information.</p>
  </div>;
}
