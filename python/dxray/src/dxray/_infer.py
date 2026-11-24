"""What each column really is: numbers, money stored as text, dates, categories, IDs, emails, free text...

pandas only knows storage types (int64, object). ``infer(series)`` looks at the values themselves, so a column of
"$1,200" strings is reported as numbers-in-text, and "2026-03-14" strings as dates-in-text.
"""

from __future__ import annotations

import re
import warnings
from dataclasses import dataclass

import numpy as np
import pandas as pd

# Values people use to mean "missing".
SENTINELS = {"", "na", "n/a", "nan", "none", "null", "nil", "-", "--", "?", "missing", "unknown", "#n/a", "undefined"}
BOOL_WORDS = {"true", "false", "yes", "no", "y", "n", "t", "f", "1", "0"}
NUMBER_RE = re.compile(r"^\s*[-+(]?\s*[$€£₹¥]?\s*[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?\s*[%)]?\s*$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
URL_RE = re.compile(r"^(https?://|www\.)\S+$", re.I)
ID_NAME_RE = re.compile(r"(^|_|\b)(id|uuid|guid|key|code|sku|number|no)$|id$", re.I)

KINDS = ("numeric", "boolean", "datetime", "categorical", "text", "id", "email", "url", "empty", "constant")


@dataclass
class Kind:
    kind: str                  # one of KINDS
    stored_as: str             # the pandas dtype
    note: str = ""             # e.g. "numbers stored as text", "dates stored as text"
    convertible: str = ""      # "numeric" or "datetime" when the text can be converted


def is_text(s: pd.Series) -> bool:
    """Text storage: object columns, and the string dtypes of pandas 2 and 3."""
    return s.dtype == object or pd.api.types.is_string_dtype(s.dtype)


def _sample(values: pd.Series, n: int = 4000) -> pd.Series:
    return values.sample(n, random_state=0) if len(values) > n else values


def parse_number_text(s: pd.Series) -> pd.Series:
    """'$1,200' -> 1200, '12%' -> 12, '(45)' -> -45. Anything else becomes NaN."""
    t = s.astype("string").str.strip()
    neg = (t.str.startswith("(") & t.str.endswith(")")).fillna(False).astype(bool).to_numpy()
    t = t.str.replace(r"[,$€£₹¥%()\s]", "", regex=True)
    out = pd.to_numeric(t, errors="coerce").astype(float)
    return out.where(~neg, -out)


def parse_dates(s: pd.Series) -> pd.Series:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            return pd.to_datetime(s, errors="coerce", format="mixed")
        except (TypeError, ValueError):
            return pd.to_datetime(s, errors="coerce")


def is_missing_text(s: pd.Series) -> pd.Series:
    """True where a text value is one of the usual stand-ins for missing ("N/A", "null", "-", ...)."""
    return s.astype("string").str.strip().str.lower().isin(SENTINELS).fillna(False)


def infer(series: pd.Series, name: str | None = None) -> Kind:
    name = str(name if name is not None else series.name)
    stored = str(series.dtype)
    values = series.dropna()
    if is_text(values):
        values = values[~is_missing_text(values)]
    n = len(values)
    if n == 0:
        return Kind("empty", stored)
    unique = values.nunique(dropna=True)
    if unique == 1:
        return Kind("constant", stored)

    if pd.api.types.is_bool_dtype(series):
        return Kind("boolean", stored)
    if pd.api.types.is_datetime64_any_dtype(series):
        return Kind("datetime", stored)
    if pd.api.types.is_numeric_dtype(series):
        if unique == 2 and set(pd.unique(values)) <= {0, 1}:
            return Kind("boolean", stored)
        if pd.api.types.is_integer_dtype(series) and unique == n and ID_NAME_RE.search(name):
            return Kind("id", stored)
        return Kind("numeric", stored)
    if isinstance(series.dtype, pd.CategoricalDtype):
        return Kind("categorical", stored)

    text = _sample(values).astype("string").str.strip()
    lower = text.str.lower()
    if unique <= 2 and set(lower.unique()) <= BOOL_WORDS:
        return Kind("boolean", stored, "yes/no stored as text")
    if text.str.match(NUMBER_RE).mean() >= 0.95:
        return Kind("numeric", stored, "numbers stored as text", "numeric")
    if text.str.match(EMAIL_RE).mean() >= 0.9:
        return Kind("email", stored)
    if text.str.match(URL_RE).mean() >= 0.9:
        return Kind("url", stored)
    looks_datey = text.str.contains(r"\d", regex=True).mean() > 0.9 and text.str.len().between(6, 32).mean() > 0.9
    if looks_datey and parse_dates(text).notna().mean() >= 0.9:
        return Kind("datetime", stored, "dates stored as text", "datetime")
    if unique == n and (ID_NAME_RE.search(name) or text.str.len().nunique() <= 2):
        return Kind("id", stored)
    if unique <= 200 and unique / n <= 0.5:
        return Kind("categorical", stored)
    return Kind("text", stored)


def numeric_values(series: pd.Series, kind: Kind) -> pd.Series:
    """The column as numbers (converting numbers-in-text), NaN where it isn't one."""
    if kind.convertible == "numeric":
        return parse_number_text(series.where(~is_missing_text(series)))
    if kind.kind == "boolean" and kind.note:
        return series.astype("string").str.strip().str.lower().map(lambda v: 1.0 if v in {"true", "yes", "y", "t", "1"} else 0.0 if v in {"false", "no", "n", "f", "0"} else np.nan)
    return pd.to_numeric(series, errors="coerce")


def datetime_values(series: pd.Series, kind: Kind) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    return parse_dates(series.where(~is_missing_text(series)))
