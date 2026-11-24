import numpy as np
import pandas as pd
import pytest

from dxray import infer
from dxray._infer import parse_number_text


@pytest.mark.parametrize("values, kind, note", [
    ([1.5, 2.0, 3.25, 4.0, 10.0], "numeric", ""),
    (["$1,200.50", "$45", "$3.99", "$12,000", "$7"], "numeric", "numbers stored as text"),
    (["12%", "45%", "3%", "99%", "50%"], "numeric", "numbers stored as text"),
    (["2026-01-03", "2026-02-14", "2025-12-31", "2026-03-01", "2026-04-20"], "datetime", "dates stored as text"),
    (["yes", "no", "yes", "yes", "no"], "boolean", "yes/no stored as text"),
    ([True, False, True, True, False], "boolean", ""),
    ([0, 1, 1, 0, 1, 0], "boolean", ""),
    (["a@x.com", "b@y.org", "c@z.io", "d@w.net", "e@v.co"], "email", ""),
    (["https://a.com", "https://b.com/x", "http://c.org", "https://d.io", "https://e.net"], "url", ""),
    (["red", "blue", "red", "green", "blue", "red", "red", "blue"], "categorical", ""),
    (["same", "same", "same"], "constant", ""),
    ([None, None, None], "empty", ""),
    (["N/A", "-", "null", None], "empty", ""),
])
def test_kinds(values, kind, note):
    k = infer(pd.Series(values, name="col"))
    assert k.kind == kind
    assert k.note == note


def test_ids_by_name_and_uniqueness():
    assert infer(pd.Series(range(100), name="user_id")).kind == "id"
    assert infer(pd.Series(range(100), name="score")).kind == "numeric"
    assert infer(pd.Series([f"ORD-{i:05d}" for i in range(500)], name="ref")).kind == "id"


def test_free_text():
    words = [f"Customer said thing number {i} about the product" for i in range(300)]
    assert infer(pd.Series(words, name="comment")).kind == "text"


def test_parse_number_text():
    s = pd.Series(["$1,200.50", "(45)", "12%", "€3", "abc", None])
    out = parse_number_text(s)
    assert out.iloc[0] == 1200.5 and out.iloc[1] == -45 and out.iloc[2] == 12 and out.iloc[3] == 3
    assert np.isnan(out.iloc[4]) and np.isnan(out.iloc[5])
