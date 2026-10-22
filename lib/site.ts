/* Single source of truth for names, URLs and copy used in metadata, structured data and the sitemap. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://veyraeditor.com").replace(/\/$/, "");
export const SITE_NAME = "Veyra";
export const PRODUCT_NAME = "Veyra Studio";
export const ALT_NAMES = ["Veyra Studio", "Veyra Editor", "Veyra Code Editor", "veyraeditor"];
export const GITHUB_URL = "https://github.com/fcopensource/veyraeditor";
/** Veyra Studio in the Microsoft Store: signed and trusted by Windows, no SmartScreen warning. */
export const MS_STORE_URL = "https://apps.microsoft.com/detail/XP8LKHC447THM1";
/** Veyra PDF for Windows: the installer is hosted on downloads.veyraeditor.com. */
export const PDF_VERSION = "1.0.0";
export const PDF_DOWNLOAD_URL = `https://downloads.veyraeditor.com/Veyra.PDF_${PDF_VERSION}_x64-setup.exe`;
/**
 * Veyra extensions for VS Code that are installed from a .vsix on GitHub until they are on the Visual Studio
 * Marketplace. Once an extension is live there, set listed: true and its page links to the Marketplace.
 */
export const VSCODE_EXTENSIONS = {
  apiClient: { id: "flightcoders.veyra-api-client", folder: "api-client", file: "veyra-api-client", version: "1.0.0", listed: false },
  env: { id: "flightcoders.veyra-env", folder: "env", file: "veyra-env", version: "1.0.0", listed: false },
  docker: { id: "flightcoders.veyra-docker", folder: "docker", file: "veyra-docker", version: "1.0.0", listed: false },
  mcpStudio: { id: "flightcoders.veyra-mcp-studio", folder: "mcp-studio", file: "veyra-mcp-studio", version: "1.0.0", listed: false },
  npmIntelliSense: { id: "flightcoders.veyra-npm-intellisense", folder: "npm-intellisense", file: "veyra-npm-intellisense", version: "1.0.1", listed: false },
} as const;
export const marketplaceUrl = (id: string) => `https://marketplace.visualstudio.com/items?itemName=${id}`;
export const vsixUrl = (ext: { folder: string; file: string; version: string }) =>
  `https://github.com/fcopensource/veyraeditor/raw/main/extensions/${ext.folder}/release/${ext.file}-${ext.version}.vsix`;
/** Other official places Veyra lives: they tell search engines these all belong to one brand. */
export const SAME_AS = [
  GITHUB_URL,
  MS_STORE_URL,
  "https://marketplace.visualstudio.com/publishers/flightcoders",
  "https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server",
  "https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-port-manager",
  "https://github.com/fcopensource/salesforce-studio-releases",
];
/** The site-wide social preview image (app/opengraph-image.tsx), for pages that set their own openGraph. */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Veyra: the fast, local-first AI code editor" };
export const TAGLINE = "The fast, local-first AI code editor";
export const DESCRIPTION =
  "Veyra is a free, open-source AI code editor for Windows, macOS and Linux. Fast and local-first, with Git, a real terminal, IntelliSense and Veyra AI built in.";
export const KEYWORDS = [
  "Veyra", "Veyra Studio", "Veyra editor", "Veyra code editor", "AI code editor", "free code editor",
  "open source code editor", "VS Code alternative", "Cursor alternative", "local-first editor",
  "code editor for Windows", "code editor for Mac", "code editor for Linux", "Tauri editor", "Rust code editor",
];

export const absolute = (path = "/") => SITE_URL + (path.startsWith("/") ? path : "/" + path);

/** Serialises JSON-LD safely for a <script> tag (no closing-tag injection). */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export type QA = { q: string; a: string };

/** Grouped questions for /faq (with FAQPage structured data). The home page shows the first group. */
export const FAQ_GROUPS: { title: string; items: QA[] }[] = [
  { title: "General", items: [
    { q: "What is Veyra?", a: "Veyra (Veyra Studio) is a free, open-source desktop code editor with AI built in. It combines the Monaco editor that powers VS Code with real IntelliSense, Git, a terminal and an AI assistant powered by Veyra AI: sign in with a free Veyra account, no API key needed." },
    { q: "Is Veyra free?", a: "Yes. Veyra is free to download and use, and its source code is on GitHub under the MIT license. Veyra AI needs a free Veyra account, and each account gets 10 free Veyra AI requests." },
    { q: "Which operating systems does Veyra support?", a: "Windows 10 and 11, macOS 11 or newer on Apple silicon and Intel, and 64-bit Linux (AppImage, .deb and .rpm). Installed copies update themselves automatically." },
    { q: "How is Veyra different from VS Code or Cursor?", a: "Veyra is local-first and lightweight: installers are 7–11 MB on Windows, macOS and Linux .deb/.rpm (the self-contained AppImage is larger) because it uses a native Rust backend and your system's web view instead of bundling a browser. AI is optional and under your control: Veyra AI works with a free account and no API key, you see exactly what context is sent, and you approve every AI edit as a diff." },
    { q: "Do I need an account?", a: "No. The editor works without an account. A free account on veyraeditor.com is optional; you need one to use Veyra AI, and it also gives you quick access to downloads and product news." },
  ]},
  { title: "Languages & extensions", items: [
    { q: "Which programming languages does Veyra support?", a: "Syntax highlighting covers more than 80 languages, and Veyra AI can help with code in any of them. JavaScript, TypeScript, Node.js, React, Vue, Svelte, HTML, CSS, Tailwind and Python get full IntelliSense through one-click language tools: real errors as you type, auto-imports, go to definition and rename. Rust, Go and C/C++ language servers are next on the roadmap." },
    { q: "Does Veyra support ESLint and Prettier?", a: "Yes. Since version 0.5, ESLint and Prettier install with one click from Extensions → Web development and use your project's own configuration. Format on save is available in Settings." },
    { q: "Can I install VS Code extensions?", a: "Veyra browses the Open VSX marketplace with real icons, ratings and a full page for every extension (README, features, changelog and versions), and installs themes and snippets from it or from VSIX files. Popular extensions such as ESLint, Prettier, Tailwind CSS, Volar, Svelte, Live Server, Python Debugger and Claude Code install Veyra's built-in equivalent. Extensions that run their own code need a VS Code extension host, which is on the roadmap." },
    { q: "Can I debug code in Veyra?", a: "Yes, Python today. Since version 0.7, Veyra has a built-in debugger like VS Code's: click beside a line number to set a breakpoint, press F5, then step through your code (F10, F11), inspect variables, add watch expressions and evaluate code in the Debug Console. It needs Python 3.8 or newer. Node.js debugging is next." },
    { q: "Does Veyra have Live Server?", a: "Yes, built in since version 0.8. Click Go Live in the status bar, right-click an HTML file and choose Open with Live Server, or press Alt+L Alt+O. Veyra serves your folder at http://127.0.0.1:5500 and reloads the browser when you save; CSS changes apply without a reload. No Node.js or extension needed. The same Live Server is also a free VS Code extension: search for Veyra Live Server in VS Code's Extensions view, or install flightcoders.veyra-live-server from the Visual Studio Marketplace." },
    { q: "Does Veyra work with Claude Code?", a: "Yes. Open Extensions → Claude Code and click Install: Veyra runs Anthropic's official installer in its terminal, then opens Claude Code in your project with one click. Claude Code needs a Claude Pro, Max, Team, Enterprise or Console account." },
    { q: "Do language tools need Node.js?", a: "Yes. The web language tools run on Node.js 18 or newer installed on your computer. They are stored in Veyra's own app folder, not in your project." },
  ]},
  { title: "AI & privacy", items: [
    { q: "Do I need an API key for AI?", a: "No. Veyra AI is built in: sign in with your free Veyra account inside the app (open the AI panel with Ctrl+L, or ⌘L on macOS) and start asking. Each account gets 10 free Veyra AI requests in total, and a request that fails isn't counted." },
    { q: "Which AI does Veyra use?", a: "Veyra AI only. It runs through veyraeditor.com, which forwards your request to its AI provider. The provider's key stays on our server and never reaches the app, so there's nothing to set up beyond signing in." },
    { q: "Does Veyra send my code to the cloud?", a: "No. Your projects stay on your computer. Code is only sent to Veyra AI when you send a message, and only what you attach; Veyra shows exactly which files are included. It warns before sending files that look like secrets, and smart context never includes .env files, keys or gitignored files. Veyra has no telemetry." },
    { q: "Where is my Veyra sign-in stored?", a: "In a private file in Veyra's app data folder on your computer, never in your project. There are no API keys in the app. You can sign out anytime from the AI panel." },
  ]},
  { title: "Install & updates", items: [
    { q: "How do updates work?", a: "Veyra checks for new versions automatically. When one is ready, the Sign in button in the top-right corner turns into Update: click it, and Veyra installs the update and restarts. Updates are cryptographically signed and verified before installing, and Veyra asks before closing unsaved work. Help → Check for Updates checks right away." },
    { q: "Windows says \"Windows protected your PC\". Is Veyra safe?", a: "Yes. Install Veyra from the Microsoft Store to avoid the warning entirely: the Store version is verified by Microsoft and installs in one click. The installer downloaded directly from this site isn't signed with a Microsoft certificate yet, so SmartScreen may warn on first run; choose More info → Run anyway. Every release is built publicly on GitHub Actions from the open-source code." },
    { q: "macOS says the app is damaged. What do I do?", a: "Run xattr -cr \"/Applications/Veyra Studio.app\" once in Terminal, then open Veyra again. On newer versions, right-click the app and choose Open the first time." },
  ]},
];
export const FAQ: QA[] = FAQ_GROUPS[0].items;
