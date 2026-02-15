/**
 * Error Handler Tests — VULN-003 Fix Validation
 *
 * Validates that:
 * 1. Internal error details are never exposed in user-facing responses
 * 2. Errors are properly classified into safe categories
 * 3. Error reference IDs are generated for log correlation
 * 4. Stack traces, file paths, and internal identifiers are never leaked
 * 5. Server-side logging captures full details
 */

import { toSafeError, logError, containsSensitiveInfo } from '../error-handler';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ERROR CLASSIFICATION — Safe User-Facing Messages
// ═══════════════════════════════════════════════════════════════════════════

describe('Error Classification', () => {
  test('not-found errors return 404 with generic message', () => {
    const err = new Error('Conversation not found: conv-abc123xyz789');
    const result = toSafeError(err);

    expect(result.status).toBe(404);
    expect(result.error).toBe('The requested resource was not found.');
    expect(result.error).not.toContain('conv-abc123');
    expect(result.error).not.toContain('Conversation');
    expect(result.errorRef).toMatch(/^ERR-[0-9A-F]{8}$/);
  });

  test('empty participants error returns 400', () => {
    const err = new Error('participants must be non-empty');
    const result = toSafeError(err);

    expect(result.status).toBe(400);
    expect(result.error).toContain('participants');
    expect(result.error).not.toContain('must be non-empty');
  });

  test('missing routing params error returns 400', () => {
    const err = new Error(
      'sendMessage requires `to` or payload.type for routing',
    );
    const result = toSafeError(err);

    expect(result.status).toBe(400);
    expect(result.error).toBe(
      'Invalid request: missing required routing parameters.',
    );
    expect(result.error).not.toContain('sendMessage');
    expect(result.error).not.toContain('payload.type');
  });

  test('role-card contract error returns 400 without internals', () => {
    const err = new Error(
      'No role-card output contract for from=oracle type=strategic_analysis',
    );
    const result = toSafeError(err);

    expect(result.status).toBe(400);
    expect(result.error).not.toContain('oracle');
    expect(result.error).not.toContain('strategic_analysis');
    expect(result.error).not.toContain('role-card');
    expect(result.error).not.toContain('from=');
    expect(result.error).not.toContain('type=');
  });

  test('JSON parse errors return 400', () => {
    const err = new SyntaxError('Unexpected token < in JSON at position 0');
    const result = toSafeError(err);

    expect(result.status).toBe(400);
    expect(result.error).toBe('Invalid request: malformed request body.');
    expect(result.error).not.toContain('Unexpected token');
    expect(result.error).not.toContain('position');
  });

  test('ECONNREFUSED errors return generic 500', () => {
    const err = new Error(
      'ECONNREFUSED: connect to /var/run/something.sock',
    );
    const result = toSafeError(err);

    expect(result.status).toBe(500);
    expect(result.error).toBe(
      'An internal error occurred. Please try again later.',
    );
    expect(result.error).not.toContain('ECONNREFUSED');
    expect(result.error).not.toContain('/var/run');
  });

  test('non-Error thrown values return generic 500', () => {
    const result = toSafeError(
      'string error with internal details /Users/zach/code',
    );

    expect(result.status).toBe(500);
    expect(result.error).toBe(
      'An internal error occurred. Please try again later.',
    );
    expect(result.error).not.toContain('/Users');
  });

  test('null/undefined errors return generic 500', () => {
    expect(toSafeError(null).status).toBe(500);
    expect(toSafeError(undefined).status).toBe(500);
    expect(toSafeError(null).error).toBe(
      'An internal error occurred. Please try again later.',
    );
  });

  test('auth errors return 401', () => {
    const err = new Error('Unauthorized access attempt');
    const result = toSafeError(err);

    expect(result.status).toBe(401);
    expect(result.error).toBe('Authentication required.');
  });

  test('forbidden errors return 403 (not 401)', () => {
    const err = new Error('Forbidden: insufficient permissions');
    const result = toSafeError(err);

    expect(result.status).toBe(403);
    expect(result.error).toBe('Access denied.');
    expect(result.error).not.toContain('insufficient');
  });

  test('rate limit errors return 429', () => {
    const err = new Error('Rate limit exceeded: too many requests from IP');
    const result = toSafeError(err);

    expect(result.status).toBe(429);
    expect(result.error).toBe(
      'Too many requests. Please try again later.',
    );
    expect(result.error).not.toContain('IP');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ERROR REFERENCE IDs — Unique Per Error
// ═══════════════════════════════════════════════════════════════════════════

describe('Error Reference IDs', () => {
  test('each error gets a unique reference ID', () => {
    const refs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = toSafeError(new Error('test'));
      refs.add(result.errorRef);
    }
    expect(refs.size).toBe(100);
  });

  test('error ref format is ERR-XXXXXXXX (hex)', () => {
    const result = toSafeError(new Error('test'));
    expect(result.errorRef).toMatch(/^ERR-[0-9A-F]{8}$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. NO SENSITIVE INFORMATION LEAKED
// ═══════════════════════════════════════════════════════════════════════════

describe('No Sensitive Information Leaked', () => {
  const internalErrors = [
    new Error('Conversation not found: conv-abc123xyz789'),
    new Error('sendMessage requires `to` or payload.type for routing'),
    new Error(
      'No role-card output contract for from=oracle type=strategic_analysis',
    ),
    new Error(
      "ENOENT: no such file or directory, open '/Users/zachgonser/clawd/data/conv.json'",
    ),
    new Error("EACCES: permission denied, open '/etc/shadow'"),
    new Error(
      "Cannot read properties of undefined (reading 'conversationId')",
    ),
    (() => {
      const e = new Error('Internal failure');
      e.stack = `Error: Internal failure
    at ConversationEngine.sendMessage (/Users/zachgonser/ventureos/lib/conversation-engine.ts:487:15)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async ConversationAPI.sendMessage (/Users/zachgonser/ventureos/lib/conversation-api.ts:45:21)`;
      return e;
    })(),
  ];

  test.each(
    internalErrors.map(
      (e, i) =>
        [
          `error #${i}: ${e.message.substring(0, 50)}...`,
          e,
        ] as const,
    ),
  )('sanitizes %s', (_, err) => {
    const result = toSafeError(err);
    expect(containsSensitiveInfo(result.error)).toBe(false);
  });

  test('stack traces are never in user-facing error', () => {
    const err = new Error('Something broke');
    err.stack = `Error: Something broke
    at Module._compile (node:internal/modules/cjs/loader:1241:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1295:10)`;

    const result = toSafeError(err);
    expect(result.error).not.toContain('Module._compile');
    expect(result.error).not.toContain('node:internal');
    expect(result.error).not.toMatch(/at\s+\S+\s+\(/);
  });

  test('file paths are never in user-facing error', () => {
    const err = new Error(
      'Failed to read /Users/zachgonser/clawd/role-cards/oracle.json',
    );
    const result = toSafeError(err);
    expect(result.error).not.toContain('/Users');
    expect(result.error).not.toContain('zachgonser');
    expect(result.error).not.toContain('.json');
  });

  test('internal IDs are never in user-facing error', () => {
    const err = new Error('Conversation not found: conv-a1b2c3d4e5f6');
    const result = toSafeError(err);
    expect(result.error).not.toContain('conv-a1b2c3');
  });

  test('agent names are never in user-facing error from contract errors', () => {
    const err = new Error(
      'No role-card output contract for from=sentinel type=deploy_action',
    );
    const result = toSafeError(err);
    expect(result.error).not.toContain('sentinel');
    expect(result.error).not.toContain('deploy_action');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SERVER-SIDE LOGGING — Full Details Captured
// ═══════════════════════════════════════════════════════════════════════════

describe('Server-Side Logging', () => {
  test('logError outputs full details to stderr', () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const err = new Error('Conversation not found: conv-abc123');
    err.stack =
      'Error: Conversation not found: conv-abc123\n    at getConversation (engine.ts:377:11)';

    logError('ERR-TEST1234', err, {
      method: 'GET',
      url: '/conversations/conv-abc123',
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleSpy.mock.calls[0].join(' ');

    // Server-side log SHOULD contain full details
    expect(logOutput).toContain('ERR-TEST1234');
    expect(logOutput).toContain('Conversation not found: conv-abc123');
    expect(logOutput).toContain('engine.ts:377');

    consoleSpy.mockRestore();
  });

  test('toSafeError logs full error while returning safe response', () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const err = new Error(
      "ENOENT: no such file or directory, open '/secret/path/data.json'",
    );
    const result = toSafeError(err, { requestId: 'req-123' });

    // Client response is safe
    expect(result.error).not.toContain('ENOENT');
    expect(result.error).not.toContain('/secret/path');

    // Server log contains full details
    const logOutput = consoleSpy.mock.calls[0].join(' ');
    expect(logOutput).toContain(result.errorRef);
    expect(logOutput).toContain('ENOENT');

    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. containsSensitiveInfo UTILITY — Pattern Detection
// ═══════════════════════════════════════════════════════════════════════════

describe('containsSensitiveInfo utility', () => {
  test('detects stack traces', () => {
    expect(
      containsSensitiveInfo(
        'Error at Object.run (/app/lib/engine.ts:42:10)',
      ),
    ).toBe(true);
    expect(
      containsSensitiveInfo(
        '    at Module._compile (node:internal:1241:14)',
      ),
    ).toBe(true);
  });

  test('detects file paths', () => {
    expect(
      containsSensitiveInfo('/Users/zachgonser/clawd/data'),
    ).toBe(true);
    expect(
      containsSensitiveInfo('/home/deploy/.config/secrets'),
    ).toBe(true);
    expect(containsSensitiveInfo('C:\\Users\\admin\\app')).toBe(true);
  });

  test('detects internal identifiers', () => {
    expect(containsSensitiveInfo('conv-abc123')).toBe(true);
    expect(containsSensitiveInfo('from=oracle')).toBe(true);
    expect(containsSensitiveInfo('type=strategic_analysis')).toBe(true);
  });

  test('detects Node.js error codes', () => {
    expect(containsSensitiveInfo('ENOENT: no such file')).toBe(true);
    expect(containsSensitiveInfo('EACCES: permission denied')).toBe(
      true,
    );
    expect(containsSensitiveInfo('ECONNREFUSED')).toBe(true);
  });

  test('detects implementation details', () => {
    expect(
      containsSensitiveInfo('sendMessage requires to or payload'),
    ).toBe(true);
    expect(containsSensitiveInfo('role-card not found')).toBe(true);
    expect(containsSensitiveInfo('/etc/config.json')).toBe(true);
  });

  test('bare .json references without file paths are not flagged', () => {
    expect(containsSensitiveInfo('Invalid JSON format')).toBe(false);
    expect(containsSensitiveInfo('malformed request body.')).toBe(false);
  });

  test('safe messages pass', () => {
    expect(
      containsSensitiveInfo(
        'The requested resource was not found.',
      ),
    ).toBe(false);
    expect(
      containsSensitiveInfo(
        'An internal error occurred. Please try again later.',
      ),
    ).toBe(false);
    expect(
      containsSensitiveInfo(
        'Invalid request: malformed request body.',
      ),
    ).toBe(false);
    expect(
      containsSensitiveInfo(
        'Too many requests. Please try again later.',
      ),
    ).toBe(false);
    expect(containsSensitiveInfo('Authentication required.')).toBe(
      false,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. CONVERSATION API INTEGRATION — End-to-End Error Safety
// ═══════════════════════════════════════════════════════════════════════════

describe('Conversation API Error Integration', () => {
  /**
   * Simulates the error path that previously leaked internal details:
   *   catch (err: any) {
   *     return writeJson(res, 500, { error: String(err?.message ?? err) });
   *   }
   *
   * Now uses toSafeError, so we validate the transformation.
   */
  const scenarioErrors = [
    {
      name: 'GET nonexistent conversation',
      error: new Error('Conversation not found: conv-999'),
      expectStatus: 404,
      mustNotContain: ['conv-999', 'Conversation not found'],
    },
    {
      name: 'POST conversation with no participants',
      error: new Error('participants must be non-empty'),
      expectStatus: 400,
      mustNotContain: ['must be non-empty'],
    },
    {
      name: 'POST message with bad routing',
      error: new Error(
        'sendMessage requires `to` or payload.type for routing',
      ),
      expectStatus: 400,
      mustNotContain: ['sendMessage', 'payload.type', '`to`'],
    },
    {
      name: 'POST message with invalid contract',
      error: new Error(
        'No role-card output contract for from=oracle type=nonexistent_type',
      ),
      expectStatus: 400,
      mustNotContain: [
        'oracle',
        'nonexistent_type',
        'role-card',
        'from=',
      ],
    },
    {
      name: 'Malformed JSON body',
      error: new SyntaxError(
        'Unexpected token h in JSON at position 0',
      ),
      expectStatus: 400,
      mustNotContain: ['Unexpected token', 'position 0'],
    },
    {
      name: 'Filesystem error (ENOENT)',
      error: Object.assign(
        new Error(
          "ENOENT: no such file or directory, open '/data/conversations/conv-123.json'",
        ),
        { code: 'ENOENT' },
      ),
      expectStatus: 500,
      mustNotContain: ['ENOENT', '/data/', '.json', 'conv-123'],
    },
    {
      name: 'Filesystem error (EACCES)',
      error: Object.assign(
        new Error("EACCES: permission denied, open '/etc/shadow'"),
        { code: 'EACCES' },
      ),
      expectStatus: 500,
      mustNotContain: [
        'EACCES',
        '/etc/shadow',
        'permission denied',
      ],
    },
  ];

  test.each(
    scenarioErrors.map((s) => [s.name, s] as const),
  )('%s', (_, scenario) => {
    // Suppress console.error from logError
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = toSafeError(scenario.error, {
      endpoint: scenario.name,
    });

    expect(result.status).toBe(scenario.expectStatus);

    for (const forbidden of scenario.mustNotContain) {
      expect(result.error).not.toContain(forbidden);
    }

    // Validate response has error ref for log correlation
    expect(result.errorRef).toMatch(/^ERR-[0-9A-F]{8}$/);

    // Validate no sensitive info using our own utility
    expect(containsSensitiveInfo(result.error)).toBe(false);

    consoleSpy.mockRestore();
  });
});
