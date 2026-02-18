/**
 * Audio types — unit tests
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_BUS_IDS,
  DEFAULT_AUDIO_PREFERENCES,
} from '@/audio/types';
import type {
  AudioBusId,
  BusState,
  MixerState,
  SoundEventId,
  PlayOptions,
  SoundDef,
  PlaybackHandle,
  IAudioManager,
  AudioPreferences,
} from '@/audio/types';

describe('audio/types', () => {
  describe('ALL_BUS_IDS', () => {
    it('contains exactly the five expected buses', () => {
      expect(ALL_BUS_IDS).toEqual(['master', 'sfx', 'ambient', 'ui', 'voice']);
    });

    it('is readonly (frozen at type level)', () => {
      // Runtime check — ensure we can iterate
      const ids: AudioBusId[] = [...ALL_BUS_IDS];
      expect(ids).toHaveLength(5);
    });
  });

  describe('DEFAULT_AUDIO_PREFERENCES', () => {
    it('is enabled by default', () => {
      expect(DEFAULT_AUDIO_PREFERENCES.enabled).toBe(true);
    });

    it('has sane default volumes', () => {
      const v = DEFAULT_AUDIO_PREFERENCES.volumes;
      expect(v.master).toBe(0.8);
      expect(v.sfx).toBe(0.7);
      expect(v.ambient).toBe(0.4);
      expect(v.ui).toBe(0.6);
      expect(v.voice).toBe(1.0);
    });

    it('has no buses muted by default', () => {
      expect(Object.keys(DEFAULT_AUDIO_PREFERENCES.muted)).toHaveLength(0);
    });
  });

  describe('type contracts (compile-time + shape checks)', () => {
    it('BusState shape', () => {
      const bs: BusState = { volume: 0.5, muted: false };
      expect(bs.volume).toBeTypeOf('number');
      expect(bs.muted).toBeTypeOf('boolean');
    });

    it('MixerState has all bus keys', () => {
      const mixer: MixerState = {
        master: { volume: 0.8, muted: false },
        sfx: { volume: 0.7, muted: false },
        ambient: { volume: 0.4, muted: false },
        ui: { volume: 0.6, muted: false },
        voice: { volume: 1.0, muted: false },
      };
      for (const bus of ALL_BUS_IDS) {
        expect(mixer[bus]).toBeDefined();
      }
    });

    it('SoundDef shape', () => {
      const def: SoundDef = {
        eventId: 'ui:click',
        src: '/sounds/click.mp3',
        defaults: { bus: 'ui', volume: 0.5 },
      };
      expect(def.eventId).toBe('ui:click');
      expect(def.src).toContain('.mp3');
    });

    it('PlayOptions all fields optional', () => {
      const opts: PlayOptions = {};
      expect(opts.bus).toBeUndefined();
      expect(opts.volume).toBeUndefined();
      expect(opts.loop).toBeUndefined();
      expect(opts.rate).toBeUndefined();
    });

    it('AudioPreferences round-trip', () => {
      const prefs: AudioPreferences = {
        enabled: false,
        volumes: { master: 0.5 },
        muted: { sfx: true },
      };
      const json = JSON.stringify(prefs);
      const parsed: AudioPreferences = JSON.parse(json);
      expect(parsed.enabled).toBe(false);
      expect(parsed.volumes.master).toBe(0.5);
      expect(parsed.muted.sfx).toBe(true);
    });
  });
});
