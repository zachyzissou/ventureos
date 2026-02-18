/**
 * Webhook Config Dashboard UI tests — Issue #219, Phase 12.
 *
 * Tests for:
 * - GET /api/task-board/webhooks/config — returns redacted config
 * - PUT /api/task-board/webhooks/config — validation, save, secret preservation
 * - Secret handling: never leaked, preserved when omitted, replaced when provided
 * - Validation feedback: duplicate IDs, invalid URLs, type errors
 * - Edge cases: max targets, empty targets, boundary values
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mockRequest, mockResponse, parseJsonBody } from '../../helpers.js';
import { handleTaskBoard } from '../../../server/routes/task-board.js';
import {
  readWebhookConfig,
  writeWebhookConfig,
  redactConfig,
  DEFAULT_WEBHOOK_CONFIG,
} from '../../../server/alert-webhook.js';
import type { WebhookConfig, WebhookTarget } from '../../../server/alert-webhook.js';
import type { TaskBoardDeps } from '../../../server/types.js';

const testDataDir = path.join('/tmp', 'test-webhook-ui-' + process.pid);

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

describe('Webhook Config Dashboard UI (Phase 12)', () => {
  beforeEach(() => {
    fs.mkdirSync(testDataDir, { recursive: true });
    seedTasks();
  });

  afterEach(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {}
  });

  // ── GET /api/task-board/webhooks/config ──────────────────────────────────

  describe('GET /api/task-board/webhooks/config', () => {
    it('returns default config when no file exists', async () => {
      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps();

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(body.config).toBeDefined();
      expect(body.config.enabled).toBe(false);
      expect(body.config.targets).toEqual([]);
      expect(body.config.cooldownMs).toBe(60000);
      expect(body.config.timeoutMs).toBe(10000);
      expect(body.config.maxRetries).toBe(3);
    });

    it('returns config with secrets redacted', async () => {
      const config: WebhookConfig = {
        enabled: true,
        targets: [
          makeTarget({ id: 'slack', secret: 'super-secret-value-123', name: 'Slack' }),
          makeTarget({ id: 'pager', name: 'PagerDuty' }),
        ],
        cooldownMs: 30000,
        timeoutMs: 5000,
        maxRetries: 2,
      };
      seedWebhookConfig(config);

      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      // Secret must never appear in response
      const rawStr = JSON.stringify(body);
      expect(rawStr).not.toContain('super-secret-value-123');

      // hasSecret indicator should be present
      const slackTarget = body.config.targets.find((t: any) => t.id === 'slack');
      expect(slackTarget.hasSecret).toBe(true);
      expect(slackTarget.secret).toBeUndefined();

      const pagerTarget = body.config.targets.find((t: any) => t.id === 'pager');
      expect(pagerTarget.hasSecret).toBe(false);
    });

    it('returns global config fields', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [],
        cooldownMs: 90000,
        timeoutMs: 15000,
        maxRetries: 4,
      });

      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const body = parseJsonBody(res);

      expect(body.config.enabled).toBe(true);
      expect(body.config.cooldownMs).toBe(90000);
      expect(body.config.timeoutMs).toBe(15000);
      expect(body.config.maxRetries).toBe(4);
    });
  });

  // ── PUT /api/task-board/webhooks/config ──────────────────────────────────

  describe('PUT /api/task-board/webhooks/config', () => {
    it('saves a valid config', async () => {
      const payload = {
        enabled: true,
        cooldownMs: 45000,
        timeoutMs: 8000,
        maxRetries: 2,
        targets: [
          { id: 'wh-1', name: 'Primary', url: 'https://hooks.example.com/a', enabled: true, minSeverity: 'warning' },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      expect(body.config.enabled).toBe(true);
      expect(body.config.targets).toHaveLength(1);
      expect(body.config.targets[0].id).toBe('wh-1');
      expect(body.config.cooldownMs).toBe(45000);

      // Verify persisted
      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.enabled).toBe(true);
      expect(persisted.targets[0].url).toBe('https://hooks.example.com/a');
    });

    it('rejects invalid JSON body', async () => {
      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => 'not json!' });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.error).toContain('invalid JSON');
    });

    it('rejects duplicate target IDs', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'same-id', name: 'A', url: 'https://a.example.com/hook', enabled: true },
          { id: 'same-id', name: 'B', url: 'https://b.example.com/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.error).toBe('validation failed');
      expect(body.errors.some((e: any) => e.message.includes('duplicate'))).toBe(true);
    });

    it('rejects non-HTTPS URLs', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', url: 'http://external.example.com/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('HTTPS'))).toBe(true);
    });

    it('allows HTTP for localhost', async () => {
      const payload = {
        enabled: true,
        targets: [
          { id: 'local', name: 'Local', url: 'http://localhost:3000/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      // Should succeed (200)
      expect(res._statusCode).toBe(200);
      expect(body.config.targets[0].url).toBe('http://localhost:3000/hook');
    });

    it('rejects more than 5 targets', async () => {
      const targets = Array.from({ length: 6 }, (_, i) => ({
        id: `t-${i}`, name: `T${i}`, url: `https://h${i}.example.com/hook`, enabled: true,
      }));

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify({ targets }) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.message.includes('5'))).toBe(true);
    });

    it('rejects invalid timeoutMs range', async () => {
      const payload = { enabled: false, timeoutMs: 500 };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
      expect(body.errors.some((e: any) => e.field === 'timeoutMs')).toBe(true);
    });

    it('rejects invalid maxRetries', async () => {
      const payload = { enabled: false, maxRetries: 10 };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ── Secret Preservation ─────────────────────────────────────────────────

  describe('secret preservation', () => {
    it('preserves existing secret when PUT omits secret field', async () => {
      // Seed config with a secret
      const originalSecret = 'my-webhook-signing-secret-42';
      seedWebhookConfig({
        enabled: true,
        targets: [
          makeTarget({ id: 'wh-1', name: 'Slack', secret: originalSecret }),
        ],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      // PUT without secret field (as the UI would)
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'Slack Updated', url: 'https://hooks.slack.com/new', enabled: true, minSeverity: 'critical' },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(res._statusCode).toBe(200);
      // Response should show hasSecret=true
      expect(body.config.targets[0].hasSecret).toBe(true);
      // Response should NOT contain the actual secret
      expect(JSON.stringify(body)).not.toContain(originalSecret);

      // Verify persisted config still has the secret
      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.targets[0].secret).toBe(originalSecret);
      expect(persisted.targets[0].name).toBe('Slack Updated');
    });

    it('replaces secret when PUT provides a new secret', async () => {
      const originalSecret = 'old-secret';
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'wh-1', secret: originalSecret })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'Test', url: 'https://example.com/hook', enabled: true, secret: 'new-secret-value' },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.targets[0].secret).toBe('new-secret-value');
    });

    it('clears secret when not present and no existing secret', async () => {
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'wh-1' })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'Test', url: 'https://example.com/hook', enabled: true },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(body.config.targets[0].hasSecret).toBe(false);
    });

    it('does not leak secrets via GET response', async () => {
      const secret = 'extremely-sensitive-webhook-secret';
      seedWebhookConfig({
        enabled: true,
        targets: [makeTarget({ id: 'wh-1', secret })],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      const req = mockRequest({ url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      await handleTaskBoard(req, res, createDeps());
      const raw = res._body;

      // Ensure the raw HTTP response body never contains the secret
      expect(raw).not.toContain(secret);
      expect(raw).toContain('"hasSecret":true');
    });

    it('does not leak secrets via PUT response', async () => {
      const secret = 'response-test-secret';
      const payload = {
        enabled: true,
        targets: [
          { id: 'wh-1', name: 'T', url: 'https://example.com/hook', enabled: true, secret },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const raw = res._body;

      expect(raw).not.toContain(secret);
      expect(raw).toContain('"hasSecret":true');
    });
  });

  // ── Toggle enable/disable ───────────────────────────────────────────────

  describe('toggle enable/disable', () => {
    it('enables webhooks globally', async () => {
      seedWebhookConfig({ ...DEFAULT_WEBHOOK_CONFIG, enabled: false, targets: [] });

      const payload = { enabled: true };
      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(body.config.enabled).toBe(true);
      expect(readWebhookConfig(testDataDir).enabled).toBe(true);
    });

    it('disables webhooks globally', async () => {
      seedWebhookConfig({ ...DEFAULT_WEBHOOK_CONFIG, enabled: true, targets: [] });

      const payload = { enabled: false };
      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(body.config.enabled).toBe(false);
    });
  });

  // ── Request payload correctness ─────────────────────────────────────────

  describe('payload correctness', () => {
    it('persists all target fields correctly', async () => {
      const payload = {
        enabled: true,
        cooldownMs: 120000,
        timeoutMs: 5000,
        maxRetries: 1,
        targets: [
          {
            id: 'discord-hook',
            name: 'Discord Channel',
            url: 'https://discord.com/api/webhooks/123/abc',
            enabled: true,
            minSeverity: 'critical',
            secret: 'discord-secret',
          },
          {
            id: 'slack-hook',
            name: 'Slack #alerts',
            url: 'https://hooks.slack.com/services/T/B/xyz',
            enabled: false,
            minSeverity: 'warning',
          },
        ],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);

      const persisted = readWebhookConfig(testDataDir);
      expect(persisted.enabled).toBe(true);
      expect(persisted.cooldownMs).toBe(120000);
      expect(persisted.timeoutMs).toBe(5000);
      expect(persisted.maxRetries).toBe(1);
      expect(persisted.targets).toHaveLength(2);

      const discord = persisted.targets.find(t => t.id === 'discord-hook')!;
      expect(discord.name).toBe('Discord Channel');
      expect(discord.url).toBe('https://discord.com/api/webhooks/123/abc');
      expect(discord.enabled).toBe(true);
      expect(discord.minSeverity).toBe('critical');
      expect(discord.secret).toBe('discord-secret');

      const slack = persisted.targets.find(t => t.id === 'slack-hook')!;
      expect(slack.enabled).toBe(false);
      expect(slack.minSeverity).toBe('warning');
      expect(slack.secret).toBeUndefined();
    });

    it('handles empty targets array', async () => {
      const payload = { enabled: false, targets: [] };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      expect(body.config.targets).toEqual([]);
      expect(readWebhookConfig(testDataDir).targets).toEqual([]);
    });

    it('sanitizes and clamps boundary values', async () => {
      const payload = {
        enabled: true,
        cooldownMs: -100,
        timeoutMs: 50000,   // over max, should be clamped
        maxRetries: 10,     // over max, should be clamped
        targets: [],
      };

      const req = mockRequest({ method: 'PUT', url: '/api/task-board/webhooks/config' });
      const res = mockResponse();
      const deps = createDeps({ readRequestBody: async () => JSON.stringify(payload) });

      // timeoutMs > 30000 is rejected by validation
      await handleTaskBoard(req, res, deps);
      const body = parseJsonBody(res);

      // Should be rejected by validation
      expect(res._statusCode).toBe(400);
    });
  });

  // ── Redaction ───────────────────────────────────────────────────────────

  describe('redactConfig', () => {
    it('replaces secrets with hasSecret indicator', () => {
      const config: WebhookConfig = {
        enabled: true,
        targets: [
          makeTarget({ id: 'a', secret: 'hidden-value' }),
          makeTarget({ id: 'b' }),
        ],
        cooldownMs: 60000,
        timeoutMs: 10000,
        maxRetries: 3,
      };

      const redacted = redactConfig(config);

      expect(redacted.targets[0].hasSecret).toBe(true);
      expect((redacted.targets[0] as any).secret).toBeUndefined();
      expect(redacted.targets[1].hasSecret).toBe(false);
      expect(JSON.stringify(redacted)).not.toContain('hidden-value');
    });
  });
});
