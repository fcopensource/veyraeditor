"""The scan result: printable in a terminal, rich in Jupyter, and saveable as one self-contained HTML page."""

from __future__ import annotations

import html
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ._model import Column, Insight, Issue, plain

ICON = {"high": "●", "medium": "●", "low": "○"}
AUTO = "<span class='auto'>dx.clean() fixes this</span>"


@dataclass
class Report:
    rows: int
    columns: list[Column]
    issues: list[Issue]
    insights: list[Insight]
    target: str | None = None
    name: str = "dataset"
    memory_mb: float = 0.0
    created: str = field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))

    # ------------------------------------------------------------------ quick facts

    @property
    def health(self) -> int:
        """0-100: how clean the data is. Each problem costs points by severity, scaled by how much of the data it touches."""
        cost = {"high": 14, "medium": 6, "low": 2}
        penalty = 0.0
        for i in self.issues:
            reach = min(1.0, i.count / self.rows) if self.rows and i.count else 0.3
            penalty += cost[i.severity] * (0.4 + 0.6 * reach)
        return max(0, round(100 - penalty))

    def column(self, name: str) -> Column:
        return next(c for c in self.columns if c.name == name)

    def to_dict(self) -> dict[str, Any]:
        return plain({"name": self.name, "rows": self.rows, "columns": self.columns, "issues": self.issues, "insights": self.insights,
                      "target": self.target, "health": self.health, "created": self.created})

    def to_json(self, path: str | os.PathLike[str] | None = None, indent: int = 2) -> str:
        text = json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)
        if path:
            Path(path).write_text(text, encoding="utf-8")
        return text

    # ------------------------------------------------------------------ text

    def summary(self) -> str:
        kinds: dict[str, int] = {}
        for c in self.columns:
            kinds[c.kind] = kinds.get(c.kind, 0) + 1
        mix = ", ".join(f"{n} {k}" for k, n in sorted(kinds.items(), key=lambda kv: -kv[1]))
        return f"{self.rows:,} rows × {len(self.columns)} columns ({mix}). Health {self.health}/100: {len(self.issues)} issue{'s' * (len(self.issues) != 1)}, {len(self.insights)} insight{'s' * (len(self.insights) != 1)}."

    def to_text(self, color: bool | None = None, max_issues: int = 10, max_insights: int = 10) -> str:
        c = _colors(sys.stdout.isatty() if color is None else color)
        lines = [f"{c['mint']}◆ dxray{c['reset']}  {c['bold']}{self.name}{c['reset']}  {self.summary()}", ""]
        if self.insights:
            lines.append(f"{c['bold']}What stands out{c['reset']}")
            for i in self.insights[:max_insights]:
                lines.append(f"  {c['mint']}→{c['reset']} {i.title}")
            lines.append("")
        if self.issues:
            lines.append(f"{c['bold']}Data problems{c['reset']}")
            for i in self.issues[:max_issues]:
                col = c['red'] if i.severity == 'high' else c['yellow'] if i.severity == 'medium' else c['dim']
                lines.append(f"  {col}{ICON[i.severity]}{c['reset']} {i.title}" + (f"  {c['dim']}fix: {i.fix}{c['reset']}" if i.fix else ""))
            if len(self.issues) > max_issues:
                lines.append(f"  {c['dim']}…and {len(self.issues) - max_issues} more{c['reset']}")
            lines.append("")
        lines.append(f"{c['bold']}Columns{c['reset']}")
        w = max((len(col.name) for col in self.columns), default=4)
        for col in self.columns:
            extra = _col_line(col)
            miss = f"{col.missing_pct:.0f}% missing" if col.missing else ""
            lines.append(f"  {col.name.ljust(w)}  {c['cyan']}{col.kind.ljust(11)}{c['reset']} {c['dim']}{miss.ljust(12)}{c['reset']} {extra}")
        return "\n".join(lines)

    def __str__(self) -> str:
        return self.to_text(color=False)

    def __repr__(self) -> str:
        return f"<dxray.Report {self.name}: {self.summary()}>"

    def show(self) -> None:
        text = self.to_text()
        try:
            print(text)
        except UnicodeEncodeError:  # an old Windows console code page: plain symbols instead
            print(text.translate(str.maketrans({"◆": "*", "→": "->", "●": "!", "○": "-", "…": "...", "×": "x"})).encode("ascii", "replace").decode())

    def to_markdown(self) -> str:
        out = [f"# {self.name}", "", self.summary(), ""]
        if self.insights:
            out += ["## What stands out", ""] + [f"- {i.title}" for i in self.insights] + [""]
        if self.issues:
            out += ["## Data problems", "", "| Severity | Problem | Fix |", "|---|---|---|"]
            pipe = lambda t: t.replace("|", "\\|")  # noqa: E731
            out += [f"| {i.severity} | {pipe(i.title)} | " + (f"`{pipe(i.fix)}`" if i.fix else "") + " |" for i in self.issues]
            out.append("")
        out += ["## Columns", "", "| Column | Type | Missing | Unique | Summary |", "|---|---|---|---|---|"]
        out += [f"| {c.name} | {c.kind} | {c.missing_pct:.0f}% | {c.unique:,} | {_col_line(c)} |" for c in self.columns]
        return "\n".join(out) + "\n"

    # ------------------------------------------------------------------ HTML

    def _repr_html_(self) -> str:
        return _html_body(self, standalone=False)

    def to_html(self, path: str | os.PathLike[str] | None = None) -> str:
        page = f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{html.escape(self.name)}: dxray report</title><style>{CSS}</style></head><body>{_html_body(self, standalone=True)}</body></html>"
        if path:
            Path(path).write_text(page, encoding="utf-8")
        return page


def _col_line(c: Column) -> str:
    s = c.stats
    if c.kind == "numeric" and s:
        from ._insights import nice
        return f"{nice(s['min'])} to {nice(s['max'])}, median {nice(s['median'])}" + (f"  ({c.note})" if c.note else "")
    if c.kind == "datetime" and s:
        return f"{str(s['min'])[:10]} to {str(s['max'])[:10]}" + (f"  ({c.note})" if c.note else "")
    if c.top and c.kind in ("categorical", "boolean", "constant"):
        return ", ".join(f"{v} ({n:,})" for v, n in c.top[:3]) + (f"  +{c.unique - 3} more" if c.unique > 3 else "")
    if c.kind in ("text", "email", "url", "id") and s:
        return f"{c.unique:,} unique, avg {s.get('avg_length', 0)} chars"
    return ""


def _colors(on: bool) -> dict[str, str]:
    if on and os.name == "nt":
        os.system("")
    codes = {"bold": "1", "dim": "2", "red": "31", "yellow": "33", "cyan": "36", "mint": "38;5;86", "reset": "0"}
    return {k: (f"\033[{v}m" if on else "") for k, v in codes.items()}


# ---------------------------------------------------------------------- charts as inline SVG (no JavaScript, no CDN)

def _svg_chart(ch: dict, w: int = 420, h: int = 150) -> str:
    if not ch:
        return ""
    e = html.escape
    t = ch.get("type")
    pad = 26
    if t in ("bar",) and ch.get("values"):
        vals, labels = ch["values"], ch["labels"]
        top = max(max(vals), 0) or 1
        bw = (w - pad) / len(vals)
        bars = "".join(f"<rect x='{pad + i * bw + 2:.1f}' y='{h - 20 - (v / top) * (h - 34):.1f}' width='{max(1, bw - 4):.1f}' height='{max(0, (v / top) * (h - 34)):.1f}' rx='2'><title>{e(str(l))}: {v:,.4g}</title></rect>"
                       + (f"<text x='{pad + i * bw + bw / 2:.1f}' y='{h - 6}' text-anchor='middle'>{e(str(l)[:10])}</text>" if len(vals) <= 12 else "")
                       for i, (v, l) in enumerate(zip(vals, labels)))
        return f"<svg viewBox='0 0 {w} {h}' class='chart bar' role='img' aria-label='{e(ch.get('title', 'bar chart'))}'>{bars}</svg>"
    if t == "hist" and ch.get("counts"):
        cs, edges = ch["counts"], ch["edges"]
        top = max(cs) or 1
        bw = (w - pad) / len(cs)
        bars = "".join(f"<rect x='{pad + i * bw:.1f}' y='{h - 20 - (c / top) * (h - 30):.1f}' width='{max(1, bw - 1):.1f}' height='{(c / top) * (h - 30):.1f}'><title>{edges[i]:,.4g} to {edges[i + 1]:,.4g}: {c:,}</title></rect>" for i, c in enumerate(cs))
        return f"<svg viewBox='0 0 {w} {h}' class='chart hist' role='img' aria-label='histogram'>{bars}<text x='{pad}' y='{h - 6}'>{edges[0]:,.4g}</text><text x='{w - 4}' y='{h - 6}' text-anchor='end'>{edges[-1]:,.4g}</text></svg>"
    if t == "line" and len(ch.get("values", [])) >= 2:
        vals, labels = ch["values"], ch["labels"]
        lo, hi = min(vals), max(vals)
        span = (hi - lo) or 1
        step = (w - pad - 8) / (len(vals) - 1)
        pts = " ".join(f"{pad + i * step:.1f},{h - 22 - (v - lo) / span * (h - 36):.1f}" for i, v in enumerate(vals))
        dots = "".join(f"<circle cx='{pad + i * step:.1f}' cy='{h - 22 - (v - lo) / span * (h - 36):.1f}' r='2.5'><title>{e(str(l))}: {v:,.4g}</title></circle>" for i, (v, l) in enumerate(zip(vals, labels)))
        return (f"<svg viewBox='0 0 {w} {h}' class='chart line' role='img' aria-label='{e(ch.get('title', 'line chart'))}'><polyline points='{pts}'/>{dots}"
                f"<text x='{pad}' y='{h - 4}'>{e(str(labels[0]))}</text><text x='{w - 4}' y='{h - 4}' text-anchor='end'>{e(str(labels[-1]))}</text></svg>")
    if t == "scatter" and ch.get("x"):
        xs, ys = ch["x"], ch["y"]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        sx = lambda v: pad + (v - x0) / ((x1 - x0) or 1) * (w - pad - 8)  # noqa: E731
        sy = lambda v: h - 20 - (v - y0) / ((y1 - y0) or 1) * (h - 30)  # noqa: E731
        dots = "".join(f"<circle cx='{sx(a):.1f}' cy='{sy(b):.1f}' r='2.2'/>" for a, b in zip(xs, ys))
        return (f"<svg viewBox='0 0 {w} {h}' class='chart scatter' role='img' aria-label='{e(ch.get('title', 'scatter plot'))}'>{dots}"
                f"<text x='{pad}' y='{h - 4}'>{e(ch.get('xlabel', ''))} →</text><text x='4' y='12'>↑ {e(ch.get('ylabel', ''))}</text></svg>")
    return ""


def _html_body(r: Report, standalone: bool) -> str:
    e = html.escape
    hc = "good" if r.health >= 80 else "ok" if r.health >= 55 else "bad"
    ins = "".join(f"<article class='insight'><span class='kind'>{e(i.kind)}</span><h3>{e(i.title)}</h3>"
                  + (f"<p>{e(i.detail)}</p>" if i.detail else "") + _svg_chart(i.chart) + "</article>" for i in r.insights)
    iss = "".join(f"<tr class='{i.severity}'><td><span class='sev'>{i.severity}</span></td><td>{e(i.title)}"
                  + (f"<br><small>e.g. {e(', '.join(repr(x) for x in i.examples[:3]))}</small>" if i.examples else "")
                  + "</td><td>" + ("<code>" + e(i.fix) + "</code>" if i.fix else "") + (AUTO if i.auto else "") + "</td></tr>" for i in r.issues)
    cols = "".join(f"<article class='col'><header><b>{e(c.name)}</b><span class='kind'>{e(c.kind)}</span></header>"
                   f"<p>{e(_col_line(c))}</p><p class='meta'>{c.count:,} values · {c.unique:,} unique" + (f" · <span class='miss'>{c.missing_pct:.1f}% missing</span>" if c.missing else "") + "</p>"
                   + _svg_chart(c.chart, 300, 90) + "</article>" for c in r.columns)
    head = f"<header class='top'><div><span class='brand'>◆ dxray</span><h1>{e(r.name)}</h1><p>{e(r.summary())}</p></div><div class='health {hc}'><b>{r.health}</b><span>health</span></div></header>"
    body = (f"<div class='dxray'>{head}"
            + (f"<section><h2>What stands out</h2><div class='insights'>{ins}</div></section>" if r.insights else "")
            + (f"<section><h2>Data problems</h2><table class='issues'><tbody>{iss}</tbody></table></section>" if r.issues else "<section><h2>Data problems</h2><p>None found. Nice and clean.</p></section>")
            + f"<section><h2>Columns</h2><div class='cols'>{cols}</div></section>"
            + (f"<footer>Made with <a href='https://pypi.org/project/dxray/'>dxray</a> · {e(r.created)}</footer>" if standalone else "")
            + "</div>")
    return body if standalone else f"<style>{CSS}</style>{body}"


CSS = """
.dxray{--bg:#0b0d14;--card:#121624;--line:#232a3c;--text:#e8edf2;--muted:#8d98a8;--mint:#68f4d1;--cyan:#4cdcf2;--violet:#b79bff;--red:#ff6b8a;--amber:#ffcf6b;
font:14px/1.55 Inter,"Segoe UI",system-ui,sans-serif;color:var(--text);background:var(--bg);padding:28px;border-radius:16px;max-width:1180px;margin:auto}
body{margin:0;background:#0b0d14}
.dxray h1{margin:4px 0 6px;font-size:28px;letter-spacing:-.5px}.dxray h2{margin:30px 0 12px;font-size:18px}.dxray h3{margin:6px 0;font-size:15px;line-height:1.45}
.dxray .top{display:flex;justify-content:space-between;gap:20px;align-items:center}.dxray .top p{margin:0;color:var(--muted)}
.dxray .brand{color:var(--mint);font:700 12px ui-monospace,Consolas,monospace;letter-spacing:1px}
.dxray .health{display:grid;place-items:center;min-width:92px;height:92px;border-radius:50%;border:3px solid var(--mint)}.dxray .health b{font-size:30px;line-height:1}.dxray .health span{font-size:11px;color:var(--muted);margin-top:-18px}
.dxray .health.ok{border-color:var(--amber)}.dxray .health.bad{border-color:var(--red)}
.dxray .insights{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.dxray .insight,.dxray .col{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.dxray .insight p{margin:0 0 8px;color:var(--muted);font-size:13px}
.dxray .kind{display:inline-block;padding:1px 8px;border-radius:99px;background:#68f4d114;color:var(--mint);font:600 11px ui-monospace,Consolas,monospace}
.dxray table.issues{width:100%;border-collapse:collapse}.dxray .issues td{padding:10px;border-top:1px solid var(--line);vertical-align:top}
.dxray .issues small{color:var(--muted)}.dxray code{font:12px ui-monospace,Consolas,monospace;color:var(--cyan);word-break:break-all}
.dxray .sev{font:700 11px ui-monospace,Consolas,monospace;text-transform:uppercase}.dxray .high .sev{color:var(--red)}.dxray .medium .sev{color:var(--amber)}.dxray .low .sev{color:var(--muted)}
.dxray .auto{display:block;margin-top:4px;color:var(--mint);font-size:12px}
.dxray .cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.dxray .col header{display:flex;justify-content:space-between;gap:8px}
.dxray .col p{margin:6px 0 0;font-size:13px}.dxray .meta{color:var(--muted)}.dxray .miss{color:var(--amber)}
.dxray svg.chart{width:100%;height:auto;margin-top:8px}.dxray svg rect,.dxray svg circle{fill:var(--cyan)}.dxray svg.hist rect{fill:var(--violet)}
.dxray svg polyline{fill:none;stroke:var(--mint);stroke-width:2}.dxray svg text{fill:var(--muted);font:10px ui-monospace,Consolas,monospace}
.dxray footer{margin-top:28px;color:var(--muted);font-size:12px}.dxray a{color:var(--mint)}
@media(max-width:640px){.dxray{padding:16px}.dxray .top{flex-direction:column;align-items:flex-start}}
"""
