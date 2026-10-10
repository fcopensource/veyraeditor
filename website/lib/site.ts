/* Single source of truth for names, URLs and copy used in metadata, structured data and the sitemap. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://veyraeditor.com").replace(/\/$/, "");
export const SITE_NAME = "Veyra";
export const PRODUCT_NAME = "Veyra Studio";
export const ALT_NAMES = ["Veyra Studio", "Veyra Editor", "Veyra Code Editor", "veyraeditor"];
export const GITHUB_URL = "https://github.com/fcopensource/veyraeditor";
export const TAGLINE = "The fast, local-first AI code editor";
export const DESCRIPTION =
  "Veyra is a free, open-source AI code editor for Windows, macOS and Linux. Fast and local-first, with Git, a real terminal, IntelliSense and AI from Claude, OpenAI, Gemini or local Ollama models built in.";
export const KEYWORDS = [
  "Veyra", "Veyra Studio", "Veyra editor", "Veyra code editor", "AI code editor", "free code editor",
  "open source code editor", "VS Code alternative", "Cursor alternative", "local-first editor", "Ollama code editor",
  "code editor for Windows", "code editor for Mac", "code editor for Linux", "Tauri editor", "Rust code editor",
];

export const absolute = (path = "/") => SITE_URL + (path.startsWith("/") ? path : "/" + path);

/** Serialises JSON-LD safely for a <script> tag (no closing-tag injection). */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export type QA = { q: string; a: string };

/** Grouped questions for /faq (with FAQPage structured data). The home page shows the first group. */
export const FAQ_GROUPS: { title: string; items: QA[] }[] = [
  { title: "General", items: [
    { q: "What is Veyra?", a: "Veyra (Veyra Studio) is a free, open-source desktop code editor with AI built in. It combines the Monaco editor that powers VS Code with real IntelliSense, Git, a terminal and an AI assistant that can use local models through Ollama or cloud models such as Claude, OpenAI GPT and Google Gemini." },
    { q: "Is Veyra free?", a: "Yes. Veyra is free to download and use, and its source code is on GitHub under the MIT license. If you connect a cloud AI provider, that provider bills you directly for usage; local AI with Ollama costs nothing." },
    { q: "Which operating systems does Veyra support?", a: "Windows 10 and 11, macOS 11 or newer on Apple silicon and Intel, and 64-bit Linux (AppImage, .deb and .rpm). Installed copies update themselves automatically." },
    { q: "How is Veyra different from VS Code or Cursor?", a: "Veyra is local-first and lightweight: installers are about 10 MB because it uses a native Rust backend and your system's web view instead of bundling a browser. AI is optional and under your control: you choose any provider, including fully local models, see exactly what context is sent, and approve every AI edit as a diff." },
    { q: "Do I need an account?", a: "No. The editor works without an account. A free account on veyraeditor.com is optional and gives you quick access to downloads and product news." },
  ]},
  { title: "Languages & extensions", items: [
    { q: "Which programming languages does Veyra support?", a: "Syntax highlighting covers more than 80 languages, and AI inline completions work in all of them. JavaScript, TypeScript, Node.js, React, Vue, Svelte, HTML, CSS and Tailwind get full IntelliSense through one-click language tools: real errors as you type, auto-imports, go to definition and rename. Rust, Go and C/C++ language servers are next on the roadmap." },
    { q: "Does Veyra support ESLint and Prettier?", a: "Yes. Since version 0.5, ESLint and Prettier install with one click from Extensions → Web development and use your project's own configuration. Format on save is available in Settings." },
    { q: "Can I install VS Code extensions?", a: "Veyra installs themes and snippets from the Open VSX marketplace and from VSIX files. Popular web extensions such as ESLint, Prettier, Tailwind CSS, Volar and Svelte install Veyra's built-in equivalent. Extensions that run their own code need a VS Code extension host, which is on the roadmap." },
    { q: "Do language tools need Node.js?", a: "Yes. The web language tools run on Node.js 18 or newer installed on your computer. They are stored in Veyra's own app folder, not in your project." },
  ]},
  { title: "AI & privacy", items: [
    { q: "Which AI providers can I use?", a: "Ollama for fully local models, plus Claude (Anthropic), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek, xAI Grok, Together and any OpenAI-compatible API, using your own key." },
    { q: "Does Veyra send my code to the cloud?", a: "No. Your projects stay on your computer. Code is only sent to an AI provider when you ask the assistant something, and Veyra shows exactly which files are included. With Ollama nothing leaves your machine. Veyra has no telemetry." },
    { q: "Where are my API keys stored?", a: "In your operating system's secure credential store (Windows Credential Manager, macOS Keychain or the Linux secret service). Keys are never written to plain-text files and never sent to us." },
  ]},
  { title: "Install & updates", items: [
    { q: "How do updates work?", a: "Veyra checks for new versions automatically and shows a banner when one is ready. Updates are cryptographically signed and verified before installing, and never interrupt unsaved work." },
    { q: "Windows says \"Windows protected your PC\". Is Veyra safe?", a: "Preview builds are not yet signed with a Microsoft certificate, so SmartScreen shows this warning for new apps. Choose More info → Run anyway. Every release is built publicly on GitHub Actions from the open-source code." },
    { q: "macOS says the app is damaged. What do I do?", a: "Run xattr -cr \"/Applications/Veyra Studio.app\" once in Terminal, then open Veyra again. On newer versions, right-click the app and choose Open the first time." },
  ]},
];
export const FAQ: QA[] = FAQ_GROUPS[0].items;
