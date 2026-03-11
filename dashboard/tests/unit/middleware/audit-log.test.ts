/**
 * Audit log middleware tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest } from '../../helpers.js';

// Mock lib/paths before import
vi.mock('../../../../lib/paths.js', () => ({
  LOG_DIR: '/tmp/test-audit-logs',
  default: { LOG_DIR: '/tmp/test-audit-logs' },
}));

// Mock fs to capture writes
const appendFileCalls: Array<{ path: string; data: string }> = [];

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      appendFile: vi.fn((filePath: string, data: string, cb: (err: Error | null) => void) => {
        appendFileCalls.push({ path: filePath, data });
        cb(null);
      }),
      appendFileSync: vi.fn(),
    },
    mkdirSync: vi.fn(),
    appendFile: vi.fn((filePath: string, data: string, cb: (err: Error | null) => void) => {
      appendFileCalls.push({ path: filePath, data });
      cb(null);
    }),
    appendFileSync: vi.fn(),
  };
});

const { auditLog, flush, LOG_FILE } = await import('../../../server/middleware/audit-log.js');

describe('Audit Log Middleware', () => {
  beforeEach(() => {
    appendFileCalls.length = 0;
  });

  describe('LOG_FILE', () => {
    it('points to tactical-map-access.log in LOG_DIR', () => {
      expect(LOG_FILE).toContain('tactical-map-access.log');
      expect(LOG_FILE).toContain('test-audit-logs');
    });
  });

  describe('auditLog', () => {
    it('accepts an event and null request', () => {
      expect(() => auditLog('test_event', null)).not.toThrow();
    });

    it('accepts an event with request and details', () => {
      const req = mockRequest({
        url: '/api/test',
        method: 'GET',
        headers: { 'user-agent': 'test-agent', 'x-forwarded-for': '1.2.3.4' },
      });
      expect(() => auditLog('test_event', req, { extra: 'detail' })).not.toThrow();
    });
  });

  describe('flush', () => {
    it('does not throw when called', () => {
      expect(() => flush()).not.toThrow();
    });

    it('writes buffered entries to disk', () => {
      auditLog('flush_test', null, { item: 'a' });
      auditLog('flush_test', null, { item: 'b' });
      flush();
      expect(appendFileCalls.length).toBeGreaterThanOrEqual(1);
      const written = appendFileCalls.map(c => c.data).join('');
      expect(written).toContain('flush_test');
    });

    it('clears buffer after flush', () => {
      auditLog('clear_test', null);
      flush();
      const countAfterFirst = appendFileCalls.length;
      flush();
      expect(appendFileCalls.length).toBe(countAfterFirst);
    });

    it('redacts query params from logged path', () => {
      const req = mockRequest({
        url: '/api/live?token=super-secret-token&foo=bar',
        method: 'GET',
      });

      auditLog('query_redaction_test', req);
      flush();

      const written = appendFileCalls.map(c => c.data).join('');
      expect(written).not.toContain('super-secret-token');

      const firstLine = written.split('\n').find(Boolean);
      expect(firstLine).toBeTruthy();
      const entry = JSON.parse(firstLine || '{}') as { path: string };
      expect(entry.path).toBe('/api/live');
    });
  });
});
