/**
 * Bridge metrics helper tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildCostData,
  buildUsageWindows,
  buildTodayTokens,
  buildAvgResponseTime,
  buildLifetimeStats,
  readHealthHistory,
} from '../../server/bridge-metrics.js';

let sessDir: string;
let cronFile: string;
const allowedSessionIds = new Set(['session-a', 'session-b']);

function writeJsonl(sessionId: string, entries: Record<string, unknown>[]): void {
  const filePath = path.join(sessDir, sessionId + '.jsonl');
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, lines);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));

  sessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-metrics-'));
  cronFile = path.join(sessDir, 'jobs.json');
  fs.writeFileSync(cronFile, JSON.stringify({ jobs: [] }));

  const sessionsJson = {
    'agent:main:main:session-a': { sessionId: 'session-a', label: 'Main Session' },
    'agent:main:main:session-b': { sessionId: 'session-b', label: 'Backup Session' },
    'agent:main:main:isolated-foo': { sessionId: 'isolated-foo', label: 'Isolated', kind: 'isolated' },
  };
  fs.writeFileSync(path.join(sessDir, 'sessions.json'), JSON.stringify(sessionsJson));

  const now = Date.now();
  const userTs = new Date(now - 120000).toISOString();
  const assistantTs = new Date(now - 118000).toISOString();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  writeJsonl('session-a', [
    {
      type: 'message',
      timestamp: userTs,
      message: {
        role: 'user',
        model: 'claude-3-opus-20240229',
        usage: { input: 100, output: 50, cost: { total: 0.2 } },
      },
    },
    {
      type: 'message',
      timestamp: assistantTs,
      message: {
        role: 'assistant',
        model: 'claude-3-opus-20240229',
        usage: { input: 0, output: 100, cost: { total: 0.1 } },
      },
    },
    {
      type: 'message',
      timestamp: yesterday,
      message: {
        role: 'assistant',
        model: 'claude-3-sonnet-20240229',
        usage: { input: 20, output: 30, cost: { total: 0.3 } },
      },
    },
  ]);

  writeJsonl('session-b', [
    {
      type: 'message',
      timestamp: twoHoursAgo,
      message: {
        role: 'assistant',
        model: 'claude-3-opus-20240229',
        usage: { input: 200, output: 100, cost: { total: 1.0 } },
      },
    },
  ]);

  writeJsonl('isolated-foo', [
    {
      type: 'message',
      timestamp: twoHoursAgo,
      message: {
        role: 'assistant',
        model: 'claude-3-opus-20240229',
        usage: { input: 100, output: 100, cost: { total: 5.0 } },
      },
    },
  ]);
});

afterEach(() => {
  fs.rmSync(sessDir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('bridge metrics helpers', () => {
  it('builds cost data and excludes isolated sessions', () => {
    const data = buildCostData({ sessDir, cronFile, allowedSessionIds });
    expect(data.total).toBeCloseTo(1.6);
    expect(data.today).toBeCloseTo(1.3);
    expect(data.perModel['claude-3-opus-20240229']).toBeCloseTo(1.3);
    expect(data.perModel['claude-3-sonnet-20240229']).toBeCloseTo(0.3);
    expect(Object.keys(data.perSession)).toContain('session-b');
    expect(data.perSession['session-b'].label).toBe('Backup Session');
  });

  it('builds usage windows for the last 5 hours and week', () => {
    const usage = buildUsageWindows({ sessDir, allowedSessionIds });
    const opus = usage.fiveHour.perModel['claude-3-opus-20240229'];
    expect(opus.input).toBe(300);
    expect(opus.output).toBe(250);
    expect(opus.cost).toBeCloseTo(1.3);
    expect(opus.calls).toBe(3);
    const sonnet = usage.weekly.perModel['claude-3-sonnet-20240229'];
    expect(sonnet.output).toBe(30);
    expect(usage.current?.totalCalls).toBe(3);
    expect(usage.current?.totalCost).toBeCloseTo(1.3);
  });

  it('aggregates today tokens per model', () => {
    const tokens = buildTodayTokens({ sessDir, allowedSessionIds });
    expect(tokens.totalInput).toBe(300);
    expect(tokens.totalOutput).toBe(250);
    expect(tokens.perModel['claude-3-opus-20240229'].input).toBe(300);
  });

  it('computes average response time from user/assistant pairs', () => {
    const avg = buildAvgResponseTime({ sessDir, allowedSessionIds });
    expect(avg).toBe(2);
  });

  it('builds lifetime stats across allowed sessions', () => {
    const stats = buildLifetimeStats({ sessDir, allowedSessionIds });
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalMessages).toBe(4);
    expect(stats.totalTokens).toBe(600);
    expect(stats.totalCost).toBeCloseTo(1.6);
    expect(stats.daysActive).toBe(2);
    expect(stats.firstSessionDate).not.toBeNull();
  });

  it('reads health history safely', () => {
    const missing = readHealthHistory(path.join(sessDir, 'missing.json'));
    expect(missing).toEqual([]);
    const history = [{ t: Date.now(), cpu: 10, ram: 20 }];
    const filePath = path.join(sessDir, 'health-history.json');
    fs.writeFileSync(filePath, JSON.stringify(history));
    expect(readHealthHistory(filePath)).toEqual(history);
  });
});
