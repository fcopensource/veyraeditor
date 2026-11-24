"""The pieces of a report: what each column is, what's wrong with the data, and what's interesting in it."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Column:
    name: str
    kind: str
    stored_as: str
    note: str = ""
    count: int = 0
    missing: int = 0
    unique: int = 0
    stats: dict[str, Any] = field(default_factory=dict)
    top: list[tuple[Any, int]] = field(default_factory=list)
    chart: dict[str, Any] = field(default_factory=dict)

    @property
    def missing_pct(self) -> float:
        total = self.count + self.missing
        return 100.0 * self.missing / total if total else 0.0


@dataclass
class Issue:
    """Something wrong with the data, and how to fix it."""
    severity: str              # "high", "medium" or "low"
    title: str                 # one plain sentence
    column: str | None = None
    count: int = 0
    examples: list[Any] = field(default_factory=list)
    fix: str = ""              # a pandas line that fixes it
    auto: bool = False         # dx.clean() fixes it for you
    code: str = ""             # a stable id, e.g. "numbers-as-text"


@dataclass
class Insight:
    """Something worth knowing about the data, in a sentence a person can read."""
    title: str
    kind: str                  # correlation, driver, segment, trend, concentration, dominance, skew, redundant, change
    score: float               # 0..1: how strong or surprising it is
    columns: list[str] = field(default_factory=list)
    detail: str = ""
    chart: dict[str, Any] = field(default_factory=dict)


def plain(obj: Any) -> Any:
    """Make dataclasses and numpy/pandas values JSON-friendly."""
    import math

    import numpy as np
    import pandas as pd

    if hasattr(obj, "__dataclass_fields__"):
        return {k: plain(v) for k, v in asdict(obj).items()}
    if isinstance(obj, dict):
        return {str(k): plain(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [plain(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    if obj is pd.NaT:
        return None
    if isinstance(obj, (pd.Timedelta,)):
        return str(obj)
    return obj
