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
