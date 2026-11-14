# Launching Veyra Rewind

Ready-to-post drafts. Post them on different days (Hacker News first, Reddit the next day, dev.to that week), reply to
every comment in the first two hours, and link straight to the Marketplace page:
https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind

Demo GIF to attach where images are allowed: `extensions/rewind/media/readme/demo.gif`

---

## Hacker News (Show HN)

Post on a weekday morning US Eastern time. Title and the link go in the form; the text goes in the first comment.

**Title:** Show HN: Rewind – local file history for VS Code, with search across deleted code

**URL:** https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind

**First comment:**

> I kept losing code in the gap between Ctrl+Z and git: a function I deleted before lunch, an experiment I reverted
> too eagerly, a file I never committed. VS Code's Timeline helps a little, but you can't search it, and you can't ask
> "where did that code go?" across a project.
>
> Rewind snapshots a file when you open it, on every save, and while you type (at most every 30 s). Snapshots are
> gzipped and stored once by SHA-256, so unchanged text costs nothing, and history thins with age: everything from
> today, one per 10 minutes for a week, one per hour up to 30 days. Named checkpoints are kept forever.
>
> The part I use most is Find Deleted Code: type what you remember and it searches every snapshot of every file,
> listing only lines that are no longer in the file. The diff is a Myers implementation with prefix/suffix trimming,
> so scrubbing a long file stays fast.
>
> It's 68 KB, makes no network requests, has no account, and is MIT licensed. Source:
> https://github.com/fcopensource/veyraeditor/tree/main/extensions/rewind
>
> I'd love feedback on the thinning policy and on what you'd want next (per-folder history? a timeline for renames?).

---

## Reddit: r/vscode

Read the subreddit rules first (self-promotion is allowed as long as you take part in the discussion). Attach the GIF.

**Title:** I made a free extension that lets you scrub through every version of a file and find code you deleted

**Body:**

> Hi r/vscode! I kept losing code between Ctrl+Z and my last commit, so I built **Rewind**.
>
> - It quietly keeps a snapshot when you open, save, or pause typing
> - Drag a timeline (or press ← →) to see the file at any moment, or hit Play to watch it evolve
> - **Find Deleted Code**: search for something you remember, across every file's history
> - Restore a whole version (Ctrl+Z undoes it) or revert one block in the diff editor
> - Bring back deleted files, and name checkpoints like "before the refactor"
>
> Everything stays on your machine: no account, no telemetry, 68 KB. Free and MIT.
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind
>
> What would make this more useful for you?

Also worth posting (with their rules in mind): r/programming (only as a technical write-up, not an ad),
r/webdev ("Showoff Saturday" thread), r/coolgithubprojects.

---

## dev.to article

**Title:** The code you deleted before lunch is still recoverable (if your editor kept it)

**Tags:** vscode, productivity, opensource, git

**Cover image:** the demo GIF

> Every developer has done it: you clean up a function, keep going, and two hours later realise you need the old
> version. Ctrl+Z doesn't reach that far, and git never saw it because you hadn't committed.
>
> ## The gap between undo and git
>
> Undo history disappears when you close a file. Git only knows what you commit. Everything in between, the
> experiments, the half-refactors, the "I'll just delete this", lives nowhere.
>
> ## What I built
>
> Rewind is a free VS Code extension that keeps a local history of every file you work on and makes it easy to use:
>
> 1. **A timeline you can scrub.** Every save and every pause in typing is a point on it.
> 2. **Play.** Watch a file evolve step by step, which is great for "when did this break?".
> 3. **Find Deleted Code.** Search for text that existed in any file's history but isn't there now.
> 4. **Restore anything,** a whole version or one block, and bring back deleted files.
>
> ## Keeping it small
>
> Snapshots are compressed, identical content is stored only once, and older history is thinned out automatically,
> so history stays small. **Rewind: Show History Storage** tells you exactly how much space it uses. Nothing leaves
> your machine.
>
> ## Try it
>
> Install **Veyra Rewind** from the VS Code Marketplace, edit a file for a while, then press **Ctrl+Alt+Z**.
> https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind
>
> It's open source (MIT): https://github.com/fcopensource/veyraeditor/tree/main/extensions/rewind

---

## X (Twitter) thread

> 1/ You deleted a function an hour ago. Git never saw it. Ctrl+Z can't reach it.
>
> I built a free VS Code extension for exactly that moment. 🧵 [GIF]
>
> 2/ Rewind keeps every version of every file, without commits: on open, on save, and while you type.
>
> 3/ Drag the timeline to any moment. Press Play to watch the file evolve. Restore a version, or one block.
>
> 4/ My favourite part: Find Deleted Code. Type what you remember, and it searches your whole history for code that's
> gone.
>
> 5/ 68 KB, offline, no account, no telemetry. Free and open source.
> https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind

---

## LinkedIn

> We just shipped **Veyra Rewind**, a free VS Code extension that gives every file a time machine.
>
> It keeps a private, local history of your code between commits: scrub a timeline to any moment, play back how a
> file evolved, find code you deleted, restore deleted files, and name checkpoints before big changes.
>
> Built by the Veyra team as part of our free developer tools. No account, no telemetry, open source.
>
> 👉 https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-rewind
>
> #vscode #developertools #opensource #productivity
