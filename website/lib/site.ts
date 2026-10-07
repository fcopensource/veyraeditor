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

export const FAQ = [
  {
    q: "What is Veyra?",
    a: "Veyra (Veyra Studio) is a free, open-source desktop code editor with AI built in. It combines a Monaco-based editor with Git, a real terminal, project-wide IntelliSense and an AI assistant that can use local models through Ollama or cloud models such as Claude, OpenAI GPT and Google Gemini.",
  },
  {
    q: "Is Veyra free?",
    a: "Yes. Veyra is free to download and use, and its source code is available on GitHub under the MIT license. Cloud AI providers bill you directly for their API usage if you choose to connect one; local AI with Ollama costs nothing.",
  },
  {
    q: "Which operating systems does Veyra support?",
    a: "Veyra runs natively on Windows 10 and 11, macOS 11 or newer on both Apple silicon and Intel, and 64-bit Linux (AppImage, .deb and .rpm). Installed copies update themselves automatically.",
  },
  {
    q: "How is Veyra different from VS Code or Cursor?",
    a: "Veyra is local-first and lightweight: installers are about 7–11 MB because it uses a native Rust backend and your system's web view. AI is optional and under your control: you choose the provider, you see exactly what context is sent, and every AI edit is shown as a diff you approve.",
  },
  {
    q: "Does Veyra send my code to the cloud?",
    a: "No. Your projects stay on your computer. Code is only sent to an AI provider when you explicitly ask the assistant something and attach it, and with Ollama even that stays on your machine. Veyra has no telemetry.",
  },
  {
    q: "Which programming languages does Veyra support?",
    a: "Syntax highlighting covers more than 80 languages. JavaScript and TypeScript get full IntelliSense and error checking across your project; Python, Rust, Go, Java, C/C++, C#, PHP, Ruby and others get keyword and snippet completion, and AI inline completions work in every language.",
  },
];
