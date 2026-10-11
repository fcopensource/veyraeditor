# Testing and release guide

## Automated checks

Run `npm ci`, then `npm test`. Tests cover manager precedence/conflicts, version ranges, missing tools, malformed manifests, framework/script extraction, dependency markers, TCP listeners, and error explanations. `npm run package` compiles and produces a VSIX. These tests do not replace Extension Host integration testing.

## Local validation — 2026-10-11

- TypeScript compilation and all five core test groups passed on macOS with Node 22.17.0.
- A separate installed VS Code Extension Development Host activated the extension, verified registration of all six commands, invoked scan/report, and exited successfully. Harness: `test/host.cjs`, supplied through VS Code's `--extensionTestsPath` option together with `--extensionDevelopmentPath`.
- VSIX packaging succeeded. Only the runtime semver dependency is included; development tools and tests are excluded.
- `npm audit --omit=dev` reported zero vulnerabilities.
- Full `npm audit` reported six high-severity entries along one development-tool dependency chain: vsce → secretlint → globby → fast-glob → micromatch → braces (GHSA-vfj7-8cjw-p6xm). `npm audit fix` did not resolve this with the available dependency versions. Recheck before public release. This chain is not distributed in the VSIX.
- Interactive task execution/cancellation and the full Windows/Linux manual matrix remain to be verified. The CI workflow is supplied but has not been run on GitHub.

## Manual acceptance matrix

Run on macOS, Windows (PowerShell and cmd), and Linux before public release:

| Scenario | Expected result |
| --- | --- |
| Empty window / no package.json | Helpful message, no crash |
| Next.js and Vite fixtures | Correct framework and scripts |
| npm/pnpm/Yarn/Bun projects | Correct manager and task working directory |
| Missing Node or manager | Visible failure explaining PATH |
| Conflicting locks | Warning before user decides how to install |
| Malformed package.json plus valid sibling | Invalid package reported; sibling still scanned |
| Multi-root workspace | Project picker targets the correct folder |
| Folder with spaces; script names with punctuation | One quoted script argument, correct task directory |
| Cancel run/install preview | No task starts |
| dev/build/test scripts | Output appears in a task terminal; failures are surfaced |
| Stop server | Ctrl+C or Tasks: Terminate Task stops it |
| Port with known server / no listener | Accurate point-in-time result |
| Restricted workspace | Extension disabled by trust policy |
| Refresh after installing | Dependency marker finding updates |
| 51+ package manifests | Bounded results and cap notice |
| SSH/WSL workspace | Checks and tasks use the remote host |

Use disposable fixture projects for install/task tests. Test unusual script names because shell quoting differs by platform. Corepack shims and shell version managers need explicit testing on each supported system.

## Package locally

```sh
npm ci
npm test
npm run package
code --install-extension ./veyra-launch-0.1.0.vsix
```

Do not publish until the manual acceptance matrix is completed. Update version and CHANGELOG for each release.

## Publish later

1. Create a publisher account in the Visual Studio Marketplace management portal.
2. Replace `veyra-local` in package.json with the publisher ID you own.
3. Add the real repository URL, support/issue URL, public privacy-policy URL, and a PNG Marketplace icon. Include genuine screenshots from the working extension.
4. Review the packaged file list using `npx vsce ls` and ensure only intended source/runtime documentation is distributed.
5. Follow Microsoft's current authentication steps for `vsce` and publish using the publisher account. Keep access tokens out of files and Git history.
6. Install the Marketplace version in a clean VS Code profile and repeat a basic scan/run smoke test.

References:
- https://code.visualstudio.com/api/get-started/your-first-extension
- https://code.visualstudio.com/api/extension-guides/tree-view
- https://code.visualstudio.com/api/extension-guides/workspace-trust
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
