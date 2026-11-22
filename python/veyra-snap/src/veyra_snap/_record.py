"""Recording real calls: what each function was given, and what it returned or raised.

Two ways in:

* automatic: ``veyra-snap run app.py`` or ``with veyra_snap.recording():`` watches every function in your project
  (``sys.monitoring`` on Python 3.12+, ``sys.settrace`` before that) without changing your code;
* by hand: ``@snap`` on the functions you choose, recorded when ``VEYRA_SNAP=1`` or inside ``recording()``.
"""

from __future__ import annotations

import atexit
import contextlib
import fnmatch
import functools
import inspect
import os
import sys
import threading
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Iterator, TypeVar

from . import _store
from ._encode import Unsupported, _ref, encode

F = TypeVar("F", bound=Callable[..., Any])

CO_VARARGS, CO_VARKEYWORDS = 0x04, 0x08
CO_NOT_PLAIN = 0x20 | 0x80 | 0x100 | 0x200  # generator, coroutine, iterable coroutine, async generator
SKIP_DIRS = {"site-packages", "dist-packages", ".venv", "venv", "env", ".env", ".tox", ".nox", "node_modules",
             "__pycache__", ".git", "tests", "test", "testing"}
HERE = Path(__file__).resolve().parent

_local = threading.local()


def _busy() -> bool:
    return getattr(_local, "busy", False)


@contextlib.contextmanager
def _quiet() -> Iterator[None]:
    """Our own work (encoding calls __eq__, constructors, ...) mustn't be recorded."""
    before = _busy()
    _local.busy = True
    try:
        yield
    finally:
        _local.busy = before


def _stack() -> list[Any]:
    stack = getattr(_local, "stack", None)
    if stack is None:
        stack = _local.stack = []
    return stack


def _is_code(obj: Any, code: Any) -> bool:
    for _ in range(20):  # through decorators
        if obj is None:
            return False
        if getattr(getattr(obj, "__func__", obj), "__code__", None) is code:
            return True
        obj = getattr(obj, "__wrapped__", None)
    return False


def _guess_qualname(code: Any, f_globals: dict[str, Any]) -> str:
    """Python 3.9 and 3.10 have no co_qualname: find the function, or the class holding it, in its module."""
    name = code.co_name
    if _is_code(f_globals.get(name), code):
        return name
    module = f_globals.get("__name__")
    for key, value in list(f_globals.items()):
        if isinstance(value, type) and value.__module__ == module and _is_code(value.__dict__.get(name), code):
            return f"{key}.{name}"
    return name


def _import_root(module: str, file: str | None) -> str | None:
    """The folder that must be on sys.path to ``import module`` (``src`` for ``src/shop/cart.py``)."""
    if not file:
        return None
    path = Path(file).resolve()
    levels = len(module.split(".")) - (0 if path.name == "__init__.py" else 1)
    root = path.parent
    for _ in range(levels):
        root = root.parent
    return str(root)


class Target:
    """How a test imports and calls a recorded function."""

    __slots__ = ("module", "qualname", "drop_first", "root", "skip")

    def __init__(self, module: str, qualname: str, drop_first: bool, root: str | None, skip: str | None = None):
        self.module, self.qualname, self.drop_first, self.root, self.skip = module, qualname, drop_first, root, skip


class Recorder:
    """Collects calls in memory; ``save()`` merges them into ``.veyra-snap/``."""

    def __init__(self, project: str | os.PathLike[str] = ".", limit: int = _store.DEFAULT_LIMIT,
                 include: list[str] | None = None, exclude: list[str] | None = None):
        self.project = Path(project).resolve()
        self.limit = limit
        self.include = [Path(p).resolve() for p in (include or [self.project])]
        self.exclude = list(exclude or [])
        self.modules: dict[str, dict[str, Any]] = {}
        self.outcomes: dict[tuple[str, str], dict[str, str]] = {}
        self.calls = 0
        self.skipped: dict[str, Counter[str]] = {}
        self._lock = threading.Lock()
        self._scope: dict[str, bool] = {}
        self._targets: dict[Any, Target] = {}
        self._main_ok: bool | None = None
        self.saved: dict[str, int] = {}

    # ------------------------------------------------------------------ what to record

    def in_scope(self, filename: str) -> bool:
        cached = self._scope.get(filename)
        if cached is not None:
            return cached
        ok = False
        if filename and not filename.startswith("<"):
            path = Path(filename).resolve()
            name = path.name
            root = next((r for r in self.include if r in path.parents), None)
            # Only folders inside the project count: a project kept under C:\work\test\ is still recorded.
            inside = path.relative_to(root).parts[:-1] if root else ()
            ok = (root is not None
                  and HERE not in path.parents
                  and not any(part in SKIP_DIRS for part in inside)
                  and not (name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"))
        self._scope[filename] = ok
        return ok

    def _excluded(self, module: str, qualname: str) -> bool:
        full = f"{module}.{qualname}"
        return any(fnmatch.fnmatchcase(full, p) or fnmatch.fnmatchcase(module, p) for p in self.exclude)

    def target_for_code(self, code: Any, f_globals: dict[str, Any]) -> Target | None:
        """Where a code object lives, if a test can import and call it; None for code we never record."""
        if code in self._targets:
            return self._targets[code]
        target = None
        qualname = getattr(code, "co_qualname", None) or _guess_qualname(code, f_globals)
        # CO_OPTIMIZED: real functions only, not a module or a class body running its definitions
        if not (not code.co_flags & 0x01 or code.co_flags & CO_NOT_PLAIN or code.co_name.startswith("<") or "<locals>" in qualname
                or (code.co_name.startswith("__") and code.co_name.endswith("__"))):
            module = f_globals.get("__name__") or ""
            target = self._resolve(module, qualname, code, f_globals.get("__file__"))
        self._targets[code] = target
        return target

    def target_for_function(self, fn: Callable[..., Any]) -> Target | None:
        code = getattr(fn, "__code__", None)
        if code is None:
            return None
        if code in self._targets:
            return self._targets[code]
        target = self._resolve(fn.__module__, fn.__qualname__, code, getattr(sys.modules.get(fn.__module__), "__file__", None))
        self._targets[code] = target
        return target

    def _resolve(self, module: str, qualname: str, code: Any, file: str | None) -> Target | None:
        if not module or "<" in qualname:
            return None
        import_as = module
        if module == "__main__":
            # A script's functions are importable by file name, if importing it doesn't run the program.
            if not file or not self._main_guarded(file):
                return Target(module, qualname, False, None, "it's in a script without `if __name__ == \"__main__\":`")
            path = Path(file).resolve()
            try:
                import_as = ".".join(path.relative_to(self.project).with_suffix("").parts)
            except ValueError:
                import_as = path.stem
        if self._excluded(import_as, qualname):
            return None
        found: Any = sys.modules.get(module)
        owner: Any = None
        for part in qualname.split("."):
            owner, found = found, getattr(found, part, None)
        drop_first = inspect.ismethod(found) and isinstance(getattr(found, "__self__", None), type)  # classmethod
        chain, seen = found, 0
        while chain is not None and seen < 20:  # the function may be wrapped by decorators
            if getattr(getattr(chain, "__func__", chain), "__code__", None) is code:
                return Target(import_as, qualname, drop_first, _import_root(import_as, file))
            chain, seen = getattr(chain, "__wrapped__", None), seen + 1
        return Target(import_as, qualname, False, None, "a test can't import it by name")

    def _main_guarded(self, file: str) -> bool:
        if self._main_ok is None:
            try:
                text = Path(file).read_text(encoding="utf-8", errors="replace")
            except OSError:
                text = ""
            self._main_ok = "__name__" in text and "__main__" in text
        return self._main_ok

    # ------------------------------------------------------------------ recording

    def full(self, target: Target) -> bool:
        return len(self.outcomes.get((target.module, target.qualname), ())) >= self.limit

    def skip(self, target: Target, reason: str) -> None:
        with self._lock:
            self.skipped.setdefault(f"{target.module}.{target.qualname}", Counter())[reason] += 1

    def begin(self, target: Target, args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any] | None:
        """Encodes the arguments before the call (the function may change them). None when it can't be."""
        if target.skip:
            self.skip(target, target.skip)
            return None
        if len(self.outcomes.get((target.module, target.qualname), ())) >= self.limit:
            return None  # it has enough cases; skip the encoding cost on hot functions
        if target.drop_first:
            args = args[1:]
        with _quiet():
            try:
                a, ai = encode(tuple(args))
                k, ki = encode(dict(kwargs))
            except Unsupported as why:
                self.skip(target, f"an argument: {why}")
                return None
        return {"args": a, "kwargs": k, "imports": set(ai) | set(ki)}

    def returned(self, target: Target, call: dict[str, Any], value: Any) -> None:
        with _quiet():
            try:
                source, imports = encode(value)
            except Unsupported as why:
                self.skip(target, f"the result: {why}")
                return
        call["returns"] = source
        call["imports"] |= imports
        self._add(target, call)

    def raised(self, target: Target, call: dict[str, Any], error: BaseException) -> None:
        if not isinstance(error, Exception):
            return  # KeyboardInterrupt, SystemExit, ...
        with _quiet():
            try:
                line, path = _ref(type(error))
                message = str(error)
            except Exception as why:
                self.skip(target, f"the error: {why}")
                return
        call["raises"] = {"type": path, "import": line, "message": message}
        self._add(target, call)

    def _add(self, target: Target, call: dict[str, Any]) -> None:
        case = {"args": call["args"], "kwargs": call["kwargs"]}
        if "raises" in call:
            case["raises"] = call["raises"]
        else:
            case["returns"] = call["returns"]
        case["imports"] = sorted(i for i in call["imports"] if i)
        key = (target.module, target.qualname)
        with self._lock:
            self.calls += 1
            seen = self.outcomes.setdefault(key, {})
            module = self.modules.setdefault(target.module, {"module": target.module, "root": None, "functions": {}})
            if target.root and module["root"] is None:
                module["root"] = target.root
            fn = module["functions"].setdefault(target.qualname, {"nondeterministic": False, "cases": []})
            ck, oc = _store.case_key(case), _store.outcome(case)
            if ck in seen:
                if seen[ck] != oc:
                    fn["nondeterministic"] = True
                return
            if len(seen) >= self.limit:
                return
            seen[ck] = oc
            fn["cases"].append(case)

    # ------------------------------------------------------------------ saving

    def save(self) -> dict[str, int]:
        """Merges what was recorded into ``.veyra-snap/``. Returns new cases per module."""
        recorded = {}
        for name, data in self.modules.items():
            root = data["root"]
            rel = os.path.relpath(root, self.project) if root else ""
            recorded[name] = {"module": name, "root": "" if rel == "." else rel.replace(os.sep, "/"), "functions": data["functions"]}
        return _store.merge(_store.store_dir(self.project), recorded, self.limit)


# ---------------------------------------------------------------------- automatic recording

def _frame_call(code: Any, f_locals: dict[str, Any]) -> tuple[tuple[Any, ...], dict[str, Any]]:
    names = code.co_varnames
    n, k = code.co_argcount, code.co_kwonlyargcount
    args = [f_locals[x] for x in names[:n]]
    kwargs = {x: f_locals[x] for x in names[n:n + k]}
    i = n + k
    if code.co_flags & CO_VARARGS:
        args.extend(f_locals[names[i]])
        i += 1
    if code.co_flags & CO_VARKEYWORDS:
        kwargs.update(f_locals[names[i]])
    return tuple(args), kwargs


class _Monitor:
    """Python 3.12+: ``sys.monitoring``, which costs almost nothing for code outside your project."""

    def __init__(self, recorder: Recorder):
        self.r = recorder
        mon = sys.monitoring  # type: ignore[attr-defined]
        self.tool = next((i for i in (5, 4, 3, 2) if mon.get_tool(i) is None), None)
        if self.tool is None:
            raise RuntimeError("every sys.monitoring slot is taken (by a debugger or coverage tool?)")
        self.mon = mon

    def start(self) -> None:
        mon, ev = self.mon, self.mon.events
        mon.use_tool_id(self.tool, "veyra-snap")
        mon.restart_events()
        mon.register_callback(self.tool, ev.PY_START, self.on_start)
        mon.register_callback(self.tool, ev.PY_RETURN, self.on_return)
        mon.register_callback(self.tool, ev.PY_UNWIND, self.on_unwind)
        mon.set_events(self.tool, ev.PY_START | ev.PY_RETURN | ev.PY_UNWIND)

    def stop(self) -> None:
        mon, ev = self.mon, self.mon.events
        mon.set_events(self.tool, 0)
        for event in (ev.PY_START, ev.PY_RETURN, ev.PY_UNWIND):
            mon.register_callback(self.tool, event, None)
        mon.free_tool_id(self.tool)

    def _target(self, code: Any) -> Target | None:
        if not self.r.in_scope(code.co_filename):
            return None
        frame = sys._getframe(2)
        return self.r.target_for_code(code, frame.f_globals)

    def on_start(self, code: Any, offset: int) -> Any:
        if _busy():
            return None
        target = self._target(code)
        if target is None or self.r.full(target):
            return self.mon.DISABLE  # never watched again: no cost for libraries, or for functions with enough cases
        frame = sys._getframe(1)
        try:
            args, kwargs = _frame_call(code, frame.f_locals)
        except Exception:
            call = None
        else:
            call = self.r.begin(target, args, kwargs)
        _stack().append((id(frame), target, call))
        return None

    def _pop(self, code: Any) -> tuple[Target, dict[str, Any] | None] | None:
        """The entry for the frame that's ending. Entries above it (frames whose end we didn't see) are dropped."""
        stack = _stack()
        frame_id = id(sys._getframe(2))
        for i in range(len(stack) - 1, -1, -1):
            if stack[i][0] == frame_id:
                _, target, call = stack[i]
                del stack[i:]
                return target, call
        return None

    def on_return(self, code: Any, offset: int, value: Any) -> Any:
        if _busy():
            return None
        if not self.r.in_scope(code.co_filename) or self._targets_none(code):
            return self.mon.DISABLE
        popped = self._pop(code)
        if popped is None:
            target = self.r._targets.get(code)
            return self.mon.DISABLE if target is not None and self.r.full(target) else None
        if popped[1] is not None:
            self.r.returned(popped[0], popped[1], value)
        return None

    def on_unwind(self, code: Any, offset: int, error: BaseException) -> None:
        if _busy() or not self.r.in_scope(code.co_filename) or self._targets_none(code):
            return
        popped = self._pop(code)
        if popped and popped[1] is not None:
            self.r.raised(popped[0], popped[1], error)

    def _targets_none(self, code: Any) -> bool:
        return code in self.r._targets and self.r._targets[code] is None


class _Tracer:
    """Python 3.9-3.11: ``sys.settrace``, on your project's functions only. Errors are recorded with ``@snap``."""

    def __init__(self, recorder: Recorder):
        self.r = recorder
        self.previous: Any = None

    def start(self) -> None:
        self.previous = sys.gettrace()
        sys.settrace(self.on_call)
        threading.settrace(self.on_call)

    def stop(self) -> None:
        sys.settrace(self.previous)
        threading.settrace(self.previous)  # type: ignore[arg-type]

    def on_call(self, frame: Any, event: str, arg: Any) -> Any:
        if event != "call" or _busy() or not self.r.in_scope(frame.f_code.co_filename):
            return None
        target = self.r.target_for_code(frame.f_code, frame.f_globals)
        if target is None:
            return None
        try:
            args, kwargs = _frame_call(frame.f_code, frame.f_locals)
        except Exception:
            return None
        call = self.r.begin(target, args, kwargs)
        if call is None:
            return None
        frame.f_trace_lines = False
        state = {"error": False}

        def local(frame: Any, event: str, arg: Any) -> Any:
            if event == "exception":
                state["error"] = True
            elif event == "return" and not _busy():
                if arg is None and state["error"]:
                    return None  # returned None or raised: can't tell apart here, so leave it out
                self.r.returned(target, call, arg)
            return local

        return local


# ---------------------------------------------------------------------- public API

_active: Recorder | None = None
_env_recorder: Recorder | None = None


def active() -> Recorder | None:
    """The recorder @snap should use: inside recording(), or with VEYRA_SNAP=1 set."""
    global _env_recorder
    if _active is not None:
        return _active
    if os.environ.get("VEYRA_SNAP", "").strip().lower() in ("1", "true", "yes", "on"):
        if _env_recorder is None:
            _env_recorder = Recorder(os.environ.get("VEYRA_SNAP_PROJECT", "."))
            atexit.register(_env_recorder.save)
        return _env_recorder
    return None


@contextlib.contextmanager
def recording(*, include: list[str] | None = None, exclude: list[str] | None = None,
              limit: int = _store.DEFAULT_LIMIT, project: str = ".", auto: bool = True) -> Iterator[Recorder]:
    """Record calls made inside the block, and save them to ``.veyra-snap/`` when it ends.

    ``include``: folders to watch (default: the project). ``exclude``: module or ``module.function`` patterns to
    skip, like ``"shop.db*"``. ``auto=False`` records only functions marked with ``@snap``.
    """
    global _active
    if _active is not None:
        raise RuntimeError("veyra-snap is already recording")
    recorder = Recorder(project, limit, include, exclude)
    watcher: Any = None
    if auto:
        watcher = _Monitor(recorder) if hasattr(sys, "monitoring") else _Tracer(recorder)
    _active = recorder
    if watcher:
        watcher.start()
    try:
        yield recorder
    finally:
        if watcher:
            watcher.stop()
        _active = None
        recorder.saved = recorder.save()


def snap(fn: F | None = None) -> Any:
    """Mark a function to record. Free when not recording: it just calls the function."""

    def decorate(f: F) -> F:
        if inspect.isgeneratorfunction(f) or inspect.iscoroutinefunction(f) or inspect.isasyncgenfunction(f):
            return f  # generators and coroutines can't be snapshotted as a single return value

        @functools.wraps(f)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            recorder = active()
            if recorder is None or _busy():
                return f(*args, **kwargs)
            target = recorder.target_for_function(f)
            call = recorder.begin(target, args, kwargs) if target is not None else None
            if call is None:
                return f(*args, **kwargs)
            try:
                result = f(*args, **kwargs)  # automatic recording may see it too: same case, stored once
            except BaseException as error:
                recorder.raised(target, call, error)
                raise
            recorder.returned(target, call, result)
            return result

        wrapper.__veyra_snap__ = True  # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]

    return decorate(fn) if fn is not None else decorate
