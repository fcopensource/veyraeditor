# Changelog

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
