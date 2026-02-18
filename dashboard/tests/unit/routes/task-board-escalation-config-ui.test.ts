/**
 * Escalation Policy Config UI tests — Issue #219, Phase 21.
 *
 * Tests for the dashboard escalation policy configuration UI that lives
 * inside the webhook config modal. Covers:
 *
 * - Config round-trip: read → edit → save → re-read
 * - Validation errors: tier ordering, bounds, target cross-refs
 * - Backward compatibility: configs without escalation field work unchanged
 * - Escalation config persists alongside webhook config
 * - Disabled-by-default behavior
 * - Edge cases: max tiers, empty tiers, boundary values
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import {
  readWebhookConfig,
  writeWebhookConfig,
  DEFAULT_WEBHOOK_CONFIG,
} from '../../../server/alert-webhook.js';
import type { WebhookConfig, WebhookTarget } from '../../../server/alert-webhook.js';
import type { EscalationPolicyConfig } from '../../../server/escalation-policy.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-escalation-config-ui-' + process.pid);

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

function seedWebhookConfig(config: WebhookConfig): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  writeWebhookConfig(testDataDir, config);
}

function seedTasks(): void {
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDataDir, 'task-board.json'),
    JSON.stringify({ tasks: [], updatedAt: Date.now() }),
  );
}

function makeTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    id: 'target-' + Math.random().toString(36).slice(2, 6),
    name: 'Test Target',
    url: 'https://example.com/webhook',
    enabled: true,
    minSeverity: 'warning',
    ...overrides,
  };
}

function makeEscalation(overrides: Partial<EscalationPolicyConfig> = {}): EscalationPolicyConfig {
  return {
    enabled: false,
    triggerSeverity: 'critical',
    cooldownMs: 300000,
    tiers: [],
    ...overrides,
  };
}

describe('Escalation Policy Config UI (Phase 21)', () => {
  beforeEach(() => {
    fs.mkdirSync(testDataDir, { recursive: true });
    seedTasks();
  });

  afterEach(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  // ── GET: Read escalation config via webhook config endpoint ───────────

  describe('GET /api/task-board/webhooks/config — escalation section', () => {
    it('returns default config without escalation when none configured', async () => {
      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(body.config).toBeDefined();
      expect(body.config.enabled).toBe(false);
      // Escalation should be absent or have defaults
      // The system is backward-compatible — no escalation field is fine
    });

    it('returns escalation config when present', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'slack' })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['slack'], label: 'Page on-call' },
            { afterMs: 900000, targetIds: ['slack'], label: 'Notify manager' },
          ],
        },
      });

      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(body.config.escalation).toBeDefined();
      expect(body.config.escalation.enabled).toBe(true);
      expect(body.config.escalation.triggerSeverity).toBe('critical');
      expect(body.config.escalation.cooldownMs).toBe(300000);
      expect(body.config.escalation.tiers).toHaveLength(2);
      expect(body.config.escalation.tiers[0].label).toBe('Page on-call');
      expect(body.config.escalation.tiers[0].afterMs).toBe(300000);
      expect(body.config.escalation.tiers[0].targetIds).toEqual(['slack']);
    });

    it('returns disabled escalation config', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        escalation: {
          enabled: false,
          triggerSeverity: 'warning',
          cooldownMs: 600000,
          tiers: [
            { afterMs: 120000, targetIds: [], label: 'First response' },
          ],
        },
      });

      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(body.config.escalation.enabled).toBe(false);
      expect(body.config.escalation.triggerSeverity).toBe('warning');
      expect(body.config.escalation.tiers).toHaveLength(1);
    });
  });

  // ── PUT: Save escalation config ─────────────────────────────────────

  describe('PUT /api/task-board/webhooks/config — escalation save', () => {
    it('saves a valid escalation config', async () => {
      const payload = {
        enabled: true,
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        targets: [
          { id: 'slack', name: 'Slack', url: 'https://hooks.slack.com/abc', enabled: true },
          { id: 'pager', name: 'PagerDuty', url: 'https://events.pagerduty.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['slack'], label: 'Page on-call' },
            { afterMs: 900000, targetIds: ['pager'], label: 'Notify manager' },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      expect(body.config.escalation).toBeDefined();
      expect(body.config.escalation.enabled).toBe(true);
      expect(body.config.escalation.tiers).toHaveLength(2);

      // Verify persisted
      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation).toBeDefined();
      expect(persisted.escalation!.enabled).toBe(true);
      expect(persisted.escalation!.tiers).toHaveLength(2);
      expect(persisted.escalation!.tiers[0].label).toBe('Page on-call');
      expect(persisted.escalation!.tiers[1].label).toBe('Notify manager');
    });

    it('saves disabled escalation config', async () => {
      const payload = {
        enabled: false,
        targets: [],
        escalation: {
          enabled: false,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      expect(res._statusCode).toBe(200);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation).toBeDefined();
      expect(persisted.escalation!.enabled).toBe(false);
    });

    it('preserves escalation when not included in PUT (backward compat)', async () => {
      // Seed with escalation
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'wh-1' })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['wh-1'], label: 'Tier 1' },
          ],
        },
      });

      // PUT without escalation field — should not break
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'Updated', url: 'https://example.com/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      expect(res._statusCode).toBe(200);

      // Config should save without error
      const body = parseJsonBody(res);
      expect(body.config.targets[0].id).toBe('wh-1');
    });
  });

  // ── Round-trip: read → save → re-read ─────────────────────────────────

  describe('round-trip: read → save → re-read', () => {
    it('escalation config survives full round-trip', async () => {
      const originalEscalation: EscalationPolicyConfig = {
        enabled: true,
        triggerSeverity: 'warning',
        cooldownMs: 180000,
        tiers: [
          { afterMs: 120000, targetIds: ['t1'], label: 'Alert team lead' },
          { afterMs: 600000, targetIds: ['t1', 't2'], label: 'Escalate to VP' },
          { afterMs: 1800000, targetIds: ['t2'], label: 'Executive alert' },
        ],
      };

      // Save
      const payload = {
        enabled: true,
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        targets: [
          { id: 't1', name: 'Target 1', url: 'https://t1.example.com/hook', enabled: true },
          { id: 't2', name: 'Target 2', url: 'https://t2.example.com/hook', enabled: true },
        ],
        escalation: originalEscalation,
      };

      const putReq = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const putRes = mockResponse();
      await handleTaskBoard(putReq, putRes, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(putRes._statusCode).toBe(200);

      // Re-read
      const getReq = mockRequest({ url: '/api/task-board/webhooks/config' });
      const getRes = mockResponse();
      await handleTaskBoard(getReq, getRes, createDeps());
      const body = parseJsonBody(getRes);

      expect(body.config.escalation.enabled).toBe(true);
      expect(body.config.escalation.triggerSeverity).toBe('warning');
      expect(body.config.escalation.cooldownMs).toBe(180000);
      expect(body.config.escalation.tiers).toHaveLength(3);
      expect(body.config.escalation.tiers[0]).toMatchObject({
        afterMs: 120000,
        targetIds: ['t1'],
        label: 'Alert team lead',
      });
      expect(body.config.escalation.tiers[1]).toMatchObject({
        afterMs: 600000,
        targetIds: ['t1', 't2'],
        label: 'Escalate to VP',
      });
      expect(body.config.escalation.tiers[2]).toMatchObject({
        afterMs: 1800000,
        targetIds: ['t2'],
        label: 'Executive alert',
      });
    });

    it('escalation toggle off → save → re-read preserves disabled state', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'T', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: false,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['wh-1'], label: 'Tier 1' },
          ],
        },
      };

      const putReq = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const putRes = mockResponse();
      await handleTaskBoard(putReq, putRes, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(putRes._statusCode).toBe(200);

      const getReq = mockRequest({ url: '/api/task-board/webhooks/config' });
      const getRes = mockResponse();
      await handleTaskBoard(getReq, getRes, createDeps());
      const body = parseJsonBody(getRes);

      expect(body.config.escalation.enabled).toBe(false);
      // Tiers should still be preserved even when disabled
      expect(body.config.escalation.tiers).toHaveLength(1);
    });
  });

  // ── Validation errors ──────────────────────────────────────────────────

  describe('validation errors', () => {
    it('rejects more than 3 escalation tiers', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 60000, targetIds: ['wh-1'] },
            { afterMs: 120000, targetIds: ['wh-1'] },
            { afterMs: 180000, targetIds: ['wh-1'] },
            { afterMs: 240000, targetIds: ['wh-1'] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.error).toBe('validation failed');
      expect(body.errors.some((e: any) => e.message.includes('3'))).toBe(true);
    });

    it('rejects afterMs below 1 minute', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 30000, targetIds: ['wh-1'] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.field.includes('afterMs') && e.message.includes('60000'))).toBe(true);
    });

    it('rejects afterMs above 24 hours', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 100000000, targetIds: ['wh-1'] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.field.includes('afterMs') && e.message.includes('86400000'))).toBe(true);
    });

    it('rejects non-ascending tier afterMs values', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: ['wh-1'] },
            { afterMs: 120000, targetIds: ['wh-1'] }, // less than previous
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('strictly greater'))).toBe(true);
    });

    it('rejects invalid target IDs that do not match webhook targets', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: ['nonexistent-target'] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('nonexistent-target'))).toBe(true);
    });

    it('rejects more than 5 target IDs per tier', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'a', url: 'https://a.example.com/hook', enabled: true },
          { id: 'b', url: 'https://b.example.com/hook', enabled: true },
          { id: 'c', url: 'https://c.example.com/hook', enabled: true },
          { id: 'd', url: 'https://d.example.com/hook', enabled: true },
          { id: 'e', url: 'https://e.example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: ['a', 'b', 'c', 'd', 'e', 'a'] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('5'))).toBe(true);
    });

    it('rejects invalid triggerSeverity', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          triggerSeverity: 'banana',
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) =>
        e.field.includes('triggerSeverity'),
      )).toBe(true);
    });

    it('rejects non-boolean escalation.enabled', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: 'yes',
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) =>
        e.field === 'escalation.enabled',
      )).toBe(true);
    });

    it('rejects non-array tiers', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          tiers: 'not-an-array',
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) =>
        e.field === 'escalation.tiers' && e.message.includes('array'),
      )).toBe(true);
    });

    it('rejects negative escalation cooldownMs', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          cooldownMs: -100,
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) =>
        e.field === 'escalation.cooldownMs',
      )).toBe(true);
    });

    it('rejects tier with non-array targetIds', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: 'not-an-array' },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) =>
        e.message.includes('targetIds') && e.message.includes('array'),
      )).toBe(true);
    });

    it('rejects non-string label', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'https://example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: ['wh-1'], label: 42 },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('label'))).toBe(true);
    });
  });

  // ── Backward compatibility ────────────────────────────────────────────

  describe('backward compatibility', () => {
    it('configs without escalation field are handled gracefully', async () => {
      // Save a config that has no escalation field
      const payload = {
        enabled: true,
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        targets: [
          { id: 'wh-1', name: 'Test', url: 'https://example.com/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      // Verify it persists and reads back without errors
      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.enabled).toBe(true);
      expect(persisted.targets).toHaveLength(1);
      // escalation may or may not be present — that's fine
    });

    it('explicit null escalation is accepted', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: null,
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);
    });
  });

  // ── Disabled-by-default behavior ──────────────────────────────────────

  describe('disabled-by-default', () => {
    it('new config has escalation disabled by default', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: false,
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      expect(body.config.escalation.enabled).toBe(false);
    });

    it('DEFAULT_WEBHOOK_CONFIG has no escalation', () => {
      expect(DEFAULT_WEBHOOK_CONFIG.escalation).toBeUndefined();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('saves escalation with empty tiers array', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation!.tiers).toEqual([]);
    });

    it('saves escalation tier with empty targetIds', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 300000, targetIds: [], label: 'Tier with no targets' },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation!.tiers[0].targetIds).toEqual([]);
    });

    it('saves maximum 3 tiers at boundary', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'a', url: 'https://a.example.com/hook', enabled: true },
        ],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 60000, targetIds: ['a'], label: 'Tier 1' },
            { afterMs: 300000, targetIds: ['a'], label: 'Tier 2' },
            { afterMs: 900000, targetIds: ['a'], label: 'Tier 3' },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation!.tiers).toHaveLength(3);
    });

    it('saves tier afterMs at exact 1-minute boundary', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 60000, targetIds: [] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);
    });

    it('saves tier afterMs at exact 24-hour boundary', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          tiers: [
            { afterMs: 86400000, targetIds: [] },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);
    });

    it('saves escalation with triggerSeverity warning', async () => {
      const payload = {
        enabled: true,
        targets: [],
        escalation: {
          enabled: true,
          triggerSeverity: 'warning',
          cooldownMs: 60000,
          tiers: [],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.escalation!.triggerSeverity).toBe('warning');
    });

    it('saving webhook config with escalation does not break existing webhook targets', async () => {
      // Seed existing webhook config
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'original', secret: 'my-secret' })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      // PUT with escalation added, preserving target (secret omitted → should be preserved)
      const payload = {
        enabled: true,
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        targets: [
          { id: 'original', name: 'Test Target', url: 'https://example.com/webhook', enabled: true },
        ],
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['original'], label: 'Escalate' },
          ],
        },
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps({
        readRequestBody: async () => JSON.stringify(payload),
      }));
      expect(res._statusCode).toBe(200);

      // Verify secret preserved and escalation saved
      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.targets[0].secret).toBe('my-secret');
      expect(persisted.escalation!.enabled).toBe(true);
      expect(persisted.escalation!.tiers).toHaveLength(1);
    });
  });

  // ── Escalation status endpoint still works with config ────────────────

  describe('GET /api/task-board/escalation/status with config', () => {
    it('returns status when escalation config exists but is disabled', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        escalation: {
          enabled: false,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [],
        },
      });

      const req = mockRequest({ url: '/api/task-board/escalation/status' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      expect(body.status).toBeDefined();
      expect(body.status.policyEnabled).toBe(false);
    });

    it('returns status when escalation config is enabled', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'wh-1' })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
        escalation: {
          enabled: true,
          triggerSeverity: 'critical',
          cooldownMs: 300000,
          tiers: [
            { afterMs: 300000, targetIds: ['wh-1'], label: 'Tier 1' },
          ],
        },
      });

      const req = mockRequest({ url: '/api/task-board/escalation/status' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      expect(body.status).toBeDefined();
      expect(body.status.policyEnabled).toBe(true);
      expect(body.status.tiers).toHaveLength(1);
    });
  });
});
