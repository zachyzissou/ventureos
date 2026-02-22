import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type FreshnessState = 'fresh' | 'aging' | 'stale' | 'no-data';

type FreshnessResult = {
  state: FreshnessState;
  ageMs: number | null;
  sourceMs: number;
};

type FreshnessSummary = {
  state: 'fresh' | 'aging' | 'stale' | 'unavailable';
  stale: number;
  aging: number;
  unavailable: number;
};

type FreshnessUtils = {
  normalizeThresholds: (
    thresholds: { freshMs: number; staleMs: number },
  ) => { freshMs: number; staleMs: number };
  formatFreshnessAge: (ageMs: number | null) => string;
  classifyFreshnessState: (
    sourceMs: number,
    thresholds: { freshMs: number; staleMs: number },
    nowMs?: number,
  ) => FreshnessResult;
  summarizeFreshnessStates: (states: FreshnessResult[]) => FreshnessSummary;
};

function loadUtils(): FreshnessUtils {
  const filePath = path.resolve(import.meta.dirname, '../../../client/assets/overview-freshness.js');
  const code = fs.readFileSync(filePath, 'utf8');
  const context: Record<string, unknown> = {};
  context.globalThis = context;
  vm.runInNewContext(code, context);
  return context.OverviewFreshnessUtils as FreshnessUtils;
}

describe('overview-freshness utils', () => {
  const utils = loadUtils();
  const thresholds = { freshMs: 100, staleMs: 500 };

  it('returns no-data when source timestamp is missing', () => {
    const result = utils.classifyFreshnessState(0, thresholds, 1000);
    expect(result.state).toBe('no-data');
    expect(result.ageMs).toBeNull();
  });

  it('normalizes threshold windows with stale strictly above fresh', () => {
    const normalized = utils.normalizeThresholds({ freshMs: 1000, staleMs: 900 });
    expect(normalized.freshMs).toBe(1000);
    expect(normalized.staleMs).toBe(1001);
  });

  it('formats ages into compact labels', () => {
    expect(utils.formatFreshnessAge(500)).toBe('1s');
    expect(utils.formatFreshnessAge(90000)).toBe('2m');
    expect(utils.formatFreshnessAge(3 * 60 * 60 * 1000)).toBe('3h');
    expect(utils.formatFreshnessAge(2 * 24 * 60 * 60 * 1000)).toBe('2d');
  });

  it('returns fresh inside fresh threshold', () => {
    const result = utils.classifyFreshnessState(980, thresholds, 1000);
    expect(result.state).toBe('fresh');
    expect(result.ageMs).toBe(20);
  });

  it('returns aging between fresh and stale thresholds', () => {
    const result = utils.classifyFreshnessState(850, thresholds, 1000);
    expect(result.state).toBe('aging');
    expect(result.ageMs).toBe(150);
  });

  it('returns stale above stale threshold', () => {
    const result = utils.classifyFreshnessState(100, thresholds, 1000);
    expect(result.state).toBe('stale');
    expect(result.ageMs).toBe(900);
  });

  it('clamps future timestamps to zero-age fresh', () => {
    const result = utils.classifyFreshnessState(1200, thresholds, 1000);
    expect(result.state).toBe('fresh');
    expect(result.ageMs).toBe(0);
  });

  it('summarizes with stale priority', () => {
    const summary = utils.summarizeFreshnessStates([
      { state: 'fresh', ageMs: 1, sourceMs: 99 },
      { state: 'aging', ageMs: 120, sourceMs: 10 },
      { state: 'stale', ageMs: 900, sourceMs: 1 },
    ]);
    expect(summary.state).toBe('stale');
    expect(summary.stale).toBe(1);
    expect(summary.aging).toBe(1);
    expect(summary.unavailable).toBe(0);
  });

  it('summarizes with aging priority over unavailable', () => {
    const summary = utils.summarizeFreshnessStates([
      { state: 'fresh', ageMs: 1, sourceMs: 99 },
      { state: 'aging', ageMs: 120, sourceMs: 10 },
      { state: 'no-data', ageMs: null, sourceMs: 0 },
    ]);
    expect(summary.state).toBe('aging');
  });

  it('summarizes unavailable when only no-data and fresh exist', () => {
    const summary = utils.summarizeFreshnessStates([
      { state: 'fresh', ageMs: 1, sourceMs: 99 },
      { state: 'no-data', ageMs: null, sourceMs: 0 },
    ]);
    expect(summary.state).toBe('unavailable');
  });

  it('summarizes fresh when all inputs are fresh', () => {
    const summary = utils.summarizeFreshnessStates([
      { state: 'fresh', ageMs: 10, sourceMs: 990 },
      { state: 'fresh', ageMs: 20, sourceMs: 980 },
    ]);
    expect(summary.state).toBe('fresh');
  });
});
