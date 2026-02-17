/**
 * Secure Error Handler — VentureOS VULN-003 Fix
 *
 * Prevents internal implementation details from leaking to API consumers.
 *
 * - Maps known error types to safe, generic user-facing messages
 * - Assigns unique error reference IDs for correlation with server logs
 * - Logs full error details (message, stack, context) server-side only
 * - Never exposes stack traces, file paths, or internal identifiers to clients
 *
 * @see https://github.com/zachyzissou/ventureos/issues/3
 */

import crypto from 'node:crypto';

// ─── Error Classification ────────────────────────────────────────────────

export type ErrorCategory =
  | 'not_found'
  | 'bad_request'
  | 'auth'
  | 'rate_limit'
  | 'internal';

export interface SafeErrorResponse {
  error: string;
  errorRef: string;
  status: number;
}

interface ErrorClassification {
  category: ErrorCategory;
  status: number;
  safeMessage: string;
}

/**
 * Patterns that classify errors into safe categories.
 * Order matters — first match wins.
 */
const ERROR_PATTERNS: Array<{
  test: (msg: string) => boolean;
  classification: ErrorClassification;
}> = [
  // OS-level errors must be checked FIRST — they should never be exposed
  {
    test: (msg) =>
      /ENOENT|EACCES|EPERM|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EIO/.test(msg),
    classification: {
      category: 'internal',
      status: 500,
      safeMessage: 'An internal error occurred. Please try again later.',
    },
  },
  {
    test: (msg) => /not found/i.test(msg) || /does not exist/i.test(msg),
    classification: {
      category: 'not_found',
      status: 404,
      safeMessage: 'The requested resource was not found.',
    },
  },
  {
    test: (msg) => /participants must be non-empty/i.test(msg),
    classification: {
      category: 'bad_request',
      status: 400,
      safeMessage: 'Invalid request: participants list must not be empty.',
    },
  },
  {
    test: (msg) =>
      /requires.*to.*or.*payload/i.test(msg) ||
      /missing.*required/i.test(msg),
    classification: {
      category: 'bad_request',
      status: 400,
      safeMessage: 'Invalid request: missing required routing parameters.',
    },
  },
  {
    test: (msg) =>
      /no role-card output contract/i.test(msg) || /no\s+(?:role-card\s+)?(?:output\s+)?contract/i.test(msg),
    classification: {
      category: 'bad_request',
      status: 400,
      safeMessage:
        'Invalid request: no matching routing contract for the specified parameters.',
    },
  },
  {
    test: (msg) =>
      /invalid.*json/i.test(msg) ||
      /unexpected token/i.test(msg) ||
      /JSON\.parse/i.test(msg),
    classification: {
      category: 'bad_request',
      status: 400,
      safeMessage: 'Invalid request: malformed request body.',
    },
  },
  {
    test: (msg) => /unauthorized|authentication/i.test(msg),
    classification: {
      category: 'auth',
      status: 401,
      safeMessage: 'Authentication required.',
    },
  },
  {
    test: (msg) => /forbidden/i.test(msg),
    classification: {
      category: 'auth',
      status: 403,
      safeMessage: 'Access denied.',
    },
  },
  {
    test: (msg) => /rate.?limit|too many/i.test(msg),
    classification: {
      category: 'rate_limit',
      status: 429,
      safeMessage: 'Too many requests. Please try again later.',
    },
  },
];

const DEFAULT_CLASSIFICATION: ErrorClassification = {
  category: 'internal',
  status: 500,
  safeMessage: 'An internal error occurred. Please try again later.',
};

// ─── Core Functions ──────────────────────────────────────────────────────

/**
 * Generate a short, unique error reference ID for log correlation.
 */
function generateErrorRef(): string {
  return 'ERR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Classify an error into a safe category based on its message.
 */
function classifyError(err: unknown): ErrorClassification {
  const message =
    err instanceof Error ? err.message : String(err ?? '');
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return pattern.classification;
    }
  }
  return DEFAULT_CLASSIFICATION;
}

/**
 * Log full error details server-side. Never sent to clients.
 */
export function logError(
  errorRef: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  const message =
    err instanceof Error ? err.message : String(err ?? 'unknown');
  const stack = err instanceof Error ? err.stack : undefined;

  const logEntry = {
    timestamp,
    errorRef,
    message,
    ...(stack ? { stack } : {}),
    ...(context ? { context } : {}),
  };

  // Use stderr for error logging (separates from stdout request logs)
  console.error(`[ERROR] ${errorRef}:`, JSON.stringify(logEntry));
}

/**
 * Convert any error into a safe, user-facing response.
 *
 * - Logs the full error server-side with a unique reference ID
 * - Returns only a generic message + reference ID to the client
 * - Never exposes stack traces, internal paths, or implementation details
 */
export function toSafeError(
  err: unknown,
  context?: Record<string, unknown>,
): SafeErrorResponse {
  const errorRef = generateErrorRef();
  const classification = classifyError(err);

  // Log the full details server-side
  logError(errorRef, err, { ...context, category: classification.category });

  return {
    error: classification.safeMessage,
    errorRef,
    status: classification.status,
  };
}

/**
 * Check if an error message contains potentially sensitive information.
 * Used in tests to validate no leakage.
 */
export function containsSensitiveInfo(message: string): boolean {
  const sensitivePatterns = [
    // Stack traces
    /at\s+\S+\s+\(.*:\d+:\d+\)/,
    /^\s+at\s+/m,
    // File paths
    /\/Users\/\w+/i,
    /\/home\/\w+/i,
    /[A-Z]:\\Users\\/i,
    /node_modules\//,
    /\.ts:\d+/,
    /\.js:\d+/,
    // Internal identifiers (conversation IDs, agent names in error context)
    /conv-[a-z0-9]+/i,
    /from=\w+/,
    /type=\w+/,
    // Node.js internal errors
    /ENOENT/,
    /EACCES/,
    /ECONNREFUSED/,
    /EPERM/,
    // Implementation details
    /role-card/i,
    /sendMessage requires/i,
    /\/\S+\.json/i,
  ];

  return sensitivePatterns.some((pattern) => pattern.test(message));
}

export default { toSafeError, logError, containsSensitiveInfo };
