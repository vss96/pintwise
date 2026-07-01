# 🍺 Pintwise - Pint Debt Tracker

A simple, elegant web application to track pints owed between friends. Built on
Cloudflare Pages with a Pages Functions API backed by Cloudflare D1 (SQLite).

## Features

- **Track Pint Debts**: Record who owes pints to whom
- **Net Balance Calculator**: See consolidated debts between people
- **Search & Filter**: Find specific entries or people quickly
- **Responsive Design**: Works perfectly on mobile and desktop
- **Scrollable Lists**: Handle large numbers of entries with smooth scrolling

## Live Demo

Live at https://pintwise.pages.dev

## Architecture

```
Browser (Cloudflare Pages static site)
   │  fetch /api/pints, /api/pints/:id   (same origin)
   ▼
Pages Functions  (functions/api/…)  →  context.env.DB
   ▼
Cloudflare D1 (SQLite)
```

No database credentials are shipped to the browser — the client calls the
same-origin `/api/*` routes, and only the server-side Functions touch D1.

## Setup Instructions

### 1. Clone and install

```bash
git clone https://github.com/vss96/pintwise.git
cd pintwise
npm install
```

### 2. Create the D1 database

```bash
npx wrangler login                 # one-time
npx wrangler d1 create pintwise    # copy the database_id into wrangler.toml
npx wrangler d1 execute pintwise --remote --file=schema.sql
npx wrangler d1 execute pintwise --local  --file=schema.sql
```

`wrangler.toml` binds the database to the `DB` binding used by the Functions.

### 3. Local development

Runs the static site + Pages Functions + a local D1 together:

```bash
npm run pages:dev      # build, then wrangler pages dev dist
```

Open http://localhost:8788. (Seed the local D1 with `schema.sql` first — see
above with `--local`.)

`npm start` still runs the webpack dev server for pure UI work, but it does not
serve the `/api/*` Functions, so use `npm run pages:dev` for full-stack testing.

### 4. Deploy

```bash
npm run deploy         # build + wrangler pages deploy dist --project-name=pintwise
```

Or push to `main` — `.github/workflows/deploy-cloudflare-pages.yml` builds and
deploys automatically. That workflow needs two repo secrets (Settings → Secrets
and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — token with **Account → Cloudflare Pages → Edit**
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account id

### 5. Custom domain (optional)

The app is served from `pintwise.pages.dev`. To use a custom domain, in the
Cloudflare dashboard go to Workers & Pages → **pintwise** → **Custom domains**
and add it; if the zone is on Cloudflare, the CNAME and TLS cert are
provisioned automatically.

## How to Use

### Adding Pint Entries

1. Click "Add Pint" in the navigation
2. Enter who owes the pint and who is owed
3. Optionally add a description and specify number of pints
4. Click "Add Pint Entry"

### Managing Debts

- **Pending Tab**: View all unpaid pints with options to mark as paid or delete
- **All Pints Tab**: See complete history of all transactions
- **Net Balances Tab**: View consolidated debts between people

### Search and Filter

Use the search bar to find entries by person names (debtor or creditor) or
description text.

## Database Schema

D1 (SQLite) table, defined in [`schema.sql`](schema.sql):

```sql
CREATE TABLE IF NOT EXISTS pint_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    debtor       TEXT NOT NULL,
    creditor     TEXT NOT NULL,
    description  TEXT DEFAULT '',
    amount       REAL NOT NULL DEFAULT 1.0,
    date_created TEXT,   -- ISO-8601 UTC
    date_paid    TEXT,   -- ISO-8601 UTC, nullable
    status       TEXT NOT NULL DEFAULT 'pending'
);
```

## API

| Method | Route              | Purpose                          |
|--------|--------------------|----------------------------------|
| GET    | `/api/pints`       | List all (`?status=pending` filter) |
| POST   | `/api/pints`       | Add an entry                     |
| PATCH  | `/api/pints/:id`   | Mark an entry paid               |
| DELETE | `/api/pints/:id`   | Delete an entry                  |

> **Note:** the API is currently unauthenticated (same posture as the previous
> Supabase RLS-allow-all setup). See `MIGRATION.md` for hardening options.

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **API**: Cloudflare Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Build Tool**: Webpack
- **Deployment**: Cloudflare Pages (GitHub Actions + wrangler)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Support

If you encounter any issues:

1. Confirm `wrangler.toml` has the correct `database_id` and `DB` binding
2. Ensure the `pint_entries` table exists: `wrangler d1 execute pintwise --remote --command "SELECT count(*) FROM pint_entries"`
3. For CI deploys, verify the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets
4. Check the browser console and `wrangler pages deployment tail` for errors

## Roadmap

- [ ] Authentication / access control
- [ ] Group management
- [ ] Email notifications
- [ ] Integration with payment apps

---

Made with ❤️ for tracking pint debts between friends!
