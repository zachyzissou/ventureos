/**
 * Webhook Provider Formatters tests — Issue #219, Phase 18.
 *
 * Tests for:
 * - formatGeneric() — backward-compatible raw JSON output
 * - formatSlack() — Slack Block Kit output for alerts + test pings
 * - formatDiscord() — Discord Embed output for alerts + test pings
 * - getFormatter() / formatPayload() — dispatcher + fallback behavior
 * - isValidProvider() — provider string validation
 * - ALLOWED_PROVIDERS — registry completeness
 * - Provider field in WebhookTarget — sanitize, validate, redact round-trip
 * - Delivery with provider — correct formatting applied during HTTP delivery
 * - No regression in existing webhook delivery paths (generic default)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  formatGeneric,
  formatSlack,
  formatDiscord,
  formatPayload,
  getFormatter,
  isValidProvider,
  ALLOWED_PROVIDERS,
} from '../../../server/webhook-formatters.js';
import type {
  WebhookProvider,
  FormattedPayload,
} from '../../../server/webhook-formatters.js';

import {
  buildWebhookPayload,
  buildTestPayload,
  validateWebhookConfig,
  sanitizeConfig,
  redactConfig,
  readWebhookConfig,
  writeWebhookConfig,
  deliverWebhook,
  deliverTestWebhook,
  resetDeliveryState,
  computeSignature,
} from '../../../server/alert-webhook.js';
import type {
  WebhookPayload,
  WebhookTestPayload,
  WebhookTarget,
  WebhookConfig,
} from '../../../server/alert-webhook.js';

import {
  evaluateAlerts,
  DEFAULT_ALERT_CONFIG,
} from '../../../server/alert-rules.js';
import type {
  AlertEvaluation,
  AlertSeverity,
} from '../../../server/alert-rules.js';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const testDataDir = path.join('/tmp', 'test-webhook-fmt-' + process.pid);

function makeSampleEvaluation(overrides: Partial<AlertEvaluation> = {}): AlertEvaluation {
  return {
    evaluatedAt: 1700000000000,
    overallSeverity: 'warning',
    severityCounts: { ok: 1, warning: 1, critical: 0 },
    rules: [
      {
        rule: 'stuckTaskCount',
        label: 'Stuck Tasks',
        enabled: true,
        severity: 'warning',
        currentValue: 3,
        warningThreshold: 2,
        criticalThreshold: 5,
        message: '3 stuck tasks (threshold: 2)',
      },
      {
        rule: 'failureRate',
        label: 'Failure Rate',
        enabled: true,
        severity: 'ok',
        currentValue: 0.05,
        warningThreshold: 0.2,
        criticalThreshold: 0.5,
        message: '5.0% failure rate (threshold: 20%)',
      },
    ],
    ...overrides,
  };
}

function makeSamplePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return buildWebhookPayload(makeSampleEvaluation(), 'ok');
}

function makeSampleTarget(overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    id: 'test-target',
    name: 'Test Target',
    url: 'https://hooks.example.com/webhook',
    enabled: true,
    ...overrides,
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeEach(() => {
  resetDeliveryState();
  fs.mkdirSync(testDataDir, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ─── isValidProvider ─────────────────────────────────────────────────────────

describe('isValidProvider', () => {
  it('accepts all allowed providers', () => {
    expect(isValidProvider('generic')).toBe(true);
    expect(isValidProvider('slack')).toBe(true);
    expect(isValidProvider('discord')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isValidProvider('teams')).toBe(false);
    expect(isValidProvider('pagerduty')).toBe(false);
    expect(isValidProvider('')).toBe(false);
    expect(isValidProvider('SLACK')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidProvider(undefined)).toBe(false);
    expect(isValidProvider(null)).toBe(false);
    expect(isValidProvider(42)).toBe(false);
    expect(isValidProvider(true)).toBe(false);
    expect(isValidProvider({})).toBe(false);
  });
});

describe('ALLOWED_PROVIDERS', () => {
  it('contains generic, slack, and discord', () => {
    expect(ALLOWED_PROVIDERS).toContain('generic');
    expect(ALLOWED_PROVIDERS).toContain('slack');
    expect(ALLOWED_PROVIDERS).toContain('discord');
  });

  it('is readonly (immutable at compile time)', () => {
    // `as const` produces a readonly tuple — verified by TypeScript.
    // Runtime check: the array has the expected length and values.
    expect(ALLOWED_PROVIDERS.length).toBe(3);
    expect([...ALLOWED_PROVIDERS]).toEqual(['generic', 'slack', 'discord']);
  });
});

// ─── formatGeneric ───────────────────────────────────────────────────────────

describe('formatGeneric', () => {
  it('produces a JSON body identical to JSON.stringify(payload)', () => {
    const payload = makeSamplePayload();
    const result = formatGeneric(payload);
    expect(result.body).toBe(JSON.stringify(payload));
  });

  it('sets Content-Type to application/json', () => {
    const result = formatGeneric(makeSamplePayload());
    expect(result.contentType).toBe('application/json');
  });

  it('has no extra headers', () => {
    const result = formatGeneric(makeSamplePayload());
    expect(result.extraHeaders).toEqual({});
  });

  it('works with test payloads', () => {
    const testPayload = buildTestPayload(1700000000000);
    const result = formatGeneric(testPayload);
    const parsed = JSON.parse(result.body);
    expect(parsed.event).toBe('webhook.test');
    expect(parsed.test).toBe(true);
  });

  it('preserves all payload fields (schema fidelity)', () => {
    const payload = makeSamplePayload();
    const result = formatGeneric(payload);
    const parsed = JSON.parse(result.body);
    expect(parsed.event).toBe('alert.transition');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.source).toBe('ventureos-dashboard');
    expect(parsed.evaluation.rules).toHaveLength(2);
  });
});

// ─── formatSlack ─────────────────────────────────────────────────────────────

describe('formatSlack', () => {
  describe('alert payloads', () => {
    it('produces valid Slack Block Kit payload', () => {
      const payload = makeSamplePayload();
      const result = formatSlack(payload);
      const parsed = JSON.parse(result.body);

      // Slack requires `text` fallback
      expect(typeof parsed.text).toBe('string');
      expect(parsed.text.length).toBeGreaterThan(0);

      // Must have blocks array
      expect(Array.isArray(parsed.blocks)).toBe(true);
      expect(parsed.blocks.length).toBeGreaterThan(0);
    });

    it('includes header block', () => {
      const result = formatSlack(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const header = parsed.blocks.find((b: any) => b.type === 'header');
      expect(header).toBeDefined();
      expect(header.text.type).toBe('plain_text');
      expect(header.text.text).toContain('VentureOS');
    });

    it('includes severity emoji in text fallback', () => {
      // warning severity
      const warningPayload = buildWebhookPayload(
        makeSampleEvaluation({ overallSeverity: 'warning' }),
        'ok',
      );
      const warningResult = formatSlack(warningPayload);
      const warningParsed = JSON.parse(warningResult.body);
      expect(warningParsed.text).toContain('⚠️');

      // critical severity
      const critPayload = buildWebhookPayload(
        makeSampleEvaluation({ overallSeverity: 'critical' }),
        'warning',
      );
      const critResult = formatSlack(critPayload);
      const critParsed = JSON.parse(critResult.body);
      expect(critParsed.text).toContain('🔴');
    });

    it('includes rule details in section blocks', () => {
      const result = formatSlack(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const bodyText = JSON.stringify(parsed);
      expect(bodyText).toContain('Stuck Tasks');
    });

    it('includes color attachment for severity bar', () => {
      const result = formatSlack(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      expect(Array.isArray(parsed.attachments)).toBe(true);
      expect(parsed.attachments[0]).toHaveProperty('color');
    });

    it('includes section fields with previous/current severity', () => {
      const payload = makeSamplePayload();
      const result = formatSlack(payload);
      const parsed = JSON.parse(result.body);
      const sectionWithFields = parsed.blocks.find((b: any) => b.fields);
      expect(sectionWithFields).toBeDefined();
      const fieldTexts = sectionWithFields.fields.map((f: any) => f.text);
      expect(fieldTexts.some((t: string) => t.includes('Previous'))).toBe(true);
      expect(fieldTexts.some((t: string) => t.includes('Current'))).toBe(true);
    });

    it('sets Content-Type to application/json', () => {
      const result = formatSlack(makeSamplePayload());
      expect(result.contentType).toBe('application/json');
    });
  });

  describe('test payloads', () => {
    it('produces valid Slack Block Kit for test pings', () => {
      const testPayload = buildTestPayload(1700000000000);
      const result = formatSlack(testPayload);
      const parsed = JSON.parse(result.body);

      expect(typeof parsed.text).toBe('string');
      expect(parsed.text).toContain('Test');
      expect(Array.isArray(parsed.blocks)).toBe(true);
    });

    it('includes the test message text', () => {
      const testPayload = buildTestPayload();
      const result = formatSlack(testPayload);
      const parsed = JSON.parse(result.body);
      const bodyStr = JSON.stringify(parsed);
      expect(bodyStr).toContain(testPayload.message);
    });
  });
});

// ─── formatDiscord ───────────────────────────────────────────────────────────

describe('formatDiscord', () => {
  describe('alert payloads', () => {
    it('produces valid Discord embed payload', () => {
      const payload = makeSamplePayload();
      const result = formatDiscord(payload);
      const parsed = JSON.parse(result.body);

      // Discord requires content or embeds
      expect(typeof parsed.content).toBe('string');
      expect(Array.isArray(parsed.embeds)).toBe(true);
      expect(parsed.embeds.length).toBeGreaterThan(0);
    });

    it('embed has title, description, color, and fields', () => {
      const result = formatDiscord(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const embed = parsed.embeds[0];

      expect(typeof embed.title).toBe('string');
      expect(typeof embed.description).toBe('string');
      expect(typeof embed.color).toBe('number');
      expect(Array.isArray(embed.fields)).toBe(true);
    });

    it('uses correct color for severity', () => {
      // warning → amber (0xf2c744)
      const warningPayload = buildWebhookPayload(
        makeSampleEvaluation({ overallSeverity: 'warning' }),
        'ok',
      );
      const warningResult = formatDiscord(warningPayload);
      const warningParsed = JSON.parse(warningResult.body);
      expect(warningParsed.embeds[0].color).toBe(0xf2c744);

      // critical → red (0xe01e5a)
      const critPayload = buildWebhookPayload(
        makeSampleEvaluation({ overallSeverity: 'critical' }),
        'warning',
      );
      const critResult = formatDiscord(critPayload);
      const critParsed = JSON.parse(critResult.body);
      expect(critParsed.embeds[0].color).toBe(0xe01e5a);
    });

    it('includes previous/current severity fields', () => {
      const result = formatDiscord(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const fieldNames = parsed.embeds[0].fields.map((f: any) => f.name);
      expect(fieldNames).toContain('Previous Severity');
      expect(fieldNames).toContain('Current Severity');
      expect(fieldNames).toContain('Timestamp');
    });

    it('includes rule fields for enabled rules', () => {
      const result = formatDiscord(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const fieldNames = parsed.embeds[0].fields.map((f: any) => f.name);
      expect(fieldNames.some((n: string) => n.includes('Stuck Tasks'))).toBe(true);
    });

    it('includes footer and timestamp', () => {
      const result = formatDiscord(makeSamplePayload());
      const parsed = JSON.parse(result.body);
      const embed = parsed.embeds[0];
      expect(embed.footer).toBeDefined();
      expect(embed.footer.text).toContain('VentureOS');
      expect(typeof embed.timestamp).toBe('string');
    });

    it('caps rule fields at 25 (Discord limit)', () => {
      // Create an evaluation with >25 rules
      const manyRules = Array.from({ length: 30 }, (_, i) => ({
        rule: `rule_${i}`,
        label: `Rule ${i}`,
        enabled: true,
        severity: 'ok' as AlertSeverity,
        currentValue: i,
        warningThreshold: 50,
        criticalThreshold: 100,
        message: `Rule ${i} message`,
      }));
      const eval30 = makeSampleEvaluation({ rules: manyRules });
      const payload = buildWebhookPayload(eval30, 'ok');
      const result = formatDiscord(payload);
      const parsed = JSON.parse(result.body);
      // 3 fixed fields + max 25 rule fields = 28
      expect(parsed.embeds[0].fields.length).toBeLessThanOrEqual(28);
    });

    it('sets Content-Type to application/json', () => {
      const result = formatDiscord(makeSamplePayload());
      expect(result.contentType).toBe('application/json');
    });
  });

  describe('test payloads', () => {
    it('produces valid Discord embed for test pings', () => {
      const testPayload = buildTestPayload(1700000000000);
      const result = formatDiscord(testPayload);
      const parsed = JSON.parse(result.body);

      expect(typeof parsed.content).toBe('string');
      expect(parsed.content).toContain('Test');
      expect(Array.isArray(parsed.embeds)).toBe(true);
      expect(parsed.embeds[0].color).toBe(0x3b82f6); // blue for test
    });

    it('includes the test message in embed description', () => {
      const testPayload = buildTestPayload();
      const result = formatDiscord(testPayload);
      const parsed = JSON.parse(result.body);
      expect(parsed.embeds[0].description).toBe(testPayload.message);
    });
  });
});

// ─── getFormatter / formatPayload ────────────────────────────────────────────

describe('getFormatter', () => {
  it('returns generic formatter for undefined provider', () => {
    const formatter = getFormatter(undefined);
    const result = formatter(makeSamplePayload());
    // Generic output is raw JSON.stringify
    expect(result.body).toBe(JSON.stringify(makeSamplePayload()));
  });

  it('returns generic formatter for "generic" provider', () => {
    const formatter = getFormatter('generic');
    const result = formatter(makeSamplePayload());
    expect(result.body).toBe(JSON.stringify(makeSamplePayload()));
  });

  it('returns slack formatter for "slack" provider', () => {
    const formatter = getFormatter('slack');
    const result = formatter(makeSamplePayload());
    const parsed = JSON.parse(result.body);
    expect(parsed).toHaveProperty('blocks');
    expect(parsed).toHaveProperty('text');
  });

  it('returns discord formatter for "discord" provider', () => {
    const formatter = getFormatter('discord');
    const result = formatter(makeSamplePayload());
    const parsed = JSON.parse(result.body);
    expect(parsed).toHaveProperty('embeds');
    expect(parsed).toHaveProperty('content');
  });
});

describe('formatPayload', () => {
  it('falls back to generic when provider is undefined', () => {
    const payload = makeSamplePayload();
    const result = formatPayload(payload);
    expect(result.body).toBe(JSON.stringify(payload));
  });

  it('falls back to generic when provider is "generic"', () => {
    const payload = makeSamplePayload();
    const result = formatPayload(payload, 'generic');
    expect(result.body).toBe(JSON.stringify(payload));
  });

  it('formats for slack when provider is "slack"', () => {
    const result = formatPayload(makeSamplePayload(), 'slack');
    const parsed = JSON.parse(result.body);
    expect(parsed).toHaveProperty('blocks');
  });

  it('formats for discord when provider is "discord"', () => {
    const result = formatPayload(makeSamplePayload(), 'discord');
    const parsed = JSON.parse(result.body);
    expect(parsed).toHaveProperty('embeds');
  });
});

// ─── Provider in WebhookTarget validation ────────────────────────────────────

describe('validateWebhookConfig — provider field', () => {
  it('accepts valid providers', () => {
    for (const provider of ALLOWED_PROVIDERS) {
      const errors = validateWebhookConfig({
        enabled: true,
        targets: [
          { id: 'a', url: 'https://example.com', name: 'A', enabled: true, provider },
        ],
      });
      expect(errors.filter((e) => e.field.includes('provider'))).toHaveLength(0);
    }
  });

  it('rejects invalid provider string', () => {
    const errors = validateWebhookConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true, provider: 'teams' },
      ],
    });
    const providerErrors = errors.filter((e) => e.field.includes('provider'));
    expect(providerErrors.length).toBe(1);
    expect(providerErrors[0].message).toContain('generic');
    expect(providerErrors[0].message).toContain('slack');
    expect(providerErrors[0].message).toContain('discord');
  });

  it('accepts missing provider (optional)', () => {
    const errors = validateWebhookConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true },
      ],
    });
    expect(errors.filter((e) => e.field.includes('provider'))).toHaveLength(0);
  });

  it('rejects non-string provider', () => {
    const errors = validateWebhookConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true, provider: 42 },
      ],
    });
    expect(errors.filter((e) => e.field.includes('provider')).length).toBe(1);
  });
});

// ─── Provider in sanitizeConfig ──────────────────────────────────────────────

describe('sanitizeConfig — provider field', () => {
  it('preserves valid provider values', () => {
    const config = sanitizeConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true, provider: 'slack' },
        { id: 'b', url: 'https://example.com', name: 'B', enabled: true, provider: 'discord' },
        { id: 'c', url: 'https://example.com', name: 'C', enabled: true, provider: 'generic' },
      ],
    });
    expect(config.targets[0].provider).toBe('slack');
    expect(config.targets[1].provider).toBe('discord');
    expect(config.targets[2].provider).toBe('generic');
  });

  it('strips invalid provider values (falls back to undefined)', () => {
    const config = sanitizeConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true, provider: 'teams' },
      ],
    });
    expect(config.targets[0].provider).toBeUndefined();
  });

  it('handles missing provider gracefully', () => {
    const config = sanitizeConfig({
      enabled: true,
      targets: [
        { id: 'a', url: 'https://example.com', name: 'A', enabled: true },
      ],
    });
    expect(config.targets[0].provider).toBeUndefined();
  });
});

// ─── Provider in redactConfig ────────────────────────────────────────────────

describe('redactConfig — provider field', () => {
  it('includes provider in redacted output', () => {
    const config: WebhookConfig = {
      enabled: true,
      targets: [
        { id: 'a', name: 'Slack', url: 'https://hooks.slack.com/x', enabled: true, secret: 'secret123', provider: 'slack' },
      ],
    };
    const redacted = redactConfig(config);
    expect(redacted.targets[0]).toHaveProperty('hasSecret', true);
    expect((redacted.targets[0] as any).provider).toBe('slack');
    expect((redacted.targets[0] as any).secret).toBeUndefined();
  });
});

// ─── Config I/O round-trip with provider ─────────────────────────────────────

describe('readWebhookConfig / writeWebhookConfig — provider round-trip', () => {
  it('persists and reads back provider field', () => {
    const config: WebhookConfig = {
      enabled: true,
      targets: [
        { id: 'slack1', name: 'Slack', url: 'https://hooks.slack.com/x', enabled: true, provider: 'slack' },
        { id: 'disc1', name: 'Discord', url: 'https://discord.com/api/webhooks/x', enabled: true, provider: 'discord' },
        { id: 'gen1', name: 'Generic', url: 'https://example.com/webhook', enabled: true },
      ],
    };
    writeWebhookConfig(testDataDir, config);
    const loaded = readWebhookConfig(testDataDir);
    expect(loaded.targets[0].provider).toBe('slack');
    expect(loaded.targets[1].provider).toBe('discord');
    expect(loaded.targets[2].provider).toBeUndefined();
  });
});

// ─── HMAC signature correctness with formatted payloads ──────────────────────

describe('HMAC signature with formatted payloads', () => {
  it('signature is computed over the formatted body, not raw payload', async () => {
    const payload = makeSamplePayload();
    const secret = 'test-secret-key';

    // Generic: signature should match JSON.stringify(payload)
    const genericBody = JSON.stringify(payload);
    const genericSig = await computeSignature(genericBody, secret);

    // Slack: body is different, so signature must differ
    const slackFormatted = formatSlack(payload);
    const slackSig = await computeSignature(slackFormatted.body, secret);

    expect(slackSig).not.toBe(genericSig);

    // Each signature should be a valid hex string
    expect(genericSig).toMatch(/^[0-9a-f]{64}$/);
    expect(slackSig).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── No regression: existing webhook delivery (generic default) ──────────────

describe('delivery regression — generic default behavior', () => {
  it('deliverWebhook uses generic format when target has no provider', async () => {
    const target = makeSampleTarget(); // no provider
    const payload = makeSamplePayload();

    // Mock fetch to capture the request body
    let capturedBody: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      capturedBody = init?.body;
      capturedHeaders = init?.headers;
      return new Response('OK', { status: 200 });
    }));

    const result = await deliverWebhook(target, payload, { maxRetries: 1 });
    expect(result.success).toBe(true);

    // Body should be raw JSON.stringify of the payload (generic format)
    expect(capturedBody).toBe(JSON.stringify(payload));
    expect(capturedHeaders?.['Content-Type']).toBe('application/json');

    vi.unstubAllGlobals();
  });

  it('deliverWebhook uses Slack format when target has provider=slack', async () => {
    const target = makeSampleTarget({ provider: 'slack' });
    const payload = makeSamplePayload();

    let capturedBody: string | undefined;

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      capturedBody = init?.body;
      return new Response('OK', { status: 200 });
    }));

    const result = await deliverWebhook(target, payload, { maxRetries: 1 });
    expect(result.success).toBe(true);

    // Body should be Slack-formatted
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toHaveProperty('blocks');
    expect(parsed).toHaveProperty('text');
    // Should NOT be the raw payload
    expect(parsed).not.toHaveProperty('event');

    vi.unstubAllGlobals();
  });

  it('deliverWebhook uses Discord format when target has provider=discord', async () => {
    const target = makeSampleTarget({ provider: 'discord' });
    const payload = makeSamplePayload();

    let capturedBody: string | undefined;

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      capturedBody = init?.body;
      return new Response('OK', { status: 200 });
    }));

    const result = await deliverWebhook(target, payload, { maxRetries: 1 });
    expect(result.success).toBe(true);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toHaveProperty('embeds');
    expect(parsed).toHaveProperty('content');

    vi.unstubAllGlobals();
  });

  it('deliverTestWebhook uses provider formatter for test pings', async () => {
    const target = makeSampleTarget({ provider: 'slack' });
    const testPayload = buildTestPayload();

    let capturedBody: string | undefined;

    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      capturedBody = init?.body;
      return new Response('OK', { status: 200 });
    }));

    const result = await deliverTestWebhook(target, testPayload, { maxRetries: 1 });
    expect(result.success).toBe(true);
    expect(result.isTest).toBe(true);

    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toHaveProperty('blocks');
    expect(parsed.text).toContain('Test');

    vi.unstubAllGlobals();
  });

  it('HMAC signature header is present when secret is set (all providers)', async () => {
    const secret = 'my-webhook-secret';

    for (const provider of [undefined, 'slack' as const, 'discord' as const]) {
      const target = makeSampleTarget({ secret, provider });
      const payload = makeSamplePayload();

      let capturedHeaders: Record<string, string> | undefined;
      let capturedBody: string | undefined;

      vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
        capturedHeaders = init?.headers;
        capturedBody = init?.body;
        return new Response('OK', { status: 200 });
      }));

      await deliverWebhook(target, payload, { maxRetries: 1 });

      expect(capturedHeaders?.['X-VentureOS-Signature']).toBeDefined();
      // Verify signature matches the actual body sent
      const expectedSig = await computeSignature(capturedBody!, secret);
      expect(capturedHeaders?.['X-VentureOS-Signature']).toBe(`sha256=${expectedSig}`);

      vi.unstubAllGlobals();
    }
  });
});

// ─── Output schema validation ────────────────────────────────────────────────

describe('formatter output schemas', () => {
  const payload = makeSamplePayload();

  it('all formatters produce valid FormattedPayload shape', () => {
    for (const provider of ALLOWED_PROVIDERS) {
      const result = formatPayload(payload, provider);
      expect(typeof result.body).toBe('string');
      expect(typeof result.contentType).toBe('string');
      expect(typeof result.extraHeaders).toBe('object');
      expect(result.body.length).toBeGreaterThan(0);

      // Body must be valid JSON
      expect(() => JSON.parse(result.body)).not.toThrow();
    }
  });

  it('Slack output always has text and blocks', () => {
    const result = formatPayload(payload, 'slack');
    const parsed = JSON.parse(result.body);
    expect(typeof parsed.text).toBe('string');
    expect(Array.isArray(parsed.blocks)).toBe(true);
  });

  it('Discord output always has content and embeds', () => {
    const result = formatPayload(payload, 'discord');
    const parsed = JSON.parse(result.body);
    expect(typeof parsed.content).toBe('string');
    expect(Array.isArray(parsed.embeds)).toBe(true);
    // Embeds have required fields
    const embed = parsed.embeds[0];
    expect(typeof embed.title).toBe('string');
    expect(typeof embed.color).toBe('number');
  });

  it('generic output preserves full VentureOS schema', () => {
    const result = formatPayload(payload, 'generic');
    const parsed = JSON.parse(result.body);
    expect(parsed.event).toBe('alert.transition');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.source).toBe('ventureos-dashboard');
    expect(typeof parsed.timestamp).toBe('number');
    expect(typeof parsed.timestampISO).toBe('string');
    expect(typeof parsed.currentSeverity).toBe('string');
    expect(parsed.evaluation).toBeDefined();
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('formatter edge cases', () => {
  it('handles evaluation with no enabled rules gracefully', () => {
    const emptyEval = makeSampleEvaluation({
      rules: [
        {
          rule: 'disabled',
          label: 'Disabled Rule',
          enabled: false,
          severity: 'ok',
          currentValue: 0,
          warningThreshold: 1,
          criticalThreshold: 2,
          message: 'disabled',
        },
      ],
    });
    const payload = buildWebhookPayload(emptyEval, 'ok');

    // All formatters should handle this without throwing
    for (const provider of ALLOWED_PROVIDERS) {
      expect(() => formatPayload(payload, provider)).not.toThrow();
    }
  });

  it('handles null previousSeverity', () => {
    const payload = buildWebhookPayload(makeSampleEvaluation(), null);
    for (const provider of ALLOWED_PROVIDERS) {
      const result = formatPayload(payload, provider);
      expect(() => JSON.parse(result.body)).not.toThrow();
    }
  });

  it('handles null currentValue in rules', () => {
    const evalWithNull = makeSampleEvaluation({
      rules: [
        {
          rule: 'nullVal',
          label: 'Null Value Rule',
          enabled: true,
          severity: 'warning',
          currentValue: null,
          warningThreshold: 1,
          criticalThreshold: 2,
          message: 'no data',
        },
      ],
    });
    const payload = buildWebhookPayload(evalWithNull, 'ok');
    for (const provider of ALLOWED_PROVIDERS) {
      const result = formatPayload(payload, provider);
      expect(() => JSON.parse(result.body)).not.toThrow();
    }
  });
});
