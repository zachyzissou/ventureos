/**
 * Shared HTTP Middleware Types — VentureOS
 *
 * Defines contracts for HTTP middleware, request/response extensions,
 * and API response envelopes used across the dashboard server and
 * any future HTTP endpoints.
 *
 * These types are intentionally framework-agnostic (Node.js `http` module)
 * so they work with both the raw dashboard server and potential future
 * Express/Fastify handlers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

// ─── Request Extensions ──────────────────────────────────────────────────────

/** Extended incoming message with typed socket properties. */
export interface HttpRequest extends IncomingMessage {
  socket: Socket & { remoteAddress?: string; encrypted?: boolean };
}

// ─── Response Envelopes ──────────────────────────────────────────────────────

/** Standard JSON API success/error response envelope. */
export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  errorRef?: string;
}

/** Paginated API response envelope. */
export interface PaginatedEnvelope<T = unknown> extends ApiEnvelope<T[]> {
  total: number;
  offset: number;
  limit: number;
}

// ─── Middleware Contract ─────────────────────────────────────────────────────

/**
 * A middleware function that receives a request and response.
 * Returns `true` if the request was fully handled (response sent),
 * or `false` if the next middleware/handler should be called.
 */
export type Middleware = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

/**
 * A route handler function that receives a request, response, and
 * optional dependency bag. Returns `true` if the route was matched
 * and handled, `false` otherwise.
 */
export type RouteHandler<TDeps = void> = TDeps extends void
  ? (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>
  : (req: IncomingMessage, res: ServerResponse, deps: TDeps) => boolean | Promise<boolean>;

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/**
 * HTTP-level rate limit result (per-IP, per-endpoint).
 *
 * NOTE: This is distinct from `lib/rate-limiter.ts` RateLimitResult which
 * models agent/conversation rate limits. The HTTP rate limiter tracks
 * per-client-IP sliding windows; the agent rate limiter tracks per-agent
 * and per-conversation message windows with backoff strategies.
 */
export interface HttpRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/** HTTP rate limit configuration for an endpoint. */
export interface HttpRateLimitConfig {
  limit: number;
  windowMs: number;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Parsed cookie key-value map. */
export type CookieMap = Record<string, string>;

/** Auth result from middleware. */
export interface AuthResult {
  authenticated: boolean;
  /** How was authentication achieved? */
  method?: 'bearer' | 'cookie' | 'query' | 'lan_bypass';
  /** Client IP address. */
  clientIp?: string;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

/** A single audit log entry. */
export interface AuditLogEntry {
  ts: string;
  event: string;
  ip: string;
  method: string;
  path: string;
  userAgent: string;
  [key: string]: string | number | boolean;
}

// ─── Error Response ──────────────────────────────────────────────────────────

/**
 * Safe error response structure (compatible with `lib/error-handler.ts`).
 * Never exposes stack traces or internal paths.
 */
export interface SafeHttpError {
  ok: false;
  error: string;
  errorRef: string;
  status: number;
}
