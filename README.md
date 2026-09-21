<div align="center">

<img src="public/veyra.png" alt="Veyra Editor" width="110" />

# Veyra Editor

### A fast, local-first desktop code editor built for focused development.

**Monaco editing · Native filesystem · Workspace search · Git inspection · Real shell terminal**

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-native_backend-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)

[Getting Started](#-getting-started) · [Features](#-features) · [Architecture](#-architecture) · [Roadmap](#-roadmap) · [Contributing](#-contributing)

</div>

---

## ✨ What is Veyra?

**Veyra** is an open-source desktop code editor that combines a modern Monaco-powered editing experience with native desktop capabilities through **Tauri and Rust**.

It is designed around a simple idea: the core development workflow should remain **fast, local and under the developer's control**.

Veyra can open a real project directory, edit and save files, search a workspace, inspect Git changes and run commands inside an interactive terminal — without depending on a hosted editor or a permanent development server.

> **Project status:** Veyra is under active development. The current native development path is tested primarily on Apple Silicon macOS. Windows and Linux support, advanced language intelligence and additional IDE capabilities are part of the roadmap.

---

## 🚀 Features

| Area | What Veyra provides |
| --- | --- |
| **Code editing** | Monaco Editor, syntax highlighting, find/replace, supported completion, formatting and JavaScript/TypeScript diagnostics |
| **Tabs & buffers** | Multiple editor tabs, retained unsaved buffers and save/discard/cancel protection |
| **File explorer** | Native folder picker, expandable project tree, file/folder creation, rename and recoverable Trash |
| **Safe saving** | Atomic writes plus detection of files changed externally before overwriting |
| **Workspace search** | Fast literal-text search across indexed project files |
| **Quick navigation** | Quick Open, command palette and detected-symbol outline |
| **Git inspection** | Repository status, branch information and text diffs against HEAD |
| **Integrated terminal** | Real login shell backed by a Rust PTY and rendered with xterm.js |
| **Editor layout** | Split view, resizable sidebar, minimap, word wrap and font preferences |
| **Themes** | Native-feeling dark and light interfaces with locally stored preferences |
| **Local-first runtime** | Packaged editor does not require a CDN or a running frontend development server |

### Built for real local projects

Veyra works directly with files on your machine. Native file APIs deliberately restrict operations to the selected workspace, while terminal commands run with your normal user permissions.

---

## 🧱 Tech Stack

<div align="center">

| Layer | Technology |
| --- | --- |
| Desktop shell | **Tauri 2** |
| Native backend | **Rust** |
| UI | **React 19** |
| Language | **TypeScript** |
| Code editor | **Monaco Editor** |
| Terminal UI | **xterm.js** |
| Native terminal | **portable-pty** |
| Bundler | **Vite 7** |
| UI testing | **Playwright** |

</div>

---

## 🏗 Architecture

\`\`\`mermaid
flowchart LR
    A[React + TypeScript UI] --> B[Monaco Editor]
    A --> C[xterm.js Terminal]
    A --> D[Tauri IPC]
    D --> E[Rust Backend]
    E --> F[Filesystem]
    E --> G[Workspace Search]
    E --> H[Git Inspection]
    E --> I[Native PTY / Shell]
\`\`\`

Veyra intentionally separates the editing interface from privileged desktop operations. React handles the application experience while Tauri commands delegate filesystem, search, Git and PTY operations to Rust.

---

## ⚡ Getting Started

### Prerequisites

For the currently tested macOS development workflow you will need:

- **Node.js 22.12+** and npm
- **Stable Rust** and Cargo
- **Xcode Command Line Tools**
- **Git**

Install the macOS command-line tools if needed:

\`\`\`bash
xcode-select --install
\`\`\`

Verify the environment:

\`\`\`bash
node --version
npm --version
rustc --version
cargo --version
git --version
\`\`\`

### Run Veyra locally

\`\`\`bash
git clone https://github.com/fcopensource/veyraeditor.git
cd veyraeditor
npm ci
npm run tauri dev
\`\`\`

A native Veyra desktop window opens after compilation.

> Running \`npm run dev\` by itself starts only the Vite frontend. Native filesystem, folder-picker and terminal functionality require \`npm run tauri dev\` or a packaged application.

---

## 📦 Build the Desktop App

On macOS:

\`\`\`bash
npm run tauri build -- --bundles app
\`\`\`

The generated application is available at:

\`\`\`text
src-tauri/target/release/bundle/macos/Veyra.app
\`\`\`

You can launch the packaged app without keeping Node.js, Cargo or the Vite development server running.

Public distribution still requires the appropriate platform signing/notarization process. The repository does not currently ship a signed installer or automatic updater.

---

## 🧭 Core Workflow

### Open a project

Use **Open a project** or press \`Cmd+O\` to choose a local workspace. Browse files from the Explorer or press \`Cmd+P\` to quickly open an indexed file.

### Edit safely

Veyra keeps unsaved content in open tabs and prompts before destructive actions. If a file changes on disk while you are editing it, Veyra blocks the save instead of silently overwriting the newer external version.

### Search the workspace

Press \`Shift+Cmd+F\` to search saved project files. Workspace search is case-insensitive literal-text search and currently returns up to 500 results.

### Run project commands

Open the integrated terminal to start your login shell inside the workspace:

\`\`\`bash
git status
python3 main.py
npm install
npm run dev
\`\`\`

The terminal is a **real shell, not a sandbox**. Run only commands and project scripts you trust.

### Inspect Git changes

The Source Control view exposes branch/status information and tracked-file diffs against \`HEAD\`. Staging, committing, pushing, merging and authentication are currently handled through the terminal.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| \`Cmd+O\` | Open workspace |
| \`Cmd+N\` | New file |
| \`Cmd+S\` | Save active file |
| \`Shift+Cmd+S\` | Save all files |
| \`Cmd+W\` | Close active tab |
| \`Cmd+P\` | Quick Open |
| \`Shift+Cmd+P\` | Command palette |
| \`Cmd+F\` | Find in current file |
| \`Option+Cmd+F\` | Replace in current file |
| \`Shift+Cmd+F\` | Search workspace |
| \`Shift+Option+F\` | Format document when supported |
| \`Cmd+B\` | Toggle sidebar |
| \`Cmd+,\` | Preferences |

> These shortcuts describe the currently tested macOS interface.

---

## 🧪 Testing

Run the frontend type-check and production bundle:

\`\`\`bash
npm run build
\`\`\`

Run the Playwright UI tests:

\`\`\`bash
npx playwright install chromium
npx playwright test
\`\`\`

Run the native Rust tests:

\`\`\`bash
cd src-tauri
cargo test --lib
\`\`\`

The browser tests exercise the Monaco-based UI with mocked native IPC. Rust tests cover native safety behavior such as path validation, symlink escapes and save conflicts.

---

## 📁 Project Structure

\`\`\`text
veyraeditor/
├── src/
│   ├── App.tsx          # Main workspace UI and commands
│   ├── App.css          # Application layout and themes
│   ├── editor.ts        # Monaco configuration and workers
│   ├── Terminal.tsx     # xterm.js terminal UI
│   └── main.tsx         # React entry point
│
├── src-tauri/
│   ├── src/lib.rs       # Filesystem, search, Git and PTY backend
│   ├── src/main.rs      # Native application entry point
│   ├── capabilities/    # Tauri permissions
│   ├── icons/           # Desktop application icons
│   └── tauri.conf.json  # Window and bundle configuration
│
├── tests/               # Playwright regression tests
├── public/              # Veyra and frontend assets
└── package.json
\`\`\`

---

## 🛡️ Safety & Local-First Design

Veyra's editor-side native APIs are scoped to the workspace selected by the user. The application also includes protections against unsafe path traversal and conflicting file writes.

Some current boundaries are intentional:

- Text files must be UTF-8, contain no NUL bytes and be no larger than **5 MB**.
- Workspace indexing is currently limited to **10,000 files** and a depth of **25**.
- Common generated directories such as \`.git\`, \`node_modules\`, \`target\`, \`dist\`, \`build\`, \`.next\`, \`.venv\` and \`venv\` are skipped.
- Terminal commands are outside those editor-file protections and execute with the user's normal shell permissions.

---

## 🗺 Roadmap

Veyra is intentionally growing in stages. Major areas planned for future development include:

- [ ] Language Server Protocol integration
- [ ] Rich Python and Rust diagnostics/completion
- [ ] Integrated debugging and breakpoint management
- [ ] Git staging, commit and merge workflows
- [ ] Independent split-editor panes
- [ ] Session restoration and crash recovery
- [ ] Persistent terminal sessions
- [ ] Multi-root workspaces
- [ ] Extension/plugin architecture
- [ ] AI-assisted development workflows
- [ ] Verified Windows and Linux support
- [ ] Signed releases and automatic updates

Have an idea that fits Veyra's direction? Open an issue and describe the workflow it would improve.

---

## 🤝 Contributing

Contributions are welcome.

A good contribution should be focused, testable and consistent with Veyra's local-first desktop architecture.

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Run the relevant frontend and/or Rust tests.
5. Include screenshots for user-interface changes.
6. Add regression coverage for filesystem-sensitive behavior.
7. Open a pull request with a clear explanation of the change.

Please do not commit credentials, private projects, dependency directories or generated release builds.

---

## ⚠️ Current Limitations

Veyra is not yet intended to replace every capability of mature IDEs such as VS Code.

Current limitations include incomplete language-server support, no integrated debugger, no extension marketplace, no full Git write workflow, no session recovery and limited cross-platform verification.

That scope is deliberate: the project is establishing a reliable native editing foundation first.

---

## 📄 License

Veyra is released under the [MIT License](LICENSE).

Copyright © 2026 Vikram Singh.

Third-party libraries and dependencies remain subject to their respective licenses.

---

<div align="center">

### Build locally. Code with focus. Keep the workspace yours.

If Veyra is useful to you, consider giving the repository a ⭐ and contributing to its development.

**[Back to top](#veyra-editor)**

</div>
