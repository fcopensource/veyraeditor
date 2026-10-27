<p align="center">
  <img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/code-guard/media/readme/panel.png" alt="VS Code with the Code Guard panel showing Grade F and findings grouped into critical, high and medium, next to a script that steals an SSH key and runs a hidden payload" width="100%">
</p>

# Veyra Code Guard

**A security reviewer that reads every line of code for trojans, backdoors and supply-chain attacks, tells you how to fix each one, and writes the security report for you.**

Malicious code rarely looks malicious. It hides in an "update checker", a typo-squatted package, an install script, or a character you can't even see. Veyra Code Guard catches the tricks attackers actually use, **in your editor, before every commit and on every GitHub pull request**, and turns the result into a professional PDF report. By the makers of [Veyra Studio](https://veyraeditor.com).

- 🛡️ **31 rules, every language:** Trojan Source, hidden code being run, backdoors, crypto miners, stolen credentials, leaked keys, typo-squatted packages, dependency confusion and GitHub workflow attacks.
- 🧭 **Tells you how to fix it:** every finding explains what was found, why it matters and exactly what to do.
- 🅰️ **A security grade:** every project and pull request gets an A to F grade and a score out of 100.
- 📄 **PDF security report:** one click creates an audit-ready report with a cover, executive summary, code excerpts and fixes, to share with clients, managers or auditors.
- ⛔ **Pre-commit guard:** stops risky code before it's even committed.
- 🔍 **GitHub pull request reviews,** plus your findings in GitHub's **Security** tab (SARIF).
- 🔒 **Private:** everything runs on your machine or your own CI. No account, no upload, no telemetry.

---

## The Code Guard panel

Code Guard has its own panel in the Activity Bar. It shows the project's grade, every finding grouped by severity, and buttons to scan everything, create a PDF report or install the pre-commit guard. Click a finding to jump straight to the line.

Every file is checked as you open, edit and save it. Hover over a flagged line to see what was found, why it matters and how to fix it:

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/code-guard/media/readme/hover.png" alt="A hover on a flagged eval line explaining why decoding and running hidden code is dangerous and how to fix it, with the Problems panel below" width="100%">

**Quick fixes:** remove hidden characters from a line, or mark a line as reviewed and safe.

## PDF security report

Run **Veyra Code Guard: Create Security Report (PDF)**, or click the PDF button in the panel. You get a report you can send to a client or attach to an audit:

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/code-guard/media/readme/report.png" alt="The first page of a Code Guard security report: a dark cover with the title Security Code Review, grade F, severity counts and the top risks" width="70%">

- **Cover:** the project, the date, the grade and score, findings by severity, and the top risks.
- **Every finding:** its location, the code around it with the line highlighted, and what was found, why it matters and how to fix it.
- **Method:** how the review works, how the grade is calculated, and every rule that was checked.

## Pre-commit guard

Run **Veyra Code Guard: Install Pre-commit Guard** once in a git repository. From then on, every `git commit` (from VS Code, a terminal or any git app) is checked first, and **a commit that adds a high or critical finding is stopped** with an explanation:

```
  CRITICAL Running decoded or obfuscated code  src/update.js:9:3
           Decodes and runs hidden code: eval(atob
           Fix: Decode the string and read what it really does. Replace eval/Function with ordinary code…

  Commit blocked. Fix the lines above, or mark a safe line with a "veyra-guard-ignore: <rule>" comment.
  To skip the check once: git commit --no-verify
```

It only checks the lines you're committing, works alongside any hook you already have, and can be removed with **Remove Pre-commit Guard**.

## On every GitHub pull request

Add `.github/workflows/code-guard.yml` to your repository:

```yaml
name: Veyra Code Guard
on: pull_request
permissions:
  contents: read
  pull-requests: write
  security-events: write
jobs:
  code-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fcopensource/veyraeditor/extensions/code-guard@main
        with:
          report-pdf: code-guard-report.pdf
          sarif: code-guard.sarif
      # Keep the PDF report with the run, even when the check fails.
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: security-report, path: code-guard-report.pdf }
      # Show the findings in the repository's Security tab.
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: code-guard.sarif }
```

On every pull request, Code Guard:

1. Reads each line the pull request **adds**, in the context of its whole file.
2. Marks each suspicious line in **Files changed**, with what it found, why it matters and how to fix it.
3. Posts a review with a comment on each line, and a summary with the grade.
4. Fails the check when anything is **high** or **critical**, so it can't be merged by accident.

Pull requests from forks get a read-only token, so they can't receive a review comment. Every line is still marked, and the summary is still written.

| Input | Default | What it does |
|---|---|---|
| `fail-on` | `high` | Fail the check at this severity or above: `critical`, `high`, `medium`, `low` or `never` |
| `min-severity` | `low` | The lowest severity to report |
| `scan` | `changed-lines` | `changed-lines` (only new lines), `changed-files` (every line of changed files) or `all` (the whole repository) |
| `review` | `true` | Post findings as a pull request review |
| `report-pdf` | | Write a PDF security report to this path |
| `sarif` | | Write SARIF to this path, for GitHub's Security tab |
| `ignore-paths` | | Paths to skip, such as `docs/**, test/fixtures/**` |
| `disable-rules` | | Rule ids to turn off, such as `raw-ip-url, base64-blob` |

Outputs: `findings`, `critical`, `grade`, `score`, `report` and `sarif`.

## What it looks for

| Severity | What | Examples |
|---|---|---|
| 🛑 Critical | **Trojan Source** | Hidden text-direction characters that make code display differently from how it runs (CVE-2021-42574) |
| 🛑 Critical | **Hidden code being run** | `eval(atob(…))`, `new Function(Buffer.from(…, 'base64'))`, packed JavaScript, `exec(base64.b64decode(…))` |
| 🛑 Critical | **Download and run** | `curl … \| sh`, `iex (New-Object Net.WebClient).DownloadString(…)`, `certutil -urlcache`, `mshta http…` |
| 🛑 Critical | **Backdoors** | Reverse shells, hidden or encoded PowerShell |
| 🛑 Critical | **Crypto miners** | Mining pools (`stratum+tcp://`), XMRig and similar |
| 🛑 Critical | **Turning off defences** | Disabling Windows Defender, the firewall or SELinux; wiping logs and shell history |
| 🛑 Critical | **Poisoned packages and pipelines** | `postinstall` scripts that download or run code; `pull_request_target` workflows that run outsiders' code |
| 🔴 High | **Typo-squatted packages** | `expres` instead of `express`, `reqeusts` instead of `requests`, swapped letters like `tyepscript` |
| 🔴 High | **Dependency confusion** | Extra package indexes and plain-http package sources |
| 🔴 High | **Stealing data** | Reading SSH keys, cloud credentials, browser passwords or wallets; collecting every environment variable; sending data to webhooks, paste sites or tunnels |
| 🔴 High | **Staying hidden** | Invisible characters, look-alike letters in names, code pushed far to the right, strings built from character codes |
| 🔴 High | **Persistence** | Adding itself to cron, scheduled tasks, startup folders, the registry Run key or `~/.bashrc` |
| 🔴 High | **Leaked secrets** | AWS, GitHub, Slack, Stripe, Google, OpenAI and Anthropic keys, private keys (sample keys are recognised and skipped) |
| 🔴 High | **Workflow injection** | `${{ github.event.issue.title }}` and other untrusted text inside a `run:` step |
| 🟠 Medium | **Worth a second look** | Dependencies from URLs or git, bare IP addresses, large encoded blobs, turned-off certificate checks |
| 🔵 Low | **Install hooks and unpinned versions** | Any `postinstall` script; dependencies set to `*` or `latest` |

Run **Veyra Code Guard: What It Looks For** to see every rule, with why it matters and how to fix it.

## The grade

Every project starts at 100. It loses 30 points per critical, 12 per high, 4 per medium and 1 per low finding, and any critical finding limits the grade to D. **A** means clean.

## Command line

The same scanner runs anywhere Node.js does:

```bash
node cli.js .                       # check a folder
node cli.js . --pdf report.pdf      # and write a PDF report
node cli.js . --sarif out.sarif     # or SARIF
node cli.js . --json                # or JSON for your own tools
node cli.js --staged                # only what is staged for commit
```

## When a finding is safe

Mark the line as reviewed with a comment on it or the line above:

```js
// veyra-guard-ignore: download-execute (official installer, reviewed)
const install = "irm https://example.com/install.ps1 | iex";
```

`veyra-guard-ignore` on its own skips every rule for that line. A file of deliberate samples, such as test fixtures, can opt out in its first five lines with `veyra-guard-ignore-file`. Attackers can add these comments too, so when a pull request **adds** one, Code Guard reports it.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `veyraGuard.enabled` | `true` | Check files as you open, edit and save them |
| `veyraGuard.scanWhileTyping` | `true` | Check again shortly after you stop typing |
| `veyraGuard.minSeverity` | `low` | The lowest severity to show |
| `veyraGuard.disabledRules` | `[]` | Rule ids to turn off |

## Good to know

Code Guard recognises the patterns attackers use; it doesn't run your code. It catches the common and the sneaky, but a determined attacker can write code it won't recognise. Use it alongside careful review, dependency audits and the principle of least privilege, not instead of them.

---

Made by [FlightCoders](https://flightcoders.com), the team behind [Veyra Studio](https://veyraeditor.com) · [Report an issue](https://github.com/fcopensource/veyraeditor/issues) · MIT licence
