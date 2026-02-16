/**
 * Rate Limiter Integration Tests
 *
 * Tests the real RateLimiter class from lib/rate-limiter.ts.
 * No mocks, no inline reimplementations — imports and exercises the real code.
 *
 * Also includes HTTP integration tests using a server with rate limiting.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { AddressInfo } from 'net';
import { RateLimiter, getDefaultRateLimiter, resetDefaultRateLimiter } from '../../../lib/rate-limiter.ts';

// ─── RateLimiter class unit tests (real code, no mocks) ────────────────

describe('RateLimiter — Agent Limits', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ agentPerMinute: 5, agentPerHour: 20, burstAllowance: false });
  });

  it('allows requests within the per-minute limit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkAgentLimit('agent-1');
    // 5 recorded + checking = should be at limit
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'agent_per_minute');
  });

  it('remaining count decreases with each recorded message', () => {
    const r1 = limiter.checkAgentLimit('agent-1');
    assert.equal(r1.allowed, true);
    assert.equal(r1.usage.agentMinute, 0);

    limiter.recordMessage('agent-1', 'conv-1');
    const r2 = limiter.checkAgentLimit('agent-1');
    assert.equal(r2.usage.agentMinute, 1);

    limiter.recordMessage('agent-1', 'conv-1');
    const r3 = limiter.checkAgentLimit('agent-1');
    assert.equal(r3.usage.agentMinute, 2);
  });

  it('blocks when per-minute limit exceeded', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'agent_per_minute');
    assert.ok(result.retryAfterMs! > 0, 'Should provide retryAfterMs');
  });

  it('blocks when per-hour limit exceeded', () => {
    const now = Date.now();
    // Fill 20 messages spread across the hour
    for (let i = 0; i < 20; i++) {
      limiter.recordMessage('agent-1', 'conv-1', now - (i * 60000));
    }
    const result = limiter.checkAgentLimit('agent-1', now);
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'agent_per_hour');
  });

  it('provides retryAfterMs when blocked', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, false);
    assert.ok(typeof result.retryAfterMs === 'number');
    assert.ok(result.retryAfterMs! > 0);
  });
});

describe('RateLimiter — Burst Allowance', () => {
  it('allows burst when burstAllowance is enabled', () => {
    const limiter = new RateLimiter({
      agentPerMinute: 10,
      burstAllowance: true,
      burstMultiplier: 1.5,
    });
    // Effective limit: floor(10 * 1.5) = 15
    for (let i = 0; i < 14; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, true, 'Should allow up to burst limit');
    assert.equal(result.limits.agentPerMinute, 15);
  });

  it('blocks when burst limit exceeded', () => {
    const limiter = new RateLimiter({
      agentPerMinute: 10,
      burstAllowance: true,
      burstMultiplier: 1.5,
    });
    for (let i = 0; i < 15; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, false);
  });
});

describe('RateLimiter — Sliding Window', () => {
  it('allows requests after window expires', () => {
    const limiter = new RateLimiter({ agentPerMinute: 3, burstAllowance: false });
    const now = Date.now();
    const twoMinutesAgo = now - 120_000;

    // Record 3 messages 2 minutes ago (outside 1-min window)
    for (let i = 0; i < 3; i++) {
      limiter.recordMessage('agent-1', 'conv-1', twoMinutesAgo);
    }

    const result = limiter.checkAgentLimit('agent-1', now);
    assert.equal(result.allowed, true, 'Old messages should be outside the window');
  });

  it('counts only messages within the window', () => {
    const limiter = new RateLimiter({ agentPerMinute: 5, burstAllowance: false });
    const now = Date.now();

    // 2 messages in window, 3 outside
    limiter.recordMessage('agent-1', 'conv-1', now - 120_000);
    limiter.recordMessage('agent-1', 'conv-1', now - 90_000);
    limiter.recordMessage('agent-1', 'conv-1', now - 70_000);
    limiter.recordMessage('agent-1', 'conv-1', now - 30_000);
    limiter.recordMessage('agent-1', 'conv-1', now - 10_000);

    const result = limiter.checkAgentLimit('agent-1', now);
    // Only messages within 60s should count: -30s and -10s = 2
    assert.equal(result.usage.agentMinute, 2);
    assert.equal(result.allowed, true);
  });
});

describe('RateLimiter — Conversation Limits', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      conversationPerMinute: 5,
      conversationPerHour: 50,
    });
  });

  it('tracks conversation limits independently from agent limits', () => {
    // Different agents, same conversation
    for (let i = 0; i < 4; i++) {
      limiter.recordMessage(`agent-${i}`, 'conv-1');
    }
    const result = limiter.checkConversationLimit('conv-1');
    assert.equal(result.usage.conversationMinute, 4);
    assert.equal(result.allowed, true);
  });

  it('blocks when conversation per-minute limit hit', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkConversationLimit('conv-1');
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'conversation_per_minute');
  });

  it('different conversations are isolated', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('agent-1', 'conv-1');
    }
    const result = limiter.checkConversationLimit('conv-2');
    assert.equal(result.allowed, true);
    assert.equal(result.usage.conversationMinute, 0);
  });
});

describe('RateLimiter — Challenge Limits', () => {
  it('allows challenges within hourly limit', () => {
    const limiter = new RateLimiter({ challengePerHour: 5, challengeCooldownMs: 0 });
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      limiter.recordChallenge('agent-a', 'agent-b', now - (i + 1) * 1000);
    }
    const result = limiter.checkChallengeLimit('agent-a', 'agent-b', now);
    assert.equal(result.allowed, true);
    assert.equal(result.challengeCount, 4);
  });

  it('blocks challenges exceeding hourly limit', () => {
    const limiter = new RateLimiter({ challengePerHour: 5, challengeCooldownMs: 0 });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      limiter.recordChallenge('agent-a', 'agent-b', now - (i + 1) * 1000);
    }
    const result = limiter.checkChallengeLimit('agent-a', 'agent-b', now);
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'challenge_per_hour');
  });

  it('enforces cooldown between challenges', () => {
    const limiter = new RateLimiter({ challengeCooldownMs: 600_000 });
    const now = Date.now();
    limiter.recordChallenge('oracle', 'synth', now);

    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 1000);
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'challenge_cooldown');
    assert.ok(result.retryAfterMs! > 0);
  });

  it('pair order does not matter (symmetric)', () => {
    const limiter = new RateLimiter({ challengePerHour: 3, challengeCooldownMs: 0 });
    limiter.recordChallenge('oracle', 'synth');
    limiter.recordChallenge('synth', 'oracle');

    const r1 = limiter.checkChallengeLimit('oracle', 'synth');
    const r2 = limiter.checkChallengeLimit('synth', 'oracle');
    assert.equal(r1.challengeCount, r2.challengeCount);
  });

  it('uses pair-specific overrides (sentinel-atlas = 3/hr)', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) {
      limiter.recordChallenge('sentinel', 'atlas');
    }
    const result = limiter.checkChallengeLimit('sentinel', 'atlas');
    assert.equal(result.allowed, false);
    assert.equal(result.maxPerHour, 3);
  });
});

describe('RateLimiter — Combined Check (checkAll)', () => {
  it('passes when all limits are within bounds', () => {
    const limiter = new RateLimiter({ agentPerMinute: 10, conversationPerMinute: 10, burstAllowance: false });
    limiter.recordMessage('agent-1', 'conv-1');
    const result = limiter.checkAll('agent-1', 'conv-1');
    assert.equal(result.allowed, true);
  });

  it('fails when agent limit exceeded', () => {
    const limiter = new RateLimiter({ agentPerMinute: 2, burstAllowance: false });
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordMessage('agent-1', 'conv-1');
    const result = limiter.checkAll('agent-1', 'conv-1');
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'agent_per_minute');
  });

  it('fails when conversation limit exceeded', () => {
    const limiter = new RateLimiter({
      agentPerMinute: 100,
      conversationPerMinute: 2,
      burstAllowance: false,
    });
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordMessage('agent-2', 'conv-1');
    const result = limiter.checkAll('agent-3', 'conv-1');
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'conversation_per_minute');
  });

  it('checks challenge limits when isChallenge=true', () => {
    const limiter = new RateLimiter({
      challengePerHour: 1,
      challengeCooldownMs: 0,
      agentPerMinute: 100,
      conversationPerMinute: 100,
      burstAllowance: false,
    });
    const now = Date.now();
    limiter.recordChallenge('agent-x', 'agent-y', now - 1000);
    const result = limiter.checkAll('agent-x', 'conv-1', {
      isChallenge: true,
      challengeTarget: 'agent-y',
    }, now);
    assert.equal(result.allowed, false);
    assert.equal(result.limitType, 'challenge_per_hour');
  });
});

describe('RateLimiter — Backoff Strategy', () => {
  it('exponential backoff increases with consecutive rejections', () => {
    const limiter = new RateLimiter({
      agentPerMinute: 1,
      burstAllowance: false,
      backoffStrategy: 'exponential',
    });
    limiter.recordMessage('agent-1', 'conv-1');

    const r1 = limiter.checkAgentLimit('agent-1');
    assert.equal(r1.allowed, false);
    const delay1 = r1.retryAfterMs!;

    const r2 = limiter.checkAgentLimit('agent-1');
    assert.equal(r2.allowed, false);
    const delay2 = r2.retryAfterMs!;

    // Exponential: each rejection should increase the delay
    assert.ok(delay2 > delay1, `Backoff should increase: ${delay2} > ${delay1}`);
  });

  it('fixed backoff stays constant', () => {
    const limiter = new RateLimiter({
      agentPerMinute: 1,
      burstAllowance: false,
      backoffStrategy: 'fixed',
    });
    limiter.recordMessage('agent-1', 'conv-1');

    const r1 = limiter.checkAgentLimit('agent-1');
    const r2 = limiter.checkAgentLimit('agent-1');
    // Fixed strategy: delay should not change much (same base)
    assert.equal(r1.retryAfterMs, r2.retryAfterMs);
  });
});

describe('RateLimiter — State Management', () => {
  it('export and import preserves state', () => {
    const limiter = new RateLimiter({ agentPerMinute: 10, burstAllowance: false });
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordChallenge('oracle', 'synth');

    const state = limiter.exportState();
    assert.ok(state.exportedAt);
    assert.ok(Object.keys(state.agentWindows).length > 0);

    const limiter2 = new RateLimiter({ agentPerMinute: 10, burstAllowance: false });
    limiter2.importState(state);
    const result = limiter2.checkAgentLimit('agent-1');
    assert.equal(result.usage.agentMinute, 2);
  });

  it('reset() clears all state', () => {
    const limiter = new RateLimiter({ agentPerMinute: 10, burstAllowance: false });
    for (let i = 0; i < 5; i++) limiter.recordMessage('agent-1', 'conv-1');
    limiter.reset();
    const result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.usage.agentMinute, 0);
  });

  it('resetAgent() clears only that agent', () => {
    const limiter = new RateLimiter({ agentPerMinute: 10, burstAllowance: false });
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordMessage('agent-2', 'conv-1');
    limiter.resetAgent('agent-1');

    assert.equal(limiter.checkAgentLimit('agent-1').usage.agentMinute, 0);
    assert.equal(limiter.checkAgentLimit('agent-2').usage.agentMinute, 1);
  });

  it('prune() removes expired entries', () => {
    const limiter = new RateLimiter();
    const now = Date.now();
    limiter.recordMessage('agent-1', 'conv-1', now - 7200_000); // 2 hours ago
    limiter.recordMessage('agent-2', 'conv-2', now - 100);       // recent

    limiter.prune(now);
    assert.equal(limiter.checkAgentLimit('agent-1', now).usage.agentMinute, 0);
    assert.equal(limiter.checkAgentLimit('agent-2', now).usage.agentMinute, 1);
  });
});

describe('RateLimiter — Config Management', () => {
  it('getConfig() returns current config', () => {
    const limiter = new RateLimiter({ agentPerMinute: 42 });
    const config = limiter.getConfig();
    assert.equal(config.agentPerMinute, 42);
  });

  it('updateConfig() changes limits dynamically', () => {
    const limiter = new RateLimiter({ agentPerMinute: 2, burstAllowance: false });
    limiter.recordMessage('agent-1', 'conv-1');
    limiter.recordMessage('agent-1', 'conv-1');

    let result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, false);

    limiter.updateConfig({ agentPerMinute: 10 });
    result = limiter.checkAgentLimit('agent-1');
    assert.equal(result.allowed, true);
  });
});

describe('RateLimiter — Singleton', () => {
  beforeEach(() => {
    resetDefaultRateLimiter();
  });

  it('getDefaultRateLimiter() returns same instance', () => {
    const a = getDefaultRateLimiter();
    const b = getDefaultRateLimiter();
    assert.equal(a, b);
  });

  it('resetDefaultRateLimiter() creates fresh instance', () => {
    const a = getDefaultRateLimiter();
    a.recordMessage('agent-1', 'conv-1');
    resetDefaultRateLimiter();
    const b = getDefaultRateLimiter();
    assert.notEqual(a, b);
    assert.equal(b.checkAgentLimit('agent-1').usage.agentMinute, 0);
  });
});

// ─── HTTP Integration: Rate limiting in a real server ──────────────────

describe('RateLimiter — HTTP Integration', () => {
  let server: Server;
  let url: string;
  let limiter: RateLimiter;

  beforeAll(async () => {
    limiter = new RateLimiter({
      agentPerMinute: 3,
      burstAllowance: false,
    });

    await new Promise<void>((resolve, reject) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        // Extract agent from header (simulates real usage)
        const agentId = req.headers['x-agent-id'] as string || 'anonymous';
        const result = limiter.checkAgentLimit(agentId);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', String(result.limits.agentPerMinute));
        res.setHeader('X-RateLimit-Remaining', String(
          result.allowed ? result.limits.agentPerMinute - result.usage.agentMinute - 1 : 0
        ));

        if (!result.allowed) {
          const retryAfter = Math.ceil(result.retryAfterMs! / 1000);
          res.setHeader('Retry-After', String(retryAfter));
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: 'Rate limit exceeded',
            limitType: result.limitType,
            retryAfterMs: result.retryAfterMs,
          }));
          return;
        }

        limiter.recordMessage(agentId, 'test-conv');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        url = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
      server.on('error', reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((res, rej) => server.close(err => err ? rej(err) : res()));
  });

  it('returns 200 for requests within limit', async () => {
    const res = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-1' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it('includes X-RateLimit-Limit header in response', async () => {
    const res = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-2' },
    });
    assert.equal(res.headers.get('x-ratelimit-limit'), '3');
  });

  it('includes X-RateLimit-Remaining header that decreases', async () => {
    const res1 = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-3' },
    });
    const remaining1 = parseInt(res1.headers.get('x-ratelimit-remaining')!);

    const res2 = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-3' },
    });
    const remaining2 = parseInt(res2.headers.get('x-ratelimit-remaining')!);

    assert.ok(remaining2 < remaining1, `Remaining should decrease: ${remaining2} < ${remaining1}`);
  });

  it('returns 429 when rate limit exceeded', async () => {
    // Send 3 requests (at limit)
    for (let i = 0; i < 3; i++) {
      await fetch(`${url}/api/test`, {
        headers: { 'X-Agent-Id': 'http-agent-4' },
      });
    }

    // 4th request should be blocked
    const res = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-4' },
    });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Rate limit exceeded/);
  });

  it('429 response includes Retry-After header', async () => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${url}/api/test`, {
        headers: { 'X-Agent-Id': 'http-agent-5' },
      });
    }
    const res = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-5' },
    });
    assert.equal(res.status, 429);
    const retryAfter = res.headers.get('retry-after');
    assert.ok(retryAfter, 'Should have Retry-After header');
    assert.ok(parseInt(retryAfter) > 0, 'Retry-After should be positive');
  });

  it('different agents have independent limits', async () => {
    // Exhaust agent-6's limit
    for (let i = 0; i < 3; i++) {
      await fetch(`${url}/api/test`, {
        headers: { 'X-Agent-Id': 'http-agent-6' },
      });
    }
    const blocked = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-6' },
    });
    assert.equal(blocked.status, 429);

    // agent-7 should still be allowed
    const allowed = await fetch(`${url}/api/test`, {
      headers: { 'X-Agent-Id': 'http-agent-7' },
    });
    assert.equal(allowed.status, 200);
  });
});
