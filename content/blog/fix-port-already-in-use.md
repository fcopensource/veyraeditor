---
title: How to fix "port 3000 is already in use" (EADDRINUSE)
description: EADDRINUSE means another program still holds the port. Find it and free it in seconds on Windows, macOS and Linux, or run your dev server on another port.
date: 2026-10-13
category: Guides
readingTime: 6
keywords: port 3000 already in use, EADDRINUSE, address already in use, kill process on port, free a port, netstat, lsof
---

You run `npm run dev` and instead of your app you get this:

```
Error: listen EADDRINUSE: address already in use :::3000
```

Only one program can listen on a port at a time. Something on your computer is still using port 3000, so your dev server can't start there. This guide shows how to find that program and stop it, on every operating system, plus how to avoid the problem next time.

## Why it happens

The usual culprits are:

- **A dev server that didn't shut down.** You closed the terminal tab or the editor, but the Node.js, Python or Java process kept running in the background.
- **A crashed run.** The process died in a way that left a child process still holding the port.
- **Another project.** A second app, a Docker container or a database is using the same port.
- **Two terminals.** You started the same project twice.

Ports 3000, 5173, 8000, 8080 and 5432 are the ones that collide most, because so many tools use them by default.

## Free the port on Windows

Open **Command Prompt** or **PowerShell** and find the process ID (PID) that owns the port:

```
netstat -ano | findstr :3000
```

The last column of the `LISTENING` line is the PID, for example `18244`. Check what it is, then stop it:

```
tasklist /FI "PID eq 18244"
taskkill /PID 18244 /F
```

In PowerShell you can do the same in one line:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## Free the port on macOS

Open **Terminal** and ask which process is listening:

```
lsof -i :3000
```

The `PID` column tells you the process. Stop it gently first, and force it only if it doesn't exit:

```
kill 18244
kill -9 18244
```

To stop whatever holds the port in one step:

```
kill $(lsof -ti :3000)
```

## Free the port on Linux

`lsof` works on most distributions too. If it isn't installed, use `ss`, which is:

```
ss -ltnp | grep :3000
```

The output ends with `pid=18244`. Stop it with `kill 18244`. On systems with `fuser`, this stops the process holding a TCP port directly:

```
fuser -k 3000/tcp
```

If the PID belongs to another user or a system service, you'll need `sudo`. Think twice before stopping something you didn't start.

## Or just use another port

Sometimes the right fix is to leave the other program alone and move:

| Tool | Command |
|---|---|
| Next.js | `npx next dev -p 3001` |
| Vite | `npx vite --port 5174` |
| Create React App and many Node apps | `PORT=3001 npm start` (macOS/Linux) or `set PORT=3001 && npm start` (Windows) |
| Django | `python manage.py runserver 8001` |
| Flask | `flask run --port 5001` |

Next.js and Vite already try the next free port on their own, which is why you sometimes see your app on `3001` without asking for it. In Vite, `--strictPort` turns that off when you need a fixed port.

## The faster way: Veyra Port Manager

Looking up PIDs gets old fast. [Veyra Port Manager](/port-manager) is a free VS Code extension that shows every port in use and the program behind it: *Next.js on 3000*, *Vite on 5173*, *PostgreSQL on 5432*, with the command line and the folder each one runs from.

- Run **Veyra Ports: Free a Port…** (<kbd>Alt</kbd>+<kbd>P</kbd> <kbd>Alt</kbd>+<kbd>F</kbd>), type `3000`, and stop what holds it.
- Servers started from your open folder are grouped at the top, so you can tell your own dev server from everything else.
- System services, other users' programs and code editors are never offered for stopping, and every stop asks first.

It works the same on Windows, macOS and Linux, and needs no admin rights.

## Stop it happening again

- **Stop servers with Ctrl+C** in their terminal before closing it. Closing the window doesn't always end child processes.
- **Give each project its own port** in its config, so two projects never collide.
- **Check before you start:** a quick look at [Port Manager](/port-manager) or `lsof -i :3000` saves a confusing error.

With the port free, `npm run dev` starts cleanly again.
