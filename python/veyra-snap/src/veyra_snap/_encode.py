"""Turn Python values into source code that rebuilds them exactly.

``encode(value)`` returns the source and the imports it needs. Every result is checked by evaluating it again and
comparing, type for type, so a generated test never contains a value that doesn't round-trip. Values that can't be
written as plain source (open files, sockets, objects without a usable constructor, NaN, ...) raise ``Unsupported``.
"""

from __future__ import annotations

import dataclasses
import datetime
import decimal
import enum
import fractions
import math
import sys
import uuid
from typing import Any

MAX_SOURCE = 4000  # longer values make unreadable tests, so they're skipped
MAX_DEPTH = 12


class Unsupported(Exception):
    """The value can't be written as source code that rebuilds it."""


def encode(value: Any) -> tuple[str, frozenset[str]]:
    """Source code for ``value`` and the ``import`` lines it needs. Raises ``Unsupported``."""
    imports: set[str] = set()
    try:
        source = _enc(value, imports, 0)
    except RecursionError:  # a self-referencing structure
        raise Unsupported("the value refers to itself") from None
    if len(source) > MAX_SOURCE:
        raise Unsupported(f"too large to read in a test ({len(source)} characters)")
    namespace: dict[str, Any] = {}
    try:
        for line in sorted(imports):
            exec(line, namespace)
        rebuilt = eval(source, namespace)
    except Exception as error:
        raise Unsupported(f"its source doesn't rebuild it ({type(error).__name__})") from None
    if not same(rebuilt, value):
        raise Unsupported("its source rebuilds a different value")
    return source, frozenset(imports)


def same(a: Any, b: Any) -> bool:
    """Equal, and of the same types all the way down (so 1, 1.0 and True stay different)."""
    if type(a) is not type(b):
        return False
    if isinstance(a, (list, tuple)):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict):
        return list(a) == list(b) and all(same(a[k], b[k]) for k in a)
    try:
        return bool(a == b)
    except Exception:
        return False


def _ref(obj: Any) -> tuple[str, str]:
    """``(import line, dotted path)`` for a module-level class, or Unsupported."""
    module = getattr(obj, "__module__", None)
    qualname = getattr(obj, "__qualname__", None)
    if not module or not qualname or module == "__main__" or "<" in qualname:
        raise Unsupported(f"{getattr(obj, '__name__', obj)!s} can't be imported by a test")
    mod = sys.modules.get(module)
    found: Any = mod
    for part in qualname.split("."):
        found = getattr(found, part, None)
    if found is not obj:
        raise Unsupported(f"{module}.{qualname} can't be found by importing it")
    if module == "builtins":
        return "", qualname
    return f"import {module}", f"{module}.{qualname}"


def _enc(v: Any, imports: set[str], depth: int) -> str:
    if depth > MAX_DEPTH:
        raise Unsupported("nested too deeply")
    t = type(v)
    if v is None or t is bool or t is int or t is str or t is bytes:
        return repr(v)
    if t is float:
        if math.isnan(v):
            raise Unsupported("NaN never equals itself")
        if math.isinf(v):
            return "float('inf')" if v > 0 else "float('-inf')"
        return repr(v)
    if t is complex:
        if math.isnan(v.real) or math.isnan(v.imag) or math.isinf(v.real) or math.isinf(v.imag):
            raise Unsupported("complex value with NaN or infinity")
        return repr(v)
    nxt = depth + 1
    if t is list:
        return "[" + ", ".join(_enc(x, imports, nxt) for x in v) + "]"
    if t is tuple:
        items = [_enc(x, imports, nxt) for x in v]
        return "(" + items[0] + ",)" if len(items) == 1 else "(" + ", ".join(items) + ")"
    if t is dict:
        return "{" + ", ".join(f"{_enc(k, imports, nxt)}: {_enc(x, imports, nxt)}" for k, x in v.items()) + "}"
    if t is set or t is frozenset:
        items = sorted(_enc(x, imports, nxt) for x in v)  # sorted, so files don't change between runs
        if t is set:
            return "{" + ", ".join(items) + "}" if items else "set()"
        return "frozenset({" + ", ".join(items) + "})" if items else "frozenset()"
    if t is decimal.Decimal:
        imports.add("import decimal")
        return f"decimal.Decimal({str(v)!r})"
    if t is fractions.Fraction:
        imports.add("import fractions")
        return f"fractions.Fraction({v.numerator}, {v.denominator})"
    if t in (datetime.date, datetime.datetime, datetime.time, datetime.timedelta, datetime.timezone):
        imports.add("import datetime")
        source = repr(v)
        if "zoneinfo." in source:
            imports.add("import zoneinfo")
        return source
    if t is uuid.UUID:
        imports.add("import uuid")
        return f"uuid.UUID({str(v)!r})"
    if isinstance(v, enum.Enum):
        line, path = _ref(t)
        if line:
            imports.add(line)
        return f"{path}.{v.name}"
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        fields = dataclasses.fields(v)
        if any(not f.init for f in fields):
            raise Unsupported(f"{t.__name__} has fields its constructor doesn't take")
        line, path = _ref(t)
        if line:
            imports.add(line)
        return f"{path}(" + ", ".join(f"{f.name}={_enc(getattr(v, f.name), imports, nxt)}" for f in fields) + ")"
    if isinstance(v, tuple) and hasattr(t, "_fields"):  # a namedtuple
        line, path = _ref(t)
        if line:
            imports.add(line)
        return f"{path}(" + ", ".join(f"{name}={_enc(x, imports, nxt)}" for name, x in zip(t._fields, v)) + ")"
    raise Unsupported(f"{t.__name__} values can't be written as source")
