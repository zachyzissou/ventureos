/**
 * Tests for structured logger — Issue #195 Observability
 *
 * Covers:
 * - Log entry schema validation
 * - Correlation ID lifecycle (propagation, generation)
 * - Redaction of sensitive fields
 * - Log level filtering
 */

import {
  structuredLog,
  redactSensitiveFields,
  generateCorrelationId,
  getCorrelationId,
  runWithCorrelation,
  setLogOutput,
  correlationStore,
  type LogLevel,
  type StructuredLogEntry,
} from '../structured-logger';

describe('Structured Logger (Issue #195)', () => {
  let capturedLines: string[];
  const originalEnv = process.env.VENTUREOS_LOG_LEVEL;

  beforeEach(() => {
    capturedLines = [];
    setLogOutput((line: string) => capturedLines.push(line));
    delete process.env.VENTUREOS_LOG_LEVEL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.VENTUREOS_LOG_LEVEL = originalEnv;
    } else {
      delete process.env.VENTUREOS_LOG_LEVEL;
    }
  });

  // ─── Schema Validation ───────────────────────────────────────────────

  describe('log entry schema', () => {
    it('should produce a valid JSON entry with all required fields', () => {
      const entry = structuredLog('info', 'dashboard', 'test_event', 'Test message');
      expect(entry).toBeDefined();
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.level).toBe('info');
      expect(entry.subsystem).toBe('dashboard');
      expect(entry.event).toBe('test_event');
      expect(entry.message).toBe('Test message');
      expect(entry).toHaveProperty('correlationId');
      expect(entry).toHaveProperty('fields');
    });

    it('should emit valid JSON to output', () => {
      structuredLog('warn', 'auth', 'login_failure', 'Bad creds');
      expect(capturedLines).toHaveLength(1);
      const parsed = JSON.parse(capturedLines[0]) as StructuredLogEntry;
      expect(parsed.level).toBe('warn');
      expect(parsed.subsystem).toBe('auth');
      expect(parsed.event).toBe('login_failure');
    });

    it('should include fields when provided', () => {
      const entry = structuredLog('info', 'bridge', 'request', 'GET /api', {
        method: 'GET',
        path: '/api',
        statusCode: 200,
      });
      expect(entry.fields).toEqual({
        method: 'GET',
        path: '/api',
        statusCode: 200,
      });
    });

    it('should set fields to null when not provided', () => {
      const entry = structuredLog('debug', 'system', 'tick', 'Heartbeat');
      expect(entry.fields).toBeNull();
    });

    it('should use all valid log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      for (const level of levels) {
        process.env.VENTUREOS_LOG_LEVEL = 'debug'; // ensure all levels emit
        const entry = structuredLog(level, 'test', 'test', `Level ${level}`);
        expect(entry.level).toBe(level);
      }
    });
  });

  // ─── Correlation ID ──────────────────────────────────────────────────

  describe('correlation ID lifecycle', () => {
    it('should generate valid UUID format correlation IDs', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should return null when no correlation context is active', () => {
      expect(getCorrelationId()).toBeNull();
    });

    it('should propagate correlation ID through runWithCorrelation', () => {
      const testId = 'test-corr-id-12345';
      runWithCorrelation(testId, () => {
        expect(getCorrelationId()).toBe(testId);
      });
    });

    it('should include correlation ID in log entries within context', () => {
      const testId = 'corr-for-log-test';
      runWithCorrelation(testId, () => {
        const entry = structuredLog('info', 'test', 'ctx_test', 'Within context');
        expect(entry.correlationId).toBe(testId);
      });
    });

    it('should set correlationId to null in log entries outside context', () => {
      const entry = structuredLog('info', 'test', 'no_ctx', 'No context');
      expect(entry.correlationId).toBeNull();
    });

    it('should support nested correlation contexts (inner wins)', () => {
      runWithCorrelation('outer-id', () => {
        expect(getCorrelationId()).toBe('outer-id');
        runWithCorrelation('inner-id', () => {
          expect(getCorrelationId()).toBe('inner-id');
        });
        // Outer context restored
        expect(getCorrelationId()).toBe('outer-id');
      });
    });

    it('should work with async code', async () => {
      const testId = 'async-corr-id';
      await correlationStore.run({ correlationId: testId }, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(getCorrelationId()).toBe(testId);
      });
    });
  });

  // ─── Redaction ───────────────────────────────────────────────────────

  describe('sensitive field redaction', () => {
    it('should redact token fields', () => {
      const result = redactSensitiveFields({
        token: 'super-secret-token',
        message: 'hello',
      }) as Record<string, unknown>;
      expect(result.token).toBe('[REDACTED]');
      expect(result.message).toBe('hello');
    });

    it('should redact password fields', () => {
      const result = redactSensitiveFields({
        password: 'my-password',
        user: 'admin',
      }) as Record<string, unknown>;
      expect(result.password).toBe('[REDACTED]');
      expect(result.user).toBe('admin');
    });

    it('should redact api_key and authorization fields', () => {
      const result = redactSensitiveFields({
        api_key: 'key-123',
        authorization: 'Bearer xyz',
        path: '/api/test',
      }) as Record<string, unknown>;
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result.path).toBe('/api/test');
    });

    it('should redact case-insensitively', () => {
      const result = redactSensitiveFields({
        TOKEN: 'should-be-redacted',
        Secret: 'also-secret',
      }) as Record<string, unknown>;
      // Keys are matched lowercase
      expect(result.TOKEN).toBe('[REDACTED]');
      expect(result.Secret).toBe('[REDACTED]');
    });

    it('should redact deeply nested fields', () => {
      const result = redactSensitiveFields({
        outer: {
          inner: {
            token: 'nested-secret',
            data: 'visible',
          },
        },
      }) as any;
      expect(result.outer.inner.token).toBe('[REDACTED]');
      expect(result.outer.inner.data).toBe('visible');
    });

    it('should redact OpenAI-style API keys in string values', () => {
      const result = redactSensitiveFields(
        'Config: sk-abcdefghijklmnopqrstuvwxyz12345678 loaded'
      ) as string;
      expect(result).not.toContain('sk-abcdef');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact GitHub PATs in string values', () => {
      const result = redactSensitiveFields(
        'Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890'
      ) as string;
      expect(result).not.toContain('ghp_');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact JWTs in string values', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = redactSensitiveFields(`Auth: ${jwt}`) as string;
      expect(result).not.toContain('eyJhbGci');
      expect(result).toContain('[REDACTED]');
    });

    it('should handle arrays', () => {
      const result = redactSensitiveFields([
        { token: 'secret1', name: 'a' },
        { token: 'secret2', name: 'b' },
      ]) as any[];
      expect(result[0].token).toBe('[REDACTED]');
      expect(result[1].token).toBe('[REDACTED]');
      expect(result[0].name).toBe('a');
    });

    it('should handle null and undefined', () => {
      expect(redactSensitiveFields(null)).toBeNull();
      expect(redactSensitiveFields(undefined)).toBeUndefined();
    });

    it('should not redact non-sensitive fields', () => {
      const result = redactSensitiveFields({
        method: 'GET',
        path: '/api/kpis',
        statusCode: 200,
        latencyMs: 42,
      }) as Record<string, unknown>;
      expect(result).toEqual({
        method: 'GET',
        path: '/api/kpis',
        statusCode: 200,
        latencyMs: 42,
      });
    });

    it('should redact fields in log output', () => {
      structuredLog('info', 'test', 'test', 'Redaction test', {
        token: 'my-secret-token',
        path: '/visible',
      });
      expect(capturedLines).toHaveLength(1);
      const parsed = JSON.parse(capturedLines[0]) as StructuredLogEntry;
      expect(parsed.fields?.token).toBe('[REDACTED]');
      expect(parsed.fields?.path).toBe('/visible');
    });
  });

  // ─── Log Level Filtering ─────────────────────────────────────────────

  describe('log level filtering', () => {
    it('should emit info and above by default', () => {
      structuredLog('debug', 'test', 'debug_msg', 'Should not emit');
      structuredLog('info', 'test', 'info_msg', 'Should emit');
      structuredLog('warn', 'test', 'warn_msg', 'Should emit');
      structuredLog('error', 'test', 'error_msg', 'Should emit');
      expect(capturedLines).toHaveLength(3);
    });

    it('should emit all levels when set to debug', () => {
      process.env.VENTUREOS_LOG_LEVEL = 'debug';
      structuredLog('debug', 'test', 'debug_msg', 'Emitted');
      structuredLog('info', 'test', 'info_msg', 'Emitted');
      expect(capturedLines).toHaveLength(2);
    });

    it('should only emit errors when set to error', () => {
      process.env.VENTUREOS_LOG_LEVEL = 'error';
      structuredLog('info', 'test', 'info_msg', 'Suppressed');
      structuredLog('warn', 'test', 'warn_msg', 'Suppressed');
      structuredLog('error', 'test', 'error_msg', 'Emitted');
      expect(capturedLines).toHaveLength(1);
    });

    it('should still return the entry object even when filtered', () => {
      process.env.VENTUREOS_LOG_LEVEL = 'error';
      const entry = structuredLog('debug', 'test', 'filtered', 'Not emitted');
      expect(entry).toBeDefined();
      expect(entry.level).toBe('debug');
      expect(capturedLines).toHaveLength(0);
    });
  });
});
