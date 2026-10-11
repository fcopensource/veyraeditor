---
title: Local AI coding with Ollama: private, free and offline
description: Run an AI coding assistant entirely on your own computer with Ollama and Veyra. Which models to choose, what hardware you need, and how to set it up in five minutes.
date: 2026-09-30
category: AI
readingTime: 6
---

Cloud AI is convenient, but every question you ask travels to someone else's server, along with the code you attach. For client work, proprietary code or simply peace of mind, you may want an assistant that never leaves your machine.

With **Ollama** and **Veyra**, you can have exactly that: an AI coding assistant that runs on your own computer, costs nothing per request and works offline.

## What is Ollama?

[Ollama](https://ollama.com) is a free app that downloads open-weight language models and runs them locally. It exposes a small API on `http://127.0.0.1:11434`, which Veyra talks to directly. Nothing is sent over the internet once a model is downloaded.

## Step 1: install Ollama

Download Ollama for Windows, macOS or Linux from [ollama.com](https://ollama.com) and install it. On Windows and macOS it runs in the background automatically. On Linux, start it with:

```bash
ollama serve
```

## Step 2: download a coding model

In a terminal (Veyra's built-in terminal works fine), pull a model:

```bash
ollama pull qwen2.5-coder:7b
```

Which model should you pick? A rough guide:

| Your computer | Good starting model | Notes |
|---|---|---|
| 8 GB RAM, no GPU | `qwen2.5-coder:1.5b` or `:3b` | Fast enough for explanations and small edits |
| 16 GB RAM or Apple silicon | `qwen2.5-coder:7b` | A good everyday balance |
| 32 GB+ RAM or a strong GPU | `qwen2.5-coder:14b` or larger | Noticeably better at multi-file reasoning |

Smaller models are faster and lighter; larger ones are smarter but slower. You can download several and switch between them in Veyra.

## Step 3: connect Veyra

1. Open the AI panel with **Ctrl+L** (**⌘L** on macOS).
2. Choose **Ollama · local** as the provider.
3. Pick your model from the list. Click **Refresh models** if you just downloaded it.

That's it. The panel shows **Connected**, and every request now stays on your machine. Veyra even refuses Ollama "cloud" model aliases in local mode, so attached code can't silently leave your computer.

## What to use it for

Local models shine at:

- **Explaining code**: "What does this function do, and where is it called from?"
- **Small, reviewed edits**: select code, press **Ctrl+K**, describe the change, and review the diff before applying it.
- **Writing tests and docs** for code you already understand.
- **Working offline**: on a plane, on a train, or behind a strict firewall.

For large refactors across many files, a bigger cloud model is usually stronger. Veyra makes switching easy: use local for everyday questions, and **Veyra AI** or your own cloud key when you need more horsepower.

## Tips for better answers

- **Attach the right context.** Choose *Current file* or *Selection* rather than asking about code the model can't see.
- **Keep chats focused.** Start a new chat for a new topic; small models lose track of long conversations.
- **Ask for one change at a time.** A single, clear request gives a cleaner diff.

## Privacy, by design

With Ollama, the whole loop runs on your computer: your prompt, your code and the model's answer. Combined with Veyra's lack of telemetry, this is about as private as AI-assisted coding gets.
