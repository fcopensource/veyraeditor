# Changelog

The section for each version becomes its GitHub release notes and the "What's new" text in the
in-app update prompt. Headings must be `## <version>`.

## 0.8.0

**Live Server, built in**
- Click **Go Live** in the status bar to serve your folder at `http://127.0.0.1:5500` and open it in your browser
- Save a file and the browser reloads; save a stylesheet and the new CSS applies without a reload
- Right-click an HTML file and choose **Open with Live Server**, or press Alt+L Alt+O (Alt+L Alt+C stops it)
- Nothing to install and no Node.js needed. The server only accepts connections from your own computer and never serves files outside your folder
- The "Live Server" and "Live Preview" VS Code extensions now point to the built-in Live Server

**Veyra Live Server for VS Code**
- The same Live Server is now a VS Code extension, so your project behaves the same in both editors. Download `veyra-live-server-1.0.0.vsix` below and choose **Install from VSIX** in VS Code

## 0.7.0

**Debugger (Python)**
- Run and Debug, like VS Code: click beside a line number (or press F9) to set a breakpoint and press F5
- Step over, into and out (F10, F11, Shift+F11), continue, restart and stop
- Variables, watch expressions and the call stack, plus a Debug Console to evaluate code while paused
- Breakpoints follow your edits and are remembered per project; your project's `.venv` is used automatically

**Python IntelliSense**
- Install **Python (Pyright)** from Extensions for errors as you type, completions, hover and go to definition

**Claude Code**
- Anthropic's Claude Code installs with its official installer and opens in your project's terminal with one click (Extensions → Claude Code)
- The "Python Debugger" and "Claude Code" VS Code extensions now install Veyra's built-in versions instead of showing an error

**Fixes**
- Extension pages are no longer partly covered by the editor's minimap

## 0.6.2

**Fixes**
- **Windows:** opening a folder no longer pops up terminal windows again and again. Git, GitHub and health checks now run silently in the background

**Veyra AI**
- Veyra AI can now be answered by OpenAI, Claude or any OpenAI-compatible provider, chosen on the server; it always appears as "Veyra AI" in the app

## 0.6.1

**Security & privacy** (from an independent audit)
- A strict Content Security Policy now protects the app: no inline or remote scripts, and network access from the interface only to the extension marketplace
- AI workspace context never includes secrets: `.env` files, SSH keys, certificates, credential files, anything your `.gitignore` excludes, or files containing API keys or tokens
- Attaching a file that looks like it contains secrets to a cloud AI now asks you to confirm before anything is sent
- Language tools install without running any package install scripts, and a vulnerable dependency in the Emmet tool (node-tar) is replaced with a patched version
- Every release now passes automated tests, builds and dependency audits before it is built

**Fixes**
- Find & Replace with regular expressions: `$1` followed by text (for example `$1px`) now keeps the matched group, like VS Code

## 0.6.0

**Extensions, redesigned**
- Real icons for every extension, with verified publishers, download counts and star ratings in a VS Code-style list
- Click any extension to open its page in a tab: README, features, changelog and every version, with Install, Uninstall, Disable, Reinstall, Update, Set Colour Theme and Install another version
- Each page says upfront whether the extension works in Veyra today
- The built-in web tools (TypeScript, ESLint, Prettier, Tailwind, Emmet, Svelte, Vue) have their own pages with status, restart and reinstall

**Veyra AI**
- New default AI provider: sign in with your free Veyra account and start chatting, with no API key needed
- See how many requests you have left today; sign out at any time

**Title bar**
- A new button in the top-right corner: Sign in, your name once signed in, and a glowing Update button when a new version is ready

## 0.5.1

**Fixes**
- **macOS and Linux:** installing language tools no longer fails with "env: node: No such file or directory". Veyra now reads your login shell's PATH (like VS Code), so Node.js from Homebrew, nvm, Volta, fnm or asdf is found even when Veyra is opened from the Dock or an app menu
- Tabs with the same file name now show just enough of the folder path to tell them apart (for example `app/src` and `lib/src`)

## 0.5.0

**Web development tools, one click to install** (Extensions → Discover → Web development)
- **TypeScript & JavaScript (Node.js):** full IntelliSense from your project's tsconfig and node_modules: real errors as you type, auto-imports, hover docs, go to definition, rename across files, quick fixes and organize imports
- **ESLint:** your project's lint rules as you type, with quick fixes
- **Prettier:** format with your project's Prettier and config; new **Format on save** setting
- **Tailwind CSS IntelliSense:** class completion, CSS previews on hover, colour swatches and linting
- **Emmet:** expand abbreviations like `ul>li*3` in HTML, JSX and CSS
- **Svelte** and **Vue (beta):** language support for components; `.vue` and `.svelte` files now open as their own languages

**Editor tabs, VS Code style**
- Slim tab strip with a thin accent line on the active tab; close buttons appear on hover, and unsaved files show a dot
- Many open files no longer show a chunky scrollbar: a thin overlay scrollbar appears on hover, the mouse wheel scrolls tabs sideways, and edge shadows show hidden tabs
- Middle-click to close, drag to reorder, and a right-click menu: Close Others, Close to the Right, Close Saved, Close All, Copy Path, Reveal in Explorer
- Files with the same name show their folder next to the name

**Extensions**
- The Open VSX marketplace now searches every category
- Popular VS Code web extensions (ESLint, Prettier, Tailwind CSS, Volar, Svelte) are marked **Built into Veyra** and install Veyra's built-in equivalent
- Extensions that need the VS Code extension host now explain that clearly instead of failing with a generic error

**Under the hood**
- A Language Server Protocol bridge, the same technology VS Code uses, ready for Rust, Go and C++ next
- Go to definition and references open the target file in a tab; renames and quick fixes that touch other files open them so the changes can be saved
- Tools need Node.js 18 or newer and are installed into Veyra's own app folder, never into your project

## 0.4.2

**Autocomplete everywhere**
- AI inline completions: grey ghost-text suggestions as you type, press Tab to accept. Uses the model chosen in AI Studio; on by default for local models (Ollama), and can be enabled for cloud models in Settings
- Python, Rust, Go, Java, C/C++, C#, PHP, Ruby, Kotlin, Swift, shell and SQL now suggest keywords, snippets (`def`, `fn main`, `iferr`, `sout`...) and words from your open files
- JavaScript and TypeScript IntelliSense now understands your whole project: imports, types and go-to-definition work across files that are not open
- Suggestions while typing in strings, snippet previews, parameter hints and Tab completion

## 0.4.1

**Smarter command palette**
- Fuzzy matching for files and commands, with matched letters highlighted
- Navigate with ↑/↓ and Enter; recently opened files and recently used commands come first
- Prefixes like VS Code: `>` commands, `:` go to line, `@` symbols in the editor, `?` help
- New commands: toggle sidebar, minimap, word wrap and theme, new terminal, go to line or symbol, source control, health monitor, close folder

**Search & replace across files**
- Match case, whole word and regular expressions
- Include and exclude files with globs such as `src/**/*.ts` or `*.test.ts`
- Results grouped by file with highlighted matches; collapse or dismiss files
- Replace in one file or across the whole workspace; `$1` groups work in regex mode
- Ctrl/⌘+Shift+F searches for the selected text

**Searchable settings**
- Font family, line height and ligatures, tab size and spaces, line numbers, whitespace, rulers, cursor style and animation, bracket guides, sticky scroll and Git change markers
- Auto save after a delay, or when you switch files or windows
- Terminal font size, and terminals follow the light theme

**Platform polish**
- macOS builds are now signed ad-hoc: open the app the first time with right-click → Open instead of seeing "damaged"
- Windows: "Reveal in File Explorer", terminals named after your shell (PowerShell), and Run Active File uses `python` with PowerShell quoting
- Shortcut labels show Ctrl on Windows and Linux, ⌘ on macOS
- Run Active File also supports `.ps1` and `.go`

## 0.4.0

- Installers for Windows, macOS (Apple silicon and Intel) and Linux, with signed automatic updates
- Git: gutter markers, explorer badges, side-by-side diffs, branches, sync, stash, amend and file history
- Health monitor with a live score and fix hints
- AI Studio: Anthropic, Gemini, Groq, Mistral, DeepSeek, xAI and Together, with API keys stored in the OS keychain
