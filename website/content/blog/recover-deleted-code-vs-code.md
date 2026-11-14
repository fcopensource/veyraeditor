---
title: How to recover deleted code in VS Code (even if you never committed it)
description: Lost code or a deleted file in VS Code? Try Undo, Local History, the Trash and Git's safety nets, step by step, and how to never lose uncommitted work again.
date: 2026-11-14
category: Guides
readingTime: 7
keywords: recover deleted code vs code, vs code local history, restore deleted file vs code, undo after closing file vs code, recover uncommitted changes, vs code timeline, git reflog, lost code
---

You deleted a function, kept working, and an hour later you need it back. Or a file is simply gone. Don't panic, and
**don't start editing that file again yet**: the steps below go from the quickest to the most thorough.

## 1. Undo, if the file is still open

If the file has been open the whole time, its undo history is still there. Click into the editor and press
**Ctrl+Z** (**⌘Z** on macOS) until the code comes back. Undo history is lost when you close the file or VS Code,
so try this first.

## 2. VS Code's Local History (Timeline)

Since version 1.66, VS Code keeps a local history of files you **save** in it. To find it:

1. Open the file (or create an empty file with the same name and path if it was deleted).
2. In the **Explorer**, expand **Timeline** at the bottom.
3. Click an entry to compare it with the current file, then right-click it and choose **Restore Contents**.

You can also run **Local History: Find Entry to Restore** from the Command Palette (**Ctrl+Shift+P**) to search
the history of every file, including deleted ones.

Things to know:

- Only **saves** are recorded, not every keystroke, and only files edited in VS Code itself.
- By default it keeps **50 entries per file** and skips files over **256 KB**
  (`workbench.localHistory.maxFileEntries` and `workbench.localHistory.maxFileSize`).
- It can be turned off with `workbench.localHistory.enabled`, so check that setting if the Timeline is empty.

### Where Local History lives on disk

If VS Code itself won't open the history, the files are plain copies you can browse:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\Code\User\History` |
| macOS | `~/Library/Application Support/Code/User/History` |
| Linux | `~/.config/Code/User/History` |

Each subfolder is one file. Its `entries.json` names the original file, and the other files in the folder are saved
versions. Search them for a line you remember.

## 3. The Recycle Bin or Trash

When you delete a file from VS Code's Explorer, it goes to the system **Recycle Bin** (Windows) or **Trash**
(macOS, Linux) by default, not straight into oblivion. Open it and restore the file to its original place.

## 4. Git's safety nets

If the project uses Git:

- **Uncommitted changes to a tracked file** you discarded by mistake are usually gone from Git, but Local History
  (step 2) often still has them.
- **A deleted file that was committed**: `git checkout -- path/to/file` (or `git restore path/to/file`) brings back
  the last committed version.
- **A commit you lost with a reset or rebase**: `git reflog` lists where `HEAD` has been; `git reset --hard <entry>`
  or `git cherry-pick <entry>` brings it back.
- **Something you once staged with `git add`** but never committed: `git fsck --lost-found` writes "dangling"
  blobs to `.git/lost-found/other`, where you can search them.

## 5. Never lose uncommitted code again

The gap between Undo and Git is where code gets lost: experiments, deleted functions, files you never added.
Two habits close it:

1. **Commit small and often**, even on a scratch branch. A `wip` commit costs nothing.
2. **Keep a searchable history of every change.** [Veyra Rewind](/rewind) is a free VS Code extension that snapshots a
   file when you open it, every time you save, and while you type. You can scrub a timeline to any moment, play back
   how the file evolved, and use **Find Deleted Code** to search for text that was in any file but isn't there any
   more. It also brings back deleted files. Everything stays on your computer.

```text
Rewind: Find Deleted Code…  →  calculateTotal
  function calculateTotal(items) {      cart.js:12 · 2 h ago
```

## Quick checklist

- [ ] Still open? **Ctrl+Z**.
- [ ] **Timeline** in the Explorer, or **Local History: Find Entry to Restore**.
- [ ] The Local History folder on disk.
- [ ] Recycle Bin or Trash.
- [ ] `git restore`, `git reflog`, `git fsck --lost-found`.
- [ ] Next time: commit often, and install [Rewind](/rewind) so there's always a history to go back to.
