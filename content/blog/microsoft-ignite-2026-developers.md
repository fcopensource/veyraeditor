---
title: Microsoft Ignite 2026 for developers: Code 2, Copilot on local models and agent sandboxes
description: The Ignite 2026 news that matters to developers: Code 2 coding models, GitHub Copilot on local models, protected workspaces for coding agents in Windows, and Windows Server 2028.
date: 2026-11-21
category: Tech News
readingTime: 6
keywords: Microsoft Ignite 2026, Code 2, Code 2 Flash, GitHub Copilot Fusion, Windows Server 2028, Microsoft-Decision-1.1, Copilot local models, agent security, Windows for developers
---

Microsoft Ignite 2026 ran **November 17–20** in San Francisco and online. Satya Nadella's keynote line was *"Copilot is the new OS for work"*, and most of the show was about AI agents at work. Underneath the business headlines there's a lot for developers: new coding models, Copilot that runs on your own PC, and Windows features built to keep coding agents in check. Here's the developer cut.

## New coding models: Code 2 and Code 2 Flash

Microsoft's agentic coding models **Code 2** and **Code 2 Flash** are **generally available in GitHub Copilot and in Microsoft Foundry**. Alongside them:

- **Microsoft-Decision-1.1** is GA, adding multimodal input. It's used to judge and route model output, and Microsoft says more than **4,000 customers** have used it.
- **Cyber 2 Flash** is described as Microsoft's *"most capable security model yet"*.
- **Cobalt 200** virtual machines are GA on Azure.

On the hardware side, Microsoft says its Maia 300 chip delivers *"40 percent more tokens per watt compared with leading GPU-based systems."*

## GitHub Copilot on your own PC

**GitHub Copilot Fusion Hybrid Intelligence** *(preview)* lets Copilot send coding work to **local models on developer PCs** instead of the cloud. For teams with strict data rules, or anyone on a slow connection, that's a meaningful change: some tasks never have to leave the machine.

## Keeping coding agents in a box

Coding agents run commands and edit files, so Windows is adding guard rails:

- **Process container improvements** *(preview)* give each agent its own protected workspace.
- **Local micro VMs** *(experimental)* go further, isolating an agent in a lightweight virtual machine.
- **Learning and permissive modes** are GA, to watch what an agent does before you lock it down.
- **Windows administrator protection** and the **Windows endpoint security platform** are GA, and **Windows baseline protection** is in preview for Windows Insiders.

## Windows Server 2028 and Windows 365

- **Windows Server 2028** is in **public preview**.
- **Windows 365 for Agents** is available as a computer-use tool in Copilot Studio, coming to Microsoft Foundry in preview early next year.
- Microsoft says **Direct Stream** improves connection reliability by *"nearly 300%"* compared with Windows 365 at launch, and that Windows Autopatch customers deploy updates *"over 40% faster"* than with on-premises management.

## What it means for you

The direction is clear: agents everywhere, with more of them running locally and inside sandboxes. If you build developer tools, expect customers to ask how your product behaves when an agent drives it. If you just want to write code in peace, a lightweight editor such as [Veyra Studio](/download), with no AI and no telemetry, stays out of all of it.

## Sources

- [Ignite 2026: Building the frontier ecosystem](https://blogs.microsoft.com/blog/2026/11/17/ignite-2026-building-the-frontier-ecosystem/) (Official Microsoft Blog)
- [Microsoft Ignite 2026: Building Windows for the next era of work](https://blogs.windows.com/windowsexperience/2026/11/17/microsoft-ignite-2026-building-windows-for-the-next-era-of-work/) (Windows Experience Blog)
- [Everything Microsoft announced at Ignite 2026](https://www.techrepublic.com/article/news-microsoft-ignite-2026-announcements/) (TechRepublic)
