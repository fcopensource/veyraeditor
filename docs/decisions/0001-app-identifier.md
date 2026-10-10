# 0001 · Application identifier

**Status:** Accepted, 11 October 2026 · **Audit item:** REL-09

## Context

The Tauri identifier is `com.veyra.extensionspreview`, left over from an early preview. It is valid, but the word
"preview" doesn't belong in a stable product's identity.

The identifier is not cosmetic. It decides:

| Depends on the identifier | Effect of changing it |
|---|---|
| App data folder (language tools, logs) | A new, empty folder: language tools must be reinstalled |
| WebView storage (settings, installed extensions, AI provider choice, recent files) | Lost: it lives in a per-identifier WebView profile |
| macOS bundle identity (Keychain access prompts, Gatekeeper, `defaults`) | macOS treats it as a different app |
| Windows installer / uninstaller registration | Risk of two side-by-side installs |
| Auto-update continuity | The updater replaces the running app in place, so the new identity takes effect on the next launch, with all the effects above |

API keys are **not** affected: they are stored under the fixed credential-store service name `Veyra Studio AI`.

## Decision

1. **Keep `com.veyra.extensionspreview` for all 0.x releases.** Do not change it casually.
2. **Change it once, at 1.0, to `com.veyraeditor.studio`** (reverse of the product domain veyraeditor.com),
   together with Developer ID signing and notarization (audit REL-03), so users see one deliberate identity change.
3. Ship the change with a **migration** in the first 1.0 launch:
   - copy `language-tools/` from the old app data folder to the new one (or offer one-click reinstall);
   - export WebView `localStorage` keys prefixed `veyra.` from the old profile and import them into the new one
     (settings, installed extensions, AI settings), then mark the migration done;
   - on Windows, have the 1.0 installer remove the old registration so only one Veyra remains.

## Acceptance tests before the 1.0 release

On clean **Windows 11**, **macOS (Apple silicon and Intel)** and **Ubuntu**, starting from an installed 0.x build:

- [ ] Update to 1.0 through the in-app updater succeeds.
- [ ] Settings, installed extensions, theme and AI provider choice are preserved.
- [ ] Saved API keys still work (credential store unaffected).
- [ ] Language tools still work, or reinstall in one click.
- [ ] Only one Veyra appears in Start menu / Applications / uninstall list; uninstall removes it cleanly.
- [ ] A fresh install of 1.0 (no previous version) works.
