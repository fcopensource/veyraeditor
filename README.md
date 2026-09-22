<div align="center">

# Veyra Editor

### A developer-first code editor project focused on speed, clarity, and a clean coding experience.

**Open source · TypeScript · React · Local-first direction · Built in public**

[![License](https://img.shields.io/badge/license-MIT-22c55e.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Open Source](https://img.shields.io/badge/open%20source-%E2%9D%A4-red)](https://github.com/fcopensource/veyraeditor)

[Overview](#-overview) · [Current Status](#-current-status) · [Development](#-development) · [Roadmap](#-roadmap) · [Contributing](#-contributing)

</div>

---

## ✨ Overview

**Veyra Editor** is an open-source editor project exploring a faster, cleaner and more focused development environment.

The long-term goal is to create an editor that keeps the core developer workflow simple:

- write and navigate code quickly
- work with projects without unnecessary interface noise
- provide useful search, file and Git tooling
- support an integrated terminal and developer commands
- remain extensible as the project grows

Veyra is being developed openly and iteratively rather than presented as a finished IDE before the underlying experience is ready.

---

## 🚧 Current Status

> **Veyra is under active development and is not yet a production-ready replacement for VS Code, Zed, Cursor or other mature editors.**

The repository is currently going through a rebuild of its application foundation.

The current branch contains a modern React/TypeScript web runtime based on **vinext, Vite and Cloudflare-compatible tooling**. Core editor functionality is being layered onto this foundation progressively.

This README intentionally distinguishes between what exists today and what is planned next.

---

## 🧱 Current Technology Stack

| Layer | Technology |
| --- | --- |
| UI | React 19 |
| Language | TypeScript |
| Application runtime | vinext |
| Build tooling | Vite 8 |
| Styling | Tailwind CSS |
| Data layer | Drizzle ORM |
| Edge/runtime integration | Cloudflare-compatible worker |
| Testing | Node test runner |
| Linting | ESLint |

---

## 📁 Repository Structure

```text
veyraeditor/
├── app/                 # Application routes and UI
│   ├── _sites-preview/  # Preview surface
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── db/                  # Database layer and schema
├── drizzle/             # Generated Drizzle metadata/migrations
├── examples/            # Optional integration examples
├── public/              # Static assets
├── tests/               # Automated tests
├── worker/              # Cloudflare-compatible worker entry point
│
├── next.config.ts
├── drizzle.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## ⚡ Development

### Requirements

- Node.js **22.13+**
- npm
- Git

### Clone the repository

```bash
git clone https://github.com/fcopensource/veyraeditor.git
cd veyraeditor
```

### Install dependencies

```bash
npm install
```

### Start development

```bash
npm run dev
```

### Create a production build

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Lint the project

```bash
npm run lint
```

---

## 🎯 Product Direction

Veyra is being designed around several principles.

### ⚡ Fast by default

The editor should feel responsive during normal coding workflows instead of accumulating unnecessary UI and background complexity.

### 🧠 Developer focused

Features should earn their place by improving coding, navigation, debugging or project understanding.

### 🧩 Extensible architecture

The project should be able to evolve toward language intelligence, integrations and plugins without turning the core editor into a tightly coupled system.

### 🔒 User-controlled workflow

The long-term direction favors local project control and transparent developer tooling rather than hiding core operations behind opaque services.

### 🌍 Open development

Architecture, issues, roadmap decisions and contributions can evolve publicly through GitHub.

---

## 🗺 Roadmap

The roadmap is intentionally ambitious, but features will be added incrementally.

### Editor Core

- [ ] Monaco-based editing surface
- [ ] Syntax highlighting
- [ ] Multi-tab editing
- [ ] File explorer
- [ ] Quick file navigation
- [ ] Find and replace
- [ ] Workspace-wide search
- [ ] Command palette
- [ ] Split editor views
- [ ] Configurable themes and editor preferences

### Developer Tooling

- [ ] Integrated terminal
- [ ] Git status and diff views
- [ ] Git staging and commit workflow
- [ ] Diagnostics panel
- [ ] Language Server Protocol support
- [ ] Rich autocomplete and symbol navigation
- [ ] Formatter integration
- [ ] Debugging and breakpoint support

### Platform

- [ ] Desktop packaging
- [ ] macOS distribution
- [ ] Windows distribution
- [ ] Linux distribution
- [ ] Automatic updates
- [ ] Crash/session recovery
- [ ] Extension architecture

### Future Exploration

- [ ] AI-assisted development workflows
- [ ] Codebase-aware search
- [ ] Project intelligence
- [ ] Context-aware refactoring assistance
- [ ] Collaborative developer workflows

---

## 🧪 Quality

Before opening a pull request, run:

```bash
npm run build
npm test
npm run lint
```

New functionality should avoid unnecessary coupling and should include test coverage where practical.

---

## 🤝 Contributing

Contributions, ideas and bug reports are welcome.

A good contribution usually follows this flow:

1. Fork the repository.
2. Create a focused feature branch.
3. Implement the change.
4. Run the relevant build, lint and tests.
5. Add screenshots for visible interface changes.
6. Open a pull request explaining what changed and why.

Please avoid committing credentials, generated dependency directories or private project data.

---

## 💡 Why Veyra?

Developer editors are some of the most important tools engineers use every day.

Veyra is an attempt to explore what that experience can look like when the project starts with a small, understandable architecture and grows deliberately around real developer workflows.

The goal is not to clone every feature of an existing IDE.

The goal is to build a focused editor worth using.

---

## 📄 License

Veyra Editor is open source under the [MIT License](LICENSE).

Copyright © 2026 Vikram Singh.

---

<div align="center">

### Build with focus. Keep the tooling understandable.

If you like the direction of Veyra, consider giving the repository a ⭐.

**[Back to top](#veyra-editor)**

</div>
