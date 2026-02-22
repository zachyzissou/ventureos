import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appendOverviewFreshnessEvent,
  evaluateOverviewFreshnessEventForPersistence,
  getOverviewFreshnessDefaultThresholds,
  getOverviewFreshnessEventFilePath,
  parseOverviewFreshnessEvent,
  readOverviewFreshnessEvents,
  resolveOverviewFreshnessEventDedupeWindowMs,
  resolveOverviewFreshnessThresholds,
  resolveOverviewFreshnessTimelineLimit,
} from '../../server/overview-freshness.js';

describe('overview freshness server helpers', () => {
  it('returns immutable default thresholds', () => {
    const defaults = getOverviewFreshnessDefaultThresholds();
    expect(defaults.kpi.freshMs).toBe(36 * 60 * 60 * 1000);
    defaults.kpi.freshMs = 1;
    const again = getOverviewFreshnessDefaultThresholds();
    expect(again.kpi.freshMs).toBe(36 * 60 * 60 * 1000);
  });

  it('resolves threshold overrides from environment', () => {
    const thresholds = resolveOverviewFreshnessThresholds({
      DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS: '60000',
      DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS: '120000',
      DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_FRESH_MS: '45000',
      DASHBOARD_OVERVIEW_FRESHNESS_AGENT_HEALTH_STALE_MS: '300000',
      DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_FRESH_MS: '3600000',
      DASHBOARD_OVERVIEW_FRESHNESS_OBSERVATIONS_STALE_MS: '7200000',
    });

    expect(thresholds.kpi).toEqual({ freshMs: 60000, staleMs: 120000 });
    expect(thresholds.agentHealth).toEqual({ freshMs: 45000, staleMs: 300000 });
    expect(thresholds.observations).toEqual({ freshMs: 3600000, staleMs: 7200000 });
  });

  it('normalizes stale thresholds when stale <= fresh', () => {
    const thresholds = resolveOverviewFreshnessThresholds({
      DASHBOARD_OVERVIEW_FRESHNESS_KPI_FRESH_MS: '5000',
      DASHBOARD_OVERVIEW_FRESHNESS_KPI_STALE_MS: '5000',
    });

    expect(thresholds.kpi.freshMs).toBe(5000);
    expect(thresholds.kpi.staleMs).toBe(5001);
  });

  it('resolves timeline limit and dedupe window from environment', () => {
    const limit = resolveOverviewFreshnessTimelineLimit({
      DASHBOARD_OVERVIEW_FRESHNESS_TIMELINE_LIMIT: '12',
    });
    const dedupeWindow = resolveOverviewFreshnessEventDedupeWindowMs({
      DASHBOARD_OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS: '45000',
    });
    expect(limit).toBe(12);
    expect(dedupeWindow).toBe(45000);
  });

  it('parses and sanitizes event payload', () => {
    const event = parseOverviewFreshnessEvent({
      state: 'stale',
      stale: 2,
      aging: 1,
      unavailable: 0,
      total: 3,
      source: 'overview widget (/tmp/path)',
      emittedAt: 1700000000000,
    }, 1700000000100);

    expect(event).not.toBeNull();
    expect(event?.state).toBe('stale');
    expect(event?.source).toBe('overview-widget-tmp-path');
    expect(event?.receivedAt).toBe(1700000000100);
    expect(event?.emittedAt).toBe(1700000000000);
  });

  it('rejects invalid event payloads', () => {
    expect(parseOverviewFreshnessEvent(null)).toBeNull();
    expect(parseOverviewFreshnessEvent({})).toBeNull();
    expect(parseOverviewFreshnessEvent({ state: 'invalid' })).toBeNull();
  });

  it('appends events to the jsonl store', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-freshness-'));
    const now = Date.now();
    const event = parseOverviewFreshnessEvent({
      state: 'stale',
      stale: 1,
      aging: 0,
      unavailable: 0,
      total: 1,
      source: 'overview-widget',
      emittedAt: now - 5,
    }, now);

    expect(event).not.toBeNull();
    appendOverviewFreshnessEvent(tmpDir, event!);

    const filePath = getOverviewFreshnessEventFilePath(tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]) as { state: string; stale: number };
    expect(parsed.state).toBe('stale');
    expect(parsed.stale).toBe(1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads latest timeline events newest-first with limit', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-freshness-read-'));
    const base = 1700000000000;
    for (let i = 0; i < 4; i += 1) {
      const event = parseOverviewFreshnessEvent({
        state: i % 2 === 0 ? 'stale' : 'fresh',
        stale: i % 2 === 0 ? 1 : 0,
        aging: 0,
        unavailable: 0,
        total: 3,
        source: `overview-${i}`,
        emittedAt: base + i * 1000,
      }, base + i * 1000)!;
      appendOverviewFreshnessEvent(tmpDir, event);
    }

    const latestTwo = readOverviewFreshnessEvents(tmpDir, { limit: 2 });
    expect(latestTwo.length).toBe(2);
    expect(latestTwo[0]?.source).toBe('overview-3');
    expect(latestTwo[1]?.source).toBe('overview-2');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('suppresses duplicate events inside dedupe window', () => {
    const state = new Map<string, number>();
    const t0 = 1700000000000;
    const event = parseOverviewFreshnessEvent({
      state: 'stale',
      stale: 1,
      aging: 0,
      unavailable: 0,
      total: 3,
      source: 'overview-widget',
      emittedAt: t0 - 10,
    }, t0)!;

    const first = evaluateOverviewFreshnessEventForPersistence(event, 60000, state, t0);
    const second = evaluateOverviewFreshnessEventForPersistence(event, 60000, state, t0 + 1000);
    const thirdEvent = parseOverviewFreshnessEvent({
      state: 'stale',
      stale: 1,
      aging: 0,
      unavailable: 0,
      total: 3,
      source: 'overview-widget',
      emittedAt: t0 + 61000 - 10,
    }, t0 + 61000)!;
    const third = evaluateOverviewFreshnessEventForPersistence(thirdEvent, 60000, state, t0 + 61000);

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.duplicateOfReceivedAt).toBe(t0);
    expect(third.accepted).toBe(true);
  });
});
