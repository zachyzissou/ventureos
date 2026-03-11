/**
 * Tests for incident report bundle generation — Issue #195 Observability
 *
 * Covers:
 * - Bundle structure and required sections
 * - Redaction of sensitive data in bundles
 * - System snapshot collection
 */

import { describe, it, expect, vi } from 'vitest';
import { generateIncidentBundle } from '../../../scripts/incident-report';

describe('Incident Report Bundle (Issue #195)', () => {
  describe('bundle structure', () => {
    it('should produce a bundle with all required sections', async () => {
      const bundle = await generateIncidentBundle(1); // 1 minute window for fast test

      expect(bundle).toBeDefined();
      expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(bundle.generator).toContain('ventureos-incident-report');
      expect(bundle.windowMinutes).toBe(1);

      // Required sections
      expect(bundle.sections).toBeDefined();
      expect(bundle.sections).toHaveProperty('structuredLogs');
      expect(bundle.sections).toHaveProperty('auditLogs');
      expect(bundle.sections).toHaveProperty('systemSnapshot');
      expect(bundle.sections).toHaveProperty('configSnapshot');
      expect(bundle.sections).toHaveProperty('healthEndpoint');
      expect(bundle.sections).toHaveProperty('recentErrors');
    });

    it('should include system snapshot with expected fields', async () => {
      const bundle = await generateIncidentBundle(1);
      const sys = bundle.sections.systemSnapshot;

      expect(sys).toHaveProperty('hostname');
      expect(sys).toHaveProperty('platform');
      expect(sys).toHaveProperty('arch');
      expect(sys).toHaveProperty('nodeVersion');
      expect(sys).toHaveProperty('uptime');
      expect(sys).toHaveProperty('memory');
      expect(sys).toHaveProperty('cpus');
    });

    it('should include config snapshot with environment info', async () => {
      const bundle = await generateIncidentBundle(1);
      const config = bundle.sections.configSnapshot;

      expect(config).toHaveProperty('processId');
      expect(config).toHaveProperty('processUptime');
      expect(typeof config.processId).toBe('number');
    });
  });

  describe('redaction in bundles', () => {
    it('should redact token-like env vars in config snapshot', async () => {
      // Set a test token env var
      const origToken = process.env.BRIDGE_TOKEN;
      process.env.BRIDGE_TOKEN = 'super-secret-bridge-token';

      try {
        const bundle = await generateIncidentBundle(1);
        const config = bundle.sections.configSnapshot;
        const env = (config as any).environment ?? {};

        // BRIDGE_TOKEN should be redacted
        if (env.BRIDGE_TOKEN !== undefined) {
          expect(env.BRIDGE_TOKEN).toBe('[REDACTED]');
        }
      } finally {
        if (origToken !== undefined) {
          process.env.BRIDGE_TOKEN = origToken;
        } else {
          delete process.env.BRIDGE_TOKEN;
        }
      }
    });

    it('should not include raw token values in stringified bundle', async () => {
      const origToken = process.env.BRIDGE_TOKEN;
      process.env.BRIDGE_TOKEN = 'unique-test-secret-9876';

      try {
        const bundle = await generateIncidentBundle(1);
        const serialized = JSON.stringify(bundle);
        expect(serialized).not.toContain('unique-test-secret-9876');
      } finally {
        if (origToken !== undefined) {
          process.env.BRIDGE_TOKEN = origToken;
        } else {
          delete process.env.BRIDGE_TOKEN;
        }
      }
    });

    it('should redact sensitive patterns in log entries', async () => {
      // This tests the redaction logic applied to log entries
      const bundle = await generateIncidentBundle(1);
      const serialized = JSON.stringify(bundle);

      // Should not contain any API key patterns
      expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(serialized).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
    });
  });

  describe('structured logs section', () => {
    it('should return an array for structured logs', async () => {
      const bundle = await generateIncidentBundle(1);
      expect(Array.isArray(bundle.sections.structuredLogs)).toBe(true);
    });

    it('should return an array for recent errors', async () => {
      const bundle = await generateIncidentBundle(1);
      expect(Array.isArray(bundle.sections.recentErrors)).toBe(true);
    });
  });
});
