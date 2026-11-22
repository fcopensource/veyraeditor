"""The recordings on disk: one JSON file per module in ``.veyra-snap/``, merged across runs.

A module file looks like::

    {"module": "shop.cart", "root": "src", "functions": {
        "price": {"nondeterministic": false, "cases": [
            {"args": "([1, 2],)", "kwargs": "{}", "returns": "3", "imports": []},
            {"args": "([],)", "kwargs": "{}", "raises": {"type": "ValueError", "import": "",
                                                         "message": "empty cart"}, "imports": []}]}}}

``root`` is the folder (relative to the project) that has to be on ``sys.path`` to import the module.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

STORE_DIR = ".veyra-snap"
DEFAULT_LIMIT = 25


def store_dir(project: str | os.PathLike[str] = ".") -> Path:
    return Path(project) / STORE_DIR


def _file(store: Path, module: str) -> Path:
    return store / f"{module}.json"


def load(store: Path) -> dict[str, dict[str, Any]]:
    """Every recorded module, by name."""
    modules: dict[str, dict[str, Any]] = {}
    if not store.is_dir():
        return modules
    for path in sorted(store.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict) and isinstance(data.get("functions"), dict) and data.get("module"):
            modules[data["module"]] = data
    return modules


def case_key(case: dict[str, Any]) -> str:
    return case["args"] + "\x00" + case["kwargs"]


def outcome(case: dict[str, Any]) -> str:
    if "raises" in case:
        r = case["raises"]
        return f"raises {r['import']} {r['type']} {r['message']}"
    return "returns " + case["returns"]


def merge(store: Path, recorded: dict[str, dict[str, Any]], limit: int = DEFAULT_LIMIT) -> dict[str, int]:
    """Adds new recordings to the store. Returns how many new cases each module got.

    The same arguments with a different outcome mark the function nondeterministic (it depends on time, randomness,
    files, ...), and it gets no tests.
    """
    store.mkdir(parents=True, exist_ok=True)
    ignore = store / ".gitignore"
    if not ignore.exists():  # recordings are working data; the generated tests are what you commit
        ignore.write_text("*\n", encoding="utf-8")
    existing = load(store)
    added: dict[str, int] = {}
    for module, new in recorded.items():
        data = existing.get(module) or {"module": module, "root": new.get("root", ""), "functions": {}}
        if new.get("root") is not None:
            data["root"] = new["root"]
        count = 0
        for qualname, fn in new["functions"].items():
            target = data["functions"].setdefault(qualname, {"nondeterministic": False, "cases": []})
            if fn.get("nondeterministic"):
                target["nondeterministic"] = True
            by_key = {case_key(c): c for c in target["cases"]}
            for case in fn["cases"]:
                old = by_key.get(case_key(case))
                if old is not None:
                    if outcome(old) != outcome(case):
                        target["nondeterministic"] = True
                    continue
                if len(target["cases"]) >= limit:
                    continue
                target["cases"].append(case)
                by_key[case_key(case)] = case
                count += 1
        added[module] = count
        _file(store, module).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return added


def clear(store: Path) -> int:
    removed = 0
    if store.is_dir():
        for path in store.glob("*.json"):
            path.unlink()
            removed += 1
    return removed
