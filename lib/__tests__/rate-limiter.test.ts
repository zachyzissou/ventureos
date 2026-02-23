import {
  RateLimiter,
  getDefaultRateLimiter,
  resetDefaultRateLimiter,
} from '../rate-limiter';

// ─── Helper ───────────────────────────────────────────────────────────────

function createLimiter(config = {}, challengeOverrides: any[] = []) {
  return new RateLimiter(config, challengeOverrides);
}

// ─── Agent Rate Limits ────────────────────────────────────────────────────

describe('RateLimiter — Agent Limits', () => {
  it('allows messages under the per-minute limit', () => {
    const limiter = createLimiter({ agentPerMinute: 5, burstAllowance: false });
    const now = Date.now();

    for (let i = 0; i < 4; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 1000);
    }

    const result = limiter.checkAgentLimit('oracle', now + 5000);
    expect(result.allowed).toBe(true);
    expect(result.usage.agentMinute).toBe(4);
  });

  it('blocks when per-minute limit exceeded', () => {
    const limiter = createLimiter({ agentPerMinute: 3, burstAllowance: false });
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 1000);
    }

    const result = limiter.checkAgentLimit('oracle', now + 3000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('agent_per_minute');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows burst when burstAllowance is enabled', () => {
    const limiter = createLimiter({ agentPerMinute: 4, burstAllowance: true, burstMultiplier: 1.5 });
    const now = Date.now();

    // Effective limit = 4 * 1.5 = 6
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 100);
    }

    const result = limiter.checkAgentLimit('oracle', now + 600);
    expect(result.allowed).toBe(true);
  });

  it('blocks when per-hour limit exceeded', () => {
    const limiter = createLimiter({ agentPerMinute: 100, agentPerHour: 5, burstAllowance: false });
    const now = Date.now();

    // Spread 5 messages across the hour
    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 60000);
    }

    const result = limiter.checkAgentLimit('oracle', now + 300000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('agent_per_hour');
  });

  it('allows after window expires', () => {
    const limiter = createLimiter({ agentPerMinute: 2, burstAllowance: false });
    const now = Date.now();

    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('oracle', 'conv1', now + 1000);

    // Check immediately — should be blocked
    const blocked = limiter.checkAgentLimit('oracle', now + 2000);
    expect(blocked.allowed).toBe(false);

    // Check after 1 minute — should be allowed
    const allowed = limiter.checkAgentLimit('oracle', now + 61000);
    expect(allowed.allowed).toBe(true);
  });

  it('tracks separate windows per agent', () => {
    const limiter = createLimiter({ agentPerMinute: 2, burstAllowance: false });
    const now = Date.now();

    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('oracle', 'conv1', now + 1000);

    // Oracle should be blocked
    expect(limiter.checkAgentLimit('oracle', now + 2000).allowed).toBe(false);

    // Sentinel should still be allowed
    expect(limiter.checkAgentLimit('sentinel', now + 2000).allowed).toBe(true);
  });
});

// ─── Conversation Rate Limits ─────────────────────────────────────────────

describe('RateLimiter — Conversation Limits', () => {
  it('allows messages under the conversation per-minute limit', () => {
    const limiter = createLimiter({ conversationPerMinute: 10 });
    const now = Date.now();

    for (let i = 0; i < 9; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 1000);
    }

    const result = limiter.checkConversationLimit('conv1', now + 10000);
    expect(result.allowed).toBe(true);
  });

  it('blocks when conversation per-minute limit exceeded', () => {
    const limiter = createLimiter({ conversationPerMinute: 3 });
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 1000);
    }

    const result = limiter.checkConversationLimit('conv1', now + 3000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('conversation_per_minute');
  });

  it('blocks when conversation per-hour limit exceeded', () => {
    const limiter = createLimiter({ conversationPerMinute: 100, conversationPerHour: 5 });
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 60000);
    }

    const result = limiter.checkConversationLimit('conv1', now + 300000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('conversation_per_hour');
  });

  it('tracks separate windows per conversation', () => {
    const limiter = createLimiter({ conversationPerMinute: 2 });
    const now = Date.now();

    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('atlas', 'conv1', now + 1000);

    // conv1 should be blocked
    expect(limiter.checkConversationLimit('conv1', now + 2000).allowed).toBe(false);

    // conv2 should be allowed
    expect(limiter.checkConversationLimit('conv2', now + 2000).allowed).toBe(true);
  });
});

// ─── Challenge Rate Limits ────────────────────────────────────────────────

describe('RateLimiter — Challenge Limits', () => {
  it('allows challenges under the limit', () => {
    const limiter = createLimiter({ challengePerHour: 5, challengeCooldownMs: 1000 });
    const now = Date.now();

    limiter.recordChallenge('oracle', 'synth', now);

    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 2000);
    expect(result.allowed).toBe(true);
    expect(result.challengeCount).toBe(1);
  });

  it('blocks during cooldown period', () => {
    const limiter = createLimiter({ challengePerHour: 10, challengeCooldownMs: 60000 });
    const now = Date.now();

    limiter.recordChallenge('oracle', 'synth', now);

    // Check during cooldown
    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 30000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('challenge_cooldown');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows after cooldown expires', () => {
    const limiter = createLimiter({ challengePerHour: 10, challengeCooldownMs: 5000 });
    const now = Date.now();

    limiter.recordChallenge('oracle', 'synth', now);

    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 6000);
    expect(result.allowed).toBe(true);
  });

  it('blocks when hourly challenge limit exceeded', () => {
    const limiter = createLimiter({ challengePerHour: 3, challengeCooldownMs: 100 });
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      limiter.recordChallenge('oracle', 'synth', now + i * 200);
    }

    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 1000);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('challenge_per_hour');
  });

  it('normalizes pair order (A→B same as B→A)', () => {
    const limiter = createLimiter({ challengePerHour: 3, challengeCooldownMs: 100 });
    const now = Date.now();

    limiter.recordChallenge('oracle', 'synth', now);
    limiter.recordChallenge('synth', 'oracle', now + 200);

    const result = limiter.checkChallengeLimit('oracle', 'synth', now + 400);
    expect(result.challengeCount).toBe(2);
  });

  it('applies pair-specific overrides', () => {
    const limiter = new RateLimiter(
      { challengePerHour: 10, challengeCooldownMs: 100 },
      [{ pair: ['sentinel', 'atlas'], maxPerHour: 2, cooldownMs: 500 }]
    );
    const now = Date.now();

    limiter.recordChallenge('sentinel', 'atlas', now);
    limiter.recordChallenge('sentinel', 'atlas', now + 600);

    // Should be blocked by override (2/hour)
    const result = limiter.checkChallengeLimit('sentinel', 'atlas', now + 1200);
    expect(result.allowed).toBe(false);
    expect(result.maxPerHour).toBe(2);

    // Different pair should use default (10/hour)
    const result2 = limiter.checkChallengeLimit('oracle', 'archivist', now + 1200);
    expect(result2.allowed).toBe(true);
    expect(result2.maxPerHour).toBe(10);
  });
});

// ─── Combined Checks ──────────────────────────────────────────────────────

describe('RateLimiter — checkAll', () => {
  it('returns allowed when all checks pass', () => {
    const limiter = createLimiter();
    const result = limiter.checkAll('oracle', 'conv1');
    expect(result.allowed).toBe(true);
  });

  it('blocks on agent limit', () => {
    const limiter = createLimiter({ agentPerMinute: 1, burstAllowance: false });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);

    const result = limiter.checkAll('oracle', 'conv1', {}, now + 500);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('agent_per_minute');
  });

  it('blocks on conversation limit even if agent limit passes', () => {
    const limiter = createLimiter({ agentPerMinute: 100, conversationPerMinute: 1, burstAllowance: false });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);

    const result = limiter.checkAll('atlas', 'conv1', {}, now + 500);
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('conversation_per_minute');
  });

  it('checks challenge limits when isChallenge=true', () => {
    const limiter = createLimiter({ challengePerHour: 1, challengeCooldownMs: 100 });
    const now = Date.now();
    limiter.recordChallenge('oracle', 'synth', now);

    const result = limiter.checkAll(
      'oracle', 'conv1',
      { isChallenge: true, challengeTarget: 'synth' },
      now + 200
    );
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('challenge_per_hour');
  });

  it('ignores challenge limits when isChallenge=false', () => {
    const limiter = createLimiter({ challengePerHour: 1, challengeCooldownMs: 100 });
    const now = Date.now();
    limiter.recordChallenge('oracle', 'synth', now);

    const result = limiter.checkAll('oracle', 'conv1', {}, now + 200);
    expect(result.allowed).toBe(true);
  });
});

// ─── Backoff Strategy ─────────────────────────────────────────────────────

describe('RateLimiter — Backoff', () => {
  it('increases retry delay with exponential backoff on consecutive rejections', () => {
    const limiter = createLimiter({
      agentPerMinute: 1,
      burstAllowance: false,
      backoffStrategy: 'exponential',
    });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);

    const result1 = limiter.checkAgentLimit('oracle', now + 100);
    expect(result1.allowed).toBe(false);
    const delay1 = result1.retryAfterMs!;

    const result2 = limiter.checkAgentLimit('oracle', now + 200);
    expect(result2.allowed).toBe(false);
    const delay2 = result2.retryAfterMs!;

    // Second rejection should have higher delay due to exponential backoff
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('resets backoff after a successful check', () => {
    const limiter = createLimiter({
      agentPerMinute: 1,
      burstAllowance: false,
      backoffStrategy: 'exponential',
    });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);

    // Rejected
    limiter.checkAgentLimit('oracle', now + 100);
    limiter.checkAgentLimit('oracle', now + 200);

    // Wait for window to expire, then succeed
    const success = limiter.checkAgentLimit('oracle', now + 61000);
    expect(success.allowed).toBe(true);

    // Record and get rejected again — delay should be back to base
    limiter.recordMessage('oracle', 'conv1', now + 61000);
    const result = limiter.checkAgentLimit('oracle', now + 61100);
    expect(result.allowed).toBe(false);
    // Delay should be relatively low (base delay, first rejection)
  });
});

// ─── State Management ─────────────────────────────────────────────────────

describe('RateLimiter — State', () => {
  it('exports and imports state', () => {
    const limiter = createLimiter({ agentPerMinute: 3, burstAllowance: false });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('atlas', 'conv2', now + 1000);
    limiter.recordChallenge('oracle', 'synth', now + 2000);

    const state = limiter.exportState();
    expect(state.agentWindows).toBeDefined();
    expect(state.conversationWindows).toBeDefined();
    expect(state.challengeWindows).toBeDefined();

    const newLimiter = createLimiter({ agentPerMinute: 3, burstAllowance: false });
    newLimiter.importState(state);

    // Should have imported the recorded messages
    const result = newLimiter.checkAgentLimit('oracle', now + 3000);
    expect(result.usage.agentMinute).toBe(1);
  });

  it('resets all state', () => {
    const limiter = createLimiter({ agentPerMinute: 1, burstAllowance: false });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);

    expect(limiter.checkAgentLimit('oracle', now + 100).allowed).toBe(false);

    limiter.reset();

    expect(limiter.checkAgentLimit('oracle', now + 200).allowed).toBe(true);
  });

  it('resets individual agent', () => {
    const limiter = createLimiter({ agentPerMinute: 1, burstAllowance: false });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('atlas', 'conv1', now);

    limiter.resetAgent('oracle');

    expect(limiter.checkAgentLimit('oracle', now + 100).allowed).toBe(true);
    expect(limiter.checkAgentLimit('atlas', now + 100).allowed).toBe(false);
  });

  it('resets individual conversation', () => {
    const limiter = createLimiter({ conversationPerMinute: 1 });
    const now = Date.now();
    limiter.recordMessage('oracle', 'conv1', now);
    limiter.recordMessage('oracle', 'conv2', now);

    limiter.resetConversation('conv1');

    expect(limiter.checkConversationLimit('conv1', now + 100).allowed).toBe(true);
    expect(limiter.checkConversationLimit('conv2', now + 100).allowed).toBe(false);
  });

  it('prunes expired entries', () => {
    const limiter = createLimiter({ agentPerMinute: 100, agentPerHour: 100, burstAllowance: false });
    const now = Date.now();

    // Record some old messages
    limiter.recordMessage('oracle', 'conv1', now - 7200000); // 2 hours ago

    // Prune
    limiter.prune(now);

    // Check — should have no entries
    const result = limiter.checkAgentLimit('oracle', now);
    expect(result.usage.agentHour).toBe(0);
  });
});

// ─── Config Updates ───────────────────────────────────────────────────────

describe('RateLimiter — Config', () => {
  it('returns current config', () => {
    const limiter = createLimiter({ agentPerMinute: 42 });
    expect(limiter.getConfig().agentPerMinute).toBe(42);
  });

  it('updates config dynamically', () => {
    const limiter = createLimiter({ agentPerMinute: 5, burstAllowance: false });
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      limiter.recordMessage('oracle', 'conv1', now + i * 100);
    }

    // Should be blocked at 5/min
    expect(limiter.checkAgentLimit('oracle', now + 600).allowed).toBe(false);

    // Increase limit
    limiter.updateConfig({ agentPerMinute: 10 });

    // Should now be allowed
    expect(limiter.checkAgentLimit('oracle', now + 700).allowed).toBe(true);
  });
});

// ─── Singleton ────────────────────────────────────────────────────────────

describe('getDefaultRateLimiter', () => {
  afterEach(() => resetDefaultRateLimiter());

  it('returns the same instance', () => {
    const a = getDefaultRateLimiter();
    const b = getDefaultRateLimiter();
    expect(a).toBe(b);
  });

  it('creates new instance after reset', () => {
    const a = getDefaultRateLimiter();
    resetDefaultRateLimiter();
    const b = getDefaultRateLimiter();
    expect(a).not.toBe(b);
  });
});
