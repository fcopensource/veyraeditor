"""The public functions: scan, clean, for_llm and ask."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from ._infer import is_missing_text, is_text, numeric_values, parse_dates
from ._insights import find_insights, nice
from ._model import Column
from ._profile import profile
from ._quality import find_issues
from ._report import Report


def _frame(data: Any) -> tuple[pd.DataFrame, str]:
    """Anything table-like, or a path to a CSV / Excel / Parquet / JSON file, as a DataFrame."""
    if isinstance(data, pd.DataFrame):
        return data, "dataset"
    if isinstance(data, pd.Series):
        return data.to_frame(), str(data.name or "series")
    if isinstance(data, (str, os.PathLike)):
        path = os.fspath(data)
        low = path.lower()
        name = os.path.basename(path)
        if low.endswith((".csv", ".txt", ".tsv")):
            return pd.read_csv(path, sep="\t" if low.endswith(".tsv") else ",", low_memory=False), name
        if low.endswith((".xlsx", ".xls")):
            return pd.read_excel(path), name
        if low.endswith(".parquet"):
            return pd.read_parquet(path), name
        if low.endswith((".json", ".jsonl")):
            return pd.read_json(path, lines=low.endswith(".jsonl")), name
        raise ValueError(f"dxray can't read {name!r}: use a CSV, Excel, Parquet or JSON file, or a pandas DataFrame.")
    if hasattr(data, "to_pandas"):  # polars, pyarrow, ...
        return data.to_pandas(), "dataset"
    return pd.DataFrame(data), "dataset"


def scan(data: Any, target: str | None = None, *, name: str | None = None, insights: int = 20) -> Report:
    """X-ray a dataset: what each column really is, what's wrong with it, and what stands out.

    ``data`` is a pandas DataFrame (or polars/pyarrow table, dict, list of rows) or a path to a CSV, Excel, Parquet or
    JSON file. ``target`` is the column you care about most (sales, churn, price...): dxray then shows what drives it.
    """
    df, default_name = _frame(data)
    if target is not None and target not in map(str, df.columns):
        raise KeyError(f"No column named {target!r}. Columns: {', '.join(map(str, df.columns))}")
    cols, kinds = profile(df)
    report = Report(rows=len(df), columns=cols, issues=find_issues(df, cols, kinds), insights=find_insights(df, kinds, target, insights),
                    target=target, name=name or default_name, memory_mb=round(df.memory_usage(deep=True).sum() / 1e6, 2))
    return report


@dataclass
class CleanLog:
    """What dx.clean() changed, one line per change."""
    changes: list[str] = field(default_factory=list)
    rows_before: int = 0
    rows_after: int = 0

    def __str__(self) -> str:
        head = f"dxray cleaned {self.rows_before:,} rows → {self.rows_after:,} rows, {len(self.changes)} change{'s' * (len(self.changes) != 1)}"
        return head + ("".join(f"\n  ✓ {c}" for c in self.changes) if self.changes else "\n  Nothing needed fixing.")

    __repr__ = __str__


def clean(data: Any, *, duplicates: bool = True, drop_empty: bool = True, fix_text: bool = True, convert: bool = True,
          inplace: bool = False) -> tuple[pd.DataFrame, CleanLog]:
    """Fix the safe, mechanical problems scan() finds, and say exactly what changed.

    Turns "N/A"-style text into real missing values, strips stray spaces, merges spellings of the same category
    ("NY", "ny ", "Ny" -> the most common one), converts numbers and dates stored as text, drops exact duplicate rows
    and empty columns. It never drops outliers or fills in missing values: those are decisions, not fixes.
    """
    df, _ = _frame(data)
    df = df if inplace else df.copy()
    log = CleanLog(rows_before=len(df))
    if drop_empty:
        empty = [c for c in df.columns if df[c].isna().all() or (is_text(df[c]) and is_missing_text(df[c].dropna()).all())]
        if empty:
            df = df.drop(columns=empty)
            log.changes.append(f"Dropped {len(empty)} empty column{'s' * (len(empty) != 1)}: {', '.join(map(str, empty))}")
    cols, kinds = profile(df)
    for col in df.columns:
        k = kinds[str(col)]
        s = df[col]
        if not is_text(s):
            continue
        if fix_text:
            present = s.notna()
            sentinel = present & is_missing_text(s.where(present, ""))
            if sentinel.any():
                df[col] = s = s.mask(sentinel)
                log.changes.append(f"'{col}': {int(sentinel.sum()):,} values like 'N/A' or '-' are now missing values")
            stripped = s.where(s.isna(), s.astype(str).str.strip())
            changed = int((s.notna() & (stripped != s)).fillna(False).sum())
            if changed:
                df[col] = s = stripped
                log.changes.append(f"'{col}': trimmed spaces from {changed:,} values")
        if convert and k.convertible == "numeric":
            df[col] = numeric_values(s, k)
            log.changes.append(f"'{col}': numbers stored as text are now numbers")
            continue
        if convert and k.convertible == "datetime":
            df[col] = parse_dates(s)
            log.changes.append(f"'{col}': dates stored as text are now dates")
            continue
        if fix_text and k.kind in ("categorical", "boolean"):
            text = s.dropna().astype(str)
            key = text.str.lower().str.replace(r"\s+", " ", regex=True)
            canon = text.groupby(key).agg(lambda v: v.value_counts().index[0])
            merged = key.map(canon)
            changed = int((merged != text).sum())
            if changed:
                df.loc[merged.index, col] = merged
                log.changes.append(f"'{col}': merged different spellings of the same value ({changed:,} values)")
    if duplicates:
        dupes = int(df.duplicated().sum())
        if dupes:
            df = df.drop_duplicates()
            log.changes.append(f"Dropped {dupes:,} duplicate rows")
    log.rows_after = len(df)
    return df, log


def for_llm(data: Any, *, target: str | None = None, sample_rows: int = 5, max_chars: int = 12000, report: Report | None = None) -> str:
    """The dataset described for an AI model: schema, statistics, a few rows, problems and findings, in compact Markdown.

    Paste it into a prompt (or let dx.ask() do it) so the model knows your data without seeing every row.
    """
    df, name = _frame(data)
    r = report or scan(df, target, name=name)
    lines = [f"# Dataset: {r.name}", f"{r.rows:,} rows, {len(r.columns)} columns. Data health {r.health}/100.", "", "## Columns",
             "name | type | missing | unique | summary", "---|---|---|---|---"]
    for c in r.columns:
        lines.append(f"{c.name} | {c.kind}{' (' + c.note + ')' if c.note else ''} | {c.missing_pct:.1f}% | {c.unique:,} | {_llm_summary(c)}")
    if sample_rows and len(df):
        sample = df.sample(min(sample_rows, len(df)), random_state=0) if len(df) > sample_rows else df
        lines += ["", f"## {len(sample)} sample rows", _rows_text(sample)]
    if r.issues:
        lines += ["", "## Data problems"] + [f"- [{i.severity}] {i.title}" for i in r.issues[:15]]
    if r.insights:
        lines += ["", "## Findings (computed from all rows)"] + [f"- {i.title}" + (f" {i.detail}" if i.detail else "") for i in r.insights[:15]]
    text = "\n".join(lines)
    return text if len(text) <= max_chars else text[: max_chars - 40] + "\n…(trimmed to fit max_chars)"


def _llm_summary(c: Column) -> str:
    s = c.stats
    if c.kind == "numeric" and s:
        return f"min {nice(s['min'])}, median {nice(s['median'])}, mean {nice(s['mean'])}, max {nice(s['max'])}, sum {nice(s['sum'])}"
    if c.kind == "datetime" and s:
        return f"{str(s['min'])[:10]} to {str(s['max'])[:10]}"
    if c.top:
        return ", ".join(f"{v}={n}" for v, n in c.top[:6])
    return ""


def _rows_text(df: pd.DataFrame) -> str:
    cols = [str(c) for c in df.columns]
    out = [" | ".join(cols), "|".join("---" for _ in cols)]
    for _, row in df.iterrows():
        out.append(" | ".join(_cell(v) for v in row.values))
    return "\n".join(out)


def _cell(v: Any) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA or v is pd.NaT:
        return ""
    t = str(v).replace("|", "/").replace("\n", " ")
    return t if len(t) <= 40 else t[:37] + "..."
