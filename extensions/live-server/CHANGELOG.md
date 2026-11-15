# Changelog

## 1.4.0

- **Keeps your place:** after a live reload the page comes back at the same scroll position
- **Browser console in VS Code:** `console.log`, warnings, errors and unhandled promise rejections from the page appear in the new **Veyra Live Server: Browser Console** output, with an error count in the status bar (`veyraLiveServer.browserConsole`, on by default)
- **Test on your phone:** **Share on Your Network** serves the page to phones and tablets on the same Wi-Fi and shows the address to open (`veyraLiveServer.shareOnNetwork`, off by default; asks before turning on)
- **API proxy:** forward paths such as `/api` to your backend, any method, with bodies streamed (`veyraLiveServer.proxy`)
- **Single-page apps:** routes like `/about` get the root `index.html` (`veyraLiveServer.spa`)
- **Smarter reloads:** only changes inside the served folder reload the page, and `veyraLiveServer.ignore` skips more (for example `**/*.log`)
- Changing any of these settings restarts Live Server right away

## 1.3.0

- **Quick menu:** click the port in the status bar for Open in Browser, Copy Address, Restart or Stop, so one click no longer stops the server by accident
- New commands: **Open in Browser**, **Copy Address** and **Restart Live Server** (shown in the Command Palette while Live Server runs)
- Changing the **port** or **root** setting restarts Live Server automatically
- **Videos and audio seek smoothly:** byte-range requests are supported, and large files stream instead of loading into memory
- Sturdier: a malformed request or a browser closing mid-download can no longer disturb the server
- A clear message, with a shortcut to Settings, when the folder to serve doesn't exist

## 1.2.0

- New Marketplace ID: **`flightcoders.veyra-live-server`** (the name `live-server` is already used on the Marketplace)
- **Remote development:** with Remote SSH, WSL, Dev Containers or GitHub Codespaces, Go Live opens the page in your local browser through VS Code's port forwarding
- **Go Live button** on HTML editor tabs
- The status bar shows "Starting…" while the server starts
- Works in Restricted Mode (untrusted workspaces): Live Server only reads and serves files
- New Marketplace page with screenshots

## 1.1.1

- Published on the Visual Studio Marketplace under the flightcoders publisher (extension ID `flightcoders.live-server`)

## 1.1.0

- New Veyra Live Server icon
- Product page: https://veyraeditor.com/live-server

## 1.0.0

- Live Server for VS Code, matching the one built into Veyra Studio
- Live reload on save; CSS changes are swapped in without a page reload
- Go Live / Port status bar button, Explorer and editor "Open with Live Server", Alt+L Alt+O and Alt+L Alt+C
- Settings for port, served subfolder and opening the browser
- Serves on 127.0.0.1 only and never outside the served folder
