/**
 * Tests for SharedContextWatcher + AuditStore — Issue #243
 * Phase 3 of #217 (Shared Agent Memory Layer)
 *
 * Validates:
 * - File watcher emits correct events on create/update/delete
 * - Audit trail records all operations with agent attribution
 * - File size enforcement (50KB per file)
 * - Team total size enforcement (2MB per team)
 * - Rate limiting (10 writes/min/agent) with burst tolerance
 * - Debounce coalescing behavior
 * - Failure safety (audit write errors, watcher cleanup on shutdown)
 * - Agent attribution via agent-outputs/ prefix and last-sync.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  SharedContextWatcher as SharedContextWatcherType,
  SharedContextAuditStore as SharedContextAuditStoreType,
} from '../shared-context-watcher';
import type {
  SharedContextEvent,
  SharedContextAuditEntry,
} from '../types/team';

// ─── Test Helpers ───────────────────────────────────────────────────────────

let tmpDir: string;
let auditDbPath: string;
let sharedContextRoot: string;
let teamDir: string;

const TEAM_ID = 'test-team-id-001';
const TEAM_NAME = 'test-team';

// Suppress structured logger output during tests
beforeAll(() => {
  process.env.VENTUREOS_LOG_LEVEL = 'error';
});

afterAll(() => {
  delete process.env.VENTUREOS_LOG_LEVEL;
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-test-'));
  auditDbPath = path.join(tmpDir, 'audit.db');
  sharedContextRoot = path.join(tmpDir, 'shared-context');
  teamDir = path.join(sharedContextRoot, TEAM_NAME);

  // Create team directory structure
  fs.mkdirSync(path.join(teamDir, 'agent-outputs', 'nexus'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'agent-outputs', 'oracle'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'feedback'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'kpis'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'calendar'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, 'roundtable'), { recursive: true });
  fs.mkdirSync(path.join(teamDir, '.meta'), { recursive: true });
  fs.writeFileSync(path.join(teamDir, '.meta', 'last-sync.json'), '{}');
  fs.writeFileSync(path.join(teamDir, '.meta', 'manifest.json'),
    JSON.stringify({ files: [], lastSync: {} }));
  fs.writeFileSync(path.join(teamDir, 'priorities.md'),
    '# Team Priorities\n\n_No priorities set yet._\n');

  // Override shared context path
  process.env.SHARED_CONTEXT = sharedContextRoot;
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SHARED_CONTEXT;
  jest.resetModules();
});

function createWatcher(
  configOverrides?: Record<string, unknown>,
): SharedContextWatcherType {
  const {
    SharedContextWatcher: SCW,
  } = require('../shared-context-watcher') as typeof import('../shared-context-watcher');
  return new SCW(auditDbPath, configOverrides);
}

function createAuditStore(): SharedContextAuditStoreType {
  const {
    SharedContextAuditStore: SCA,
  } = require('../shared-context-watcher') as typeof import('../shared-context-watcher');
  return new SCA(auditDbPath);
}

/**
 * Wait for the watcher to process a file event.
 * Accounts for debounce delay + OS file event latency.
 */
function waitForEvent(ms: number = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number = 1000,
  intervalMs: number = 25,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await waitForEvent(intervalMs);
  }
  throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
}

// ─── Audit Store Tests ──────────────────────────────────────────────────────

describe('SharedContextAuditStore — Schema & CRUD', () => {
  test('creates shared_context_audit table on initialization', () => {
    const store = createAuditStore();
    const Database = require('better-sqlite3');
    const db = new Database(auditDbPath, { readonly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_context_audit'")
      .all();
    expect(tables).toHaveLength(1);
    db.close();
    store.close();
  });

  test('creates required indexes', () => {
    const store = createAuditStore();
    const Database = require('better-sqlite3');
    const db = new Database(auditDbPath, { readonly: true });
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_audit%'")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_audit_team_time');
    expect(indexNames).toContain('idx_audit_agent');
    expect(indexNames).toContain('idx_audit_file');
    db.close();
    store.close();
  });

  test('records and retrieves audit entries', () => {
    const store = createAuditStore();
    const now = new Date().toISOString();

    store.record({
      teamId: TEAM_ID,
      agentId: 'nexus',
      action: 'write',
      filePath: 'priorities.md',
      fileSizeBytes: 256,
      timestamp: now,
    });

    store.record({
      teamId: TEAM_ID,
      agentId: 'oracle',
      action: 'read',
      filePath: 'priorities.md',
      fileSizeBytes: null,
      timestamp: now,
    });

    const teamEntries = store.getByTeam(TEAM_ID);
    expect(teamEntries).toHaveLength(2);
    expect(teamEntries[0].agentId).toBe('oracle'); // Most recent first
    expect(teamEntries[1].agentId).toBe('nexus');

    const agentEntries = store.getByAgent('nexus');
    expect(agentEntries).toHaveLength(1);
    expect(agentEntries[0].action).toBe('write');
    expect(agentEntries[0].fileSizeBytes).toBe(256);

    store.close();
  });

  test('queries by file path', () => {
    const store = createAuditStore();
    const now = new Date().toISOString();

    store.record({
      teamId: TEAM_ID,
      agentId: 'nexus',
      action: 'write',
      filePath: 'priorities.md',
      fileSizeBytes: 100,
      timestamp: now,
    });

    store.record({
      teamId: TEAM_ID,
      agentId: 'nexus',
      action: 'write',
      filePath: 'kpis/daily.json',
      fileSizeBytes: 200,
      timestamp: now,
    });

    const fileEntries = store.getByFile(TEAM_ID, 'priorities.md');
    expect(fileEntries).toHaveLength(1);
    expect(fileEntries[0].filePath).toBe('priorities.md');

    store.close();
  });

  test('records violation entries with detail', () => {
    const store = createAuditStore();

    const entry = store.record({
      teamId: TEAM_ID,
      agentId: 'rogue-agent',
      action: 'violation',
      filePath: 'huge-file.md',
      fileSizeBytes: 100_000,
      timestamp: new Date().toISOString(),
      detail: 'File size exceeds 50KB limit',
    });

    expect(entry.id).toBeTruthy();
    expect(entry.action).toBe('violation');
    expect(entry.detail).toBe('File size exceeds 50KB limit');

    const retrieved = store.getByTeam(TEAM_ID);
    expect(retrieved[0].detail).toBe('File size exceeds 50KB limit');

    store.close();
  });

  test('countRecentWrites tracks writes within time window', () => {
    const store = createAuditStore();
    const now = new Date();

    // Record 5 writes
    for (let i = 0; i < 5; i++) {
      store.record({
        teamId: TEAM_ID,
        agentId: 'nexus',
        action: 'write',
        filePath: `file-${i}.md`,
        fileSizeBytes: 50,
        timestamp: now.toISOString(),
      });
    }

    // Record 2 writes from a different agent
    for (let i = 0; i < 2; i++) {
      store.record({
        teamId: TEAM_ID,
        agentId: 'oracle',
        action: 'write',
        filePath: `file-${i}.md`,
        fileSizeBytes: 50,
        timestamp: now.toISOString(),
      });
    }

    const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
    expect(store.countRecentWrites('nexus', TEAM_ID, oneMinuteAgo)).toBe(5);
    expect(store.countRecentWrites('oracle', TEAM_ID, oneMinuteAgo)).toBe(2);

    store.close();
  });

  test('respects limit parameter on queries', () => {
    const store = createAuditStore();
    const now = new Date().toISOString();

    for (let i = 0; i < 20; i++) {
      store.record({
        teamId: TEAM_ID,
        agentId: 'nexus',
        action: 'write',
        filePath: `file-${i}.md`,
        fileSizeBytes: 10,
        timestamp: now,
      });
    }

    const limited = store.getByTeam(TEAM_ID, 5);
    expect(limited).toHaveLength(5);

    store.close();
  });

  test('idempotent table creation (safe for existing databases)', () => {
    // Create store twice on the same DB
    const store1 = createAuditStore();
    store1.close();
    const store2 = createAuditStore();
    // Should not throw
    store2.record({
      teamId: TEAM_ID,
      agentId: 'nexus',
      action: 'write',
      filePath: 'test.md',
      fileSizeBytes: 10,
      timestamp: new Date().toISOString(),
    });
    store2.close();
  });
});

// ─── Watcher Event Tests ────────────────────────────────────────────────────

describe('SharedContextWatcher — File Events', () => {
  test('emits "change" event on file creation', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    // Ensure FS watcher has attached before first write (avoids CI race on macOS/Linux).
    await waitForEvent(100);

    // Create a file
    fs.writeFileSync(path.join(teamDir, 'feedback', 'note.md'), 'Hello from nexus');
    await waitForEvent(300);

    watcher.close();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const writeEvent = events.find((e) => e.path.includes('feedback/note.md'));
    expect(writeEvent).toBeDefined();
    expect(writeEvent!.type).toBe('write');
    expect(writeEvent!.teamId).toBe(TEAM_ID);
    expect(writeEvent!.sizeBytes).toBeGreaterThan(0);
  });

  test('emits "change" event on file update', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    // Pre-create the file
    fs.writeFileSync(path.join(teamDir, 'priorities.md'), 'Initial content');

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    // Ensure FS watcher has attached before update write (avoids attach race).
    await waitForEvent(100);

    // Update the file
    fs.writeFileSync(path.join(teamDir, 'priorities.md'), 'Updated priorities\n\n1. Ship feature X');
    await waitForEvent(300);

    watcher.close();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const updateEvent = events.find((e) => e.path === 'priorities.md');
    expect(updateEvent).toBeDefined();
    expect(updateEvent!.type).toBe('write');
  });

  test('emits "change" event with type=delete on file removal', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    // Pre-create file
    const filePath = path.join(teamDir, 'feedback', 'temp.md');
    fs.writeFileSync(filePath, 'Temporary');

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);

    // Slight delay to ensure watcher is fully initialized
    await waitForEvent(100);

    // Delete the file
    fs.unlinkSync(filePath);
    await waitForEvent(300);

    watcher.close();

    const deleteEvent = events.find((e) => e.path.includes('temp.md') && e.type === 'delete');
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent!.sizeBytes).toBe(0);
  });

  test('ignores .meta directory changes', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);

    // Write to .meta
    fs.writeFileSync(
      path.join(teamDir, '.meta', 'last-sync.json'),
      JSON.stringify({ nexus: new Date().toISOString() }),
    );
    await waitForEvent(300);

    watcher.close();

    const metaEvents = events.filter((e) => e.path.startsWith('.meta'));
    expect(metaEvents).toHaveLength(0);
  });

  test('records file events in audit trail', async () => {
    const watcher = createWatcher({ debounceMs: 50 });

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      fs.writeFileSync(
        path.join(teamDir, 'agent-outputs', 'nexus', 'report.md'),
        'Daily report content',
      );
      await waitForCondition(
        () =>
          watcher.getAuditByTeam(TEAM_ID).some(
            (e) => e.filePath.includes('report.md') && e.action === 'write',
          ),
        1500,
        25,
      );

      const auditEntries = watcher.getAuditByTeam(TEAM_ID);
      expect(auditEntries.length).toBeGreaterThanOrEqual(1);

      const writeEntry = auditEntries.find((e) =>
        e.filePath.includes('report.md') && e.action === 'write',
      );
      expect(writeEntry).toBeDefined();
      expect(writeEntry!.agentId).toBe('nexus'); // attributed via agent-outputs/ path
    } finally {
      watcher.close();
    }
  });
});

// ─── Agent Attribution Tests ────────────────────────────────────────────────

describe('SharedContextWatcher — Agent Attribution', () => {
  test('attributes agent from agent-outputs/ directory prefix', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      fs.writeFileSync(
        path.join(teamDir, 'agent-outputs', 'oracle', 'analysis.md'),
        'Oracle analysis result',
      );
      await waitForCondition(
        () => events.some((e) => e.path.includes('oracle')),
        1500,
        25,
      );

      const oracleEvent = events.find((e) => e.path.includes('oracle'));
      expect(oracleEvent).toBeDefined();
      expect(oracleEvent!.agentId).toBe('oracle');
    } finally {
      watcher.close();
    }
  });

  test('attributes agent from last-sync.json for non-agent-output files', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    // Set last-sync so nexus is the most recent syncer
    fs.writeFileSync(
      path.join(teamDir, '.meta', 'last-sync.json'),
      JSON.stringify({
        nexus: new Date().toISOString(),
        oracle: '2020-01-01T00:00:00.000Z',
      }),
    );

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      fs.writeFileSync(path.join(teamDir, 'priorities.md'), 'Updated by nexus');
      await waitForCondition(
        () => events.some((e) => e.path === 'priorities.md'),
        1500,
        25,
      );

      const priorityEvent = events.find((e) => e.path === 'priorities.md');
      expect(priorityEvent).toBeDefined();
      expect(priorityEvent!.agentId).toBe('nexus');
    } finally {
      watcher.close();
    }
  });

  test('falls back to "unknown" when no attribution is possible', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    // Ensure last-sync.json is empty
    fs.writeFileSync(path.join(teamDir, '.meta', 'last-sync.json'), '{}');

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      fs.writeFileSync(path.join(teamDir, 'kpis', 'metric.json'), '{"value": 42}');
      await waitForCondition(
        () => events.some((e) => e.path.includes('metric.json')),
        1500,
        25,
      );

      const kpiEvent = events.find((e) => e.path.includes('metric.json'));
      expect(kpiEvent).toBeDefined();
      expect(kpiEvent!.agentId).toBe('unknown');
    } finally {
      watcher.close();
    }
  });
});

// ─── Enforcement Tests ──────────────────────────────────────────────────────

describe('SharedContextWatcher — File Size Enforcement', () => {
  test('validateWrite rejects files exceeding 50KB', () => {
    const watcher = createWatcher();

    expect(() => {
      watcher.validateWrite(
        TEAM_ID,
        TEAM_NAME,
        'nexus',
        'huge-file.md',
        60 * 1024, // 60KB
      );
    }).toThrow(/exceeds the 51200 byte limit/);

    // Violation should be recorded in audit
    const audit = watcher.getAuditByTeam(TEAM_ID);
    expect(audit.some((e) => e.action === 'violation')).toBe(true);

    watcher.close();
  });

  test('validateWrite allows files under 50KB', () => {
    const watcher = createWatcher();

    expect(() => {
      watcher.validateWrite(
        TEAM_ID,
        TEAM_NAME,
        'nexus',
        'small-file.md',
        1024, // 1KB
      );
    }).not.toThrow();

    watcher.close();
  });

  test('validateWrite rejects when team total would exceed 2MB', () => {
    const watcher = createWatcher({
      maxTeamTotalBytes: 2048, // Small limit for testing
    });

    // Pre-fill the directory to near the limit
    fs.writeFileSync(
      path.join(teamDir, 'feedback', 'big-file.md'),
      'x'.repeat(2000),
    );

    expect(() => {
      watcher.validateWrite(
        TEAM_ID,
        TEAM_NAME,
        'nexus',
        'extra.md',
        100, // This would push over 2048
      );
    }).toThrow(/would exceed the 2048 byte team limit/);

    watcher.close();
  });

  test('emits "violation" event for size violations', () => {
    const watcher = createWatcher();
    const violations: SharedContextAuditEntry[] = [];

    watcher.on('violation', (entry: SharedContextAuditEntry) => violations.push(entry));

    try {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'big.md', 100_000);
    } catch {
      // expected
    }

    expect(violations).toHaveLength(1);
    expect(violations[0].action).toBe('violation');
    expect(violations[0].detail).toContain('File size');

    watcher.close();
  });
});

describe('SharedContextWatcher — Rate Limiting', () => {
  test('allows writes within rate limit', () => {
    const watcher = createWatcher({ maxWritesPerMinutePerAgent: 5 });

    // 5 writes should all succeed
    for (let i = 0; i < 5; i++) {
      expect(() => {
        watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', `file-${i}.md`, 100);
      }).not.toThrow();
    }

    watcher.close();
  });

  test('rejects writes exceeding rate limit', () => {
    const watcher = createWatcher({ maxWritesPerMinutePerAgent: 3 });

    // Use up the rate limit
    for (let i = 0; i < 3; i++) {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', `file-${i}.md`, 100);
    }

    // 4th write should be rejected
    expect(() => {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-3.md', 100);
    }).toThrow(/rate limit/i);

    watcher.close();
  });

  test('rate limit is per-agent (different agents have independent limits)', () => {
    const watcher = createWatcher({ maxWritesPerMinutePerAgent: 2 });

    // Agent nexus uses both writes
    watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-0.md', 100);
    watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-1.md', 100);

    // nexus is now rate limited
    expect(() => {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-2.md', 100);
    }).toThrow(/rate limit/i);

    // oracle should still be allowed
    expect(() => {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'oracle', 'oracle-file.md', 100);
    }).not.toThrow();

    watcher.close();
  });

  test('records violation in audit trail when rate limited', () => {
    const watcher = createWatcher({ maxWritesPerMinutePerAgent: 1 });

    watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-0.md', 100);

    try {
      watcher.validateWrite(TEAM_ID, TEAM_NAME, 'nexus', 'file-1.md', 100);
    } catch {
      // expected
    }

    const audit = watcher.getAuditByTeam(TEAM_ID);
    const violation = audit.find((e) => e.action === 'violation' && e.detail?.includes('Rate limit'));
    expect(violation).toBeDefined();

    watcher.close();
  });
});

// ─── Debounce / Coalescing Tests ────────────────────────────────────────────

describe('SharedContextWatcher — Debounce Coalescing', () => {
  test('coalesces rapid writes into a single event', async () => {
    const watcher = createWatcher({ debounceMs: 150 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      const filePath = path.join(teamDir, 'priorities.md');

      // Rapid writes within the debounce window
      fs.writeFileSync(filePath, 'Version 1');
      fs.writeFileSync(filePath, 'Version 2');
      fs.writeFileSync(filePath, 'Version 3 — final');

      // Wait until at least one coalesced event is observed.
      await waitForCondition(
        () => events.some((e) => e.path === 'priorities.md'),
        1500,
        25,
      );

      // Should have coalesced into 1 event (or very few — platform may emit 1-2)
      const priorityEvents = events.filter((e) => e.path === 'priorities.md');
      expect(priorityEvents.length).toBeLessThanOrEqual(2); // Coalesced
      expect(priorityEvents.length).toBeGreaterThanOrEqual(1);
    } finally {
      watcher.close();
    }
  });

  test('separate files are not coalesced', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    try {
      await waitForEvent(75);

      // Write to different files
      fs.writeFileSync(path.join(teamDir, 'feedback', 'a.md'), 'File A');
      fs.writeFileSync(path.join(teamDir, 'feedback', 'b.md'), 'File B');

      await waitForCondition(
        () => events.some((e) => e.path.includes('a.md')) && events.some((e) => e.path.includes('b.md')),
        1500,
        25,
      );

      // Both files should get events
      const fileA = events.find((e) => e.path.includes('a.md'));
      const fileB = events.find((e) => e.path.includes('b.md'));
      expect(fileA).toBeDefined();
      expect(fileB).toBeDefined();
    } finally {
      watcher.close();
    }
  });
});

// ─── Watcher Lifecycle Tests ────────────────────────────────────────────────

describe('SharedContextWatcher — Lifecycle & Safety', () => {
  test('watchTeam is idempotent', () => {
    const watcher = createWatcher();

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    watcher.watchTeam(TEAM_ID, TEAM_NAME); // Should not throw or double-watch

    expect(watcher.isWatching(TEAM_ID)).toBe(true);
    expect(watcher.watchCount).toBe(1);

    watcher.close();
  });

  test('unwatchTeam removes the watcher', () => {
    const watcher = createWatcher();

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    expect(watcher.isWatching(TEAM_ID)).toBe(true);

    watcher.unwatchTeam(TEAM_ID);
    expect(watcher.isWatching(TEAM_ID)).toBe(false);
    expect(watcher.watchCount).toBe(0);

    watcher.close();
  });

  test('close() cleans up all watchers and timers', async () => {
    const watcher = createWatcher({ debounceMs: 50 });

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    expect(watcher.watchCount).toBe(1);

    // Trigger a write to create a pending debounce timer
    fs.writeFileSync(path.join(teamDir, 'priorities.md'), 'trigger debounce');

    watcher.close();

    // After close, watchCount should be 0
    expect(watcher.watchCount).toBe(0);
    expect(watcher.isWatching(TEAM_ID)).toBe(false);
  });

  test('close() is safe to call multiple times', () => {
    const watcher = createWatcher();
    watcher.watchTeam(TEAM_ID, TEAM_NAME);

    expect(() => {
      watcher.close();
      watcher.close();
      watcher.close();
    }).not.toThrow();
  });

  test('no events emitted after close()', async () => {
    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    watcher.close();

    // Write after close
    fs.writeFileSync(path.join(teamDir, 'feedback', 'post-close.md'), 'Should be ignored');
    await waitForEvent(300);

    // No events should have been captured (watcher is closed)
    const postCloseEvents = events.filter((e) => e.path.includes('post-close'));
    expect(postCloseEvents).toHaveLength(0);
  });

  test('watchTeam handles non-existent directory gracefully', () => {
    const watcher = createWatcher();

    // Attempt to watch a directory that doesn't exist
    watcher.watchTeam('nonexistent-team', 'does-not-exist');

    // Should not throw, and should not be watching
    expect(watcher.isWatching('nonexistent-team')).toBe(false);

    watcher.close();
  });

  test('watchTeam does nothing after close', () => {
    const watcher = createWatcher();
    watcher.close();

    // Should be a no-op after close
    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    expect(watcher.isWatching(TEAM_ID)).toBe(false);
  });
});

// ─── Directory Size Calculation Tests ───────────────────────────────────────

describe('SharedContextWatcher — Directory Size', () => {
  test('calculateDirectorySize returns correct total', () => {
    const watcher = createWatcher();

    // Write known-size files
    fs.writeFileSync(path.join(teamDir, 'feedback', 'a.md'), 'a'.repeat(100));
    fs.writeFileSync(path.join(teamDir, 'feedback', 'b.md'), 'b'.repeat(200));
    fs.writeFileSync(path.join(teamDir, 'kpis', 'c.json'), 'c'.repeat(300));

    // priorities.md already exists with some content
    const prioritiesSize = fs.statSync(path.join(teamDir, 'priorities.md')).size;

    const totalSize = watcher.calculateDirectorySize(teamDir);
    expect(totalSize).toBe(100 + 200 + 300 + prioritiesSize);

    watcher.close();
  });

  test('calculateDirectorySize excludes .meta directory', () => {
    const watcher = createWatcher();

    // Write to .meta
    fs.writeFileSync(path.join(teamDir, '.meta', 'big-meta.json'), 'x'.repeat(10000));

    // Write a normal file
    fs.writeFileSync(path.join(teamDir, 'feedback', 'normal.md'), 'n'.repeat(50));

    const prioritiesSize = fs.statSync(path.join(teamDir, 'priorities.md')).size;
    const totalSize = watcher.calculateDirectorySize(teamDir);

    // Should NOT include the 10KB .meta file
    expect(totalSize).toBe(50 + prioritiesSize);

    watcher.close();
  });
});

// ─── Integration: Watcher + Audit Trail ─────────────────────────────────────

describe('SharedContextWatcher — Integration', () => {
  test('file events are recorded in audit trail with correct timestamps', async () => {
    const watcher = createWatcher({ debounceMs: 50 });

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    await waitForEvent(120);

    const before = new Date().toISOString();
    fs.writeFileSync(
      path.join(teamDir, 'agent-outputs', 'nexus', 'status.md'),
      'All systems go',
    );
    await waitForEvent(450);
    const after = new Date().toISOString();

    const audit = watcher.getAuditByTeam(TEAM_ID);
    expect(audit.length).toBeGreaterThanOrEqual(1);

    const entry = audit.find((e) => e.filePath.includes('status.md'));
    expect(entry).toBeDefined();
    expect(entry!.timestamp >= before).toBe(true);
    expect(entry!.timestamp <= after).toBe(true);
    expect(entry!.agentId).toBe('nexus');

    watcher.close();
  });

  test('audit entries queryable by agent across multiple teams', () => {
    const store = createAuditStore();
    const now = new Date().toISOString();

    store.record({
      teamId: 'team-alpha',
      agentId: 'nexus',
      action: 'write',
      filePath: 'alpha-file.md',
      fileSizeBytes: 100,
      timestamp: now,
    });

    store.record({
      teamId: 'team-beta',
      agentId: 'nexus',
      action: 'write',
      filePath: 'beta-file.md',
      fileSizeBytes: 200,
      timestamp: now,
    });

    const nexusEntries = store.getByAgent('nexus');
    expect(nexusEntries).toHaveLength(2);

    store.close();
  });

  test('multiple teams can be watched simultaneously', async () => {
    // Create a second team directory
    const team2Dir = path.join(sharedContextRoot, 'team-two');
    fs.mkdirSync(path.join(team2Dir, 'feedback'), { recursive: true });
    fs.mkdirSync(path.join(team2Dir, '.meta'), { recursive: true });
    fs.writeFileSync(path.join(team2Dir, '.meta', 'last-sync.json'), '{}');

    const watcher = createWatcher({ debounceMs: 50 });
    const events: SharedContextEvent[] = [];

    watcher.on('change', (evt: SharedContextEvent) => events.push(evt));

    watcher.watchTeam(TEAM_ID, TEAM_NAME);
    watcher.watchTeam('team-two-id', 'team-two');

    expect(watcher.watchCount).toBe(2);

    // Give fs.watch time to attach both watchers before emitting writes.
    await waitForEvent(120);

    fs.writeFileSync(path.join(teamDir, 'feedback', 'team1.md'), 'From team 1');
    fs.writeFileSync(path.join(team2Dir, 'feedback', 'team2.md'), 'From team 2');

    await waitForEvent(450);
    watcher.close();

    const team1Events = events.filter((e) => e.teamId === TEAM_ID);
    const team2Events = events.filter((e) => e.teamId === 'team-two-id');

    expect(team1Events.length).toBeGreaterThanOrEqual(1);
    expect(team2Events.length).toBeGreaterThanOrEqual(1);
  });
});
