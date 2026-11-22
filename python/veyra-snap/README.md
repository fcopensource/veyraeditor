# veyra-snap

**Run your code. Get pytest tests.**

veyra-snap watches your program run, records what each of your functions was given and what it returned or raised,
and writes those real calls as ready-to-run pytest tests. Legacy code without tests, a refactor you're nervous about,
a library you want locked down: run it once, and you have a safety net.

```console
$ pip install veyra-snap

$ veyra-snap run app.py          # use your program exactly as usual
◆ veyra-snap  recorded 38 calls in 8 functions, 27 new cases
  app.main                1 case
  shop.cart.discount      5 cases  (1 raise)
  shop.cart.line_total    3 cases
  shop.cart.price         6 cases  (2 raises)
  shop.cart.subtotal      4 cases
  shop.text.new_order_id  1 case  changes between calls: no tests
  shop.text.order_number  4 cases
  shop.text.slugify       3 cases
  ! shop.text.write_receipt: 4 calls left out (an argument: StringIO values can't be written as source)

$ veyra-snap write
  ! app.main: only ever returned None: no tests
  ✓ tests/test_snap_shop_cart.py  18 cases in 6 tests
  ✓ tests/test_snap_shop_text.py  7 cases in 2 tests
  ! shop.text.new_order_id: gave different results for the same arguments: no tests
◆ veyra-snap  wrote 25 test cases. Run them: pytest

$ pytest
25 passed in 0.05s
```

No changes to your code. No dependencies. Python 3.9 and newer.

## What the tests look like

Plain pytest you can read, review and commit:

```python
@pytest.mark.parametrize(
    "args, kwargs, expected",
    [
        pytest.param(([shop.models.Item(name='Veyra mug', price=decimal.Decimal('12.00'), qty=2, size=shop.models.Size.MEDIUM)], None), {'shipping': decimal.Decimal('4.99')}, {'subtotal': decimal.Decimal('24.00'), 'discount': decimal.Decimal('0'), 'shipping': decimal.Decimal('4.99'), 'total': decimal.Decimal('28.99')}, id="price([shop.models.Item(name='Veyra mug', price=decimal.D..."),
    ],
)
def test_price(args, kwargs, expected):
    assert shop.cart.price(*args, **kwargs) == expected


@pytest.mark.parametrize(
    "args, kwargs, error, message",
    [
        pytest.param(([], None), {'shipping': decimal.Decimal('4.99')}, ValueError, 'the cart is empty', id="price([], None, **{'shipping': decimal.Decimal('4.99')})"),
    ],
)
def test_price_raises(args, kwargs, error, message):
    with pytest.raises(error) as caught:
        shop.cart.price(*args, **kwargs)
    assert str(caught.value) == message
```

Change `price()` so it gives a different answer, and these tests tell you.

## How it works

1. **Record.** `veyra-snap run` runs your script or module and watches the functions in *your* project: not the
   standard library, not your installed packages, not your tests. On Python 3.12+ it uses `sys.monitoring`, so code
   outside your project costs almost nothing.
2. **Check.** Every argument and result is turned into Python source and rebuilt to make sure it comes back the same,
   type for type. Values that can't be (open files, connections, NaN, objects without a usable constructor) are left
   out, and veyra-snap tells you which calls and why.
3. **Spot the flaky ones.** If the same arguments ever give a different result (time, randomness, files, a database),
   the function is marked as changing between calls and gets no tests, so you never get flaky ones.
4. **Write.** `veyra-snap write` turns the recordings in `.veyra-snap/` into `tests/test_snap_<module>.py`. Record more
   runs any time; new cases are added (up to 25 per function), and files are regenerated.

Values it can write: `None`, `bool`, `int`, `float`, `complex`, `str`, `bytes`, lists, tuples, dicts, sets,
frozensets, `Decimal`, `Fraction`, `datetime`/`date`/`time`/`timedelta`/`timezone`, `UUID`, enums, dataclasses and
named tuples, nested any way you like.

## Commands

| Command | What it does |
|---|---|
| `veyra-snap run app.py [args]` | Run a script and record calls |
| `veyra-snap run -m mypkg [args]` | The same for `python -m mypkg` |
| `veyra-snap run --write ...` | Record and write the tests in one go |
| `veyra-snap write` | Write `tests/test_snap_*.py` from the recordings |
| `veyra-snap show [--cases]` | List what's been recorded |
| `veyra-snap clear` | Forget all recordings |

Options for `run`: `-i/--include DIR` to watch only some folders, `-x/--exclude PATTERN` to skip modules or functions
(`-x 'shop.db*'`), `--limit N` cases per function. For `write`: `--out DIR` (default `tests`), `--only MODULE`,
`--force` to replace a test file veyra-snap didn't write (it never does otherwise).

## In code

Record a block, for example a notebook cell or a test of a bigger flow:

```python
from veyra_snap import recording

with recording(exclude=["shop.db*"]):
    run_checkout_flow()
```

Or mark just the functions you care about:

```python
from veyra_snap import snap

@snap
def price(items, coupon=None): ...
```

`@snap` costs nothing in normal runs. It records when you run under `veyra-snap run`, inside `recording()`, or with
the environment variable `VEYRA_SNAP=1`.

## Good to know

- **Script functions:** functions defined in the script you run are recorded when the script has an
  `if __name__ == "__main__":` guard, so tests can import it without running your program.
- **Methods** are recorded too, when the instance can be written as source (for example a dataclass). Class methods
  work; nested functions and lambdas are skipped.
- **Python 3.9 to 3.11:** recording returned values works everywhere; recording *raised errors* automatically needs
  3.12+. With `@snap`, errors are recorded on every version.
- **What to commit:** the generated tests. `.veyra-snap/` holds working data and ignores itself in git.
- The tests check behaviour as it is today, bugs included. They're a safety net for changes, not a proof of
  correctness: read them, and fix what looks wrong.

## License

MIT. Made by [FlightCoders](https://flightcoders.com), the team behind the [Veyra](https://veyraeditor.com) editor.
