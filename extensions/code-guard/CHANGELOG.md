# Changelog

## 1.1.0

- **PDF security report:** a cover with the grade, score and top risks; every finding with its code, why it matters and how to fix it; and the method and rules. From VS Code, the command line or the GitHub Action.
- **How to fix** for every rule, in hovers, the panel, pull request comments and the report.
- **A grade** from A to F and a score out of 100 for every project and pull request.
- **Supply-chain checks:** typo-squatted npm and PyPI packages, dependency confusion, dependencies from URLs or git, and unpinned versions.
- **The Code Guard panel** in the Activity Bar: the grade, findings by severity, and one click to jump, scan, create a report or install the pre-commit guard.
- **Pre-commit guard:** stops commits that add high or critical findings; checks only the staged lines; works alongside existing hooks.
- **SARIF output** for GitHub's Security tab, and `report-pdf`, `sarif`, `grade` and `score` in the GitHub Action.
- **Command line:** `node cli.js [folder] [--staged] [--pdf] [--sarif] [--json] [--fail-on]`.
- Documentation files are only checked for hidden characters and leaked keys.

## 1.0.0

First release: 26 rules for trojans, backdoors and malicious code in VS Code and on every GitHub pull request.
