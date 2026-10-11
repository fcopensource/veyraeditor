---
title: Why Veyra is 10 MB: Rust, Tauri and the system web view
description: Most desktop code editors download over 100 MB. Veyra's Windows installer is about 7 MB. Here's the architecture behind that, and the trade-offs we accepted.
date: 2026-10-11
category: Engineering
readingTime: 7
---

Download sizes say a lot about how an app is built. Most popular desktop code editors are built on **Electron**, which bundles an entire copy of the Chromium browser and the Node.js runtime with every app. That's a reliable foundation, but it means every editor ships its own browser, often 100 MB or more before any of the editor's own code.

Veyra's Windows installer is about **7 MB**. On macOS it's about 11 MB. Here's how.

## The architecture in one picture

Veyra has two halves:

| Half | Built with | Responsible for |
|---|---|---|
| **Interface** | React and the Monaco editor | Everything you see: editor, tabs, panels, AI chat |
| **Core** | Rust | Files, search, Git, the terminal, language servers, AI requests, secrets, updates |

The two halves talk through **Tauri**, an open-source framework for building desktop apps with a web interface and a Rust core.

## The trick: use the web view you already have

Instead of bundling a browser, Tauri uses the one your operating system already provides:

- **Windows**: Microsoft Edge WebView2, preinstalled on Windows 10 and 11
- **macOS**: WKWebView, the engine behind Safari
- **Linux**: WebKitGTK

That alone removes most of the weight. The rest of the savings come from Rust: the core compiles to a single, compact native binary with no separate runtime to ship.

## What it buys you

- **Fast downloads and updates.** Updates are small, so they install in seconds.
- **Quick start-up.** There's no bundled browser to boot.
- **Lower memory use** for the editor itself.
- **A smaller attack surface.** Less bundled code means less to patch. The Rust core also handles anything sensitive (file access, processes, network calls to AI providers) behind a narrow, explicit set of commands, and the interface runs under a strict Content Security Policy.

## The trade-offs we accepted

Every architecture has costs. These are ours:

1. **Different engines per platform.** Veyra's interface runs on Chromium-based WebView2 on Windows but WebKit on macOS and Linux. We test on all three, and occasionally have to work around an engine difference.
2. **Linux needs WebKitGTK.** Most desktop distributions have it, but minimal installs may need a package. The self-contained **AppImage** bundles more of what it needs, which is why it's larger (about 83 MB) than the `.deb` and `.rpm` packages.
3. **Node.js is optional, not bundled.** Electron editors carry Node.js for their extensions. Veyra uses the Node.js on your computer only for the optional web language tools, so users who don't need them don't pay for them.
4. **No VS Code extension host yet.** VS Code extensions that run their own code expect Electron's Node.js environment. Supporting them is on our roadmap, built in a way that keeps Veyra small for everyone who doesn't need it.

## Doing more in Rust

Moving work into the Rust core has a nice side effect: it's where we can be most careful. Path checks stop the interface from reading files outside your workspace. Saves are atomic, so a crash mid-save can't corrupt a file. Background processes like Git and the language servers start without console windows and are cleaned up when you close a project. And AI provider keys live in your operating system's credential store, handled by Rust and never exposed to the interface.

## Small is a feature

We think the best tools get out of the way. A 7 MB download is a small thing, but it reflects a bigger idea: Veyra should feel light, start fast and respect your machine. [Give it a try](/download).
