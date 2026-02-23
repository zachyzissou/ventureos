/**
 * Privileged action endpoint guard tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest, mockResponse } from '../../helpers.js';

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
      writeFileSync: vi.fn(),
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
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

async function loadGuard() {
  vi.resetModules();
  return await import('../../../server/middleware/action-guard.js');
}

describe('Action Guard Middleware', () => {
  beforeEach(() => {
    delete process.env.DASHBOARD_ENABLE_ACTIONS;
    delete process.env.DASHBOARD_ACTIONS_LOCALHOST_ONLY;
    delete process.env.DASHBOARD_ACTION_REAUTH;
    vi.clearAllMocks();
  });

  it('passes non-action routes', async () => {
    const { authorizeActionRequest } = await loadGuard();
    const req = mockRequest({ url: '/api/system', method: 'GET' });
    const res = mockResponse();

    expect(authorizeActionRequest(req, res)).toBe(true);
  });

  it('blocks action routes by default when feature gate is disabled', async () => {
    const { authorizeActionRequest } = await loadGuard();
    const req = mockRequest({ url: '/api/action/clear-cache', method: 'POST' });
    const res = mockResponse();

    expect(authorizeActionRequest(req, res)).toBe(false);
    expect(res._statusCode).toBe(404);
  });

  it('allows localhost action routes when feature gate is enabled', async () => {
    process.env.DASHBOARD_ENABLE_ACTIONS = 'true';

    const { authorizeActionRequest } = await loadGuard();
    const req = mockRequest({
      url: '/api/action/clear-cache',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const res = mockResponse();

    expect(authorizeActionRequest(req, res)).toBe(true);
  });

  it('blocks non-loopback callers by default when actions are enabled', async () => {
    process.env.DASHBOARD_ENABLE_ACTIONS = 'true';

    const { authorizeActionRequest } = await loadGuard();
    const req = mockRequest({
      url: '/api/action/clear-cache',
      method: 'POST',
      socket: { remoteAddress: '192.168.1.50' },
    });
    const res = mockResponse();

    expect(authorizeActionRequest(req, res)).toBe(false);
    expect(res._statusCode).toBe(403);
  });

  it('allows remote callers when localhost restriction is explicitly disabled', async () => {
    process.env.DASHBOARD_ENABLE_ACTIONS = 'true';
    process.env.DASHBOARD_ACTIONS_LOCALHOST_ONLY = 'false';

    const { authorizeActionRequest } = await loadGuard();
    const req = mockRequest({
      url: '/api/action/clear-cache',
      method: 'POST',
      socket: { remoteAddress: '192.168.1.50' },
    });
    const res = mockResponse();

    expect(authorizeActionRequest(req, res)).toBe(true);
  });

  it('requires re-auth header when DASHBOARD_ACTION_REAUTH=true', async () => {
    process.env.DASHBOARD_ENABLE_ACTIONS = 'true';
    process.env.DASHBOARD_ACTION_REAUTH = 'true';

    const { authorizeActionRequest, ACTION_REAUTH_HEADER } = await loadGuard();

    const missingTokenReq = mockRequest({
      url: '/api/action/clear-cache',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
    });
    const missingTokenRes = mockResponse();
    expect(authorizeActionRequest(missingTokenReq, missingTokenRes)).toBe(false);
    expect(missingTokenRes._statusCode).toBe(401);

    const goodTokenReq = mockRequest({
      url: '/api/action/clear-cache',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { [ACTION_REAUTH_HEADER]: 'test-token-abc123' },
    });
    const goodTokenRes = mockResponse();
    expect(authorizeActionRequest(goodTokenReq, goodTokenRes)).toBe(true);
  });
});
