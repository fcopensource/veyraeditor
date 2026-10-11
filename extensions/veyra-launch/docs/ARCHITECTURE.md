# Architecture and requirements

## Product goal

Help a developer understand why a Node.js project cannot start and take an explicit, reviewable next action. Initial target: developers opening Next.js/Vite projects in desktop VS Code.

## Stack

TypeScript, VS Code Extension API, Node.js filesystem/network/process APIs, and semver. Native TreeView, OutputChannel, QuickPick, modal previews, and Task terminals supply the UI; no webview or React runtime is needed.

## Components

- `src/core.ts`: filesystem inspection, package-manager selection, Node-range validation, tool probes, error classification, and TCP checks. Does not depend on VS Code and is unit-testable.
- `src/extension.ts`: command registration, bounded workspace discovery, tree rendering, output reports, project/script pickers, and task execution.
- `package.json`: command/view contributions, compatibility, trust policy, build scripts.
- `test/core.test.cjs`: Node test runner with temporary filesystem fixtures and real loopback sockets.

## Data and execution flow

Scan command → tool version probes (five-second timeout each) → workspace file discovery (51 result sentinel, 50-package processing cap) → package inspection → readiness tree/report.

Run/install command → choose project → re-read package.json → select script → show folder and exact script/manager → confirm → VS Code task terminal.

Scans do not execute project scripts. Only one scan runs at a time. Each manifest is limited to 1 MB. The file search excludes common dependency/build directories. Results are stored in memory and replaced on refresh. Workspace changes invalidate the cache. Native theme colors and icons support existing VS Code themes.

## Acceptance criteria

1. A valid supported project shows framework, manager, scripts, and individual readiness findings.
2. Malformed manifests show a visible per-file error without stopping other projects.
3. Unsupported Node ranges produce an unknown/warning result rather than an invented success.
4. Running/installing always previews project location and command; Cancel executes nothing.
5. Untrusted workspaces cannot activate the extension's executable features.
6. A running server is stoppable through ordinary VS Code task controls.
7. No secrets, source files, or pasted errors are sent to external services by the extension.

## Boundaries and future design

Do not interpret a passed readiness check as successful execution. Dependency markers are deliberately described as markers. Package manager installation, lockfile changes, and project scripts remain user-visible task actions. Future AI features should be optional and clearly disclose any code transmission. Future monorepo checks should identify workspace roots before proposing installs.
