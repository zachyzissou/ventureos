/**
 * Integration tests — server module export verification.
 */

import { describe, it, expect, vi } from 'vitest';

// Set environment before any imports to avoid port conflicts
const TEST_PORT = 18901 + Math.floor(Math.random() * 100);
process.env.DASHBOARD_PORT = String(TEST_PORT);
process.env.DASHBOARD_HOST = '127.0.0.1';
process.env.DASHBOARD_API_TOKEN = 'integration-test-token';
process.env.VENTUREOS_CACHE_TTL_MS = '100';

describe('Server Integration', () => {
  describe('PORT export', () => {
    it('reads port from DASHBOARD_PORT env', async () => {
      const { PORT } = await import('../../server/server.js');
      expect(PORT).toBe(TEST_PORT);
    });
  });
});
