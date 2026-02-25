/**
 * Config module tests.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/paths.js', () => ({
  VENTUREOS_ROOT: '/mock/ventureos',
  SHARED_CONTEXT_DIR: '/mock/shared-context',
  KPI_DIR: '/mock/kpis',
  OBSERVATIONS_DIR: '/mock/observations',
}));

const { config, VENTUREOS_ROOT, SHARED_CONTEXT, KPI_DIR, OBSERVATIONS_DIR } =
  await import('../../server/config.js');

describe('Dashboard Config', () => {
  describe('path exports', () => {
    it('exports VENTUREOS_ROOT from lib/paths', () => {
      expect(VENTUREOS_ROOT).toBe('/mock/ventureos');
    });

    it('exports SHARED_CONTEXT from lib/paths', () => {
      expect(SHARED_CONTEXT).toBe('/mock/shared-context');
    });

    it('exports KPI_DIR from lib/paths', () => {
      expect(KPI_DIR).toBe('/mock/kpis');
    });

    it('exports OBSERVATIONS_DIR from lib/paths', () => {
      expect(OBSERVATIONS_DIR).toBe('/mock/observations');
    });
  });

  describe('config object', () => {
    it('has all required fields', () => {
      expect(config).toBeDefined();
      expect(config.VENTUREOS_ROOT).toBeDefined();
      expect(config.SHARED_CONTEXT).toBeDefined();
      expect(config.KPI_DIR).toBeDefined();
      expect(config.OBSERVATIONS_DIR).toBeDefined();
    });

    it('matches individual exports', () => {
      expect(config.VENTUREOS_ROOT).toBe(VENTUREOS_ROOT);
      expect(config.SHARED_CONTEXT).toBe(SHARED_CONTEXT);
      expect(config.KPI_DIR).toBe(KPI_DIR);
      expect(config.OBSERVATIONS_DIR).toBe(OBSERVATIONS_DIR);
    });

    it('has string values for all paths', () => {
      for (const [_key, value] of Object.entries(config)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });
});
