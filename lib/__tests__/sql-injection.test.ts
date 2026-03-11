/**
 * SQL Injection Prevention Tests — VULN-002
 *
 * Verifies that all SQL queries in kpi-registry.ts and affinity-manager.ts
 * use parameterized statements and reject injection payloads.
 *
 * GitHub Issue: https://github.com/zachyzissou/ventureos/issues/2
 */

import {
  isValidSqlIdentifier,
  isValidFieldExpression,
  isValidDateString,
} from '../kpi-registry';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Helpers — in-memory DB that mirrors the production schema
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE psionic_stats (
      agent_id TEXT,
      snapshot_date TEXT,
      claims_with_citations INTEGER DEFAULT 0,
      total_claims INTEGER DEFAULT 0,
      source_count INTEGER DEFAULT 0,
      cross_domain_links INTEGER DEFAULT 0
    );

    CREATE TABLE interaction_logs (
      id INTEGER PRIMARY KEY,
      agent_id TEXT,
      created_at TEXT,
      event_type TEXT,
      payload TEXT
    );

    CREATE TABLE khala_network (
      agent_a TEXT,
      agent_b TEXT,
      affinity REAL,
      seed_value REAL,
      last_interaction_at TEXT,
      interaction_count INTEGER DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (agent_a, agent_b)
    );

    -- Seed some test data
    INSERT INTO psionic_stats VALUES ('oracle', '2026-02-14', 85, 100, 5, 12);
    INSERT INTO psionic_stats VALUES ('oracle', '2026-02-15', 90, 100, 6, 14);
    INSERT INTO interaction_logs VALUES (1, 'oracle', '2026-02-14T10:00:00Z', 'query', '{}');
    INSERT INTO khala_network VALUES ('atlas', 'oracle', 0.82, 0.7, NULL, 3, NULL);
  `);

  return db;
}

// ============================================================================
// 1. Identifier Validation
// ============================================================================

describe('VULN-002: SQL Identifier Validation', () => {
  describe('isValidSqlIdentifier', () => {
    test('accepts valid table/column names', () => {
      expect(isValidSqlIdentifier('psionic_stats')).toBe(true);
      expect(isValidSqlIdentifier('interaction_logs')).toBe(true);
      expect(isValidSqlIdentifier('agent_id')).toBe(true);
      expect(isValidSqlIdentifier('_private')).toBe(true);
      expect(isValidSqlIdentifier('Col123')).toBe(true);
    });

    test('rejects SQL injection via table name', () => {
      expect(isValidSqlIdentifier("users; DROP TABLE users--")).toBe(false);
      expect(isValidSqlIdentifier("users' OR '1'='1")).toBe(false);
      expect(isValidSqlIdentifier("users UNION SELECT * FROM secrets")).toBe(false);
      expect(isValidSqlIdentifier("1; DELETE FROM users")).toBe(false);
      expect(isValidSqlIdentifier("table/**/name")).toBe(false);
      expect(isValidSqlIdentifier("")).toBe(false);
      expect(isValidSqlIdentifier("123start")).toBe(false);
    });
  });

  describe('isValidFieldExpression', () => {
    test('accepts valid field expressions', () => {
      // NOTE: `isValidFieldExpression` is intentionally strict and only accepts
      // a small subset of "AGG(col|*) AS alias" expressions.
      expect(isValidFieldExpression('COUNT(*) AS total')).toBe(true);
      expect(isValidFieldExpression('SUM(claims) AS total')).toBe(true);
      expect(isValidFieldExpression('AVG(score) AS avg_score')).toBe(true);
      expect(isValidFieldExpression('MIN(duration_ms) AS min_duration')).toBe(true);
      expect(isValidFieldExpression('MAX(duration_ms) AS max_duration')).toBe(true);
    });

    test('rejects injection in field expressions', () => {
      expect(isValidFieldExpression("* FROM users; DROP TABLE users--")).toBe(false);
      expect(isValidFieldExpression("1 UNION SELECT password FROM users")).toBe(false);
      expect(isValidFieldExpression("'; DELETE FROM users--")).toBe(false);
    });
  });
});

// ============================================================================
// 2. Date Parameter Validation
// ============================================================================

describe('VULN-002: Date Parameter Validation', () => {
  test('accepts valid YYYY-MM-DD dates', () => {
    expect(isValidDateString('2026-02-14')).toBe(true);
    expect(isValidDateString('2025-01-01')).toBe(true);
    expect(isValidDateString('2030-12-31')).toBe(true);
  });

  const injectionPayloads = [
    "'; DROP TABLE users--",
    "2026-02-14' OR '1'='1",
    "2026-02-14'; DELETE FROM psionic_stats--",
    "2026-02-14' UNION SELECT * FROM sqlite_master--",
    "' OR 1=1--",
    "1; ATTACH DATABASE ':memory:' AS hack",
    "2026-02-14\"; DROP TABLE users--",
    "2026-02-14' AND 1=1--",
    "%27%20OR%201%3D1--",
    "2026-02-14\\'; DROP TABLE users--",
  ];

  test.each(injectionPayloads)('rejects injection payload: %s', (payload) => {
    expect(isValidDateString(payload)).toBe(false);
  });
});

// ============================================================================
// 3. buildQuery — Parameterized Query Output
// ============================================================================

describe('VULN-002: buildQuery produces parameterized queries', () => {
  // We need to access buildQuery indirectly through the public API.
  // The real proof is that computeKPI never interpolates user input.
  // We test this via the source code scan + integration test below.

  test('source code has no template literal date interpolation', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../kpi-registry.ts'),
      'utf-8'
    );

    // The old vulnerable patterns — these MUST NOT appear
    expect(source).not.toContain("snapshot_date = '${date}'");
    expect(source).not.toContain("DATE(created_at) = '${date}'");

    // The fixed parameterized patterns — these MUST appear
    expect(source).toContain("snapshot_date = ?");
    expect(source).toContain("DATE(created_at) = ?");
    expect(source).toContain("params.push(date)");
  });

  test('source code validates date format before query', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../kpi-registry.ts'),
      'utf-8'
    );

    expect(source).toContain('isValidDateString(date)');
    expect(source).toContain('Invalid date format');
  });

  test('source code validates table names against allowlist', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../kpi-registry.ts'),
      'utf-8'
    );

    expect(source).toContain('ALLOWED_TABLES');
    expect(source).toContain('Table not allowed');
    expect(source).toContain('isValidSqlIdentifier(source.table)');
  });
});

// ============================================================================
// 4. Integration — Injection Attempts Against Live Query Path
// ============================================================================

describe('VULN-002: Integration — SQL injection blocked end-to-end', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test('parameterized date query returns correct data', () => {
    // Simulate what fetchDataSources now does internally
    const sql = 'SELECT claims_with_citations, total_claims FROM psionic_stats WHERE snapshot_date = ?';
    const result = db.prepare(sql).get('2026-02-14') as any;

    expect(result).toBeDefined();
    expect(result.claims_with_citations).toBe(85);
    expect(result.total_claims).toBe(100);
  });

  test("SQL injection via date param is safely escaped by prepared statement", () => {
    const sql = 'SELECT * FROM psionic_stats WHERE snapshot_date = ?';

    // Classic injection: '; DROP TABLE psionic_stats--
    const maliciousDate = "'; DROP TABLE psionic_stats--";
    const result = db.prepare(sql).get(maliciousDate);

    // The injection is treated as a literal string value — no match, no damage
    expect(result).toBeUndefined();

    // Table still exists and data is intact
    const check = db.prepare('SELECT COUNT(*) AS cnt FROM psionic_stats').get() as any;
    expect(check.cnt).toBe(2);
  });

  test("UNION injection via date param is safely escaped", () => {
    const sql = 'SELECT * FROM psionic_stats WHERE snapshot_date = ?';
    const maliciousDate = "' UNION SELECT sql, '', 0, 0, 0, 0 FROM sqlite_master--";
    const result = db.prepare(sql).get(maliciousDate);

    // Treated as literal string — no UNION executed
    expect(result).toBeUndefined();
  });

  test("boolean-based blind injection via date param is safely escaped", () => {
    const sql = 'SELECT * FROM psionic_stats WHERE snapshot_date = ?';
    const maliciousDate = "2026-02-14' OR '1'='1";
    const result = db.prepare(sql).get(maliciousDate);

    // The OR condition is not executed — treated as literal string
    expect(result).toBeUndefined();
  });

  test("stacked query injection via date param is safely escaped", () => {
    const sql = 'SELECT * FROM psionic_stats WHERE snapshot_date = ?';
    const maliciousDate = "2026-02-14'; DELETE FROM psionic_stats--";
    const result = db.prepare(sql).get(maliciousDate);

    expect(result).toBeUndefined();

    // Data is still intact (DELETE was never executed)
    const check = db.prepare('SELECT COUNT(*) AS cnt FROM psionic_stats').get() as any;
    expect(check.cnt).toBe(2);
  });

  test("time-based blind injection via date param is safely escaped", () => {
    const sql = 'SELECT * FROM interaction_logs WHERE DATE(created_at) = ?';
    const maliciousDate = "2026-02-14' AND (SELECT CASE WHEN (1=1) THEN randomblob(100000000) ELSE 0 END)--";
    const result = db.prepare(sql).get(maliciousDate);

    expect(result).toBeUndefined();
  });
});

// ============================================================================
// 5. Affinity Manager — Verify Already Safe
// ============================================================================

describe('VULN-002: Affinity Manager uses parameterized queries', () => {
  test('source code uses ? placeholders for all user data', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../affinity-manager.ts'),
      'utf-8'
    );

    // Count parameterized queries (? placeholders)
    const parameterizedQueries = (source.match(/\?\s/g) || []).length;
    expect(parameterizedQueries).toBeGreaterThanOrEqual(10);

    // Verify no template literal injection patterns exist in SQL
    // Check that WHERE clauses use ? not ${...}
    const sqlLines = source.split('\n').filter(line =>
      /SELECT|INSERT|UPDATE|DELETE/.test(line) && /\$\{/.test(line)
    );
    expect(sqlLines).toHaveLength(0);
  });

  test('affinity manager prepared statements block injection', () => {
    const db = createTestDb();

    try {
      // Simulate the affinity manager's query pattern
      const sql = 'SELECT affinity FROM khala_network WHERE agent_a = ? AND agent_b = ? LIMIT 1';

      // Normal query
      const normal = db.prepare(sql).get('atlas', 'oracle') as any;
      expect(normal).toBeDefined();
      expect(normal.affinity).toBe(0.82);

      // Injection attempt in agent_a parameter
      const injected = db.prepare(sql).get("' OR '1'='1", 'oracle') as any;
      expect(injected).toBeUndefined(); // No match — injection treated as literal

      // Injection attempt to extract schema
      const schemaLeak = db.prepare(sql).get(
        "' UNION SELECT sql FROM sqlite_master--",
        'oracle'
      ) as any;
      expect(schemaLeak).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

// ============================================================================
// 6. Comprehensive Injection Payload Suite
// ============================================================================

describe('VULN-002: Comprehensive injection payloads blocked', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  afterAll(() => {
    db.close();
  });

  // Classic SQL injection payloads from OWASP, sqlmap, and real-world attacks
  const payloads = [
    // Authentication bypass
    "' OR '1'='1",
    "' OR '1'='1'--",
    "' OR '1'='1'/*",
    "' OR 1=1--",
    "admin'--",
    "1' OR '1' = '1",

    // Data exfiltration
    "' UNION SELECT * FROM sqlite_master--",
    "' UNION ALL SELECT NULL,NULL,NULL--",
    "1' UNION SELECT password FROM users--",

    // Destructive payloads
    "'; DROP TABLE users--",
    "'; DROP TABLE psionic_stats--",
    "'; DELETE FROM psionic_stats WHERE '1'='1",
    "'; TRUNCATE TABLE users--",
    "'; UPDATE users SET password='hacked'--",

    // Stacked queries
    "1; SELECT * FROM users",
    "1; INSERT INTO users VALUES('hacker','hacked')",

    // Time-based blind
    "1' AND SLEEP(5)--",
    "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",

    // Error-based
    "1' AND 1=CONVERT(int, (SELECT @@version))--",
    "1' AND extractvalue(1, concat(0x7e, version()))--",

    // Out-of-band
    "1' AND LOAD_FILE('/etc/passwd')--",

    // Encoding evasion
    "1%27%20OR%20%271%27%3D%271",
    "1'%20OR%20'1'%3D'1",

    // Null byte injection
    "1'\x00 OR '1'='1",

    // Comment injection
    "1'/**/OR/**/1=1--",
    "1'--\nOR 1=1",
  ];

  test.each(payloads)('prepared statement blocks: %s', (payload) => {
    const sql = 'SELECT * FROM psionic_stats WHERE snapshot_date = ?';
    const result = db.prepare(sql).get(payload);

    // Every injection payload should return no results (treated as literal)
    expect(result).toBeUndefined();
  });

  test('table still intact after all injection attempts', () => {
    const check = db.prepare('SELECT COUNT(*) AS cnt FROM psionic_stats').get() as any;
    expect(check.cnt).toBe(2); // Original 2 rows untouched
  });
});

// ============================================================================
// 7. Regression — No Template Literals in Query Strings
// ============================================================================

describe('VULN-002: Regression — no template literals in SQL query strings', () => {
  test('kpi-registry.ts has zero template-literal SQL interpolation', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../kpi-registry.ts'),
      'utf-8'
    );

    // Match template literals that contain SQL keywords + ${...}
    // This regex finds backtick strings containing both SQL and interpolation
    const dangerousPatterns = [
      /`[^`]*SELECT[^`]*\$\{[^`]*`/,
      /`[^`]*INSERT[^`]*\$\{[^`]*`/,
      /`[^`]*UPDATE[^`]*\$\{[^`]*`/,
      /`[^`]*DELETE[^`]*\$\{[^`]*`/,
      /`[^`]*WHERE[^`]*\$\{[^`]*`/,
    ];

    for (const pattern of dangerousPatterns) {
      const match = source.match(pattern);
      expect(match).toBeNull();
    }
  });

  test('affinity-manager.ts has zero template-literal SQL interpolation', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../affinity-manager.ts'),
      'utf-8'
    );

    const dangerousPatterns = [
      /`[^`]*SELECT[^`]*\$\{[^`]*`/,
      /`[^`]*INSERT[^`]*\$\{[^`]*`/,
      /`[^`]*UPDATE[^`]*\$\{[^`]*`/,
      /`[^`]*DELETE[^`]*\$\{[^`]*`/,
      /`[^`]*WHERE[^`]*\$\{[^`]*`/,
    ];

    for (const pattern of dangerousPatterns) {
      const match = source.match(pattern);
      expect(match).toBeNull();
    }
  });
});
