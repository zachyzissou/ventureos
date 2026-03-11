/**
 * Mission Timeline Tests — Phase 5.5
 */
import { describe, it, expect } from 'vitest';
import {
  processTimelineEntries,
  formatDuration,
  formatTimestamp,
  formatDatetime,
} from '../../../src/missions/mission-timeline';
import type { MissionHistoryEntry } from '../../../src/missions/types';

// ─── formatDuration ─────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5.0s');
    expect(formatDuration(15500)).toBe('15.5s');
  });

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1.0m');
    expect(formatDuration(150000)).toBe('2.5m');
  });

  it('formats hours', () => {
    expect(formatDuration(3600000)).toBe('1.0h');
    expect(formatDuration(5400000)).toBe('1.5h');
  });

  it('formats days', () => {
    expect(formatDuration(86400000)).toBe('1.0d');
    expect(formatDuration(172800000)).toBe('2.0d');
  });

  it('returns dash for negative values', () => {
    expect(formatDuration(-1)).toBe('—');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

// ─── formatTimestamp ────────────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('formats valid ISO timestamp to HH:MM:SS', () => {
    // Use a specific date to avoid timezone issues
    const result = formatTimestamp('2024-06-15T14:30:45.000Z');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('returns dash for invalid timestamp', () => {
    expect(formatTimestamp('not-a-date')).toBe('—');
    expect(formatTimestamp('')).toBe('—');
  });
});

// ─── formatDatetime ─────────────────────────────────────────────────────

describe('formatDatetime', () => {
  it('formats valid ISO timestamp to MM/DD HH:MM', () => {
    const result = formatDatetime('2024-06-15T14:30:45.000Z');
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('returns dash for invalid timestamp', () => {
    expect(formatDatetime('invalid')).toBe('—');
  });
});

// ─── processTimelineEntries ─────────────────────────────────────────────

describe('processTimelineEntries', () => {
  it('returns empty array for empty history', () => {
    expect(processTimelineEntries([])).toHaveLength(0);
  });

  it('converts history entries to timeline entries', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z', note: 'Created' },
      { phase: 'plan', enteredAt: '2024-01-01T00:10:00Z', note: 'Planned' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries).toHaveLength(2);
    expect(entries[0].phase).toBe('brief');
    expect(entries[1].phase).toBe('plan');
  });

  it('sorts entries chronologically', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'execute', enteredAt: '2024-01-01T02:00:00Z' },
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' },
      { phase: 'plan', enteredAt: '2024-01-01T01:00:00Z' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries[0].phase).toBe('brief');
    expect(entries[1].phase).toBe('plan');
    expect(entries[2].phase).toBe('execute');
  });

  it('calculates duration from previous entry', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' },
      { phase: 'plan', enteredAt: '2024-01-01T00:10:00Z' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries[0].durationFromPrevMs).toBeNull(); // First entry has no predecessor
    expect(entries[1].durationFromPrevMs).toBe(600000); // 10 minutes
  });

  it('preserves notes', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z', note: 'Mission started' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries[0].note).toBe('Mission started');
  });

  it('handles entries without notes', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries[0].note).toBe('');
  });

  it('assigns correct color scheme per phase', () => {
    const history: MissionHistoryEntry[] = [
      { phase: 'brief', enteredAt: '2024-01-01T00:00:00Z' },
      { phase: 'error', enteredAt: '2024-01-01T01:00:00Z' },
    ];

    const entries = processTimelineEntries(history);
    expect(entries[0].colors.primary).toBeDefined();
    expect(entries[1].colors.primary).toBeDefined();
    expect(entries[0].colors.primary).not.toBe(entries[1].colors.primary);
  });

  it('trims to maxEntries (keeping most recent)', () => {
    const history: MissionHistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      history.push({
        phase: 'execute',
        enteredAt: new Date(Date.UTC(2024, 0, 1, i)).toISOString(),
        note: `Entry ${i}`,
      });
    }

    const entries = processTimelineEntries(history, 3);
    expect(entries).toHaveLength(3);
    // Should have the most recent entries
    expect(entries[0].note).toBe('Entry 7');
    expect(entries[2].note).toBe('Entry 9');
  });

  it('handles maxEntries = 0 (unlimited)', () => {
    const history: MissionHistoryEntry[] = [];
    for (let i = 0; i < 20; i++) {
      history.push({
        phase: 'execute',
        enteredAt: new Date(Date.UTC(2024, 0, 1, i)).toISOString(),
      });
    }

    const entries = processTimelineEntries(history, 0);
    expect(entries).toHaveLength(20);
  });
});
