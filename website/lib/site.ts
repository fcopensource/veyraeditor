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
/** Veyra PDF in the Microsoft Store: signed, trusted by Windows, and updated automatically. */
export const PDF_STORE_URL = "https://apps.microsoft.com/detail/XP89HQ4DMX824K";
/** Salesforce Studio in the browser stores. The Chrome Web Store also serves Edge and Brave. */
export const SALESFORCE_CHROME_URL = "https://chromewebstore.google.com/detail/salesforce-studio/goeclmlgbldldpcdhddkdpkjpohghafn";
export const SALESFORCE_FIREFOX_URL = "https://addons.mozilla.org/firefox/addon/salesforce-studio/";
export const PDF_DOWNLOAD_URL = `https://downloads.veyraeditor.com/Veyra.PDF_${PDF_VERSION}_x64-setup.exe`;
/**
 * Veyra extensions for VS Code that are installed from a .vsix on GitHub until they are on the Visual Studio
 * Marketplace. Once an extension is live there, set listed: true and its page links to the Marketplace.
 */
export const VSCODE_EXTENSIONS = {
  pathIntelliSense: { id: "flightcoders.veyra-path-intellisense", folder: "path-intellisense", file: "veyra-path-intellisense", version: "1.0.0", listed: false },
  documentViewer: { id: "flightcoders.veyra-document-viewer", folder: "document-viewer", file: "veyra-document-viewer", version: "1.0.0", listed: true },
  gitGraph: { id: "flightcoders.veyra-git-graph", folder: "git-graph", file: "veyra-git-graph", version: "1.0.0", listed: true },
  errorLens: { id: "flightcoders.veyra-error-lens", folder: "error-lens", file: "veyra-error-lens", version: "1.0.0", listed: true },
  rewind: { id: "flightcoders.veyra-rewind", folder: "rewind", file: "veyra-rewind", version: "1.0.1", listed: true },
  todoTree: { id: "flightcoders.veyra-todo-tree", folder: "todo-tree", file: "veyra-todo-tree", version: "1.0.0", listed: true },
  autoRenameTag: { id: "flightcoders.veyra-auto-rename-tag", folder: "auto-rename-tag", file: "veyra-auto-rename-tag", version: "1.0.0", listed: true },
  pets: { id: "flightcoders.veyra-pets", folder: "pets", file: "veyra-pets", version: "1.0.0", listed: true },
  codesnap: { id: "flightcoders.veyra-codesnap", folder: "codesnap", file: "veyra-codesnap", version: "1.0.0", listed: true },
  codeGuard: { id: "flightcoders.veyra-code-guard", folder: "code-guard", file: "veyra-code-guard", version: "1.2.0", listed: true },
  wrapped: { id: "flightcoders.veyra-wrapped", folder: "wrapped", file: "veyra-wrapped", version: "1.0.0", listed: false },
  apiClient: { id: "flightcoders.veyra-api-client", folder: "api-client", file: "veyra-api-client", version: "1.0.0", listed: true },
  mongodb: { id: "flightcoders.veyra-mongodb", folder: "mongodb", file: "veyra-mongodb", version: "1.0.0", listed: true },
  env: { id: "flightcoders.veyra-env", folder: "env", file: "veyra-env", version: "1.0.0", listed: true },
  docker: { id: "flightcoders.veyra-docker", folder: "docker", file: "veyra-docker", version: "1.0.0", listed: true },
  mcpStudio: { id: "flightcoders.veyra-mcp-studio", folder: "mcp-studio", file: "veyra-mcp-studio", version: "1.0.0", listed: true },
  npmIntelliSense: { id: "flightcoders.veyra-npm-intellisense", folder: "npm-intellisense", file: "veyra-npm-intellisense", version: "1.0.0", listed: true },
} as const;
export const marketplaceUrl = (id: string) => `https://marketplace.visualstudio.com/items?itemName=${id}`;
export const vsixUrl = (ext: { folder: string; file: string; version: string }) =>
  `https://github.com/fcopensource/veyraeditor/raw/main/extensions/${ext.folder}/release/${ext.file}-${ext.version}.vsix`;
/** Other official places Veyra lives: they tell search engines these all belong to one brand. */
export const SAME_AS = [
  GITHUB_URL,
  MS_STORE_URL,
  PDF_STORE_URL,
  SALESFORCE_CHROME_URL,
  SALESFORCE_FIREFOX_URL,
  "https://marketplace.visualstudio.com/publishers/flightcoders",
  "https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server",
  "https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-port-manager",
  // Every extension marked listed above, so new ones are added here by themselves.
  ...Object.values(VSCODE_EXTENSIONS).filter(e => e.listed).map(e => marketplaceUrl(e.id)),
  "https://github.com/fcopensource/salesforce-studio-releases",
];
/** The site-wide social preview image (app/opengraph-image.tsx), for pages that set their own openGraph. */
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Veyra: the fast, local-first code editor" };
export const TAGLINE = "The lightweight VS Code alternative";
export const DESCRIPTION =
  "Veyra is a free, lightweight VS Code alternative that is light on memory. The same Monaco editor and shortcuts in a native Rust app, with Git, a terminal and Search Everywhere built in. No AI, no tracking.";
export const KEYWORDS = [
  "Veyra", "Veyra Studio", "Veyra editor", "Veyra code editor", "lightweight VS Code alternative",
  "VS Code alternative low memory", "low memory code editor", "code editor that uses less RAM", "lightweight code editor",
  "code editor without AI", "free code editor",
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
    { q: "What is Veyra?", a: "Veyra (Veyra Studio) is a free, open-source desktop code editor. It combines the Monaco editor that powers VS Code with real IntelliSense, Git, a terminal and Android Studio-style navigation: Search Everywhere, Recent Files, Recent Projects and a TODO window. It has no AI and no telemetry." },
    { q: "Is Veyra free?", a: "Yes. Veyra is free to download and use, and its source code is on GitHub under the MIT license. If you'd like to back the project, the ♡ Support button in the app is entirely optional." },
    { q: "Which operating systems does Veyra support?", a: "Windows 10 and 11, macOS 11 or newer on Apple silicon and Intel, and 64-bit Linux (AppImage, .deb and .rpm). Installed copies update themselves automatically." },
    { q: "How is Veyra different from VS Code or Cursor?", a: "Veyra is local-first and lightweight: installers are 7–11 MB on Windows, macOS and Linux .deb/.rpm (the self-contained AppImage is larger) because it uses a native Rust backend and your system's web view instead of bundling a browser. Unlike AI-first editors, Veyra has no AI built in and never sends your code anywhere." },
    { q: "Do I need an account?", a: "No. The editor works without an account. A free account on veyraeditor.com is optional and gives you quick access to downloads and product news." },
  ]},
  { title: "Languages & extensions", items: [
    { q: "Which programming languages does Veyra support?", a: "Syntax highlighting covers more than 80 languages. JavaScript, TypeScript, Node.js, React, Vue, Svelte, HTML, CSS, Tailwind and Python get full IntelliSense through one-click language tools: real errors as you type, auto-imports, go to definition and rename. Rust, Go and C/C++ language servers are next on the roadmap." },
    { q: "Does Veyra support ESLint and Prettier?", a: "Yes. Since version 0.5, ESLint and Prettier install with one click from Extensions → Web development and use your project's own configuration. Format on save is available in Settings." },
    { q: "Can I install VS Code extensions?", a: "Veyra browses the Open VSX marketplace with real icons, ratings and a full page for every extension (README, features, changelog and versions), and installs themes and snippets from it or from VSIX files. Popular extensions such as ESLint, Prettier, Tailwind CSS, Volar, Svelte, Live Server, Python Debugger and Claude Code install Veyra's built-in equivalent. Extensions that run their own code need a VS Code extension host, which is on the roadmap." },
    { q: "Can I debug code in Veyra?", a: "Yes, Python today. Since version 0.7, Veyra has a built-in debugger like VS Code's: click beside a line number to set a breakpoint, press F5, then step through your code (F10, F11), inspect variables, add watch expressions and evaluate code in the Debug Console. It needs Python 3.8 or newer. Node.js debugging is next." },
    { q: "Does Veyra have Live Server?", a: "Yes, built in since version 0.8. Click Go Live in the status bar, right-click an HTML file and choose Open with Live Server, or press Alt+L Alt+O. Veyra serves your folder at http://127.0.0.1:5500 and reloads the browser when you save; CSS changes apply without a reload. No Node.js or extension needed. The same Live Server is also a free VS Code extension: search for Veyra Live Server in VS Code's Extensions view, or install flightcoders.veyra-live-server from the Visual Studio Marketplace." },
    { q: "Does Veyra work with Claude Code?", a: "Yes. Open Extensions → Claude Code and click Install: Veyra runs Anthropic's official installer in its terminal, then opens Claude Code in your project with one click. Claude Code needs a Claude Pro, Max, Team, Enterprise or Console account." },
    { q: "Do language tools need Node.js?", a: "Yes. The web language tools run on Node.js 18 or newer installed on your computer. They are stored in Veyra's own app folder, not in your project." },
  ]},
  { title: "Privacy", items: [
    { q: "Does Veyra have AI?", a: "No. Since version 0.11, Veyra is a pure code editor with no AI features. If you want an AI assistant, you can still run your own command-line tools in Veyra's terminal." },
    { q: "Does Veyra send my code to the cloud?", a: "No. Your projects stay on your computer, and Veyra has no telemetry or tracking." },
    { q: "Where is my Veyra sign-in stored?", a: "In a private file in Veyra's app data folder on your computer, never in your project. Signing in is optional." },
  ]},
  { title: "Install & updates", items: [
    { q: "How do updates work?", a: "Veyra checks for new versions automatically. When one is ready, the Sign in button in the top-right corner turns into Update: click it, and Veyra installs the update and restarts. Updates are cryptographically signed and verified before installing, and Veyra asks before closing unsaved work. Help → Check for Updates checks right away." },
    { q: "Windows says \"Windows protected your PC\". Is Veyra safe?", a: "Yes. Install Veyra from the Microsoft Store to avoid the warning entirely: the Store version is verified by Microsoft and installs in one click. The installer downloaded directly from this site isn't signed with a Microsoft certificate yet, so SmartScreen may warn on first run; choose More info → Run anyway. Every release is built publicly on GitHub Actions from the open-source code." },
    { q: "macOS says the app is damaged. What do I do?", a: "Run xattr -cr \"/Applications/Veyra Studio.app\" once in Terminal, then open Veyra again. On newer versions, right-click the app and choose Open the first time." },
  ]},
];
export const FAQ: QA[] = FAQ_GROUPS[0].items;
