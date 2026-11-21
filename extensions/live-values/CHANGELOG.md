# Changelog

## 1.0.0

- console.log, info, debug, warn and error values at the end of the line that printed them, live as Node.js runs.
- Crashes (uncaught exceptions and unhandled rejections) marked in red at the line that threw.
- A count for lines that print many times, a chart of the numbers they print, and the full value and recent values on hover.
- The Live Values sidebar: every line that printed, by file. Click to jump there; copy or clear values.
- Run This File with Live Values for JavaScript and TypeScript, and a Live Values terminal for any command.
- Works in every VS Code terminal and in Node debug sessions. TypeScript values land on the .ts line when source maps exist.
- Each run starts clean, and values follow their lines while you edit.
- 100% local: a small Node hook writes to a file on your computer, and only your project's code is recorded.
