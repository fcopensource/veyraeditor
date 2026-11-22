# Changelog

## 1.0.0

First release.

- `veyra-snap run app.py` / `run -m pkg`: run a program and record calls to the functions in your project, with no
  code changes (`sys.monitoring` on Python 3.12+, `sys.settrace` on 3.9 to 3.11).
- `veyra-snap write`: turn the recordings into readable pytest files, one parametrized test per function, plus a
  test for each recorded error with its exact message.
- Every value is checked to rebuild exactly from its source before it goes in a test; calls with values that can't
  be (open files, connections, NaN, ...) are left out, with the reason shown.
- Functions that give different results for the same arguments, or only ever return `None`, get no tests.
- `recording()` to record a block in code, and `@snap` to record chosen functions (`VEYRA_SNAP=1`).
- Libraries, virtual environments and test files are never recorded; once a function has 25 cases it is no longer
  watched, so hot loops stay fast.
