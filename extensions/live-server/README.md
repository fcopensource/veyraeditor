<p align="center"><img src="https://raw.githubusercontent.com/fcopensource/veyraeditor/main/extensions/live-server/media/icon.png" width="112" alt="Veyra Live Server"></p>

# Veyra Live Server

**Save. See it. Instantly.**

A local development server with live reload, for VS Code and [Veyra Studio](https://veyraeditor.com).

Save an HTML or JavaScript file and the browser reloads. Save a stylesheet and the new CSS is swapped in **without a reload**, so the page keeps its scroll position and state.

The same Live Server is built into Veyra Studio, so a project behaves the same in both editors. Both share the same live-reload script.

## Use it

- Click **Go Live** in the status bar. The status bar then shows the port; click it again to stop.
- Right-click an HTML file in the Explorer or the editor and choose **Open with Live Server**.
- Keyboard: <kbd>Alt</kbd>+<kbd>L</kbd> <kbd>Alt</kbd>+<kbd>O</kbd> to open, <kbd>Alt</kbd>+<kbd>L</kbd> <kbd>Alt</kbd>+<kbd>C</kbd> to stop (<kbd>⌘</kbd>+<kbd>L</kbd> <kbd>⌘</kbd>+<kbd>O</kbd> / <kbd>⌘</kbd>+<kbd>C</kbd> on macOS).

Pages are served at `http://127.0.0.1:5500`, or the next free port if 5500 is busy. Folders without an `index.html` show a file listing.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `veyraLiveServer.port` | `5500` | Port to serve on. `0` picks any free port. |
| `veyraLiveServer.root` | `""` | Subfolder to serve, such as `/public` or `/dist`. |
| `veyraLiveServer.openBrowser` | `true` | Open the page in your default browser on start. |

## Privacy and safety

- The server listens on `127.0.0.1` only, so other devices on your network can't reach it.
- Only files inside the served folder are sent. Requests that try to leave it (`..`, encoded slashes, symbolic links pointing outside) get a 404.
- No telemetry and no runtime dependencies.

## Install

Download `veyra-live-server-<version>.vsix` from the [latest Veyra release](https://github.com/fcopensource/veyraeditor/releases/latest). Then in VS Code, open **Extensions → … → Install from VSIX…**, or run:

```bash
code --install-extension veyra-live-server-1.1.1.vsix
```

In Veyra Studio there's nothing to install: click **Go Live** in the status bar.

## Develop

```bash
cd extensions/live-server
npm ci
npm test          # compiles and runs the server tests
npm run package   # builds dist/live-server-<version>.vsix
```

Press <kbd>F5</kbd> in VS Code with this folder open to try it in an Extension Development Host.

## License

MIT
