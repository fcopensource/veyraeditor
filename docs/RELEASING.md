# Releasing Veyra

Pushing a version tag builds installers for Windows, macOS and Linux on GitHub Actions and
attaches them, plus a signed update manifest, to a **draft** GitHub Release. Installed copies
of Veyra update themselves once you publish that release.

## One-time setup

### 1. Add the update-signing secrets to GitHub

Every update is signed. Veyra only installs updates whose signature matches the public key in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The private key never goes in the repo.

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contents of `~/.tauri/veyra-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | contents of `~/.tauri/veyra-updater.password` |

Add them under **GitHub → Settings → Secrets and variables → Actions**, or with the GitHub CLI:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/veyra-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < ~/.tauri/veyra-updater.password
```

> **Back up both files** (for example in a password manager). If the private key is lost, existing
> installs can never be updated again. They would need to download a new installer manually.

### 2. Optional: serve updates from your own website

`website/app/api/updates/[target]/[arch]/[version]/route.ts` answers update checks from your
server. It reads the latest signed manifest from GitHub Releases (or from `UPDATE_MANIFEST_URL`,
if you host the files yourself). After the website is deployed, put your domain first in
`src-tauri/tauri.conf.json` and keep GitHub as the fallback:

```json
"endpoints": [
  "https://YOUR-DOMAIN/api/updates/{{target}}/{{arch}}/{{current_version}}",
  "https://github.com/fcopensource/veyraeditor/releases/latest/download/latest.json"
]
```

Endpoint changes only reach users from the next release onward, since the list is built into each install.

### 3. Optional: code signing

Unsigned builds work, but users see warnings the first time they open the app:

- **Windows:** SmartScreen shows "Windows protected your PC" (*More info → Run anyway*). A code-signing
  certificate removes this. See the Tauri guide *Windows Code Signing*.
- **macOS:** Gatekeeper blocks unsigned apps downloaded from the internet. Signing and notarizing need an
  Apple Developer account ($99/year). Add the `APPLE_*` secrets and uncomment them in
  `.github/workflows/release.yml`. See the Tauri guide *macOS Code Signing*.
  Until then, builds are ad-hoc signed (`bundle.macOS.signingIdentity: "-"`), so users open the app the first time
  with **right-click → Open** (or *System Settings → Privacy & Security → Open Anyway*).

## Shipping a release

```bash
npm run release:version 0.5.0        # updates package.json, tauri.conf.json and Cargo.toml
git commit -am "release: v0.5.0"
git tag v0.5.0
git push origin main v0.5.0
```

1. Watch **GitHub → Actions → Release**. The four builds take roughly 15–25 minutes.
2. Open **GitHub → Releases**, review the draft, edit the notes (they appear in the in-app
   "What's new" panel), then click **Publish release**.
3. Within minutes, running copies of Veyra show **"Veyra 0.5.0 is ready → Update & restart"**. They check
   15 seconds after launch and every 6 hours, and users can also choose **Help → Check for Updates…**.

The version must always increase. The updater ignores releases that aren't newer than what's installed.
