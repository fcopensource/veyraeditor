# Changelog

## 1.0.0

First release.

- 26 rules for trojans, backdoors and malicious code: Trojan Source and invisible characters, look-alike letters, code hidden off-screen, decoded and packed code being run, download-and-run commands, reverse shells, crypto miners, credential theft, data drop points, environment harvesting, persistence, disabling defences, hidden PowerShell, obfuscated strings, leaked secrets, poisoned npm install scripts and GitHub workflow attacks.
- In VS Code: findings as you open, edit and save, in Problems and the status bar, with an explanation of each; a whole-workspace scan; quick fixes to remove hidden characters or mark a line as reviewed.
- A GitHub Action that reviews every pull request line by line, marks each finding, posts a review and fails the check at the severity you choose.
- Lines and files can be marked as reviewed; an opt-out added in a pull request is reported.
