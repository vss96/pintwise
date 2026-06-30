# Migrate Pintwise database: Supabase → Cloudflare

**Date:** 2026-07-01
**Status:** Approved design (pending spec review)

## Goal

Move Pintwise off Supabase entirely and onto Cloudflare. Host the static site on
**Cloudflare Pages**, serve the API from **Pages Functions**, and store data in
**Cloudflare D1** (SQLite). Preserve the existing 13 pint entries. Serve the app
from the custom domain **pintwise.vsslog.dev**.

## Current state

- Pure static site (`index.html`, `css/`, `js/app.js`, `js/database.js`) built by
  webpack into `dist/`, deployed to **GitHub Pages**.
- The browser talks **directly** to Supabase PostgREST. The Supabase URL + anon key
  are baked into the JS bundle at build time via webpack `DefinePlugin`. RLS allows
  all operations (`pint_entries` table).
- A scheduled GitHub Action pings Supabase daily to prevent free-tier auto-pause.
- DNS for `vsslog.dev` is managed on Cloudflare (blog is a separate Hugo repo,
  `vss96/blog`, and will NOT be modified by this work).

## Target architecture

```
Browser (Cloudflare Pages @ pintwise.vsslog.dev)
   │  fetch  /api/pints           (GET list, POST create)
   │  fetch  /api/pints/:id        (PATCH mark-paid, DELETE)
   ▼
Pages Function  (functions/api/…)  reads context.env.DB
   ▼
Cloudflare D1   (SQLite, binding "DB")
```

Key consequence: the browser no longer holds any database key. Same-origin `/api/*`
means no CORS and no secrets in the client bundle (a security improvement over the
current anon-key-in-bundle setup). Access control moves from Supabase RLS to the
Function layer.

## Components

### 1. Database schema — `schema.sql` (replaces `supabase-setup.sql`)

Postgres → SQLite dialect translation:

| Supabase (Postgres)            | D1 (SQLite)                          |
|--------------------------------|--------------------------------------|
| `id BIGSERIAL PRIMARY KEY`     | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| `debtor/creditor TEXT NOT NULL`| same                                 |
| `description TEXT`             | same                                 |
| `amount DECIMAL(10,2)`         | `amount REAL DEFAULT 1.0`            |
| `date_created TIMESTAMPTZ`     | `date_created TEXT` (ISO-8601, set by Function) |
| `date_paid TIMESTAMPTZ`        | `date_paid TEXT` (nullable)         |
| `status TEXT DEFAULT 'pending'`| same                                 |
| RLS policy                     | none (Function is the boundary)     |

Indexes preserved: `status`, `debtor`, `creditor`, `date_created`.
Timestamps are written by the Function as `new Date().toISOString()` so the
frontend's existing `new Date(dateString)` parsing keeps working unchanged.

### 2. Backend — Pages Functions (file-based routing)

- `functions/api/pints.js`
  - `onRequestGet` — `SELECT * FROM pint_entries ORDER BY date_created DESC`,
    optional `?status=pending` filter. Returns JSON array.
  - `onRequestPost` — insert `{debtor, creditor, description, amount}` with
    `status='pending'`, `date_created = now ISO`. Returns the new row's id.
- `functions/api/pints/[id].js`
  - `onRequestPatch` — set `status='paid'`, `date_paid = now ISO` for `:id`.
  - `onRequestDelete` — delete row `:id`.
- All use the D1 binding `context.env.DB` with prepared statements
  (`.bind(...)`) to avoid SQL injection.

### 3. Frontend — `js/database.js` rewritten, public interface preserved

`PintDatabase` keeps the **exact same method signatures** so `js/app.js` needs **no
changes**:

| Method                         | New implementation                         |
|--------------------------------|--------------------------------------------|
| `getAllPints()`                | `GET /api/pints`                           |
| `getPendingPints()`            | `GET /api/pints?status=pending`            |
| `addPintEntry(d,c,desc,amt)`   | `POST /api/pints`                          |
| `markPintAsPaid(id)`           | `PATCH /api/pints/:id`                     |
| `deletePintEntry(id)`          | `DELETE /api/pints/:id`                    |
| `calculateNetBalances(...)`    | unchanged (pure client-side)               |

The Supabase constructor (URL/key requirement) is removed; the class no longer
needs any configuration.

### 4. Build & config

- `webpack.common.js`: remove the Supabase `DefinePlugin` block and the duplicate
  `require('dotenv').config()` line. Static build into `dist/` otherwise unchanged.
- `wrangler.toml` (new):
  ```toml
  name = "pintwise"
  compatibility_date = "2026-07-01"
  pages_build_output_dir = "dist"

  [[d1_databases]]
  binding = "DB"
  database_name = "pintwise"
  database_id = "<filled in after `wrangler d1 create`>"
  ```
- `package.json`: remove `@supabase/supabase-js`; add `wrangler` (devDep); add
  scripts: `pages:dev` (`wrangler pages dev`), `deploy` (`npm run build && wrangler
  pages deploy dist`), `db:apply` (apply schema to remote D1).

### 5. CI/CD

- **Delete** `.github/workflows/keep-supabase-alive.yml` (D1 has no auto-pause).
- **Replace** `.github/workflows/jekyll-gh-pages.yml` with
  `.github/workflows/deploy-cloudflare-pages.yml` using `cloudflare/wrangler-action`,
  authenticated via repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  Push-to-`main` → build → `wrangler pages deploy`. Keeps the current "push to
  deploy" workflow.

### 6. Data migration (preserve existing rows)

Source of truth: local export `pint_entries_rows.json` (13 rows, ids 12–26). No live
Supabase access required.

`scripts/json-to-d1-sql.mjs` reads the JSON and emits `migration-data.sql` with
`INSERT` statements that preserve `id` and normalize the Postgres-dump quirks:

- `"2025-07-09 23:58:49+00"` → `"2025-07-09T23:58:49Z"`
- microsecond precision (`"2026-05-01 10:42:26.264528+00"`) → millisecond ISO
  (`"2026-05-01T10:42:26.264Z"`)
- `date_paid: ""` → SQL `NULL`
- `date_created: null` (id 26) → preserved as `NULL` (matches current behavior)
- string values single-quote-escaped

Applied after the schema:
`wrangler d1 execute pintwise --remote --file=migration-data.sql`.
Because explicit ids are inserted into an `AUTOINCREMENT` column, new entries
continue after the max id (26).

### 7. Custom domain

Add `pintwise.vsslog.dev` as a custom domain on the Pintwise Pages project. Since
`vsslog.dev` is a Cloudflare zone, Cloudflare auto-creates the CNAME and provisions
the TLS cert. One dashboard step (or Pages API call). No change to the blog or the
apex `vsslog.dev`.

## Data flow (add a pint, end to end)

1. User submits the add-pint form → `app.js handleAddPint`.
2. `db.addPintEntry(...)` → `POST /api/pints` (same origin).
3. `functions/api/pints.js onRequestPost` → `INSERT … RETURNING id` on D1.
4. App calls `db.getAllPints()` → `GET /api/pints` → re-renders.

## Error handling

- Functions return non-2xx with a JSON `{error}` body on D1 failure or bad input.
- `database.js` checks `response.ok` and throws, preserving the existing
  `app.js` try/catch + user-facing error toasts. App's "limited mode" fallback on
  init failure is retained.
- Input validation (non-empty debtor/creditor, debtor ≠ creditor) stays client-side
  in `app.js`; the Function additionally rejects missing fields.

## Testing

- **Local:** `wrangler pages dev` with a local D1 (`wrangler d1 execute --local`
  seeded from `schema.sql` + `migration-data.sql`). Manually exercise list / add /
  mark-paid / delete and confirm balances render.
- **Migration check:** after importing to remote D1,
  `wrangler d1 execute pintwise --remote --command "SELECT count(*) FROM pint_entries"`
  returns 13; spot-check a microsecond row and the null-date row.
- **Production smoke test:** load `pintwise.vsslog.dev`, verify all 13 entries
  appear, add a throwaway entry, mark paid, delete it.

## Files summary

**Add:** `functions/api/pints.js`, `functions/api/pints/[id].js`, `wrangler.toml`,
`schema.sql`, `scripts/json-to-d1-sql.mjs`,
`.github/workflows/deploy-cloudflare-pages.yml`, `MIGRATION.md` (runbook).

**Modify:** `js/database.js`, `webpack.common.js`, `package.json`, `README.md`.

**Delete:** `supabase-setup.sql`, `.github/workflows/keep-supabase-alive.yml`,
`.github/workflows/jekyll-gh-pages.yml`.

## Execution split

I run the migration **end-to-end via the wrangler CLI**, using the cached
`wrangler login` already present on this machine (verified: account auth works,
`vsslog.dev` is a Cloudflare Pages domain on the existing `blog` project, no
`pintwise` project/D1 yet). Sequence I perform:

1. `wrangler d1 create pintwise` → capture `database_id` into `wrangler.toml`.
2. Apply `schema.sql` to remote D1.
3. Generate `migration-data.sql` from `pint_entries_rows.json`, import to remote D1,
   verify row count = 13.
4. `npm run build` → **pause and show the result / get a go-ahead before the live
   deploy** → `wrangler pages deploy dist` (creates the `pintwise` Pages project).
5. Attach custom domain `pintwise.vsslog.dev` to the project (auto CNAME via the
   Cloudflare zone).
6. Smoke-test the live site.

The user still needs to do **one** thing for CI: add `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` as GitHub repo secrets so the push-to-deploy workflow works
(the local cached OAuth token is not available in GitHub Actions). I'll also leave a
`MIGRATION.md` documenting exactly what was run, for reproducibility.

**Outward-facing actions** (the live `pages deploy` and the DNS/custom-domain
attach) are real, account-changing operations — I will confirm with the user
immediately before executing those, even though end-to-end execution is approved.

## Out of scope (YAGNI)

- Authentication / per-user access control (current app has none).
- Real-time updates, pagination, soft-deletes.
- Migrating Supabase Auth/Storage (unused).
- Any change to the blog (`vss96/blog`) beyond the shared DNS zone.
