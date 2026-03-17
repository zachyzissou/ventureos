import type { Page, Route } from '@playwright/test';
import { generateLoadPayload, type LoadProfile } from './mock-data-generator';

type MockBackendOptions = {
  profile?: LoadProfile;
  seed?: number;
  delayMs?: number;
};

type MockHealthStatus = 'healthy' | 'degraded' | 'critical';
type MockConnectivity = 'connected' | 'disconnected' | 'unstable';

function mapHealthStatus(status: MockHealthStatus): 'green' | 'yellow' | 'red' {
  switch (status) {
    case 'critical':
      return 'red';
    case 'degraded':
      return 'yellow';
    case 'healthy':
    default:
      return 'green';
  }
}

function mapConnectivity(status: MockConnectivity): 'online' | 'offline' | 'degraded' {
  switch (status) {
    case 'disconnected':
      return 'offline';
    case 'unstable':
      return 'degraded';
    case 'connected':
    default:
      return 'online';
  }
}

function buildMockSnapshots(profile: LoadProfile = 'baseline', seed: number = 42) {
  const payload = generateLoadPayload(profile, seed);
  const now = Date.now();

  const mapState = {
    updatedAt: payload.mapState.updatedAt,
    agents: Object.fromEntries(
      Object.entries(payload.mapState.agents).map(([id, agent]) => [
        id,
        {
          state: agent.state,
          sessions: agent.sessions ?? 0,
          position: agent.position,
          activeSessions: agent.activeSessions ?? [],
          paused: false,
        },
      ])
    ),
  };

  const economyAgents = Object.fromEntries(
    payload.economy.map((agent) => {
      const tokensUsed = Math.round(agent.budgetUsed);
      const tokenBudget = Math.round(agent.budgetLimit);
      const costUsd = Math.round((agent.budgetUsed * 0.08) * 100) / 100;
      return [
        agent.agentId,
        {
          agentId: agent.agentId,
          tokenBudget,
          tokensUsed,
          tokensRemaining: Math.max(0, tokenBudget - tokensUsed),
          quotaRemainingRatio: tokenBudget > 0 ? Math.max(0, (tokenBudget - tokensUsed) / tokenBudget) : 1,
          costUsd,
          burnRateUsdPerHour: agent.costPerHour,
          updatedAt: now,
          history: agent.trend.map((point) => ({
            ts: point.ts,
            tokensUsed: Math.round(point.value),
            costUsd: Math.round((point.value * 0.08) * 100) / 100,
          })),
        },
      ];
    })
  );

  const poolTokenQuotaTotal = payload.economy.reduce((sum, agent) => sum + Math.round(agent.budgetLimit), 0);
  const poolTokenQuotaUsed = payload.economy.reduce((sum, agent) => sum + Math.round(agent.budgetUsed), 0);
  const poolCostBudgetUsd = payload.economy.reduce((sum, agent) => sum + Math.round(agent.costPerHour * 24 * 100) / 100, 0);
  const poolCostUsedUsd = payload.economy.reduce((sum, agent) => sum + Math.round((agent.budgetUsed * 0.08) * 100) / 100, 0);

  const economyState = {
    updatedAt: now,
    agents: economyAgents,
    pool: {
      tokenQuotaTotal: poolTokenQuotaTotal,
      tokenQuotaUsed: poolTokenQuotaUsed,
      tokenQuotaRemaining: Math.max(0, poolTokenQuotaTotal - poolTokenQuotaUsed),
      quotaRemainingRatio: poolTokenQuotaTotal > 0 ? Math.max(0, (poolTokenQuotaTotal - poolTokenQuotaUsed) / poolTokenQuotaTotal) : 1,
      costBudgetUsd: Math.round(poolCostBudgetUsd * 100) / 100,
      costUsedUsd: Math.round(poolCostUsedUsd * 100) / 100,
      costRemainingUsd: Math.max(0, Math.round((poolCostBudgetUsd - poolCostUsedUsd) * 100) / 100),
      costRemainingRatio: poolCostBudgetUsd > 0 ? Math.max(0, (poolCostBudgetUsd - poolCostUsedUsd) / poolCostBudgetUsd) : 1,
      updatedAt: now,
    },
  };

  const healthState = {
    updatedAt: now,
    agents: Object.fromEntries(
      payload.health.map((agent) => [
        agent.agentId,
        {
          agentId: agent.agentId,
          status: mapHealthStatus(agent.status as MockHealthStatus),
          connectivity: mapConnectivity(agent.connectivity as MockConnectivity),
          cpuUsage: agent.metrics.cpuUsage,
          memoryUsage: agent.metrics.memoryUsage,
          latencyMs: agent.metrics.latencyMs,
          requestsPerSec: 20,
          errorRate: agent.status === 'critical' ? 0.12 : agent.status === 'degraded' ? 0.03 : 0.005,
          uptimeSec: Math.round(agent.metrics.uptimeMs / 1000),
          consecutiveFailures: agent.connectivity === 'unstable' ? 1 : 0,
          lastCheckAt: now,
          history: [
            {
              ts: now - 60_000,
              cpuUsage: agent.metrics.cpuUsage,
              memoryUsage: agent.metrics.memoryUsage,
              latencyMs: agent.metrics.latencyMs,
              requestsPerSec: 18,
              errorRate: agent.status === 'critical' ? 0.12 : 0.01,
            },
            {
              ts: now,
              cpuUsage: agent.metrics.cpuUsage,
              memoryUsage: agent.metrics.memoryUsage,
              latencyMs: agent.metrics.latencyMs,
              requestsPerSec: 20,
              errorRate: agent.status === 'critical' ? 0.12 : 0.01,
            },
          ],
        },
      ])
    ),
  };

  return {
    payload,
    mapState,
    economyState,
    healthState,
    controlState: {
      ok: true,
      pausedAgents: [],
      budgets: Object.fromEntries(
        payload.economy.map((agent) => [agent.agentId, Math.round(agent.budgetLimit)])
      ),
    },
    rpgStats: {
      stats: {
        velocity: 9,
        uptime: 99,
        backlog: 4,
        spend: 73,
      },
    },
  };
}

async function respondJson(route: Route, body: unknown, delayMs: number = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installMockTacticalMapBackend(
  page: Page,
  options: MockBackendOptions = {}
) {
  const snapshots = buildMockSnapshots(options.profile, options.seed);
  const delayMs = options.delayMs ?? 0;

  await page.route('**/api/tactical-map/state', async (route) => {
    await respondJson(route, snapshots.mapState, delayMs);
  });

  await page.route('**/api/tactical-map/resources', async (route) => {
    await respondJson(route, snapshots.economyState, delayMs);
  });

  await page.route('**/api/tactical-map/health', async (route) => {
    await respondJson(route, snapshots.healthState, delayMs);
  });

  await page.route('**/api/tactical-map/control-state', async (route) => {
    await respondJson(route, snapshots.controlState, delayMs);
  });

  await page.route('**/api/rpg/stats', async (route) => {
    await respondJson(route, snapshots.rpgStats, delayMs);
  });

  return snapshots;
}

export async function applyMockLoadPayload(
  page: Page,
  profile: LoadProfile,
  seed: number = 42
) {
  const { payload } = buildMockSnapshots(profile, seed);

  await page.evaluate((data) => {
    const tm = (window as any).__TACTICAL_MAP__;
    const statusMap: Record<string, 'green' | 'yellow' | 'red'> = {
      healthy: 'green',
      degraded: 'yellow',
      critical: 'red',
    };
    const connectivityMap: Record<string, 'online' | 'offline' | 'degraded'> = {
      connected: 'online',
      disconnected: 'offline',
      unstable: 'degraded',
    };

    tm.setMapState(data.mapState);

    const currentEconomy = tm.economyStore.get();
    const nextEconomy = structuredClone(currentEconomy);
    for (const agent of data.economy) {
      if (!nextEconomy.agents[agent.agentId]) continue;
      nextEconomy.agents[agent.agentId].tokenBudget = Math.round(agent.budgetLimit);
      nextEconomy.agents[agent.agentId].tokensUsed = Math.round(agent.budgetUsed);
      nextEconomy.agents[agent.agentId].tokensRemaining = Math.max(
        0,
        Math.round(agent.budgetLimit) - Math.round(agent.budgetUsed)
      );
      nextEconomy.agents[agent.agentId].quotaRemainingRatio =
        agent.budgetLimit > 0
          ? Math.max(0, (agent.budgetLimit - agent.budgetUsed) / agent.budgetLimit)
          : 1;
      nextEconomy.agents[agent.agentId].costUsd = Math.round((agent.budgetUsed * 0.08) * 100) / 100;
      nextEconomy.agents[agent.agentId].burnRateUsdPerHour = agent.costPerHour;
      nextEconomy.agents[agent.agentId].history = agent.trend.map((point: { ts: number; value: number }) => ({
        ts: point.ts,
        tokensUsed: Math.round(point.value),
        costUsd: Math.round((point.value * 0.08) * 100) / 100,
      }));
    }
    nextEconomy.updatedAt = Date.now();
    tm.setEconomyState(nextEconomy);

    const currentHealth = tm.healthStore.get();
    const nextHealth = structuredClone(currentHealth);
    for (const agent of data.health) {
      if (!nextHealth.agents[agent.agentId]) continue;
      nextHealth.agents[agent.agentId].status = statusMap[agent.status] ?? 'green';
      nextHealth.agents[agent.agentId].connectivity = connectivityMap[agent.connectivity] ?? 'online';
      nextHealth.agents[agent.agentId].metrics = {
        cpuUsage: agent.metrics.cpuUsage,
        memoryUsage: agent.metrics.memoryUsage,
        latencyMs: agent.metrics.latencyMs,
        requestsPerSec: 20,
        errorRate: agent.status === 'critical' ? 0.12 : agent.status === 'degraded' ? 0.03 : 0.005,
        uptimeSec: Math.round(agent.metrics.uptimeMs / 1000),
      };
      nextHealth.agents[agent.agentId].updatedAt = Date.now();
      nextHealth.agents[agent.agentId].history = [
        {
          ts: Date.now() - 60_000,
          cpuUsage: agent.metrics.cpuUsage,
          memoryUsage: agent.metrics.memoryUsage,
          latencyMs: agent.metrics.latencyMs,
          requestsPerSec: 18,
          errorRate: agent.status === 'critical' ? 0.12 : 0.01,
        },
        {
          ts: Date.now(),
          cpuUsage: agent.metrics.cpuUsage,
          memoryUsage: agent.metrics.memoryUsage,
          latencyMs: agent.metrics.latencyMs,
          requestsPerSec: 20,
          errorRate: agent.status === 'critical' ? 0.12 : 0.01,
        },
      ];
    }
    nextHealth.updatedAt = Date.now();
    nextHealth.alerts = [];
    tm.setHealthState(nextHealth);
  }, payload);
}

export async function exerciseApiBurst(
  page: Page,
  iterations: number,
  endpoint: '/api/tactical-map/state' | '/api/tactical-map/resources' | '/api/tactical-map/health' = '/api/tactical-map/state'
) {
  await page.evaluate(
    async ({ count, url }) => {
      await Promise.all(
        Array.from({ length: count }, async () => {
          try {
            await fetch(url);
          } catch {
            // Ignore benchmark transport failures; the test asserts render continuity.
          }
        })
      );
    },
    { count: iterations, url: endpoint }
  );
}
