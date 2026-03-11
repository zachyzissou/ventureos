import type { BudgetAlert, EconomyState } from '@/economy/types';

export type AlertConfig = {
  warningRatio: number;
  criticalRatio: number;
  cooldownMs: number;
};

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  warningRatio: 0.30,
  criticalRatio: 0.15,
  cooldownMs: 45_000
};

type AlertStatus = {
  level: 'warning' | 'critical' | null;
  lastTriggeredAt: number;
};

function levelFromRatio(
  remainingRatio: number,
  config: Pick<AlertConfig, 'warningRatio' | 'criticalRatio'>
): 'warning' | 'critical' | null {
  if (remainingRatio <= config.criticalRatio) return 'critical';
  if (remainingRatio <= config.warningRatio) return 'warning';
  return null;
}

function pct(v: number): string {
  const p = Math.max(0, Math.min(100, Math.round(v * 100)));
  return `${p}%`;
}

export class BudgetAlertManager {
  private readonly config: AlertConfig;
  private readonly statusByTarget = new Map<string, AlertStatus>();

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
  }

  evaluate(state: EconomyState, nowMs = Date.now()): BudgetAlert[] {
    const alerts: BudgetAlert[] = [];

    for (const [agentId, agent] of Object.entries(state.agents)) {
      const key = `agent:${agentId}`;
      const level = levelFromRatio(agent.quotaRemainingRatio, this.config);
      const triggered = this.maybeTrigger(key, level, nowMs);
      if (!triggered) continue;

      alerts.push({
        id: `${key}:${nowMs}`,
        scope: 'agent',
        targetId: agentId,
        level: triggered,
        remainingRatio: agent.quotaRemainingRatio,
        message:
          triggered === 'critical'
            ? `${agentId.toUpperCase()} critical budget (${pct(agent.quotaRemainingRatio)} remaining)`
            : `${agentId.toUpperCase()} nearing budget limit (${pct(agent.quotaRemainingRatio)} remaining)`,
        createdAt: nowMs
      });
    }

    const poolKey = 'pool:global';
    const poolRemaining = Math.min(state.pool.tokenQuotaRemainingRatio, state.pool.costRemainingRatio);
    const poolLevel = levelFromRatio(poolRemaining, this.config);
    const poolTriggered = this.maybeTrigger(poolKey, poolLevel, nowMs);

    if (poolTriggered) {
      alerts.push({
        id: `${poolKey}:${nowMs}`,
        scope: 'pool',
        targetId: 'global',
        level: poolTriggered,
        remainingRatio: poolRemaining,
        message:
          poolTriggered === 'critical'
            ? `Resource pool critical (${pct(poolRemaining)} remaining)`
            : `Resource pool nearing limit (${pct(poolRemaining)} remaining)`,
        createdAt: nowMs
      });
    }

    return alerts;
  }

  private maybeTrigger(key: string, level: 'warning' | 'critical' | null, nowMs: number): 'warning' | 'critical' | null {
    const prev = this.statusByTarget.get(key) ?? { level: null, lastTriggeredAt: 0 };

    if (!level) {
      this.statusByTarget.set(key, { level: null, lastTriggeredAt: prev.lastTriggeredAt });
      return null;
    }

    const escalated = prev.level === null || (prev.level === 'warning' && level === 'critical');
    const cooledDown = nowMs - prev.lastTriggeredAt >= this.config.cooldownMs;

    if (escalated || cooledDown) {
      this.statusByTarget.set(key, { level, lastTriggeredAt: nowMs });
      return level;
    }

    this.statusByTarget.set(key, { level, lastTriggeredAt: prev.lastTriggeredAt });
    return null;
  }
}

export const __test = { levelFromRatio };
