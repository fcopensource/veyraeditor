---
title: Introducing Veyra: a fast, local-first AI code editor
description: Why we built Veyra, what makes it different from VS Code and Cursor, and what you can do with it today on Windows, macOS and Linux.
date: 2026-09-22
category: Product
readingTime: 6
---

Most of us spend more hours in a code editor than in any other app. Over the last few years editors have gained a lot of power, and a lot of weight: big downloads, slow start-ups, and AI features that quietly decide what leaves your machine.

**Veyra** is our answer: a free, open-source code editor that is small, fast and yours. It keeps the editing experience developers already know, and puts AI under your control instead of the other way round.

## What Veyra is

Veyra Studio is a desktop editor for **Windows, macOS and Linux**. At its heart is **Monaco**, the same editing engine used by VS Code, so multi-cursor editing, IntelliSense, folding, the minimap and the shortcuts you already know all work the way you expect.

Around the editor, Veyra builds in the tools you reach for every day:

- **Git you can see**: changed lines in the gutter, status badges in the file tree, side-by-side diffs, staging, commits, branches, stash, pull and push.
- **A real terminal**: PowerShell, zsh or bash on a native pseudo-terminal, with several sessions side by side.
- **Real language intelligence**: one-click TypeScript, ESLint, Prettier, Tailwind CSS, Emmet, Svelte and Vue tools, running the same language servers behind VS Code's most popular extensions.
- **Extensions**: browse the open Open VSX marketplace with real icons and ratings, and install colour themes and snippets.
- **AI on your terms**: Veyra AI, local models through Ollama, or your own key for Claude, OpenAI, Gemini and more.

## Small on purpose

A typical Veyra installer is **7 to 11 MB**. Electron-based editors ship a full copy of Chromium with every install, so they usually weigh around ten times as much. Veyra pairs a **Rust** core with the web view your operating system already has, through the Tauri framework.

That choice shows up every day: Veyra downloads in seconds, opens quickly and uses less memory. We wrote more about the trade-offs in [Why Veyra is 10 MB](/blog/why-veyra-is-10-mb).

## AI that stays in its lane

AI is useful. It is also a new place your code can go. Veyra's assistant follows three rules:

1. **You choose the provider.** Use Veyra AI by signing in, run models completely on your computer with Ollama, or connect your own key for a cloud provider.
2. **You see the context.** When the assistant searches your workspace, Veyra shows which files it picked, and it never picks secrets such as `.env` files or private keys. More in [How Veyra keeps your secrets out of AI prompts](/blog/keeping-secrets-out-of-ai).
3. **You approve every change.** Edits arrive as a diff you accept or reject. Nothing is written to disk behind your back.

## Private by default

Veyra has **no telemetry**. Your projects never touch our servers. The optional account on veyraeditor.com stores only your name and email, and you can use the editor without one.

## Built in public

Every line of Veyra is on [GitHub](https://github.com/fcopensource/veyraeditor) under the MIT license. Every release is built by GitHub Actions and has to pass automated tests and dependency audits before it is built. Installed copies update themselves with **cryptographically signed** updates.

## Try it

[Download Veyra](/download) for your system. It installs in under a minute. If you're coming from VS Code, [Moving from VS Code to Veyra](/blog/moving-from-vs-code) gets you set up in about ten minutes.

We'd love to hear what you build, and what you'd like next. The [roadmap](/roadmap) shows where we're heading, and [GitHub issues](https://github.com/fcopensource/veyraeditor/issues) is the best way to tell us.
