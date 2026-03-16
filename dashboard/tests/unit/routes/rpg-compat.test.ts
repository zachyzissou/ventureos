import { describe, it, expect, vi } from 'vitest';

import { mockRequest, mockResponse } from '../../helpers.js';
import { handleRpgCompat } from '../../../server/routes/rpg-compat.js';

function createDeps(overrides: Record<string, unknown> = {}) {
  const handleRpgApi = vi.fn(() => true);
  return {
    deps: {
      dbPath: '/tmp/rpg.db',
      handleRpgApi,
      ...overrides,
    },
    spies: { handleRpgApi },
  };
}

describe('rpg-compat', () => {
  it('returns false for non-alias paths', () => {
    const { deps, spies } = createDeps();
    const req = mockRequest({ url: '/api/sessions' });
    const handled = handleRpgCompat(req, mockResponse(), deps as any);
    expect(handled).toBe(false);
    expect(spies.handleRpgApi).not.toHaveBeenCalled();
  });

  it('rewrites /api/performance-stats to canonical route', () => {
    const { deps, spies } = createDeps();
    const req = mockRequest({ url: '/api/performance-stats' });
    const handled = handleRpgCompat(req, mockResponse(), deps as any);
    expect(handled).toBe(true);
    expect(req.url).toBe('/api/rpg/stats');
    expect(spies.handleRpgApi).toHaveBeenCalledTimes(1);
  });

  it('rewrites /api/affinity-network query path preserving query string', () => {
    const { deps } = createDeps();
    const req = mockRequest({ url: '/api/affinity-network?limit=10' });
    const handled = handleRpgCompat(req, mockResponse(), deps as any);
    expect(handled).toBe(true);
    expect(req.url).toBe('/api/rpg/affinity-network?limit=10');
  });

  it('rewrites tactical overlay paths', () => {
    const { deps } = createDeps();
    const req = mockRequest({ url: '/api/tactical-overlay/sector-a' });
    const handled = handleRpgCompat(req, mockResponse(), deps as any);
    expect(handled).toBe(true);
    expect(req.url).toBe('/api/rpg/tactical-overlay/sector-a');
  });

  it('preserves rewritten URL when handler does not handle request', () => {
    const { deps } = createDeps({
      handleRpgApi: vi.fn(() => false),
    });
    const req = mockRequest({ url: '/api/protocols/openclaw' });
    const handled = handleRpgCompat(req, mockResponse(), deps as any);
    expect(handled).toBe(false);
    expect(req.url).toBe('/api/rpg/protocols/openclaw');
  });
});
