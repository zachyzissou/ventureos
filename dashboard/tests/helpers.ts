/**
 * Shared test helpers for dashboard tests.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';

/**
 * Create a mock IncomingMessage.
 * Uses a plain object as the socket to avoid Node.js getter-only property issues.
 */
export function mockRequest(overrides: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: Partial<{ remoteAddress: string; encrypted: boolean }>;
} = {}): IncomingMessage {
  // Use a plain object for socket to avoid getter-only issues with real Socket
  const socket = {
    remoteAddress: overrides.socket?.remoteAddress ?? '127.0.0.1',
    encrypted: overrides.socket?.encrypted ?? false,
    destroy: () => {},
  };

  const req = Object.assign(new EventEmitter(), {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    socket,
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    complete: true,
    aborted: false,
    rawHeaders: [],
    rawTrailers: [],
    trailers: {},
    statusCode: undefined,
    statusMessage: undefined,
    readable: true,
    destroy: () => req,
  }) as unknown as IncomingMessage;

  return req;
}

/**
 * Create a mock ServerResponse that captures written data.
 */
export function mockResponse(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
  _ended: boolean;
} {
  const headers: Record<string, string> = {};
  let body = '';
  let ended = false;
  let statusCode = 200;

  const res = {
    _statusCode: statusCode,
    _headers: headers,
    _body: body,
    _ended: ended,
    statusCode,
    headersSent: false,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = String(value);
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    writeHead(code: number, headersOrMsg?: string | Record<string, string>, headersObj?: Record<string, string>) {
      res._statusCode = code;
      res.statusCode = code;
      const h = typeof headersOrMsg === 'object' ? headersOrMsg : headersObj;
      if (h) {
        for (const [k, v] of Object.entries(h)) {
          headers[k.toLowerCase()] = String(v);
        }
      }
      return res;
    },
    write(chunk: string | Buffer) {
      body += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      res._body = body;
      return true;
    },
    end(data?: string | Buffer) {
      if (data) {
        body += typeof data === 'string' ? data : data.toString('utf8');
        res._body = body;
      }
      ended = true;
      res._ended = true;
      return res;
    },
    on: () => res,
    once: () => res,
    emit: () => false,
    removeListener: () => res,
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
    _ended: boolean;
  };

  return res;
}

/**
 * Parse a JSON response body from a mock response.
 */
export function parseJsonBody<T = Record<string, unknown>>(res: { _body: string }): T {
  return JSON.parse(res._body) as T;
}
