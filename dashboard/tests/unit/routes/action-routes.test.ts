import { describe, it, expect, vi } from 'vitest';

import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleActionRoutes } from '../../../server/routes/action-routes.js';

function createDeps(overrides: Record<string, unknown> = {}) {
  const clearCaches = vi.fn();
  const runShellCommand = vi.fn(async () => ({ ok: true, output: 'ok' }));
  const resolveRestartActionCommand = vi.fn((action: string) => ({
    command: `echo ${action}`,
    timeoutMs: 1000,
  }));
  const toSafeError = vi.fn((_error: unknown) => ({
    error: 'safe-error',
    errorRef: 'err-ref',
    status: 500,
  }));
  const logInfo = vi.fn();
  const logError = vi.fn();
  const execCommand = vi.fn(
    (
      _command: string,
      _options: { timeout?: number },
      callback: (error: { message?: string } | null, stdout?: string) => void,
    ) => callback(null, 'ok\n'),
  );

  const deps = {
    sendJson: (res: ReturnType<typeof mockResponse>, data: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    runShellCommand,
    resolveRestartActionCommand,
    toSafeError,
    logInfo,
    logError,
    clearCaches,
    workspaceDir: '/tmp/workspace',
    execCommand,
    ...overrides,
  };

  return {
    deps,
    spies: {
      clearCaches,
      runShellCommand,
      resolveRestartActionCommand,
      toSafeError,
      logInfo,
      logError,
      execCommand,
    },
  };
}

describe('action-routes', () => {
  it('returns false for non-action paths', async () => {
    const { deps } = createDeps();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/sessions' }),
      mockResponse(),
      deps as any,
    );
    expect(handled).toBe(false);
  });

  it('returns false for non-POST methods', async () => {
    const { deps } = createDeps();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'GET', url: '/api/action/restart-openclaw' }),
      mockResponse(),
      deps as any,
    );
    expect(handled).toBe(false);
  });

  it('returns unsupported restart error with 400', async () => {
    const { deps } = createDeps({
      resolveRestartActionCommand: vi.fn(() => ({
        command: '',
        timeoutMs: 1000,
        unsupportedReason: 'unsupported-on-platform',
      })),
    });
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/restart-openclaw' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(400);
    expect(parseJsonBody<{ error: string; success: boolean }>(res)).toEqual({
      success: false,
      error: 'unsupported-on-platform',
    });
  });

  it('returns 502 when restart command fails', async () => {
    const { deps } = createDeps({
      runShellCommand: vi.fn(async () => ({
        ok: false,
        output: 'stderr',
        error: 'command-failed',
      })),
    });
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/restart-openclaw' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(502);
    expect(parseJsonBody<{ success: boolean; error: string; output: string }>(res)).toEqual({
      success: false,
      error: 'command-failed',
      output: 'stderr',
    });
  });

  it('returns success payload for restart-dashboard', async () => {
    const { deps } = createDeps({
      runShellCommand: vi.fn(async () => ({ ok: true, output: 'done' })),
    });
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/restart-dashboard' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(res._statusCode).toBe(200);
    expect(parseJsonBody<{ success: boolean; message: string; output: string }>(res)).toEqual({
      success: true,
      message: 'Dashboard restart command completed.',
      output: 'done',
    });
  });

  it('clears caches and returns success', async () => {
    const { deps, spies } = createDeps();
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/clear-cache' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(spies.clearCaches).toHaveBeenCalledTimes(1);
    expect(parseJsonBody<{ success: boolean }>(res)).toEqual({ success: true });
  });

  it('handles update-openclaw command failure via callback', async () => {
    const { deps } = createDeps({
      execCommand: vi.fn((_command: string, _options: { timeout?: number }, callback: any) =>
        callback({ message: 'exec-failed' }, ''),
      ),
    });
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/update-openclaw' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(parseJsonBody<{ success: boolean; error: string }>(res)).toEqual({
      success: false,
      output: '',
      error: 'exec-failed',
    });
  });

  it('falls back to default check-update message when stdout is empty', async () => {
    const { deps } = createDeps({
      execCommand: vi.fn((_command: string, _options: { timeout?: number }, callback: any) =>
        callback(null, ''),
      ),
    });
    const res = mockResponse();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/check-update' }),
      res,
      deps as any,
    );
    expect(handled).toBe(true);
    expect(parseJsonBody<{ success: boolean; output: string }>(res)).toEqual({
      success: true,
      output: 'All packages up to date',
    });
  });

  it('returns false for unknown action route', async () => {
    const { deps } = createDeps();
    const handled = await handleActionRoutes(
      mockRequest({ method: 'POST', url: '/api/action/unknown' }),
      mockResponse(),
      deps as any,
    );
    expect(handled).toBe(false);
  });
});
