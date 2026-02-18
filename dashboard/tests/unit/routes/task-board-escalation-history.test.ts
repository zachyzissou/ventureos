/**
 * Escalation History tests — Issue #219, Phase 22.
 *
 * Tests for:
 * - Event recording correctness (appendEscalationEvent, appendEscalationReset)
 * - Retention/limit behavior (pruneEscalationHistory, bounded max events/age)
 * - API filtering correctness (queryEscalationHistory with all filter combos)
 * - Secret-safe output (no raw URLs, secrets, or payloads in persisted events)
 * - Regression safety (existing escalation policy + status are unaffected)
 * - GET /api/task-board/escalation/history — API endpoint
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readEscalationHistory,
  appendEscalationEvent,
  appendEscalationReset,
  pruneEscalationHistory,
  queryEscalationHistory,
  truncateError,
} from '../../../server/escalation-history.js';
import type {
  EscalationHistoryEvent,
  EscalationHistoryFile,
  EscalationHistoryResponse,
  EscalationEventType,
  EscalationDeliveryOutcome,
} from '../../../server/escalation-history.js';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esc-hist-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const NOW = 1_700_000_000_000;

function makeDelivery(overrides: Partial<EscalationDeliveryOutcome> = {}): EscalationDeliveryOutcome {
  return {
    targetId: 'slack',
    targetName: 'Slack',
    success: true,
    statusCode: 200,
    attempts: 1,
    durationMs: 150,
    error: null,
    ...overrides,
  };
}

function makeEvent(
  overrides: Partial<Omit<EscalationHistoryEvent, 'id'>> = {},
): Omit<EscalationHistoryEvent, 'id' | 'ts'> & { ts?: number } {
  return {
    ts: NOW,
    eventType: 'tier_triggered',
    tierIndex: 0,
    tierLabel: 'Page on-call',
    qualifyingSeverity: 'critical',
    qualifyingDurationMs: 300_000,
    reason: 'tier 1 triggered (300s persisted, threshold 300s)',
    deliveries: [makeDelivery()],
    deliverySuccessCount: 1,
    deliveryFailureCount: 0,
    ...overrides,
  };
}

// ─── readEscalationHistory() ─────────────────────────────────────────────────

describe('readEscalationHistory()', () => {
  it('returns empty history when file does not exist', () => {
    const result = readEscalationHistory(tmpDir);
    expect(result.version).toBe(1);
    expect(result.events).toEqual([]);
    expect(result.nextId).toBe(1);
  });

  it('returns empty history for corrupt file', () => {
    fs.writeFileSync(path.join(tmpDir, 'task-board-escalation-history.json'), 'NOT JSON');
    const result = readEscalationHistory(tmpDir);
    expect(result.events).toEqual([]);
    expect(result.nextId).toBe(1);
  });

  it('returns empty history for wrong version', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'task-board-escalation-history.json'),
      JSON.stringify({ version: 99, events: [] }),
    );
    const result = readEscalationHistory(tmpDir);
    expect(result.events).toEqual([]);
  });

  it('reads valid history file', () => {
    const data: EscalationHistoryFile = {
      version: 1,
      events: [{
        id: 1, ts: NOW, eventType: 'tier_triggered', tierIndex: 0,
        tierLabel: 'T1', qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
        reason: 'test', deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
      }],
      nextId: 2,
    };
    fs.writeFileSync(
      path.join(tmpDir, 'task-board-escalation-history.json'),
      JSON.stringify(data),
    );
    const result = readEscalationHistory(tmpDir);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe(1);
    expect(result.nextId).toBe(2);
  });
});

// ─── truncateError() ─────────────────────────────────────────────────────────

describe('truncateError()', () => {
  it('returns null for null input', () => {
    expect(truncateError(null)).toBeNull();
  });

  it('returns short strings unchanged', () => {
    expect(truncateError('short error')).toBe('short error');
  });

  it('truncates strings over 200 chars', () => {
    const long = 'x'.repeat(300);
    const result = truncateError(long);
    expect(result!.length).toBe(200);
    expect(result!.endsWith('...')).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(truncateError('')).toBeNull();
  });
});

// ─── appendEscalationEvent() — Event Recording Correctness ──────────────────

describe('appendEscalationEvent()', () => {
  it('records a tier_triggered event with correct fields', () => {
    const id = appendEscalationEvent(tmpDir, makeEvent());
    expect(id).toBe(1);

    const history = readEscalationHistory(tmpDir);
    expect(history.events).toHaveLength(1);
    const ev = history.events[0];
    expect(ev.id).toBe(1);
    expect(ev.ts).toBe(NOW);
    expect(ev.eventType).toBe('tier_triggered');
    expect(ev.tierIndex).toBe(0);
    expect(ev.tierLabel).toBe('Page on-call');
    expect(ev.qualifyingSeverity).toBe('critical');
    expect(ev.qualifyingDurationMs).toBe(300_000);
    expect(ev.deliveries).toHaveLength(1);
    expect(ev.deliveries[0].targetId).toBe('slack');
    expect(ev.deliveries[0].success).toBe(true);
    expect(ev.deliverySuccessCount).toBe(1);
    expect(ev.deliveryFailureCount).toBe(0);
  });

  it('records a tier_renotified event', () => {
    const id = appendEscalationEvent(tmpDir, makeEvent({
      eventType: 'tier_renotified',
      reason: 'tier 1 re-notification (cooldown expired)',
    }));
    expect(id).toBe(1);
    const ev = readEscalationHistory(tmpDir).events[0];
    expect(ev.eventType).toBe('tier_renotified');
  });

  it('assigns monotonically increasing IDs', () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW }));
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + 1000 }));
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + 2000 }));

    const history = readEscalationHistory(tmpDir);
    expect(history.events.map(e => e.id)).toEqual([1, 2, 3]);
    expect(history.nextId).toBe(4);
  });

  it('truncates long error strings in delivery outcomes', () => {
    const longError = 'E'.repeat(500);
    const id = appendEscalationEvent(tmpDir, makeEvent({
      deliveries: [makeDelivery({ error: longError, success: false })],
      deliverySuccessCount: 0,
      deliveryFailureCount: 1,
    }));
    expect(id).toBe(1);

    const ev = readEscalationHistory(tmpDir).events[0];
    expect(ev.deliveries[0].error!.length).toBe(200);
    expect(ev.deliveries[0].error!.endsWith('...')).toBe(true);
  });

  it('records multiple deliveries per event', () => {
    const id = appendEscalationEvent(tmpDir, makeEvent({
      deliveries: [
        makeDelivery({ targetId: 'slack', success: true }),
        makeDelivery({ targetId: 'discord', targetName: 'Discord', success: false, statusCode: 500, error: 'Server Error' }),
      ],
      deliverySuccessCount: 1,
      deliveryFailureCount: 1,
    }));
    expect(id).toBe(1);
    const ev = readEscalationHistory(tmpDir).events[0];
    expect(ev.deliveries).toHaveLength(2);
    expect(ev.deliveries[0].targetId).toBe('slack');
    expect(ev.deliveries[1].targetId).toBe('discord');
    expect(ev.deliveries[1].error).toBe('Server Error');
  });

  it('returns null on write failure (non-existent deep path)', () => {
    // Create a file where the dir should be, so mkdir fails
    const badDir = path.join(tmpDir, 'blocked');
    fs.writeFileSync(badDir, 'block');
    const id = appendEscalationEvent(path.join(badDir, 'deep'), makeEvent());
    expect(id).toBeNull();
  });
});

// ─── appendEscalationReset() ─────────────────────────────────────────────────

describe('appendEscalationReset()', () => {
  it('records a reset event with correct fields', () => {
    const id = appendEscalationReset(tmpDir, {
      qualifyingSeverity: 'critical',
      qualifyingDurationMs: 600_000,
      ts: NOW,
    });
    expect(id).toBe(1);

    const ev = readEscalationHistory(tmpDir).events[0];
    expect(ev.eventType).toBe('escalation_reset');
    expect(ev.tierIndex).toBeNull();
    expect(ev.tierLabel).toBeNull();
    expect(ev.qualifyingSeverity).toBe('critical');
    expect(ev.qualifyingDurationMs).toBe(600_000);
    expect(ev.deliveries).toEqual([]);
    expect(ev.deliverySuccessCount).toBe(0);
    expect(ev.deliveryFailureCount).toBe(0);
    expect(ev.reason).toContain('reset');
  });

  it('works alongside regular events', () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW }));
    appendEscalationReset(tmpDir, {
      qualifyingSeverity: 'critical',
      qualifyingDurationMs: 600_000,
      ts: NOW + 5000,
    });
    const history = readEscalationHistory(tmpDir);
    expect(history.events).toHaveLength(2);
    expect(history.events[0].eventType).toBe('tier_triggered');
    expect(history.events[1].eventType).toBe('escalation_reset');
    expect(history.events[0].id).toBe(1);
    expect(history.events[1].id).toBe(2);
  });
});

// ─── pruneEscalationHistory() — Retention/Limit Behavior ────────────────────

describe('pruneEscalationHistory()', () => {
  function makeMinimalEvent(ts: number, id: number): EscalationHistoryEvent {
    return {
      id, ts, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'T1',
      qualifyingSeverity: 'critical', qualifyingDurationMs: 300_000,
      reason: 'test', deliveries: [], deliverySuccessCount: 0, deliveryFailureCount: 0,
    };
  }

  it('removes events older than maxAgeMs', () => {
    const ms48h = 48 * 60 * 60 * 1000;
    const events = [
      makeMinimalEvent(NOW - ms48h - 10_000, 1), // just past 48h — should be pruned
      makeMinimalEvent(NOW - ms48h + 10_000, 2), // just within 48h — should remain
      makeMinimalEvent(NOW - 1000, 3),            // recent — should remain
    ];
    const result = pruneEscalationHistory(events, { maxAgeMs: ms48h, now: NOW });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(3);
  });

  it('caps at maxEvents keeping most recent', () => {
    const events = Array.from({ length: 250 }, (_, i) =>
      makeMinimalEvent(NOW - (250 - i) * 1000, i + 1),
    );
    const result = pruneEscalationHistory(events, { maxEvents: 200, now: NOW });
    expect(result).toHaveLength(200);
    expect(result[0].id).toBe(51);  // oldest kept
    expect(result[199].id).toBe(250); // most recent
  });

  it('applies both age and count limits', () => {
    const events = Array.from({ length: 300 }, (_, i) =>
      makeMinimalEvent(NOW - (300 - i) * 1000, i + 1),
    );
    const result = pruneEscalationHistory(events, {
      maxEvents: 100,
      maxAgeMs: 200_000, // only events within 200s
      now: NOW,
    });
    // 200 events within age window, then capped to 100
    expect(result.length).toBeLessThanOrEqual(100);
    // All events should be within age window
    for (const e of result) {
      expect(NOW - e.ts).toBeLessThanOrEqual(200_000);
    }
  });

  it('returns empty array when all events are expired', () => {
    const events = [
      makeMinimalEvent(NOW - 1_000_000_000, 1),
      makeMinimalEvent(NOW - 500_000_000, 2),
    ];
    const result = pruneEscalationHistory(events, { maxAgeMs: 1000, now: NOW });
    expect(result).toEqual([]);
  });

  it('does not mutate input array', () => {
    const events = [makeMinimalEvent(NOW - 1000, 1)];
    const original = [...events];
    pruneEscalationHistory(events, { maxEvents: 0, now: NOW });
    expect(events).toEqual(original);
  });
});

describe('appendEscalationEvent retention behavior', () => {
  it('prunes on append when exceeding maxEvents', () => {
    // Seed 200 events
    for (let i = 0; i < 200; i++) {
      appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + i * 1000 }), { maxEvents: 200 });
    }
    let history = readEscalationHistory(tmpDir);
    expect(history.events).toHaveLength(200);

    // Add one more — should still be 200
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW + 300_000 }), { maxEvents: 200 });
    history = readEscalationHistory(tmpDir);
    expect(history.events).toHaveLength(200);
    // Oldest should have been pruned
    expect(history.events[0].id).toBe(2);
  });

  it('prunes by age on append', () => {
    // Add an old event
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW - 200_000_000 }), {
      maxAgeMs: 48 * 60 * 60 * 1000,
    });
    // Add a recent event — old one should be pruned
    appendEscalationEvent(tmpDir, makeEvent({ ts: NOW }), {
      maxAgeMs: 48 * 60 * 60 * 1000,
    });
    const history = readEscalationHistory(tmpDir);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].ts).toBe(NOW);
  });
});

// ─── queryEscalationHistory() — API Filtering Correctness ────────────────────

describe('queryEscalationHistory()', () => {
  function seedEvents() {
    // Seed a variety of events
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW - 3000, eventType: 'tier_triggered', tierIndex: 0, tierLabel: 'Tier 1',
      deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }));
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW - 2000, eventType: 'tier_triggered', tierIndex: 1, tierLabel: 'Tier 2',
      deliveries: [makeDelivery({ success: false, error: 'Timeout', statusCode: null })],
      deliverySuccessCount: 0, deliveryFailureCount: 1,
    }));
    appendEscalationEvent(tmpDir, makeEvent({
      ts: NOW - 1000, eventType: 'tier_renotified', tierIndex: 0, tierLabel: 'Tier 1',
      deliveries: [makeDelivery({ success: true })], deliverySuccessCount: 1, deliveryFailureCount: 0,
    }));
    appendEscalationReset(tmpDir, {
      qualifyingSeverity: 'critical', qualifyingDurationMs: 600_000, ts: NOW,
    });
  }

  it('returns all events with no filters', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { now: NOW + 1 });
    expect(result.count).toBe(4);
    // Most-recent-first ordering
    expect(result.events[0].eventType).toBe('escalation_reset');
    expect(result.events[3].eventType).toBe('tier_triggered');
  });

  it('filters by eventType', () => {
    seedEvents();
    const triggered = queryEscalationHistory(tmpDir, { eventType: 'tier_triggered', now: NOW + 1 });
    expect(triggered.count).toBe(2);
    expect(triggered.events.every(e => e.eventType === 'tier_triggered')).toBe(true);

    const resets = queryEscalationHistory(tmpDir, { eventType: 'escalation_reset', now: NOW + 1 });
    expect(resets.count).toBe(1);
    expect(resets.events[0].eventType).toBe('escalation_reset');
  });

  it('filters by tierIndex', () => {
    seedEvents();
    const tier0 = queryEscalationHistory(tmpDir, { tierIndex: 0, now: NOW + 1 });
    expect(tier0.count).toBe(2); // triggered + renotified
    expect(tier0.events.every(e => e.tierIndex === 0)).toBe(true);

    const tier1 = queryEscalationHistory(tmpDir, { tierIndex: 1, now: NOW + 1 });
    expect(tier1.count).toBe(1);
    expect(tier1.events[0].tierIndex).toBe(1);
  });

  it('filters by deliveryStatus=success', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { deliveryStatus: 'success', now: NOW + 1 });
    expect(result.count).toBe(2); // tier_triggered[0] + tier_renotified[0]
    expect(result.events.every(e => e.deliverySuccessCount > 0)).toBe(true);
  });

  it('filters by deliveryStatus=failure', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { deliveryStatus: 'failure', now: NOW + 1 });
    expect(result.count).toBe(1); // tier_triggered[1] failed
    expect(result.events[0].deliveryFailureCount).toBeGreaterThan(0);
  });

  it('filters by sinceMs time window', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { sinceMs: 1500, now: NOW + 1 });
    // Events at NOW-1000 and NOW are within 1500ms of NOW+1
    expect(result.count).toBe(2);
  });

  it('applies limit correctly', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { limit: 2, now: NOW + 1 });
    expect(result.count).toBe(2);
    expect(result.events).toHaveLength(2);
    // Most recent 2
    expect(result.events[0].eventType).toBe('escalation_reset');
    expect(result.events[1].eventType).toBe('tier_renotified');
  });

  it('clamps limit to [1, 200]', () => {
    seedEvents();
    const r1 = queryEscalationHistory(tmpDir, { limit: 0, now: NOW + 1 });
    expect(r1.count).toBe(1); // clamped to 1

    const r2 = queryEscalationHistory(tmpDir, { limit: 999, now: NOW + 1 });
    expect(r2.count).toBe(4); // clamped to 200, but only 4 events
  });

  it('combines multiple filters', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, {
      eventType: 'tier_triggered',
      tierIndex: 0,
      deliveryStatus: 'success',
      now: NOW + 1,
    });
    expect(result.count).toBe(1);
    expect(result.events[0].tierIndex).toBe(0);
    expect(result.events[0].eventType).toBe('tier_triggered');
  });

  it('returns correct summary statistics', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { now: NOW + 1 });
    expect(result.summary.totalEvents).toBe(4);
    expect(result.summary.returnedEvents).toBe(4);
    expect(result.summary.eventTypeCounts.tier_triggered).toBe(2);
    expect(result.summary.eventTypeCounts.tier_renotified).toBe(1);
    expect(result.summary.eventTypeCounts.escalation_reset).toBe(1);
    expect(result.summary.totalNotificationsSent).toBe(3);
    expect(result.summary.totalNotificationSuccesses).toBe(2);
    expect(result.summary.totalNotificationFailures).toBe(1);
    expect(result.summary.tierIndices).toEqual([0, 1]);
    expect(result.summary.latestEventTs).toBe(NOW); // most recent event
    expect(result.summary.oldestEventTs).toBe(NOW - 3000);
  });

  it('returns empty response for empty directory', () => {
    const result = queryEscalationHistory(tmpDir, { now: NOW });
    expect(result.count).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.summary.totalEvents).toBe(0);
    expect(result.summary.latestEventTs).toBeNull();
    expect(result.summary.oldestEventTs).toBeNull();
  });

  it('events are ordered most-recent-first', () => {
    seedEvents();
    const result = queryEscalationHistory(tmpDir, { now: NOW + 1 });
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i - 1].ts).toBeGreaterThanOrEqual(result.events[i].ts);
    }
  });
});

// ─── Secret-Safe Output ─────────────────────────────────────────────────────

describe('secret-safe output', () => {
  it('does not store raw webhook URLs in events', () => {
    appendEscalationEvent(tmpDir, makeEvent({
      deliveries: [makeDelivery({ targetId: 'slack', targetName: 'Slack' })],
    }));
    const raw = fs.readFileSync(
      path.join(tmpDir, 'task-board-escalation-history.json'),
      'utf8',
    );
    // No URL fields should appear
    expect(raw).not.toContain('https://hooks.slack.com');
    expect(raw).not.toContain('url');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('payload');
    expect(raw).not.toContain('headers');
  });

  it('does not include webhook secrets in delivery outcomes', () => {
    const delivery = makeDelivery();
    // Ensure the type does not have url/secret fields
    const keys = Object.keys(delivery);
    expect(keys).not.toContain('url');
    expect(keys).not.toContain('secret');
    expect(keys).not.toContain('payload');
    expect(keys).not.toContain('headers');
  });

  it('truncates error messages to prevent data leaks', () => {
    const longError = 'Secret-token-12345 ' + 'x'.repeat(500);
    appendEscalationEvent(tmpDir, makeEvent({
      deliveries: [makeDelivery({ error: longError, success: false })],
      deliverySuccessCount: 0,
      deliveryFailureCount: 1,
    }));
    const ev = readEscalationHistory(tmpDir).events[0];
    expect(ev.deliveries[0].error!.length).toBe(200);
  });
});

// ─── GET /api/task-board/escalation/history — API Endpoint Tests ─────────────

describe('GET /api/task-board/escalation/history', () => {
  async function callEndpoint(
    dataDir: string,
    queryString = '',
  ): Promise<{ data: any; status: number }> {
    const { handleTaskBoard } = await import('../../../server/routes/task-board.js');
    const req = {
      url: '/api/task-board/escalation/history' + queryString,
      method: 'GET',
      headers: {},
      on: () => {},
    };
    let capturedData: any = null;
    let capturedStatus = 200;

    const deps = {
      dataDir,
      sendJson: (_r: any, data: any, status = 200) => {
        capturedData = data;
        capturedStatus = status;
      },
      readRequestBody: async () => '{}',
    };

    await handleTaskBoard(req as any, {} as any, deps as any);
    return { data: capturedData, status: capturedStatus };
  }

  it('returns empty history for clean directory', async () => {
    const { data, status } = await callEndpoint(tmpDir);
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(data.events).toEqual([]);
    expect(data.count).toBe(0);
    expect(data.summary).toBeDefined();
    expect(data.summary.totalEvents).toBe(0);
  });

  it('returns recorded events', async () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() }));
    const { data, status } = await callEndpoint(tmpDir);
    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.events[0].eventType).toBe('tier_triggered');
  });

  it('accepts limit query param', async () => {
    for (let i = 0; i < 5; i++) {
      appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() + i }));
    }
    const { data } = await callEndpoint(tmpDir, '?limit=2');
    expect(data.count).toBe(2);
  });

  it('accepts sinceMs query param', async () => {
    // Old event
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() - 100_000 }));
    // Recent event
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() }));
    const { data } = await callEndpoint(tmpDir, '?sinceMs=5000');
    expect(data.count).toBe(1);
  });

  it('accepts eventType filter', async () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now(), eventType: 'tier_triggered' }));
    appendEscalationReset(tmpDir, { qualifyingSeverity: 'critical', qualifyingDurationMs: 1000, ts: Date.now() });

    const { data: trigData } = await callEndpoint(tmpDir, '?eventType=tier_triggered');
    expect(trigData.count).toBe(1);
    expect(trigData.events[0].eventType).toBe('tier_triggered');

    const { data: resetData } = await callEndpoint(tmpDir, '?eventType=escalation_reset');
    expect(resetData.count).toBe(1);
    expect(resetData.events[0].eventType).toBe('escalation_reset');
  });

  it('accepts tierIndex filter', async () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now(), tierIndex: 0 }));
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() + 1, tierIndex: 1, tierLabel: 'Tier 2' }));

    const { data } = await callEndpoint(tmpDir, '?tierIndex=1');
    expect(data.count).toBe(1);
    expect(data.events[0].tierIndex).toBe(1);
  });

  it('accepts deliveryStatus filter', async () => {
    appendEscalationEvent(tmpDir, makeEvent({
      ts: Date.now(),
      deliveries: [makeDelivery({ success: true })],
      deliverySuccessCount: 1, deliveryFailureCount: 0,
    }));
    appendEscalationEvent(tmpDir, makeEvent({
      ts: Date.now() + 1,
      deliveries: [makeDelivery({ success: false, error: 'fail' })],
      deliverySuccessCount: 0, deliveryFailureCount: 1,
    }));

    const { data: successData } = await callEndpoint(tmpDir, '?deliveryStatus=success');
    expect(successData.count).toBe(1);
    expect(successData.events[0].deliverySuccessCount).toBeGreaterThan(0);

    const { data: failData } = await callEndpoint(tmpDir, '?deliveryStatus=failure');
    expect(failData.count).toBe(1);
    expect(failData.events[0].deliveryFailureCount).toBeGreaterThan(0);
  });

  it('ignores invalid eventType values', async () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() }));
    const { data } = await callEndpoint(tmpDir, '?eventType=invalid_type');
    expect(data.count).toBe(1); // No filter applied
  });

  it('ignores invalid deliveryStatus values', async () => {
    appendEscalationEvent(tmpDir, makeEvent({ ts: Date.now() }));
    const { data } = await callEndpoint(tmpDir, '?deliveryStatus=invalid');
    expect(data.count).toBe(1); // No filter applied
  });
});

// ─── Regression Safety ──────────────────────────────────────────────────────

describe('regression safety', () => {
  it('escalation status endpoint still works after history module addition', async () => {
    const { resetEscalationState } = await import('../../../server/escalation-policy.js');
    resetEscalationState();

    const { handleTaskBoard } = await import('../../../server/routes/task-board.js');
    const req = {
      url: '/api/task-board/escalation/status',
      method: 'GET',
      headers: {},
      on: () => {},
    };
    let capturedData: any = null;

    const deps = {
      dataDir: tmpDir,
      sendJson: (_r: any, data: any) => { capturedData = data; },
      readRequestBody: async () => '{}',
    };

    await handleTaskBoard(req as any, {} as any, deps as any);
    expect(capturedData).toBeDefined();
    expect(capturedData.status).toBeDefined();
    expect(capturedData.status.policyEnabled).toBe(false);
  });

  it('escalation history module imports do not affect escalation policy exports', async () => {
    const policy = await import('../../../server/escalation-policy.js');
    // Verify all critical exports are still available
    expect(typeof policy.evaluateEscalation).toBe('function');
    expect(typeof policy.updateEscalationState).toBe('function');
    expect(typeof policy.computeEscalationStatus).toBe('function');
    expect(typeof policy.resetEscalationState).toBe('function');
    expect(typeof policy.getEscalationState).toBe('function');
    expect(typeof policy.maybeEscalate).toBe('function');
    expect(typeof policy.validateEscalationPolicy).toBe('function');
    expect(typeof policy.sanitizeEscalationPolicy).toBe('function');
  });

  it('task-board route still handles non-escalation routes', async () => {
    const { handleTaskBoard } = await import('../../../server/routes/task-board.js');
    const req = {
      url: '/api/task-board/summary',
      method: 'GET',
      headers: {},
      on: () => {},
    };
    let capturedData: any = null;

    const deps = {
      dataDir: tmpDir,
      sendJson: (_r: any, data: any) => { capturedData = data; },
      readRequestBody: async () => '{}',
    };

    await handleTaskBoard(req as any, {} as any, deps as any);
    expect(capturedData).toBeDefined();
    expect(capturedData.total).toBeDefined();
  });
});
