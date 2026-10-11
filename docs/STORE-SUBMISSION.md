# Publishing Veyra to the Microsoft Store and for macOS

Status, October 2026. Store rules change, so confirm each step in Partner Center / App Store Connect.

## Summary

| Channel | Recommendation | Blocker you must resolve |
|---|---|---|
| **Microsoft Store** | Submit the existing NSIS installer (EXE) as a Win32 app | A **code-signing certificate** trusted by Windows |
| **macOS** | **Developer ID signing + notarization**, keep distributing from veyraeditor.com | **Apple Developer Program** membership |
| **Mac App Store** | Not recommended for now (see below) | App Sandbox would break the terminal, Git, language tools and opening arbitrary folders |

---

## 1. Microsoft Store (Win32 EXE)

Microsoft accepts classic EXE/MSI installers. The Store lists the app and runs your installer, which stays
hosted on GitHub Releases.

### What Veyra already meets

- **Silent install:** the NSIS installer supports `/S`.
- **Versioned HTTPS installer URL:** `https://github.com/fcopensource/veyraeditor/releases/download/vX.Y.Z/Veyra.Studio_X.Y.Z_x64-setup.exe`
- **Auto-update:** the built-in signed updater.
- **Store icons:** `src-tauri/icons/StoreLogo.png` and the `Square*Logo.png` set.
- **Publisher differs from product name:** `Veyra` vs `Veyra Studio`.
- **Offline WebView2 installer:** `src-tauri/tauri.microsoftstore.conf.json`.

### What you need to do

1. **Partner Center account:** sign up at [partner.microsoft.com](https://partner.microsoft.com/dashboard) as an individual or company developer.
2. **Code-signing certificate.** Microsoft does not re-sign EXE/MSI installers. The installer and its executables must be signed with a certificate that chains to the Microsoft Trusted Root Program, and self-signed certificates are rejected. Options:
   - **Azure Trusted Signing**: Microsoft's own low-cost signing service, and the easiest to automate in CI.
   - An **OV or EV code-signing certificate** from a CA such as DigiCert, Sectigo or SSL.com.

   When you have one, tell the developer (or Claude) which option you chose: the release workflow needs a signing step, and the certificate details go into GitHub secrets, never into the repository.
3. **Build the Store installer** (Windows):

   ```bash
   npx tauri build --no-bundle
   npx tauri bundle --bundles nsis --config src-tauri/tauri.microsoftstore.conf.json
   ```

   The Store variant embeds the WebView2 runtime (larger, but installs without internet). Sign it, then upload it to a GitHub release.
4. **Partner Center:** Apps and games → New product → **EXE or MSI app** → reserve **Veyra Studio**. In *Packages*, paste the installer URL, set architecture **x64**, installer parameters **`/S`**, and choose that the app updates itself.
5. **Store listing:** paste the text below, add screenshots and submit for certification (usually a few business days).

---

## 2. macOS

### Recommended: Developer ID + notarization (outside the Mac App Store)

This removes the "app is damaged" and "unidentified developer" warnings, and keeps the terminal, Git, language
tools and auto-updates exactly as they are.

1. Join the **Apple Developer Program** at [developer.apple.com/programs](https://developer.apple.com/programs/).
2. In Certificates, Identifiers & Profiles, create a **Developer ID Application** certificate and export it as a `.p12`.
3. Add these GitHub repository secrets (Settings → Secrets and variables → Actions):
   `APPLE_CERTIFICATE` (base64 of the `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
   `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.
4. Uncomment the Apple lines in `.github/workflows/release.yml` (they're already there) and release as usual.
   The workflow signs and notarizes both macOS builds automatically.

### Why not the Mac App Store (for now)

The Mac App Store requires the **App Sandbox**. Inside it, an app can only read folders the user picks in a
system dialog, and every program it starts inherits the sandbox. For a code editor that means:

- the **terminal** couldn't run your normal shell with access to your projects and tools,
- **Git**, **Node.js language tools** and other command-line tools couldn't run normally,
- **reopening projects** would need security-scoped bookmarks for every folder,
- the **built-in updater** isn't allowed (the App Store updates apps itself).

This is why other full editors such as VS Code, Cursor and Zed distribute outside the Mac App Store. A sandboxed
"lite" edition would be possible later as a separate product, but it would be a reduced Veyra.

If you still want to try it: Tauri's [App Store guide](https://v2.tauri.app/distribute/app-store/) covers the
Mac App Store certificates, provisioning profile, entitlements (`com.apple.security.app-sandbox`), `.pkg`
packaging and upload with `xcrun altool`.

---

## Store listing (ready to paste)

**Name:** Veyra Studio

**Short description (≤ 100 characters):**
Fast, private AI code editor with Git, a terminal and real IntelliSense. Free and open source.

**Description:**

> Veyra Studio is a free, open-source code editor that's small, fast and private.
>
> Built on Monaco, the editing engine behind VS Code, Veyra feels familiar from the first keystroke: the same
> shortcuts, command palette, multi-cursor editing and IntelliSense. Around it, everything you need is built in:
>
> • Git: change markers, staging, commits, branches, diffs and history
> • A real terminal: PowerShell, bash or zsh, with several sessions
> • Language tools: TypeScript, JavaScript, Python, ESLint, Prettier, Tailwind CSS, Emmet, Svelte and Vue
> • Extensions: colour themes and snippets from the Open VSX marketplace
> • AI on your terms: Veyra AI, private local models with Ollama, or your own Claude, OpenAI or Gemini key
> • Every AI edit is shown as a diff you approve
>
> Private by design: no telemetry, your code stays on your computer, and secrets such as .env files and keys are
> never sent to AI automatically. The installer is about 7 MB, and Veyra keeps itself up to date.

**Category:** Developer tools · **Price:** Free · **Age rating:** 3+ / Everyone (no objectionable content; the AI
features generate text only when the user asks)

**Keywords:** code editor, AI code editor, IDE, programming, developer tools, Git, terminal, TypeScript, Python, open source

**Privacy policy URL:** https://veyraeditor.com/privacy · **Support URL:** https://github.com/fcopensource/veyraeditor/issues · **Website:** https://veyraeditor.com

**Screenshots** (1920×1080 or 1366×768 recommended, 4 to 6 of them):
1. Editor with a TypeScript project, file tree and Git markers
2. AI assistant panel proposing an edit as a diff
3. Extensions panel and an extension page
4. Integrated terminal
5. Source control with staged changes
6. Light theme or a popular colour theme
