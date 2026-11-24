"""dx.scan() on a dataset with known problems and patterns: it must find every one, and not invent others."""

import json

import numpy as np
import pandas as pd

import dxray as dx


def codes(report, column=None):
    return {i.code for i in report.issues if column is None or i.column == column}


def titles(report, kind=None):
    return [i.title for i in report.insights if kind is None or i.kind == kind]


def test_finds_every_planted_problem(orders):
    r = dx.scan(orders)
    assert "numbers-as-text" in codes(r, "price")
    assert "missing-as-text" in codes(r, "price")
    assert "inconsistent-categories" in codes(r, "region")
    assert "whitespace" in codes(r, "region")
    assert "duplicate-rows" in codes(r)
    assert "duplicate-ids" in codes(r, "order_id")
    assert "dates-as-text" in codes(r, "order_date")
    assert "dates-as-text" in codes(r, "signup_date")
    assert "outliers" in codes(r, "quantity")
    assert "constant-column" in codes(r, "channel")
    assert "missing" in codes(r, "ad_spend")
    dup = next(i for i in r.issues if i.code == "duplicate-rows")
    assert dup.count == 40


def test_no_false_alarms_on_naturally_lopsided_money(orders):
    r = dx.scan(orders)
    assert "outliers" not in codes(r, "revenue"), "big orders are normal for revenue, not errors"
    assert "outliers" not in codes(r, "price")


def test_finds_the_planted_patterns(orders):
    r = dx.scan(orders, target="revenue")
    t = " ".join(titles(r))
    assert "What drives 'revenue'" in t and "'ad_spend'" in t
    assert any("'tier'" in x and "Premium" in x for x in titles(r))
    assert any("rose" in x and "'revenue'" in x for x in titles(r, "trend")), "revenue grows through the year"
    assert any("dropped" in x and "2026-03" in x for x in titles(r, "change")), "the March slump"
    assert any("top 20% of 'customer'" in x for x in titles(r, "concentration")), "the 80/20 customers"


def test_churn_is_driven_by_support_tickets(orders):
    r = dx.scan(orders, target="churned")
    drivers = [i for i in r.insights if i.kind == "driver"]
    assert drivers and "'support_tickets'" in drivers[0].title


def test_trends_use_the_order_date_not_signups(orders):
    r = dx.scan(orders)
    for i in r.insights:
        if i.kind in ("trend", "change"):
            assert i.columns[0] == "order_date"


def test_typos_do_not_fake_trends_or_8020(orders):
    r = dx.scan(orders)
    assert not any("'quantity'" in x for x in titles(r, "concentration"))
    assert not any("%" in x and int(x.split("%")[0].split()[-1].replace(",", "")) > 1000 for x in titles(r, "change"))


def test_insights_are_ranked_and_capped(orders):
    r = dx.scan(orders, target="revenue", insights=5)
    assert len(r.insights) == 5
    scores = [i.score for i in r.insights]
    assert scores == sorted(scores, reverse=True)


def test_columns_are_profiled(orders):
    r = dx.scan(orders)
    price = r.column("price")
    assert price.kind == "numeric" and price.note == "numbers stored as text"
    assert price.missing == 62  # 60 planted, and 2 more copied by the duplicate rows
    assert 10 < price.stats["median"] < 200
    assert r.column("tier").top[0][0] in ("Basic", "Plus", "Premium")
    assert r.column("order_date").chart["type"] == "line"


def test_health_score(orders):
    messy = dx.scan(orders).health
    clean_df, _ = dx.clean(orders)
    tidy = dx.scan(clean_df).health
    assert 0 <= messy < 70 < tidy <= 100


def test_outputs(orders, tmp_path):
    r = dx.scan(orders, target="revenue", name="orders")
    text = str(r)
    assert "orders" in text and "What stands out" in text and "Data problems" in text
    page = r.to_html(tmp_path / "r.html")
    assert page.startswith("<!doctype html>") and "<svg" in page and "orders" in page
    assert (tmp_path / "r.html").read_text(encoding="utf-8") == page
    assert "<style>" in r._repr_html_() and "<html" not in r._repr_html_()
    md = r.to_markdown()
    assert md.startswith("# orders") and "| Column | Type |" in md
    data = json.loads(r.to_json())
    assert data["rows"] == len(orders) and data["health"] == r.health and data["insights"]
    assert "dxray.Report" in repr(r)


def test_scan_reads_files(orders, tmp_path):
    p = tmp_path / "orders.csv"
    orders.to_csv(p, index=False)
    r = dx.scan(str(p))
    assert r.name == "orders.csv" and r.rows == len(orders)
    pq = tmp_path / "orders.parquet"
    orders.to_parquet(pq)
    assert dx.scan(pq).rows == len(orders)


def test_unknown_target():
    import pytest
    with pytest.raises(KeyError, match="No column named"):
        dx.scan(pd.DataFrame({"a": [1, 2, 3]}), target="b")


def test_edge_cases():
    assert dx.scan(pd.DataFrame()).rows == 0
    assert "empty-table" in {i.code for i in dx.scan(pd.DataFrame({"a": []})).issues}
    one = dx.scan(pd.DataFrame({"x": [1, 2, 3, 4, 5]}))
    assert one.columns[0].kind == "numeric"
    weird = dx.scan(pd.DataFrame({0: [1, 2, 3], "名前": ["a", "b", "a"], "x y": [None, None, None]}))
    assert [c.name for c in weird.columns] == ["0", "名前", "x y"]
    assert dx.scan(pd.Series([1, 2, 3, 4], name="s")).columns[0].name == "s"
    assert dx.scan({"a": [1, 2, 3], "b": ["x", "y", "x"]}).rows == 3
    inf = dx.scan(pd.DataFrame({"v": [1.0, np.inf, 3.0, -np.inf, 5.0] * 10}))
    json.loads(inf.to_json())


def test_large_tables_are_fast():
    import time
    r = np.random.default_rng(0)
    n = 500_000
    df = pd.DataFrame({"a": r.normal(size=n), "b": r.normal(size=n), "g": r.choice(list("ABCDE"), n),
                       "d": pd.date_range("2025-01-01", periods=n, freq="min"), "amount": r.exponential(50, n)})
    t = time.time()
    rep = dx.scan(df)
    assert time.time() - t < 30
    assert rep.rows == n
