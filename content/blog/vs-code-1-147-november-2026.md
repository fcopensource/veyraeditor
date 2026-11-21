---
title: VS Code 1.146 and 1.147: model routers, Send Later and agents in your browser
description: What changed in VS Code in November 2026: model routers, scheduled agent requests, browser control for agents, Skills over MCP on by default, and the local harness on its way out.
date: 2026-11-21
category: Tech News
readingTime: 5
keywords: VS Code 1.147, VS Code 1.146, VS Code November 2026, VS Code release notes, model router, Send Later, Skills over MCP, Copilot Fusion, VS Code update
---

Microsoft shipped two VS Code releases a week apart in November 2026: **1.146 on November 11** and **1.147 on November 18**. Almost everything new is about **agents**: how you queue work for them, which model does the work, and what they're allowed to touch. Here's what changed, and what's experimental.

## VS Code 1.147 (November 18)

- **Send Later** *(experimental)*: schedule an agent request to run later instead of now. It needs automations turned on and works for sessions on "This Computer".
- **Draft requests** *(experimental)*: keep several unsent requests in the Agents window and come back to them.
- **Model routers** *(experimental)*: VS Code picks a model for each task from the ones you prefer, using a small decision model to route.
- **Browser Use** *(preview)*: agents can drive your default browser, Chrome or Edge, to test what they built. It needs Node.js 22 or later.
- **Visual chat responses**: chat answers can include HTML previews (off by default) and native charts and mockups *(experimental)*.
- **Skills over MCP is on by default**: MCP servers can hand the model ready-made skills automatically. It was a preview in 1.146.
- For enterprises, admins can now permit Claude and Codex agents alongside managed settings.

Microsoft's own one-line summary: *"Have a task in mind but not ready to send it? This week, save requests as drafts or schedule them for later."*

## VS Code 1.146 (November 11)

- **Inbox mode** *(experimental)* groups the agent sessions that need your attention (`sessions.list.inboxEnabled`, off by default).
- **Model comparison** *(preview)* runs the same task on several models side by side, now with Copilot Fusion support.
- **Chat windows** *(preview)* can be arranged next to your editors and terminals.
- **Continue a Copilot CLI session in VS Code** with `/code` *(experimental, Copilot CLI 1.0.107 or later)*.
- **Mermaid 12** support for diagrams in Markdown.

## The change to plan for: the local harness is going away

1.146 **deprecated the local harness**, and the release notes are blunt: *"Local harness is deprecated and will be removed in three months (February 2027)."* If your team's tooling or extensions rely on it, now is the time to move. 1.147 also deprecates **macOS Ventura and Sonoma**.

## What it means for you

VS Code is turning into a control room for coding agents. That's great if you want agents to work while you're away, and a lot of new surface area if you don't. Many of these features are **experimental** and off by default, so nothing changes until you opt in.

If you'd rather have a fast, quiet editor without the agent layer, that's exactly what [Veyra Studio](/download) is: the same Monaco editor and shortcuts as VS Code, Git and a real terminal built in, at a tenth of the download size, with **no AI and no telemetry**. And if you're staying on VS Code, our [free extensions](/extensions) work there.

## Sources

- [Visual Studio Code 1.147 release notes](https://code.visualstudio.com/updates/v1_147)
- [Visual Studio Code 1.146 release notes](https://code.visualstudio.com/updates/v1_146)
