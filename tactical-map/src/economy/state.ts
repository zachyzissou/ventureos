import { AGENT_ORDER } from '@/config';
import type { AgentId } from '@/config';
import { normalizeAgentId } from '@/identity';
import { computeBudgetHealth, DEFAULT_HEALTH_THRESHOLDS } from '@/economy/health';
import { deriveBurnRateUsdPerHour, pushTrendPoint } from '@/economy/time-series';
import type {
  AgentEconomyState,
  EconomyEvent,
  EconomyState,
  RawAgentEconomy,
  RawEconomyEvent,
  RawEconomySnapshot,
  RawPoolEconomy,
  ResourcePoolState,
  TrendPoint
} from '@/economy/types';
import { clamp01 } from '@/utils/color';

export type EconomyStateOptions = {
  historyMaxPoints: number;
  historyMaxAgeMs: number;
};

export const DEFAULT_ECONOMY_STATE_OPTIONS: EconomyStateOptions = {
  historyMaxPoints: 64,
  historyMaxAgeMs: 1000 * 60 * 60 * 6
};

function parseNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseTs(value: unknown, fallback = Date.now()): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    if (Number.isFinite(n)) return n;
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum;
  }
  return fallback;
}

function normalizePool(prev: ResourcePoolState, patch?: RawPoolEconomy, nowMs = Date.now()): ResourcePoolState {
  if (!patch) return prev;

  const tokenQuotaTotal = Math.max(
    0,
    parseNumber(patch.tokenQuotaTotal, patch.totalTokens, patch.tokenBudget, prev.tokenQuotaTotal) ?? prev.tokenQuotaTotal
  );

  const tokenQuotaUsed = Math.max(
    0,
    parseNumber(patch.tokenQuotaUsed, patch.usedTokens, patch.tokensUsed, prev.tokenQuotaUsed) ?? prev.tokenQuotaUsed
  );

  const explicitTokenRemaining = parseNumber(patch.tokenQuotaRemaining, patch.remainingTokens);
  const tokenQuotaRemaining = Math.max(
    0,
    explicitTokenRemaining ?? Math.max(0, tokenQuotaTotal - tokenQuotaUsed)
  );

  const tokenQuotaRemainingRatio = clamp01(
    parseNumber(patch.quotaRemainingRatio) ??
      (tokenQuotaTotal > 0 ? tokenQuotaRemaining / tokenQuotaTotal : prev.tokenQuotaRemainingRatio)
  );

  const costBudgetUsd = Math.max(
    0,
    parseNumber(patch.costBudgetUsd, patch.totalCostBudgetUsd, patch.costQuotaUsd, prev.costBudgetUsd) ?? prev.costBudgetUsd
  );

  const costUsedUsd = Math.max(0, parseNumber(patch.costUsedUsd, patch.usedCostUsd, prev.costUsedUsd) ?? prev.costUsedUsd);

  const explicitCostRemaining = parseNumber(patch.costRemainingUsd, patch.remainingCostUsd);
  const costRemainingUsd = Math.max(0, explicitCostRemaining ?? Math.max(0, costBudgetUsd - costUsedUsd));

  const costRemainingRatio = clamp01(
    parseNumber(patch.costRemainingRatio) ?? (costBudgetUsd > 0 ? costRemainingUsd / costBudgetUsd : prev.costRemainingRatio)
  );

  return {
    tokenQuotaTotal,
    tokenQuotaUsed,
    tokenQuotaRemaining,
    tokenQuotaRemainingRatio,
    costBudgetUsd,
    costUsedUsd,
    costRemainingUsd,
    costRemainingRatio,
    updatedAt: parseTs(patch.updatedAt, nowMs)
  };
}

function normalizeHistory(history: RawAgentEconomy['history'] | undefined, nowMs: number): TrendPoint[] {
  if (!Array.isArray(history)) return [];

  const out: TrendPoint[] = [];
  for (const p of history) {
    const ts = parseTs(p.ts, nowMs);
    const tokensUsed = Math.max(0, parseNumber(p.tokensUsed, p.usedTokens, 0) ?? 0);
    const costUsd = Math.max(0, parseNumber(p.costUsd, p.cost, 0) ?? 0);
    out.push({ ts, tokensUsed, costUsd });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function normalizeAgent(
  prev: AgentEconomyState,
  patch: RawAgentEconomy,
  options: EconomyStateOptions,
  nowMs = Date.now()
): AgentEconomyState {
  const tokenBudget = Math.max(0, parseNumber(patch.tokenBudget, patch.budgetTokens, patch.budget, prev.tokenBudget) ?? prev.tokenBudget);
  const tokensUsed = Math.max(0, parseNumber(patch.tokensUsed, patch.usedTokens, patch.spentTokens, prev.tokensUsed) ?? prev.tokensUsed);

  const explicitRemaining = parseNumber(patch.tokensRemaining, patch.remainingTokens);
  const tokensRemaining = Math.max(0, explicitRemaining ?? Math.max(0, tokenBudget - tokensUsed));

  const usageRatio = tokenBudget > 0 ? clamp01(tokensUsed / tokenBudget) : prev.usageRatio;
  const quotaRemainingRatio = clamp01(
    parseNumber(patch.quotaRemainingRatio, patch.quotaRemaining) ??
      (tokenBudget > 0 ? tokensRemaining / tokenBudget : prev.quotaRemainingRatio)
  );

  const costUsd = Math.max(0, parseNumber(patch.costUsd, patch.totalCostUsd, patch.cost, prev.costUsd) ?? prev.costUsd);

  const now = parseTs(patch.updatedAt, nowMs);

  let history = prev.history;
  const incomingHistory = normalizeHistory(patch.history, nowMs);

  if (incomingHistory.length > 0) {
    history = incomingHistory;
  }

  const point: TrendPoint = {
    ts: now,
    tokensUsed,
    costUsd
  };

  history = pushTrendPoint(history, point, {
    maxPoints: options.historyMaxPoints,
    maxAgeMs: options.historyMaxAgeMs
  });

  const explicitBurnRate = parseNumber(patch.burnRateUsdPerHour, patch.costRateUsdPerHour, patch.burnRate);
  const burnRateUsdPerHour = Math.max(0, explicitBurnRate ?? deriveBurnRateUsdPerHour(history));

  return {
    agentId: prev.agentId,
    tokenBudget,
    tokensUsed,
    tokensRemaining,
    usageRatio,
    quotaRemainingRatio,
    costUsd,
    burnRateUsdPerHour,
    health: computeBudgetHealth(quotaRemainingRatio, DEFAULT_HEALTH_THRESHOLDS),
    history,
    updatedAt: now
  };
}

export function createEmptyEconomyState(nowMs = Date.now()): EconomyState {
  const agents = {} as EconomyState['agents'];

  for (const id of AGENT_ORDER) {
    agents[id] = {
      agentId: id,
      tokenBudget: 0,
      tokensUsed: 0,
      tokensRemaining: 0,
      usageRatio: 0,
      quotaRemainingRatio: 1,
      costUsd: 0,
      burnRateUsdPerHour: 0,
      health: 'green',
      history: [],
      updatedAt: nowMs
    };
  }

  return {
    updatedAt: nowMs,
    agents,
    pool: {
      tokenQuotaTotal: 0,
      tokenQuotaUsed: 0,
      tokenQuotaRemaining: 0,
      tokenQuotaRemainingRatio: 1,
      costBudgetUsd: 0,
      costUsedUsd: 0,
      costRemainingUsd: 0,
      costRemainingRatio: 1,
      updatedAt: nowMs
    }
  };
}

export function applyEconomySnapshot(
  curr: EconomyState,
  snapshot: RawEconomySnapshot,
  options: EconomyStateOptions = DEFAULT_ECONOMY_STATE_OPTIONS,
  nowMs = Date.now()
): EconomyState {
  const incomingAgents = new Map<AgentId, RawAgentEconomy>();
  for (const [rawId, incoming] of Object.entries(snapshot.agents ?? {})) {
    const normalizedId = normalizeAgentId(rawId);
    if (normalizedId) incomingAgents.set(normalizedId, incoming);
  }

  const next: EconomyState = {
    updatedAt: parseTs(snapshot.updatedAt, nowMs),
    agents: { ...curr.agents },
    pool: normalizePool(curr.pool, snapshot.pool, nowMs)
  };

  for (const id of AGENT_ORDER) {
    const incoming = incomingAgents.get(id);
    if (!incoming) continue;
    next.agents[id] = normalizeAgent(curr.agents[id], incoming, options, nowMs);
  }

  return next;
}

export function applyAgentEconomyUpdate(
  curr: EconomyState,
  patch: RawAgentEconomy,
  options: EconomyStateOptions = DEFAULT_ECONOMY_STATE_OPTIONS,
  nowMs = Date.now()
): EconomyState {
  const id = normalizeAgentId(String(patch.agentId ?? '').toLowerCase());
  if (!id) return curr;

  return {
    ...curr,
    updatedAt: nowMs,
    agents: {
      ...curr.agents,
      [id]: normalizeAgent(curr.agents[id], patch, options, nowMs)
    }
  };
}

export function applyPoolEconomyUpdate(curr: EconomyState, patch: RawPoolEconomy, nowMs = Date.now()): EconomyState {
  return {
    ...curr,
    updatedAt: nowMs,
    pool: normalizePool(curr.pool, patch, nowMs)
  };
}

export function parseEconomyEvent(input: unknown): EconomyEvent {
  if (!input || typeof input !== 'object') return { type: 'unknown' };

  const raw = input as RawEconomyEvent;
  const type = String(raw.type ?? '').toLowerCase();

  if (type === 'heartbeat' || type === 'ping' || type === 'pong') return { type: 'heartbeat' };

  if (type === 'snapshot' || type === 'economy.snapshot') {
    const snapshot = (raw as { data?: RawEconomySnapshot; snapshot?: RawEconomySnapshot }).data ??
      (raw as { snapshot?: RawEconomySnapshot }).snapshot;
    if (snapshot && typeof snapshot === 'object') return { type: 'snapshot', snapshot };
  }

  if (type === 'agent_update' || type === 'economy.agent') {
    const agent = (raw as { data?: RawAgentEconomy; agent?: RawAgentEconomy }).data ??
      (raw as { agent?: RawAgentEconomy }).agent;
    if (agent && typeof agent === 'object') return { type: 'agent_update', agent };
  }

  if (type === 'pool_update' || type === 'economy.pool') {
    const pool = (raw as { data?: RawPoolEconomy; pool?: RawPoolEconomy }).data ??
      (raw as { pool?: RawPoolEconomy }).pool;
    if (pool && typeof pool === 'object') return { type: 'pool_update', pool };
  }

  return { type: 'unknown' };
}

export const __test = { parseNumber, parseTs, normalizePool, normalizeAgent };
