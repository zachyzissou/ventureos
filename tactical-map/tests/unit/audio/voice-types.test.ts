/**
 * Voice Types — unit tests (#209)
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_VOICE_TRIGGERS,
  voiceEventId,
  stateToTrigger,
  triggerToSoundEvent,
  DEFAULT_VOICE_ENGINE_CONFIG,
  INITIAL_VOICE_LINE_STATE,
} from '@/audio/voice-types';

describe('voiceEventId', () => {
  it('builds a scoped event id', () => {
    expect(voiceEventId('oracle', 'spawn')).toBe('voice:oracle:spawn');
    expect(voiceEventId('nexus', 'error')).toBe('voice:nexus:error');
  });

  it('works for all triggers', () => {
    for (const trigger of ALL_VOICE_TRIGGERS) {
      const id = voiceEventId('synth', trigger);
      expect(id).toBe(`voice:synth:${trigger}`);
    }
  });
});

describe('stateToTrigger', () => {
  it('maps IDLE → idle', () => {
    expect(stateToTrigger('IDLE')).toBe('idle');
  });

  it('maps ACTIVE → active', () => {
    expect(stateToTrigger('ACTIVE')).toBe('active');
  });

  it('maps OVERLOADED → overloaded', () => {
    expect(stateToTrigger('OVERLOADED')).toBe('overloaded');
  });

  it('maps ERROR → error', () => {
    expect(stateToTrigger('ERROR')).toBe('error');
  });

  it('returns null for unknown state', () => {
    expect(stateToTrigger('UNKNOWN' as any)).toBeNull();
  });
});

describe('triggerToSoundEvent', () => {
  it('maps spawn to agent:spawn', () => {
    expect(triggerToSoundEvent('spawn')).toBe('agent:spawn');
  });

  it('maps mission-complete to mission:completed', () => {
    expect(triggerToSoundEvent('mission-complete')).toBe('mission:completed');
  });

  it('maps mission-failed to mission:failed', () => {
    expect(triggerToSoundEvent('mission-failed')).toBe('mission:failed');
  });

  it('maps selected to agent:active (closest match)', () => {
    expect(triggerToSoundEvent('selected')).toBe('agent:active');
  });

  it('returns a valid SoundEventId for every trigger', () => {
    for (const trigger of ALL_VOICE_TRIGGERS) {
      const sound = triggerToSoundEvent(trigger);
      expect(typeof sound).toBe('string');
      expect(sound.length).toBeGreaterThan(0);
    }
  });
});

describe('ALL_VOICE_TRIGGERS', () => {
  it('contains all expected triggers', () => {
    expect(ALL_VOICE_TRIGGERS).toContain('spawn');
    expect(ALL_VOICE_TRIGGERS).toContain('idle');
    expect(ALL_VOICE_TRIGGERS).toContain('active');
    expect(ALL_VOICE_TRIGGERS).toContain('overloaded');
    expect(ALL_VOICE_TRIGGERS).toContain('error');
    expect(ALL_VOICE_TRIGGERS).toContain('paused');
    expect(ALL_VOICE_TRIGGERS).toContain('resumed');
    expect(ALL_VOICE_TRIGGERS).toContain('mission-complete');
    expect(ALL_VOICE_TRIGGERS).toContain('mission-failed');
    expect(ALL_VOICE_TRIGGERS).toContain('selected');
  });

  it('has 10 entries', () => {
    expect(ALL_VOICE_TRIGGERS).toHaveLength(10);
  });
});

describe('DEFAULT_VOICE_ENGINE_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_VOICE_ENGINE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_VOICE_ENGINE_CONFIG.subtitlesEnabled).toBe(true);
    expect(DEFAULT_VOICE_ENGINE_CONFIG.globalCooldownMs).toBeGreaterThan(0);
    expect(DEFAULT_VOICE_ENGINE_CONFIG.defaultCooldownMs).toBeGreaterThan(0);
    expect(DEFAULT_VOICE_ENGINE_CONFIG.maxConcurrent).toBe(1);
  });
});

describe('INITIAL_VOICE_LINE_STATE', () => {
  it('starts with nothing playing', () => {
    expect(INITIAL_VOICE_LINE_STATE.current).toBeNull();
    expect(INITIAL_VOICE_LINE_STATE.queueDepth).toBe(0);
  });
});
