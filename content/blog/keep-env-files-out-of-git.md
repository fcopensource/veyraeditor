---
title: How to keep .env files out of git (and what to do if you already committed one)
description: The .gitignore lines that work, how to check them, how to stop tracking a committed .env without deleting it, why you must rotate the secrets, and how to keep .env.example in sync.
date: 2026-10-22
category: Guides
readingTime: 7
keywords: .env gitignore, committed .env file, remove .env from git, git rm cached, .env.example, dotenv, leaked secrets git, environment variables
---

A `.env` file holds your app's secrets: database passwords, API keys, tokens. It must never be committed. Yet it happens all the time: a new project without a `.gitignore`, a `git add .` in a hurry, a `.env.production` nobody thought to ignore.

Here's how to make sure it doesn't happen to you, and what to do if it already has.

## The .gitignore lines that work

Add these to the `.gitignore` at the root of your repository:

```gitignore
# Env files with secrets
.env
.env.*
!.env.example
```

- `.env` matches a `.env` file in **any** folder, because the pattern has no slash.
- `.env.*` matches `.env.local`, `.env.production` and the rest.
- `!.env.example` brings back the template, which you **do** want to commit.

A pattern that starts with `/`, like `/.env`, only matches the root folder. In a monorepo, `apps/web/.env` would slip through.

## Check that git really ignores it

Don't guess, ask git:

```bash
git check-ignore -v .env apps/web/.env.local
```

It prints the `.gitignore` line that ignores each file. If a file prints nothing, git would commit it.

## Already committed? Stop tracking it

`.gitignore` only affects files git isn't tracking yet. If `.env` was committed once, git keeps tracking it. Remove it from git without deleting it from your disk:

```bash
git rm --cached .env
git commit -m "Stop tracking .env"
```

`--cached` is the important part: it removes the file from the repository, not from your computer.

## Then change every secret in it

This step is the one people skip, and it's the one that matters. **Once a secret has been pushed, treat it as public.** It's in the git history, in every clone, and possibly in a CI log or a fork. Removing the file doesn't remove the history.

So, for each value in the committed file:

1. Create a new key or password at the provider (Stripe, AWS, your database…).
2. Put the new one in your `.env` and wherever your app runs.
3. Revoke the old one.

You can rewrite history with a tool like `git filter-repo` to remove the file from old commits. That helps against casual browsing, but it doesn't un-leak a secret anyone may already have copied. Rotate first.

## Keep a .env.example

Your teammates still need to know which variables the app expects. That's what `.env.example` is for: the same names, without the values.

```bash
# .env.example — copy to .env and fill in
DATABASE_URL=
STRIPE_SECRET_KEY=
PORT=3000
```

Commit it, and update it every time you add a variable. When someone's app crashes with "STRIPE_SECRET_KEY is undefined", the example tells them what's missing.

## Let your editor watch for you

Remembering all this by hand is the problem. We built **[Veyra Env](/env)**, a free VS Code extension, so you don't have to:

- **A warning** when a `.env` file with values isn't ignored by git (it asks git itself, so every `.gitignore` rule counts), and an **error** when one is already committed, with one-click fixes for both.
- **Secrets hidden on screen** until you put the cursor on their line, so screen sharing and demos are safe.
- **`.env.example` in sync:** it adds new variable names, never their values.
- **Missing-variable warnings** when your code reads `process.env.STRIPE_SECRET_KEY` (or `os.getenv("…")`) and no `.env` file sets it.

## The short version

1. Ignore `.env` and `.env.*` (but not `.env.example`) in `.gitignore`.
2. Check with `git check-ignore -v`.
3. If one was committed, run `git rm --cached`, and **rotate every secret in it**.
4. Keep `.env.example` up to date.
