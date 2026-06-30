# Supabase → Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Pintwise off Supabase onto Cloudflare Pages + Pages Functions + D1, preserving the 13 existing pint entries, served at `pintwise.vsslog.dev`.

**Architecture:** The static site (webpack → `dist/`) is hosted on Cloudflare Pages. The browser calls same-origin `/api/*` routes implemented as Pages Functions, which read/write a Cloudflare D1 (SQLite) database via the `DB` binding. No database credentials live in the client bundle anymore.

**Tech Stack:** Cloudflare Pages, Pages Functions, D1 (SQLite), wrangler 4.x, webpack 5, vanilla JS, Node test runner (`node:test`).

## Global Constraints

- Cloudflare account ID: `8046f690745eca812fc58c2f8c2c64a8` (email shettyvikas209@gmail.com).
- D1 binding name: `DB`. D1 database name: `pintwise`.
- Pages project name: `pintwise`. Custom domain: `pintwise.vsslog.dev` (zone `vsslog.dev` already on Cloudflare).
- `js/app.js` MUST NOT change — `js/database.js` keeps the identical public method surface (`addPintEntry`, `getPendingPints`, `getAllPints`, `markPintAsPaid`, `deletePintEntry`, `calculateNetBalances`).
- Timestamps stored in D1 are ISO-8601 UTC strings (`...Z`) so the frontend's `new Date(...)` parsing is unchanged.
- The raw data export and generated SQL are **private** — gitignore them; never commit real debt data into the (public) repo.
- Local wrangler commands use the machine's cached OAuth login (no token needed). CI uses repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` on `vss96/pintwise`.

---

### Task 1: D1 database, schema, and wrangler config

**Files:**
- Create: `schema.sql`
- Create: `wrangler.toml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a remote + local D1 database `pintwise` with an empty `pint_entries` table; binding `DB` declared in `wrangler.toml`.

- [ ] **Step 1: Write `schema.sql`** (SQLite dialect; idempotent)

```sql
-- Cloudflare D1 schema for Pintwise (SQLite)
CREATE TABLE IF NOT EXISTS pint_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    debtor       TEXT NOT NULL,
    creditor     TEXT NOT NULL,
    description  TEXT DEFAULT '',
    amount       REAL NOT NULL DEFAULT 1.0,
    date_created TEXT,
    date_paid    TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_pint_entries_status        ON pint_entries(status);
CREATE INDEX IF NOT EXISTS idx_pint_entries_debtor        ON pint_entries(debtor);
CREATE INDEX IF NOT EXISTS idx_pint_entries_creditor      ON pint_entries(creditor);
CREATE INDEX IF NOT EXISTS idx_pint_entries_date_created  ON pint_entries(date_created);
```

- [ ] **Step 2: Create the D1 database**

Run: `npx wrangler d1 create pintwise`
Expected: prints a `database_id` UUID. Copy it.

- [ ] **Step 3: Write `wrangler.toml`** (paste the real `database_id`)

```toml
name = "pintwise"
compatibility_date = "2026-07-01"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "pintwise"
database_id = "PASTE_DATABASE_ID_HERE"
```

- [ ] **Step 4: Extend `.gitignore`** (append)

```
# Private data export + generated seed (never commit real debt data)
data/
migration-data.sql
```

- [ ] **Step 5: Apply schema to local and remote D1**

Run:
```bash
npx wrangler d1 execute pintwise --local  --file=schema.sql
npx wrangler d1 execute pintwise --remote --file=schema.sql
```
Expected: both report executed statements, no errors.

- [ ] **Step 6: Verify the table exists (remote)**

Run: `npx wrangler d1 execute pintwise --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='pint_entries'"`
Expected: one row, `pint_entries`.

- [ ] **Step 7: Commit**

```bash
git add schema.sql wrangler.toml .gitignore
git commit -m "Add D1 schema and wrangler config"
```

---

### Task 2: Data migration converter (TDD) + import

**Files:**
- Create: `scripts/json-to-d1-sql.mjs`
- Create: `scripts/json-to-d1-sql.test.mjs`
- Create: `data/pint_entries_export.json` (gitignored copy of the Supabase export)
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `normalizeTimestamp(value) -> string|null` and `rowsToSql(rows) -> string`; a generated `migration-data.sql`; 13 rows imported into D1.

- [ ] **Step 1: Copy the export into a gitignored data dir**

Run: `mkdir -p data && cp ~/Downloads/pint_entries_rows.json data/pint_entries_export.json`
Expected: file present; `git status` does NOT list it (gitignored).

- [ ] **Step 2: Write the failing test** `scripts/json-to-d1-sql.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTimestamp, rowsToSql } from './json-to-d1-sql.mjs';

test('normalizes "+00" postgres timestamp to ISO Z', () => {
  assert.equal(normalizeTimestamp('2025-07-09 23:58:49+00'), '2025-07-09T23:58:49Z');
});

test('truncates microseconds to milliseconds', () => {
  assert.equal(normalizeTimestamp('2026-05-01 10:42:26.264528+00'), '2026-05-01T10:42:26.264Z');
});

test('empty string and null both become null', () => {
  assert.equal(normalizeTimestamp(''), null);
  assert.equal(normalizeTimestamp(null), null);
});

test('rowsToSql emits NULL for missing dates and escapes single quotes', () => {
  const sql = rowsToSql([{
    id: 1, debtor: "O'Brien", creditor: 'X', description: '',
    amount: 1, date_created: null, date_paid: '', status: 'pending',
  }]);
  assert.match(sql, /'O''Brien'/);
  assert.match(
    sql,
    /INSERT INTO pint_entries \(id, debtor, creditor, description, amount, date_created, date_paid, status\) VALUES \(1, 'O''Brien', 'X', '', 1, NULL, NULL, 'pending'\);/
  );
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `node --test scripts/json-to-d1-sql.test.mjs`
Expected: FAIL — cannot import `./json-to-d1-sql.mjs` (module not found).

- [ ] **Step 4: Implement `scripts/json-to-d1-sql.mjs`**

```js
/**
 * Convert a Supabase pint_entries JSON export into a D1-importable SQL file.
 * Usage: node scripts/json-to-d1-sql.mjs [input.json] [output.sql]
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Postgres dump timestamp -> ISO-8601 UTC string (or null). Data is all +00. */
export function normalizeTimestamp(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const m = String(value).trim().match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/
  );
  if (!m) return null;
  const [, date, time, frac] = m;
  const ms = frac ? '.' + frac.slice(0, 3).padEnd(3, '0') : '';
  return `${date}T${time}${ms}Z`;
}

function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function rowsToSql(rows) {
  const stmts = rows.map((r) => {
    const cols = [
      Number(r.id),
      sqlValue(r.debtor),
      sqlValue(r.creditor),
      sqlValue(r.description ?? ''),
      Number(r.amount),
      sqlValue(normalizeTimestamp(r.date_created)),
      sqlValue(normalizeTimestamp(r.date_paid)),
      sqlValue(r.status || 'pending'),
    ];
    return `INSERT INTO pint_entries (id, debtor, creditor, description, amount, date_created, date_paid, status) VALUES (${cols.join(', ')});`;
  });
  return stmts.join('\n') + '\n';
}

// CLI entry
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('json-to-d1-sql.mjs');
if (invokedDirectly) {
  const input = process.argv[2] || 'data/pint_entries_export.json';
  const output = process.argv[3] || 'migration-data.sql';
  const rows = JSON.parse(readFileSync(input, 'utf8'));
  writeFileSync(output, rowsToSql(rows));
  console.log(`Wrote ${rows.length} rows -> ${output}`);
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node --test scripts/json-to-d1-sql.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the `test` script to `package.json`**

Replace the stub `test` script with:
```json
"test": "node --test scripts/",
```

- [ ] **Step 7: Generate `migration-data.sql`**

Run: `node scripts/json-to-d1-sql.mjs`
Expected: `Wrote 13 rows -> migration-data.sql`. Spot-check: the id-26 row has `NULL` for `date_created`; the id-21 row shows `2026-05-01T10:42:26.264Z`.

- [ ] **Step 8: Import data into local and remote D1**

Run:
```bash
npx wrangler d1 execute pintwise --local  --file=migration-data.sql
npx wrangler d1 execute pintwise --remote --file=migration-data.sql
```

- [ ] **Step 9: Verify the row count (remote)**

Run: `npx wrangler d1 execute pintwise --remote --command "SELECT count(*) AS n FROM pint_entries"`
Expected: `n = 13`.

- [ ] **Step 10: Commit** (code + tests only; data/SQL are gitignored)

```bash
git add scripts/json-to-d1-sql.mjs scripts/json-to-d1-sql.test.mjs package.json
git commit -m "Add Supabase->D1 data converter with tests"
```

---

### Task 3: Pages Functions API

**Files:**
- Create: `functions/api/pints.js`
- Create: `functions/api/pints/[id].js`

**Interfaces:**
- Consumes: D1 binding `env.DB` (Task 1).
- Produces HTTP API:
  - `GET /api/pints` → `200` JSON array of rows (optional `?status=pending`).
  - `POST /api/pints` `{debtor, creditor, description, amount}` → `201 {id}`.
  - `PATCH /api/pints/:id` → `200 {success:true}` (sets `status='paid'`, `date_paid=now`).
  - `DELETE /api/pints/:id` → `200 {success:true}`.

- [ ] **Step 1: Write `functions/api/pints.js`**

```js
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export async function onRequestGet({ request, env }) {
  const status = new URL(request.url).searchParams.get('status');
  try {
    const stmt = status
      ? env.DB.prepare(
          'SELECT * FROM pint_entries WHERE status = ? ORDER BY date_created DESC'
        ).bind(status)
      : env.DB.prepare('SELECT * FROM pint_entries ORDER BY date_created DESC');
    const { results } = await stmt.all();
    return json(results);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const debtor = (body.debtor || '').trim();
  const creditor = (body.creditor || '').trim();
  const description = (body.description || '').trim();
  const amount = Number(body.amount) || 1.0;
  if (!debtor || !creditor) {
    return json({ error: 'debtor and creditor are required' }, 400);
  }
  try {
    const { meta } = await env.DB.prepare(
      'INSERT INTO pint_entries (debtor, creditor, description, amount, date_created, status) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(debtor, creditor, description, amount, new Date().toISOString(), 'pending')
      .run();
    return json({ id: meta.last_row_id }, 201);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
```

- [ ] **Step 2: Write `functions/api/pints/[id].js`**

```js
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export async function onRequestPatch({ params, env }) {
  const id = Number(params.id);
  if (!id) return json({ error: 'Invalid id' }, 400);
  try {
    const { meta } = await env.DB.prepare(
      "UPDATE pint_entries SET status = 'paid', date_paid = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), id)
      .run();
    if (meta.changes === 0) return json({ error: 'Not found' }, 404);
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete({ params, env }) {
  const id = Number(params.id);
  if (!id) return json({ error: 'Invalid id' }, 400);
  try {
    const { meta } = await env.DB.prepare('DELETE FROM pint_entries WHERE id = ?')
      .bind(id)
      .run();
    if (meta.changes === 0) return json({ error: 'Not found' }, 404);
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
```

- [ ] **Step 3: Build static assets** (Pages dev serves `dist/` + `functions/`)

Run: `npm run build`
Expected: `dist/` created with `index.html` + `js/app.js`. (Task 4 removes the Supabase env injection; if run before Task 4 the build still succeeds.)

- [ ] **Step 4: Start a local Pages dev server against local D1**

Run (background): `npx wrangler pages dev dist --d1=DB`
Expected: serves on `http://localhost:8788`, binds `DB` to the local SQLite.

- [ ] **Step 5: Verify each endpoint with curl**

```bash
curl -s localhost:8788/api/pints | head -c 200          # array incl. 13 seeded rows
curl -s -X POST localhost:8788/api/pints \
  -H 'content-type: application/json' \
  -d '{"debtor":"Test","creditor":"Me","description":"plan check","amount":2}'   # {"id":...}
curl -s -X PATCH localhost:8788/api/pints/27   # {"success":true} (use returned id)
curl -s -X DELETE localhost:8788/api/pints/27  # {"success":true}
```
Expected: GET returns a JSON array; POST returns a new id; PATCH/DELETE return `{"success":true}`. Stop the dev server after.

- [ ] **Step 6: Commit**

```bash
git add functions/
git commit -m "Add Pages Functions API for pint_entries on D1"
```

---

### Task 4: Frontend rewrite + build/config cleanup

**Files:**
- Modify: `js/database.js` (rewrite the data-access methods; keep `calculateNetBalances` verbatim)
- Modify: `webpack.common.js` (remove Supabase `DefinePlugin` + duplicate dotenv)
- Modify: `package.json` (drop `@supabase/supabase-js`, add `wrangler` devDep + scripts)

**Interfaces:**
- Consumes: the `/api/*` routes from Task 3.
- Produces: `window.PintDatabase` with the unchanged public method surface used by `js/app.js`.

- [ ] **Step 1: Rewrite `js/database.js`** — replace the Supabase implementation. Keep `calculateNetBalances` EXACTLY as currently written (lines 77–119 of the existing file); only the constructor and the five data methods change.

```js
/**
 * Database layer for Pintwise.
 * Talks to same-origin Cloudflare Pages Functions backed by Cloudflare D1.
 * No credentials in the client.
 */
class PintDatabase {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async _request(path, options = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error || '';
      } catch {
        /* non-JSON error body */
      }
      throw new Error(`Request failed (${res.status}) ${detail}`.trim());
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async addPintEntry(debtor, creditor, description = '', amount = 1.0) {
    const data = await this._request('/pints', {
      method: 'POST',
      body: JSON.stringify({ debtor, creditor, description, amount }),
    });
    return data?.id;
  }

  async getPendingPints() {
    return this._request('/pints?status=pending');
  }

  async getAllPints() {
    return this._request('/pints');
  }

  async markPintAsPaid(id) {
    await this._request(`/pints/${id}`, { method: 'PATCH' });
    return true;
  }

  async deletePintEntry(id) {
    await this._request(`/pints/${id}`, { method: 'DELETE' });
    return true;
  }

  calculateNetBalances(entries) {
    // === KEEP THE EXISTING IMPLEMENTATION VERBATIM (unchanged logic) ===
    const balances = {};

    entries.forEach((entry) => {
      if (entry.status === 'pending') {
        const { debtor, creditor, amount } = entry;

        if (!balances[debtor]) balances[debtor] = {};
        if (!balances[creditor]) balances[creditor] = {};

        if (!balances[debtor][creditor]) balances[debtor][creditor] = 0;
        if (!balances[creditor][debtor]) balances[creditor][debtor] = 0;

        balances[debtor][creditor] += amount;
      }
    });

    const netBalances = [];
    const processed = new Set();

    Object.keys(balances).forEach((person1) => {
      Object.keys(balances[person1]).forEach((person2) => {
        const key = [person1, person2].sort().join('-');
        if (processed.has(key)) return;
        processed.add(key);

        const debt1to2 = balances[person1][person2] || 0;
        const debt2to1 = balances[person2][person1] || 0;
        const netDebt = debt1to2 - debt2to1;

        if (Math.abs(netDebt) > 0.01) {
          netBalances.push({
            debtor: netDebt > 0 ? person1 : person2,
            creditor: netDebt > 0 ? person2 : person1,
            amount: Math.abs(netDebt),
          });
        }
      });
    });

    return netBalances;
  }
}

// Export for use in other modules
window.PintDatabase = PintDatabase;
```

- [ ] **Step 2: Simplify `webpack.common.js`** (remove the Supabase env injection and the duplicate `dotenv` require)

```js
const path = require('path');

module.exports = {
  entry: {
    app: './js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: './js/app.js',
  },
};
```

- [ ] **Step 3: Update `package.json`** — remove the Supabase dependency, add wrangler + scripts. Resulting `scripts`, `devDependencies`, `dependencies`:

```json
"scripts": {
  "test": "node --test scripts/",
  "start": "webpack serve --open --config webpack.config.dev.js",
  "build": "webpack --config webpack.config.prod.js",
  "pages:dev": "npm run build && wrangler pages dev dist --d1=DB",
  "deploy": "npm run build && wrangler pages deploy dist --project-name=pintwise",
  "db:apply": "wrangler d1 execute pintwise --remote --file=schema.sql",
  "migrate:gen": "node scripts/json-to-d1-sql.mjs"
},
```
Remove `"@supabase/supabase-js"` from `dependencies` (leaving `dependencies` empty: `"dependencies": {}`). Add `"wrangler": "^4.0.0"` to `devDependencies`.

- [ ] **Step 4: Install the updated dependencies**

Run: `npm install`
Expected: `@supabase/supabase-js` removed from `node_modules`, `wrangler` present. No errors.

- [ ] **Step 5: Build and confirm no Supabase references remain in the bundle**

Run:
```bash
npm run build
grep -rci "supabase" dist/ || echo "no supabase refs"
```
Expected: build succeeds; grep prints `no supabase refs` (count 0).

- [ ] **Step 6: End-to-end local test through the UI**

Run (background): `npx wrangler pages dev dist --d1=DB`
Then open `http://localhost:8788` and verify:
- All 13 entries load in the lists; stats and balances render.
- Adding a pint works and it appears.
- "Mark Paid" and "Delete" work (confirm dialogs).
Stop the dev server after.

- [ ] **Step 7: Commit**

```bash
git add js/database.js webpack.common.js package.json package-lock.json
git commit -m "Rewrite frontend data layer to call D1-backed API; drop Supabase"
```

---

### Task 5: CI workflow swap + remove Supabase artifacts

**Files:**
- Create: `.github/workflows/deploy-cloudflare-pages.yml`
- Delete: `.github/workflows/jekyll-gh-pages.yml`
- Delete: `.github/workflows/keep-supabase-alive.yml`
- Delete: `supabase-setup.sql`

**Interfaces:**
- Produces: a push-to-`main` workflow that builds and deploys to the `pintwise` Pages project using repo secrets.

- [ ] **Step 1: Write `.github/workflows/deploy-cloudflare-pages.yml`**

```yaml
name: Deploy Pintwise to Cloudflare Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=pintwise
```

- [ ] **Step 2: Delete the obsolete workflows and Supabase schema**

Run:
```bash
git rm .github/workflows/jekyll-gh-pages.yml \
       .github/workflows/keep-supabase-alive.yml \
       supabase-setup.sql
```

- [ ] **Step 3: Validate the new workflow YAML parses**

Run: `npx --yes js-yaml .github/workflows/deploy-cloudflare-pages.yml > /dev/null && echo "valid yaml"`
Expected: `valid yaml`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-cloudflare-pages.yml
git commit -m "Swap GitHub Pages/Supabase CI for Cloudflare Pages deploy"
```

---

### Task 6: Live deploy + custom domain (outward-facing — confirm first)

**Files:** none (uses existing config).

**Interfaces:**
- Consumes: `wrangler.toml`, built `dist/`, deployed Functions.
- Produces: a live `pintwise` Pages project reachable at `pintwise.vsslog.dev`.

- [ ] **Step 1: Confirm with the user before the first live deploy.** (Outward-facing: creates a public Pages project and a DNS record.)

- [ ] **Step 2: Build and deploy**

Run: `npm run deploy`
Expected: creates the `pintwise` project, uploads `dist/` + Functions, prints a `*.pages.dev` URL.

- [ ] **Step 3: Verify Functions are bound to D1 on the deployment**

Run: `curl -s https://pintwise.pages.dev/api/pints | head -c 200`
Expected: JSON array with the 13 rows. (If the binding is missing, attach it: `npx wrangler pages deployment ...` / set the D1 binding for the project, then redeploy.)

- [ ] **Step 4: Attach the custom domain**

Run: `npx wrangler pages domain add pintwise.vsslog.dev --project-name=pintwise`
Expected: domain queued; Cloudflare auto-creates the CNAME in the `vsslog.dev` zone and provisions TLS. (Fallback: add it in Pages dashboard → the project → Custom domains.)

- [ ] **Step 5: Smoke-test the live site**

Open `https://pintwise.vsslog.dev` (allow a minute for TLS). Verify all 13 entries load; add a throwaway pint, mark it paid, delete it.

- [ ] **Step 6: Commit** (nothing to commit unless config changed for the binding; otherwise skip)

---

### Task 7: Docs — runbook + README

**Files:**
- Create: `MIGRATION.md`
- Modify: `README.md`

**Interfaces:** documentation only.

- [ ] **Step 1: Write `MIGRATION.md`** recording the exact commands run (D1 create, schema apply, data import, deploy, domain add) and the one remaining user action: add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (`8046f690745eca812fc58c2f8c2c64a8`) as Actions secrets on `vss96/pintwise`. Note the Supabase keys in `.env` are now unused and may be deleted.

- [ ] **Step 2: Update `README.md`** — replace Supabase setup/config sections with Cloudflare Pages + D1 instructions (local dev via `npm run pages:dev`, deploy via `npm run deploy`, schema in `schema.sql`).

- [ ] **Step 3: Commit**

```bash
git add MIGRATION.md README.md
git commit -m "Document Cloudflare migration and update README"
```

---

## Self-Review

**Spec coverage:**
- Architecture (Pages + Functions + D1) → Tasks 1, 3, 4. ✓
- Schema translation → Task 1. ✓
- Backend Functions (GET/POST/PATCH/DELETE) → Task 3. ✓
- Frontend rewrite, app.js untouched → Task 4. ✓
- Build/config (webpack, wrangler.toml, package.json) → Tasks 1, 4. ✓
- CI swap + delete keep-alive/jekyll/supabase-setup → Task 5. ✓
- Data migration (13 rows, ISO normalization, preserve ids/nulls) → Task 2. ✓
- Custom domain pintwise.vsslog.dev → Task 6. ✓
- Testing (unit for converter, local wrangler integration, prod smoke) → Tasks 2, 3, 4, 6. ✓
- Privacy (gitignore data/SQL) → Tasks 1, 2. ✓

**Placeholder scan:** `PASTE_DATABASE_ID_HERE` (Task 1) is a real runtime value captured in Step 2 of the same task, not an unresolved TODO. No other placeholders.

**Type consistency:** `normalizeTimestamp`/`rowsToSql` names match between impl and test. API shapes (`{id}`, `{success:true}`, array) match `database.js` consumers. `env.DB` binding name consistent across `wrangler.toml` and all Functions. `pintwise` project/db name consistent across tasks.
