"""dx.clean(), dx.for_llm(), dx.ask() (with a fake Claude client) and the dxray command."""

import importlib.util
import json
import subprocess
import sys
from types import SimpleNamespace

import pandas as pd
import pytest

import dxray as dx
from dxray.cli import main

# The Anthropic SDK needs Python 3.10+, so on 3.9 these are skipped (and test_ask_without_the_sdk covers that case).
needs_sdk = pytest.mark.skipif(importlib.util.find_spec("anthropic") is None, reason="the Anthropic SDK isn't installed")


# ------------------------------------------------------------------ clean

def test_clean_fixes_the_safe_problems(orders):
    out, log = dx.clean(orders)
    assert len(out) == len(orders) - 40
    assert pd.api.types.is_numeric_dtype(out["price"]) and out["price"].notna().sum() > 3800
    assert pd.api.types.is_datetime64_any_dtype(out["order_date"])
    assert set(out["region"].dropna().unique()) == {"North", "South", "East", "West"}
    text = str(log)
    assert "Dropped 40 duplicate rows" in text and "'price'" in text and "merged different spellings" in text
    assert "trimmed spaces from 62" not in text, "missing values are not 'trimmed'"


def test_clean_never_drops_outliers_or_fills_gaps(orders):
    out, _ = dx.clean(orders)
    assert (out["quantity"] == 9999).sum() == 8
    assert out["ad_spend"].isna().sum() > 0


def test_clean_leaves_the_original_alone(orders):
    before = orders.copy()
    dx.clean(orders)
    pd.testing.assert_frame_equal(orders, before)


def test_clean_on_clean_data_changes_nothing():
    df = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    out, log = dx.clean(df)
    pd.testing.assert_frame_equal(out, df)
    assert "Nothing needed fixing" in str(log)


def test_clean_drops_empty_columns():
    out, log = dx.clean(pd.DataFrame({"a": [1, 2], "gone": [None, None], "na": ["N/A", "-"]}))
    assert list(out.columns) == ["a"] and "empty column" in str(log)


# ------------------------------------------------------------------ for_llm

def test_for_llm_is_compact_and_complete(orders):
    text = dx.for_llm(orders, target="revenue")
    assert text.startswith("# Dataset:")
    for part in ("## Columns", "price | numeric (numbers stored as text)", "sample rows", "## Data problems", "## Findings"):
        assert part in text
    assert len(text) < 12000
    assert len(dx.for_llm(orders, max_chars=2000)) <= 2000


# ------------------------------------------------------------------ ask (fake client: no network, no cost)

class FakeStream:
    def __init__(self, message):
        self.message = message
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False
    def get_final_message(self):
        return self.message


class FakeClient:
    def __init__(self, text="Revenue grew 122% over the year.", stop="end_turn"):
        self.calls = []
        msg = SimpleNamespace(content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
                              stop_reason=stop, model="claude-opus-5-5",
                              usage=SimpleNamespace(input_tokens=1200, output_tokens=40, cache_read_input_tokens=1100))
        beta_messages = SimpleNamespace(stream=lambda **kw: (self.calls.append(kw), FakeStream(msg))[1])
        self.beta = SimpleNamespace(messages=beta_messages)


@needs_sdk
def test_ask_sends_the_description_and_returns_the_answer(orders):
    client = FakeClient()
    answer = dx.ask(orders, "How did revenue change?", target="revenue", client=client)
    assert str(answer) == "Revenue grew 122% over the year." and answer.cached_tokens == 1100
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["messages"] == [{"role": "user", "content": "How did revenue change?"}]
    system = call["system"][0]
    assert system["cache_control"] == {"type": "ephemeral"} and "## Columns" in system["text"] and "revenue" in system["text"]
    assert call["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in call["betas"]
    assert call["output_config"] == {"effort": "medium"}


@needs_sdk
def test_ask_refusal_and_bad_question(orders):
    with pytest.raises(dx.AskError, match="declined"):
        dx.ask(orders, "something", client=FakeClient(stop="refusal"))
    with pytest.raises(ValueError):
        dx.ask(orders, "   ", client=FakeClient())


@needs_sdk
def test_ask_without_a_key_explains(orders, monkeypatch):
    for v in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(v, raising=False)
    monkeypatch.setenv("ANTHROPIC_CONFIG_DIR", "/nonexistent-dxray-test")
    monkeypatch.setenv("HOME", "/nonexistent-dxray-test")
    monkeypatch.setenv("USERPROFILE", "/nonexistent-dxray-test")
    with pytest.raises(dx.AskError):
        dx.ask(pd.DataFrame({"a": [1, 2, 3]}), "anything?")


# ------------------------------------------------------------------ the dxray command

def test_cli(orders, tmp_path, capsys):
    p = tmp_path / "orders.csv"
    orders.to_csv(p, index=False)
    assert main([str(p), "--target", "revenue", "--html", str(tmp_path / "r.html"), "--clean", str(tmp_path / "clean.csv")]) == 0
    out, err = capsys.readouterr()
    assert "What stands out" in out and "Report written" in err and "duplicate rows" in err
    assert (tmp_path / "r.html").exists() and len(pd.read_csv(tmp_path / "clean.csv")) == len(orders) - 40
    assert main([str(p), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["rows"] == len(orders)
    assert main([str(p), "--llm"]) == 0 and capsys.readouterr().out.startswith("# Dataset:")
    assert main([str(tmp_path / "missing.csv")]) == 2
    assert main([str(p), "--target", "nope"]) == 2


def test_module_entry_point(orders, tmp_path):
    p = tmp_path / "o.csv"
    orders.head(200).to_csv(p, index=False)
    r = subprocess.run([sys.executable, "-m", "dxray", str(p), "--markdown"], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0 and r.stdout.startswith("# o.csv")


def test_ask_without_the_sdk(monkeypatch):
    """No Anthropic SDK (not installed, or Python 3.9): a clear message, not a crash."""
    monkeypatch.setitem(sys.modules, "anthropic", None)  # makes `import anthropic` fail
    with pytest.raises(dx.AskError) as caught:
        dx.ask(pd.DataFrame({"a": [1, 2, 3]}), "anything?")
    message = str(caught.value)
    if sys.version_info < (3, 10):
        assert "Python 3.10" in message
    else:
        assert 'pip install "dxray[ai]"' in message
    monkeypatch.setattr(sys, "version_info", (3, 9, 18))
    with pytest.raises(dx.AskError, match="Python 3.10"):
        dx.ask(pd.DataFrame({"a": [1, 2, 3]}), "anything?")
