# Veyra

<img src="public/veyra.png" alt="Veyra icon" width="100" />

A local-first desktop code editor built with **Tauri, Rust, React and TypeScript**. Veyra combines a locally bundled Monaco editor with a file explorer, workspace search, Git inspection and a real shell terminal.

**Status:** early personal-project editor. The native app has been built on Apple Silicon macOS. Windows and Linux are not yet verified or fully supported; the terminal currently assumes a Unix shell. This is not yet a replacement for every feature in Nova or VS Code.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Install and run](#install-and-run)
- [Build a desktop application](#build-a-desktop-application)
- [How to use Veyra](#how-to-use-veyra)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Contributing](#contributing)

## Features

- Native desktop window with the Veyra icon, dark/light themes and compact-window layout.
- Local Monaco editor with syntax highlighting, supported language completion, find/replace, available formatters and JavaScript/TypeScript diagnostics.
- Multiple tabs that retain unsaved text, plus save/discard/cancel confirmation.
- Native folder picker, expandable file tree, new files/folders, file rename and recoverable Trash.
- Atomic file saving with detection of changes made by another application.
- Workspace text search, quick file opening and a command palette.
- Detected-symbol outline and diagnostics panel for open files.
- Git status and textual diffs against HEAD.
- Interactive shell terminal in the selected workspace, powered by a Rust PTY and xterm.js.
- Split views of the active file, resizable sidebar, word wrap, minimap and font preferences.

The packaged editor does not need a development server or a CDN. Internet access is needed to install build dependencies; commands you run in the terminal may also require it.

## Requirements

For the currently tested macOS development path:

| Dependency | Purpose |
| --- | --- |
| Node.js 22.12+ and npm | Frontend dependencies and Vite build |
| Stable Rust and Cargo | Native Tauri backend |
| Xcode Command Line Tools | macOS compiler and platform tools |
| Git | Clone the repository and enable Git inspection |

Install Node.js from [nodejs.org](https://nodejs.org/) and Rust through [rustup.rs](https://rustup.rs/). For platform-specific native dependencies, see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

On macOS, install the command-line tools if absent:

```sh
xcode-select --install
```

After installing Rust, restart Terminal or load its environment:

```sh
source "$HOME/.cargo/env"
node --version
npm --version
rustc --version
cargo --version
git --version
```

## Install and run

```sh
git clone https://github.com/fcopensource/veyraeditor.git
cd veyraeditor
npm ci
npm run tauri dev
```

The first native build can take several minutes. A **desktop window** opens when it finishes. Keep the development terminal running; Ctrl+C stops the development process.

`npm run dev` alone starts only the frontend server. Native filesystem, folder-picker and terminal features require `npm run tauri dev` or a packaged app.

## Build a desktop application

On macOS:

```sh
npm run tauri build -- --bundles app
```

The resulting application is:

```text
src-tauri/target/release/bundle/macos/Veyra.app
```

Open that application in Finder. You can copy it to Applications; Node.js, Cargo and a running development terminal are not needed to launch the built app.

Builds target the current machine architecture by default. This repository does not include a prebuilt installer or automatic updater. Public distribution still requires the appropriate signing/notarization work; a local build is not a notarized release.

## How to use Veyra

### 1. Open a project

Click **Open a project** on the welcome screen or press **Cmd+O**. Choose the folder containing your code. Expand folders in the Explorer and click a file to open it in a tab.

Use **Cmd+P** to filter indexed filenames and press Enter to open a match. Use the Explorer refresh button after adding files externally.

### 2. Edit and save

Type in the editor and press **Cmd+S** to save the active file, or **Shift+Cmd+S** to save all open files. An unsaved indicator marks changed tabs. Switching tabs keeps your edits.

Closing a changed tab, switching projects or quitting prompts you to save, discard or cancel. Clean open files periodically reload external changes. If an open file changed on disk while you were editing, saving is rejected to avoid silently overwriting that version. Preserve your edited text separately before using **Reload file from disk** from the command palette.

**Save regularly:** unsaved text is not recovered after a crash, and open sessions are not restored after quitting.

### 3. Create, rename and remove files

Use the Explorer's **New file** or **New folder** action. Paths are relative to the workspace; for example, `src/components/Button.tsx`. Create parent folders first. New entries cannot overwrite an existing path.

Open a file and use **Rename** in the editor toolbar to change its workspace-relative path. **Move to Trash** asks for confirmation and uses the system Trash instead of permanent deletion. Folder deletion is not provided.

### 4. Search and navigate

- **Cmd+F:** find within the current file using Monaco.
- **Shift+Cmd+F:** search text across indexed workspace files. Click a result to open its location.
- **Shift+Cmd+P:** search editor commands such as Save all, Format document and Reload file from disk.
- **Outline:** click a detected symbol to jump to its line. This is pattern-based detection, not a full language-server symbol index.

Workspace search is a case-insensitive literal-text search; results are capped at 500. It searches saved disk contents, not unsaved buffers.

### 5. Use the terminal

Click the terminal icon to start your login shell in the workspace folder. You can run project commands, for example:

```sh
git status
python3 main.py
# For a trusted Node project with these scripts:
npm install
npm run dev
```

Install each project's required language runtime yourself. The terminal runs real commands with your normal account permissions—it is **not sandboxed**. Only run code and dependency scripts you trust. Stop running commands before closing the app or switching projects; terminal sessions are not persistent.

### 6. Inspect Git changes

Open **Source control** in a Git repository to see branch/status information and inspect tracked-file text diffs against HEAD. Untracked files have no HEAD diff. Git commit, staging, push, merge and authentication are handled through the terminal for now.

### 7. Adjust the workspace

Use **Settings** for dark/light appearance, font size, word wrap and minimap. Preferences are saved locally. Drag the sidebar edge to resize it; **Cmd+B** hides it. The split button creates a second view of the same active file, not an independently selected file.

## Keyboard shortcuts

These shortcuts describe the tested macOS interface.

| Shortcut | Action |
| --- | --- |
| Cmd+O | Open workspace folder |
| Cmd+N | New file |
| Cmd+S | Save active file |
| Shift+Cmd+S | Save all files |
| Cmd+W | Close active tab |
| Cmd+P | Quick open file |
| Shift+Cmd+P | Command palette |
| Cmd+F | Find in active editor |
| Option+Cmd+F | Replace in active editor |
| Shift+Cmd+F | Search workspace |
| Shift+Option+F | Format document when supported |
| Cmd+B | Toggle sidebar |
| Cmd+, | Preferences |

Monaco-specific shortcuts require editor focus. Open the terminal with its toolbar/sidebar button or the command palette.

## Testing

```sh
# TypeScript checks and production frontend bundle
npm run build

# Install browser used by the UI tests, then run them
npx playwright install chromium
npx playwright test

# Native filesystem safety tests
cd src-tauri
cargo test --lib
```

The two browser tests exercise the real Monaco UI with **mocked native IPC**: tab retention, saving, dirty-close cancellation, search, theme switching, file creation, quick open and compact layout. They do not prove native terminal integration. The three Rust tests cover path validation, symlink escapes and disk-save conflicts. A native macOS release build has also succeeded.

## Project structure

```text
src/
  App.tsx             Workspace UI, tabs, commands and native IPC
  App.css             Layout and themes
  editor.ts           Local Monaco workers and language configuration
  Terminal.tsx        xterm terminal and native PTY connection
  main.tsx            React entry point
src-tauri/
  src/lib.rs          File operations, search, Git and PTY backend
  src/main.rs         Desktop entry point
  capabilities/       Tauri permissions
  icons/              Application icon assets
  tauri.conf.json     Window and packaging configuration
tests/                Browser regression tests
public/veyra.png       Interface icon
```

## Troubleshooting

### `cargo metadata` cannot run / Cargo not found

Load Rust into the current shell, verify Cargo, then retry:

```sh
source "$HOME/.cargo/env"
cargo --version
npm run tauri dev
```

### Port 1420 is already in use

Stop the previous Veyra/Vite development process with Ctrl+C in its terminal. To identify the listener without killing unrelated programs:

```sh
lsof -nP -iTCP:1420 -sTCP:LISTEN
```

Run only one development instance. The packaged `.app` does not use this port.

### Missing `veyra_lib` / unresolved library crate

Ensure `src-tauri/src/lib.rs` exists, `[lib]` in `src-tauri/Cargo.toml` is named `veyra_lib`, and `src-tauri/src/main.rs` calls `veyra_lib::run()`. These files are included and aligned in this repository; do not add a similarly named external crate.

### A file cannot open or does not appear in search

Files must be UTF-8 text, contain no NUL bytes and be at most 5 MB. Symlink traversal and access outside the chosen workspace are deliberately blocked. Search/quick-open indexing is limited to 10,000 files and a depth of 25, skipping `.git`, `node_modules`, `target`, `dist`, `build`, `.next`, `.venv` and `venv`. Custom `.gitignore` patterns are not currently used by this indexer.

### Autocomplete, formatting or errors are missing

Capabilities depend on the bundled Monaco language support. Syntax highlighting does not imply full language intelligence. JavaScript/TypeScript diagnostics work on loaded editor models, not a complete project language-server session. Python/Rust language-server completion and diagnostics are not implemented yet.

### Terminal command not found

Install the required runtime/tool and ensure it is available to your login shell. Veyra does not bundle Python, Node, compilers or project dependencies inside its application.

## Limitations and roadmap

Not implemented yet:

- External language-server integration and full-project language intelligence.
- Integrated debugging and breakpoint management.
- Extension marketplace and AI assistance.
- Session restoration, crash recovery and persistent terminal sessions.
- Integrated Git staging/commit/merge UI.
- Independently selectable split panes and multi-root workspaces.
- Verified Windows/Linux support, signed public releases and auto-updates.

Security boundaries apply to editor file APIs, not shell commands. The application is an early local-development tool, not a security-hardened environment for untrusted projects.

## Contributing

Describe the problem or proposed improvement in an issue, make a focused change, and run the frontend build and relevant tests before opening a pull request. Include screenshots for interface changes and regression tests for file-handling changes. Do not commit credentials, private projects, generated builds or dependencies.

## License

[MIT](LICENSE), copyright 2026 Vikram Singh. Third-party dependencies retain their respective licenses.
