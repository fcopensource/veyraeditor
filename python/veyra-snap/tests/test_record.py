import sys

import pytest

from veyra_snap import recording, snap

AUTO_ERRORS = sys.version_info >= (3, 12)  # before 3.12, errors are recorded with @snap only

MATHS = """
    def add(a, b=0, *rest, scale=1, **extra):
        return (a + b + sum(rest)) * scale + len(extra)

    def ratio(a, b):
        if b == 0:
            raise ZeroDivisionError("b can't be zero")
        return a / b

    def shout(words):
        words.append("!")          # changes its argument: the test must use the value from before the call
        return " ".join(words).upper()

    def _helper(x):
        return x * 2

    def uses_helper(x):
        return _helper(x) + 1

    def counter():
        counter.n = getattr(counter, "n", 0) + 1
        return counter.n

    def gen():
        yield 1

    def nested():
        def inner():
            return 1
        return inner()

    class Box:
        def __init__(self, size):
            self.size = size

        @classmethod
        def make(cls, size):
            return size * 10

        @staticmethod
        def double(n):
            return n * 2
"""


def test_records_returns_with_every_kind_of_argument(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.add(1, 2, 3, 4, scale=2, flag=True)
        m.add(5)
    cases = project.cases("maths", "add")
    assert {(c["args"], c["kwargs"], c["returns"]) for c in cases} == {
        ("(1, 2, 3, 4)", "{'scale': 2, 'flag': True}", "21"),
        ("(5, 0)", "{'scale': 1}", "5"),
    }


def test_arguments_are_captured_before_the_call(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.shout(["hi", "there"])
    [case] = project.cases("maths", "shout")
    assert case["args"] == "(['hi', 'there'],)" and case["returns"] == "'HI THERE !'"


@pytest.mark.skipif(not AUTO_ERRORS, reason="automatic error recording needs Python 3.12+")
def test_records_errors(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.ratio(1, 4)
        with pytest.raises(ZeroDivisionError):
            m.ratio(1, 0)
    cases = {c["args"]: c for c in project.cases("maths", "ratio")}
    assert cases["(1, 4)"]["returns"] == "0.25"
    assert cases["(1, 0)"]["raises"] == {"type": "ZeroDivisionError", "import": "", "message": "b can't be zero"}


def test_private_helpers_and_callers_both_recorded_but_not_generators_or_nested(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.uses_helper(3)
        list(m.gen())
        m.nested()
    functions = project.stored("maths")["functions"]
    assert set(functions) == {"uses_helper", "_helper", "nested"}


def test_flaky_functions_are_marked(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.counter()
        m.counter()
    assert project.stored("maths")["functions"]["counter"]["nondeterministic"] is True


def test_class_and_static_methods(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.Box.make(3)
        m.Box.double(4)
        m.Box(2)
    functions = project.stored("maths")["functions"]
    assert functions["Box.make"]["cases"][0]["args"] == "(3,)"  # cls is dropped: tests call maths.Box.make(3)
    assert functions["Box.double"]["cases"][0]["returns"] == "8"
    assert "Box.__init__" not in functions


def test_limit_and_exclude(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording(limit=3, exclude=["maths.ratio"]):
        for i in range(10):
            m.add(i)
        m.ratio(4, 2)
    assert len(project.cases("maths", "add")) == 3
    assert "ratio" not in project.stored("maths")["functions"]


def test_libraries_and_tests_are_not_recorded(project):
    project.write("maths.py", MATHS)
    project.write("tests/test_maths.py", "def test_x():\n    return 1\n")
    project.write(".venv/lib/site-packages/lib.py", "def f():\n    return 1\n")
    m = project.load("maths")
    with recording():
        m.add(1)
        import json
        json.dumps({"a": 1})
    stored = sorted(p.name for p in (project.root / ".veyra-snap").glob("*.json"))
    assert stored == ["maths.json"]


def test_unsupported_values_are_skipped_with_a_reason(project):
    project.write("io_things.py", "def size(f):\n    return len(f.getvalue())\n")
    m = project.load("io_things")
    import io
    with recording() as rec:
        m.size(io.StringIO("abc"))
    assert "io_things.size" in rec.skipped
    assert "StringIO" in next(iter(rec.skipped["io_things.size"]))


def test_recordings_merge_across_runs(project):
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.add(1)
    with recording():
        m.add(1)
        m.add(2)
    assert len(project.cases("maths", "add")) == 2


def test_snap_decorator_records_only_when_recording(project, monkeypatch):
    project.write("marked.py", """
        from veyra_snap import snap

        @snap
        def area(w, h):
            if w < 0:
                raise ValueError("negative width")
            return w * h
    """)
    m = project.load("marked")
    monkeypatch.delenv("VEYRA_SNAP", raising=False)
    assert m.area(2, 3) == 6  # not recording: just calls it
    assert not (project.root / ".veyra-snap").exists()
    with recording(auto=False):
        m.area(2, 3)
        with pytest.raises(ValueError):
            m.area(-1, 3)
    cases = {c["args"]: c for c in project.cases("marked", "area")}
    assert cases["(2, 3)"]["returns"] == "6"
    assert cases["(-1, 3)"]["raises"]["message"] == "negative width"


def test_snap_leaves_generators_alone():
    @snap
    def g():
        yield 1
    assert list(g()) == [1]


def test_nested_recording_is_refused(project):
    with recording():
        with pytest.raises(RuntimeError):
            with recording():
                pass


def test_fallback_tracer_for_older_pythons(project, monkeypatch):
    """Python 3.9-3.11 record with sys.settrace; try that path on any version."""
    from veyra_snap import _record
    monkeypatch.setattr(_record, "_Monitor", _record._Tracer)
    project.write("maths.py", MATHS)
    m = project.load("maths")
    with recording():
        m.add(1, 2)
        m.shout(["a"])
        m.ratio(1, 4)
        with pytest.raises(ZeroDivisionError):
            m.ratio(1, 0)
        m.Box.make(2)
    functions = project.stored("maths")["functions"]
    assert functions["add"]["cases"][0]["returns"] == "3"
    assert functions["shout"]["cases"][0]["args"] == "(['a'],)"
    assert [c["args"] for c in functions["ratio"]["cases"]] == ["(1, 4)"]  # the raise is left out, not mis-recorded
    assert functions["Box.make"]["cases"][0]["returns"] == "20"
    assert sys.gettrace() is None  # the tracer is removed afterwards


def test_qualname_without_co_qualname(project):
    """Python 3.9 and 3.10 code objects have no co_qualname; methods must still be found."""
    from veyra_snap._record import _guess_qualname
    project.write("maths.py", MATHS)
    m = project.load("maths")
    g = vars(m)
    assert _guess_qualname(m.add.__code__, g) == "add"
    assert _guess_qualname(m.Box.make.__func__.__code__, g) == "Box.make"
    assert _guess_qualname(m.Box.double.__code__, g) == "Box.double"
