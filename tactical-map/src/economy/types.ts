import type { AgentId } from '@/config';

export type BudgetHealth = 'green' | 'yellow' | 'red';

export type TrendPoint = {
  ts: number;
  tokensUsed: number;
  costUsd: number;
};

export type AgentEconomyState = {
  agentId: AgentId;
  tokenBudget: number;
  tokensUsed: number;
  tokensRemaining: number;
  usageRatio: number;
  quotaRemainingRatio: number;
  costUsd: number;
  burnRateUsdPerHour: number;
  health: BudgetHealth;
  history: TrendPoint[];
  updatedAt: number;
};

export type ResourcePoolState = {
  tokenQuotaTotal: number;
  tokenQuotaUsed: number;
  tokenQuotaRemaining: number;
  tokenQuotaRemainingRatio: number;
  costBudgetUsd: number;
  costUsedUsd: number;
  costRemainingUsd: number;
  costRemainingRatio: number;
  updatedAt: number;
};

export type EconomyState = {
  updatedAt: number;
  agents: Record<AgentId, AgentEconomyState>;
  pool: ResourcePoolState;
};

export type RawTrendPoint = {
  ts?: number | string;
  tokensUsed?: number;
  usedTokens?: number;
  costUsd?: number;
  cost?: number;
};

export type RawAgentEconomy = {
  agentId?: string;
  tokenBudget?: number;
  budgetTokens?: number;
  budget?: number;
  tokensUsed?: number;
  usedTokens?: number;
  spentTokens?: number;
  tokensRemaining?: number;
  remainingTokens?: number;
  quotaRemainingRatio?: number;
  quotaRemaining?: number;
  costUsd?: number;
  totalCostUsd?: number;
  cost?: number;
  burnRateUsdPerHour?: number;
  costRateUsdPerHour?: number;
  burnRate?: number;
  updatedAt?: string | number;
  history?: RawTrendPoint[];
};

export type RawPoolEconomy = {
  tokenQuotaTotal?: number;
  totalTokens?: number;
  tokenBudget?: number;
  tokenQuotaUsed?: number;
  usedTokens?: number;
  tokensUsed?: number;
  tokenQuotaRemaining?: number;
  remainingTokens?: number;
  quotaRemainingRatio?: number;
  costBudgetUsd?: number;
  totalCostBudgetUsd?: number;
  costQuotaUsd?: number;
  costUsedUsd?: number;
  usedCostUsd?: number;
  costRemainingUsd?: number;
  remainingCostUsd?: number;
  costRemainingRatio?: number;
  updatedAt?: string | number;
};

export type RawEconomySnapshot = {
  updatedAt?: string | number;
  agents?: Record<string, RawAgentEconomy>;
  pool?: RawPoolEconomy;
};

export type RawEconomyEvent =
  | { type?: string; data?: unknown }
  | {
      type?: string;
      snapshot?: RawEconomySnapshot;
      agent?: RawAgentEconomy;
      pool?: RawPoolEconomy;
    };

export type EconomyEvent =
  | { type: 'snapshot'; snapshot: RawEconomySnapshot }
  | { type: 'agent_update'; agent: RawAgentEconomy }
  | { type: 'pool_update'; pool: RawPoolEconomy }
  | { type: 'heartbeat' }
  | { type: 'unknown' };

export type AlertLevel = 'warning' | 'critical';

export type BudgetAlert = {
  id: string;
  scope: 'agent' | 'pool';
  targetId: string;
  level: AlertLevel;
  remainingRatio: number;
  message: string;
  createdAt: number;
};
