---
title: How Veyra keeps your secrets out of AI prompts
description: AI assistants that read your workspace can accidentally pick up .env files, private keys and tokens. Here's how Veyra prevents that, and what we learned from an independent security audit.
date: 2026-10-08
category: Security
readingTime: 7
---

A helpful AI assistant needs context: the code around your question. Many assistants find that context by searching your project. That raises an uncomfortable question: what stops the search from picking up your `.env` file, your SSH key or the API token in a config file, and sending it to an AI service?

In October 2026 an independent audit of Veyra raised exactly this question. It found no evidence of leaks, but no explicit protection either. Here's what we built in response.

## Three layers of protection

When you ask Veyra's assistant to explore your workspace, every candidate file passes three checks before it can be chosen.

### 1. Sensitive names are never picked

Veyra skips files and folders whose names mark them as secrets:

- **Hidden files and folders**, such as `.env`, `.env.local`, `.ssh/`, `.aws/`, `.npmrc` and `.git/`
- **Keys and certificates**: `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`, `.ppk`
- **SSH keys**: `id_rsa`, `id_ed25519` and friends
- **Credential files**: `credentials.json`, `secrets.yml`, anything with *secret* or *service-account* in its name
- **Infrastructure state**: `terraform.tfstate`, `*.tfvars`

### 2. Your .gitignore is respected

If Git ignores a file, Veyra's assistant ignores it too. Veyra asks Git directly (`git check-ignore`), so every rule in your `.gitignore` files applies, including the ones that keep build output and local configuration out of your repository.

### 3. Contents are checked for credentials

Secrets don't always live in obviously named files. Veyra scans the contents of each candidate for high-confidence credential formats and drops any file that contains one:

- private key blocks (`-----BEGIN … PRIVATE KEY-----`)
- AWS access key IDs, GitHub and npm tokens, Slack tokens
- OpenAI, Anthropic, Google and Stripe keys
- service-account JSON with an embedded private key

These patterns are deliberately specific. They catch real credentials without flagging ordinary code like `process.env.OPENAI_API_KEY`.

## When you attach a file yourself

Sometimes you really do want help with a configuration file. You can always attach the current file or a selection explicitly. If it looks sensitive, Veyra stops at the first **Send** and tells you exactly which file is involved and that it would go to Veyra AI. A second **Send** confirms it.

## Tested like it matters

We test this with deliberately "leaky" projects: a fake `.env`, an SSH key, a certificate and an API token hidden inside a source file. The test asserts that **zero bytes** of any secret appear in the context the assistant builds, while ordinary source files are still chosen. These tests run on every change, and a release can't be built unless they pass.

## The rest of the audit

The same audit led to several other improvements, all shipped in version 0.6.1:

- A strict **Content Security Policy** for the app, so injected scripts can't run.
- **Language tools installed without running third-party install scripts**, plus a patched dependency in one tool.
- **Automatic test and dependency gates** before every release.
- Clearer wording on our website about what is and isn't code-signed yet.

You can read the full write-up, finding by finding, in our [security overview](/security).

## Good habits still help

Veyra's protections are a safety net, not a replacement for good hygiene:

- Keep secrets in `.env` files or your system's credential store, never in source files.
- Add those files to `.gitignore`.
- Rotate any key that has ever been pasted into a chat, an issue or a commit.

Your code is yours. Veyra's job is to make sure it only goes where you send it.
