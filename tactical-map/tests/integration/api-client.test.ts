import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { API } from '@/config';
import { createApiClient } from '@/data/api-client';

const server = setupServer(
  http.get('*/api/tactical-map/state', () =>
    HttpResponse.json({
      updatedAt: '2026-02-14T00:00:00.000Z',
      agents: {
        oracle: { state: 'ACTIVE', sessions: 1 },
        atlas: { state: 'IDLE', sessions: 0 }
      }
    })
  ),
  http.get('*/api/rpg/stats', () => HttpResponse.json({ stats: { 'Oracle WIS': 85, 'Atlas SPD': 72 } }))
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function waitFor<T>(fn: () => T, pred: (v: T) => boolean, timeoutMs = 1500): Promise<T> {
  const start = performance.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const v = fn();
    if (pred(v)) return v;
    if (performance.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('api-client', () => {
  it('fetchOnce() returns normalized MapState', async () => {
    const client = createApiClient({ onMapState: () => {} });
    const s = await client.fetchOnce();

    expect(s.updatedAt).toContain('2026-02-14');
    expect(s.agents.oracle.state).toBe('ACTIVE');
    expect(s.agents.oracle.sessions).toBe(1);
    // unknown agents should still exist in normalized state
    expect(s.agents.sentinel).toBeTruthy();
  });

  it('start() schedules next poll at API.POLL_INTERVAL after success', async () => {
    const updates: unknown[] = [];

    const scheduler = {
      setTimeout: vi.fn((_fn: () => void, _ms: number) => 123),
      clearTimeout: vi.fn((_id: number) => void 0)
    };

    const client = createApiClient(
      {
        onMapState: (s) => updates.push(s),
        onError: () => updates.push('error')
      },
      scheduler
    );

    client.start();

    await waitFor(
      () => updates.length,
      (n) => n >= 1
    );

    const delays = scheduler.setTimeout.mock.calls.map((c) => c[1]);
    expect(delays).toContain(API.POLL_INTERVAL);

    client.stop();
  });

  it('backs off on error (doubles delay)', async () => {
    let first = true;
    server.use(
      http.get('*/api/tactical-map/state', () => {
        if (first) {
          first = false;
          return new HttpResponse('boom', { status: 500 });
        }
        return HttpResponse.json({ updatedAt: 'x', agents: { oracle: { state: 'IDLE' } } });
      })
    );

    const scheduler = {
      setTimeout: vi.fn((_fn: () => void, _ms: number) => 1),
      clearTimeout: vi.fn((_id: number) => void 0)
    };

    const errors: unknown[] = [];
    const client = createApiClient({ onMapState: () => {}, onError: (e) => errors.push(e) }, scheduler);

    client.start();
    await waitFor(
      () => errors.length,
      (n) => n >= 1
    );

    const delays = scheduler.setTimeout.mock.calls.map((c) => c[1]);
    expect(delays).toContain(API.POLL_INTERVAL * 2);

    client.stop();
  });
});
