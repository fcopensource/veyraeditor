---
title: Salesforce Studio: edit LWC and Apex from any tab
description: A free browser extension that opens your Salesforce org's LWC, Apex, Aura and Visualforce in seconds, and saves them back with Ctrl+S.
date: 2026-10-16
category: Product
readingTime: 5
keywords: Salesforce Studio, Salesforce code editor, edit LWC in browser, Lightning Studio alternative, Apex editor, Salesforce Chrome extension, Salesforce Edge extension
---

Editing a Lightning web component shouldn't mean setting up a project, authorizing the CLI and waiting for a retrieve. Today we're releasing **[Salesforce Studio](/salesforce-studio)**, a free browser extension for Chrome and Microsoft Edge that opens your org's code in seconds, right where you already are: on a Salesforce tab.

> **Update:** Salesforce Studio is now in the [Chrome Web Store and Firefox Add-ons](/blog/salesforce-studio-chrome-firefox), so it installs in one click in Chrome, Edge, Brave and Firefox.

## One click from any Salesforce tab

Sign in to Salesforce as usual. Then, on any Lightning, Setup, Classic or Visualforce page, click the **Salesforce Studio** icon. Studio opens in its own window, like a desktop app, connected to that org. It works in production and sandboxes, and it uses the sign-in you already have: no OAuth app, no Consumer Key, no CLI.

Working in two orgs? Each one gets its own window. Click the icon again and that org's window comes to the front.

## Everything in your org, in seconds

The explorer follows the order Salesforce developers already know, with a count on each folder:

- Lightning Web Components
- Aura Components
- Apex Classes and Apex Triggers
- Visualforce Pages and Visualforce Components
- Lightning Message Channels

Every component loads at once, so you can search the whole org instantly. File-type icons tell HTML, CSS, JavaScript, XML and Apex apart at a glance, and only your org's own code is shown, not managed packages.

## Ctrl+S saves to the org

Studio's editor is Monaco, the editor behind VS Code, with LWC typings, Salesforce snippets, Apex keywords and formatting. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>S</kbd> on a Mac) and the open component is saved straight to your org:

- **Lightning web components, Aura and Visualforce** save in about a second.
- **Apex** deploys directly. In a sandbox no tests run. In production, Salesforce runs your local Apex tests for any Apex change, as it does for every tool.
- If Salesforce rejects a change, for example with an LWC compile error, the message appears in red in the console and your edit stays in the editor.

When you want more control, **Review changes** shows a diff of everything you edited, lets you validate first and choose the test level, and deploys several components together.

## Create components without boilerplate

**New** opens a short form for each type. A Lightning Web Component asks for its name, master label, whether it's exposed, optional CSS and SVG files, and its targets, such as App Page, Record Page or Flow Screen. Triggers ask for their object and events. Every form offers the API versions your org supports. **Deploy** creates the files and their metadata and saves them to the org in one step.

## Small things that add up

- A menu on every component: **Download as ZIP** with a `package.xml`, ready to deploy anywhere; **Copy name**; **Delete from org**, which asks first.
- **Quick Open** with <kbd>Ctrl</kbd>+<kbd>P</kbd> to jump to any file.
- A resizable explorer, and font size, word wrap and minimap in Settings.
- Drafts are kept in your browser, so closing a tab never loses work.

## Private by design

Salesforce Studio has no server, no account and no analytics. It talks only to your own Salesforce org, and to an AI service only if you set one up yourself. Your code, data and credentials never reach us. The [privacy policy](/salesforce-studio/privacy) has the details.

## Get it

Salesforce Studio is free. [Download it from the Salesforce Studio page](/salesforce-studio), load it in Chrome or Edge, and open any Salesforce tab. It's part of the Veyra family, alongside the [Veyra Studio](/download) code editor, [Veyra Live Server](/live-server) and [Veyra Port Manager](/port-manager).

*Salesforce Studio is an independent product and is not affiliated with or endorsed by Salesforce, Inc.*
