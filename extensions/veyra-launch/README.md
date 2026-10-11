# Veyra Launch

**From cloned repo to running project.**

Veyra Launch is a local VS Code extension that inspects Node.js projects, explains common setup problems, and runs package scripts through VS Code tasks. Version 0.1.0 is an initial release for local testing, not a published Marketplace product.

## Install

1. Use VS Code 1.95 or newer.
2. Open Extensions, choose the `…` menu, then **Install from VSIX…**.
3. Select `veyra-launch-0.1.0.vsix` from this project folder.
4. Open a trusted Node.js project folder.
5. Click the Veyra Launch icon in the Activity Bar and choose **Scan Projects**.

Alternatively, with the VS Code command-line launcher installed:

```sh
code --install-extension ./veyra-launch-0.1.0.vsix
```

## What it does

- Finds up to 50 package.json files, including packages in multi-root workspaces and monorepos.
- Recognizes Next.js, Vite, Angular, Nuxt, or a generic Node.js project from declared dependencies.
- Selects npm, pnpm, Yarn, or Bun from `packageManager`, lockfiles, or an npm fallback.
- Flags conflicting lockfiles and package-manager declarations.
- Checks the Node version visible to the extension host against `engines.node` using semantic version ranges.
- Checks availability of the selected package manager and presence of dependency installation markers.
- Lists scripts with their actual commands and runs them in VS Code task terminals after a preview.
- Provides dependency installation, manual TCP port checks, a readable readiness report, and local explanations of supported errors.

## Typical workflow

1. Clone/open a project and read its README.
2. Run **Veyra Launch: Scan Projects** from the Command Palette.
3. Hover each readiness item for its explanation. A green item means that particular check passed; it is not a guarantee that the project will build.
4. If dependencies are missing, select **Install dependencies…**, review the folder and command, and confirm.
5. Refresh the scan after installation or tool changes.
6. Expand **Scripts** and select `dev`, `start`, `build`, or another available script. Review the script before executing.
7. Stop a running server using Ctrl+C in its task terminal or VS Code's **Tasks: Terminate Task** command.

When a task fails, inspect its terminal output and use **Veyra Launch: Explain a Setup Error** to paste the relevant error. Error text stays local and is not copied into the readiness output. Port checks do not terminate any process.

## Commands

| Command (prefix: Veyra Launch) | Purpose |
| --- | --- |
| Scan Projects | Refresh project detection and readiness results |
| Run Project Script | Choose project/script, preview, then execute |
| Install Dependencies | Preview and run the selected manager's install command |
| Open Readiness Report | Open the text report in the Output panel |
| Check Local Port | Probe IPv4/IPv6 loopback for a TCP listener |
| Explain a Setup Error | Explain a pasted error using local pattern matching |

## Limitations

- No AI, login, telemetry, cloud service, automatic fixes, or continuous background scanning.
- Does not capture or analyze terminal output automatically. Error explanations cover ports, missing commands/modules, engine mismatches, and permissions only.
- Node checks use the extension host PATH. A shell configured with nvm/fnm may see a different version. Restart VS Code after changing PATH. `.nvmrc`, `.node-version`, and Volta pins are not evaluated yet.
- Package-manager versions are displayed but not checked against pinned versions. Corepack may need separate setup.
- `node_modules`/`.pnp.cjs` presence is only a marker, not dependency integrity verification. Hoisted monorepo installations may produce a warning at child packages; install at the repository root where appropriate.
- Framework detection is heuristic. No dependency installation or script is run during a scan; version probes invoke installed tools, whose own behavior may vary.
- No environment-variable checks or Rust/Tauri diagnostics in this release.
- Port checks test TCP loopback at one moment, not UDP, process ownership, or exclusive availability.
- SSH, WSL, and containers execute checks/tasks on their extension host. Browser-only virtual workspaces are unsupported.
- Task arguments are quoted through the VS Code shell API; commands inside package.json remain executable project code.

## Develop

Requires Node.js 22 and npm for the development toolchain.

```sh
npm ci
npm test
npm run package
```

Open this folder in VS Code and press **F5** to launch the Extension Development Host. Open a fixture project there and run **Veyra Launch: Scan Projects**. Source changes require recompilation and restarting/reloading that host.

Documentation included in the project: `docs/ARCHITECTURE.md`, `docs/TESTING-AND-RELEASE.md`, and `PRIVACY.md`.

## Roadmap

Validate this version with real projects first. Candidates for subsequent releases: ancestor-aware monorepo installation detection, version-manager configuration checks, Tauri/Rust readiness, and optional explanations for additional errors.

## License

MIT. The manifest publisher `veyra-local` is a local packaging identifier, not a verified or registered Marketplace publisher. Replace it with your actual publisher before publishing.
