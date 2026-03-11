/**
 * Correlation ID Middleware — VentureOS Observability (Issue #195)
 *
 * Lifecycle:
 * 1. Accept `x-correlation-id` header from incoming request if present
 * 2. Generate a new UUID if absent
 * 3. Store in AsyncLocalStorage so all downstream code can access it
 * 4. Set `x-correlation-id` response header
 * 5. Structured logs automatically include the correlation ID
 *
 * Usage in the middleware pipeline:
 *   import { withCorrelationId } from './middleware/correlation-id.js';
 *   // Wrap the request handler:
 *   withCorrelationId(req, res, () => { ... handle request ... });
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  correlationStore,
  generateCorrelationId,
} from '../../../lib/structured-logger.js';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Extract or generate a correlation ID from the request,
 * set it on the response, and run the handler within the correlation context.
 */
export function withCorrelationId(
  req: IncomingMessage,
  res: ServerResponse,
  handler: () => void | Promise<void>,
): void | Promise<void> {
  const incomingId = req.headers[CORRELATION_HEADER];
  const correlationId: string =
    typeof incomingId === 'string' && incomingId.trim()
      ? incomingId.trim()
      : generateCorrelationId();

  // Set response header so callers can trace the ID back
  res.setHeader(CORRELATION_HEADER, correlationId);

  // Run handler within AsyncLocalStorage context
  return correlationStore.run({ correlationId }, handler);
}

/**
 * Get the correlation ID from the current async context.
 * Re-exported for convenience.
 */
export { getCorrelationId } from '../../../lib/structured-logger.js';
