/**
 * Task Queue Visualization Tests — Phase 5.5
 */
import { describe, it, expect } from 'vitest';
import {
  calculateAgentQueueStats,
} from '../../../src/missions/task-queue-viz';
import type { MissionData } from '../../../src/missions/types';

function makeMission(overrides: Partial<MissionData> = {}): MissionData {
  return {
    missionId: 'test-mission',
    title: 'Test',
    description: 'Test',
    phase: 'execute',
    progress: 50,
    assignedTo: ['venture_research'],
    tasks: [],
    dependencies: [],
    history: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T01:00:00Z',
    queueDepth: 0,
    ...overrides,
  };
}

describe('calculateAgentQueueStats', () => {
  it('returns empty map for no missions', () => {
    const stats = calculateAgentQueueStats([]);
    expect(stats.size).toBe(0);
  });

  it('counts queued tasks per role', () => {
    const missions = [makeMission({
      tasks: [
        { id: 't1', title: 'T1', tier: 'P1', status: 'queued', role: 'venture_research' },
        { id: 't2', title: 'T2', tier: 'P2', status: 'queued', role: 'venture_research' },
        { id: 't3', title: 'T3', tier: 'P0', status: 'running', role: 'venture_research' },
      ],
    })];

    const stats = calculateAgentQueueStats(missions);
    const oracleStats = stats.get('venture_research');

    expect(oracleStats).toBeDefined();
    expect(oracleStats!.totalQueued).toBe(2);
    expect(oracleStats!.totalRunning).toBe(1);
  });

  it('separates stats by role', () => {
    const missions = [makeMission({
      tasks: [
        { id: 't1', title: 'T1', tier: 'P1', status: 'queued', role: 'venture_research' },
        { id: 't2', title: 'T2', tier: 'P2', status: 'queued', role: 'venture_infrastructure' },
        { id: 't3', title: 'T3', tier: 'P0', status: 'failed', role: 'venture_infrastructure' },
      ],
    })];

    const stats = calculateAgentQueueStats(missions);

    expect(stats.get('venture_research')!.totalQueued).toBe(1);
    expect(stats.get('venture_infrastructure')!.totalQueued).toBe(1);
    expect(stats.get('venture_infrastructure')!.totalFailed).toBe(1);
  });

  it('tracks tier breakdown', () => {
    const missions = [makeMission({
      tasks: [
        { id: 't1', title: 'T1', tier: 'P0', status: 'queued', role: 'venture_research' },
        { id: 't2', title: 'T2', tier: 'P0', status: 'queued', role: 'venture_research' },
        { id: 't3', title: 'T3', tier: 'P1', status: 'queued', role: 'venture_research' },
        { id: 't4', title: 'T4', tier: 'P3', status: 'queued', role: 'venture_research' },
      ],
    })];

    const stats = calculateAgentQueueStats(missions);
    const breakdown = stats.get('venture_research')!.tierBreakdown;

    expect(breakdown.P0).toBe(2);
    expect(breakdown.P1).toBe(1);
    expect(breakdown.P2).toBe(0);
    expect(breakdown.P3).toBe(1);
  });

  it('falls back to mission assignedTo when task has no role', () => {
    const missions = [makeMission({
      assignedTo: ['venture_security'],
      tasks: [
        { id: 't1', title: 'T1', tier: 'P1', status: 'queued' }, // no role
      ],
    })];

    const stats = calculateAgentQueueStats(missions);
    expect(stats.has('venture_security')).toBe(true);
    expect(stats.get('venture_security')!.totalQueued).toBe(1);
  });

  it('aggregates across multiple missions', () => {
    const missions = [
      makeMission({
        missionId: 'm1',
        tasks: [
          { id: 't1', title: 'T1', tier: 'P1', status: 'queued', role: 'venture_research' },
        ],
      }),
      makeMission({
        missionId: 'm2',
        tasks: [
          { id: 't2', title: 'T2', tier: 'P2', status: 'queued', role: 'venture_research' },
          { id: 't3', title: 'T3', tier: 'P0', status: 'running', role: 'venture_research' },
        ],
      }),
    ];

    const stats = calculateAgentQueueStats(missions);
    expect(stats.get('venture_research')!.totalQueued).toBe(2);
    expect(stats.get('venture_research')!.totalRunning).toBe(1);
  });

  it('handles succeeded/cancelled/expired tasks without counting them', () => {
    const missions = [makeMission({
      tasks: [
        { id: 't1', title: 'T1', tier: 'P1', status: 'succeeded', role: 'venture_research' },
        { id: 't2', title: 'T2', tier: 'P2', status: 'cancelled', role: 'venture_research' },
        { id: 't3', title: 'T3', tier: 'P3', status: 'expired', role: 'venture_research' },
      ],
    })];

    const stats = calculateAgentQueueStats(missions);
    const oracleStats = stats.get('venture_research');

    expect(oracleStats!.totalQueued).toBe(0);
    expect(oracleStats!.totalRunning).toBe(0);
    expect(oracleStats!.totalFailed).toBe(0);
  });
});
