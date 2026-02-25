/**
 * CORS middleware tests.
 */

import { describe, it, expect } from 'vitest';
import { mockRequest, mockResponse } from '../../helpers.js';
import { applyCors, handlePreflight, ALLOWED_ORIGINS } from '../../../server/middleware/cors.js';

describe('CORS Middleware', () => {
  describe('ALLOWED_ORIGINS', () => {
    it('includes localhost origins', () => {
      expect(ALLOWED_ORIGINS.has('http://localhost:7001')).toBe(true);
      expect(ALLOWED_ORIGINS.has('http://localhost:7000')).toBe(true);
      expect(ALLOWED_ORIGINS.has('http://localhost:5173')).toBe(true);
    });

    it('includes LAN origins', () => {
      expect(ALLOWED_ORIGINS.has('http://192.168.225.149:7001')).toBe(true);
      expect(ALLOWED_ORIGINS.has('http://192.168.225.149:7000')).toBe(true);
    });

    it('does not include random origins', () => {
      expect(ALLOWED_ORIGINS.has('http://evil.com')).toBe(false);
    });
  });

  describe('applyCors', () => {
    it('sets Access-Control-Allow-Origin for whitelisted origin', () => {
      const req = mockRequest({ headers: { origin: 'http://localhost:7001' } });
      const res = mockResponse();
      applyCors(req, res);
      expect(res._headers['access-control-allow-origin']).toBe('http://localhost:7001');
      expect(res._headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not set Allow-Origin for non-whitelisted origin', () => {
      const req = mockRequest({ headers: { origin: 'http://evil.com' } });
      const res = mockResponse();
      applyCors(req, res);
      expect(res._headers['access-control-allow-origin']).toBeUndefined();
    });

    it('always sets allowed methods and headers', () => {
      const req = mockRequest();
      const res = mockResponse();
      applyCors(req, res);
      expect(res._headers['access-control-allow-methods']).toBe('GET, POST, PUT, OPTIONS');
      expect(res._headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
      expect(res._headers['access-control-max-age']).toBe('86400');
    });

    it('handles missing origin header', () => {
      const req = mockRequest({ headers: {} });
      const res = mockResponse();
      applyCors(req, res);
      expect(res._headers['access-control-allow-origin']).toBeUndefined();
      expect(res._headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('handlePreflight', () => {
    it('handles OPTIONS requests and returns 204', () => {
      const req = mockRequest({ method: 'OPTIONS', headers: { origin: 'http://localhost:7001' } });
      const res = mockResponse();
      const handled = handlePreflight(req, res);
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
      expect(res._ended).toBe(true);
    });

    it('returns false for non-OPTIONS requests', () => {
      const req = mockRequest({ method: 'GET' });
      const res = mockResponse();
      expect(handlePreflight(req, res)).toBe(false);
      expect(res._ended).toBe(false);
    });

    it('applies CORS headers during preflight', () => {
      const req = mockRequest({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
      const res = mockResponse();
      handlePreflight(req, res);
      expect(res._headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
