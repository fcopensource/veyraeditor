# Veyra Studio 0.3

A native macOS Tauri editor with a three-column coding workspace, dimensional SVG file/folder icons, integrated terminal, Open VSX themes/snippets, and a new multi-provider AI assistant. This release builds on the Explorer/Extensions source and adds a new AI implementation.

## AI assistant

Launch the built **Veyra Studio.app** (or run `npm run tauri dev`). **⌘L** toggles the right-hand AI panel. **⌘K** prepares an edit of selected code; you can also right-click a selection and choose **Edit selection with Veyra AI**.

- **Ollama:** install [Ollama](https://ollama.com), start it, and run `ollama pull qwen2.5-coder:3b`. Choose the downloaded model in the model selector. To add a model, run `ollama pull MODEL_NAME` in Terminal, then open **Model settings → Refresh models**. Local mode excludes Ollama cloud aliases. Veyra does not automatically install Ollama or models on a new machine.
- **OpenAI:** select OpenAI, enter your own API key under Model settings, and click **Connect provider**. Select an available text/chat model or enter its model ID.
- **OpenRouter:** connects with your OpenRouter API key and exposes models available through that provider. Model access, billing and routing depend on your account.
- **Compatible API:** enter a base URL such as `http://127.0.0.1:1234/v1` for a local server, or an HTTPS URL for a remote service. The server must implement `/models` and/or `/chat/completions` with text messages. You can enter a model ID manually when model discovery is unavailable.

API keys remain in the native process's memory for this session; quitting clears them. They are not written to browser storage or the project. Provider/model preferences persist. Chat history stays in memory and clears when switching provider, model, workspace, or starting a new chat. Requests only send the displayed conversation and the file/selection you explicitly attach. They do not index or upload the project automatically. Cloud requests go to the selected provider and may incur that provider's fees; a ChatGPT subscription does not supply API credentials.

**Ask** explains or suggests code. **Edit** requests a replacement for the attached file or selection. Click **Review proposed edit** for a diff, then **Apply edit** to update the buffer. **⌘Z** undoes it; **⌘S** saves it. A changed file/workspace blocks stale proposals. Incomplete model responses are rejected. AI does not execute commands or automatically write to disk.

This is a Cursor-inspired workflow, not full Cursor feature parity. Automatic inline AI completion, project-wide semantic indexing, autonomous multi-file agents, and general VS Code extension hosting are not implemented. Responses currently arrive as a complete message. Local context is limited to 24 KB of conversation content; cloud context to 96 KB. Requests time out after 3 minutes, with a Stop control to cancel.

The adapters follow the official [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Ollama Chat API](https://docs.ollama.com/api/chat), and [OpenRouter API](https://openrouter.ai/docs/api_reference/overview).

## Use extensions

1. Launch **Veyra Studio.app** or run `npm run tauri dev`.
2. Click **Extensions** (the package icon in the left activity bar).
3. Search the Themes or Snippets catalog and click **Install**.
4. For themes, open **Installed** and click **Apply** beside the theme you want (or use the **Editor theme** dropdown). An **Applied** label confirms your choice. Workspace colors change immediately, including the welcome screen, and the theme also applies to code files. For snippets, open a matching language file, type the snippet prefix and accept the suggestion. Control+Space opens suggestions manually.
5. Use **Installed** to disable, re-enable or uninstall an extension. **Install from VSIX** imports a downloaded package.

Installed contributions and your selected theme persist locally across app launches. Catalog search and downloads need internet access; installed themes and snippets work offline. Storage is held in this app's local WebView storage, separately from your project. If storage is full, remove an unused extension before installing another.

## Compatibility

This is a limited contribution loader, not a complete VS Code extension host. It imports JSON/JSONC color themes and VS Code snippets. Basic workspace colors (backgrounds, text, borders and accents) are mapped into Veyra. Monaco approximates TextMate token colors; the full VS Code workbench color system, semantic token rules, grammars, language servers, debuggers, commands, extension dependencies, icon packs, formatters and executable JavaScript extension code are not supported. Mixed packages load only their theme/snippet contributions. Unsupported packages show an error and are not installed. Themes using external plist token files are not supported.

The catalog is [Open VSX](https://open-vsx.org), not Microsoft's Visual Studio Marketplace. Availability differs. Imported contributions use the [VS Code contribution formats](https://code.visualstudio.com/api/references/contribution-points). Extensions retain their publishers' licenses. Veyra does not execute downloaded extension code. Downloads are limited to 16 MB and decoded JSON resources to 8 MB in total. No package archive is extracted into your project.

## Develop and build

Clone the repository into a local directory. Avoid cloud-offloaded source/build directories, which can stall dependency and compiler reads.

```sh
git clone https://github.com/fcopensource/veyraeditor.git
cd veyraeditor
npm ci
source "$HOME/.cargo/env"
npm run tauri dev
```

If port 1420 is busy, stop the previous Veyra development server in its terminal with Control+C first.

```sh
npm run build
npx playwright test
npm run tauri build -- --bundles app
```

The tests use port 1427 independently of the desktop dev server. `tests/registry.spec.ts` checks a real Open VSX download and requires network access; the other extension tests use deterministic packages to verify theme application, snippet insertion, persistence, disable/uninstall, VSIX import and unsupported-package handling.
