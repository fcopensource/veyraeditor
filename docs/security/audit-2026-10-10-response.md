# Response to the technical audit of 10 October 2026

The audit (website, release and desktop security; read-only review) reported 10 actionable findings and
4 verification items. Every finding was checked against the code and confirmed. This page records what was
changed and how each fix was verified.

| ID | Priority | Status | What changed |
|---|---|---|---|
| SEC-01 | P1 | **Fixed** | Least-privilege Content Security Policy in `src-tauri/tauri.conf.json` |
| PRIV-02 | P1 | **Fixed** | Secrets are never chosen as AI context; explicit attachments need a second, deliberate Send |
| REL-03 | P1 | **Fixed** | Accurate trust wording; separate update-signing / Windows / Apple status on /download |
| REL-04 | P2 | **Fixed** | Removed the invented "next version" number; all versions come from the GitHub release |
| CI-05 | P2 | **Fixed** | New `Checks` workflow; releases are built only when every check passes |
| SUP-06 | P2 | **Fixed** | Language tools install with `--ignore-scripts`; their exact dependency trees are audited in CI |
| MAINT-14 | P2 | Planned | Separate refactor (see below); behaviour is protected by the test suite first |
| DOC-07 | P3 | **Fixed** | Installer sizes are computed from the actual release files |
| DOC-08 | P3 | **Fixed** | Build from source: Node.js 22+ (docs, README, `package.json` engines); language tools: Node.js 18+ |
| REL-09 | P3 | **Decided** | Keep the identifier through 0.x; migrate once at 1.0 ([decision record](../decisions/0001-app-identifier.md)) |

## SEC-01 · Content Security Policy

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:; font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost https://open-vsx.org https://openvsx.eclipsecontent.org;
worker-src 'self' blob:; media-src 'self' data: blob:;
object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'
```

- **Scripts** only from the app bundle: no inline scripts, no remote scripts, no `eval`.
- **Network** from the web view only to Tauri IPC and the Open VSX registry and its download CDN. AI providers,
  updates and Git are reached from the Rust side, not the web view.
- `style-src 'unsafe-inline'` is required by Monaco, which sets inline styles. `dangerousDisableAssetCspModification:
  ["style-src"]` stops Tauri adding a nonce there, because browsers ignore `'unsafe-inline'` when a nonce is present.
- `img-src https:` lets extension READMEs show their badges and screenshots. Images cannot run code.

**Verified:** `tests/csp.spec.ts` serves the production build with this exact policy. Monaco renders with syntax
colours, the TypeScript worker completes code, and there are zero violations. Inline script, remote script and
`fetch` exfiltration probes are all blocked. The same checks were run against a real production-mode desktop
build, adding terminal, IPC, Open VSX icons, README and extension install. Testing found that Open VSX redirects
downloads to `openvsx.eclipsecontent.org`; that host was added rather than loosening the policy.

## PRIV-02 · Secrets and AI context

`src-tauri/src/privacy.rs` is used by the smart workspace context:

1. **By name:** hidden files and folders (`.env*`, `.ssh`, `.aws`, `.npmrc`…), keys and certificates (`.pem`,
   `.key`, `.p12`, `.pfx`, `.jks`…), `id_rsa*`, `credentials*`, `*secret*`, service-account files, Terraform
   state and `.tfvars`.
2. **By `.gitignore`:** anything Git ignores (`git check-ignore`).
3. **By content:** private keys and high-confidence token formats (AWS, GitHub, Slack, OpenAI, Anthropic, Google,
   Stripe, npm, service-account JSON).

A file you attach yourself (current file or selection) that looks sensitive is not sent to a cloud provider on the
first Send. Veyra names the file and the destination, and only a second Send sends it. Local Ollama is unaffected.

**Verified:** Rust tests (`ai_context_never_includes_secrets` and 5 privacy tests) build a project with `.env`, an SSH
key, a certificate and a token inside source, and assert zero secret bytes in the generated context while ordinary
source is still selected. A Playwright test checks the confirm-before-send flow. The real-app run confirmed `.env`
never appears in `ai_workspace_context`.

## REL-03 / REL-04 / DOC-07 · Website accuracy

- The homepage update illustration no longer computes a fake "next version" (the source of "v0.5.2") and says
  "Signed update · verified before it installs", which is accurate: updates are signed with the updater key and
  verified by the app.
- /download has a **Trust & verification** panel: updates are cryptographically signed; Windows publisher signing
  and Apple notarization are **not yet** in place (preview); builds are made publicly by GitHub Actions. It also
  lists **SHA-256 checksums** for every file of the current release (from GitHub's published digests), with the
  commands to check them.
- Installer sizes on the homepage come from the release assets (currently 7–11 MB for .exe/.msi/.dmg/.deb/.rpm;
  the self-contained AppImage about 83 MB). Static copy elsewhere states the same qualification.

## CI-05 / SUP-06 · Release gates and supply chain

`.github/workflows/checks.yml` runs on every push and pull request, and `release.yml` depends on it (`needs: checks`):

| Job | Gate |
|---|---|
| Frontend | `tsc --noEmit`, production `vite build`, full Playwright suite (including the CSP test) |
| Rust | `cargo test`, `cargo clippy` (errors fail) |
| Dependencies | `npm audit --omit=dev --audit-level=high`; `scripts/audit-language-tools.mjs`; `cargo audit` |

`scripts/audit-language-tools.mjs` reads the pinned packages and manifest from `src-tauri/src/lsp.rs`, installs each
tool exactly as the app does (`--ignore-scripts`) and fails on any high or critical advisory.

On its first run it found **1 critical and 4 high advisories** (node-tar) in `@olrtg/emmet-language-server`'s
dependency tree. Veyra now forces `tar@^7.5.22` through npm `overrides` in the tool manifest, and the Emmet server
was re-verified with an LSP handshake. Before this change, `cargo audit` found 0 vulnerabilities in 578 crates
(2 informational warnings in Tauri's Linux GTK stack) and `npm audit` found 0 in the app.

Installs no longer run third-party install scripts. All 7 tools were checked: only `core-js` (inside the ESLint
tools) declares a postinstall script, and it prints a message. The ESLint, Tailwind, Svelte and Emmet servers were
started and completed an LSP `initialize` handshake when installed this way.

## Verification items

| ID | Result |
|---|---|
| WEB-10 | `robots.txt` and `sitemap.xml` return HTTP 200; pages have canonical URLs and structured data. Index coverage still needs Google Search Console (owner action). |
| SEC-11 | Reviewed: scrypt password hashes with per-user salt; session and reset tokens stored only as SHA-256; cookies `HttpOnly`, `Secure` (production) and `SameSite=Lax`; login, reset and password rate limits; no account enumeration on reset. **Added** an Origin check on account APIs against cross-site request forgery (`website/middleware.ts`). |
| PERF-12 | `tests/stability.spec.ts` covers sustained editing; multi-hour soak tests on clean machines remain to be done. |
| SEC-13 | `npm audit` and `cargo audit` now run in CI. A full git-history secret scan has not been run yet. |

## MAINT-14 · Large central files

`src/App.tsx` and `src-tauri/src/lib.rs` still coordinate many features. The plan is to extract one area at a time
(Git, terminal, workspace/files, search), each in its own change with the full test suite green before and after,
and no behaviour changes mixed in. New code already follows this pattern (`lsp.rs`, `privacy.rs`, `ai.rs`,
`ExtensionPage.tsx`, `AccountButton.tsx`, `updater.ts`).
