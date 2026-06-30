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
