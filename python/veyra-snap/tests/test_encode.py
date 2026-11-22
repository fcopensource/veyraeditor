import datetime
import decimal
import fractions
import io
import uuid

import pytest

from veyra_snap import Unsupported, encode
from veyra_snap._encode import same

from .helpers import Colour, Point, Pair, Locked


ROUND_TRIPS = [
    None, True, False, 0, -7, 10**30, 1.5, -0.0, float("inf"), float("-inf"), 3 + 4j, "", "naïve ✓ \n'\"", b"\x00\xff",
    [], [1, [2, [3]]], (), (1,), (1, "a", None), {}, {"a": 1, "b": [1, 2]}, {1: "x", (2, 3): {4}},
    set(), {3, 1, 2}, frozenset(), frozenset({"b", "a"}),
    decimal.Decimal("12.50"), decimal.Decimal("-0.001"), fractions.Fraction(1, 3),
    datetime.date(2026, 11, 22), datetime.datetime(2026, 11, 22, 9, 30, 1, 5),
    datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc), datetime.time(23, 59), datetime.timedelta(days=2, seconds=3),
    uuid.UUID("12345678-1234-5678-1234-567812345678"),
    Colour.RED, Point(1, 2.5), [Point(0, 0), Point(-1, 3)], Pair(left="a", right=Colour.BLUE),
]


@pytest.mark.parametrize("value", ROUND_TRIPS, ids=repr)
def test_round_trips(value):
    source, imports = encode(value)
    namespace = {}
    for line in imports:
        exec(line, namespace)
    assert same(eval(source, namespace), value)


def test_types_stay_apart():
    assert not same(1, 1.0) and not same(1, True) and not same([1], (1,))
    assert encode(1)[0] == "1" and encode(1.0)[0] == "1.0" and encode(True)[0] == "True"


def test_sets_are_written_in_a_stable_order():
    assert encode({"b", "c", "a"})[0] == "{'a', 'b', 'c'}"


def test_imports_are_reported():
    assert encode(decimal.Decimal("1"))[1] == {"import decimal"}
    assert encode(Point(1, 2))[1] == {"import tests.helpers"}


@pytest.mark.parametrize("value, why", [
    (float("nan"), "NaN"),
    (io.StringIO(), "StringIO"),
    (object(), "object"),
    (lambda: 1, "function"),
    (Locked(1), "constructor"),
    ("x" * 5000, "too large"),
])
def test_unsupported(value, why):
    with pytest.raises(Unsupported, match=why):
        encode(value)


def test_self_reference_is_refused():
    loop = []
    loop.append(loop)
    with pytest.raises(Unsupported):
        encode(loop)
