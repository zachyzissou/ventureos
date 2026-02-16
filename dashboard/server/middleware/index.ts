/**
 * Middleware barrel export.
 * Migrated from Phase 3 — Issue #76.
 */

export {
  authenticate,
  isAuthenticated,
  getAuthTokenFromRequest,
  tokenMatch,
  COOKIE_NAME,
  getToken,
  logAuthEvent,
  parseCookies,
} from './auth.js';

export { applyCors, handlePreflight, ALLOWED_ORIGINS } from './cors.js';

export { applySecurityHeaders, CSP_DIRECTIVES } from './security-headers.js';

export { rateLimit, limiter, LIMITS, RateLimiter } from './rate-limit.js';

export { auditLog, flush, LOG_FILE } from './audit-log.js';
