/**
 * AudioManager — Phase 5.9 (#208a)
 *
 * Core audio engine for the tactical map.  Wraps the Web Audio API behind
 * the `IAudioManager` interface so callers never touch AudioContext directly.
 *
 * Gain graph:
 *   source → bus GainNode → master GainNode → ctx.destination
 *
 * Browser autoplay safety:
 *   `init()` must be called from a user-gesture callback.  Until then,
 *   `play()` silently returns null — no errors, no noise.
 *
 * Graceful degradation:
 *   If `AudioContext` is not available (SSR, older browser, test env),
 *   the manager enters a permanent "unavailable" state where every
 *   method is a safe no-op.
 */

import type {
  AudioBusId,
  BusState,
  IAudioManager,
  MixerState,
  PlaybackHandle,
  PlayOptions,
  SoundDef,
  SoundEventId,
} from './types';
import { ALL_BUS_IDS } from './types';

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

let nextHandleId = 0;
function genHandleId(): string {
  return `ph_${++nextHandleId}`;
}

/** Detect whether the environment provides an AudioContext constructor. */
function hasWebAudio(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (typeof (globalThis as unknown as Record<string, unknown>).AudioContext === 'function' ||
      typeof (globalThis as unknown as Record<string, unknown>).webkitAudioContext === 'function')
  );
}

function createAudioContext(): AudioContext | null {
  try {
    const Ctor =
      (globalThis as unknown as Record<string, unknown>).AudioContext ??
      (globalThis as unknown as Record<string, unknown>).webkitAudioContext;
    if (typeof Ctor === 'function') {
      return new (Ctor as new () => AudioContext)();
    }
  } catch {
    /* swallow — environment doesn't support Web Audio */
  }
  return null;
}

// ═══════════════════════════════════════════
// Active playback tracker
// ═══════════════════════════════════════════

interface ActivePlayback {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  ended: boolean;
}

// ═══════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════

export class AudioManager implements IAudioManager {
  // Web Audio primitives (null when unavailable)
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private busGains: Map<AudioBusId, GainNode> = new Map();

  // Mixer state (maintained even without AudioContext for UI binding)
  private busStates: Map<AudioBusId, BusState> = new Map();

  // Sound registry
  private defs: Map<SoundEventId, SoundDef> = new Map();
  // Decoded buffers cache (keyed by src URL/data)
  private buffers: Map<string, AudioBuffer> = new Map();
  // In-flight decode promises to deduplicate parallel fetches
  private decoding: Map<string, Promise<AudioBuffer | null>> = new Map();

  // Active playback instances
  private active: Map<string, ActivePlayback> = new Map();

  // State flags
  private _ready = false;
  private _disposed = false;
  private _available: boolean;

  constructor() {
    this._available = hasWebAudio();

    // Initialise bus states to defaults regardless of Web Audio support
    for (const bus of ALL_BUS_IDS) {
      const defaultVolume = bus === 'master' ? 0.8 :
        bus === 'sfx' ? 0.7 :
          bus === 'ambient' ? 0.4 :
            bus === 'ui' ? 0.6 : 1.0;
      this.busStates.set(bus, { volume: defaultVolume, muted: false });
    }
  }

  // ── Lifecycle ──────────────────────────────

  async init(): Promise<boolean> {
    if (this._disposed) return false;
    if (this._ready && this.ctx?.state === 'running') return true;

    if (!this._available) return false;

    // Create context lazily (must be inside gesture handler for Chrome)
    if (!this.ctx) {
      this.ctx = createAudioContext();
      if (!this.ctx) {
        this._available = false;
        return false;
      }
      this.buildGainGraph();
    }

    // Resume if suspended (browser autoplay policy)
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }

    this._ready = this.ctx.state === 'running';
    return this._ready;
  }

  get ready(): boolean {
    return this._ready && !this._disposed;
  }

  /** Whether Web Audio is available in this environment. */
  get available(): boolean {
    return this._available;
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch {
        /* swallow */
      }
      this._ready = false;
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._ready = false;

    this.stopAll();

    // Tear down gain graph
    this.busGains.forEach((g) => g.disconnect());
    this.busGains.clear();
    this.masterGain?.disconnect();
    this.masterGain = null;

    if (this.ctx) {
      // Best-effort close
      try {
        void this.ctx.close();
      } catch {
        /* swallow */
      }
      this.ctx = null;
    }

    this.buffers.clear();
    this.decoding.clear();
    this.defs.clear();
  }

  // ── Mixer ──────────────────────────────────

  getMixer(): MixerState {
    const result = {} as MixerState;
    for (const bus of ALL_BUS_IDS) {
      result[bus] = { ...this.busStates.get(bus)! };
    }
    return result;
  }

  setBusVolume(bus: AudioBusId, volume: number): void {
    const state = this.busStates.get(bus);
    if (!state) return;
    state.volume = clamp01(volume);
    this.applyBusGain(bus);
  }

  setBusMuted(bus: AudioBusId, muted: boolean): void {
    const state = this.busStates.get(bus);
    if (!state) return;
    state.muted = muted;
    this.applyBusGain(bus);
  }

  setMasterVolume(volume: number): void {
    this.setBusVolume('master', volume);
  }

  // ── Sound registration ─────────────────────

  register(def: SoundDef): void {
    this.defs.set(def.eventId, def);
  }

  // ── Playback ───────────────────────────────

  play(eventId: SoundEventId, opts?: PlayOptions): PlaybackHandle | null {
    if (this._disposed || !this._ready || !this.ctx || !this.masterGain) return null;

    const def = this.defs.get(eventId);
    if (!def) return null;

    const busId: AudioBusId = opts?.bus ?? def.defaults?.bus ?? 'sfx';
    const busGain = this.busGains.get(busId);
    if (!busGain) return null;

    // Check bus/master mute
    const masterState = this.busStates.get('master')!;
    const busState = this.busStates.get(busId)!;
    if (masterState.muted || busState.muted) return null;

    const id = genHandleId();
    const volume = clamp01(opts?.volume ?? def.defaults?.volume ?? 1.0);
    const loop = opts?.loop ?? def.defaults?.loop ?? false;
    const rate = opts?.rate ?? def.defaults?.rate ?? 1.0;

    // Fire async decode + play. The handle is synchronous.
    const playback: ActivePlayback = {
      id,
      source: null!,  // set asynchronously
      gain: null!,
      ended: false,
    };
    this.active.set(id, playback);

    const handle: PlaybackHandle = {
      id,
      get ended() { return playback.ended; },
      stop: () => this.stopPlayback(id),
      fadeOut: (ms: number) => this.fadeOutPlayback(id, ms),
    };

    // Kick off buffer decode (cached) and play
    void this.decodeAndPlay(def.src, playback, busGain, volume, loop, rate);

    return handle;
  }

  stopAll(): void {
    for (const [id] of this.active) {
      this.stopPlayback(id);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  // ═══════════════════════════════════════════
  // Internals
  // ═══════════════════════════════════════════

  private buildGainGraph(): void {
    if (!this.ctx) return;

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    const masterState = this.busStates.get('master')!;
    this.masterGain.gain.value = masterState.muted ? 0 : masterState.volume;

    for (const bus of ALL_BUS_IDS) {
      if (bus === 'master') continue;
      const node = this.ctx.createGain();
      const state = this.busStates.get(bus)!;
      node.gain.value = state.muted ? 0 : state.volume;
      node.connect(this.masterGain);
      this.busGains.set(bus, node);
    }
  }

  private applyBusGain(bus: AudioBusId): void {
    const state = this.busStates.get(bus)!;
    if (bus === 'master') {
      if (this.masterGain) {
        this.masterGain.gain.value = state.muted ? 0 : state.volume;
      }
    } else {
      const node = this.busGains.get(bus);
      if (node) {
        node.gain.value = state.muted ? 0 : state.volume;
      }
    }
  }

  private async decodeAndPlay(
    src: string,
    playback: ActivePlayback,
    busGain: GainNode,
    volume: number,
    loop: boolean,
    rate: number,
  ): Promise<void> {
    if (this._disposed || !this.ctx) {
      this.markEnded(playback);
      return;
    }

    const buffer = await this.getBuffer(src);
    if (!buffer || this._disposed || !this.ctx || playback.ended) {
      this.markEnded(playback);
      return;
    }

    // Per-instance gain (for volume multiplier + fade)
    const instanceGain = this.ctx.createGain();
    instanceGain.gain.value = volume;
    instanceGain.connect(busGain);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = rate;
    source.connect(instanceGain);

    playback.source = source;
    playback.gain = instanceGain;

    source.onended = () => {
      this.markEnded(playback);
    };

    try {
      source.start(0);
    } catch {
      this.markEnded(playback);
    }
  }

  private async getBuffer(src: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(src);
    if (cached) return cached;

    // Deduplicate parallel decodes
    const inflight = this.decoding.get(src);
    if (inflight) return inflight;

    const promise = this.fetchAndDecode(src);
    this.decoding.set(src, promise);
    const result = await promise;
    this.decoding.delete(src);

    if (result) {
      this.buffers.set(src, result);
    }
    return result;
  }

  private async fetchAndDecode(src: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(src);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch {
      return null;
    }
  }

  private stopPlayback(id: string): void {
    const p = this.active.get(id);
    if (!p || p.ended) return;

    try {
      p.source?.stop();
    } catch {
      /* may already have been stopped */
    }
    p.gain?.disconnect();
    this.markEnded(p);
  }

  private fadeOutPlayback(id: string, ms: number): void {
    const p = this.active.get(id);
    if (!p || p.ended || !p.gain || !this.ctx) {
      this.stopPlayback(id);
      return;
    }

    const now = this.ctx.currentTime;
    p.gain.gain.setValueAtTime(p.gain.gain.value, now);
    p.gain.gain.linearRampToValueAtTime(0, now + ms / 1000);

    // Schedule stop after fade
    setTimeout(() => this.stopPlayback(id), ms + 50);
  }

  private markEnded(playback: ActivePlayback): void {
    playback.ended = true;
    this.active.delete(playback.id);
  }
}

// ═══════════════════════════════════════════
// Factory (convenience)
// ═══════════════════════════════════════════

/**
 * Create a new AudioManager instance.
 *
 * Usage:
 *   const audio = createAudioManager();
 *   // In a click handler:
 *   await audio.init();
 *   audio.play('ui:click');
 */
export function createAudioManager(): IAudioManager {
  return new AudioManager();
}
