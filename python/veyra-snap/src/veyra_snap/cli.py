"""The ``veyra-snap`` command.

    veyra-snap run app.py [args]       run your program and record its function calls
    veyra-snap run -m mypkg [args]     the same, for ``python -m mypkg``
    veyra-snap write                   turn the recordings into pytest files in tests/
    veyra-snap show                    what's been recorded so far
    veyra-snap clear                   forget all recordings
"""

from __future__ import annotations

import argparse
import os
import runpy
import sys
import traceback
from pathlib import Path

from . import __version__, _store
from ._record import recording
from ._write import write

# ---------------------------------------------------------------------- output


def _colour() -> bool:
    if os.environ.get("NO_COLOR") or not sys.stderr.isatty():
        return False
    if os.name == "nt":
        os.system("")  # turns on ANSI colours in the Windows console
    return True


C = _colour()


def _symbols() -> bool:
    try:
        "◆✓→".encode(sys.stderr.encoding or "ascii")
        return True
    except (UnicodeEncodeError, LookupError):
        return False


U = _symbols()
DIAMOND, TICK, ARROW = ("◆", "✓", "→") if U else ("*", "+", "->")


def paint(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if C else text


def bold(t: str) -> str: return paint(t, "1")
def dim(t: str) -> str: return paint(t, "2")
def green(t: str) -> str: return paint(t, "32")
def yellow(t: str) -> str: return paint(t, "33")
def cyan(t: str) -> str: return paint(t, "36")
def mint(t: str) -> str: return paint(t, "38;5;86")


BRAND = mint(f"{DIAMOND} veyra-snap")


def say(text: str = "") -> None:
    print(text, file=sys.stderr)


# ---------------------------------------------------------------------- commands


def cmd_run(ns: argparse.Namespace) -> int:
    if not ns.module and not ns.target:
        say("Tell me what to run: veyra-snap run app.py   or   veyra-snap run -m mypackage")
        return 2
    argv = ns.target
    project = Path(ns.project).resolve()
    if str(project) not in sys.path:
        sys.path.insert(0, str(project))
    exit_code = 0
    with recording(include=ns.include or None, exclude=ns.exclude, limit=ns.limit, project=str(project)) as rec:
        old_argv = sys.argv[:]
        try:
            if ns.module:
                sys.argv = [ns.module, *argv]
                runpy.run_module(ns.module, run_name="__main__", alter_sys=True)
            else:
                script = Path(argv[0]).resolve()
                sys.argv = [str(script), *argv[1:]]
                sys.path.insert(0, str(script.parent))
                runpy.run_path(str(script), run_name="__main__")
        except SystemExit as stop:
            exit_code = stop.code if isinstance(stop.code, int) else (0 if stop.code is None else 1)
        except BaseException:
            traceback.print_exc()
            exit_code = 1
        finally:
            sys.argv = old_argv
    report_run(rec)
    if ns.write:
        say()
        report_write(write(project, ns.out))
    else:
        say(f"\n{dim('Next:')} {bold('veyra-snap write')} {dim('turns these into pytest tests in tests/')}")
    return exit_code


def report_run(rec: object) -> None:
    from ._record import Recorder
    assert isinstance(rec, Recorder)
    functions = sum(len(m["functions"]) for m in rec.modules.values())
    new = sum(rec.saved.values())
    say(f"\n{BRAND}  recorded {bold(str(rec.calls))} call{'s' * (rec.calls != 1)} "
        f"in {bold(str(functions))} function{'s' * (functions != 1)}, {green(str(new) + ' new case' + 's' * (new != 1))}")
    rows = []
    for module, data in sorted(rec.modules.items()):
        for qualname, fn in sorted(data["functions"].items()):
            raises = sum(1 for c in fn["cases"] if "raises" in c)
            note = yellow("  changes between calls: no tests") if fn["nondeterministic"] else (
                dim(f"  ({raises} raise{'s' * (raises != 1)})") if raises else "")
            rows.append((f"{module}.{qualname}", f"{len(fn['cases'])} case{'s' * (len(fn['cases']) != 1)}", note))
    width = max((len(r[0]) for r in rows), default=0)
    for name, count, note in rows:
        say(f"  {name.ljust(width)}  {cyan(count)}{note}")
    for name, reasons in sorted(rec.skipped.items()):
        why, n = reasons.most_common(1)[0]
        total = sum(reasons.values())
        say(yellow(f"  ! {name}: {total} call{'s' * (total != 1)} left out") + dim(f" ({why})"))


def report_write(results: list) -> None:
    total_tests = sum(r.tests for r in results if not r.kept)
    total_cases = sum(r.cases for r in results if not r.kept)
    if not results:
        say(f"{BRAND}  nothing recorded yet. Start with: {bold('veyra-snap run app.py')}")
        return
    for r in results:
        rel = os.path.relpath(r.path)
        if r.kept:
            say(yellow(f"  ! {rel} exists and wasn't written by veyra-snap, so it was left alone") + dim(" (--force replaces it)"))
        elif r.tests:
            say(f"  {green(TICK)} {rel}  {cyan(str(r.cases) + ' case' + 's' * (r.cases != 1))} {dim('in ' + str(r.tests) + ' test' + 's' * (r.tests != 1))}")
        for s in r.skipped:
            say(yellow(f"  ! {s}") + dim(": no tests"))
    say(f"{BRAND}  wrote {bold(str(total_cases))} test case{'s' * (total_cases != 1)}. Run them: {bold('pytest')}")


def cmd_write(ns: argparse.Namespace) -> int:
    report_write(write(ns.project, ns.out, ns.force, ns.only or None))
    return 0


def cmd_show(ns: argparse.Namespace) -> int:
    modules = _store.load(_store.store_dir(ns.project))
    if not modules:
        say(f"{BRAND}  nothing recorded yet. Start with: {bold('veyra-snap run app.py')}")
        return 0
    say(f"{BRAND}  recordings in {_store.STORE_DIR}/")
    for module, data in sorted(modules.items()):
        say(bold(module))
        for qualname, fn in sorted(data["functions"].items()):
            flag = yellow(" changes between calls") if fn.get("nondeterministic") else ""
            say(f"  {qualname}  {cyan(str(len(fn['cases'])))}{flag}")
            if ns.cases:
                for c in fn["cases"]:
                    end = f"raises {c['raises']['type']}({c['raises']['message']!r})" if "raises" in c else f"{ARROW} {c['returns']}"
                    args = c["args"][1:-1].rstrip(",")
                    say(dim(f"    {qualname.rsplit('.', 1)[-1]}({args}{', **' + c['kwargs'] if c['kwargs'] != '{}' else ''}) {end}"))
    return 0


def cmd_clear(ns: argparse.Namespace) -> int:
    n = _store.clear(_store.store_dir(ns.project))
    say(f"{BRAND}  forgot {n} recorded module{'s' * (n != 1)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="veyra-snap",
        description="Run your code; get pytest tests. veyra-snap records what your functions are given and what "
                    "they return or raise, and writes it as regression tests.")
    parser.add_argument("--version", action="version", version=f"veyra-snap {__version__}")
    parser.add_argument("--project", default=".", help="the project folder (default: here)")
    sub = parser.add_subparsers(dest="command", metavar="command")

    run = sub.add_parser("run", help="run a script or module and record calls",
                         description="Run a script or module and record calls to functions in your project.")
    run.add_argument("-m", dest="module", metavar="MODULE", help="run a module, like python -m")
    run.add_argument("-i", "--include", action="append", metavar="DIR",
                     help="only record code in this folder (repeatable; default: the project)")
    run.add_argument("-x", "--exclude", action="append", default=[], metavar="PATTERN",
                     help="skip modules or functions matching this, like 'shop.db*' (repeatable)")
    run.add_argument("--limit", type=int, default=_store.DEFAULT_LIMIT, help="cases kept per function (default 25)")
    run.add_argument("--write", action="store_true", help="write the tests straight away")
    run.add_argument("--out", default="tests", help="folder for the tests (default: tests)")
    run.add_argument("target", nargs=argparse.REMAINDER, help="script.py and its arguments")
    run.set_defaults(func=cmd_run)

    w = sub.add_parser("write", help="write pytest files from the recordings")
    w.add_argument("--out", default="tests", help="folder for the tests (default: tests)")
    w.add_argument("--force", action="store_true", help="replace test files veyra-snap didn't write")
    w.add_argument("--only", action="append", metavar="MODULE", help="only these modules (repeatable)")
    w.set_defaults(func=cmd_write)

    s = sub.add_parser("show", help="list what's been recorded")
    s.add_argument("--cases", action="store_true", help="show every recorded call")
    s.set_defaults(func=cmd_show)

    c = sub.add_parser("clear", help="forget all recordings")
    c.set_defaults(func=cmd_clear)

    ns = parser.parse_args(argv)
    if not getattr(ns, "func", None):
        parser.print_help()
        return 0
    if ns.command == "run":
        ns.project = os.path.abspath(ns.project)
    return int(ns.func(ns) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
