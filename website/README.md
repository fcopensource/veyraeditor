# Veyra Website

The public website for Veyra Studio. It is a standalone Next.js application inside the editor repository and includes:

- Responsive product landing page
- Download page linked to the latest GitHub Release
- Login and registration pages
- Secure server-side Supabase Auth integration using HttpOnly cookies
- Signed-in preview dashboard

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

### Any Node host

The app uses `output: "standalone"`. Build it with `npm run build`, provide the environment variables, and run the generated standalone server.

## Publishing desktop downloads

The download buttons use `https://github.com/fcopensource/veyraeditor/releases/latest`. Create a GitHub Release and attach the signed `.dmg` or app archive; the website will always lead visitors to the newest release.
