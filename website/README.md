# Veyra Website

The public website for Veyra Studio. It is a standalone Next.js application inside the editor repository and includes:

- Responsive landing page with a three.js hero and an interactive IDE demo
- Download page and changelog, both read live from GitHub Releases
- Accounts on your own MySQL database: register, log in, forgot/reset password by email, change password, delete account
- Account dashboard with per-OS downloads
- Privacy, Terms and 404 pages; update endpoint for the desktop app (`/api/updates/...`)

## Run locally

```bash
cd website
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The landing, download and changelog pages work without any configuration. Accounts need a MySQL
database (and email, for password resets). Copy `.env.example` to `.env.local` and fill it in.

### Accounts on your Hostinger MySQL database

Accounts are stored in your own MySQL database; no third-party auth service is involved.

- **Tables are created automatically** (`users`, `sessions`, `password_resets`) the first time the site connects.
- Passwords are hashed with **scrypt** (salted, Node.js built-in). Session and reset tokens are random and only their
  SHA-256 hashes are stored, so a database leak does not expose working sessions or links.
- Sessions last 30 days in an HttpOnly cookie. Changing your password signs out other devices; a reset signs out all.
- Login, sign-up and reset requests are rate-limited.

1. **hPanel → Databases → MySQL Databases**: create a database and user. Note the database name, user, password and
   the **host** shown there (often `localhost` for apps on the same hosting plan).
2. **hPanel → Emails**: create a mailbox such as `no-reply@veyraeditor.com` (used to send password-reset emails).
3. In your **Node.js app → Environment variables**, add the values from `.env.example`: `SITE_URL`, the `DB_*`
   settings (or one `DATABASE_URL`), and the `SMTP_*` settings. Then **redeploy**.

Without database settings the account pages show "Accounts are opening soon"; without SMTP settings the
forgot-password page asks people to contact you instead.

## Production build

```bash
npm run build
npm start
```

## Deploy

### Vercel

1. Import `fcopensource/veyraeditor` in Vercel.
2. Set **Root Directory** to `website`.
3. Add the three environment variables shown above, using the public production URL for `NEXT_PUBLIC_SITE_URL`.
4. Deploy. Your MySQL database must accept connections from Vercel (enable remote MySQL access for Vercel's IPs).

### Hostinger (veyraeditor.com)

The `website` branch of the repository contains only this folder, at its root, so Hostinger can import it
directly. A GitHub Action (`.github/workflows/website-branch.yml`) refreshes that branch every time files under
`website/` change on `main`. Never commit to the `website` branch by hand; it is overwritten.

1. hPanel → **Websites** → **Add website** → **Node.js Apps** → **Import Git repository** (menu names can vary slightly between hPanel versions).
2. Connect GitHub, choose `fcopensource/veyraeditor` and the **`website`** branch. Framework: **Next.js**.
3. Build command `npm run build`, start command `npm start`, Node.js **20 or 22**.
4. Add the environment variables from `.env.example` (site URL, MySQL database and SMTP email). See
   "Accounts on your Hostinger MySQL database" above.
5. Connect the domain `veyraeditor.com` to the app (hPanel shows the DNS records or nameservers to use at your
   domain registrar). Enable the free SSL certificate.
6. Turn on automatic redeploys so each refresh of the `website` branch goes live.

### Any Node host

Run `npm ci && npm run build && npm start` with Node.js 20+ and the environment variables above. The server listens
on `$PORT` (default 3000).

## Publishing desktop downloads

The download buttons use `https://github.com/fcopensource/veyraeditor/releases/latest`. Create a GitHub Release and attach the signed `.dmg` or app archive; the website will always lead visitors to the newest release.
