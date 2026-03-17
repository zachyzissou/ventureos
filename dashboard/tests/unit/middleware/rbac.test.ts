import { describe, it, expect, vi, beforeEach } from 'vitest';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';

vi.mock('../../../../lib/paths.js', () => ({
  LOG_DIR: '/tmp/test-logs',
  OPENCLAW_DIR: '/tmp/test-openclaw',
  VENTUREOS_ROOT: '/tmp/test-ventureos',
  SHARED_CONTEXT_DIR: '/tmp/test-shared-context',
  KPI_DIR: '/tmp/test-kpis',
  OBSERVATIONS_DIR: '/tmp/test-observations',
  default: {
    LOG_DIR: '/tmp/test-logs',
    OPENCLAW_DIR: '/tmp/test-openclaw',
    VENTUREOS_ROOT: '/tmp/test-ventureos',
    SHARED_CONTEXT_DIR: '/tmp/test-shared-context',
    KPI_DIR: '/tmp/test-kpis',
    OBSERVATIONS_DIR: '/tmp/test-observations',
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => {
        if (String(p).includes('.api-token')) return true;
        if (String(p).includes('test-logs')) return true;
        return actual.existsSync(p);
      }),
      readFileSync: vi.fn((p: string, ...args: unknown[]) => {
        if (String(p).includes('.api-token')) return 'test-token-abc123';
        return actual.readFileSync(p, ...args as [BufferEncoding]);
      }),
      appendFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn((p: string) => {
      if (String(p).includes('.api-token')) return true;
      if (String(p).includes('test-logs')) return true;
      return actual.existsSync(p);
    }),
    readFileSync: vi.fn((p: string, ...args: unknown[]) => {
      if (String(p).includes('.api-token')) return 'test-token-abc123';
      return actual.readFileSync(p, ...args as [BufferEncoding]);
    }),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

const { authorizeDashboardRbac } = await import('../../../server/middleware/rbac.js');

describe('dashboard RBAC middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes read-only routes without requiring subject headers', () => {
    const req = mockRequest({ method: 'GET', url: '/api/task-board' });
    const res = mockResponse();
    expect(authorizeDashboardRbac(req, res)).toBe(true);
  });

  it('rejects privileged routes without canonical subject headers', () => {
    const req = mockRequest({ method: 'POST', url: '/api/task-board' });
    const res = mockResponse();
    expect(authorizeDashboardRbac(req, res)).toBe(false);
    expect(res._statusCode).toBe(403);
    expect(parseJsonBody<{ requiredHeaders: string[] }>(res).requiredHeaders).toContain('x-ventureos-binding-id');
  });

  it('allows operations control subject to mutate task board state', () => {
    const req = mockRequest({
      method: 'PATCH',
      url: '/api/task-board/task-1',
      headers: {
        'x-ventureos-binding-id': 'operations:operator',
        'x-ventureos-capability-id': 'venture_control',
      },
    });
    const res = mockResponse();
    expect(authorizeDashboardRbac(req, res)).toBe(true);
  });

  it('rejects delegated operator subject for dashboard control routes', () => {
    const req = mockRequest({
      method: 'POST',
      url: '/api/action/clear-cache',
      headers: {
        'x-ventureos-binding-id': 'engineering:operator',
        'x-ventureos-capability-id': 'venture_delivery',
      },
    });
    const res = mockResponse();
    expect(authorizeDashboardRbac(req, res)).toBe(false);
    expect(res._statusCode).toBe(403);
    expect(parseJsonBody<{ code: string }>(res).code).toBe('ACTOR_FORBIDDEN');
  });
});
