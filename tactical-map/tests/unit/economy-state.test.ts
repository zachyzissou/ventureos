import { describe, it, expect } from 'vitest';
import {
  applyAgentEconomyUpdate,
  applyEconomySnapshot,
  applyPoolEconomyUpdate,
  createEmptyEconomyState,
  parseEconomyEvent
} from '@/economy/state';

describe('economy/state', () => {
  it('creates an empty state with all agents', () => {
    const state = createEmptyEconomyState(1000);

    expect(Object.keys(state.agents)).toHaveLength(8);
    expect(state.agents.venture_research.quotaRemainingRatio).toBe(1);
    expect(state.pool.costRemainingRatio).toBe(1);
  });

  it('applies a snapshot and computes ratios + history', () => {
    const initial = createEmptyEconomyState(1000);

    const next = applyEconomySnapshot(
      initial,
      {
        updatedAt: '2026-02-16T00:00:00.000Z',
        agents: {
          venture_research: {
            tokenBudget: 10_000,
            tokensUsed: 8_250,
            costUsd: 12.4,
            history: [
              { ts: 1000, costUsd: 8.5, tokensUsed: 6200 },
              { ts: 2000, costUsd: 12.4, tokensUsed: 8250 }
            ]
          }
        },
        pool: {
          tokenQuotaTotal: 100_000,
          tokenQuotaUsed: 64_000,
          costBudgetUsd: 200,
          costUsedUsd: 92
        }
      },
      { historyMaxPoints: 64, historyMaxAgeMs: 60_000 },
      2_000
    );

    expect(next.agents.venture_research.tokensRemaining).toBe(1750);
    expect(next.agents.venture_research.quotaRemainingRatio).toBeCloseTo(0.175, 3);
    expect(next.agents.venture_research.health).toBe('yellow');
    expect(next.agents.venture_research.history.length).toBeGreaterThan(1);

    expect(next.pool.tokenQuotaRemaining).toBe(36_000);
    expect(next.pool.costRemainingUsd).toBe(108);
  });

  it('applies agent + pool updates incrementally', () => {
    const initial = createEmptyEconomyState(0);

    const withAgent = applyAgentEconomyUpdate(
      initial,
      {
        agentId: 'venture_delivery',
        tokenBudget: 5_000,
        tokensUsed: 4_500,
        costUsd: 3.5,
        updatedAt: 10_000
      },
      { historyMaxPoints: 64, historyMaxAgeMs: 60_000 },
      10_000
    );

    expect(withAgent.agents.venture_delivery.tokensRemaining).toBe(500);
    expect(withAgent.agents.venture_delivery.health).toBe('red');

    const withPool = applyPoolEconomyUpdate(
      withAgent,
      {
        tokenQuotaTotal: 20_000,
        tokenQuotaUsed: 19_000,
        costBudgetUsd: 50,
        costUsedUsd: 42
      },
      11_000
    );

    expect(withPool.pool.tokenQuotaRemainingRatio).toBeCloseTo(0.05, 3);
    expect(withPool.pool.costRemainingRatio).toBeCloseTo(0.16, 2);
  });

  it('normalizes websocket event envelopes', () => {
    const snapshot = parseEconomyEvent({ type: 'economy.snapshot', data: { agents: {} } });
    expect(snapshot.type).toBe('snapshot');

    const agent = parseEconomyEvent({ type: 'agent_update', data: { agentId: 'venture_infrastructure', tokenBudget: 100 } });
    expect(agent.type).toBe('agent_update');

    const pool = parseEconomyEvent({ type: 'economy.pool', data: { tokenQuotaTotal: 1000 } });
    expect(pool.type).toBe('pool_update');

    const unknown = parseEconomyEvent({ foo: 'bar' });
    expect(unknown.type).toBe('unknown');
  });
});
