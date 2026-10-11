---
title: Setting up TypeScript, ESLint and Prettier in Veyra
description: Get full IntelliSense, lint errors as you type and format-on-save for JavaScript and TypeScript projects in Veyra, using the same language servers as VS Code.
date: 2026-10-03
category: Guides
readingTime: 6
---

Veyra highlights more than 80 languages out of the box. For JavaScript and TypeScript projects, three built-in tools take it all the way to the experience you know from VS Code: real type errors, your lint rules and consistent formatting.

## Before you start

The web language tools run on **Node.js 18 or newer**. Check in a terminal:

```bash
node --version
```

If the command isn't found, install the LTS version from [nodejs.org](https://nodejs.org) and restart Veyra. On macOS and Linux, Veyra finds Node.js from Homebrew, nvm, Volta, fnm and asdf automatically, even when you start Veyra from the Dock.

## TypeScript & JavaScript

Open **Extensions → Built-in web tools → TypeScript & JavaScript → Install**. Open any `.ts`, `.tsx`, `.js` or `.jsx` file and the server starts on its own.

You get:

- **Errors as you type**, from your project's real `tsconfig.json` (red underlines and the Problems panel).
- **Completions that understand your types**, including auto-imports.
- **Hover documentation**, **go to definition** (F12) and **find references**.
- **Rename across files** (F2) and **quick fixes**, such as adding a missing import.

Run `npm install` in your project first, so type definitions in `node_modules` (React, Node.js, your libraries) are available.

## ESLint

Install **ESLint** from the same list. It uses your project's own ESLint version and configuration, flat config (`eslint.config.js`) or classic (`.eslintrc`), and shows problems as you type. Lightbulb quick fixes can fix a single problem or every auto-fixable problem in the file.

If ESLint shows nothing, check that the project has ESLint installed (`npm install --save-dev eslint`) and a config file. The tool's page in Extensions shows its status and the server's last error message.

## Prettier

Install **Prettier**, then format with **Shift+Alt+F** (**⇧⌥F** on macOS), or turn on **Settings → Files → Format on save**.

Veyra prefers **your project's Prettier** (from `node_modules`) so its version and `.prettierrc` settings apply exactly, and falls back to its own copy for projects that don't have Prettier.

## Tailwind CSS, Emmet, Svelte and Vue

- **Tailwind CSS IntelliSense**: class name completion, a preview of the generated CSS on hover, colour swatches and linting.
- **Emmet**: type `ul>li*3` or `div.card` and expand it into markup.
- **Svelte** and **Vue (beta)**: language support for components.

## How it works (and why it's safe)

Each tool is a pinned version of the language server the matching VS Code extension uses, installed with npm into Veyra's own app folder, **never into your project**. Since version 0.6.1, installs run **without any package install scripts**, and every release checks these exact packages for known security advisories before it ships.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Node.js was not found" | Install Node.js 18+ and restart Veyra |
| A tool says "Failed to start" | Open the tool's page in Extensions to see the error, then click **Restart** |
| No types from libraries | Run `npm install` in the project |
| Formatting ignores your settings | Make sure `.prettierrc` is in the project root and Prettier is installed there |

Still stuck? [Open an issue](https://github.com/fcopensource/veyraeditor/issues) with your Veyra version and the tool's error message.
