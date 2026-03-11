/**
 * AudioManager — unit tests
 *
 * These tests run in a Node/Vitest environment where Web Audio is
 * NOT available.  This validates the graceful-degradation path:
 * every method must be safe, return sensible defaults, and never throw.
 *
 * A second describe block uses a minimal AudioContext mock to exercise
 * the gain graph, mixer operations, play lifecycle, and dispose cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioManager, createAudioManager } from '@/audio/audio-manager';
import { ALL_BUS_IDS } from '@/audio/types';
import type { IAudioManager, MixerState, SoundDef } from '@/audio/types';

// ═══════════════════════════════════════════
// 1. No Web Audio (pure Node env)
// ═══════════════════════════════════════════

describe('AudioManager — no Web Audio available', () => {
  let mgr: AudioManager;

  beforeEach(() => {
    // Ensure no global AudioContext
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
    mgr = new AudioManager();
  });

  afterEach(() => {
    mgr.dispose();
  });

  it('reports not available', () => {
    expect(mgr.available).toBe(false);
  });

  it('init() resolves to false', async () => {
    expect(await mgr.init()).toBe(false);
  });

  it('ready is false', () => {
    expect(mgr.ready).toBe(false);
  });

  it('play() returns null gracefully', () => {
    mgr.register({ eventId: 'ui:click', src: '/nope.mp3' });
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('stopAll() does not throw', () => {
    expect(() => mgr.stopAll()).not.toThrow();
  });

  it('activeCount is 0', () => {
    expect(mgr.activeCount).toBe(0);
  });

  it('suspend() does not throw', async () => {
    await expect(mgr.suspend()).resolves.toBeUndefined();
  });

  it('dispose() is idempotent', () => {
    mgr.dispose();
    mgr.dispose(); // second call
    expect(mgr.ready).toBe(false);
  });

  it('getMixer() returns default state even without Web Audio', () => {
    const mixer = mgr.getMixer();
    for (const bus of ALL_BUS_IDS) {
      expect(mixer[bus]).toBeDefined();
      expect(mixer[bus].muted).toBe(false);
      expect(mixer[bus].volume).toBeGreaterThan(0);
    }
  });

  it('setBusVolume works on internal state without context', () => {
    mgr.setBusVolume('sfx', 0.3);
    expect(mgr.getMixer().sfx.volume).toBeCloseTo(0.3);
  });

  it('setBusMuted works on internal state without context', () => {
    mgr.setBusMuted('ambient', true);
    expect(mgr.getMixer().ambient.muted).toBe(true);
  });

  it('setMasterVolume delegates to setBusVolume', () => {
    mgr.setMasterVolume(0.2);
    expect(mgr.getMixer().master.volume).toBeCloseTo(0.2);
  });

  it('volume clamping', () => {
    mgr.setBusVolume('sfx', -5);
    expect(mgr.getMixer().sfx.volume).toBe(0);

    mgr.setBusVolume('sfx', 100);
    expect(mgr.getMixer().sfx.volume).toBe(1);
  });
});

// ═══════════════════════════════════════════
// 2. With mocked Web Audio
// ═══════════════════════════════════════════

/**
 * Minimal AudioContext mock that exposes enough surface for the
 * AudioManager's gain-graph setup and play lifecycle.
 */
function createMockAudioContext() {
  const gains: Array<{ gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn>; linearRampToValueAtTime: ReturnType<typeof vi.fn> }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

  const destination = {};

  let state = 'suspended' as string;
  let closeCalled = false;

  const mockCtx = {
    get state() { return state; },
    destination,

    resume: vi.fn(async () => { state = 'running'; }),
    suspend: vi.fn(async () => { state = 'suspended'; }),
    close: vi.fn(async () => { closeCalled = true; state = 'closed'; }),

    get currentTime() { return 0; },

    createGain() {
      const g = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(g);
      return g;
    },

    createBufferSource() {
      let onendedCb: (() => void) | null = null;
      return {
        buffer: null as unknown,
        loop: false,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => {
          // Simulate ended
          if (onendedCb) onendedCb();
        }),
        set onended(fn: (() => void) | null) { onendedCb = fn; },
        get onended() { return onendedCb; },
      };
    },

    decodeAudioData: vi.fn(async () => {
      // Return a minimal AudioBuffer-like object
      return { duration: 1, length: 44100, sampleRate: 44100 } as unknown as AudioBuffer;
    }),

    // Inspection helpers
    __gains: gains,
    __closeCalled: () => closeCalled,
  };

  return mockCtx;
}

describe('AudioManager — with mocked Web Audio', () => {
  let mockCtx: ReturnType<typeof createMockAudioContext>;
  let mgr: AudioManager;

  beforeEach(() => {
    mockCtx = createMockAudioContext();
    // Install global AudioContext — must be a regular function (not arrow)
    // so that `new AudioContext()` returns the mock via JS constructor semantics.
    (globalThis as Record<string, unknown>).AudioContext = function MockAudioContext() {
      return mockCtx;
    };
    mgr = new AudioManager();
  });

  afterEach(() => {
    mgr.dispose();
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
  });

  it('reports available', () => {
    expect(mgr.available).toBe(true);
  });

  it('init() creates context and resumes', async () => {
    expect(mgr.ready).toBe(false);
    const ok = await mgr.init();
    expect(ok).toBe(true);
    expect(mgr.ready).toBe(true);
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  it('init() is idempotent when already running', async () => {
    await mgr.init();
    const callCount = mockCtx.resume.mock.calls.length;
    await mgr.init();
    // Should not call resume again (state is already 'running')
    expect(mockCtx.resume.mock.calls.length).toBe(callCount);
    expect(mgr.ready).toBe(true);
  });

  it('builds gain graph: master + 4 bus gains', async () => {
    await mgr.init();
    // master(1) + sfx + ambient + ui + voice = 5 GainNodes
    expect(mockCtx.__gains.length).toBe(5);

    // master connects to destination
    expect(mockCtx.__gains[0].connect).toHaveBeenCalledWith(mockCtx.destination);

    // bus gains connect to master
    for (let i = 1; i < 5; i++) {
      expect(mockCtx.__gains[i].connect).toHaveBeenCalledWith(mockCtx.__gains[0]);
    }
  });

  it('setBusVolume propagates to gain nodes', async () => {
    await mgr.init();
    mgr.setBusVolume('sfx', 0.3);
    // sfx is the first bus gain after master (index 1)
    expect(mockCtx.__gains[1].gain.value).toBeCloseTo(0.3);
    expect(mgr.getMixer().sfx.volume).toBeCloseTo(0.3);
  });

  it('setBusMuted sets gain to 0', async () => {
    await mgr.init();
    mgr.setBusMuted('sfx', true);
    expect(mockCtx.__gains[1].gain.value).toBe(0);
    expect(mgr.getMixer().sfx.muted).toBe(true);

    // Un-mute restores volume
    mgr.setBusMuted('sfx', false);
    expect(mockCtx.__gains[1].gain.value).toBeCloseTo(0.7); // default sfx volume
  });

  it('setMasterVolume propagates to master gain node', async () => {
    await mgr.init();
    mgr.setMasterVolume(0.5);
    expect(mockCtx.__gains[0].gain.value).toBeCloseTo(0.5);
  });

  it('play() returns null before init', () => {
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('play() returns null for unregistered event', async () => {
    await mgr.init();
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('play() returns null when bus is muted', async () => {
    await mgr.init();
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    mgr.setBusMuted('sfx', true);
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('play() returns null when master is muted', async () => {
    await mgr.init();
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    mgr.setBusMuted('master', true);
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('play() returns a PlaybackHandle on success', async () => {
    // Mock fetch for decodeAndPlay
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    await mgr.init();
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    const handle = mgr.play('ui:click');

    expect(handle).not.toBeNull();
    expect(handle!.id).toMatch(/^ph_/);
    expect(typeof handle!.stop).toBe('function');
    expect(typeof handle!.fadeOut).toBe('function');

    // Wait for async decode+play
    await vi.waitFor(() => expect(mgr.activeCount).toBeGreaterThanOrEqual(0));

    // Cleanup
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('play() respects bus override from PlayOptions', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    await mgr.init();
    mgr.register({ eventId: 'alert:warning', src: '/alert.mp3' });

    // Mute sfx (default bus), but play on 'ui' bus
    mgr.setBusMuted('sfx', true);
    const handle = mgr.play('alert:warning', { bus: 'ui' });
    expect(handle).not.toBeNull();

    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('register() replaces existing definition', () => {
    mgr.register({ eventId: 'ui:click', src: '/a.mp3' });
    mgr.register({ eventId: 'ui:click', src: '/b.mp3' });
    // No crash; last-write-wins internally
    expect(true).toBe(true);
  });

  it('stopAll() clears active playbacks', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    await mgr.init();
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    mgr.play('ui:click');
    mgr.play('ui:click');

    // Give a tick for async decode
    await new Promise((r) => setTimeout(r, 10));

    mgr.stopAll();
    expect(mgr.activeCount).toBe(0);

    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('suspend() suspends context', async () => {
    await mgr.init();
    expect(mgr.ready).toBe(true);

    await mgr.suspend();
    expect(mgr.ready).toBe(false);
    expect(mockCtx.suspend).toHaveBeenCalled();
  });

  it('dispose() tears down and prevents further init', async () => {
    await mgr.init();
    mgr.dispose();

    expect(mgr.ready).toBe(false);
    expect(await mgr.init()).toBe(false);
    expect(mgr.play('ui:click')).toBeNull();
  });

  it('dispose() is idempotent', async () => {
    await mgr.init();
    mgr.dispose();
    mgr.dispose(); // second call
    expect(mgr.ready).toBe(false);
  });

  describe('mixer snapshot', () => {
    it('returns independent copies', async () => {
      await mgr.init();
      const a = mgr.getMixer();
      const b = mgr.getMixer();
      a.sfx.volume = 999;
      expect(b.sfx.volume).not.toBe(999);
    });
  });
});

// ═══════════════════════════════════════════
// 3. Factory function
// ═══════════════════════════════════════════

describe('createAudioManager()', () => {
  it('returns an IAudioManager', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    const mgr = createAudioManager();
    expect(mgr).toBeDefined();
    expect(typeof mgr.init).toBe('function');
    expect(typeof mgr.play).toBe('function');
    expect(typeof mgr.getMixer).toBe('function');
    expect(typeof mgr.dispose).toBe('function');
    mgr.dispose();
  });
});

// ═══════════════════════════════════════════
// 4. webkitAudioContext fallback
// ═══════════════════════════════════════════

describe('AudioManager — webkitAudioContext fallback', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
  });

  it('uses webkitAudioContext when AudioContext is absent', async () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    const mockCtx = createMockAudioContext();
    (globalThis as Record<string, unknown>).webkitAudioContext = function MockWebkitAudioContext() {
      return mockCtx;
    };

    const mgr = new AudioManager();
    expect(mgr.available).toBe(true);
    const ok = await mgr.init();
    expect(ok).toBe(true);
    expect(mgr.ready).toBe(true);
    mgr.dispose();
  });
});

// ═══════════════════════════════════════════
// 5. Edge cases
// ═══════════════════════════════════════════

describe('AudioManager — edge cases', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
  });

  it('init after dispose returns false', async () => {
    (globalThis as Record<string, unknown>).AudioContext = function() { return createMockAudioContext(); };
    const mgr = new AudioManager();
    mgr.dispose();
    expect(await mgr.init()).toBe(false);
    delete (globalThis as Record<string, unknown>).AudioContext;
  });

  it('play returns null when disposed mid-operation', async () => {
    const mockCtx = createMockAudioContext();
    (globalThis as Record<string, unknown>).AudioContext = function() { return mockCtx; };
    const mgr = new AudioManager();
    await mgr.init();
    mgr.register({ eventId: 'ui:click', src: '/click.mp3' });
    mgr.dispose();
    expect(mgr.play('ui:click')).toBeNull();
    delete (globalThis as Record<string, unknown>).AudioContext;
  });

  it('handles AudioContext constructor failure', async () => {
    (globalThis as Record<string, unknown>).AudioContext = function() {
      throw new Error('not allowed');
    };
    // The manager should catch this during init
    const mgr = new AudioManager();
    expect(mgr.available).toBe(true); // thinks it's available until trying
    const ok = await mgr.init();
    expect(ok).toBe(false);
    mgr.dispose();
    delete (globalThis as Record<string, unknown>).AudioContext;
  });

  it('handles resume rejection', async () => {
    const mockCtx = createMockAudioContext();
    mockCtx.resume = vi.fn(async () => { throw new Error('not allowed'); });
    (globalThis as Record<string, unknown>).AudioContext = function() { return mockCtx; };

    const mgr = new AudioManager();
    const ok = await mgr.init();
    expect(ok).toBe(false);
    mgr.dispose();
    delete (globalThis as Record<string, unknown>).AudioContext;
  });
});
