---
title: Claude in November 2026: Fable 5.2, Claude Meetings and self-hosted agents
description: Anthropic's November 2026 for developers: Claude Fable 5.2 at a lower price, Claude Meetings, Whiteboards and Sheets, self-hosted Claude Managed Agents and new API features.
date: 2026-11-21
category: Tech News
readingTime: 5
keywords: Claude Fable 5.2, Claude Mythos 5.2, Claude Meetings, Anthropic November 2026, Claude Managed Agents, Claude API pricing, claude-fable-5-2, Anthropic news
---

November has been a busy month at Anthropic. In two weeks it shipped a new model generation, a set of workplace tools and a self-hosted way to run Claude agents. Here's what developers need to know, straight from Anthropic's release notes.

## Claude Fable 5.2 and Mythos 5.2 (November 9)

Anthropic released **Claude Fable 5.2** (`claude-fable-5-2`) and **Claude Mythos 5.2** (`claude-mythos-5-2`). Mythos 5.2 is limited to verified organizations; Fable 5.2 is available to everyone on the API.

- **1M-token context window** and up to **128k output tokens**.
- **Adaptive thinking is always on**: the model decides how much to think for each request.
- **A lower price**: *"They cost $8 USD per MTok of input and $40 USD per MTok of output."* Fable 5.1 was $10 and $50, so that's a 20% cut.
- **Fast mode** for Fable 5.2 costs $16 / $80 per MTok and delivers up to **2.5× more output tokens per second**.

If you call Claude from your own code, moving to Fable 5.2 is mostly a model-ID change, and it's cheaper than what it replaces.

## Claude Meetings, Whiteboards and Sheets (November 10)

Anthropic brought Claude into the rest of the working day:

- **Claude Meetings** *(beta, Team and Enterprise)*: Claude joins your video calls, starting with Google Meet, and turns the discussion into plans and tasks. TechCrunch reports it won't join calls with external guests unless an admin allows it, and leaves if one joins.
- **Claude Whiteboards** and **Claude Sheets** *(beta, paid plans)* on web, desktop and mobile.
- **Claude Data**, formerly Claude Dashboards, is now generally available.

## Self-hosted Claude Managed Agents (November 12)

Managed Agents, Anthropic's hosted way to run Claude as an agent with its own sandbox, can now be **self-hosted**. It's aimed at companies that need agents to run inside their own infrastructure, and access is through your Anthropic account team.

## Smaller API changes worth knowing

- **Message threads** *(beta, Nov 2)*: the API keeps a conversation for you. A thread expires 5 minutes after its last request.
- **IP allowlisting** *(beta, Nov 5)*: up to 1,000 addresses or CIDR ranges per organization.
- **Text watermarking** now covers more models (Nov 3 and Nov 16).
- **Linked billing** *(beta, Nov 17)*: set a `billing_policy` on each request.

## What it means for you

Cheaper frontier models and agents that run on your own servers make Claude easier to justify in real products. If you're writing that code, you don't need an AI editor to do it: [Veyra Studio](/download) is a fast, free code editor with Git and a real terminal built in, and you can run any AI tool you like in its terminal, on your terms.

## Sources

- [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview) (Anthropic)
- [Anthropic launches Claude Meetings to turn workplace discussions into plans and tasks](https://techcrunch.com/2026/11/10/anthropic-launches-claude-meetings-to-turn-workplace-discussions-into-plans-and-tasks/) (TechCrunch)
