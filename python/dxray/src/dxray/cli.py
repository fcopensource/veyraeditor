"""The dxray command:  dxray sales.csv [--target revenue] [--html report.html] [--json] [--clean out.csv] [--ask "..."]"""

from __future__ import annotations

import argparse
import sys

from . import __version__
from ._api import _frame, clean, for_llm, scan


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="dxray", description="An X-ray for your data: what each column is, what's wrong, and what stands out.")
    p.add_argument("file", help="a CSV, TSV, Excel, Parquet or JSON file")
    p.add_argument("-t", "--target", help="the column you care about most: dxray shows what drives it")
    p.add_argument("--html", metavar="PATH", help="also write a shareable HTML report")
    p.add_argument("--json", action="store_true", help="print the report as JSON")
    p.add_argument("--markdown", action="store_true", help="print the report as Markdown")
    p.add_argument("--llm", action="store_true", help="print the dataset described for an AI model")
    p.add_argument("--clean", metavar="PATH", help="write a cleaned copy (CSV or Parquet) and list the changes")
    p.add_argument("--ask", metavar="QUESTION", help='ask Claude about the data (needs pip install "dxray[ai]" and ANTHROPIC_API_KEY)')
    p.add_argument("--version", action="version", version=f"dxray {__version__}")
    a = p.parse_args(argv)
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    try:
        df, name = _frame(a.file)
    except FileNotFoundError:
        print(f"dxray: no such file: {a.file}", file=sys.stderr)
        return 2
    except ValueError as e:
        print(f"dxray: {e}", file=sys.stderr)
        return 2
    try:
        report = scan(df, a.target, name=name)
    except KeyError as e:
        print(f"dxray: {e.args[0]}", file=sys.stderr)
        return 2
    if a.json:
        print(report.to_json())
    elif a.markdown:
        print(report.to_markdown())
    elif a.llm:
        print(for_llm(df, target=a.target, report=report))
    else:
        report.show()
    if a.html:
        report.to_html(a.html)
        print(f"\nReport written to {a.html}", file=sys.stderr)
    if a.clean:
        cleaned, log = clean(df)
        (cleaned.to_parquet if a.clean.lower().endswith(".parquet") else lambda path: cleaned.to_csv(path, index=False))(a.clean)
        print(f"\n{log}\nCleaned data written to {a.clean}", file=sys.stderr)
    if a.ask:
        from ._ask import AskError, ask
        try:
            print("\n" + str(ask(df, a.ask, target=a.target)))
        except AskError as e:
            print(f"dxray: {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
