# One product list for both websites

veyraeditor.com and flightcoders.com show the same list of Veyra extensions. Neither site needs a code change when
you release a new one.

## Releasing a new extension

1. Publish it to the VS Code Marketplace (Actions → "Publish VS Code extension").
2. That's it. Within about an hour it appears on both websites: in the menus, the footer, the extensions lists,
   the counts ("20 free extensions") and the sitemaps. On veyraeditor.com it gets an automatic page at
   `/extensions/<name>` with its icon, description, version and an install button.

When you later write a full page for it (like `website/app/pets/page.tsx`) and add it to `website/lib/products.ts`,
that page takes over and `/extensions/<name>` redirects to it.

## Changing how an extension is shown

Sign in to **flightcoders.com/admin → Products** (admins are the emails in `ADMIN_EMAILS`). For any extension you
can change the name shown on the sites, its one-line description, its group, its order, feature it (shown first) or
hide it on both websites. Changes show at once on flightcoders.com and within ten minutes on veyraeditor.com.
"Go back to automatic" undoes an edit. "Refresh from the Marketplace" skips the hourly wait.

## How it works

```
VS Code Marketplace ──┐
(publisher flightcoders)│
                       ├─► flightcoders.com  lib/catalog.ts ──► /api/catalog (public JSON) ──► veyraeditor.com  website/lib/catalog.ts
admin overrides ───────┤   (merged, cached an hour)                                          (merged with website/lib/products.ts,
(catalog_overrides)    │                                                                       cached ten minutes)
lib/veyra-products.ts ─┘
(lines, groups, .vsix-only builds, fallback)
```

- **flightcoders.com** (`lib/catalog.ts`): reads every extension the `flightcoders` publisher has on the Marketplace,
  adds the hand-written lines and groups from `lib/veyra-products.ts` (and any extension shipped only as a `.vsix`),
  then applies the admin's overrides from the `catalog_overrides` table, which is created on first use.
- **`https://flightcoders.com/api/catalog`**: the merged list as JSON, including which fields an admin edited and
  which extensions are hidden.
- **veyraeditor.com** (`website/lib/catalog.ts`): reads that list. Extensions with a page here keep their own copy and
  take only the admin's edits; new ones get the automatic page; hidden ones are left out.

## If something is down

- Marketplace unreachable: flightcoders.com uses `lib/veyra-products.ts`.
- flightcoders.com unreachable: veyraeditor.com keeps the last list it fetched, or uses `website/lib/products.ts` if it
  has none yet.

## Settings

| Where | Variable | Default | What it does |
| --- | --- | --- | --- |
| veyraeditor.com | `CATALOG_URL` | `https://flightcoders.com/api/catalog` | Where to read the list from |
| veyraeditor.com | `CATALOG_REVALIDATE` | `600` | How often to check it, in seconds |
