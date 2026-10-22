---
title: Six free VS Code extensions from Veyra
description: An API client, MCP server manager, Docker dashboard, .env guard, MongoDB query lens and npm IntelliSense. Free, open source, no accounts.
date: 2026-10-21
category: Product
readingTime: 5
keywords: free VS Code extensions, VS Code API client, Postman alternative, MCP server VS Code, Docker VS Code extension, dotenv VS Code, MongoDB VS Code extension, npm IntelliSense
---

[Veyra Studio](/) is our code editor, but plenty of developers live in VS Code. So we've been building the tools we wanted there too. Each one does one job well. They're all free and MIT licensed, with no account and no telemetry.

## Veyra API Client

**Test any API without leaving VS Code.** Send REST and GraphQL requests, keep them in collections that live in your repo as plain JSON, and switch between Dev, Staging and Production in one click. Private values stay on your computer, and you can import from cURL and Postman.

A Postman alternative that your team shares through git, for free. [Learn more →](/api-client)

## Veyra MCP Studio

**Your MCP servers, all in one place.** MCP servers give AI assistants like Claude, Copilot and Cursor new abilities, and each app keeps them in its own JSON file. MCP Studio shows every server from VS Code, Claude Code, Claude Desktop, Cursor and Windsurf in one sidebar. You can:

- add popular ones from a catalog in two clicks;
- try any tool in an inspector, and see why a server fails in plain words;
- copy servers between apps.

[Learn more →](/mcp-studio)

## Veyra Container Studio for Docker

**Docker in VS Code, made easy.** Containers, images, volumes and Compose projects in one sidebar. Open live logs you can filter, open a shell in a container, and watch CPU and memory on a dashboard that also frees disk space in one click. **Compose Up** and **Build and Run** buttons sit right above your `compose.yaml` and `Dockerfile`, and the Dockerfile checks come with quick fixes. [Learn more →](/docker)

## Veyra Env

**Never ship a missing or leaked env variable again.** Your code is checked against your `.env` files as you type. Secrets are hidden on screen until you need them. You're warned when an env file isn't in `.gitignore`, and `.env.example` stays in sync. There's also a side-by-side compare of `.env`, `.env.local` and `.env.production`. [Learn more →](/env)

## Veyra Query Lens for MongoDB

**See how every MongoDB query performs, right above your code.** Query Lens runs `explain()` for the queries in your Node.js, Mongoose and Python code. It flags full collection scans and in-memory sorts, and creates the index that fixes them in one click. Index Doctor finds unused indexes, and a schema check compares your Mongoose models with real data. [Learn more →](/mongodb), or read [how to find slow MongoDB queries](/blog/find-slow-mongodb-queries).

## Veyra npm IntelliSense

**Every package, one keystroke away.** Autocomplete for imports with installed versions. Missing packages are caught and installed in one click, and unused dependencies are flagged before they bloat your install. [Learn more →](/npm-intellisense)

## And two more

- **[Veyra Live Server](/live-server)** reloads the browser as you save, with CSS applied without a reload.
- **[Veyra Port Manager](/port-manager)** shows every port in use and frees a busy one in a click.

See them all on the [Extensions page](/extensions). Found a bug or want a feature? [Open an issue on GitHub](https://github.com/fcopensource/veyraeditor/issues).
