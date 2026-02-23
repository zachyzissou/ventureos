/**
 * Default Voice Trigger Rules — unit tests (#209)
 *
 * Validates that each default rule matches/resolves the correct events
 * and that priority ordering and cooldowns are sensible.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_VOICE_TRIGGER_RULES } from '@/audio/voice-trigger-rules';
import type { VoiceMapEvent } from '@/audio/voice-types';

function makeEvent(
  type: VoiceMapEvent['type'],
  agentId: string,
  extra?: Partial<VoiceMapEvent>,
): VoiceMapEvent {
  return {
    type,
    agentId: agentId as any,
    timestamp: Date.now(),
    ...extra,
  };
}

describe('DEFAULT_VOICE_TRIGGER_RULES', () => {
  it('is a non-empty array', () => {
    expect(DEFAULT_VOICE_TRIGGER_RULES.length).toBeGreaterThan(0);
  });

  it('is sorted by priority descending', () => {
    for (let i = 1; i < DEFAULT_VOICE_TRIGGER_RULES.length; i++) {
      expect(DEFAULT_VOICE_TRIGGER_RULES[i - 1].priority)
        .toBeGreaterThanOrEqual(DEFAULT_VOICE_TRIGGER_RULES[i].priority);
    }
  });

  it('all rules have unique ids', () => {
    const ids = DEFAULT_VOICE_TRIGGER_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all rules have positive cooldowns', () => {
    for (const rule of DEFAULT_VOICE_TRIGGER_RULES) {
      if (rule.cooldownMs !== undefined) {
        expect(rule.cooldownMs).toBeGreaterThan(0);
      }
    }
  });
});

describe('state:error rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'state:error')!;

  it('exists and has highest priority', () => {
    expect(rule).toBeDefined();
    expect(rule.priority).toBe(100);
  });

  it('matches state-change to ERROR', () => {
    const event = makeEvent('state-change', 'oracle', { newState: 'ERROR' });
    expect(rule.matches(event)).toBe(true);
  });

  it('does not match state-change to ACTIVE', () => {
    const event = makeEvent('state-change', 'oracle', { newState: 'ACTIVE' });
    expect(rule.matches(event)).toBe(false);
  });

  it('resolves to error trigger for the event agent', () => {
    const event = makeEvent('state-change', 'sentinel', { newState: 'ERROR' });
    const result = rule.resolve(event);
    expect(result).toEqual({ agentId: 'sentinel', trigger: 'error' });
  });
});

describe('state:overloaded rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'state:overloaded')!;

  it('matches state-change to OVERLOADED', () => {
    expect(rule.matches(makeEvent('state-change', 'atlas', { newState: 'OVERLOADED' }))).toBe(true);
  });

  it('does not match IDLE', () => {
    expect(rule.matches(makeEvent('state-change', 'atlas', { newState: 'IDLE' }))).toBe(false);
  });

  it('resolves to overloaded trigger', () => {
    const result = rule.resolve(makeEvent('state-change', 'atlas', { newState: 'OVERLOADED' }));
    expect(result).toEqual({ agentId: 'atlas', trigger: 'overloaded' });
  });
});

describe('mission:completed rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'mission:completed')!;

  it('matches mission-completed events', () => {
    expect(rule.matches(makeEvent('mission-completed', 'synth'))).toBe(true);
  });

  it('does not match agent-spawned', () => {
    expect(rule.matches(makeEvent('agent-spawned', 'synth'))).toBe(false);
  });

  it('resolves to mission-complete trigger', () => {
    const result = rule.resolve(makeEvent('mission-completed', 'synth'));
    expect(result).toEqual({ agentId: 'synth', trigger: 'mission-complete' });
  });
});

describe('mission:failed rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'mission:failed')!;

  it('matches mission-failed events', () => {
    expect(rule.matches(makeEvent('mission-failed', 'oracle'))).toBe(true);
  });

  it('has higher priority than mission:completed', () => {
    const completedRule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'mission:completed')!;
    expect(rule.priority).toBeGreaterThan(completedRule.priority);
  });
});

describe('agent:spawned rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'agent:spawned')!;

  it('matches agent-spawned events', () => {
    expect(rule.matches(makeEvent('agent-spawned', 'oracle'))).toBe(true);
  });

  it('resolves to spawn trigger', () => {
    const result = rule.resolve(makeEvent('agent-spawned', 'oracle'));
    expect(result).toEqual({ agentId: 'oracle', trigger: 'spawn' });
  });

  it('has long cooldown (prevent re-announcement)', () => {
    expect(rule.cooldownMs).toBeGreaterThanOrEqual(60_000);
  });
});

describe('agent:paused / agent:resumed rules', () => {
  const pausedRule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'agent:paused')!;
  const resumedRule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'agent:resumed')!;

  it('paused matches agent-paused', () => {
    expect(pausedRule.matches(makeEvent('agent-paused', 'atlas'))).toBe(true);
  });

  it('resumed matches agent-resumed', () => {
    expect(resumedRule.matches(makeEvent('agent-resumed', 'atlas'))).toBe(true);
  });

  it('have equal priority', () => {
    expect(pausedRule.priority).toBe(resumedRule.priority);
  });
});

describe('agent:selected rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'agent:selected')!;

  it('matches agent-selected events', () => {
    expect(rule.matches(makeEvent('agent-selected', 'verifier'))).toBe(true);
  });

  it('has low priority (non-urgent)', () => {
    expect(rule.priority).toBeLessThanOrEqual(30);
  });

  it('has long cooldown', () => {
    expect(rule.cooldownMs).toBeGreaterThanOrEqual(15_000);
  });
});

describe('state:active rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'state:active')!;

  it('matches IDLE → ACTIVE transition', () => {
    const event = makeEvent('state-change', 'oracle', {
      newState: 'ACTIVE',
      previousState: 'IDLE',
    });
    expect(rule.matches(event)).toBe(true);
  });

  it('does not match ERROR → ACTIVE (not the right transition)', () => {
    const event = makeEvent('state-change', 'oracle', {
      newState: 'ACTIVE',
      previousState: 'ERROR',
    });
    expect(rule.matches(event)).toBe(false);
  });

  it('does not match ACTIVE → ACTIVE (no change)', () => {
    const event = makeEvent('state-change', 'oracle', {
      newState: 'ACTIVE',
      previousState: 'ACTIVE',
    });
    expect(rule.matches(event)).toBe(false);
  });
});

describe('state:idle rule', () => {
  const rule = DEFAULT_VOICE_TRIGGER_RULES.find((r) => r.id === 'state:idle')!;

  it('matches ACTIVE → IDLE transition', () => {
    const event = makeEvent('state-change', 'synth', {
      newState: 'IDLE',
      previousState: 'ACTIVE',
    });
    expect(rule.matches(event)).toBe(true);
  });

  it('matches OVERLOADED → IDLE transition', () => {
    const event = makeEvent('state-change', 'synth', {
      newState: 'IDLE',
      previousState: 'OVERLOADED',
    });
    expect(rule.matches(event)).toBe(true);
  });

  it('does not match ERROR → IDLE (recovery should use a different rule)', () => {
    const event = makeEvent('state-change', 'synth', {
      newState: 'IDLE',
      previousState: 'ERROR',
    });
    expect(rule.matches(event)).toBe(false);
  });

  it('has lowest priority', () => {
    expect(rule.priority).toBe(10);
  });
});
