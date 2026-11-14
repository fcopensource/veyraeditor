---
title: Live Server not working in VS Code? 8 fixes that actually work
description: Live Server won't start, the page doesn't reload, or "Open with Live Server" is missing? The common causes and fixes, plus maintained alternatives.
date: 2026-11-14
category: Guides
readingTime: 6
keywords: live server not working, live server not reloading, open with live server missing, live server port 5500, vs code live server alternative, live reload vs code, go live not working
---

Live Server is how many people learn web development: click **Go Live**, and the browser reloads every time you
save. When it stops working, it's usually one of these.

## 1. "Open with Live Server" is missing

Live Server works on a **folder**, not a single file. Use **File → Open Folder…**, open the folder that contains your
`index.html`, then right-click the HTML file in the Explorer. If you opened just the file, the option and the
**Go Live** button may not appear.

## 2. The page doesn't reload when you save

- **Save the file.** Live reload runs on save, so with Auto Save off nothing happens until you press **Ctrl+S**.
  Turn on **File → Auto Save** if you like.
- **Your HTML needs a `<body>` tag.** The reload script is injected into the page's body; a fragment without one
  can load but never reload.
- **You opened the file directly** (`file:///…` in the address bar). Reloads only work on the server's address,
  like `http://127.0.0.1:5500/index.html`.

## 3. Port 5500 is already in use

If another Live Server, a dev server or another app holds port 5500, Live Server can't start. Close the other
window, or pick a different port in your settings:

```json
"liveServer.settings.port": 5501
```

Our guide to [fixing "port already in use"](/blog/fix-port-already-in-use) shows how to find and stop whatever is
holding the port.

## 4. The wrong folder is served

If your site is in a subfolder (like `public` or `src`), the server may start in the project root, and links break.
Set the folder Live Server serves:

```json
"liveServer.settings.root": "/public"
```

## 5. The browser doesn't open, or opens the wrong one

Choose the browser in settings (`liveServer.settings.CustomBrowser`) or open the address yourself. On Windows, also
allow VS Code through the firewall the first time it asks.

## 6. It works on your computer but not on your phone

The server listens on your computer. Your phone must be on the same Wi-Fi, use your computer's local IP address
(like `http://192.168.1.20:5500`) instead of `127.0.0.1`, and your firewall must allow the port.

## 7. Changes to CSS reload the whole page

That's normal for the original extension. Some alternatives apply CSS changes instantly without a reload, which keeps
your scroll position and form inputs.

## 8. Try a maintained alternative

The original Live Server extension hasn't been updated in years, so some issues will never be fixed. Maintained
options:

- **[Veyra Live Server](/live-server)**: free, live reload on save, CSS changes applied without a reload, and the
  same **Go Live** button. Available for VS Code, and built into [Veyra Studio](/download).
- **Live Preview** by Microsoft: a preview inside VS Code.
- **Five Server**: an alternative with extras such as PHP support.

## Still stuck?

Open **View → Output**, choose the extension in the dropdown, and read the last error. It usually names the problem:
a port that's in use, a folder that doesn't exist, or a browser that couldn't start.
