"""One profile per column: its real type, missing values, stats, top values, and data for a small chart."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ._infer import Kind, datetime_values, infer, is_missing_text, is_text, numeric_values
from ._model import Column


def _fmt_value(v):
    if isinstance(v, (float, np.floating)):
        return round(float(v), 4)
    if isinstance(v, (np.integer,)):
        return int(v)
    return v


def profile_column(name: str, s: pd.Series) -> tuple[Column, Kind]:
    k = infer(s, name)
    raw_missing = int(s.isna().sum())
    text_missing = int(is_missing_text(s[s.notna()]).sum()) if is_text(s) else 0
    missing = raw_missing + text_missing
    present = s[s.notna()]
    if text_missing:
        present = present[~is_missing_text(present)]
    col = Column(name=name, kind=k.kind, stored_as=k.stored_as, note=k.note, count=len(present), missing=missing,
                 unique=int(present.astype(str).nunique()) if len(present) else 0)

    if k.kind == "numeric":
        x = numeric_values(s, k).astype(float)
        x = x[np.isfinite(x)]
        if len(x):
            q1, med, q3 = np.percentile(x, [25, 50, 75])
            col.stats = {"min": x.min(), "max": x.max(), "mean": x.mean(), "median": med, "std": x.std(ddof=0),
                         "q1": q1, "q3": q3, "zeros": int((x == 0).sum()), "negatives": int((x < 0).sum()),
                         "skew": float(x.skew()) if len(x) > 2 else 0.0, "sum": x.sum()}
            col.stats = {key: _fmt_value(v) for key, v in col.stats.items()}
            lo, hi = np.percentile(x, [1, 99]) if len(x) > 50 else (x.min(), x.max())
            clipped = x[(x >= lo) & (x <= hi)]
            if len(clipped) and clipped.max() > clipped.min():
                counts, edges = np.histogram(clipped, bins=min(24, max(6, int(np.sqrt(len(clipped))))))
                col.chart = {"type": "hist", "counts": counts.tolist(), "edges": [round(float(e), 4) for e in edges]}
    elif k.kind == "datetime":
        d = datetime_values(s, k).dropna()
        if len(d):
            col.stats = {"min": d.min(), "max": d.max(), "span_days": int((d.max() - d.min()).days)}
            by = d.dt.to_period("M" if col.stats["span_days"] > 90 else "D").value_counts().sort_index()
            col.chart = {"type": "line", "labels": [str(p) for p in by.index], "values": by.astype(int).tolist()}
    elif k.kind in ("categorical", "boolean", "constant"):
        vc = present.astype(str).str.strip().value_counts()
        col.top = [(v, int(c)) for v, c in vc.head(10).items()]
        col.chart = {"type": "bar", "labels": [str(v) for v, _ in col.top], "values": [c for _, c in col.top]}
    elif k.kind in ("text", "email", "url", "id"):
        lengths = present.astype(str).str.len()
        if len(lengths):
            col.stats = {"avg_length": round(float(lengths.mean()), 1), "max_length": int(lengths.max())}
        col.top = [(v, int(c)) for v, c in present.astype(str).value_counts().head(3).items()]
    return col, k


def profile(df: pd.DataFrame) -> tuple[list[Column], dict[str, Kind]]:
    cols, kinds = [], {}
    for name in df.columns:
        c, k = profile_column(str(name), df[name])
        cols.append(c)
        kinds[str(name)] = k
    return cols, kinds
