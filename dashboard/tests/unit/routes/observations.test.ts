/**
 * Observations route handler tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleObservations } from '../../../server/routes/observations.js';
import type { ObservationsDeps } from '../../../server/types.js';

const obsFixtureDir = path.join('/tmp', 'test-obs-dir-' + process.pid);

beforeEach(() => {
  fs.mkdirSync(obsFixtureDir, { recursive: true });
  // Clean
  for (const f of fs.readdirSync(obsFixtureDir)) fs.unlinkSync(path.join(obsFixtureDir, f));
  // Copy fixture
  fs.copyFileSync(
    path.resolve(import.meta.dirname, '../../fixtures/observations-2025-01-01.md'),
    path.join(obsFixtureDir, '2025-01-01.md'),
  );
  fs.utimesSync(path.join(obsFixtureDir, '2025-01-01.md'), new Date(), new Date());
});

function createDeps(overrides: Partial<ObservationsDeps> = {}): ObservationsDeps {
  return {
    OBSERVATIONS_DIR: obsFixtureDir,
    safeReadText: (filePath: string, fallback: string) => {
      try { if (!fs.existsSync(filePath)) return fallback; return fs.readFileSync(filePath, 'utf8'); } catch { return fallback; }
    },
    sendJson: (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); },
    clampInt: (n, lo, hi, dflt) => { const v = parseInt(String(n)); if (Number.isNaN(v)) return dflt; return Math.max(lo, Math.min(hi, v)); },
    ...overrides,
  };
}

describe('Observations Route Handler', () => {
  describe('/api/observations/recent', () => {
    it('returns recent observation files', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/recent' }), res, createDeps());
      expect(res._ended).toBe(true);
      const body = parseJsonBody(res);
      expect(body.hours).toBe(24);
      expect(body.count).toBeGreaterThanOrEqual(1);
    });

    it('respects hours parameter', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/recent?hours=1' }), res, createDeps());
      expect(parseJsonBody(res).hours).toBe(1);
    });

    it('includes snippets', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/recent?hours=48' }), res, createDeps());
      const body = parseJsonBody(res);
      if ((body.items as any[]).length > 0) {
        expect((body.items as any[])[0].snippet.length).toBeGreaterThan(0);
      }
    });

    it('handles empty directory', () => {
      const emptyDir = path.join('/tmp', 'empty-obs-' + Date.now());
      fs.mkdirSync(emptyDir, { recursive: true });
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/recent' }), res, createDeps({ OBSERVATIONS_DIR: emptyDir }));
      expect(parseJsonBody(res).count).toBe(0);
    });
  });

  describe('/api/observations/search', () => {
    it('searches for matching text', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/search?q=Oracle' }), res, createDeps());
      expect(parseJsonBody(res).count).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for non-matching query', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/search?q=zzz_nonexistent' }), res, createDeps());
      expect(parseJsonBody(res).count).toBe(0);
    });

    it('returns 400 when q missing', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/search' }), res, createDeps());
      expect(res._statusCode).toBe(400);
    });

    it('search is case-insensitive', () => {
      const res = mockResponse();
      handleObservations(mockRequest({ url: '/api/observations/search?q=oracle' }), res, createDeps());
      expect(parseJsonBody(res).count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('routing', () => {
    it('returns false for non-observation URLs', () => {
      expect(handleObservations(mockRequest({ url: '/api/sessions' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false for POST', () => {
      expect(handleObservations(mockRequest({ url: '/api/observations/recent', method: 'POST' }), mockResponse(), createDeps())).toBe(false);
    });

    it('returns false when req is null', () => {
      expect(handleObservations(null as any, mockResponse(), createDeps())).toBe(false);
    });
  });
});
