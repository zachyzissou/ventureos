/**
 * Tests for lib/http-types.ts — Shared HTTP middleware types.
 * Issue #79: Dashboard Server Integration & Shared Libraries.
 *
 * Since these are type-only exports, we verify they can be imported
 * and used for type checking (no runtime behavior to test).
 */

import type {
  HttpRequest,
  ApiEnvelope,
  PaginatedEnvelope,
  Middleware,
  RouteHandler,
  HttpRateLimitResult,
  HttpRateLimitConfig,
  CookieMap,
  AuthResult,
  AuditLogEntry,
  SafeHttpError,
} from '../http-types';

describe('lib/http-types', () => {
  it('ApiEnvelope supports success responses', () => {
    const response: ApiEnvelope<{ count: number }> = {
      ok: true,
      data: { count: 42 },
    };
    expect(response.ok).toBe(true);
    expect(response.data?.count).toBe(42);
  });

  it('ApiEnvelope supports error responses', () => {
    const response: ApiEnvelope = {
      ok: false,
      error: 'Something went wrong',
      errorRef: 'ERR-12345678',
    };
    expect(response.ok).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('PaginatedEnvelope includes pagination metadata', () => {
    const response: PaginatedEnvelope<string> = {
      ok: true,
      data: ['a', 'b', 'c'],
      total: 100,
      offset: 0,
      limit: 3,
    };
    expect(response.total).toBe(100);
    expect(response.data).toHaveLength(3);
  });

  it('HttpRateLimitResult matches dashboard rate-limit contract', () => {
    const result: HttpRateLimitResult = {
      allowed: true,
      remaining: 59,
      resetMs: 60000,
    };
    expect(result.allowed).toBe(true);
    expect(typeof result.remaining).toBe('number');
    expect(typeof result.resetMs).toBe('number');
  });

  it('HttpRateLimitConfig matches dashboard endpoint config', () => {
    const config: HttpRateLimitConfig = {
      limit: 60,
      windowMs: 60000,
    };
    expect(config.limit).toBe(60);
    expect(config.windowMs).toBe(60000);
  });

  it('AuthResult tracks authentication method', () => {
    const result: AuthResult = {
      authenticated: true,
      method: 'bearer',
      clientIp: '192.168.1.1',
    };
    expect(result.authenticated).toBe(true);
    expect(result.method).toBe('bearer');
  });

  it('SafeHttpError never leaks implementation details', () => {
    const err: SafeHttpError = {
      ok: false,
      error: 'An internal error occurred. Please try again later.',
      errorRef: 'ERR-ABCD1234',
      status: 500,
    };
    expect(err.ok).toBe(false);
    expect(err.error).not.toContain('ENOENT');
    expect(err.error).not.toContain('/Users/');
    expect(err.errorRef).toMatch(/^ERR-[A-F0-9]{8}$/);
  });

  it('AuditLogEntry has required fields', () => {
    const entry: AuditLogEntry = {
      ts: '2026-02-16T03:16:00.000Z',
      event: 'auth_failure',
      ip: '192.168.1.100',
      method: 'GET',
      path: '/api/sessions',
      userAgent: 'test-agent',
    };
    expect(entry.ts).toBeDefined();
    expect(entry.event).toBe('auth_failure');
  });

  it('CookieMap is a string record', () => {
    const cookies: CookieMap = {
      session_id: 'abc123',
      theme: 'dark',
    };
    expect(cookies['session_id']).toBe('abc123');
  });
});
