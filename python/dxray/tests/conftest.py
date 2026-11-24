import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "examples"))
from make_orders import make  # noqa: E402


@pytest.fixture(scope="session")
def orders_raw():
    """A year of shop orders with planted problems and patterns, as it comes out of a CSV (strings, not dates)."""
    df = make()
    df["order_date"] = df["order_date"].dt.strftime("%Y-%m-%d")
    return df


@pytest.fixture
def orders(orders_raw):
    return orders_raw.copy()
