import importlib
import json
import sys
import textwrap
from pathlib import Path

import pytest


class Project:
    """A throwaway project: write modules into it, import them, read what veyra-snap stored."""

    def __init__(self, root: Path):
        self.root = root
        self.modules: list[str] = []

    def write(self, rel: str, source: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(source), encoding="utf-8")
        return path

    def load(self, name: str):
        importlib.invalidate_caches()
        self.modules.append(name.split(".")[0])
        return importlib.import_module(name)

    def stored(self, module: str) -> dict:
        return json.loads((self.root / ".veyra-snap" / f"{module}.json").read_text(encoding="utf-8"))

    def cases(self, module: str, qualname: str) -> list:
        return self.stored(module)["functions"][qualname]["cases"]


@pytest.fixture
def project(tmp_path, monkeypatch):
    root = tmp_path / "proj"
    root.mkdir()
    monkeypatch.syspath_prepend(str(root))
    monkeypatch.chdir(root)
    p = Project(root)
    yield p
    for name in list(sys.modules):
        if any(name == m or name.startswith(m + ".") for m in p.modules):
            del sys.modules[name]
