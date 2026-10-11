# Automatically mirror GitHub releases to downloads.veyraeditor.com

Veyra's normal **Release** workflow builds all operating systems, creates a draft
GitHub Release and signs its Tauri updater artifacts. Once you **publish** that
release, `.github/workflows/hostinger-downloads.yml` transfers every attached
release asset to Hostinger over SFTP.

This workflow **never overwrites an existing version folder**. If Microsoft Store
was given an installer URL like
`https://downloads.veyraeditor.com/v0.6.1/Veyra.Studio_0.6.1_x64-setup.exe`,
that exact file stays untouched.

## One-time setup

### 1. Enable Hostinger SSH/SFTP

In Hostinger hPanel open **Websites → Dashboard → SSH Access / Remote Access**,
and enable SSH/SFTP (depending on your plan and panel).

Record:
- Hostinger SSH/SFTP **IP or hostname**
- SSH/SFTP **username**
- SSH/SFTP **port** (usually `65002`)
- The SFTP directory that is the **document root for
  downloads.veyraeditor.com**. This is the actual folder containing files
  served by the download subdomain. Do **not** assume it equals the main
  website's `public_html`. If needed, connect with an SFTP client to find it.

The workflow needs **key-based SFTP authentication**. If SSH keys cannot be
enabled on your Hostinger plan, this workflow will not work as written.

### 2. Generate a dedicated deploy key on your machine

On macOS/Linux:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/veyra_hostinger_deploy -C "veyra-github-release-sync"
```

Add the contents of `~/.ssh/veyra_hostinger_deploy.pub` to **Hostinger's
authorized SSH/SFTP keys**. Do not add the private key to the repository.

Test locally (replace USER and HOST with your connection details):

```bash
sftp -i ~/.ssh/veyra_hostinger_deploy -P 65002 USER@HOST
```

### 3. Add GitHub Actions repository secrets

Open `https://github.com/fcopensource/veyraeditor/settings/secrets/actions`
and add these **repository secrets** (not public variables):

| Secret | Value |
| --- | --- |
| `HOSTINGER_SFTP_HOST` | Hostinger SSH/SFTP host or IP |
| `HOSTINGER_SFTP_USER` | SSH/SFTP username |
| `HOSTINGER_SFTP_PRIVATE_KEY` | Complete contents of `~/.ssh/veyra_hostinger_deploy` (private key) |
| `HOSTINGER_SFTP_KNOWN_HOSTS` | Verified OpenSSH known-hosts entry for Hostinger host and SFTP port |
| `HOSTINGER_DOWNLOADS_DIR` | **Existing** SFTP directory corresponding to the downloads subdomain's web root |

The known-hosts entry must match the host **and port**. You can retrieve a
candidate using:

```bash
ssh-keyscan -p 65002 -t ed25519 HOST
```

Verify its host-key fingerprint against a trusted Hostinger source or a
previously verified connection before saving it as a secret. Do not treat an
unverified `ssh-keyscan` response as proof of identity. At non-default ports,
known-hosts entries generally begin with `[HOST]:65002`.

If your port differs from `65002`, add the GitHub Actions **repository
variable** `HOSTINGER_SFTP_PORT` with your actual port.

**Never paste your SSH password or private key into issues, chat, commits or
screenshots.**

### 4. Merge and test

1. Merge the PR introducing the mirror workflow **after** configuring the
   secrets above.
2. Publish a new non-prerelease GitHub Release after its installers are built.
3. Open **GitHub Actions → Mirror releases to Hostinger downloads**.
4. Confirm the green workflow run and check links in its job summary.
5. Confirm an installer URL in a private browser window with a download or
   `curl -I`.

The upload creates a temporary staging folder, transfers all assets, and
renames it to `vX.Y.Z` after the transfer finishes. Previous version folders
are left alone. Uploading the same release tag a second time is intentionally
unsupported, so Microsoft Store installer URLs remain immutable.

For a **published version not yet uploaded** you can use **Run workflow** and
supply its tag. Do not run this against an existing nonempty version directory.

## Example file layout

```text
downloads.veyraeditor.com/
  v0.6.1/   (preserved for any existing Microsoft Store listing)
  v0.8.0/
    Veyra.Studio_0.8.0_x64-setup.exe
    Veyra.Studio_0.8.0_x64_en-US.msi
    Veyra.Studio_0.8.0_aarch64.dmg
    Veyra.Studio_0.8.0_x64.dmg
    Veyra.Studio_0.8.0_amd64.AppImage
    Veyra.Studio_0.8.0_amd64.deb
    Veyra.Studio-0.8.0-1.x86_64.rpm
    latest.json
    ...signatures and other release files
```

Example only: exact asset names and included files depend on the GitHub Release.

## What is *not* changed by this workflow

- Veyra Studio's **in-app Tauri updater** still uses the signed
  `latest.json` on GitHub Releases. Its update URL remains unchanged.
- `veyraeditor.com/download` still discovers new releases and links to
  GitHub's release assets. Changing the website to prefer Hostinger is a
  separate optional task, to do **after** SFTP deployment is verified.
- Publishing an updated release does **not** automatically update the EXE
  installer information already submitted in Microsoft Partner Center.
  Submit each new Store installer version separately.

## Troubleshooting

- **Permission denied (publickey)**: check the SSH public key in Hostinger and
  GitHub's private-key secret.
- **Host key verification failed**: fix and independently verify
  `HOSTINGER_SFTP_KNOWN_HOSTS`; don't disable verification.
- **No such file** after `cd`: correct `HOSTINGER_DOWNLOADS_DIR`; it must
  already exist in the account's SFTP view.
- **Failure during rename**: the version folder may already exist. Don't
  overwrite it; inspect the folder and use a new release version instead.
- **404 on HTTPS check**: verify the subdomain's real document root and DNS.
  The upload may have succeeded to the wrong folder; inspect File Manager.
- **Out of disk space**: Hostinger storage quotas apply. Keep release archives
  within the hosting plan's capacity. Delete old, unreferenced versions only
  after confirming no Store listing or customer still depends on their URLs.
