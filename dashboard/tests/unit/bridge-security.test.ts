import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeIp,
  isAllowedIp,
  authorizeRequest,
  readBridgeToken,
  parseRateLimits,
  rateLimitGroup,
  createRateLimiter,
} from '../../server/bridge-security.js';

describe('bridge-security', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BRIDGE_TOKEN_FILE;
  });

  it('normalizes IPv4-mapped addresses and allowlist CIDRs', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(isAllowedIp('::ffff:172.17.0.10', ['172.17.0.0/16'])).toBe(true);
    expect(isAllowedIp('10.0.0.5', ['172.17.0.0/16'])).toBe(false);
  });

  it('authorizes only matching bearer tokens', () => {
    expect(authorizeRequest('Bearer secret-token', 'secret-token')).toBe(true);
    expect(authorizeRequest('Bearer wrong-token', 'secret-token')).toBe(false);
    expect(authorizeRequest(undefined, 'secret-token')).toBe(false);
  });

  it('reads token from env first, then token file fallback', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-token-'));
    const tokenFile = path.join(tmp, 'bridge-token');
    fs.writeFileSync(tokenFile, 'file-token\n', 'utf8');

    expect(readBridgeToken(tokenFile, 'env-token')).toBe('env-token');
    expect(readBridgeToken(tokenFile, undefined)).toBe('file-token');
  });

  it('uses BRIDGE_TOKEN_FILE env override when env token is unset', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-token-env-file-'));
    const envFile = path.join(tmp, 'bridge-token-env');
    const fallbackFile = path.join(tmp, 'bridge-token-default');
    fs.writeFileSync(envFile, 'env-file-token\n', 'utf8');
    fs.writeFileSync(fallbackFile, 'fallback-token\n', 'utf8');

    process.env.BRIDGE_TOKEN_FILE = envFile;
    expect(readBridgeToken(fallbackFile, undefined)).toBe('env-file-token');
  });

  it('parses rate limit rules with default fallback and enforces windows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const limits = parseRateLimits('default=2/1s;expensive=1/2s');
    expect(limits.default).toEqual({ max: 2, windowMs: 1000 });
    expect(limits.expensive).toEqual({ max: 1, windowMs: 2000 });
    expect(rateLimitGroup('/api/bridge/costs')).toBe('expensive');
    expect(rateLimitGroup('/api/bridge/live')).toBe('sse');

    const limiter = createRateLimiter(limits);
    expect(limiter('127.0.0.1', 'default').allowed).toBe(true);
    expect(limiter('127.0.0.1', 'default').allowed).toBe(true);
    const blocked = limiter('127.0.0.1', 'default');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);

    vi.advanceTimersByTime(1001);
    expect(limiter('127.0.0.1', 'default').allowed).toBe(true);
  });
});
