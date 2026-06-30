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
