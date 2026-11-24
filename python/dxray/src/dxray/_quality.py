"""What's wrong with the data: each problem in one sentence, with examples and the pandas line that fixes it."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ._infer import Kind, is_missing_text, is_text, numeric_values
from ._model import Column, Issue

SEVERITY = {"high": 0, "medium": 1, "low": 2}


def _q(name: str) -> str:
    return repr(name)


def _pct(n: int, total: int) -> str:
    p = 100.0 * n / total if total else 0
    return f"{p:.0f}%" if p >= 1 else f"{p:.1f}%" if p >= 0.1 else "<0.1%"


def find_issues(df: pd.DataFrame, cols: list[Column], kinds: dict[str, Kind]) -> list[Issue]:
    n = len(df)
    out: list[Issue] = []
    if n == 0:
        return [Issue("high", "The table is empty.", code="empty-table")]

    dupes = int(df.duplicated().sum()) if df.shape[1] else 0
    if dupes:
        out.append(Issue("high" if dupes / n > 0.01 else "medium", f"{dupes:,} rows ({_pct(dupes, n)}) are exact duplicates of another row.",
                         count=dupes, fix="df = df.drop_duplicates()", auto=True, code="duplicate-rows"))

    for c in cols:
        s, k = df[_orig(df, c.name)], kinds[c.name]
        name = c.name
        if k.kind == "empty":
            out.append(Issue("medium", f"'{name}' has no values at all.", name, n, fix=f"df = df.drop(columns=[{_q(name)}])", auto=True, code="empty-column"))
            continue
        if k.kind == "constant":
            out.append(Issue("low", f"'{name}' has the same value in every row ({c.top[0][0] if c.top else s.dropna().iloc[0]!r}): it tells you nothing.",
                             name, n, fix=f"df = df.drop(columns=[{_q(name)}])", code="constant-column"))
        if c.missing:
            share = c.missing / n
            sev = "high" if share > 0.3 else "medium" if share > 0.05 else "low"
            out.append(Issue(sev, f"'{name}' is missing {c.missing:,} values ({_pct(c.missing, n)}).", name, c.missing,
                             fix=(f"df[{_q(name)}] = df[{_q(name)}].fillna(df[{_q(name)}].median())" if k.kind == "numeric"
                                  else f"df = df.dropna(subset=[{_q(name)}])"), code="missing"))
        if is_text(s):
            present = s.dropna()
            sentinel = is_missing_text(present)
            if sentinel.any():
                words = sorted(present[sentinel].astype(str).str.strip().unique().tolist())[:5]
                out.append(Issue("medium", f"'{name}' uses text like {', '.join(repr(w) for w in words)} to mean missing ({int(sentinel.sum()):,} rows).",
                                 name, int(sentinel.sum()), words, fix=f"df[{_q(name)}] = df[{_q(name)}].replace({words!r}, pd.NA)", auto=True, code="missing-as-text"))
            if k.convertible == "numeric":
                ex = present[~sentinel].astype(str).head(3).tolist()
                out.append(Issue("high", f"'{name}' holds numbers stored as text (like {', '.join(repr(e) for e in ex)}), so you can't sum or average it.",
                                 name, len(present), ex, fix=f"df[{_q(name)}] = pd.to_numeric(df[{_q(name)}].astype(str).str.replace(r'[,$€£₹¥%\\s]', '', regex=True), errors='coerce')",
                                 auto=True, code="numbers-as-text"))
            if k.convertible == "datetime":
                ex = present[~sentinel].astype(str).head(2).tolist()
                out.append(Issue("medium", f"'{name}' holds dates stored as text (like {', '.join(repr(e) for e in ex)}).", name, len(present), ex,
                                 fix=f"df[{_q(name)}] = pd.to_datetime(df[{_q(name)}], errors='coerce')", auto=True, code="dates-as-text"))
            text = present[~sentinel].astype(str)
            padded = int((text != text.str.strip()).sum())
            if padded:
                ex = text[text != text.str.strip()].head(3).tolist()
                out.append(Issue("low", f"'{name}' has {padded:,} values with spaces at the start or end (like {ex[0]!r}).", name, padded, ex,
                                 fix=f"df[{_q(name)}] = df[{_q(name)}].str.strip()", auto=True, code="whitespace"))
            if k.kind in ("categorical", "text", "boolean") and len(text):
                groups = text.str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
                variants = text.str.strip().groupby(groups).nunique()
                messy = variants[variants > 1]
                if len(messy):
                    first = messy.index[0]
                    spellings = sorted(text[groups == first].str.strip().unique().tolist())[:4]
                    rows = int(groups.isin(messy.index).sum())
                    out.append(Issue("medium", f"'{name}' spells the same value different ways (like {', '.join(repr(v) for v in spellings)}): {len(messy)} value{'s' * (len(messy) != 1)} affected.",
                                     name, rows, spellings, fix=f"df[{_q(name)}] = df[{_q(name)}].str.strip().str.title()", auto=True, code="inconsistent-categories"))
            if k.kind == "text" and c.unique and not k.convertible:
                kinds_present = present.map(lambda v: type(v).__name__).value_counts()
                if len(kinds_present) > 1:
                    out.append(Issue("medium", f"'{name}' mixes value types ({', '.join(kinds_present.index[:3])}).", name, len(present),
                                     fix=f"df[{_q(name)}] = df[{_q(name)}].astype(str)", code="mixed-types"))
        if k.kind == "numeric":
            x = numeric_values(s, k).dropna()
            if len(x) >= 20:
                # Money and counts are naturally lopsided: judge positive, skewed columns on a log scale.
                log = x.min() >= 0 and x.skew() > 1
                t = np.log1p(x) if log else x
                q1, q3 = np.percentile(t, [25, 75])
                iqr = q3 - q1
                if iqr > 0:
                    lo, hi = q1 - 3 * iqr, q3 + 3 * iqr
                    if log:
                        lo, hi, q1, q3 = max(0.0, float(np.expm1(lo))), float(np.expm1(hi)), float(np.expm1(q1)), float(np.expm1(q3))
                    far = x[(x < lo) | (x > hi)]
                    if len(far):
                        ex = sorted(far.unique().tolist(), key=lambda v: -abs(v - np.median(x)))[:3]
                        out.append(Issue("medium" if len(far) / len(x) < 0.05 else "low",
                                         f"'{name}' has {len(far):,} extreme value{'s' * (len(far) != 1)} far outside the usual range ({_num(q1)} to {_num(q3)}), like {', '.join(_num(e) for e in ex)}.",
                                         name, len(far), ex, fix=f"df = df[df[{_q(name)}].between({_num(lo, raw=True)}, {_num(hi, raw=True)})]", code="outliers"))
                for bad in (-999, -9999, 9999, 99999, -1):
                    hits = int((x == bad).sum())
                    if hits >= 3 and hits / len(x) > 0.005 and (bad != -1 or (x >= 0).mean() > 0.95):
                        out.append(Issue("medium", f"'{name}' uses {bad} {hits:,} times: probably a stand-in for missing.", name, hits, [bad],
                                         fix=f"df[{_q(name)}] = df[{_q(name)}].replace({bad}, np.nan)", code="sentinel-number"))
                        break
        if k.kind == "id" or (c.unique and c.count and c.unique / c.count > 0.9 and "id" in name.lower()):
            present = s.dropna()
            d = int(present.duplicated().sum())
            if d:
                out.append(Issue("high", f"'{name}' looks like an ID but {d:,} values repeat.", name, d, present[present.duplicated()].head(3).tolist(),
                                 fix=f"df[df[{_q(name)}].duplicated(keep=False)]", code="duplicate-ids"))
        if k.kind == "categorical" and c.unique > 50:
            out.append(Issue("low", f"'{name}' has {c.unique} different values: too many to compare groups easily.", name, c.unique, code="high-cardinality"))
    out.sort(key=lambda i: (SEVERITY[i.severity], -i.count))
    return out


def _orig(df: pd.DataFrame, name: str):
    """The real column label for a stringified name."""
    for c in df.columns:
        if str(c) == name:
            return c
    return name


def _num(v: float, raw: bool = False) -> str:
    v = float(v)
    if raw:
        return repr(round(v, 4))
    if abs(v) >= 1e6:
        return f"{v / 1e6:,.1f}M"
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    return f"{v:,.2f}".rstrip("0").rstrip(".") if v != int(v) else f"{int(v):,}"
