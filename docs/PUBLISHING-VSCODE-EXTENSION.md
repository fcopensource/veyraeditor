# Publishing Veyra Live Server

Veyra Live Server lives in [`extensions/live-server`](../extensions/live-server). Its Marketplace ID is **`flightcoders.veyra-live-server`** (publisher `flightcoders`, name `veyra-live-server`; the name `live-server` is taken on the Marketplace).

Every Veyra release attaches the packaged extension (`veyra-live-server-<version>.vsix`) to its GitHub release, and the CI checks run its tests inside a real VS Code. Publishing to the stores is a separate, manual step, described below.

## Before you publish

1. **Push to `main` first.** The Marketplace page shows the README images from GitHub (`media/readme/*.png` on `main`), so they must be online.
2. **Bump the version** in `extensions/live-server/package.json` and add a section to its `CHANGELOG.md`. The Marketplace refuses a version it already has.

## Option A: upload by hand (simplest)

1. Build the package: `cd extensions/live-server && npm ci && npm run package` → `dist/veyra-live-server-<version>.vsix`. Or download `veyra-live-server-<version>.vsix` from the latest GitHub release.
2. Open <https://marketplace.visualstudio.com/manage/publishers/flightcoders> and sign in with the Microsoft account that owns the publisher.
3. **First time:** click **+ New extension → Visual Studio Code** and upload the `.vsix`.
   **Updates:** click **…** next to *Veyra Live Server* → **Update** and upload the new `.vsix`.
4. The Marketplace verifies it (a few minutes). The extension then appears at <https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server>.

## Option B: one click from GitHub Actions

### One-time setup

1. Go to <https://dev.azure.com>, signed in with the **same Microsoft account** as the `flightcoders` publisher. Create an organization if asked; any name works.
2. Open **User settings → Personal access tokens → + New Token**:
   - **Organization:** *All accessible organizations* (required)
   - **Scopes:** *Custom defined* → **Show all scopes** → **Marketplace → Manage**
   - **Expiration:** up to one year
3. Copy the token, then in GitHub open **this repository → Settings → Secrets and variables → Actions → New repository secret**: name it `VSCE_PAT` and paste the token.

### Publish

**Actions → Publish VS Code extension → Run workflow → target: marketplace.** It runs the tests (including inside VS Code), packages the extension and publishes it.

## Open VSX (VSCodium, Cursor, Gitpod, Veyra's marketplace)

1. Sign in at <https://open-vsx.org> with GitHub, link an Eclipse account and accept the Publisher Agreement (Settings → Profile).
2. Create an access token: **Settings → Access Tokens**.
3. Create the namespace once: `npx ovsx create-namespace flightcoders -p <token>`
4. Add the token as the repository secret `OVSX_PAT`, then run the workflow with **target: openvsx** (or **both**).

## Troubleshooting

| Message | Fix |
| --- | --- |
| *The publisher ID 'veyra' provided in the extension manifest should match the publisher ID 'flightcoders'* | Already fixed: `package.json` has `"publisher": "flightcoders"`. Rebuild the `.vsix` with the current code. |
| *Extension 'flightcoders.veyra-live-server' already exists with version x* | Bump `version` in `package.json`. |
| *401 / Access denied* | The token must be for **All accessible organizations** with **Marketplace → Manage**, from the account that owns the publisher. |
| *Make sure to edit the README.md file before you package* | The README has the template text: edit it. |
| Images missing on the Marketplace page | Push to `main` first: the images load from GitHub. |

## Optional: verified publisher

A blue check next to *flightcoders* needs the publisher's website domain verified in the publisher's settings on the Marketplace (for example `veyraeditor.com`). The Marketplace page explains the current requirements.
