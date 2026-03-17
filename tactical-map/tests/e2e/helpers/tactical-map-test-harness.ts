import type { Page, Route } from '@playwright/test';

const FIXED_TIMESTAMP = '2026-02-01T00:00:00.000Z';

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installDeterministicApiMocks(page: Page): Promise<void> {
  // Prevent websocket noise/flakiness; clients fall back to mocked HTTP snapshots.
  // Also pin tour completion so visual snapshots don't include onboarding overlays.
  await page.addInitScript(() => {
    (window as unknown as { WebSocket?: unknown }).WebSocket = undefined;
    try {
      localStorage.setItem('ventureos_tour_completed', 'true');
    } catch {
      // Ignore private-mode/storage-disabled contexts.
    }
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (method === 'GET' && path.endsWith('/api/tactical-map/state')) {
      return json(route, { updatedAt: FIXED_TIMESTAMP, agents: {} });
    }
    if (method === 'GET' && path.endsWith('/api/tactical-map/resources')) {
      return json(route, {
        updatedAt: FIXED_TIMESTAMP,
        agents: {},
        pool: {
          tokenQuotaTotal: 0,
          tokenQuotaUsed: 0,
          tokenQuotaRemaining: 0,
          tokenQuotaRemainingRatio: 1,
          costBudgetUsd: 0,
          costUsedUsd: 0,
          costRemainingUsd: 0,
          costRemainingRatio: 1,
          updatedAt: FIXED_TIMESTAMP,
        },
      });
    }
    if (method === 'GET' && path.endsWith('/api/tactical-map/health')) {
      return json(route, {
        updatedAt: FIXED_TIMESTAMP,
        agents: {},
        system: {
          overallStatus: 'green',
          aggregateMetrics: {},
        },
      });
    }
    if (method === 'GET' && path.endsWith('/api/tactical-map/control-state')) {
      return json(route, {
        ok: true,
        pausedAgents: [],
        budgets: {},
      });
    }
    if (method === 'GET' && path.endsWith('/api/rpg/stats')) {
      return json(route, { stats: {} });
    }
    if (method === 'GET' && path.endsWith('/api/tactical-map/missions')) {
      return json(route, { ok: true, missions: [] });
    }

    if (method === 'POST') {
      return json(route, { ok: true });
    }

    return json(route, {});
  });
}

export async function stabilizeForVisualSnapshot(page: Page): Promise<void> {
  const fixedTs = Date.parse(FIXED_TIMESTAMP);

  await page.waitForFunction(
    (expectedTs) => {
      const tm = (window as unknown as {
        __TACTICAL_MAP__?: {
          mapStore?: { get?: () => { updatedAt?: string } };
          economyStore?: { get?: () => { updatedAt?: number } };
          healthStore?: { get?: () => { updatedAt?: number } };
        };
      }).__TACTICAL_MAP__;

      const mapUpdatedAt = tm?.mapStore?.get?.()?.updatedAt;
      const economyUpdatedAt = tm?.economyStore?.get?.()?.updatedAt;
      const healthUpdatedAt = tm?.healthStore?.get?.()?.updatedAt;

      return (
        typeof mapUpdatedAt === 'string' &&
        Date.parse(mapUpdatedAt) === expectedTs &&
        typeof economyUpdatedAt === 'number' &&
        economyUpdatedAt === expectedTs &&
        typeof healthUpdatedAt === 'number' &&
        healthUpdatedAt > 0
      );
    },
    fixedTs
  );

  await page.evaluate(() => {
    const tm = (window as unknown as {
      __TACTICAL_MAP__?: {
        api?: { stop?: () => void };
        economyClient?: { stop?: () => void };
        healthClient?: { stop?: () => void };
        pause?: () => void;
        resetVisualState?: () => void;
        snapshot?: () => void;
      };
    }).__TACTICAL_MAP__;

    tm?.api?.stop?.();
    tm?.economyClient?.stop?.();
    tm?.healthClient?.stop?.();
    tm?.pause?.();
    tm?.resetVisualState?.();
    tm?.snapshot?.();
  });
}
