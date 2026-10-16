---
title: Live reload: see every HTML, CSS and JS save instantly
description: How live reload works, why CSS changes don't need a full page refresh, and how to get it in VS Code or Veyra with Veyra Live Server in under a minute.
date: 2026-10-17
category: Guides
readingTime: 5
keywords: live server, live reload, Live Server VS Code, auto refresh browser on save, CSS hot reload, local web server, Veyra Live Server
---

When you build a web page, the loop is always the same: edit, save, switch to the browser, refresh. Live reload removes the last two steps. Save the file and the browser updates on its own, so you can keep your eyes on the result.

## How live reload works

A live reload tool does two jobs:

1. **It serves your folder over HTTP**, at an address like `http://127.0.0.1:5500`. Opening files through a real server matters: browsers restrict pages opened straight from disk (`file://`), so things like JavaScript modules and `fetch()` often fail there.
2. **It watches your files** and, when one changes, tells every open tab to update through a small script added to the page.

What the browser does next depends on what changed:

| You save | What happens |
|---|---|
| An HTML or JavaScript file | The page reloads |
| A CSS file | The new stylesheet is swapped in, **without** reloading |

That second row is the one that saves the most time. When only styles change, a good live server replaces the stylesheet in place, so your scroll position, open menus and the text you typed into a form all stay where they were.

## Get it in VS Code

[Veyra Live Server](/live-server) is a free VS Code extension.

1. In VS Code, open **Extensions** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search for **Veyra Live Server** and click **Install**.
2. Open your project folder.
3. Click **Go Live** in the status bar, or right-click an HTML file and choose **Open with Live Server**.

Your page opens in the browser. Save a file and watch it update.

If you've used the classic Live Server extension, it feels the same: the same port and the same shortcuts. It also swaps CSS without reloading, has no runtime dependencies, and is under 100 KB.

## Get it in Veyra

In [Veyra Studio](/download), Live Server is built in, written in Rust, with no Node.js and nothing to install. Open a folder with an `index.html` and click **Go Live**.

## Safe by default

A development server should never expose more than you intend:

- **Only your computer can connect.** Veyra Live Server listens on `127.0.0.1`, so other devices on your network can't open your work in progress.
- **Only your folder is served.** Requests for files outside it are refused.

## Tips for a smooth loop

- **Keep `index.html` at the top of your folder.** It opens automatically; folders without one show a clean list of their files.
- **Link styles with `<link rel="stylesheet">`.** Stylesheets added that way are the ones that can be swapped without a reload.
- **Put the browser beside your editor.** With live reload, you'll rarely need to touch it.
- **Media works too.** Videos and audio stream and seek smoothly, so you can test pages with large files.

## When you outgrow it

Live Server is ideal for static sites, prototypes and learning. Once you move to a framework such as Vite, Next.js or Astro, use its own dev server, which already includes hot reload. If one of them complains that its port is in use, [here's how to free it](/blog/fix-port-already-in-use).
