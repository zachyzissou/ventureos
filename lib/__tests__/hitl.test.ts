import {
  HITLEngine,
  BUILTIN_TRIGGERS,
  formatAlertForDiscord,
  getDefaultHITLEngine,
  resetDefaultHITLEngine,
  type ConversationState,
  type HITLAlert,
  type HITLTrigger,
} from '../hitl';

// ─── Helpers ──────────────────────────────────────────────────────────────

function createEngine(config = {}) {
  return new HITLEngine(config);
}

function makeConversationState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'conv-test-1',
    participants: ['oracle', 'atlas', 'sentinel'],
    messageCount: 5,
    challengeCount: 0,
    consecutiveChallenges: 0,
    averageAffinity: 0.7,
    lowestAffinity: 0.6,
    lowestAffinityPair: ['oracle', 'synth'],
    tokenBudget: 5000,
    tokensUsed: 1000,
    injectionScores: [0, 0, 0.1],
    policyViolationCount: 0,
    voiceRuleViolationCount: 0,
    ...overrides,
  };
}

// ─── Injection Score Checks ───────────────────────────────────────────────

describe('HITLEngine — Injection Score', () => {
  it('continues for low injection scores', () => {
    const engine = createEngine();
    const result = engine.checkInjectionScore(0.1);
    expect(result.action).toBe('continue');
    expect(result.triggered).toBe(false);
  });

  it('notifies for moderate injection scores', () => {
    const engine = createEngine({ injectionNotifyThreshold: 0.3 });
    const result = engine.checkInjectionScore(0.45);
    expect(result.action).toBe('notify');
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers.length).toBe(1);
    expect(result.matchedTriggers[0].id).toBe('injection_notify');
  });

  it('requires approval for high injection scores', () => {
    const engine = createEngine({ injectionApprovalThreshold: 0.7 });
    const result = engine.checkInjectionScore(0.85);
    expect(result.action).toBe('require_approval');
    expect(result.triggered).toBe(true);
    expect(result.urgency).toBe('critical');
    expect(result.matchedTriggers[0].id).toBe('injection_block');
  });

  it('respects custom thresholds', () => {
    const engine = createEngine({
      injectionNotifyThreshold: 0.1,
      injectionApprovalThreshold: 0.5,
    });

    expect(engine.checkInjectionScore(0.15).action).toBe('notify');
    expect(engine.checkInjectionScore(0.6).action).toBe('require_approval');
  });
});

// ─── Conversation State Checks ────────────────────────────────────────────

describe('HITLEngine — Conversation State', () => {
  it('continues for healthy conversation state', () => {
    const engine = createEngine();
    const result = engine.checkConversationState(makeConversationState());
    expect(result.action).toBe('continue');
    expect(result.triggered).toBe(false);
  });

  it('pauses on consecutive challenges exceeding limit', () => {
    const engine = createEngine({ consecutiveChallengeLimit: 3 });
    const state = makeConversationState({ consecutiveChallenges: 4 });
    const result = engine.checkConversationState(state);
    expect(result.action).toBe('pause');
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers[0].id).toBe('consecutive_challenges');
  });

  it('notifies on low affinity challenge', () => {
    const engine = createEngine({ lowAffinityThreshold: 0.3 });
    const state = makeConversationState({
      lowestAffinity: 0.2,
      challengeCount: 1,
      lowestAffinityPair: ['oracle', 'synth'],
    });
    const result = engine.checkConversationState(state);
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers.some(t => t.id === 'low_affinity_challenge')).toBe(true);
  });

  it('does not trigger low affinity without challenges', () => {
    const engine = createEngine({ lowAffinityThreshold: 0.3 });
    const state = makeConversationState({
      lowestAffinity: 0.1,
      challengeCount: 0,
    });
    const result = engine.checkConversationState(state);
    expect(result.matchedTriggers.some(t => t.id === 'low_affinity_challenge')).toBe(false);
  });

  it('notifies on token budget warning', () => {
    const engine = createEngine({ tokenBudgetWarningRatio: 0.8 });
    const state = makeConversationState({ tokenBudget: 5000, tokensUsed: 4200 });
    const result = engine.checkConversationState(state);
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers.some(t => t.id === 'token_budget_warning')).toBe(true);
  });

  it('pauses on token budget exhaustion', () => {
    const engine = createEngine({ tokenBudgetPauseRatio: 0.95 });
    const state = makeConversationState({ tokenBudget: 5000, tokensUsed: 4800 });
    const result = engine.checkConversationState(state);
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers.some(t => t.id === 'token_budget_exhaustion')).toBe(true);
    expect(result.action).toBe('pause');
  });

  it('handles zero token budget gracefully', () => {
    const engine = createEngine();
    const state = makeConversationState({ tokenBudget: 0, tokensUsed: 100 });
    const result = engine.checkConversationState(state);
    // Should not trigger budget checks when budget is 0
    expect(result.matchedTriggers.filter(t => t.id.includes('token_budget'))).toHaveLength(0);
  });

  it('detects high injection scores in conversation history', () => {
    const engine = createEngine({ injectionApprovalThreshold: 0.7 });
    const state = makeConversationState({ injectionScores: [0, 0.1, 0.85] });
    const result = engine.checkConversationState(state);
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers.some(t => t.id === 'injection_block')).toBe(true);
  });

  it('picks most severe action from multiple triggers', () => {
    const engine = createEngine({
      consecutiveChallengeLimit: 2,
      tokenBudgetPauseRatio: 0.95,
      injectionApprovalThreshold: 0.7,
    });
    const state = makeConversationState({
      consecutiveChallenges: 5,
      tokenBudget: 5000,
      tokensUsed: 4900,
      injectionScores: [0, 0.8],
    });
    const result = engine.checkConversationState(state);
    expect(result.action).toBe('require_approval'); // Most severe
    expect(result.matchedTriggers.length).toBeGreaterThan(1);
  });
});

// ─── Policy Violation Checks ──────────────────────────────────────────────

describe('HITLEngine — Policy Violations', () => {
  it('requires approval for infrastructure violations', () => {
    const engine = createEngine();
    const result = engine.checkPolicyViolations([
      { tier: 'infrastructure', rule: 'No database writes', severity: 'block' },
    ]);
    expect(result.action).toBe('require_approval');
    expect(result.urgency).toBe('critical');
  });

  it('notifies for heuristic violations', () => {
    const engine = createEngine();
    const result = engine.checkPolicyViolations([
      { tier: 'heuristic', rule: 'No uncited claims', severity: 'warning' },
    ]);
    expect(result.action).toBe('notify');
  });

  it('continues for empty violations', () => {
    const engine = createEngine();
    const result = engine.checkPolicyViolations([]);
    expect(result.action).toBe('continue');
    expect(result.triggered).toBe(false);
  });

  it('handles mixed violation tiers', () => {
    const engine = createEngine();
    const result = engine.checkPolicyViolations([
      { tier: 'heuristic', rule: 'Uncited', severity: 'warning' },
      { tier: 'infrastructure', rule: 'Blocked', severity: 'block' },
    ]);
    expect(result.action).toBe('require_approval'); // Most severe
  });
});

// ─── Voice Rule Violation Checks ──────────────────────────────────────────

describe('HITLEngine — Voice Rule Violations', () => {
  it('notifies for blocking voice rule violations', () => {
    const engine = createEngine();
    const result = engine.checkVoiceRuleViolations([
      { rule: 'filler_sycophantic_opener', severity: 'block' },
    ]);
    expect(result.triggered).toBe(true);
    expect(result.matchedTriggers[0].id).toBe('voice_rule_violation');
  });

  it('continues for warning-level voice violations', () => {
    const engine = createEngine();
    const result = engine.checkVoiceRuleViolations([
      { rule: 'filler_hedge_phrase', severity: 'warning' },
    ]);
    expect(result.action).toBe('continue');
    expect(result.triggered).toBe(false);
  });
});

// ─── Rate Limit Checks ───────────────────────────────────────────────────

describe('HITLEngine — Rate Limit Checks', () => {
  it('notifies when agent is rate limited', () => {
    const engine = createEngine();
    const result = engine.checkRateLimitResult(
      {
        allowed: false,
        limitType: 'agent_per_minute',
        retryAfterMs: 5000,
        usage: { agentMinute: 10, agentHour: 50 },
        limits: { agentPerMinute: 10, agentPerHour: 120 },
      },
      'oracle'
    );
    expect(result.triggered).toBe(true);
    expect(result.action).toBe('notify');
  });

  it('continues when rate limit passes', () => {
    const engine = createEngine();
    const result = engine.checkRateLimitResult(
      {
        allowed: true,
        usage: { agentMinute: 5, agentHour: 20 },
        limits: { agentPerMinute: 10, agentPerHour: 120 },
      },
      'oracle'
    );
    expect(result.triggered).toBe(false);
  });
});

// ─── Combined checkMessage ────────────────────────────────────────────────

describe('HITLEngine — checkMessage (combined)', () => {
  it('runs all checks and returns most severe action', async () => {
    const engine = createEngine();
    const result = await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState({ consecutiveChallenges: 5 }),
      injectionScore: 0.8,
      policyViolations: [{ tier: 'infrastructure', rule: 'No deploy', severity: 'block' }],
    });

    expect(result.triggered).toBe(true);
    expect(result.action).toBe('require_approval');
    expect(result.matchedTriggers.length).toBeGreaterThan(1);
  });

  it('continues when everything is clean', async () => {
    const engine = createEngine();
    const result = await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0,
    });

    expect(result.triggered).toBe(false);
    expect(result.action).toBe('continue');
  });

  it('fires alert handlers when triggered', async () => {
    const engine = createEngine();
    const receivedAlerts: HITLAlert[] = [];
    engine.onAlert(async (alert) => { receivedAlerts.push(alert); });

    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    expect(receivedAlerts.length).toBeGreaterThan(0);
    expect(receivedAlerts[0].trigger.id).toBe('injection_block');
    expect(receivedAlerts[0].status).toBe('pending');
  });

  it('does not fire handlers when not triggered', async () => {
    const engine = createEngine();
    const receivedAlerts: HITLAlert[] = [];
    engine.onAlert(async (alert) => { receivedAlerts.push(alert); });

    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0,
    });

    expect(receivedAlerts).toHaveLength(0);
  });
});

// ─── Alert Management ─────────────────────────────────────────────────────

describe('HITLEngine — Alert Management', () => {
  it('stores and retrieves pending alerts', async () => {
    const engine = createEngine();
    engine.onAlert(async () => {});

    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    const pending = engine.getPendingAlerts();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].status).toBe('pending');
  });

  it('acknowledges alerts', async () => {
    const engine = createEngine();
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    const pending = engine.getPendingAlerts();
    const alertId = pending[0].alertId;

    const ok = engine.acknowledgeAlert(alertId);
    expect(ok).toBe(true);

    const alert = engine.getAlert(alertId);
    expect(alert?.status).toBe('acknowledged');
  });

  it('approves alerts', async () => {
    const engine = createEngine();
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    const alertId = engine.getPendingAlerts()[0].alertId;
    const ok = engine.approveAlert(alertId);
    expect(ok).toBe(true);

    expect(engine.getAlert(alertId)?.status).toBe('approved');
    expect(engine.getPendingAlerts()).toHaveLength(0);
  });

  it('rejects alerts', async () => {
    const engine = createEngine();
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    const alertId = engine.getPendingAlerts()[0].alertId;
    const ok = engine.rejectAlert(alertId);
    expect(ok).toBe(true);

    expect(engine.getAlert(alertId)?.status).toBe('rejected');
  });

  it('does not acknowledge non-pending alerts', async () => {
    const engine = createEngine();
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    const alertId = engine.getPendingAlerts()[0].alertId;
    engine.approveAlert(alertId);

    // Already approved — should fail
    const ok = engine.acknowledgeAlert(alertId);
    expect(ok).toBe(false);
  });

  it('expires old alerts', async () => {
    const engine = createEngine({ alertExpiryMs: 1000 });
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    expect(engine.getPendingAlerts().length).toBeGreaterThan(0);

    // Expire after 2 seconds
    const expired = engine.expireAlerts(Date.now() + 2000);
    expect(expired).toBeGreaterThan(0);
    expect(engine.getPendingAlerts()).toHaveLength(0);
  });

  it('resets all alerts', async () => {
    const engine = createEngine();
    await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    engine.resetAlerts();
    expect(engine.getPendingAlerts()).toHaveLength(0);
  });
});

// ─── Trigger Management ───────────────────────────────────────────────────

describe('HITLEngine — Trigger Management', () => {
  it('lists builtin triggers', () => {
    const engine = createEngine();
    const triggers = engine.getTriggers();
    expect(triggers.length).toBe(BUILTIN_TRIGGERS.length);
  });

  it('adds custom triggers', () => {
    const engine = createEngine();
    const customTrigger: HITLTrigger = {
      id: 'custom_test',
      description: 'Test trigger',
      action: 'pause',
      urgency: 'high',
      enabled: true,
      category: 'security',
    };
    engine.addTrigger(customTrigger);
    const found = engine.getTriggers().find(t => t.id === 'custom_test');
    expect(found).toBeDefined();
    expect(found!.action).toBe('pause');
    expect(found!.urgency).toBe('high');
    expect(found!.category).toBe('security');
  });

  it('replaces trigger with same ID', () => {
    const engine = createEngine();
    const triggers = engine.getTriggers();
    const initialCount = triggers.length;

    engine.addTrigger({
      id: 'injection_notify',
      description: 'Replaced trigger',
      action: 'pause',
      urgency: 'high',
      enabled: true,
      category: 'security',
    });

    expect(engine.getTriggers().length).toBe(initialCount);
    expect(engine.getTriggers().find(t => t.id === 'injection_notify')?.action).toBe('pause');
  });

  it('disables and enables triggers', () => {
    const engine = createEngine();

    engine.setTriggerEnabled('injection_block', false);
    const result = engine.checkInjectionScore(0.9);
    expect(result.matchedTriggers.find(t => t.id === 'injection_block')).toBeUndefined();

    engine.setTriggerEnabled('injection_block', true);
    const result2 = engine.checkInjectionScore(0.9);
    expect(result2.matchedTriggers.find(t => t.id === 'injection_block')).toBeDefined();
  });
});

// ─── Discord Formatting ───────────────────────────────────────────────────

describe('formatAlertForDiscord', () => {
  it('formats a critical alert', () => {
    const alert: HITLAlert = {
      alertId: 'test-1',
      timestamp: new Date().toISOString(),
      trigger: {
        id: 'injection_block',
        description: 'High prompt injection score',
        action: 'require_approval',
        urgency: 'critical',
        enabled: true,
        category: 'security',
      },
      reason: 'Injection score 0.85 exceeds threshold',
      context: { agentId: 'oracle', injectionScore: 0.85 },
      status: 'pending',
    };

    const formatted = formatAlertForDiscord(alert);
    expect(formatted.title).toContain('🔴');
    expect(formatted.title).toContain('injection_block');
    expect(formatted.description).toContain('REQUIRE APPROVAL');
    expect(formatted.description).toContain('oracle');
    expect(formatted.description).toContain('0.85');
    expect(formatted.color).toBe('#7f1d1d');
  });

  it('formats a medium-urgency alert', () => {
    const alert: HITLAlert = {
      alertId: 'test-2',
      timestamp: new Date().toISOString(),
      trigger: {
        id: 'low_affinity_challenge',
        description: 'Low affinity challenge',
        action: 'notify',
        urgency: 'medium',
        enabled: true,
        category: 'safety',
      },
      reason: 'Affinity 0.2 between oracle and synth',
      context: { agentId: 'oracle', affinityScore: 0.2 },
      status: 'pending',
    };

    const formatted = formatAlertForDiscord(alert);
    expect(formatted.title).toContain('⚠️');
    expect(formatted.color).toBe('#f59e0b');
  });

  it('includes all provided context fields', () => {
    const alert: HITLAlert = {
      alertId: 'test-3',
      timestamp: new Date().toISOString(),
      trigger: BUILTIN_TRIGGERS[0],
      reason: 'Test',
      context: {
        agentId: 'atlas',
        conversationId: 'conv-123',
        challengeCount: 5,
        roleCardViolations: ['No deploy', 'Uncited claim'],
      },
      status: 'pending',
    };

    const formatted = formatAlertForDiscord(alert);
    expect(formatted.description).toContain('atlas');
    expect(formatted.description).toContain('conv-123');
    expect(formatted.description).toContain('5');
    expect(formatted.description).toContain('No deploy');
  });
});

// ─── Config Management ────────────────────────────────────────────────────

describe('HITLEngine — Config', () => {
  it('returns current config', () => {
    const engine = createEngine({ injectionNotifyThreshold: 0.5 });
    expect(engine.getConfig().injectionNotifyThreshold).toBe(0.5);
  });

  it('updates config dynamically', () => {
    const engine = createEngine({ consecutiveChallengeLimit: 3 });

    // Should trigger at 4
    const state = makeConversationState({ consecutiveChallenges: 4 });
    expect(engine.checkConversationState(state).triggered).toBe(true);

    // Update to 5
    engine.updateConfig({ consecutiveChallengeLimit: 5 });

    // Should no longer trigger at 4
    expect(engine.checkConversationState(state).triggered).toBe(false);
  });
});

// ─── Singleton ────────────────────────────────────────────────────────────

describe('getDefaultHITLEngine', () => {
  afterEach(() => resetDefaultHITLEngine());

  it('returns the same instance', () => {
    const a = getDefaultHITLEngine();
    const b = getDefaultHITLEngine();
    expect(a).toBe(b);
  });

  it('creates new instance after reset', () => {
    const a = getDefaultHITLEngine();
    resetDefaultHITLEngine();
    const b = getDefaultHITLEngine();
    expect(a).not.toBe(b);
  });
});

// ─── Error Resilience ─────────────────────────────────────────────────────

describe('HITLEngine — Error Resilience', () => {
  it('continues if alert handler throws', async () => {
    const engine = createEngine();
    engine.onAlert(async () => { throw new Error('Handler failed!'); });

    // Should not throw
    const result = await engine.checkMessage({
      agentId: 'oracle',
      conversationState: makeConversationState(),
      injectionScore: 0.8,
    });

    expect(result.triggered).toBe(true);
  });
});
