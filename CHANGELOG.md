# Changelog

The section for each version becomes its GitHub release notes and the "What's new" text in the
in-app update prompt. Headings must be `## <version>`.

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
