---
title: Moving from VS Code to Veyra in ten minutes
description: A practical guide to switching from VS Code to Veyra: shortcuts, language tools, themes, Git and AI, plus an honest list of what Veyra doesn't do yet.
date: 2026-09-26
category: Guides
readingTime: 7
---

If you use VS Code every day, Veyra will feel familiar from the first keystroke. Both are built on the Monaco editor, so most of your muscle memory carries over. This guide covers the few things worth setting up, and is honest about what isn't there yet.

## 1. Install Veyra and open your project

[Download Veyra](/download) and install it. You don't need to uninstall VS Code: the two live happily side by side. Open the same project folder with **Ctrl+O** (**⌘O** on macOS). There's nothing to import: Veyra works directly on the files in your folder.

## 2. Your shortcuts already work

The everyday shortcuts are the same:

| Action | Windows / Linux | macOS |
|---|---|---|
| Quick open a file | `Ctrl+P` | `⌘P` |
| Command palette | `Ctrl+Shift+P` | `⇧⌘P` |
| Search in all files | `Ctrl+Shift+F` | `⇧⌘F` |
| Go to symbol | `Ctrl+Shift+O` | `⇧⌘O` |
| Toggle sidebar | `Ctrl+B` | `⌘B` |
| Terminal | ``Ctrl+` `` | ``⌃` `` |
| Format document | `Shift+Alt+F` | `⇧⌥F` |

Every command and its shortcut is searchable in the command palette and in **Settings → Keyboard shortcuts**.

## 3. Turn on your language tools

In VS Code, IntelliSense for TypeScript, ESLint and Prettier comes from extensions. In Veyra, open **Extensions → Built-in web tools** and click **Install** on the ones you use:

- **TypeScript & JavaScript**: errors as you type, auto-imports, go to definition, rename across files.
- **ESLint**: your project's lint rules, with quick fixes.
- **Prettier**: formatting with your project's config. Turn on **Format on save** in Settings.
- **Tailwind CSS**, **Emmet**, **Svelte** and **Vue**.

These are the same language servers the VS Code extensions use, so results match what you're used to. They need Node.js 18 or newer. The step-by-step version is in [Setting up TypeScript, ESLint and Prettier](/blog/typescript-eslint-prettier).

## 4. Bring your theme

Search the marketplace in the Extensions panel for your favourite theme: One Dark Pro, Dracula, Night Owl, GitHub Theme and thousands more are on Open VSX. Click the extension to open its page, then **Install** and **Set Colour Theme**.

## 5. Git works the way you expect

Open **Source control** with **Ctrl+Shift+G**. Stage, write a message and commit with **Ctrl+Enter**. Changed lines appear in the editor gutter, and the file tree shows status badges. Veyra uses the Git already installed on your computer, so your credentials, hooks and config all apply.

## 6. Set up AI, your way

Open the assistant with **Ctrl+L**. The easiest start is **Veyra AI**: sign in with your free Veyra account and start asking, with no API key. If you prefer, run models privately with Ollama (see [Local AI coding with Ollama](/blog/local-ai-with-ollama)) or paste your own key for Claude, OpenAI, Gemini or another provider.

**Edit with AI** (**Ctrl+K**) shows every proposed change as a diff you approve, like a pull request from a colleague.

## What Veyra doesn't do yet

We'd rather you know up front:

- **No debugger yet.** If you rely on breakpoints every day, keep VS Code around for debugging sessions.
- **Extensions that run their own code** (for example, Python or Java language extensions, Docker, Live Share) need a VS Code extension host, which is on our [roadmap](/roadmap). Themes, snippets and the built-in web tools work today.
- **Rust, Go and C/C++ language servers** are the next milestone.

## The payoff

What you get in return: an editor that downloads in seconds, opens quickly, has no telemetry, and lets you decide where your code goes. Many people end up using Veyra for most of their day and VS Code only for debugging, and that's a perfectly good way to start.
