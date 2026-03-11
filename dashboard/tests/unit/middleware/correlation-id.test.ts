/**
 * Tests for correlation ID middleware — Issue #195 Observability
 *
 * Covers:
 * - Accept x-correlation-id from request header
 * - Generate when absent
 * - Return in response header
 * - Propagation through handler context
 */

import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { withCorrelationId, CORRELATION_HEADER } from '../../../server/middleware/correlation-id';
import { getCorrelationId } from '../../../../lib/structured-logger';

function createMockReq(headers: Record<string, string> = {}): IncomingMessage {
  return {
    headers,
    method: 'GET',
    url: '/test',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse & { _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    getHeader: vi.fn((key: string) => headers[key]),
    writeHead: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as ServerResponse & { _headers: Record<string, string> };
}

describe('Correlation ID Middleware (Issue #195)', () => {
  it('should accept x-correlation-id from request header', () => {
    const req = createMockReq({ [CORRELATION_HEADER]: 'my-trace-id-123' });
    const res = createMockRes();
    let capturedId: string | null = null;

    withCorrelationId(req, res, () => {
      capturedId = getCorrelationId();
    });

    expect(capturedId).toBe('my-trace-id-123');
    expect(res._headers[CORRELATION_HEADER]).toBe('my-trace-id-123');
  });

  it('should generate a UUID when x-correlation-id is absent', () => {
    const req = createMockReq();
    const res = createMockRes();
    let capturedId: string | null = null;

    withCorrelationId(req, res, () => {
      capturedId = getCorrelationId();
    });

    expect(capturedId).toBeDefined();
    expect(capturedId).not.toBeNull();
    // UUID format
    expect(capturedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(res._headers[CORRELATION_HEADER]).toBe(capturedId);
  });

  it('should generate a UUID when x-correlation-id is empty string', () => {
    const req = createMockReq({ [CORRELATION_HEADER]: '' });
    const res = createMockRes();
    let capturedId: string | null = null;

    withCorrelationId(req, res, () => {
      capturedId = getCorrelationId();
    });

    expect(capturedId).toMatch(/^[0-9a-f]{8}-/);
  });

  it('should generate a UUID when x-correlation-id is whitespace only', () => {
    const req = createMockReq({ [CORRELATION_HEADER]: '   ' });
    const res = createMockRes();
    let capturedId: string | null = null;

    withCorrelationId(req, res, () => {
      capturedId = getCorrelationId();
    });

    expect(capturedId).toMatch(/^[0-9a-f]{8}-/);
  });

  it('should set the response header', () => {
    const req = createMockReq();
    const res = createMockRes();

    withCorrelationId(req, res, () => {});

    expect(res.setHeader).toHaveBeenCalledWith(
      CORRELATION_HEADER,
      expect.stringMatching(/^[0-9a-f]{8}-/)
    );
  });

  it('should support async handlers', async () => {
    const req = createMockReq({ [CORRELATION_HEADER]: 'async-trace-789' });
    const res = createMockRes();
    let capturedId: string | null = null;

    await withCorrelationId(req, res, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      capturedId = getCorrelationId();
    });

    expect(capturedId).toBe('async-trace-789');
  });

  it('should trim whitespace from provided correlation ID', () => {
    const req = createMockReq({ [CORRELATION_HEADER]: '  padded-id-456  ' });
    const res = createMockRes();
    let capturedId: string | null = null;

    withCorrelationId(req, res, () => {
      capturedId = getCorrelationId();
    });

    expect(capturedId).toBe('padded-id-456');
    expect(res._headers[CORRELATION_HEADER]).toBe('padded-id-456');
  });
});
