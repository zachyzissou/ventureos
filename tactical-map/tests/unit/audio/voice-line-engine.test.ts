/**
 * VoiceLineEngine — unit tests (#209)
 *
 * Tests cover:
 *   - Catalog registration and variant selection
 *   - Trigger rule evaluation and priority ordering
 *   - Cooldown enforcement (per-rule, global)
 *   - Playback lifecycle (play, preempt, queue, stop)
 *   - Subtitle state emission
 *   - Graceful degradation (null AudioManager)
 *   - Feature flag disable
 *   - Dispose cleanup
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceLineEngine, createVoiceLineEngine } from '@/audio/voice-line-engine';
import type {
  VoiceLineEntry,
  VoiceTriggerRule,
  VoiceMapEvent,
  VoiceLineState,
} from '@/audio/voice-types';
import type { IAudioManager, PlaybackHandle } from '@/audio/types';

// ═══════════════════════════════════════════
// Mock AudioManager
// ═══════════════════════════════════════════

function createMockAudioManager(ready = true): IAudioManager & { plays: string[] } {
  const plays: string[] = [];
  return {
    plays,
    ready,
    init: vi.fn(async () => ready),
    suspend: vi.fn(async () => {}),
    dispose: vi.fn(),
    getMixer: vi.fn(() => ({
      master: { volume: 0.8, muted: false },
      sfx: { volume: 0.7, muted: false },
      ambient: { volume: 0.4, muted: false },
      ui: { volume: 0.6, muted: false },
      voice: { volume: 1.0, muted: false },
    })),
    setBusVolume: vi.fn(),
    setBusMuted: vi.fn(),
    setMasterVolume: vi.fn(),
    register: vi.fn(),
    play: vi.fn((eventId: string) => {
      plays.push(eventId);
      let ended = false;
      const handle: PlaybackHandle = {
        id: `mock_${plays.length}`,
        get ended() { return ended; },
        stop: () => { ended = true; },
        fadeOut: () => { ended = true; },
      };
      return handle;
    }),
    stopAll: vi.fn(),
    activeCount: 0,
  };
}

// ═══════════════════════════════════════════
// Test fixtures
// ═══════════════════════════════════════════

function makeLine(
  agentId: string,
  trigger: string,
  subtitle: string,
  opts?: Partial<VoiceLineEntry>,
): VoiceLineEntry {
  return {
    agentId: agentId as any,
    trigger: trigger as any,
    src: `/audio/${agentId}-${trigger}.mp3`,
    subtitle,
    durationMs: 2000,
    priority: 5,
    ...opts,
  };
}

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

function makeRule(overrides?: Partial<VoiceTriggerRule>): VoiceTriggerRule {
  return {
    id: 'test-rule',
    priority: 50,
    matches: () => true,
    resolve: (e) => ({ agentId: e.agentId, trigger: 'spawn' as any }),
    ...overrides,
  };
}

// ═══════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════

describe('VoiceLineEngine — catalog', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, { enabled: true, globalCooldownMs: 0, defaultCooldownMs: 0 });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('starts with empty catalog', () => {
    expect(engine.catalogSize).toBe(0);
  });

  it('registers a single line', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Oracle reporting.'));
    expect(engine.catalogSize).toBe(1);
  });

  it('registers multiple variants for same agent+trigger', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Oracle online.'));
    engine.registerLine(makeLine('oracle', 'spawn', 'Sensors calibrated.'));
    expect(engine.catalogSize).toBe(2);
  });

  it('bulk registers', () => {
    engine.registerLines([
      makeLine('oracle', 'spawn', 'Oracle online.'),
      makeLine('atlas', 'error', 'Systems failing.'),
      makeLine('synth', 'selected', 'Ready to build.'),
    ]);
    expect(engine.catalogSize).toBe(3);
  });
});

describe('VoiceLineEngine — rules', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, { enabled: true, globalCooldownMs: 0, defaultCooldownMs: 0 });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('starts with no rules', () => {
    expect(engine.ruleCount).toBe(0);
  });

  it('adds and counts rules', () => {
    engine.addRule(makeRule());
    expect(engine.ruleCount).toBe(1);
  });

  it('sorts rules by priority descending', () => {
    const low = makeRule({ id: 'low', priority: 10 });
    const high = makeRule({ id: 'high', priority: 90 });
    engine.addRule(low);
    engine.addRule(high);
    expect(engine.ruleCount).toBe(2);
  });
});

describe('VoiceLineEngine — event processing', () => {
  let engine: VoiceLineEngine;
  let mgr: ReturnType<typeof createMockAudioManager>;

  beforeEach(() => {
    mgr = createMockAudioManager(true);
    engine = createVoiceLineEngine(mgr, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('returns false when no rules match', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({ matches: () => false }));
    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(false);
  });

  it('returns false when no catalog entry for resolved trigger', () => {
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));
    // No line registered — should return false
    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(false);
  });

  it('plays a voice line when rule matches and catalog has entry', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Oracle online.'));
    engine.addRule(makeRule({
      matches: (e) => e.type === 'agent-spawned',
      resolve: (e) => ({ agentId: e.agentId, trigger: 'spawn' as any }),
    }));

    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(true);
    expect(mgr.plays).toHaveLength(1);
    expect(mgr.plays[0]).toBe('voice:oracle:spawn');
  });

  it('first matching rule wins (priority order)', () => {
    engine.registerLine(makeLine('oracle', 'error', 'Error!'));
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));

    engine.addRule(makeRule({
      id: 'low-priority',
      priority: 10,
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));
    engine.addRule(makeRule({
      id: 'high-priority',
      priority: 90,
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'error' as any }),
    }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(mgr.plays[0]).toBe('voice:oracle:error');
  });

  it('returns false when disabled', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule());
    engine.updateConfig({ enabled: false });

    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(false);
  });
});

describe('VoiceLineEngine — cooldowns', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 100_000, // long default cooldown
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('enforces per-agent+trigger cooldown', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    const first = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(first).toBe(true);

    const second = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(second).toBe(false); // on cooldown
  });

  it('clearCooldowns resets all cooldowns', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    engine.clearCooldowns();

    // Should be able to play again after clearing
    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(true);
  });

  it('enforces global cooldown', () => {
    engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 100_000,
      defaultCooldownMs: 0,
    });

    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.registerLine(makeLine('atlas', 'spawn', 'Atlas ready.'));
    engine.addRule(makeRule({
      resolve: (e) => ({ agentId: e.agentId, trigger: 'spawn' as any }),
    }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    // Different agent, but global cooldown should block
    const result = engine.handleEvent(makeEvent('agent-spawned', 'atlas'));
    expect(result).toBe(false);
  });
});

describe('VoiceLineEngine — variant selection', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('round-robins through variants', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Line A'));
    engine.registerLine(makeLine('oracle', 'spawn', 'Line B'));
    engine.registerLine(makeLine('oracle', 'spawn', 'Line C'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    const subtitles: string[] = [];
    engine.subscribe((state) => {
      if (state.current) subtitles.push(state.current.subtitle);
    });

    // Play 3 times — should cycle A, B, C
    for (let i = 0; i < 3; i++) {
      engine.stopAll();
      engine.clearCooldowns();
      engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    }

    expect(subtitles).toEqual(['Line A', 'Line B', 'Line C']);
  });
});

describe('VoiceLineEngine — state observation', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('starts with null current', () => {
    expect(engine.getState().current).toBeNull();
  });

  it('emits state on play', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Oracle online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    const states: VoiceLineState[] = [];
    engine.subscribe((s) => states.push({ ...s }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));

    // Should have initial state + play state
    expect(states.length).toBeGreaterThanOrEqual(2);
    const playState = states[states.length - 1];
    expect(playState.current).not.toBeNull();
    expect(playState.current!.agentId).toBe('oracle');
    expect(playState.current!.trigger).toBe('spawn');
    expect(playState.current!.subtitle).toBe('Oracle online.');
  });

  it('emits null current after stopAll', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    engine.stopAll();

    expect(engine.getState().current).toBeNull();
    expect(engine.getState().queueDepth).toBe(0);
  });

  it('subscribe returns unsubscribe function', () => {
    let callCount = 0;
    const unsub = engine.subscribe(() => { callCount++; });
    expect(callCount).toBe(1); // initial call

    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    unsub();
    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(callCount).toBe(1); // no further calls
  });
});

describe('VoiceLineEngine — preemption', () => {
  let engine: VoiceLineEngine;

  beforeEach(() => {
    engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('higher priority line preempts current', () => {
    engine.registerLine(makeLine('oracle', 'spawn', 'Low priority.', { priority: 3 }));
    engine.registerLine(makeLine('sentinel', 'error', 'ALERT!', { priority: 9 }));

    engine.addRules([
      makeRule({
        id: 'spawn-rule',
        priority: 50,
        matches: (e) => e.type === 'agent-spawned',
        resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
      }),
      makeRule({
        id: 'error-rule',
        priority: 100,
        matches: (e) => e.type === 'state-change',
        resolve: () => ({ agentId: 'sentinel' as any, trigger: 'error' as any }),
      }),
    ]);

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(engine.getState().current!.subtitle).toBe('Low priority.');

    engine.handleEvent(makeEvent('state-change', 'sentinel', { newState: 'ERROR' }));
    expect(engine.getState().current!.subtitle).toBe('ALERT!');
  });
});

describe('VoiceLineEngine — graceful degradation', () => {
  it('works with null AudioManager (subtitle-only mode)', () => {
    const engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });

    engine.registerLine(makeLine('oracle', 'spawn', 'Oracle online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(true);

    // State should reflect playing (subtitles work without audio)
    const state = engine.getState();
    expect(state.current).not.toBeNull();
    expect(state.current!.subtitle).toBe('Oracle online.');

    engine.dispose();
  });

  it('works with AudioManager that is not ready', () => {
    const mgr = createMockAudioManager(false); // not ready
    const engine = createVoiceLineEngine(mgr, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });

    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(true);

    // Subtitle works even though audio didn't play
    expect(engine.getState().current!.subtitle).toBe('Online.');
    expect(mgr.plays).toHaveLength(0); // no audio play attempted

    engine.dispose();
  });
});

describe('VoiceLineEngine — config', () => {
  it('updateConfig merges partial', () => {
    const engine = createVoiceLineEngine(null);
    const original = engine.getConfig();
    expect(original.enabled).toBe(true);

    engine.updateConfig({ subtitlesEnabled: false });
    const updated = engine.getConfig();
    expect(updated.enabled).toBe(true);
    expect(updated.subtitlesEnabled).toBe(false);

    engine.dispose();
  });

  it('disabling stops all playback', () => {
    const engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));

    engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(engine.getState().current).not.toBeNull();

    engine.updateConfig({ enabled: false });
    expect(engine.getState().current).toBeNull();

    engine.dispose();
  });
});

describe('VoiceLineEngine — dispose', () => {
  it('marks as disposed', () => {
    const engine = createVoiceLineEngine(null);
    expect(engine.disposed).toBe(false);
    engine.dispose();
    expect(engine.disposed).toBe(true);
  });

  it('is idempotent', () => {
    const engine = createVoiceLineEngine(null);
    engine.dispose();
    engine.dispose();
    expect(engine.disposed).toBe(true);
  });

  it('rejects events after dispose', () => {
    const engine = createVoiceLineEngine(null, {
      enabled: true,
      globalCooldownMs: 0,
      defaultCooldownMs: 0,
    });
    engine.registerLine(makeLine('oracle', 'spawn', 'Online.'));
    engine.addRule(makeRule({
      resolve: () => ({ agentId: 'oracle' as any, trigger: 'spawn' as any }),
    }));
    engine.dispose();

    const result = engine.handleEvent(makeEvent('agent-spawned', 'oracle'));
    expect(result).toBe(false);
  });
});

describe('createVoiceLineEngine factory', () => {
  it('returns a VoiceLineEngine instance', () => {
    const engine = createVoiceLineEngine(null);
    expect(engine).toBeInstanceOf(VoiceLineEngine);
    engine.dispose();
  });

  it('accepts partial config', () => {
    const engine = createVoiceLineEngine(null, { globalCooldownMs: 5000 });
    expect(engine.getConfig().globalCooldownMs).toBe(5000);
    expect(engine.getConfig().enabled).toBe(true); // default preserved
    engine.dispose();
  });
});
