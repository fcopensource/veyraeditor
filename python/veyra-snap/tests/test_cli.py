"""End to end: run a real program under ``veyra-snap run``, write the tests, run them with pytest, and check they
catch a change in behaviour."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from veyra_snap import _store
from veyra_snap._write import HEADER
from veyra_snap.cli import main

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "shop"
AUTO_ERRORS = sys.version_info >= (3, 12)


def run(*args, cwd):
    env = {**os.environ, "NO_COLOR": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.run([sys.executable, "-m", "veyra_snap", *args], cwd=cwd, env=env,
                          capture_output=True, text=True, encoding="utf-8", timeout=120)


def pytest_in(folder):
    return subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"], cwd=folder,
                          capture_output=True, text=True, timeout=120)


@pytest.fixture
def shop(tmp_path):
    dest = tmp_path / "shop"
    shutil.copytree(EXAMPLE, dest, ignore=shutil.ignore_patterns(".veyra-snap", "tests", "__pycache__"))
    return dest


def test_record_write_and_catch_a_regression(shop):
    rec = run("run", "app.py", cwd=shop)
    assert rec.returncode == 0, rec.stderr
    assert "FC-00042-0001" in rec.stdout  # the program ran normally
    assert "recorded" in rec.stderr and "shop.cart.price" in rec.stderr
    assert "changes between calls" in rec.stderr  # new_order_id is random
    assert "write_receipt" in rec.stderr and "StringIO" in rec.stderr

    out = run("write", cwd=shop)
    assert out.returncode == 0, out.stderr
    cart_tests = (shop / "tests" / "test_snap_shop_cart.py").read_text(encoding="utf-8")
    assert cart_tests.startswith(HEADER)
    assert "def test_price(" in cart_tests and "shop.models.Size.LARGE" in cart_tests
    if AUTO_ERRORS:
        assert "def test_price_raises(" in cart_tests and "the cart is empty" in cart_tests
    text_tests = (shop / "tests" / "test_snap_shop_text.py").read_text(encoding="utf-8")
    assert "new_order_id" not in text_tests and "write_receipt" not in text_tests
    assert not (shop / "tests" / "test_snap_app.py").exists()  # main() only returned None

    passed = pytest_in(shop)
    assert passed.returncode == 0, passed.stdout + passed.stderr
    assert " passed" in passed.stdout

    # A "harmless" change to the discount rounding: the generated tests notice.
    cart = shop / "shop" / "cart.py"
    cart.write_text(cart.read_text(encoding="utf-8").replace("ROUND_HALF_UP", "ROUND_DOWN"), encoding="utf-8")
    failed = pytest_in(shop)
    assert failed.returncode == 1
    assert "test_discount" in failed.stdout


def test_run_module_and_write_in_one_go(shop):
    rec = run("run", "--write", "-m", "app", cwd=shop)
    assert rec.returncode == 0, rec.stderr
    assert (shop / "tests" / "test_snap_shop_cart.py").exists()


def test_write_never_replaces_a_file_it_did_not_write(shop):
    run("run", "app.py", cwd=shop)
    mine = shop / "tests" / "test_snap_shop_cart.py"
    mine.parent.mkdir()
    mine.write_text("# my own tests\n", encoding="utf-8")
    out = run("write", cwd=shop)
    assert "left alone" in out.stderr
    assert mine.read_text(encoding="utf-8") == "# my own tests\n"
    run("write", "--force", cwd=shop)
    assert mine.read_text(encoding="utf-8").startswith(HEADER)


def test_exit_code_and_arguments_pass_through(tmp_path):
    (tmp_path / "tool.py").write_text(
        "import sys\n\ndef double(n):\n    return n * 2\n\n"
        "if __name__ == '__main__':\n    print(double(int(sys.argv[1])))\n    sys.exit(3)\n", encoding="utf-8")
    rec = run("run", "tool.py", "21", cwd=tmp_path)
    assert rec.returncode == 3 and rec.stdout.strip() == "42"
    cases = _store.load(tmp_path / ".veyra-snap")["tool"]["functions"]["double"]["cases"]
    assert cases[0]["returns"] == "42"


def test_script_without_main_guard_is_not_importable(tmp_path):
    (tmp_path / "loose.py").write_text("def double(n):\n    return n * 2\n\nprint(double(2))\n", encoding="utf-8")
    rec = run("run", "loose.py", cwd=tmp_path)
    assert rec.returncode == 0
    assert '__name__ == "__main__"' in rec.stderr


def test_show_and_clear(shop, capsys):
    run("run", "app.py", cwd=shop)
    assert main(["--project", str(shop), "show", "--cases"]) == 0
    shown = capsys.readouterr().err
    assert "shop.cart" in shown and "discount" in shown
    assert main(["--project", str(shop), "clear"]) == 0
    assert not list((shop / ".veyra-snap").glob("*.json"))


def test_nothing_to_run(capsys):
    assert main(["run"]) == 2
