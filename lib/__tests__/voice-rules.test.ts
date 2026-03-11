import {
  validateStructure,
  detectFiller,
  stripFiller,
  detectFactHedging,
  validateVoiceMessage,
  validateRawText,
  voiceViolationsToEnforcementWarnings,
  createVoiceMessage,
  createStatusUpdate,
  FILLER_RULES,
  type VoiceMessage,
  type VoiceViolation,
  type FillerRule,
} from '../voice-rules';

// ─── Structural Validation ────────────────────────────────────────────────

describe('validateStructure', () => {
  const validMsg: VoiceMessage = {
    from: 'oracle',
    to: 'user',
    facts: [{ observation: 'Database is at 85% capacity', source: 'monitoring', confidence: 0.95 }],
    actions: [{ description: 'Sent capacity alert to atlas', status: 'completed' }],
    timestamp: '2026-02-14T16:00:00Z',
  };

  test('passes for a valid message', () => {
    const v = validateStructure(validMsg);
    expect(v).toHaveLength(0);
  });

  test('blocks missing "from"', () => {
    const v = validateStructure({ ...validMsg, from: '' });
    expect(v.some((e) => e.field === 'from' && e.severity === 'block')).toBe(true);
  });

  test('blocks missing "to"', () => {
    const v = validateStructure({ ...validMsg, to: undefined } as any);
    expect(v.some((e) => e.field === 'to' && e.severity === 'block')).toBe(true);
  });

  test('blocks non-array facts', () => {
    const v = validateStructure({ ...validMsg, facts: 'not-an-array' } as any);
    expect(v.some((e) => e.field === 'facts' && e.severity === 'block')).toBe(true);
  });

  test('blocks non-array actions', () => {
    const v = validateStructure({ ...validMsg, actions: null } as any);
    expect(v.some((e) => e.field === 'actions' && e.severity === 'block')).toBe(true);
  });

  test('blocks empty fact observation', () => {
    const v = validateStructure({
      ...validMsg,
      facts: [{ observation: '  ', source: 'test' }],
    });
    expect(v.some((e) => e.field === 'facts[0].observation' && e.severity === 'block')).toBe(true);
  });

  test('warns on out-of-range confidence', () => {
    const v = validateStructure({
      ...validMsg,
      facts: [{ observation: 'Something happened', confidence: 1.5 }],
    });
    expect(v.some((e) => e.field === 'facts[0].confidence' && e.severity === 'warning')).toBe(true);
  });

  test('warns on negative confidence', () => {
    const v = validateStructure({
      ...validMsg,
      facts: [{ observation: 'Something happened', confidence: -0.1 }],
    });
    expect(v.some((e) => e.field === 'facts[0].confidence')).toBe(true);
  });

  test('blocks invalid action status', () => {
    const v = validateStructure({
      ...validMsg,
      actions: [{ description: 'Did stuff', status: 'maybe' as any }],
    });
    expect(v.some((e) => e.field === 'actions[0].status' && e.severity === 'block')).toBe(true);
  });

  test('warns on blocked action without reason', () => {
    const v = validateStructure({
      ...validMsg,
      actions: [{ description: 'Tried to deploy', status: 'blocked' }],
    });
    expect(v.some((e) => e.field === 'actions[0].blockedReason' && e.severity === 'warning')).toBe(true);
  });

  test('accepts blocked action with reason', () => {
    const v = validateStructure({
      ...validMsg,
      actions: [{ description: 'Tried to deploy', status: 'blocked', blockedReason: 'No permission' }],
    });
    expect(v.filter((e) => e.field.includes('blockedReason'))).toHaveLength(0);
  });

  test('blocks empty message (no facts, no actions)', () => {
    const v = validateStructure({ ...validMsg, facts: [], actions: [] });
    expect(v.some((e) => e.rule === 'empty_message' && e.severity === 'block')).toBe(true);
  });

  test('warns on invalid timestamp', () => {
    const v = validateStructure({ ...validMsg, timestamp: 'not-a-date' });
    expect(v.some((e) => e.field === 'timestamp' && e.severity === 'warning')).toBe(true);
  });

  test('accepts valid ISO 8601 timestamp', () => {
    const v = validateStructure({ ...validMsg, timestamp: '2026-02-14T16:00:00.000Z' });
    expect(v.filter((e) => e.field === 'timestamp')).toHaveLength(0);
  });

  test('accepts all valid action statuses', () => {
    for (const status of ['completed', 'in_progress', 'planned', 'blocked'] as const) {
      const v = validateStructure({
        ...validMsg,
        actions: [{
          description: 'Test',
          status,
          ...(status === 'blocked' ? { blockedReason: 'test' } : {}),
        }],
      });
      expect(v.filter((e) => e.field.includes('status'))).toHaveLength(0);
    }
  });
});

// ─── Anti-Filler Detection ────────────────────────────────────────────────

describe('detectFiller', () => {
  test('detects "Great question" opener', () => {
    const v = detectFiller('Great question! Let me look into that.');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].rule).toBe('filler_sycophantic_opener');
    expect(v[0].severity).toBe('block');
  });

  test('detects "I\'d be happy to" opener', () => {
    const v = detectFiller("I'd be happy to help with that.");
    expect(v.some((r) => r.rule === 'filler_happy_to_help')).toBe(true);
    expect(v[0].severity).toBe('block');
  });

  test('detects "I\'m glad you asked"', () => {
    const v = detectFiller("I'm glad you asked about the deployment.");
    expect(v.some((r) => r.rule === 'filler_happy_to_help')).toBe(true);
  });

  test('detects standalone "Absolutely."', () => {
    const v = detectFiller('Absolutely.');
    expect(v.some((r) => r.rule === 'filler_filler_acknowledgment')).toBe(true);
    expect(v[0].severity).toBe('warning');
  });

  test('detects "Let me think about that"', () => {
    const v = detectFiller('Let me think about that for a moment.');
    expect(v.some((r) => r.rule === 'filler_thinking_stall')).toBe(true);
  });

  test('detects hedge phrases in body', () => {
    const v = detectFiller('I think that maybe we should reconsider the approach.');
    expect(v.some((r) => r.rule === 'filler_hedge_phrase')).toBe(true);
  });

  test('detects corporate filler', () => {
    const v = detectFiller('At the end of the day, we need to ship this.');
    expect(v.some((r) => r.rule === 'filler_corporate_filler')).toBe(true);
  });

  test('detects "moving forward"', () => {
    const v = detectFiller('Moving forward, we should adopt this pattern.');
    expect(v.some((r) => r.rule === 'filler_corporate_filler')).toBe(true);
  });

  test('detects meta-narration', () => {
    const v = detectFiller("I'll start by reviewing the logs.");
    expect(v.some((r) => r.rule === 'filler_meta_narration')).toBe(true);
  });

  test('detects "allow me to"', () => {
    const v = detectFiller('Allow me to explain the situation.');
    expect(v.some((r) => r.rule === 'filler_meta_narration')).toBe(true);
  });

  test('passes clean text with no filler', () => {
    const v = detectFiller('Database latency spiked to 450ms at 15:32 UTC.');
    expect(v).toHaveLength(0);
  });

  test('passes direct statements', () => {
    const v = detectFiller('Deployed v2.3.1 to production. Zero errors in 10 minutes.');
    expect(v).toHaveLength(0);
  });

  test('returns empty for empty/whitespace input', () => {
    expect(detectFiller('')).toHaveLength(0);
    expect(detectFiller('   ')).toHaveLength(0);
  });

  test('detects "it\'s worth noting"', () => {
    const v = detectFiller("It's worth noting that the metrics improved.");
    expect(v.some((r) => r.rule === 'filler_corporate_filler')).toBe(true);
  });

  test('detects "That\'s an interesting point"', () => {
    const v = detectFiller("That's an interesting point about caching.");
    expect(v.some((r) => r.rule === 'filler_thinking_stall')).toBe(true);
  });

  test('supports custom rules', () => {
    const custom: FillerRule[] = [
      {
        category: 'custom_test',
        description: 'Test rule',
        patterns: [/\bsynergy\b/i],
        severity: 'block',
      },
    ];
    const v = detectFiller('We need more synergy between teams.', custom);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('filler_custom_test');
  });
});

// ─── Filler Stripping ────────────────────────────────────────────────────

describe('stripFiller', () => {
  test('strips "Great question!" from start', () => {
    const result = stripFiller('Great question! The answer is 42.');
    expect(result).toBe('The answer is 42.');
  });

  test('strips "I\'d be happy to" from start', () => {
    const result = stripFiller("I'd be happy to review that PR.");
    expect(result).toBe('Review that PR.');
  });

  test('strips "Let me think about that"', () => {
    const result = stripFiller('Let me think about that. The issue is in the cache layer.');
    expect(result).toBe('The issue is in the cache layer.');
  });

  test('returns empty for pure filler', () => {
    const result = stripFiller('Absolutely.');
    expect(result).toBe('');
  });

  test('leaves clean text unchanged', () => {
    const result = stripFiller('Database latency is 450ms.');
    expect(result).toBe('Database latency is 450ms.');
  });

  test('handles empty input', () => {
    expect(stripFiller('')).toBe('');
    expect(stripFiller('  ')).toBe('');
  });

  test('capitalizes first letter after stripping', () => {
    const result = stripFiller("Well, the problem is obvious.");
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });
});

// ─── Fact Hedging Detection ──────────────────────────────────────────────

describe('detectFactHedging', () => {
  test('detects "probably" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'The service is probably down' }]);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('fact_hedging');
    expect(v[0].details).toContain('0.7');
  });

  test('detects "might be" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'This might be a memory leak' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('0.5');
  });

  test('detects "seems like" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'It seems like the config changed' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('0.6');
  });

  test('detects "I think" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'I think the test is flaky' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('confidence score');
  });

  test('detects "likely" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'The root cause is likely a race condition' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('0.75');
  });

  test('detects "unlikely" in fact observation', () => {
    const v = detectFactHedging([{ observation: 'A full outage is unlikely' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('0.25');
  });

  test('passes clean factual statements', () => {
    const v = detectFactHedging([
      { observation: 'CPU usage is 92%', source: 'grafana', confidence: 1.0 },
      { observation: 'Last deploy was at 14:22 UTC', source: 'deploy_logs' },
    ]);
    expect(v).toHaveLength(0);
  });

  test('checks all facts in array', () => {
    const v = detectFactHedging([
      { observation: 'The server is down' },
      { observation: 'The cause is probably a network issue' },
      { observation: 'Recovery might be slow' },
    ]);
    expect(v).toHaveLength(2);
    expect(v[0].field).toBe('facts[1].observation');
    expect(v[1].field).toBe('facts[2].observation');
  });

  test('detects "appears to"', () => {
    const v = detectFactHedging([{ observation: 'The service appears to be degraded' }]);
    expect(v).toHaveLength(1);
  });

  test('detects "possibly"', () => {
    const v = detectFactHedging([{ observation: 'This is possibly related to the last deploy' }]);
    expect(v).toHaveLength(1);
    expect(v[0].details).toContain('0.4');
  });
});

// ─── Full Message Validation ─────────────────────────────────────────────

describe('validateVoiceMessage', () => {
  const cleanMessage: VoiceMessage = {
    from: 'verifier',
    to: 'nexus',
    facts: [
      { observation: 'All 29 KPI tests pass', source: 'jest', confidence: 1.0 },
      { observation: 'Code coverage is 84%', source: 'jest --coverage' },
    ],
    actions: [
      { description: 'Ran full test suite', status: 'completed' },
      { description: 'Will update coverage report', status: 'planned' },
    ],
    summary: 'KPI registry validation complete. All tests pass, coverage above threshold.',
  };

  test('passes a clean message', () => {
    const result = validateVoiceMessage(cleanMessage);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('catches filler in summary', () => {
    const result = validateVoiceMessage({
      ...cleanMessage,
      summary: "Great question! I'd be happy to report the results.",
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.field === 'summary')).toBe(true);
  });

  test('catches hedging in facts', () => {
    const result = validateVoiceMessage({
      ...cleanMessage,
      facts: [{ observation: 'The deploy probably succeeded' }],
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'fact_hedging')).toBe(true);
  });

  test('catches filler in fact observations', () => {
    const result = validateVoiceMessage({
      ...cleanMessage,
      facts: [{ observation: "Well, the database is at 85% capacity" }],
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.field === 'facts[0].observation')).toBe(true);
  });

  test('catches filler in action descriptions', () => {
    const result = validateVoiceMessage({
      ...cleanMessage,
      actions: [{ description: "I'll start by reviewing the logs", status: 'planned' }],
    });
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.field === 'actions[0].description')).toBe(true);
  });

  test('blocks structurally invalid message before checking filler', () => {
    const result = validateVoiceMessage({ from: '', to: '', facts: [], actions: [] });
    expect(result.valid).toBe(false);
    // Should have structural violations but NOT filler violations
    expect(result.violations.every((v) => v.rule === 'required_field' || v.rule === 'empty_message')).toBe(true);
  });

  test('auto-clean strips filler from text fields', () => {
    const result = validateVoiceMessage(
      {
        ...cleanMessage,
        summary: 'Great question! The tests all pass.',
      },
      { autoClean: true }
    );
    expect(result.cleaned).toBeDefined();
    expect(result.cleaned!.summary).toBe('The tests all pass.');
  });

  test('auto-clean preserves original when no filler detected', () => {
    const result = validateVoiceMessage(cleanMessage, { autoClean: true });
    // No filler → no cleaned property
    expect(result.cleaned).toBeUndefined();
  });

  test('combines violations from multiple fields', () => {
    const result = validateVoiceMessage({
      from: 'oracle',
      to: 'user',
      facts: [{ observation: 'The build probably failed' }],
      actions: [{ description: "I'd be happy to investigate", status: 'planned' }],
      summary: "Let me think about that. Moving forward, we should check logs.",
    });
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Raw Text Validation ─────────────────────────────────────────────────

describe('validateRawText', () => {
  test('passes clean text', () => {
    const result = validateRawText('Deploy completed in 34s. Zero errors.');
    expect(result.valid).toBe(true);
  });

  test('catches filler in raw text', () => {
    const result = validateRawText("I'd be happy to help with that deployment issue.");
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// ─── Enforcement Integration ─────────────────────────────────────────────

describe('voiceViolationsToEnforcementWarnings', () => {
  test('converts violations to enforcement format', () => {
    const violations: VoiceViolation[] = [
      {
        rule: 'filler_sycophantic_opener',
        field: 'summary',
        severity: 'block',
        details: 'Sycophantic opening phrases that add no information',
        match: 'Great question',
      },
      {
        rule: 'fact_hedging',
        field: 'facts[0].observation',
        severity: 'warning',
        details: 'Use confidence: 0.7 instead of "probably"',
        match: 'probably',
      },
    ];

    const warnings = voiceViolationsToEnforcementWarnings(violations);
    expect(warnings).toHaveLength(2);

    expect(warnings[0].enforcement).toBe('voice_rules');
    expect(warnings[0].severity).toBe('block');
    expect(warnings[0].details).toContain('Great question');

    expect(warnings[1].enforcement).toBe('voice_rules');
    expect(warnings[1].severity).toBe('warning');
    expect(warnings[1].details).toContain('probably');
  });

  test('handles empty violations array', () => {
    const warnings = voiceViolationsToEnforcementWarnings([]);
    expect(warnings).toHaveLength(0);
  });

  test('handles violations without match', () => {
    const violations: VoiceViolation[] = [
      {
        rule: 'empty_message',
        field: 'facts+actions',
        severity: 'block',
        details: 'Message must contain at least one fact or action.',
      },
    ];
    const warnings = voiceViolationsToEnforcementWarnings(violations);
    expect(warnings[0].details).not.toContain('matched:');
  });
});

// ─── Message Builders ────────────────────────────────────────────────────

describe('createVoiceMessage', () => {
  test('creates a valid message', () => {
    const msg = createVoiceMessage(
      'atlas',
      'nexus',
      [{ observation: 'Deploy succeeded', source: 'deploy_logs', confidence: 1.0 }],
      [{ description: 'Deployed v2.3.1', status: 'completed' }]
    );
    expect(msg.from).toBe('atlas');
    expect(msg.to).toBe('nexus');
    expect(msg.timestamp).toBeDefined();
  });

  test('throws on invalid message', () => {
    expect(() =>
      createVoiceMessage('', 'nexus', [], [])
    ).toThrow('Invalid VoiceMessage');
  });

  test('accepts optional summary and timestamp', () => {
    const msg = createVoiceMessage(
      'sentinel',
      'user',
      [{ observation: 'No security issues found' }],
      [{ description: 'Completed security scan', status: 'completed' }],
      { summary: 'All clear.', timestamp: '2026-02-14T16:00:00Z' }
    );
    expect(msg.summary).toBe('All clear.');
    expect(msg.timestamp).toBe('2026-02-14T16:00:00Z');
  });
});

describe('createStatusUpdate', () => {
  test('creates a structured status update', () => {
    const msg = createStatusUpdate(
      'synth',
      'nexus',
      ['Build completed', 'Test suite green'],
      [
        { description: 'Built feature branch', status: 'completed' },
        { description: 'Merge to main', status: 'planned' },
      ],
      { summary: 'Ready to merge.' }
    );
    expect(msg.facts).toHaveLength(2);
    expect(msg.actions).toHaveLength(2);
    expect(msg.summary).toBe('Ready to merge.');
    expect(msg.from).toBe('synth');
    expect(msg.to).toBe('nexus');
  });
});

// ─── Agent-Specific Examples ─────────────────────────────────────────────

describe('agent-specific message examples', () => {
  test('Oracle research report', () => {
    const msg: VoiceMessage = {
      from: 'oracle',
      to: 'user',
      facts: [
        { observation: 'Claude Opus 4 shows 15% improvement on GPQA over Claude 3.5 Sonnet', source: 'https://anthropic.com/benchmarks', confidence: 0.95 },
        { observation: 'No published benchmarks for multi-agent coordination tasks', confidence: 0.8 },
      ],
      actions: [
        { description: 'Searched Anthropic docs, arXiv, and HuggingFace for benchmarks', status: 'completed' },
        { description: 'Will check OpenAI blog for comparison data', status: 'planned' },
      ],
      summary: '15% GPQA improvement confirmed. Multi-agent benchmarks not yet published.',
    };
    const result = validateVoiceMessage(msg);
    expect(result.valid).toBe(true);
  });

  test('Atlas deployment update', () => {
    const msg: VoiceMessage = {
      from: 'atlas',
      to: 'nexus',
      facts: [
        { observation: 'v2.3.1 deployed to production at 14:22 UTC', source: 'deploy_logs', confidence: 1.0 },
        { observation: 'Health check passed: 200 OK on /health', source: 'monitoring', confidence: 1.0 },
        { observation: 'Memory usage stable at 340MB (baseline 320MB)', source: 'grafana', confidence: 0.95 },
      ],
      actions: [
        { description: 'Deployed v2.3.1 with zero-downtime rolling update', status: 'completed' },
        { description: 'Monitoring for 15 minutes before marking stable', status: 'in_progress' },
      ],
    };
    const result = validateVoiceMessage(msg);
    expect(result.valid).toBe(true);
  });

  test('Sentinel security alert', () => {
    const msg: VoiceMessage = {
      from: 'sentinel',
      to: 'echo',
      facts: [
        { observation: '47 failed SSH login attempts from 192.168.1.105 in last 10 minutes', source: 'auth.log', confidence: 1.0 },
        { observation: 'IP is internal (developer workstation)', source: 'asset_inventory', confidence: 0.9 },
      ],
      actions: [
        { description: 'Rate-limited IP for 30 minutes', status: 'completed' },
        { description: 'Notified user to check workstation', status: 'completed' },
        { description: 'Full incident report', status: 'planned' },
      ],
      summary: 'Brute-force attempt from internal IP. Rate-limited. User notified.',
    };
    const result = validateVoiceMessage(msg);
    expect(result.valid).toBe(true);
  });

  test('Verifier validation report', () => {
    const msg: VoiceMessage = {
      from: 'verifier',
      to: 'nexus',
      facts: [
        { observation: '29/29 tests pass', source: 'jest', confidence: 1.0 },
        { observation: 'Code coverage at 84% (threshold: 70%)', source: 'jest --coverage', confidence: 1.0 },
        { observation: '2 TypeScript strict-mode warnings in kpi-registry.ts', source: 'tsc --noEmit', confidence: 1.0 },
      ],
      actions: [
        { description: 'Ran full test suite and coverage report', status: 'completed' },
        { description: 'Flagged TS warnings to synth for fix', status: 'completed' },
      ],
    };
    const result = validateVoiceMessage(msg);
    expect(result.valid).toBe(true);
  });

  test('BAD message: Oracle with hedging and filler', () => {
    const msg: VoiceMessage = {
      from: 'oracle',
      to: 'user',
      facts: [
        { observation: 'The model is probably faster than the baseline' },
        { observation: 'I think the benchmarks might be outdated' },
      ],
      actions: [
        { description: "I'd be happy to look into this more", status: 'planned' },
      ],
      summary: "Great question! Let me think about that. It seems like the data supports this.",
    };
    const result = validateVoiceMessage(msg);
    expect(result.valid).toBe(false);
    // Should catch: hedging (x2), filler opener (x1), happy-to-help (x1), thinking stall (x1)
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('filler detection is case-insensitive', () => {
    expect(detectFiller('GREAT QUESTION!')).toHaveLength(1);
    expect(detectFiller("i'd BE HAPPY TO help")).toHaveLength(1);
    expect(detectFiller('LET ME THINK ABOUT THAT')).toHaveLength(1);
  });

  test('"Absolutely" in a sentence is not flagged (only standalone)', () => {
    const v = detectFiller('The test is absolutely necessary for coverage.');
    // The standalone pattern requires end-of-string, so this should NOT match.
    expect(v.filter((r) => r.rule === 'filler_filler_acknowledgment')).toHaveLength(0);
  });

  test('multiple violations in one text', () => {
    const v = detectFiller("Well, I think that maybe we should. At the end of the day, it's worth noting that this matters.");
    expect(v.length).toBeGreaterThanOrEqual(2);
  });

  test('FILLER_RULES is exported and has expected categories', () => {
    const categories = FILLER_RULES.map((r) => r.category);
    expect(categories).toContain('sycophantic_opener');
    expect(categories).toContain('happy_to_help');
    expect(categories).toContain('filler_acknowledgment');
    expect(categories).toContain('thinking_stall');
    expect(categories).toContain('hedge_phrase');
    expect(categories).toContain('corporate_filler');
    expect(categories).toContain('meta_narration');
  });

  test('fact with both hedging and filler gets both violations', () => {
    const result = validateVoiceMessage({
      from: 'oracle',
      to: 'user',
      facts: [{ observation: 'Well, this probably works' }],
      actions: [{ description: 'Checked it', status: 'completed' }],
    });
    expect(result.violations.some((v) => v.rule === 'fact_hedging')).toBe(true);
    expect(result.violations.some((v) => v.rule.startsWith('filler_'))).toBe(true);
  });
});
