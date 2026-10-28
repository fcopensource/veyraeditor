# Changelog

## 1.2.0

- **Any language:** 14 new rules for malicious code well beyond JavaScript and Python: web shells (PHP, ASP, JSP, Node.js, Python, Ruby), code downloaded and run at run time, ransomware, disk wipers and protestware, keyloggers, clipboard crypto hijackers, shellcode, process injection, executable memory, Office macro droppers, databases running commands, setup.py / build.rs / .pth code that runs on install, anti-debugging tricks and hard-coded backdoor passwords. "Decode and run" now also knows PHP, Ruby, Perl, Lua, Java, Go and .NET decoders. 45 rules, 77 languages recognised by name.
- **Rescans the moment malicious code is removed:** deleting a flagged line clears its warning straight away (even with scanning while typing turned off), and every quick fix rescans the file and confirms what's left.
- **New quick fixes:** delete the suspicious line, remove code hidden off-screen, and remove every hidden character in a file at once (keeping emoji and script joiners intact).
- **Watches files changed outside the editor:** files added or changed by git, a package install or another program are checked, and findings for deleted files are cleared. Workspace scans drop results for files that no longer exist and use unsaved editor text.
- **Team settings and custom rules** in `.veyra-guard.json` (with autocomplete): ignored paths, disabled rules, severities and your own patterns, shared by VS Code, the command line, the pre-commit guard and the GitHub Action. Also as `veyraGuard.customRules` and `veyraGuard.ignorePaths` settings.
- **Command line:** `--fix` removes hidden characters and rescans; `--watch` keeps checking as files change and says when a file is clean again; `--help`; languages in the summary and JSON.
- **Languages** checked are listed in the panel, the PDF report and the command line.
- Fewer false alarms: zero-width joiners in emoji and in Persian, Arabic or Indic text, and the word "function" (as in `function decompress()`), are no longer flagged.

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
