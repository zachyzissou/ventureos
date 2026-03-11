import { describe, it, expect } from 'vitest';
import { BudgetAlertManager } from '@/economy/alerts';
import { createEmptyEconomyState } from '@/economy/state';

describe('economy/alerts', () => {
  it('emits warning/critical alerts and respects cooldown', () => {
    const alerts = new BudgetAlertManager({ warningRatio: 0.3, criticalRatio: 0.15, cooldownMs: 10_000 });

    const state = createEmptyEconomyState(0);
    state.agents.oracle.quotaRemainingRatio = 0.28;
    state.pool.tokenQuotaRemainingRatio = 0.9;
    state.pool.costRemainingRatio = 0.9;

    const first = alerts.evaluate(state, 1_000);
    expect(first.some((a) => a.scope === 'agent' && a.targetId === 'oracle' && a.level === 'warning')).toBe(true);

    const second = alerts.evaluate(state, 2_000);
    expect(second.length).toBe(0);

    state.agents.oracle.quotaRemainingRatio = 0.1;
    const escalated = alerts.evaluate(state, 3_000);
    expect(escalated.some((a) => a.level === 'critical')).toBe(true);

    const cooledDown = alerts.evaluate(state, 20_000);
    expect(cooledDown.some((a) => a.targetId === 'oracle')).toBe(true);
  });

  it('emits pool alerts using the lowest remaining ratio', () => {
    const alerts = new BudgetAlertManager({ warningRatio: 0.3, criticalRatio: 0.15, cooldownMs: 1_000 });
    const state = createEmptyEconomyState(0);

    state.pool.tokenQuotaRemainingRatio = 0.5;
    state.pool.costRemainingRatio = 0.12;

    const batch = alerts.evaluate(state, 1000);
    expect(batch.some((a) => a.scope === 'pool' && a.level === 'critical')).toBe(true);
  });
});
