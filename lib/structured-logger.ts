/**
 * Structured JSON Logger — VentureOS Observability (Issue #195)
 *
 * Provides structured, queryable JSON log entries with:
 * - Stable schema: timestamp, level, subsystem, event, message, correlationId, fields
 * - Correlation ID propagation via AsyncLocalStorage
 * - Redaction of sensitive fields before emission
 * - Pluggable output (defaults to stderr for container compatibility)
 *
 * Usage:
 *   import { structuredLog, LogLevel } from './structured-logger.js';
 *   structuredLog('info', 'dashboard', 'request_received', 'GET /api/kpis', { path: '/api/kpis' });
 *
 * Correlation context:
 *   import { correlationStore, runWithCorrelation } from './structured-logger.js';
 *   runWithCorrelation('my-id', () => { structuredLog(...) });
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  subsystem: string;
  event: string;
  message: string;
  correlationId: string | null;
  fields: Record<string, unknown> | null;
}

// ─── Correlation Context ─────────────────────────────────────────────────────

export interface CorrelationContext {
  correlationId: string;
}

/**
 * AsyncLocalStorage for propagating correlation IDs through async call chains.
 */
export const correlationStore = new AsyncLocalStorage<CorrelationContext>();

/**
 * Generate a new correlation ID (UUID v4 format).
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Get the current correlation ID from the async context, or null if not set.
 */
export function getCorrelationId(): string | null {
  return correlationStore.getStore()?.correlationId ?? null;
}

/**
 * Run a function within a correlation context.
 */
export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return correlationStore.run({ correlationId }, fn);
}

// ─── Redaction ───────────────────────────────────────────────────────────────

/**
 * Keys whose values should be fully redacted in logs and bundles.
 * Case-insensitive matching.
 */
const REDACTED_KEYS: Set<string> = new Set([
  'token',
  'password',
  'secret',
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'bridge_token',
  'bridgetoken',
  'dashboard_token',
  'private_key',
  'privatekey',
  'access_token',
  'refresh_token',
  'session_token',
  'jwt',
  'bearer',
  'credentials',
  'ssn',
  'credit_card',
  'creditcard',
]);

/**
 * Patterns that indicate sensitive values in string content.
 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,        // OpenAI-style keys
  /xoxb-[a-zA-Z0-9\-]+/g,         // Slack tokens
  /ghp_[a-zA-Z0-9]{36}/g,         // GitHub PATs
  /gho_[a-zA-Z0-9]{36}/g,         // GitHub OAuth
  /glpat-[a-zA-Z0-9\-_]{20}/g,    // GitLab PATs
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g, // JWTs
];

/**
 * Redact sensitive fields from an object (deep clone).
 * Returns a new object with sensitive values replaced by '[REDACTED]'.
 */
export function redactSensitiveFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactStringValue(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactSensitiveFields(item));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitiveFields(value);
    }
  }
  return result;
}

/**
 * Redact known sensitive patterns from string values.
 */
function redactStringValue(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

// ─── Log Level Filtering ─────────────────────────────────────────────────────

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Minimum log level. Controlled by VENTUREOS_LOG_LEVEL env var.
 * Defaults to 'info'.
 */
function getMinLogLevel(): LogLevel {
  const envLevel = (process.env.VENTUREOS_LOG_LEVEL ?? 'info').toLowerCase();
  if (envLevel in LOG_LEVEL_ORDER) return envLevel as LogLevel;
  return 'info';
}

// ─── Output ──────────────────────────────────────────────────────────────────

/** Pluggable output function. Defaults to stderr. Override for testing. */
export let logOutput: (line: string) => void = (line: string) => {
  process.stderr.write(line + '\n');
};

/**
 * Override the log output function (useful for testing or custom transports).
 */
export function setLogOutput(fn: (line: string) => void): void {
  logOutput = fn;
}

// ─── Core Logging Function ───────────────────────────────────────────────────

/**
 * Emit a structured JSON log entry.
 *
 * @param level - Log severity
 * @param subsystem - Component emitting the log (e.g., 'dashboard', 'bridge', 'auth')
 * @param event - Machine-readable event type (e.g., 'request_received', 'auth_failure')
 * @param message - Human-readable description
 * @param fields - Optional additional context fields (will be redacted)
 */
export function structuredLog(
  level: LogLevel,
  subsystem: string,
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): StructuredLogEntry {
  const minLevel = getMinLogLevel();
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    subsystem,
    event,
    message,
    correlationId: getCorrelationId(),
    fields: fields ? (redactSensitiveFields(fields) as Record<string, unknown>) : null,
  };

  if (LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel]) {
    logOutput(JSON.stringify(entry));
  }

  return entry;
}

// ─── Convenience Helpers ─────────────────────────────────────────────────────

export function logDebug(subsystem: string, event: string, message: string, fields?: Record<string, unknown>): StructuredLogEntry {
  return structuredLog('debug', subsystem, event, message, fields);
}

export function logInfo(subsystem: string, event: string, message: string, fields?: Record<string, unknown>): StructuredLogEntry {
  return structuredLog('info', subsystem, event, message, fields);
}

export function logWarn(subsystem: string, event: string, message: string, fields?: Record<string, unknown>): StructuredLogEntry {
  return structuredLog('warn', subsystem, event, message, fields);
}

export function logError(subsystem: string, event: string, message: string, fields?: Record<string, unknown>): StructuredLogEntry {
  return structuredLog('error', subsystem, event, message, fields);
}

// ─── Observation Event Constants (Phase 4 — #233) ───────────────────────────

/**
 * Stable event names for observational memory subsystem logging.
 * Use these instead of raw strings to enable grep/query consistency.
 */
export const OBSERVATION_EVENTS = {
  /** /observations command invoked */
  COMMAND_INVOKED: 'observations_command_invoked',
  /** /observations command returned results */
  COMMAND_RESULT: 'observations_command_result',
  /** /observations command found no data */
  COMMAND_EMPTY: 'observations_command_empty',
  /** GET /api/memory/state served */
  API_MEMORY_STATE: 'api_memory_state',
  /** GET /api/memory/observations served */
  API_MEMORY_OBSERVATIONS: 'api_memory_observations',
  /** Memory API error */
  API_MEMORY_ERROR: 'api_memory_error',
} as const;

export default {
  structuredLog,
  logDebug,
  logInfo,
  logWarn,
  logError,
  redactSensitiveFields,
  generateCorrelationId,
  getCorrelationId,
  runWithCorrelation,
  correlationStore,
  setLogOutput,
  OBSERVATION_EVENTS,
};
