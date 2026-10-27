<p align="center">
  <img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/code-guard/media/readme/dark.png" alt="VS Code showing a script that looks like an update checker, with Veyra Code Guard flagging the lines that read the SSH key, send it to a Discord webhook, run a decoded payload, and hide a text-direction character, and the status bar reading 4 suspicious" width="100%">
</p>

# Veyra Code Guard

**A security reviewer that reads every line of code for trojans and backdoors.**

Malicious code rarely looks malicious. It hides in an "update checker", an install script, a single line pushed far to the right, or a character you can't even see. Veyra Code Guard checks every line for the tricks attackers actually use and explains each finding in plain words, **in VS Code as you work and on every GitHub pull request**. By the makers of [Veyra Studio](https://veyraeditor.com).

- 🛡️ **Every line, every language:** JavaScript, TypeScript, Python, shell, PowerShell, Go, Rust, Java, YAML, `package.json` and more.
- 👁️ **Shows what you can't see:** Trojan Source characters (CVE-2021-42574), invisible characters, look-alike letters and code hidden off-screen.
- 🧠 **Explains why it matters,** so you can decide quickly instead of guessing.
- 🔍 **Reviews pull requests on GitHub,** commenting on the exact suspicious lines and blocking the merge when it's serious.
- 🔒 **Runs entirely on your machine.** Your code is never uploaded anywhere.

---

## What it looks for

| Severity | What | Examples |
|---|---|---|
| 🛑 Critical | **Trojan Source** | Hidden text-direction characters that make code display differently from how it runs |
| 🛑 Critical | **Hidden code being run** | `eval(atob(…))`, `new Function(Buffer.from(…, 'base64'))`, packed JavaScript, `exec(base64.b64decode(…))` |
| 🛑 Critical | **Download and run** | `curl … \| sh`, `iex (New-Object Net.WebClient).DownloadString(…)`, `certutil -urlcache`, `mshta http…` |
| 🛑 Critical | **Backdoors** | Reverse shells (`/dev/tcp/…`, `nc -e`, `pty.spawn`), hidden or encoded PowerShell |
| 🛑 Critical | **Crypto miners** | Mining pools (`stratum+tcp://`), XMRig and similar |
| 🛑 Critical | **Turning off defences** | Disabling Windows Defender, the firewall or SELinux; wiping logs and shell history |
| 🛑 Critical | **Poisoned packages and pipelines** | `postinstall` scripts that download or run code; `pull_request_target` workflows that run outsiders' code |
| 🔴 High | **Stealing data** | Reading SSH keys, cloud credentials, browser passwords or crypto wallets; collecting every environment variable; sending data to Discord or Telegram webhooks, paste sites or tunnels |
| 🔴 High | **Staying hidden** | Invisible characters, look-alike letters in names, code pushed far to the right, strings built from character codes |
| 🔴 High | **Persistence** | Adding itself to cron, scheduled tasks, startup folders, the registry Run key or `~/.bashrc` |
| 🔴 High | **Leaked secrets** | AWS, GitHub, Slack, Stripe, Google, OpenAI and Anthropic keys, private keys (sample keys are recognised and skipped) |
| 🔴 High | **Workflow injection** | `${{ github.event.issue.title }}` and other untrusted text inside a `run:` step |
| 🟠 Medium | **Worth a second look** | Bare IP addresses, large encoded blobs, long hex strings, turned-off certificate checks |
| 🔵 Low | **Install hooks** | Any `preinstall`, `install` or `postinstall` script, so you know it runs on every install |

Run **Veyra Code Guard: What It Looks For** to see every rule with its explanation.

## In VS Code

Every file is checked as you open, edit and save it. Suspicious lines are underlined, listed in **Problems**, and counted in the status bar. Hover over a line to read what was found and why it matters.

<img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/code-guard/media/readme/light.png" alt="The same script in a light theme, with the findings listed in the Problems panel" width="100%">

- **Scan Whole Workspace** checks every file at once, skipping `node_modules`, build output and virtual environments. Right-click in the Explorer, or click the shield in the status bar.
- **Quick fixes:** remove hidden characters from a line, or mark a line as reviewed and safe.

## On every GitHub pull request

Add this file to your repository as `.github/workflows/code-guard.yml`:

```yaml
name: Veyra Code Guard
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  code-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fcopensource/veyraeditor/extensions/code-guard@main
```

On every pull request, Code Guard:

1. Reads each line the pull request **adds**, in the context of its whole file.
2. Marks each suspicious line in **Files changed**, with what it found and why.
3. Posts a review with a comment on each line, and a summary.
4. Fails the check when anything is **high** or **critical**, so it can't be merged by accident.

Pull requests from forks get a read-only token, so they can't receive a review comment. Every line is still marked in **Files changed** and in the job summary.

### Options

| Input | Default | What it does |
|---|---|---|
| `fail-on` | `high` | Fail the check at this severity or above: `critical`, `high`, `medium`, `low` or `never` |
| `min-severity` | `low` | The lowest severity to report |
| `scan` | `changed-lines` | `changed-lines` (only new lines), `changed-files` (every line of changed files) or `all` (the whole repository) |
| `review` | `true` | Post findings as a pull request review |
| `ignore-paths` | | Paths to skip, such as `docs/**, test/fixtures/**` |
| `disable-rules` | | Rule ids to turn off, such as `raw-ip-url, base64-blob` |

## When a finding is safe

Some findings are fine in context, such as an install command shown in your app. Mark the line as reviewed with a comment on it or the line above:

```js
// veyra-guard-ignore: download-execute (official installer, reviewed)
const install = "irm https://example.com/install.ps1 | iex";
```

`veyra-guard-ignore` on its own skips every rule for that line. A file of deliberate samples, such as test fixtures, can opt out in its first five lines with `veyra-guard-ignore-file`.

Attackers can add these comments too. So when a pull request **adds** one, Code Guard reports it, and a reviewer sees exactly what is being excused.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `veyraGuard.enabled` | `true` | Check files as you open, edit and save them |
| `veyraGuard.scanWhileTyping` | `true` | Check again shortly after you stop typing |
| `veyraGuard.minSeverity` | `low` | The lowest severity to show |
| `veyraGuard.disabledRules` | `[]` | Rule ids to turn off |

## Good to know

Code Guard recognises the patterns attackers use; it doesn't run your code or analyse it in a sandbox. It catches the common and the sneaky, but a determined attacker can write code it won't recognise. Use it alongside careful review, dependency audits and the principle of least privilege, not instead of them.

---

Made by [FlightCoders](https://flightcoders.com), the team behind [Veyra Studio](https://veyraeditor.com) · [Report an issue](https://github.com/fcopensource/veyraeditor/issues) · MIT licence
