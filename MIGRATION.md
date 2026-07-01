# Migration: Supabase → Cloudflare

Record of the migration from Supabase (PostgreSQL) to Cloudflare Pages +
Pages Functions + D1 (SQLite). Design and plan live under
`docs/superpowers/`.

## What changed

| Before | After |
|--------|-------|
| Static site on **GitHub Pages** | Static site on **Cloudflare Pages** |
| Browser → **Supabase PostgREST** (anon key in bundle) | Browser → same-origin **`/api/*` Pages Functions** → **D1** |
| RLS "allow all" | Open API (no auth) — same posture, no key in client |
| `supabase-setup.sql` | `schema.sql` (SQLite) |
| GitHub Pages deploy + Supabase keep-alive workflows | Single Cloudflare Pages deploy workflow |

- Database credentials are no longer shipped in the client bundle.
- The frontend bundle shrank from ~304 KiB to ~16 KiB (Supabase SDK removed).
- `js/app.js` was untouched — `js/database.js` keeps the same public methods.

## Cloudflare resources created

- **D1 database:** `pintwise` (id `71a046a7-55e1-4aa3-9aed-109637e7e910`, region WEUR)
- **Pages project:** `pintwise` (production branch `main`, `pintwise.pages.dev`)
- **Custom domain:** none — served from `pintwise.pages.dev`

## Commands that were run

```bash
# 1. Create the D1 database, then paste database_id into wrangler.toml
wrangler d1 create pintwise

# 2. Apply schema (local + remote)
wrangler d1 execute pintwise --local  --file=schema.sql
wrangler d1 execute pintwise --remote --file=schema.sql

# 3. Convert the Supabase export and import the 13 existing rows
#    (source JSON is gitignored under data/, output SQL gitignored)
node scripts/json-to-d1-sql.mjs           # data/pint_entries_export.json -> migration-data.sql
wrangler d1 execute pintwise --local  --file=migration-data.sql
wrangler d1 execute pintwise --remote --file=migration-data.sql
wrangler d1 execute pintwise --remote --command "SELECT count(*) FROM pint_entries"  # -> 13

# 4. Deploy
wrangler pages project create pintwise --production-branch=main
npm run deploy    # build + wrangler pages deploy dist --project-name=pintwise
```

### Custom domain

Not configured — the app is served from `pintwise.pages.dev`. A custom domain
can be added later via Workers & Pages → **pintwise** → **Custom domains**.

## Remaining / operational notes

- **CI secrets** on `vss96/pintwise` (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN` — token with **Account → Cloudflare Pages → Edit**
  - `CLOUDFLARE_ACCOUNT_ID` — `8046f690745eca812fc58c2f8c2c64a8`
  - These power `.github/workflows/deploy-cloudflare-pages.yml` (push-to-`main`).
- **`.env`** now only holds unused Supabase keys (`SUPABASE_*`) — safe to delete.
- **Data files are private:** `data/` and `migration-data.sql` are gitignored and
  must never be committed (they contain real names/notes).
- **Security:** the `/api/*` endpoints are unauthenticated by design (matches the
  previous Supabase RLS-allow-all setup). Options to add later: Cloudflare Access
  (login gate), a shared-password Functions middleware on write methods, or
  Turnstile on writes.

## Regenerating the seed from a fresh export

```bash
cp ~/Downloads/pint_entries_rows.json data/pint_entries_export.json
node scripts/json-to-d1-sql.mjs
wrangler d1 execute pintwise --remote --file=migration-data.sql
```
The converter normalizes Postgres timestamps (`... +00`, microseconds) to
ISO-8601 UTC and maps empty `date_paid` to `NULL`.
