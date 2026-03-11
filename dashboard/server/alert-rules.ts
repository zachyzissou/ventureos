/**
 * Alert Rules — configurable threshold evaluation for Task Board metrics.
 * Issue #219 — Phase 9: Metrics Alerting Rules Baseline.
 *
 * Evaluates task-board metrics against user-configurable thresholds and
 * produces alert states. Computed on-demand during metrics API reads —
 * no background daemons or persistent state beyond the config file.
 *
 * Alert severity levels:
 *   - ok:       metric is within acceptable bounds
 *   - warning:  metric has crossed the warning threshold
 *   - critical: metric has crossed the critical threshold
 *
 * Config is persisted as a JSON file alongside other task-board data.
 * Missing config falls back to sensible defaults.
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AlertSeverity = 'ok' | 'warning' | 'critical';

/** A single alert rule threshold config. */
export interface AlertThreshold {
  /** Whether this rule is enabled. */
  enabled: boolean;
  /** Warning threshold value. */
  warning: number;
  /** Critical threshold value. */
  critical: number;
}

/** Full alert rules configuration. */
export interface AlertRulesConfig {
  /**
   * Stuck task count thresholds.
   * Direction: alert when metric >= threshold.
   */
  stuckCount: AlertThreshold;
  /**
   * Failed task rate (0–1) thresholds.
   * Direction: alert when failed rate >= threshold.
   * Computed as: 1 - successRate.
   */
  failedRate: AlertThreshold;
  /**
   * Backlog size thresholds.
   * Direction: alert when backlog count >= threshold.
   */
  backlogSize: AlertThreshold;
  /**
   * Average runtime (milliseconds) thresholds.
   * Direction: alert when avgRuntimeMs >= threshold.
   */
  avgRuntime: AlertThreshold;
  /**
   * Queue depth (queued count) thresholds.
   * Direction: alert when queued count >= threshold.
   */
  queueDepth: AlertThreshold;
}

/** Result of evaluating a single alert rule. */
export interface AlertRuleResult {
  /** Rule identifier matching the config key. */
  rule: keyof AlertRulesConfig;
  /** Human-readable label for display. */
  label: string;
  /** Whether the rule is enabled. */
  enabled: boolean;
  /** Current severity level. */
  severity: AlertSeverity;
  /** Current metric value. */
  currentValue: number | null;
  /** Warning threshold. */
  warningThreshold: number;
  /** Critical threshold. */
  criticalThreshold: number;
  /** Human-readable message. */
  message: string;
}

/** Aggregated alert evaluation result. */
export interface AlertEvaluation {
  /** Timestamp of evaluation (ms since epoch). */
  evaluatedAt: number;
  /** Highest severity across all enabled rules. */
  overallSeverity: AlertSeverity;
  /** Count of rules at each severity level. */
  severityCounts: Record<AlertSeverity, number>;
  /** Per-rule results. */
  rules: AlertRuleResult[];
}

/** Metrics input for alert evaluation (subset of TaskBoardMetrics). */
export interface AlertMetricsInput {
  statusCounts: Record<string, number>;
  successRate: number | null;
  stuckCount: number;
  avgRuntimeMs: number | null;
  total: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALERT_CONFIG_FILENAME = 'task-board-alert-rules.json';

/** Default alert configuration — conservative thresholds. */
export const DEFAULT_ALERT_CONFIG: AlertRulesConfig = {
  stuckCount: { enabled: true, warning: 2, critical: 5 },
  failedRate: { enabled: true, warning: 0.15, critical: 0.30 },
  backlogSize: { enabled: true, warning: 20, critical: 50 },
  avgRuntime: { enabled: false, warning: 300000, critical: 600000 }, // 5min / 10min
  queueDepth: { enabled: false, warning: 10, critical: 25 },
};

/** Valid rule keys for validation. */
const VALID_RULE_KEYS: (keyof AlertRulesConfig)[] = [
  'stuckCount',
  'failedRate',
  'backlogSize',
  'avgRuntime',
  'queueDepth',
];

/** Human-readable labels for each rule. */
const RULE_LABELS: Record<keyof AlertRulesConfig, string> = {
  stuckCount: 'Stuck Tasks',
  failedRate: 'Failed Rate',
  backlogSize: 'Backlog Size',
  avgRuntime: 'Avg Runtime',
  queueDepth: 'Queue Depth',
};

// ─── Config I/O ──────────────────────────────────────────────────────────────

function configFilePath(dataDir: string): string {
  return path.join(dataDir, ALERT_CONFIG_FILENAME);
}

/**
 * Read alert rules config from disk.
 * Returns defaults if file doesn't exist or is corrupt.
 */
export function readAlertConfig(dataDir: string): AlertRulesConfig {
  try {
    const fp = configFilePath(dataDir);
    if (!fs.existsSync(fp)) return { ...DEFAULT_ALERT_CONFIG };
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    return { ...DEFAULT_ALERT_CONFIG };
  }
}

/**
 * Write alert rules config to disk atomically.
 * Validates input before writing.
 */
export function writeAlertConfig(dataDir: string, config: AlertRulesConfig): void {
  const fp = configFilePath(dataDir);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFp = fp + '.tmp';
  fs.writeFileSync(tmpFp, JSON.stringify(config, null, 2));
  fs.renameSync(tmpFp, fp);
}

/**
 * Merge partial user config with defaults.
 * Ensures all keys are present and values are valid.
 * Pure function for testability.
 */
export function mergeWithDefaults(
  partial: Partial<Record<string, unknown>>,
): AlertRulesConfig {
  const result: AlertRulesConfig = { ...DEFAULT_ALERT_CONFIG };

  for (const key of VALID_RULE_KEYS) {
    const val = partial?.[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const src = val as Record<string, unknown>;
      const def = DEFAULT_ALERT_CONFIG[key];
      result[key] = {
        enabled: typeof src.enabled === 'boolean' ? src.enabled : def.enabled,
        warning: typeof src.warning === 'number' && isFinite(src.warning) && src.warning >= 0
          ? src.warning
          : def.warning,
        critical: typeof src.critical === 'number' && isFinite(src.critical) && src.critical >= 0
          ? src.critical
          : def.critical,
      };
    }
  }

  return result;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Validation error returned when config update fails. */
export interface AlertConfigValidationError {
  field: string;
  message: string;
}

/**
 * Validate an alert rules config update.
 * Returns an array of validation errors (empty = valid).
 * Pure function for testability.
 */
export function validateAlertConfig(
  input: unknown,
): AlertConfigValidationError[] {
  const errors: AlertConfigValidationError[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ field: 'root', message: 'config must be a non-null object' });
    return errors;
  }

  const obj = input as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!VALID_RULE_KEYS.includes(key as keyof AlertRulesConfig)) {
      errors.push({ field: key, message: `unknown rule key: ${key}` });
      continue;
    }

    const ruleVal = obj[key];
    if (!ruleVal || typeof ruleVal !== 'object' || Array.isArray(ruleVal)) {
      errors.push({ field: key, message: `${key} must be an object` });
      continue;
    }

    const rule = ruleVal as Record<string, unknown>;

    if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
      errors.push({ field: `${key}.enabled`, message: 'enabled must be a boolean' });
    }

    if (rule.warning !== undefined) {
      if (typeof rule.warning !== 'number' || !isFinite(rule.warning) || rule.warning < 0) {
        errors.push({ field: `${key}.warning`, message: 'warning must be a non-negative finite number' });
      }
    }

    if (rule.critical !== undefined) {
      if (typeof rule.critical !== 'number' || !isFinite(rule.critical) || rule.critical < 0) {
        errors.push({ field: `${key}.critical`, message: 'critical must be a non-negative finite number' });
      }
    }

    // For "upper bound" rules (alert when value >= threshold),
    // critical should be >= warning
    if (
      typeof rule.warning === 'number' &&
      typeof rule.critical === 'number' &&
      rule.critical < rule.warning
    ) {
      errors.push({
        field: `${key}`,
        message: `critical threshold (${rule.critical}) must be >= warning threshold (${rule.warning})`,
      });
    }
  }

  return errors;
}

// ─── Alert Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate a single "upper bound" rule: alert when value >= threshold.
 * Pure function.
 */
function evaluateUpperBound(
  value: number | null,
  threshold: AlertThreshold,
): AlertSeverity {
  if (!threshold.enabled || value === null) return 'ok';
  if (value >= threshold.critical) return 'critical';
  if (value >= threshold.warning) return 'warning';
  return 'ok';
}

/**
 * Get the highest severity from an array.
 */
function maxSeverity(severities: AlertSeverity[]): AlertSeverity {
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('warning')) return 'warning';
  return 'ok';
}

/**
 * Format a metric value for display in alert messages.
 */
function fmtValue(rule: keyof AlertRulesConfig, value: number | null): string {
  if (value === null) return 'N/A';
  switch (rule) {
    case 'failedRate':
      return (value * 100).toFixed(1) + '%';
    case 'avgRuntime':
      return value >= 60000
        ? (value / 60000).toFixed(1) + 'm'
        : (value / 1000).toFixed(1) + 's';
    default:
      return String(Math.round(value));
  }
}

/**
 * Format a threshold value for display.
 */
function fmtThreshold(rule: keyof AlertRulesConfig, value: number): string {
  switch (rule) {
    case 'failedRate':
      return (value * 100).toFixed(0) + '%';
    case 'avgRuntime':
      return value >= 60000
        ? (value / 60000).toFixed(0) + 'm'
        : (value / 1000).toFixed(0) + 's';
    default:
      return String(Math.round(value));
  }
}

/**
 * Build alert message for a rule result.
 */
function buildMessage(
  rule: keyof AlertRulesConfig,
  label: string,
  severity: AlertSeverity,
  value: number | null,
  threshold: AlertThreshold,
): string {
  if (severity === 'ok') return `${label}: ${fmtValue(rule, value)} (OK)`;
  const thresholdLabel = severity === 'critical' ? 'critical' : 'warning';
  const thresholdVal = severity === 'critical' ? threshold.critical : threshold.warning;
  return `${label}: ${fmtValue(rule, value)} exceeds ${thresholdLabel} threshold of ${fmtThreshold(rule, thresholdVal)}`;
}

/**
 * Evaluate all alert rules against current metrics.
 * This is the main entry point — called from the metrics API handler.
 * Pure function (no side effects, no I/O).
 */
export function evaluateAlerts(
  metrics: AlertMetricsInput,
  config: AlertRulesConfig,
  now: number = Date.now(),
): AlertEvaluation {
  const results: AlertRuleResult[] = [];

  // 1. Stuck count
  const stuckSeverity = evaluateUpperBound(metrics.stuckCount, config.stuckCount);
  results.push({
    rule: 'stuckCount',
    label: RULE_LABELS.stuckCount,
    enabled: config.stuckCount.enabled,
    severity: stuckSeverity,
    currentValue: metrics.stuckCount,
    warningThreshold: config.stuckCount.warning,
    criticalThreshold: config.stuckCount.critical,
    message: buildMessage('stuckCount', RULE_LABELS.stuckCount, stuckSeverity, metrics.stuckCount, config.stuckCount),
  });

  // 2. Failed rate (computed from successRate)
  const failedRate = metrics.successRate !== null ? 1 - metrics.successRate : null;
  const failedSeverity = evaluateUpperBound(failedRate, config.failedRate);
  results.push({
    rule: 'failedRate',
    label: RULE_LABELS.failedRate,
    enabled: config.failedRate.enabled,
    severity: failedSeverity,
    currentValue: failedRate,
    warningThreshold: config.failedRate.warning,
    criticalThreshold: config.failedRate.critical,
    message: buildMessage('failedRate', RULE_LABELS.failedRate, failedSeverity, failedRate, config.failedRate),
  });

  // 3. Backlog size
  const backlogCount = metrics.statusCounts['backlog'] ?? 0;
  const backlogSeverity = evaluateUpperBound(backlogCount, config.backlogSize);
  results.push({
    rule: 'backlogSize',
    label: RULE_LABELS.backlogSize,
    enabled: config.backlogSize.enabled,
    severity: backlogSeverity,
    currentValue: backlogCount,
    warningThreshold: config.backlogSize.warning,
    criticalThreshold: config.backlogSize.critical,
    message: buildMessage('backlogSize', RULE_LABELS.backlogSize, backlogSeverity, backlogCount, config.backlogSize),
  });

  // 4. Average runtime
  const avgSeverity = evaluateUpperBound(metrics.avgRuntimeMs, config.avgRuntime);
  results.push({
    rule: 'avgRuntime',
    label: RULE_LABELS.avgRuntime,
    enabled: config.avgRuntime.enabled,
    severity: avgSeverity,
    currentValue: metrics.avgRuntimeMs,
    warningThreshold: config.avgRuntime.warning,
    criticalThreshold: config.avgRuntime.critical,
    message: buildMessage('avgRuntime', RULE_LABELS.avgRuntime, avgSeverity, metrics.avgRuntimeMs, config.avgRuntime),
  });

  // 5. Queue depth
  const queueCount = metrics.statusCounts['queued'] ?? 0;
  const queueSeverity = evaluateUpperBound(queueCount, config.queueDepth);
  results.push({
    rule: 'queueDepth',
    label: RULE_LABELS.queueDepth,
    enabled: config.queueDepth.enabled,
    severity: queueSeverity,
    currentValue: queueCount,
    warningThreshold: config.queueDepth.warning,
    criticalThreshold: config.queueDepth.critical,
    message: buildMessage('queueDepth', RULE_LABELS.queueDepth, queueSeverity, queueCount, config.queueDepth),
  });

  // Compute overall severity (only from enabled rules)
  const enabledSeverities = results.filter(r => r.enabled).map(r => r.severity);
  const overallSeverity = maxSeverity(enabledSeverities);

  // Severity counts
  const severityCounts: Record<AlertSeverity, number> = { ok: 0, warning: 0, critical: 0 };
  for (const r of results) {
    if (r.enabled) severityCounts[r.severity]++;
  }

  return {
    evaluatedAt: now,
    overallSeverity,
    severityCounts,
    rules: results,
  };
}
