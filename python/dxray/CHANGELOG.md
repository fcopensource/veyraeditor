# Changelog

## 1.0.0

First release.

- `dx.scan(data, target=None)`: what each column really is, data problems with the pandas line that fixes each one,
  ranked insights in plain English (relationships, group differences, what drives a target, trends and biggest
  changes, 80/20 concentration, lopsided averages), and a 0-100 health score.
- Reports in the terminal, as a rich Jupyter view, as one self-contained HTML page with inline SVG charts, as
  Markdown and as JSON.
- `dx.clean(data)`: the safe, mechanical fixes, with a log of every change. Never drops outliers or fills gaps.
- `dx.for_llm(data)`: the dataset described for an AI model in compact Markdown.
- `dx.ask(data, question)`: answers from Claude (`pip install "dxray[ai]"`), with the description cached across
  questions.
- The `dxray` command for CSV, TSV, Excel, Parquet and JSON files.
