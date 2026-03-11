/**
 * Alert Webhook Delivery — external notification for alert state transitions.
 * Issue #219 — Phase 11: Webhook Notification Baseline.
 *
 * Delivers webhook HTTP POST notifications when alert severity transitions
 * occur (e.g., ok→warning, warning→critical, critical→ok). Designed as a
 * lightweight, bounded, non-blocking delivery mechanism:
 *
 * - Config persisted as JSON alongside other task-board data
 * - Disabled by default — explicit opt-in required
 * - Bounded retry with exponential backoff (max 3 attempts)
 * - Request timeout prevents blocking the metrics evaluation path
 * - Secrets (webhook URLs) are never logged in full
 * - Fire-and-forget: delivery failures do not affect alert evaluation
 *
 * Delivery is triggered inline during alert evaluation (piggybacked on
 * metrics API reads, same pattern as alert-history.ts). No new daemons.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AlertSeverity, AlertEvaluation, AlertRuleResult } from './alert-rules.js';
import type { AlertHistoryEvent } from './alert-history.js';
import { appendDeliveryEvents } from './webhook-delivery-history.js';
import type { WebhookDeliveryAttemptDetail } from './webhook-delivery-history.js';
import { formatPayload, isValidProvider, ALLOWED_PROVIDERS } from './webhook-formatters.js';
import type { WebhookProvider, FormattedPayload } from './webhook-formatters.js';
import type { EscalationPolicyConfig } from './escalation-policy.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single webhook target configuration. */
export interface WebhookTarget {
  /** Unique identifier for this target. */
  id: string;
  /** Display name for dashboard UI. */
  name: string;
  /** Target URL — must be HTTPS (or HTTP for localhost in dev). */
  url: string;
  /** Whether this target is enabled. */
  enabled: boolean;
  /** Optional shared secret for HMAC-SHA256 signature header. */
  secret?: string;
  /**
   * Minimum severity to trigger notification on this target.
   * Default: 'warning' (notifies on warning and critical transitions).
   */
  minSeverity?: AlertSeverity;
  /**
   * Payload format provider for this target.
   * Controls how the webhook payload is shaped for the receiving service.
   * Default: 'generic' (raw VentureOS JSON — backward-compatible).
   * Allowed values: 'generic', 'slack', 'discord'.
   * Issue #219 — Phase 18.
   */
  provider?: WebhookProvider;
}

/** Full webhook configuration. */
export interface WebhookConfig {
  /** Global enable/disable flag. When false, no webhooks are sent. */
  enabled: boolean;
  /** Webhook targets. */
  targets: WebhookTarget[];
  /**
   * Cooldown between webhook deliveries per target in ms.
   * Prevents flood during rapid state changes. Default: 60000 (1 min).
   */
  cooldownMs?: number;
  /**
   * Request timeout in ms. Default: 10000 (10 seconds).
   */
  timeoutMs?: number;
  /**
   * Maximum retry attempts on failure. Default: 3.
   */
  maxRetries?: number;
  /**
   * Optional escalation policy configuration.
   * When enabled, persistent alert states trigger escalation tiers
   * with designated targets and cooldowns.
   * Disabled by default — backward-compatible.
   * Issue #219 — Phase 19.
   */
  escalation?: EscalationPolicyConfig;
}

/** Payload sent to webhook targets. */
export interface WebhookPayload {
  /** Event type identifier. */
  event: 'alert.transition';
  /** Timestamp of the transition (ms since epoch). */
  timestamp: number;
  /** ISO 8601 timestamp string. */
  timestampISO: string;
  /** Previous overall severity (null if first evaluation). */
  previousSeverity: AlertSeverity | null;
  /** New overall severity. */
  currentSeverity: AlertSeverity;
  /** Human-readable transition description. */
  transitionLabel: string;
  /** Full alert evaluation snapshot. */
  evaluation: {
    evaluatedAt: number;
    overallSeverity: AlertSeverity;
    severityCounts: Record<AlertSeverity, number>;
    rules: Array<{
      rule: string;
      label: string;
      enabled: boolean;
      severity: AlertSeverity;
      currentValue: number | null;
      warningThreshold: number;
      criticalThreshold: number;
      message: string;
    }>;
  };
  /** Source identifier. */
  source: 'ventureos-dashboard';
  /** Schema version for forward compatibility. */
  schemaVersion: 1;
}

/** Test webhook payload — explicitly marked as non-production. */
export interface WebhookTestPayload {
  /** Event type identifier — always 'webhook.test' for test pings. */
  event: 'webhook.test';
  /** Explicit non-production marker. */
  test: true;
  /** Human-readable non-production notice for downstream consumers. */
  _testMarker: 'NON_PRODUCTION_TEST_PING';
  /** Timestamp of the test (ms since epoch). */
  timestamp: number;
  /** ISO 8601 timestamp string. */
  timestampISO: string;
  /** Human-readable message. */
  message: string;
  /** Source identifier. */
  source: 'ventureos-dashboard';
  /** Schema version for forward compatibility. */
  schemaVersion: 1;
}

/** Result of a webhook test delivery, extending the base result with test metadata. */
export interface WebhookTestResult extends WebhookDeliveryResult {
  /** Always true — marks this as a test result. */
  isTest: true;
}

/** Result of a single webhook delivery attempt. */
export interface WebhookDeliveryResult {
  targetId: string;
  targetName: string;
  success: boolean;
  statusCode: number | null;
  attempts: number;
  error: string | null;
  durationMs: number;
  /**
   * Per-attempt breakdown (Phase 16). Each entry records the outcome
   * of an individual HTTP request in the retry loop.
   */
  attemptDetails?: WebhookDeliveryAttemptDetail[];
}

/** Delivery state tracked per-target (in-memory, non-persistent). */
export interface WebhookDeliveryState {
  /** Last successful delivery timestamp per target ID. */
  lastDeliveryAt: Record<string, number>;
  /** Last known severity (for transition detection). */
  lastSeverity: AlertSeverity | null;
}

/** Validation error for webhook config. */
export interface WebhookConfigValidationError {
  field: string;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_CONFIG_FILENAME = 'task-board-webhook-config.json';
const DEFAULT_COOLDOWN_MS = 60_000; // 1 minute
const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds
const DEFAULT_MAX_RETRIES = 3;
const MAX_TARGETS = 5;
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 100;
const MAX_SECRET_LENGTH = 256;

/** Severity priority for filtering. */
const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  ok: 0,
  warning: 1,
  critical: 2,
};

// ─── In-memory delivery state (non-persistent, resets on restart) ────────────

let deliveryState: WebhookDeliveryState = {
  lastDeliveryAt: {},
  lastSeverity: null,
};

/** Reset delivery state (for testing). */
export function resetDeliveryState(): void {
  deliveryState = {
    lastDeliveryAt: {},
    lastSeverity: null,
  };
}

/** Get current delivery state (for testing/inspection). */
export function getDeliveryState(): Readonly<WebhookDeliveryState> {
  return deliveryState;
}

// ─── Default config ──────────────────────────────────────────────────────────

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  enabled: false,
  targets: [],
  cooldownMs: DEFAULT_COOLDOWN_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxRetries: DEFAULT_MAX_RETRIES,
};

// ─── Config I/O ──────────────────────────────────────────────────────────────

function configFilePath(dataDir: string): string {
  return path.join(dataDir, WEBHOOK_CONFIG_FILENAME);
}

/**
 * Read webhook config from disk.
 * Returns defaults if file doesn't exist or is corrupt.
 */
export function readWebhookConfig(dataDir: string): WebhookConfig {
  try {
    const fp = configFilePath(dataDir);
    if (!fs.existsSync(fp)) return { ...DEFAULT_WEBHOOK_CONFIG, targets: [] };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeConfig(parsed);
  } catch {
    return { ...DEFAULT_WEBHOOK_CONFIG, targets: [] };
  }
}

/**
 * Write webhook config to disk atomically.
 */
export function writeWebhookConfig(dataDir: string, config: WebhookConfig): void {
  const fp = configFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Strip secrets from disk representation? No — we need them for signing.
  // But we DO redact in API responses (see route handler).
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(config, null, 2));
  fs.renameSync(tmpFp, fp);
}

/**
 * Sanitize/normalize a parsed config object.
 * Fills missing fields with defaults, validates types.
 * Pure function.
 */
export function sanitizeConfig(raw: unknown): WebhookConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WEBHOOK_CONFIG, targets: [] };
  }

  const obj = raw as Record<string, unknown>;

  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  const cooldownMs = typeof obj.cooldownMs === 'number' && isFinite(obj.cooldownMs) && obj.cooldownMs >= 0
    ? obj.cooldownMs
    : DEFAULT_COOLDOWN_MS;
  const timeoutMs = typeof obj.timeoutMs === 'number' && isFinite(obj.timeoutMs) && obj.timeoutMs >= 1000
    ? Math.min(obj.timeoutMs, 30000)
    : DEFAULT_TIMEOUT_MS;
  const maxRetries = typeof obj.maxRetries === 'number' && isFinite(obj.maxRetries) && obj.maxRetries >= 0
    ? Math.min(Math.floor(obj.maxRetries), 5)
    : DEFAULT_MAX_RETRIES;

  const targets: WebhookTarget[] = [];
  if (Array.isArray(obj.targets)) {
    for (const t of obj.targets.slice(0, MAX_TARGETS)) {
      if (t && typeof t === 'object' && !Array.isArray(t)) {
        const tObj = t as Record<string, unknown>;
        if (typeof tObj.id === 'string' && typeof tObj.url === 'string') {
          targets.push({
            id: tObj.id.slice(0, 64),
            name: typeof tObj.name === 'string' ? tObj.name.slice(0, MAX_NAME_LENGTH) : tObj.id.slice(0, MAX_NAME_LENGTH),
            url: tObj.url.slice(0, MAX_URL_LENGTH),
            enabled: typeof tObj.enabled === 'boolean' ? tObj.enabled : false,
            secret: typeof tObj.secret === 'string' ? tObj.secret.slice(0, MAX_SECRET_LENGTH) : undefined,
            minSeverity: typeof tObj.minSeverity === 'string' && ['ok', 'warning', 'critical'].includes(tObj.minSeverity)
              ? (tObj.minSeverity as AlertSeverity)
              : 'warning',
            provider: isValidProvider(tObj.provider) ? tObj.provider : undefined,
          });
        }
      }
    }
  }

  // Escalation policy (Phase 19): pass through if present, omit if absent.
  // Sanitization of the escalation sub-object is handled by sanitizeEscalationPolicy()
  // in escalation-policy.ts (called separately to avoid circular runtime deps).
  const result: WebhookConfig = { enabled, targets, cooldownMs, timeoutMs, maxRetries };
  if (obj.escalation !== undefined && obj.escalation !== null && typeof obj.escalation === 'object') {
    // Preserve raw escalation config — the escalation module owns sanitization.
    // readWebhookConfig() returns this as-is; escalation-policy.ts sanitizes on read.
    result.escalation = obj.escalation as EscalationPolicyConfig;
  }
  return result;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate webhook config input (for PUT requests).
 * Returns array of errors (empty = valid).
 * Pure function.
 */
export function validateWebhookConfig(input: unknown): WebhookConfigValidationError[] {
  const errors: WebhookConfigValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ field: 'root', message: 'config must be a non-null object' });
    return errors;
  }

  const obj = input as Record<string, unknown>;

  if (obj.enabled !== undefined && typeof obj.enabled !== 'boolean') {
    errors.push({ field: 'enabled', message: 'enabled must be a boolean' });
  }

  if (obj.cooldownMs !== undefined) {
    if (typeof obj.cooldownMs !== 'number' || !isFinite(obj.cooldownMs) || obj.cooldownMs < 0) {
      errors.push({ field: 'cooldownMs', message: 'cooldownMs must be a non-negative finite number' });
    }
  }

  if (obj.timeoutMs !== undefined) {
    if (typeof obj.timeoutMs !== 'number' || !isFinite(obj.timeoutMs) || obj.timeoutMs < 1000 || obj.timeoutMs > 30000) {
      errors.push({ field: 'timeoutMs', message: 'timeoutMs must be between 1000 and 30000' });
    }
  }

  if (obj.maxRetries !== undefined) {
    if (typeof obj.maxRetries !== 'number' || !isFinite(obj.maxRetries) || obj.maxRetries < 0 || obj.maxRetries > 5) {
      errors.push({ field: 'maxRetries', message: 'maxRetries must be between 0 and 5' });
    }
  }

  if (obj.targets !== undefined) {
    if (!Array.isArray(obj.targets)) {
      errors.push({ field: 'targets', message: 'targets must be an array' });
    } else {
      if (obj.targets.length > MAX_TARGETS) {
        errors.push({ field: 'targets', message: `maximum ${MAX_TARGETS} targets allowed` });
      }

      const seenIds = new Set<string>();
      for (let i = 0; i < obj.targets.length; i++) {
        const t = obj.targets[i];
        const prefix = `targets[${i}]`;

        if (!t || typeof t !== 'object' || Array.isArray(t)) {
          errors.push({ field: prefix, message: 'target must be an object' });
          continue;
        }

        const tObj = t as Record<string, unknown>;

        if (typeof tObj.id !== 'string' || tObj.id.trim().length === 0) {
          errors.push({ field: `${prefix}.id`, message: 'id is required and must be a non-empty string' });
        } else if (seenIds.has(tObj.id)) {
          errors.push({ field: `${prefix}.id`, message: `duplicate target id: ${tObj.id}` });
        } else {
          seenIds.add(tObj.id);
        }

        if (typeof tObj.url !== 'string' || tObj.url.trim().length === 0) {
          errors.push({ field: `${prefix}.url`, message: 'url is required and must be a non-empty string' });
        } else {
          try {
            const parsed = new URL(tObj.url);
            const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
            if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
              errors.push({ field: `${prefix}.url`, message: 'url must use HTTPS (HTTP allowed only for localhost)' });
            }
          } catch {
            errors.push({ field: `${prefix}.url`, message: 'url must be a valid URL' });
          }

          if (tObj.url.length > MAX_URL_LENGTH) {
            errors.push({ field: `${prefix}.url`, message: `url must be ≤ ${MAX_URL_LENGTH} characters` });
          }
        }

        if (tObj.name !== undefined && typeof tObj.name !== 'string') {
          errors.push({ field: `${prefix}.name`, message: 'name must be a string' });
        }

        if (tObj.enabled !== undefined && typeof tObj.enabled !== 'boolean') {
          errors.push({ field: `${prefix}.enabled`, message: 'enabled must be a boolean' });
        }

        if (tObj.secret !== undefined && typeof tObj.secret !== 'string') {
          errors.push({ field: `${prefix}.secret`, message: 'secret must be a string' });
        }

        if (tObj.minSeverity !== undefined) {
          if (typeof tObj.minSeverity !== 'string' || !['ok', 'warning', 'critical'].includes(tObj.minSeverity)) {
            errors.push({ field: `${prefix}.minSeverity`, message: 'minSeverity must be ok, warning, or critical' });
          }
        }

        if (tObj.provider !== undefined) {
          if (!isValidProvider(tObj.provider)) {
            errors.push({
              field: `${prefix}.provider`,
              message: `provider must be one of: ${ALLOWED_PROVIDERS.join(', ')}`,
            });
          }
        }
      }
    }
  }

  // Escalation policy validation (Phase 19) — inline to avoid circular imports.
  // Validates the escalation sub-object if present in the input.
  if (obj.escalation !== undefined) {
    if (obj.escalation === null) {
      // Explicitly null — allowed (removes escalation config)
    } else if (typeof obj.escalation !== 'object' || Array.isArray(obj.escalation)) {
      errors.push({ field: 'escalation', message: 'escalation must be an object or null' });
    } else {
      const esc = obj.escalation as Record<string, unknown>;
      if (esc.enabled !== undefined && typeof esc.enabled !== 'boolean') {
        errors.push({ field: 'escalation.enabled', message: 'enabled must be a boolean' });
      }
      if (esc.triggerSeverity !== undefined) {
        if (typeof esc.triggerSeverity !== 'string' || !['ok', 'warning', 'critical'].includes(esc.triggerSeverity)) {
          errors.push({ field: 'escalation.triggerSeverity', message: 'triggerSeverity must be ok, warning, or critical' });
        }
      }
      if (esc.cooldownMs !== undefined) {
        if (typeof esc.cooldownMs !== 'number' || !isFinite(esc.cooldownMs) || esc.cooldownMs < 0) {
          errors.push({ field: 'escalation.cooldownMs', message: 'cooldownMs must be a non-negative finite number' });
        }
      }
      if (esc.tiers !== undefined) {
        if (!Array.isArray(esc.tiers)) {
          errors.push({ field: 'escalation.tiers', message: 'tiers must be an array' });
        } else {
          if (esc.tiers.length > 3) {
            errors.push({ field: 'escalation.tiers', message: 'maximum 3 escalation tiers allowed' });
          }
          // Collect available target IDs for cross-reference validation
          const availableTargetIds = new Set<string>();
          if (Array.isArray(obj.targets)) {
            for (const t of obj.targets) {
              if (t && typeof t === 'object' && typeof (t as Record<string, unknown>).id === 'string') {
                availableTargetIds.add((t as Record<string, unknown>).id as string);
              }
            }
          }
          let prevAfterMs = 0;
          for (let i = 0; i < esc.tiers.length; i++) {
            const tier = esc.tiers[i];
            const prefix = `escalation.tiers[${i}]`;
            if (!tier || typeof tier !== 'object' || Array.isArray(tier)) {
              errors.push({ field: prefix, message: 'tier must be an object' });
              continue;
            }
            const tierObj = tier as Record<string, unknown>;
            if (typeof tierObj.afterMs !== 'number' || !isFinite(tierObj.afterMs)) {
              errors.push({ field: `${prefix}.afterMs`, message: 'afterMs is required and must be a finite number' });
            } else {
              if (tierObj.afterMs < 60000) {
                errors.push({ field: `${prefix}.afterMs`, message: 'afterMs must be >= 60000ms (1 minute)' });
              }
              if (tierObj.afterMs > 86400000) {
                errors.push({ field: `${prefix}.afterMs`, message: 'afterMs must be <= 86400000ms (24 hours)' });
              }
              if (tierObj.afterMs <= prevAfterMs) {
                errors.push({ field: `${prefix}.afterMs`, message: `afterMs must be strictly greater than previous tier (${prevAfterMs}ms)` });
              }
              prevAfterMs = tierObj.afterMs;
            }
            if (!Array.isArray(tierObj.targetIds)) {
              errors.push({ field: `${prefix}.targetIds`, message: 'targetIds must be an array' });
            } else {
              if (tierObj.targetIds.length > 5) {
                errors.push({ field: `${prefix}.targetIds`, message: 'maximum 5 targets per tier' });
              }
              for (let j = 0; j < tierObj.targetIds.length; j++) {
                const tid = tierObj.targetIds[j];
                if (typeof tid !== 'string' || tid.trim().length === 0) {
                  errors.push({ field: `${prefix}.targetIds[${j}]`, message: 'target ID must be a non-empty string' });
                } else if (availableTargetIds.size > 0 && !availableTargetIds.has(tid)) {
                  errors.push({ field: `${prefix}.targetIds[${j}]`, message: `target ID "${tid}" does not match any configured webhook target` });
                }
              }
            }
            if (tierObj.label !== undefined && typeof tierObj.label !== 'string') {
              errors.push({ field: `${prefix}.label`, message: 'label must be a string' });
            }
          }
        }
      }
    }
  }

  return errors;
}

// ─── Redaction (for API responses) ───────────────────────────────────────────

/**
 * Redact secrets from a webhook config for safe API responses.
 * Replaces secret values with a boolean indicator.
 * Pure function.
 */
export function redactConfig(config: WebhookConfig): WebhookConfig & { targets: Array<Omit<WebhookTarget, 'secret'> & { hasSecret: boolean }> } {
  return {
    ...config,
    targets: config.targets.map((t) => {
      const { secret, ...rest } = t;
      return { ...rest, hasSecret: !!secret };
    }),
  };
}

// ─── URL masking for logs ────────────────────────────────────────────────────

/**
 * Mask a webhook URL for safe logging.
 * Shows protocol + host, masks the path.
 */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/***`;
  } catch {
    return '***invalid-url***';
  }
}

// ─── Payload construction ────────────────────────────────────────────────────

/**
 * Build the webhook payload for an alert transition.
 * Pure function.
 */
export function buildWebhookPayload(
  evaluation: AlertEvaluation,
  previousSeverity: AlertSeverity | null,
): WebhookPayload {
  const now = evaluation.evaluatedAt;
  const current = evaluation.overallSeverity;
  const prev = previousSeverity;

  let transitionLabel: string;
  if (prev === null) {
    transitionLabel = `Initial evaluation: ${current}`;
  } else if (prev === current) {
    transitionLabel = `Severity unchanged: ${current}`;
  } else {
    const direction = SEVERITY_PRIORITY[current] > SEVERITY_PRIORITY[prev] ? 'escalated' : 'de-escalated';
    transitionLabel = `Alert ${direction}: ${prev} → ${current}`;
  }

  return {
    event: 'alert.transition',
    timestamp: now,
    timestampISO: new Date(now).toISOString(),
    previousSeverity: prev,
    currentSeverity: current,
    transitionLabel,
    evaluation: {
      evaluatedAt: evaluation.evaluatedAt,
      overallSeverity: evaluation.overallSeverity,
      severityCounts: { ...evaluation.severityCounts },
      rules: evaluation.rules.map((r) => ({
        rule: r.rule,
        label: r.label,
        enabled: r.enabled,
        severity: r.severity,
        currentValue: r.currentValue,
        warningThreshold: r.warningThreshold,
        criticalThreshold: r.criticalThreshold,
        message: r.message,
      })),
    },
    source: 'ventureos-dashboard',
    schemaVersion: 1,
  };
}

// ─── HMAC Signing ────────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 signature for a payload body.
 * Returns hex-encoded digest.
 */
export async function computeSignature(body: string, secret: string): Promise<string> {
  // Use dynamic import so we don't add a top-level dependency issue
  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', secret).update(body).digest('hex');
}

// ─── HTTP Delivery ───────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload to a single target with retry/backoff.
 * Non-blocking — catches all errors and returns a result.
 *
 * Retry strategy: exponential backoff starting at 1s, capped at 3 attempts.
 * Each attempt has a bounded timeout.
 */
export async function deliverWebhook(
  target: WebhookTarget,
  payload: WebhookPayload,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<WebhookDeliveryResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

  // Format payload for the target's provider (Phase 18).
  // Falls back to generic JSON if provider is unset or unknown.
  const formatted = formatPayload(payload, target.provider);
  const body = formatted.body;
  const startMs = Date.now();

  let lastError: string | null = null;
  let lastStatusCode: number | null = null;
  let attempts = 0;
  const attemptDetails: WebhookDeliveryAttemptDetail[] = [];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++;
    const attemptStartMs = Date.now();

    // Exponential backoff: 0, 1s, 2s (only between retries)
    let backoffDelayMs = 0;
    if (attempt > 0) {
      backoffDelayMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': formatted.contentType,
        'User-Agent': 'VentureOS-Dashboard/1.0',
        'X-VentureOS-Event': 'alert.transition',
        ...formatted.extraHeaders,
      };

      // Add HMAC signature if secret is configured.
      // Signature is computed over the final formatted body so verification
      // works regardless of which provider formatter was used.
      if (target.secret) {
        const signature = await computeSignature(body, target.secret);
        headers['X-VentureOS-Signature'] = `sha256=${signature}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(target.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);
        lastStatusCode = response.status;

        if (response.ok) {
          attemptDetails.push({
            attempt: attempts,
            ts: attemptStartMs,
            statusCode: response.status,
            error: null,
            durationMs: Date.now() - attemptStartMs,
            nextRetryDelayMs: null,
          });
          return {
            targetId: target.id,
            targetName: target.name,
            success: true,
            statusCode: response.status,
            attempts,
            error: null,
            durationMs: Date.now() - startMs,
            attemptDetails,
          };
        }

        // Non-retryable status codes (client errors)
        if (response.status >= 400 && response.status < 500) {
          lastError = `HTTP ${response.status}`;
          attemptDetails.push({
            attempt: attempts,
            ts: attemptStartMs,
            statusCode: response.status,
            error: lastError,
            durationMs: Date.now() - attemptStartMs,
            nextRetryDelayMs: null, // no retry on 4xx
          });
          break; // Don't retry client errors
        }

        lastError = `HTTP ${response.status}`;
        // Compute next retry delay (if there will be one)
        const nextDelay = attempt + 1 < maxRetries
          ? Math.min(1000 * Math.pow(2, attempt), 4000)
          : null;
        attemptDetails.push({
          attempt: attempts,
          ts: attemptStartMs,
          statusCode: response.status,
          error: lastError,
          durationMs: Date.now() - attemptStartMs,
          nextRetryDelayMs: nextDelay,
        });
      } catch (fetchErr: unknown) {
        clearTimeout(timer);
        if (fetchErr instanceof Error) {
          lastError = fetchErr.name === 'AbortError'
            ? `timeout after ${timeoutMs}ms`
            : fetchErr.message;
        } else {
          lastError = 'unknown fetch error';
        }
        const nextDelay = attempt + 1 < maxRetries
          ? Math.min(1000 * Math.pow(2, attempt), 4000)
          : null;
        attemptDetails.push({
          attempt: attempts,
          ts: attemptStartMs,
          statusCode: null,
          error: lastError,
          durationMs: Date.now() - attemptStartMs,
          nextRetryDelayMs: nextDelay,
        });
      }
    } catch (outerErr: unknown) {
      lastError = outerErr instanceof Error ? outerErr.message : 'unknown error';
      const nextDelay = attempt + 1 < maxRetries
        ? Math.min(1000 * Math.pow(2, attempt), 4000)
        : null;
      attemptDetails.push({
        attempt: attempts,
        ts: attemptStartMs,
        statusCode: null,
        error: lastError,
        durationMs: Date.now() - attemptStartMs,
        nextRetryDelayMs: nextDelay,
      });
    }
  }

  return {
    targetId: target.id,
    targetName: target.name,
    success: false,
    statusCode: lastStatusCode,
    attempts,
    error: lastError,
    durationMs: Date.now() - startMs,
    attemptDetails,
  };
}

// ─── Transition Detection & Dispatch ─────────────────────────────────────────

/**
 * Determine if the current evaluation represents a severity transition
 * compared to the previously known state.
 * Pure function.
 */
export function isTransition(
  current: AlertSeverity,
  previous: AlertSeverity | null,
): boolean {
  if (previous === null) return true; // First evaluation
  return current !== previous;
}

/**
 * Determine which targets should receive a notification based on
 * the transition severity and per-target minSeverity filter + cooldown.
 * Pure function.
 */
export function selectTargets(
  targets: WebhookTarget[],
  currentSeverity: AlertSeverity,
  state: WebhookDeliveryState,
  cooldownMs: number,
  now: number,
): WebhookTarget[] {
  return targets.filter((t) => {
    if (!t.enabled) return false;

    // Check severity filter
    const minPriority = SEVERITY_PRIORITY[t.minSeverity ?? 'warning'];
    if (SEVERITY_PRIORITY[currentSeverity] < minPriority) return false;

    // Check cooldown
    const lastDelivery = state.lastDeliveryAt[t.id] ?? 0;
    if (now - lastDelivery < cooldownMs) return false;

    return true;
  });
}

/**
 * Main entry point: check for alert transitions and dispatch webhooks.
 *
 * Called inline during metrics evaluation (same pattern as alert-history).
 * Non-blocking — fires delivery promises and does not await them in the
 * critical path (unless the caller explicitly awaits the return).
 *
 * Returns a promise that resolves to delivery results (for testing/logging).
 * In production, the caller can fire-and-forget.
 */
export async function maybeDeliverWebhooks(
  dataDir: string,
  evaluation: AlertEvaluation,
  opts: { now?: number } = {},
): Promise<WebhookDeliveryResult[]> {
  const now = opts.now ?? evaluation.evaluatedAt;
  const config = readWebhookConfig(dataDir);

  // Global kill switch
  if (!config.enabled) return [];

  // No targets configured
  if (config.targets.length === 0) return [];

  const currentSeverity = evaluation.overallSeverity;
  const previousSeverity = deliveryState.lastSeverity;

  // Only deliver on actual transitions
  if (!isTransition(currentSeverity, previousSeverity)) return [];

  // Update tracked severity immediately (before async delivery)
  deliveryState.lastSeverity = currentSeverity;

  const cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const eligibleTargets = selectTargets(
    config.targets,
    currentSeverity,
    deliveryState,
    cooldownMs,
    now,
  );

  if (eligibleTargets.length === 0) return [];

  const payload = buildWebhookPayload(evaluation, previousSeverity);
  const deliveryOpts = {
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
  };

  // Deliver to all eligible targets concurrently
  const results = await Promise.all(
    eligibleTargets.map(async (target) => {
      const result = await deliverWebhook(target, payload, deliveryOpts);
      // Update last delivery timestamp on success
      if (result.success) {
        deliveryState.lastDeliveryAt[target.id] = now;
      }
      return result;
    }),
  );

  // Record delivery events to persistent history (Phase 13).
  // Fire-and-forget — history recording failures must not affect delivery results.
  try {
    const targetMap = new Map(eligibleTargets.map((t) => [t.id, t]));
    const contexts = results.map((r) => ({
      url: targetMap.get(r.targetId)?.url ?? '',
      triggerSeverity: currentSeverity,
      previousSeverity: previousSeverity,
      ts: now,
    }));
    appendDeliveryEvents(dataDir, results, contexts);
  } catch {
    // Non-critical — delivery history recording failure is swallowed
  }

  return results;
}

// ─── Test/Ping Webhook Delivery ──────────────────────────────────────────────

/** Bounded timeout for test pings (shorter than production). */
const TEST_TIMEOUT_MS = 5_000;
/** Bounded retry for test pings (fewer than production). */
const TEST_MAX_RETRIES = 1;

/**
 * Build a safe, explicitly non-production test payload for webhook validation.
 * The payload is designed to be easily distinguishable from real alert payloads
 * by downstream consumers — it uses a different event type, includes an explicit
 * test marker, and contains no sensitive data.
 * Pure function.
 */
export function buildTestPayload(now?: number): WebhookTestPayload {
  const ts = now ?? Date.now();
  return {
    event: 'webhook.test',
    test: true,
    _testMarker: 'NON_PRODUCTION_TEST_PING',
    timestamp: ts,
    timestampISO: new Date(ts).toISOString(),
    message: 'This is a test ping from VentureOS Dashboard. No action required.',
    source: 'ventureos-dashboard',
    schemaVersion: 1,
  };
}

/**
 * Deliver a test payload to a single webhook target.
 * Uses tighter timeout and no retries by default to give fast user feedback.
 * Returns a WebhookTestResult with isTest: true.
 */
export async function deliverTestWebhook(
  target: WebhookTarget,
  payload: WebhookTestPayload,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<WebhookTestResult> {
  const timeoutMs = opts.timeoutMs ?? TEST_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? TEST_MAX_RETRIES;

  // Format test payload for the target's provider (Phase 18).
  const formatted = formatPayload(payload, target.provider);
  const body = formatted.body;
  const startMs = Date.now();

  let lastError: string | null = null;
  let lastStatusCode: number | null = null;
  let attempts = 0;
  const attemptDetails: WebhookDeliveryAttemptDetail[] = [];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++;
    const attemptStartMs = Date.now();

    if (attempt > 0) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': formatted.contentType,
        'User-Agent': 'VentureOS-Dashboard/1.0',
        'X-VentureOS-Event': 'webhook.test',
        'X-VentureOS-Test': 'true',
        ...formatted.extraHeaders,
      };

      // Add HMAC signature if secret is configured.
      // Signature is computed over the final formatted body.
      if (target.secret) {
        const signature = await computeSignature(body, target.secret);
        headers['X-VentureOS-Signature'] = `sha256=${signature}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(target.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);
        lastStatusCode = response.status;

        if (response.ok) {
          attemptDetails.push({
            attempt: attempts,
            ts: attemptStartMs,
            statusCode: response.status,
            error: null,
            durationMs: Date.now() - attemptStartMs,
            nextRetryDelayMs: null,
          });
          return {
            targetId: target.id,
            targetName: target.name,
            success: true,
            statusCode: response.status,
            attempts,
            error: null,
            durationMs: Date.now() - startMs,
            isTest: true,
            attemptDetails,
          };
        }

        if (response.status >= 400 && response.status < 500) {
          lastError = `HTTP ${response.status}`;
          attemptDetails.push({
            attempt: attempts,
            ts: attemptStartMs,
            statusCode: response.status,
            error: lastError,
            durationMs: Date.now() - attemptStartMs,
            nextRetryDelayMs: null,
          });
          break;
        }

        lastError = `HTTP ${response.status}`;
        const nextDelay = attempt + 1 < maxRetries
          ? Math.min(1000 * Math.pow(2, attempt), 4000)
          : null;
        attemptDetails.push({
          attempt: attempts,
          ts: attemptStartMs,
          statusCode: response.status,
          error: lastError,
          durationMs: Date.now() - attemptStartMs,
          nextRetryDelayMs: nextDelay,
        });
      } catch (fetchErr: unknown) {
        clearTimeout(timer);
        if (fetchErr instanceof Error) {
          lastError = fetchErr.name === 'AbortError'
            ? `timeout after ${timeoutMs}ms`
            : fetchErr.message;
        } else {
          lastError = 'unknown fetch error';
        }
        const nextDelay = attempt + 1 < maxRetries
          ? Math.min(1000 * Math.pow(2, attempt), 4000)
          : null;
        attemptDetails.push({
          attempt: attempts,
          ts: attemptStartMs,
          statusCode: null,
          error: lastError,
          durationMs: Date.now() - attemptStartMs,
          nextRetryDelayMs: nextDelay,
        });
      }
    } catch (outerErr: unknown) {
      lastError = outerErr instanceof Error ? outerErr.message : 'unknown error';
      const nextDelay = attempt + 1 < maxRetries
        ? Math.min(1000 * Math.pow(2, attempt), 4000)
        : null;
      attemptDetails.push({
        attempt: attempts,
        ts: attemptStartMs,
        statusCode: null,
        error: lastError,
        durationMs: Date.now() - attemptStartMs,
        nextRetryDelayMs: nextDelay,
      });
    }
  }

  return {
    targetId: target.id,
    targetName: target.name,
    success: false,
    statusCode: lastStatusCode,
    attempts,
    error: lastError,
    durationMs: Date.now() - startMs,
    isTest: true,
    attemptDetails,
  };
}

/**
 * Send a test ping to one or all enabled webhook targets.
 *
 * This is explicitly user-triggered (not automated). It:
 * - Builds a non-production test payload
 * - Delivers to the specified target (by ID), or all enabled targets
 * - Uses bounded timeout (5s) and single attempt (no retries) for fast feedback
 * - Records the result in delivery history with a test marker
 * - Never exposes secrets in the response
 *
 * Returns per-target results for UI feedback.
 */
export async function sendTestWebhook(
  dataDir: string,
  opts: { targetId?: string; now?: number } = {},
): Promise<{ results: WebhookTestResult[]; error?: string }> {
  const now = opts.now ?? Date.now();
  const config = readWebhookConfig(dataDir);

  // Config must exist with at least one target
  if (config.targets.length === 0) {
    return { results: [], error: 'No webhook targets configured' };
  }

  // Determine which targets to ping
  let targets: WebhookTarget[];
  if (opts.targetId) {
    const target = config.targets.find((t) => t.id === opts.targetId);
    if (!target) {
      return { results: [], error: `Target not found: ${opts.targetId}` };
    }
    targets = [target];
  } else {
    // All enabled targets
    targets = config.targets.filter((t) => t.enabled);
    if (targets.length === 0) {
      return { results: [], error: 'No enabled webhook targets' };
    }
  }

  const payload = buildTestPayload(now);

  // Bounded delivery timeout from config, capped for test pings
  const deliveryOpts = {
    timeoutMs: Math.min(config.timeoutMs ?? TEST_TIMEOUT_MS, TEST_TIMEOUT_MS),
    maxRetries: TEST_MAX_RETRIES,
  };

  // Deliver to all targets concurrently
  const results = await Promise.all(
    targets.map((target) => deliverTestWebhook(target, payload, deliveryOpts)),
  );

  // Record test delivery events to persistent history.
  // Fire-and-forget — recording failures must not affect test results.
  try {
    const targetMap = new Map(targets.map((t) => [t.id, t]));
    const contexts = results.map((r) => ({
      url: targetMap.get(r.targetId)?.url ?? '',
      triggerSeverity: 'test' as string,
      previousSeverity: null as string | null,
      ts: now,
    }));
    appendDeliveryEvents(dataDir, results, contexts);
  } catch {
    // Non-critical — history recording failure is swallowed
  }

  return { results };
}
