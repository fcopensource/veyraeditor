"""What's interesting in the data, written as sentences a person can act on.

Every finding has a score from 0 to 1 (how strong or surprising it is), so the best ones come first.
"""

from __future__ import annotations

import math
import re

import numpy as np
import pandas as pd

from ._infer import Kind, datetime_values, numeric_values
from ._model import Insight

PERSON_DATE = re.compile(r"(birth|dob|signup|sign_up|joined|registered|member_since)", re.I)
MONEY_FIRST = re.compile(r"(revenue|sales|amount|spend|profit|gmv|income|value|total)", re.I)
ADDITIVE = re.compile(r"(amount|revenue|sales|total|cost|qty|quantity|count|units|spend|profit|orders?|bookings|visits|clicks|signups|income|value|volume|gmv)", re.I)
MAX_ROWS = 200_000


def nice(v: float) -> str:
    """12345.678 -> '12,346'; 0.1234 -> '0.12'; 2_500_000 -> '2.5M'."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "n/a"
    v = float(v)
    a = abs(v)
    if a >= 1e9:
        return f"{v / 1e9:.1f}B"
    if a >= 1e6:
        return f"{v / 1e6:.1f}M"
    if a >= 1e4:
        return f"{v / 1e3:.1f}k" if a < 1e5 else f"{v / 1e3:.0f}k"
    if a >= 100:
        return f"{v:,.0f}"
    if a >= 1:
        return f"{v:,.1f}".rstrip("0").rstrip(".")
    if v == 0:
        return "0"
    return f"{v:.2f}"


def _times(a: float, b: float) -> str:
    if b == 0:
        return "far more than"
    r = a / b
    return f"{r:.1f}×" if r >= 1.5 else f"{(r - 1) * 100:.0f}% more than"


def working_frame(df: pd.DataFrame, kinds: dict[str, Kind]) -> tuple[pd.DataFrame, dict[str, str]]:
    """Columns converted to what they really are (numbers, dates, clean categories), sampled if huge."""
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=0)
    out, roles = {}, {}
    for col in df.columns:
        name, k = str(col), kinds[str(col)]
        s = df[col]
        if k.kind == "numeric":
            out[name] = numeric_values(s, k).astype(float); roles[name] = "num"
        elif k.kind == "boolean":
            out[name] = numeric_values(s, k).astype(float) if k.note else pd.to_numeric(s, errors="coerce").astype(float); roles[name] = "bool"
        elif k.kind == "datetime":
            out[name] = datetime_values(s, k); roles[name] = "date"
        elif k.kind == "categorical":
            out[name] = s.astype("string").str.strip(); roles[name] = "cat"
        elif k.kind in ("text", "id") and s.nunique() <= 0.5 * max(1, s.notna().sum()):
            out[name] = s.astype("string").str.strip(); roles[name] = "key"  # a repeated key, like a customer ID
    return pd.DataFrame(out, index=df.index), roles


def label(col: str, value, roles: dict[str, str]) -> str:
    """How to name a group in a sentence: 'Premium', or churned=yes for a yes/no column."""
    if roles.get(col) == "bool":
        return f"{col}={'yes' if float(value) == 1 else 'no'}"
    return f"'{value}'"


def _eta_squared(groups: pd.Series, values: pd.Series) -> float:
    ok = groups.notna() & values.notna()
    g, v = groups[ok], values[ok]
    if len(v) < 10 or v.var() == 0:
        return 0.0
    means = v.groupby(g).agg(["mean", "count"])
    ss_between = float((means["count"] * (means["mean"] - v.mean()) ** 2).sum())
    ss_total = float(((v - v.mean()) ** 2).sum())
    return ss_between / ss_total if ss_total else 0.0


def _cramers_v(a: pd.Series, b: pd.Series) -> float:
    t = pd.crosstab(a, b)
    if t.shape[0] < 2 or t.shape[1] < 2:
        return 0.0
    n = t.values.sum()
    expected = np.outer(t.sum(1), t.sum(0)) / n
    chi2 = float(((t.values - expected) ** 2 / np.where(expected == 0, 1, expected)).sum())
    return math.sqrt(chi2 / (n * (min(t.shape) - 1)))


def find_insights(df: pd.DataFrame, kinds: dict[str, Kind], target: str | None = None, limit: int = 20) -> list[Insight]:
    w, roles = working_frame(df, kinds)
    n = len(w)
    found: list[Insight] = []
    if n < 5:
        return found
    nums = [c for c, r in roles.items() if r == "num" and w[c].notna().sum() >= 10 and w[c].nunique() > 2]
    cats = [c for c, r in roles.items() if r in ("cat", "bool") and 2 <= w[c].nunique() <= 30]
    dates = [c for c, r in roles.items() if r == "date" and w[c].notna().sum() >= 10]

    # --- relationships between numbers
    if len(nums) >= 2:
        corr = w[nums].corr(method="spearman", min_periods=10)
        for i, a in enumerate(nums):
            for b in nums[i + 1:]:
                r = corr.loc[a, b]
                if pd.isna(r) or abs(r) < 0.5 or target in (a, b):
                    continue
                if abs(r) >= 0.97:
                    found.append(Insight(f"'{a}' and '{b}' carry almost the same information (correlation {r:.2f}): you probably need only one.", "redundant", 0.45, [a, b]))
                    continue
                way = "go up" if r > 0 else "go down"
                found.append(Insight(f"When '{a}' is higher, '{b}' tends to {way} too (correlation {r:.2f}).", "correlation", min(1.0, abs(r) * 0.9), [a, b],
                                     "Spearman rank correlation, so it also catches curved relationships. Correlation isn't proof of cause.",
                                     _scatter(w, a, b)))

    # --- groups that differ
    for g in cats:
        if g == target:
            continue
        levels = w[g].value_counts()
        levels = levels[levels >= max(5, 0.01 * n)]
        if len(levels) < 2:
            continue
        best = None
        for m in nums:
            if m == target:
                continue
            sub = w[w[g].isin(levels.index)]
            e = _eta_squared(sub[g], sub[m])
            if e >= 0.06 and (best is None or e > best[0]):
                best = (e, m, sub)
        if best:
            e, m, sub = best
            means = sub.groupby(g)[m].mean().sort_values(ascending=False)
            hi, lo = label(g, means.index[0], roles), label(g, means.index[-1], roles)
            found.append(Insight(f"'{m}' differs a lot by '{g}': {hi} averages {nice(means.iloc[0])}, {_times(means.iloc[0], means.iloc[-1])} {lo} ({nice(means.iloc[-1])}).",
                                 "segment", min(1.0, math.sqrt(e) * 1.1), [g, m], f"'{g}' explains {e * 100:.0f}% of the variation in '{m}'.",
                                 {"type": "bar", "labels": [label(g, x, roles).strip("'") for x in means.index[:10]], "values": [round(float(v), 4) for v in means.values[:10]], "title": f"Average {m} by {g}"}))

    # --- one value dominates a column / 80-20 concentration
    for g in [c for c, r in roles.items() if r == "cat"]:
        vc = w[g].value_counts(normalize=True)
        if len(vc) >= 3 and vc.iloc[0] >= 0.5:
            found.append(Insight(f"'{g}' is mostly '{vc.index[0]}' ({vc.iloc[0] * 100:.0f}% of rows).", "dominance", 0.25 + 0.3 * (vc.iloc[0] - 0.5), [g]))
    for g in [c for c, r in roles.items() if r in ("cat", "key")]:
        if w[g].nunique() < 10:
            continue
        for m in sorted(nums, key=lambda c: 0 if MONEY_FIRST.search(c) else 1):
            x = robust(w[m])
            if x.min() < 0 or not ADDITIVE.search(m):
                continue
            totals = x.groupby(w[g]).sum().sort_values(ascending=False)
            if totals.sum() <= 0:
                continue
            k = max(1, int(round(len(totals) * 0.2)))
            share = totals.iloc[:k].sum() / totals.sum()
            if share >= 0.6:
                found.append(Insight(f"The top 20% of '{g}' values ({k} of {len(totals)}) account for {share * 100:.0f}% of total '{m}'.", "concentration",
                                     min(1.0, 0.3 + (share - 0.6)), [g, m], "An 80/20 pattern: a few account for most of the total.",
                                     {"type": "bar", "labels": [str(v) for v in totals.index[:10]], "values": [round(float(v), 4) for v in totals.values[:10]], "title": f"Total {m} by {g} (top 10)"}))
                break

    # --- lopsided numbers
    for m in nums:
        x = robust(w[m]).dropna()
        if len(x) < 30:
            continue
        mean, med = x.mean(), x.median()
        if x.skew() > 2 and med > 0 and mean > 1.5 * med:
            found.append(Insight(f"'{m}' is lopsided: the average is {nice(mean)} but the typical value (median) is {nice(med)}. A few very large values pull the average up.",
                                 "skew", 0.3, [m], "Report the median, or look at the large values separately."))

    # --- over time: on the main date column, with thin periods and extreme values left out so they can't fake a trend
    found.extend(time_insights(w, nums, dates, n))

    # --- what drives the target
    if target is not None and target in w.columns:
        found = [i for i in found if not (i.kind == "segment" and target in i.columns)]
        found.extend(drivers(w, roles, target))

    found.sort(key=lambda i: -i.score)
    seen, out = set(), []
    for i in found:
        if i.title not in seen:
            seen.add(i.title); out.append(i)
    return out[:limit]


def robust(x: pd.Series) -> pd.Series:
    """Values clipped at 3 IQRs past the quartiles (on a log scale for positive, lopsided data), so a few typos like
    9,999 can't dominate a total or an average."""
    v = x.dropna()
    if len(v) < 20:
        return x
    log = v.min() >= 0 and v.skew() > 1
    t = np.log1p(v) if log else v
    q1, q3 = np.percentile(t, [25, 75])
    hi = q3 + 3 * (q3 - q1)
    hi = float(np.expm1(hi)) if log else float(hi)
    lo = None if log else float(q1 - 3 * (q3 - q1))
    return x.clip(lower=lo, upper=hi)


def time_insights(w: pd.DataFrame, nums: list[str], dates: list[str], n: int) -> list[Insight]:
    out: list[Insight] = []
    best = None
    # The main date column: the first one with enough well-filled periods, skipping dates that describe people
    # (birth, signup, joined) rather than the events in the table.
    preferred = [d for d in dates if not PERSON_DATE.search(d)] + [d for d in dates if PERSON_DATE.search(d)]
    for d in preferred:
        col = w[d].dropna()
        span = (col.max() - col.min()).days if len(col) else 0
        if span < 14:
            continue
        freq = "M" if span > 120 else "W" if span > 30 else "D"
        counts = col.dt.to_period(freq).value_counts()
        good = int((counts >= max(5, 0.005 * n)).sum())
        if good >= 4:
            best = (good, d, freq)
            break
    if not best:
        return out
    _, d, freq = best
    label = {"M": "month", "W": "week", "D": "day"}[freq]
    period = w[d].dt.to_period(freq)
    counts = period.value_counts().sort_index()
    keep = counts[counts >= max(5, 0.005 * n)].index
    series = [("rows", counts.loc[keep].astype(float), "number of rows")]
    for m in nums[:8]:
        agg = "sum" if (w[m].min() >= 0 and ADDITIVE.search(m)) else "mean"
        ts = robust(w[m]).groupby(period).agg(agg).sort_index()
        series.append((m, ts.reindex(keep), f"{'total' if agg == 'sum' else 'average'} '{m}'"))
    trends, changes = [], []
    for m, ts, what in series:
        ts = ts.dropna()
        if len(ts) < 4:
            continue
        cols = [d] + ([m] if m != "rows" else [])
        chart = {"type": "line", "labels": [str(p) for p in ts.index], "values": [round(float(v), 4) for v in ts.values], "title": f"{what[0].upper() + what[1:]} by {label}"}
        k = max(1, len(ts) // 4)
        first, last = ts.iloc[:k].mean(), ts.iloc[-k:].mean()
        if first > 0 and abs((last - first) / first) >= 0.2:
            change = (last - first) / first
            trends.append(Insight(f"{what[0].upper() + what[1:]} {'rose' if change > 0 else 'fell'} {abs(change) * 100:.0f}% from {ts.index[0]} to {ts.index[-1]} (by {label}).",
                                  "trend", min(0.95, 0.35 + abs(change) / 3), cols, f"Comparing the first and last quarter of the {label}s.", chart))
        steps = ts.pct_change().replace([np.inf, -np.inf], np.nan).dropna()
        if len(steps) >= 3:
            worst, top = steps.idxmin(), steps.idxmax()
            if steps.loc[worst] <= -0.25:
                prev = ts.index[ts.index.get_loc(worst) - 1]
                changes.append(Insight(f"{what[0].upper() + what[1:]} dropped {abs(steps.loc[worst]) * 100:.0f}% in {worst} (vs {prev}), the biggest fall of any {label}.",
                                       "change", min(0.95, 0.4 + abs(steps.loc[worst]) / 2), cols, chart=chart))
            if steps.loc[top] >= 0.4:
                prev = ts.index[ts.index.get_loc(top) - 1]
                changes.append(Insight(f"{what[0].upper() + what[1:]} jumped {steps.loc[top] * 100:.0f}% in {top} (vs {prev}), the biggest rise of any {label}.",
                                       "change", min(0.9, 0.3 + steps.loc[top] / 4), cols, chart=chart))
    trends.sort(key=lambda i: -i.score)
    # One biggest fall and one biggest rise, not two versions of the same month from related columns.
    picked = []
    for word in ("dropped", "jumped"):
        same = [c for c in changes if f" {word} " in c.title]
        if same:
            picked.append(max(same, key=lambda i: (i.score, any(MONEY_FIRST.search(c) for c in i.columns[1:]))))
    return trends[:3] + picked


def drivers(w: pd.DataFrame, roles: dict[str, str], target: str) -> list[Insight]:
    """How strongly each column relates to the target, strongest first."""
    t = w[target]
    numeric_target = roles.get(target) in ("num", "bool")
    strengths: list[tuple[float, str, str]] = []
    for c, r in roles.items():
        if c == target or r == "date":
            continue
        if r in ("num", "bool"):
            if numeric_target:
                v = w[[c, target]].corr(method="spearman").iloc[0, 1]
                if pd.notna(v):
                    strengths.append((abs(float(v)), c, f"{'higher' if v > 0 else 'lower'} '{c}' goes with {'higher' if numeric_target else ''} '{target}' (correlation {v:.2f})"))
            else:
                e = _eta_squared(t, w[c])
                strengths.append((math.sqrt(e), c, f"'{c}' differs across '{target}' groups"))
        elif r == "cat" and w[c].nunique() <= 30:
            if numeric_target:
                e = _eta_squared(w[c], t)
                means = t.groupby(w[c]).mean().sort_values(ascending=False)
                strengths.append((math.sqrt(e), c, f"'{target}' is highest for {label(c, means.index[0], roles)} ({nice(means.iloc[0])}) and lowest for {label(c, means.index[-1], roles)} ({nice(means.iloc[-1])})"))
            else:
                strengths.append((_cramers_v(w[c], t), c, f"'{target}' depends on '{c}'"))
    strengths = sorted((s for s in strengths if s[0] >= 0.1), reverse=True)
    if not strengths:
        return [Insight(f"No single column clearly predicts '{target}'.", "driver", 0.2, [target])]
    out = [Insight(f"What drives '{target}': " + ", ".join(f"'{c}'" for _, c, _ in strengths[:3]) + ".", "driver", min(1.0, 0.5 + strengths[0][0] / 2),
                   [target] + [c for _, c, _ in strengths[:5]], "Strength of each column's link to the target (0 = none, 1 = perfect).",
                   {"type": "bar", "labels": [c for _, c, _ in strengths[:8]], "values": [round(s, 3) for s, _, _ in strengths[:8]], "title": f"Link to {target}"})]
    for s, c, text in strengths[:3]:
        out.append(Insight(text[0].upper() + text[1:] + ".", "driver", min(1.0, 0.4 + s / 2), [target, c]))
    return out


def _scatter(w: pd.DataFrame, a: str, b: str, n: int = 300) -> dict:
    pts = pd.DataFrame({a: robust(w[a]), b: robust(w[b])}).dropna()
    if len(pts) > n:
        pts = pts.sample(n, random_state=0)
    return {"type": "scatter", "x": [round(float(v), 4) for v in pts[a]], "y": [round(float(v), 4) for v in pts[b]], "xlabel": a, "ylabel": b, "title": f"{b} vs {a}"}
