/**
 * Alert Rules tests — Issue #219, Phase 9: Metrics Alerting Rules Baseline.
 *
 * Tests for:
 * - evaluateAlerts() — threshold evaluation correctness
 * - validateAlertConfig() — config validation
 * - mergeWithDefaults() — partial config merge
 * - readAlertConfig() / writeAlertConfig() — config persistence
 * - GET /api/task-board/alerts/config — read endpoint
 * - PUT /api/task-board/alerts/config — write endpoint
 * - GET /api/task-board/metrics — includes alerts in response
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import {
  handleTaskBoard,
  loadTasks,
} from '../../../server/routes/task-board.js';
import {
  evaluateAlerts,
  validateAlertConfig,
  mergeWithDefaults,
  readAlertConfig,
  writeAlertConfig,
  DEFAULT_ALERT_CONFIG,
} from '../../../server/alert-rules.js';
import type {
  AlertRulesConfig,
  AlertMetricsInput,
  AlertSeverity,
} from '../../../server/alert-rules.js';
import type { TaskBoardDeps, TaskCard } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-alert-rules-' + process.pid);

function createDeps(overrides: Partial<TaskBoardDeps> = {}): TaskBoardDeps {
  return {
    dataDir: testDataDir,
    sendJson: (res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    },
    readRequestBody: async () => '{}',
    ...overrides,
  };
}

function makeSampleCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    agentId: 'oracle',
    title: 'Test task',
    description: 'A test task',
    priority: 'medium',
    status: 'backlog',
    createdAt: Date.now(),
    queuedAt: null,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    tokensUsed: null,
    error: null,
    costEstimate: null,
    runtimeMs: null,
    ...overrides,
  };
}

function seedTasks(tasks: TaskCard[]): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks, updatedAt: Date.now() }),
  );
}

function metricsInput(overrides: Partial<AlertMetricsInput> = {}): AlertMetricsInput {
  return {
    statusCounts: { backlog: 0, queued: 0, running: 0, done: 0, failed: 0 },
    successRate: null,
    stuckCount: 0,
    avgRuntimeMs: null,
    total: 0,
    ...overrides,
  };
}

beforeEach(() => {
  fs.mkdirSync(testDataDir, { recursive: true });
  // Clean slate
  for (const f of ['task-board.json', 'task-board-alert-rules.json']) {
    const fp = path.join(testDataDir, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
});

afterEach(() => {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {}
});

// ─── evaluateAlerts — threshold evaluation correctness ───────────────────────

describe('evaluateAlerts', () => {
  const NOW = 1700000000000;

  it('returns all OK with default config and empty metrics', () => {
    const result = evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG, NOW);
    expect(result.overallSeverity).toBe('ok');
    expect(result.rules).toHaveLength(5);
    expect(result.rules.every(r => r.severity === 'ok')).toBe(true);
    expect(result.severityCounts.ok).toBeGreaterThan(0);
    expect(result.severityCounts.warning).toBe(0);
    expect(result.severityCounts.critical).toBe(0);
  });

  it('fires warning when stuck count >= warning threshold', () => {
    const metrics = metricsInput({ stuckCount: 3 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 2, critical: 5 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.severity).toBe('warning');
    expect(stuckRule.currentValue).toBe(3);
    expect(result.overallSeverity).toBe('warning');
  });

  it('fires critical when stuck count >= critical threshold', () => {
    const metrics = metricsInput({ stuckCount: 7 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 2, critical: 5 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.severity).toBe('critical');
    expect(result.overallSeverity).toBe('critical');
  });

  it('stays OK when stuck count < warning', () => {
    const metrics = metricsInput({ stuckCount: 1 });
    const result = evaluateAlerts(metrics, DEFAULT_ALERT_CONFIG, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.severity).toBe('ok');
  });

  it('fires warning when failed rate >= warning threshold', () => {
    // successRate 0.8 => failedRate 0.2, warning threshold 0.15
    const metrics = metricsInput({ successRate: 0.8 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      failedRate: { enabled: true, warning: 0.15, critical: 0.30 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const failedRule = result.rules.find(r => r.rule === 'failedRate')!;
    expect(failedRule.severity).toBe('warning');
    expect(failedRule.currentValue).toBeCloseTo(0.2);
  });

  it('fires critical when failed rate >= critical threshold', () => {
    // successRate 0.6 => failedRate 0.4, critical threshold 0.30
    const metrics = metricsInput({ successRate: 0.6 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      failedRate: { enabled: true, warning: 0.15, critical: 0.30 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const failedRule = result.rules.find(r => r.rule === 'failedRate')!;
    expect(failedRule.severity).toBe('critical');
  });

  it('stays OK when no terminal tasks (successRate is null)', () => {
    const metrics = metricsInput({ successRate: null });
    const result = evaluateAlerts(metrics, DEFAULT_ALERT_CONFIG, NOW);
    const failedRule = result.rules.find(r => r.rule === 'failedRate')!;
    expect(failedRule.severity).toBe('ok');
    expect(failedRule.currentValue).toBeNull();
  });

  it('fires warning when backlog >= warning threshold', () => {
    const metrics = metricsInput({
      statusCounts: { backlog: 25, queued: 0, running: 0, done: 0, failed: 0 },
    });
    const result = evaluateAlerts(metrics, DEFAULT_ALERT_CONFIG, NOW);
    const backlogRule = result.rules.find(r => r.rule === 'backlogSize')!;
    expect(backlogRule.severity).toBe('warning');
    expect(backlogRule.currentValue).toBe(25);
  });

  it('fires critical when backlog >= critical threshold', () => {
    const metrics = metricsInput({
      statusCounts: { backlog: 55, queued: 0, running: 0, done: 0, failed: 0 },
    });
    const result = evaluateAlerts(metrics, DEFAULT_ALERT_CONFIG, NOW);
    const backlogRule = result.rules.find(r => r.rule === 'backlogSize')!;
    expect(backlogRule.severity).toBe('critical');
  });

  it('respects disabled rules', () => {
    const metrics = metricsInput({ stuckCount: 100 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: false, warning: 1, critical: 2 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.severity).toBe('ok');
    expect(stuckRule.enabled).toBe(false);
  });

  it('disabled rules do not affect overall severity', () => {
    const metrics = metricsInput({ stuckCount: 100 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: false, warning: 1, critical: 2 },
      failedRate: { enabled: false, warning: 0.01, critical: 0.01 },
      backlogSize: { enabled: false, warning: 0, critical: 0 },
      avgRuntime: { enabled: false, warning: 0, critical: 0 },
      queueDepth: { enabled: false, warning: 0, critical: 0 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    expect(result.overallSeverity).toBe('ok');
  });

  it('fires avgRuntime alert when enabled and exceeded', () => {
    const metrics = metricsInput({ avgRuntimeMs: 400000 }); // 400s
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      avgRuntime: { enabled: true, warning: 300000, critical: 600000 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const rtRule = result.rules.find(r => r.rule === 'avgRuntime')!;
    expect(rtRule.severity).toBe('warning');
  });

  it('fires queueDepth alert when enabled and exceeded', () => {
    const metrics = metricsInput({
      statusCounts: { backlog: 0, queued: 30, running: 0, done: 0, failed: 0 },
    });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      queueDepth: { enabled: true, warning: 10, critical: 25 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const queueRule = result.rules.find(r => r.rule === 'queueDepth')!;
    expect(queueRule.severity).toBe('critical');
  });

  it('overall severity is the max across all enabled rules', () => {
    const metrics = metricsInput({
      stuckCount: 3,
      successRate: 0.6,
    });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 2, critical: 5 },
      failedRate: { enabled: true, warning: 0.15, critical: 0.30 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    // stuckCount=3 → warning, failedRate=0.4 → critical
    expect(result.overallSeverity).toBe('critical');
    expect(result.severityCounts.warning).toBeGreaterThanOrEqual(1);
    expect(result.severityCounts.critical).toBeGreaterThanOrEqual(1);
  });

  it('exact threshold value triggers alert (>=)', () => {
    const metrics = metricsInput({ stuckCount: 2 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 2, critical: 5 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.severity).toBe('warning');
  });

  it('includes human-readable messages', () => {
    const metrics = metricsInput({ stuckCount: 3 });
    const config: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: true, warning: 2, critical: 5 },
    };
    const result = evaluateAlerts(metrics, config, NOW);
    const stuckRule = result.rules.find(r => r.rule === 'stuckCount')!;
    expect(stuckRule.message).toContain('Stuck Tasks');
    expect(stuckRule.message).toContain('3');
    expect(stuckRule.message).toContain('warning');
    expect(stuckRule.message).toContain('2');
  });

  it('evaluatedAt timestamp is set correctly', () => {
    const result = evaluateAlerts(metricsInput(), DEFAULT_ALERT_CONFIG, NOW);
    expect(result.evaluatedAt).toBe(NOW);
  });
});

// ─── validateAlertConfig — config validation ─────────────────────────────────

describe('validateAlertConfig', () => {
  it('returns empty array for valid config', () => {
    const errors = validateAlertConfig({
      stuckCount: { enabled: true, warning: 2, critical: 5 },
      failedRate: { enabled: true, warning: 0.15, critical: 0.30 },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validateAlertConfig(null)).toHaveLength(1);
    expect(validateAlertConfig('string')).toHaveLength(1);
    expect(validateAlertConfig(42)).toHaveLength(1);
    expect(validateAlertConfig([])).toHaveLength(1);
  });

  it('rejects unknown rule keys', () => {
    const errors = validateAlertConfig({ unknownRule: { enabled: true, warning: 1, critical: 2 } });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('unknownRule');
  });

  it('rejects non-boolean enabled', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: 'yes', warning: 2, critical: 5 } });
    expect(errors.some(e => e.field === 'stuckCount.enabled')).toBe(true);
  });

  it('rejects negative thresholds', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: true, warning: -1, critical: 5 } });
    expect(errors.some(e => e.field === 'stuckCount.warning')).toBe(true);
  });

  it('rejects NaN thresholds', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: true, warning: NaN, critical: 5 } });
    expect(errors.some(e => e.field === 'stuckCount.warning')).toBe(true);
  });

  it('rejects Infinity thresholds', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: true, warning: Infinity, critical: 5 } });
    expect(errors.some(e => e.field === 'stuckCount.warning')).toBe(true);
  });

  it('rejects critical < warning', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: true, warning: 10, critical: 5 } });
    expect(errors.some(e => e.field === 'stuckCount')).toBe(true);
  });

  it('allows partial config (only some rules)', () => {
    const errors = validateAlertConfig({ stuckCount: { enabled: true, warning: 2, critical: 5 } });
    expect(errors).toHaveLength(0);
  });

  it('allows empty object', () => {
    const errors = validateAlertConfig({});
    expect(errors).toHaveLength(0);
  });
});

// ─── mergeWithDefaults — partial config merge ────────────────────────────────

describe('mergeWithDefaults', () => {
  it('returns full defaults for empty input', () => {
    const result = mergeWithDefaults({});
    expect(result).toEqual(DEFAULT_ALERT_CONFIG);
  });

  it('overrides specific rule values', () => {
    const result = mergeWithDefaults({
      stuckCount: { enabled: false, warning: 10, critical: 20 },
    });
    expect(result.stuckCount.enabled).toBe(false);
    expect(result.stuckCount.warning).toBe(10);
    expect(result.stuckCount.critical).toBe(20);
    // Other rules should be defaults
    expect(result.failedRate).toEqual(DEFAULT_ALERT_CONFIG.failedRate);
  });

  it('fills missing fields from defaults', () => {
    const result = mergeWithDefaults({
      stuckCount: { warning: 99 },
    });
    // enabled should come from default
    expect(result.stuckCount.enabled).toBe(DEFAULT_ALERT_CONFIG.stuckCount.enabled);
    expect(result.stuckCount.warning).toBe(99);
    // critical from default
    expect(result.stuckCount.critical).toBe(DEFAULT_ALERT_CONFIG.stuckCount.critical);
  });

  it('ignores invalid field types', () => {
    const result = mergeWithDefaults({
      stuckCount: { enabled: 'not-bool', warning: 'not-num', critical: -5 },
    });
    // Invalid values should fall back to defaults
    expect(result.stuckCount.enabled).toBe(DEFAULT_ALERT_CONFIG.stuckCount.enabled);
    expect(result.stuckCount.warning).toBe(DEFAULT_ALERT_CONFIG.stuckCount.warning);
    expect(result.stuckCount.critical).toBe(DEFAULT_ALERT_CONFIG.stuckCount.critical);
  });

  it('ignores unknown keys', () => {
    const result = mergeWithDefaults({
      unknownRule: { enabled: true, warning: 1, critical: 2 },
    });
    expect(result).toEqual(DEFAULT_ALERT_CONFIG);
    expect((result as any).unknownRule).toBeUndefined();
  });
});

// ─── readAlertConfig / writeAlertConfig — persistence ────────────────────────

describe('config persistence', () => {
  it('returns defaults when file does not exist', () => {
    const config = readAlertConfig(testDataDir);
    expect(config).toEqual(DEFAULT_ALERT_CONFIG);
  });

  it('round-trips config through write/read', () => {
    const custom: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: false, warning: 10, critical: 20 },
    };
    writeAlertConfig(testDataDir, custom);
    const read = readAlertConfig(testDataDir);
    expect(read.stuckCount.enabled).toBe(false);
    expect(read.stuckCount.warning).toBe(10);
    expect(read.stuckCount.critical).toBe(20);
  });

  it('returns defaults for corrupted file', () => {
    const fp = path.join(testDataDir, 'task-board-alert-rules.json');
    fs.writeFileSync(fp, 'not valid json!!!');
    const config = readAlertConfig(testDataDir);
    expect(config).toEqual(DEFAULT_ALERT_CONFIG);
  });

  it('creates directory if needed', () => {
    const deepDir = path.join(testDataDir, 'deep', 'nested');
    writeAlertConfig(deepDir, DEFAULT_ALERT_CONFIG);
    const config = readAlertConfig(deepDir);
    expect(config).toEqual(DEFAULT_ALERT_CONFIG);
  });
});

// ─── GET /api/task-board/alerts/config endpoint ──────────────────────────────

describe('GET /api/task-board/alerts/config', () => {
  it('returns default config when no file exists', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(res._statusCode).toBe(200);
    expect(body).toHaveProperty('config');
    expect(body.config).toHaveProperty('stuckCount');
    expect(body.config).toHaveProperty('failedRate');
    expect(body.config).toHaveProperty('backlogSize');
    expect(body.config).toHaveProperty('avgRuntime');
    expect(body.config).toHaveProperty('queueDepth');
  });

  it('returns saved config', async () => {
    seedTasks([]);
    const custom: AlertRulesConfig = {
      ...DEFAULT_ALERT_CONFIG,
      stuckCount: { enabled: false, warning: 99, critical: 999 },
    };
    writeAlertConfig(testDataDir, custom);

    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.config.stuckCount.enabled).toBe(false);
    expect(body.config.stuckCount.warning).toBe(99);
    expect(body.config.stuckCount.critical).toBe(999);
  });
});

// ─── PUT /api/task-board/alerts/config endpoint ──────────────────────────────

describe('PUT /api/task-board/alerts/config', () => {
  it('saves valid config and returns merged result', async () => {
    seedTasks([]);
    const update = {
      stuckCount: { enabled: false, warning: 10, critical: 20 },
    };

    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'PUT' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify(update),
    });

    await handleTaskBoard(req, res, deps);

    const body = parseJsonBody(res);
    expect(res._statusCode).toBe(200);
    expect(body.config.stuckCount.enabled).toBe(false);
    expect(body.config.stuckCount.warning).toBe(10);
    // Other rules should be defaults
    expect(body.config.failedRate).toEqual(DEFAULT_ALERT_CONFIG.failedRate);

    // Verify persisted
    const persisted = readAlertConfig(testDataDir);
    expect(persisted.stuckCount.enabled).toBe(false);
  });

  it('rejects invalid config with 400', async () => {
    seedTasks([]);
    const invalid = {
      stuckCount: { enabled: true, warning: 10, critical: 5 }, // critical < warning
    };

    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'PUT' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify(invalid),
    });

    await handleTaskBoard(req, res, deps);

    const body = parseJsonBody(res);
    expect(res._statusCode).toBe(400);
    expect(body.error).toBe('validation failed');
    expect(body.errors).toHaveLength(1);
  });

  it('rejects invalid JSON with 400', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'PUT' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => 'not json!!!',
    });

    await handleTaskBoard(req, res, deps);

    expect(res._statusCode).toBe(400);
    expect(parseJsonBody(res).error).toBe('invalid JSON body');
  });

  it('rejects unknown rule keys', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/alerts/config', method: 'PUT' });
    const res = mockResponse();
    const deps = createDeps({
      readRequestBody: async () => JSON.stringify({ badKey: { enabled: true, warning: 1, critical: 2 } }),
    });

    await handleTaskBoard(req, res, deps);
    expect(res._statusCode).toBe(400);
  });
});

// ─── GET /api/task-board/metrics includes alerts ─────────────────────────────

describe('GET /api/task-board/metrics — alert integration', () => {
  it('includes alerts in metrics response by default', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body).toHaveProperty('alerts');
    expect(body.alerts).toHaveProperty('overallSeverity');
    expect(body.alerts).toHaveProperty('rules');
    expect(body.alerts.rules).toHaveLength(5);
  });

  it('excludes alerts when includeAlerts=false', async () => {
    seedTasks([]);
    const req = mockRequest({ url: '/api/task-board/metrics?includeAlerts=false', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.alerts).toBeUndefined();
  });

  it('evaluates alerts with task data correctly', async () => {
    const now = Date.now();
    // Create conditions that should trigger alerts:
    // - 3 stuck tasks (default warning=2)
    // - 0.6 success rate -> 0.4 failed rate (default critical=0.30)
    seedTasks([
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'done', completedAt: now - 1000 }),
      makeSampleCard({ status: 'done', completedAt: now - 1000 }),
      makeSampleCard({ status: 'done', completedAt: now - 1000 }),
      makeSampleCard({ status: 'failed', completedAt: now - 1000 }),
      makeSampleCard({ status: 'failed', completedAt: now - 1000 }),
    ]);

    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.alerts.overallSeverity).toBe('critical');

    const stuckRule = body.alerts.rules.find((r: any) => r.rule === 'stuckCount');
    expect(stuckRule.severity).toBe('warning'); // 3 >= 2 (warning), < 5 (critical)

    const failedRule = body.alerts.rules.find((r: any) => r.rule === 'failedRate');
    expect(failedRule.severity).toBe('critical'); // 0.4 >= 0.30
  });

  it('uses custom config for alert evaluation', async () => {
    const now = Date.now();
    // Raise the thresholds so nothing triggers
    const lenientConfig: AlertRulesConfig = {
      stuckCount: { enabled: true, warning: 100, critical: 200 },
      failedRate: { enabled: true, warning: 0.90, critical: 0.95 },
      backlogSize: { enabled: true, warning: 1000, critical: 5000 },
      avgRuntime: { enabled: false, warning: 300000, critical: 600000 },
      queueDepth: { enabled: false, warning: 100, critical: 200 },
    };
    writeAlertConfig(testDataDir, lenientConfig);

    seedTasks([
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'running', startedAt: now - 3600000 * 2 }), // stuck
      makeSampleCard({ status: 'failed', completedAt: now - 1000 }),
      makeSampleCard({ status: 'done', completedAt: now - 1000 }),
    ]);

    const req = mockRequest({ url: '/api/task-board/metrics', method: 'GET' });
    const res = mockResponse();
    await handleTaskBoard(req, res, createDeps());

    const body = parseJsonBody(res);
    expect(body.alerts.overallSeverity).toBe('ok'); // nothing triggers with lenient thresholds
  });
});
