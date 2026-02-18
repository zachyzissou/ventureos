/**
 * Audio Engine — Phase 5.9 (#208a)
 *
 * Public API surface for the tactical map audio system.
 *
 * Re-exports types, the AudioManager implementation, and
 * the convenience factory.
 */

export type {
  AudioBusId,
  BusState,
  MixerState,
  SoundEventId,
  PlayOptions,
  SoundDef,
  PlaybackHandle,
  IAudioManager,
  AudioPreferences,
} from './types';

export {
  ALL_BUS_IDS,
  DEFAULT_AUDIO_PREFERENCES,
} from './types';

export { AudioManager, createAudioManager } from './audio-manager';
