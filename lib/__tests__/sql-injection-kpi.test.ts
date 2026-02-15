/**
 * VULN-002: SQL Injection Prevention — KPI Registry (Focused Suite)
 *
 * This suite is intentionally redundant with broader security tests, and exists
 * to specifically guard the KPI registry query builder against regressions:
 * - Date filters must be parameterized (no string interpolation)
 * - Date input must be strictly validated (YYYY-MM-DD)
 * - Table names must be validated and restricted by allowlist
 */

import fs from 'fs';
import path from 'path';

import {
  isValidDateString,
  isValidSqlIdentifier,
  isValidFieldExpression,
} from '../kpi-registry';

describe('VULN-002 (KPI Registry): date string validation', () => {
  const validDates = ['2026-02-15', '2025-01-01', '2030-12-31', '1999-09-09'];

  test.each(validDates)('accepts valid YYYY-MM-DD date: %s', (date) => {
    expect(isValidDateString(date)).toBe(true);
  });

  const invalidDates = [
    '',
    '2026-2-15',
    '2026-02-5',
    '2026/02/15',
    '15-02-2026',
    '2026-02-15T00:00:00Z',
    '2026-02-15 00:00:00',
    'not-a-date',
    '20260215',
  ];

  test.each(invalidDates)('rejects invalid date format: %s', (date) => {
    expect(isValidDateString(date)).toBe(false);
  });

  const owaspPayloads = [
    // Classic boolean-based
    "' OR '1'='1",
    "' OR 1=1--",
    "2026-02-15' OR '1'='1",
    "2026-02-15' AND '1'='1",

    // UNION-based exfiltration
    "' UNION SELECT * FROM sqlite_master--",
    "2026-02-15' UNION SELECT sql FROM sqlite_master--",

    // Stacked/destructive
    "'; DROP TABLE psionic_stats--",
    "2026-02-15'; DROP TABLE psionic_stats--",
    "2026-02-15'; DELETE FROM psionic_stats--",

    // Comment / encoding / escape tricks
    "%27%20OR%201%3D1--",
    "2026-02-15\'; DROP TABLE psionic_stats--",
    "2026-02-15'--",
    "2026-02-15'/*",
    "2026-02-15'/**/OR/**/1=1--",

    // Edge payloads
    "0 OR 1=1",
  ];

  test.each(owaspPayloads)('rejects SQL injection payload: %s', (payload) => {
    expect(isValidDateString(payload)).toBe(false);
  });

  test("explicitly rejects DROP TABLE payload (regression)", () => {
    expect(isValidDateString("'; DROP TABLE psionic_stats--")).toBe(false);
  });
});

describe('VULN-002 (KPI Registry): identifier + field validation helpers', () => {
  test('accepts safe SQL identifiers', () => {
    expect(isValidSqlIdentifier('psionic_stats')).toBe(true);
    expect(isValidSqlIdentifier('interaction_logs')).toBe(true);
    expect(isValidSqlIdentifier('agent_id')).toBe(true);
    expect(isValidSqlIdentifier('_private')).toBe(true);
  });

  const badIdentifiers = [
    "psionic_stats; DROP TABLE psionic_stats--",
    "psionic_stats UNION SELECT * FROM sqlite_master",
    "psionic_stats --",
    "psionic_stats/*comment*/",
    "psionic_stats' OR '1'='1",
    '123bad',
    '',
  ];

  test.each(badIdentifiers)('rejects suspicious identifier: %s', (name) => {
    expect(isValidSqlIdentifier(name)).toBe(false);
  });

  test('accepts safe field expressions used by KPI configs', () => {
    expect(isValidFieldExpression('COUNT(*) AS total')).toBe(true);
    expect(isValidFieldExpression('AVG(duration_ms) AS latency_ms')).toBe(true);
    expect(isValidFieldExpression('claims_with_citations, total_claims')).toBe(false);
  });

  const badFields = [
    "* FROM psionic_stats; DROP TABLE psionic_stats--",
    "COUNT(*) FROM psionic_stats; DROP TABLE psionic_stats--",
    "1 UNION SELECT sql FROM sqlite_master--",
    "'; DELETE FROM psionic_stats--",
  ];

  test.each(badFields)('rejects dangerous field expressions: %s', (expr) => {
    expect(isValidFieldExpression(expr)).toBe(false);
  });
});

describe('VULN-002 (KPI Registry): source-level regression checks', () => {
  const srcPath = path.resolve(__dirname, '../kpi-registry.ts');

  test('does not interpolate date directly into SQL', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    expect(src).not.toContain("snapshot_date = '${date}'");
    expect(src).not.toContain("DATE(created_at) = '${date}'");
  });

  test('uses parameter placeholders for date predicates', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    expect(src).toContain("snapshot_date = ?");
    expect(src).toContain("DATE(created_at) = ?");
  });

  test('binds date values via params array', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    const pushes = (src.match(/params\.push\(date\)/g) || []).length;
    expect(pushes).toBeGreaterThanOrEqual(2);
  });

  test('validates date string before including in query', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    expect(src).toContain('isValidDateString(date)');
    expect(src).toContain('Invalid date format');
  });

  test('enforces table allowlist in query builder', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    expect(src).toContain('ALLOWED_TABLES');
    expect(src).toMatch(/ALLOWED_TABLES\.has\(source\.table\)/);
  });

  test('fetch path executes prepared statements with bound params', () => {
    const src = fs.readFileSync(srcPath, 'utf-8');
    expect(src).toContain('.get(...params)');
  });
});
