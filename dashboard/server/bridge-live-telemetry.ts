export interface BridgeLiveEvent {
  session: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface BridgeTelemetrySnapshot {
  type: 'telemetry';
  ts: number;
  system: {
    cpuUsage: number;
    memoryPercent: number;
    memoryUsedGB: string;
    memoryTotalGB: string;
    diskPercent: number;
    loadAvg1m: string;
    uptime: number;
  };
  agents: {
    total: number;
    active: number;
    busyIds: string[];
  };
  sessions: {
    total: number;
    running: number;
  };
  costs: {
    today: number;
    week: number;
  };
  usage: {
    opusPct: number;
    sonnetPct: number;
    totalCost5h: number;
    totalCalls5h: number;
    burnTokensPerMin: number;
    burnCostPerMin: number;
  };
  kpi: {
    successRate: number | null;
    p95LatencyS: number | null;
    sloStatus: string | null;
    date: string | null;
  };
}

type SystemStatsShape = {
  cpu?: { usage?: number };
  memory?: { percent?: number; usedGB?: string; totalGB?: string };
  disk?: { percent?: number };
  loadAvg?: { '1m'?: string };
  uptime?: number;
};

type CostDataShape = { today?: number; week?: number };
type UsageDataShape = {
  current?: { opusPct?: number; sonnetPct?: number; totalCost?: number; totalCalls?: number };
  burnRate?: { tokensPerMinute?: number; costPerMinute?: number };
};

export interface BridgeTelemetryDeps {
  sessDir: string;
  cronFile: string;
  getAllowedSessionIds: () => Set<string> | null;
  getSessionsJson: () => Array<Record<string, unknown>>;
  getVentureosAgents: () => {
    agents: Record<
      string,
      {
        agentId: string;
        status: string;
      }
    >;
  };
  getLatestKpiSummary: () => {
    successRate: number | null;
    p95LatencyS: number | null;
    sloStatus: string | null;
    date: string | null;
  };
  buildSystemStats: () => SystemStatsShape;
  buildCostData: (opts: {
    sessDir: string;
    cronFile: string;
    allowedSessionIds: Set<string> | null;
  }) => CostDataShape;
  buildUsageWindows: (opts: { sessDir: string; allowedSessionIds: Set<string> | null }) => UsageDataShape;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function createBridgeTelemetryBuilder(deps: BridgeTelemetryDeps): () => BridgeTelemetrySnapshot {
  let costCache: CostDataShape | null = null;
  let costCacheTime = 0;
  let usageCache: UsageDataShape | null = null;
  let usageCacheTime = 0;

  return (): BridgeTelemetrySnapshot => {
    const now = Date.now();
    const stats = deps.buildSystemStats();
    const sessions = deps.getSessionsJson();
    const running = sessions.filter(
      (session) => now - parseNumber(session.updatedAt, 0) < 300_000 && session.aborted !== true,
    ).length;

    if (!costCache || now - costCacheTime > 60_000) {
      costCache = deps.buildCostData({
        sessDir: deps.sessDir,
        cronFile: deps.cronFile,
        allowedSessionIds: deps.getAllowedSessionIds(),
      });
      costCacheTime = now;
    }
    if (!usageCache || now - usageCacheTime > 10_000) {
      usageCache = deps.buildUsageWindows({
        sessDir: deps.sessDir,
        allowedSessionIds: deps.getAllowedSessionIds(),
      });
      usageCacheTime = now;
    }

    const agents = deps.getVentureosAgents();
    const busyIds = Object.values(agents.agents)
      .filter((agent) => agent.status === 'working')
      .map((agent) => agent.agentId);
    const kpi = deps.getLatestKpiSummary();

    return {
      type: 'telemetry',
      ts: now,
      system: {
        cpuUsage: stats.cpu?.usage ?? 0,
        memoryPercent: stats.memory?.percent ?? 0,
        memoryUsedGB: stats.memory?.usedGB ?? '0.0',
        memoryTotalGB: stats.memory?.totalGB ?? '0.0',
        diskPercent: stats.disk?.percent ?? 0,
        loadAvg1m: stats.loadAvg?.['1m'] ?? '0',
        uptime: stats.uptime ?? 0,
      },
      agents: {
        total: Object.keys(agents.agents ?? {}).length,
        active: busyIds.length,
        busyIds,
      },
      sessions: {
        total: sessions.length,
        running,
      },
      costs: {
        today: costCache?.today ?? 0,
        week: costCache?.week ?? 0,
      },
      usage: {
        opusPct: usageCache?.current?.opusPct ?? 0,
        sonnetPct: usageCache?.current?.sonnetPct ?? 0,
        totalCost5h: usageCache?.current?.totalCost ?? 0,
        totalCalls5h: usageCache?.current?.totalCalls ?? 0,
        burnTokensPerMin: usageCache?.burnRate?.tokensPerMinute ?? 0,
        burnCostPerMin: usageCache?.burnRate?.costPerMinute ?? 0,
      },
      kpi: {
        successRate: kpi.successRate,
        p95LatencyS: kpi.p95LatencyS,
        sloStatus: kpi.sloStatus,
        date: kpi.date,
      },
    };
  };
}
