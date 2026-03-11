/**
 * Audio Engine — Phase 5.9
 *
 * Public API surface for the tactical map audio system.
 *
 * Re-exports:
 *   - (#208) Core types, AudioManager, factory
 *   - (#209) Voice line types, engine, trigger rules, event bridge
 */

// ── Core Audio (#208) ────────────────────────
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

// ── Voice Lines (#209) ───────────────────────
export type {
  VoiceLineEventId,
  VoiceLineTrigger,
  VoiceLineEntry,
  VoiceLineCatalog,
  VoiceTriggerRule,
  VoiceMapEventType,
  VoiceMapEvent,
  VoiceLineEngineConfig,
  VoiceLineState,
} from './voice-types';

export {
  ALL_VOICE_TRIGGERS,
  DEFAULT_VOICE_ENGINE_CONFIG,
  INITIAL_VOICE_LINE_STATE,
  voiceEventId,
  stateToTrigger,
  triggerToSoundEvent,
} from './voice-types';

export { VoiceLineEngine, createVoiceLineEngine } from './voice-line-engine';
export { DEFAULT_VOICE_TRIGGER_RULES } from './voice-trigger-rules';
export { createVoiceEventBridge } from './voice-event-bridge';
export type { VoiceEventBridge } from './voice-event-bridge';
