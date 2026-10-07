# Veyra Website

The public website for Veyra Studio. It is a standalone Next.js application inside the editor repository and includes:

- Responsive landing page with a three.js hero and an interactive IDE demo
- Download page and changelog, both read live from GitHub Releases
- Accounts: register, log in, email confirmation, forgot/reset password, change password, auto-refreshing sessions
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

The landing and download pages work without environment variables. To enable account creation and login, create a Supabase project, enable Email authentication, and add its Project URL and anon/public key to `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Never commit a service-role key. The anon key is the correct browser-facing project key; authentication tokens are stored by Veyra's server routes in HttpOnly cookies.

Without these variables the site still works: the account pages show "Accounts are opening soon" with a download button.

### Turning on accounts (Supabase, free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: enabled. Keep **Confirm email** on (recommended).
3. **Authentication → URL Configuration**:
   - **Site URL:** `https://veyraeditor.com`
   - **Redirect URLs:** add `https://veyraeditor.com/auth/callback` (and `http://localhost:3000/auth/callback` for local testing).
   Confirmation and password-reset emails link to `/auth/callback`, which signs the user in or lets them choose a new password.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in Hostinger's environment variables for production), then redeploy. These are
   read at build time, so a redeploy is required after changing them.
5. Optional: Supabase's built-in email service is rate-limited; for real traffic set up custom SMTP under
   **Authentication → Emails**.

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
4. Deploy and add the production domain to Supabase Auth's allowed redirect URLs.

### Hostinger (veyraeditor.com)

The `website` branch of the repository contains only this folder, at its root, so Hostinger can import it
directly. A GitHub Action (`.github/workflows/website-branch.yml`) refreshes that branch every time files under
`website/` change on `main`. Never commit to the `website` branch by hand; it is overwritten.

1. hPanel → **Websites** → **Add website** → **Node.js Apps** → **Import Git repository** (menu names can vary slightly between hPanel versions).
2. Connect GitHub, choose `fcopensource/veyraeditor` and the **`website`** branch. Framework: **Next.js**.
3. Build command `npm run build`, start command `npm start`, Node.js **20 or 22**.
4. Add the environment variables: `NEXT_PUBLIC_SITE_URL=https://veyraeditor.com`, plus the two Supabase values if you
   want accounts.
5. Connect the domain `veyraeditor.com` to the app (hPanel shows the DNS records or nameservers to use at your
   domain registrar). Enable the free SSL certificate.
6. Turn on automatic redeploys so each refresh of the `website` branch goes live.

### Any Node host

Run `npm ci && npm run build && npm start` with Node.js 20+ and the environment variables above. The server listens
on `$PORT` (default 3000).

## Publishing desktop downloads

The download buttons use `https://github.com/fcopensource/veyraeditor/releases/latest`. Create a GitHub Release and attach the signed `.dmg` or app archive; the website will always lead visitors to the newest release.
