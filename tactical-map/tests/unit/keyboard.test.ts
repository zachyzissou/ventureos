/**
 * Phase 5.7 — Keyboard Manager unit tests
 *
 * Tests the keyboard manager by simulating keydown events via the
 * window mock. No jsdom needed — we manually wire up the listener.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from '../../src/state/store';
import type { SelectionState } from '../../src/state/types';

// Capture the keyboard listener installed by createKeyboardManager.
let capturedListener: ((e: unknown) => void) | null = null;
const originalWindow = globalThis.window;

// Minimal window mock for addEventListener/removeEventListener
const mockWindow = {
  addEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
    if (type === 'keydown') capturedListener = fn;
  }),
  removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
    if (type === 'keydown' && capturedListener === fn) capturedListener = null;
  })
};

// Install the mock window
beforeEach(() => {
  capturedListener = null;
  mockWindow.addEventListener.mockClear();
  mockWindow.removeEventListener.mockClear();
  // @ts-expect-error — minimal window mock
  globalThis.window = mockWindow;
});

import { createKeyboardManager } from '../../src/interaction/keyboard';

function fireKey(key: string, opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: { tagName?: string } } = {}) {
  if (!capturedListener) throw new Error('No keyboard listener registered');
  capturedListener({
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    target: opts.target ?? { tagName: 'CANVAS' },
    preventDefault: vi.fn()
  });
}

describe('KeyboardManager', () => {
  let selectionStore: ReturnType<typeof createStore<SelectionState>>;
  let callbacks: {
    onToggleHealthDashboard: ReturnType<typeof vi.fn>;
    onToggleMinimap: ReturnType<typeof vi.fn>;
    onToggleDetailPanel: ReturnType<typeof vi.fn>;
    onToggleHelp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    selectionStore = createStore<SelectionState>({ selectedId: null, hoveredId: null });
    callbacks = {
      onToggleHealthDashboard: vi.fn(),
      onToggleMinimap: vi.fn(),
      onToggleDetailPanel: vi.fn(),
      onToggleHelp: vi.fn()
    };
  });

  it('should register a keydown listener on window', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    expect(mockWindow.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    km.destroy();
  });

  it('should select agent by number key 1-7', () => {
    const km = createKeyboardManager(selectionStore, callbacks);

    fireKey('1');
    expect(selectionStore.get().selectedId).toBe('oracle');

    fireKey('2');
    expect(selectionStore.get().selectedId).toBe('atlas');

    fireKey('3');
    expect(selectionStore.get().selectedId).toBe('sentinel');

    fireKey('4');
    expect(selectionStore.get().selectedId).toBe('verifier');

    fireKey('5');
    expect(selectionStore.get().selectedId).toBe('archivist');

    fireKey('6');
    expect(selectionStore.get().selectedId).toBe('synth');

    fireKey('7');
    expect(selectionStore.get().selectedId).toBe('echo');

    km.destroy();
  });

  it('should select nexus with key 8', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('8');
    expect(selectionStore.get().selectedId).toBe('nexus');
    km.destroy();
  });

  it('should toggle selection when pressing same key', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('1');
    expect(selectionStore.get().selectedId).toBe('oracle');
    fireKey('1');
    expect(selectionStore.get().selectedId).toBe(null);
    km.destroy();
  });

  it('should deselect on Escape', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('1');
    expect(selectionStore.get().selectedId).toBe('oracle');
    fireKey('Escape');
    expect(selectionStore.get().selectedId).toBe(null);
    km.destroy();
  });

  it('should cycle selection on Tab', () => {
    const km = createKeyboardManager(selectionStore, callbacks);

    fireKey('Tab');
    expect(selectionStore.get().selectedId).toBe('oracle');

    fireKey('Tab');
    expect(selectionStore.get().selectedId).toBe('atlas');

    fireKey('Tab');
    expect(selectionStore.get().selectedId).toBe('sentinel');

    km.destroy();
  });

  it('should wrap around when cycling past last agent', () => {
    const km = createKeyboardManager(selectionStore, callbacks);

    // Select nexus (last agent), then Tab should wrap to oracle
    fireKey('8');
    expect(selectionStore.get().selectedId).toBe('nexus');

    fireKey('Tab');
    expect(selectionStore.get().selectedId).toBe('oracle');

    km.destroy();
  });

  it('should call onToggleHealthDashboard on H key', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('h');
    expect(callbacks.onToggleHealthDashboard).toHaveBeenCalledTimes(1);
    km.destroy();
  });

  it('should call onToggleMinimap on M key', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('m');
    expect(callbacks.onToggleMinimap).toHaveBeenCalledTimes(1);
    km.destroy();
  });

  it('should call onToggleDetailPanel on D key', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('d');
    expect(callbacks.onToggleDetailPanel).toHaveBeenCalledTimes(1);
    km.destroy();
  });

  it('should call onToggleHelp on ? key', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('?');
    expect(callbacks.onToggleHelp).toHaveBeenCalledTimes(1);
    km.destroy();
  });

  it('should not trigger shortcuts when Ctrl is held', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('h', { ctrlKey: true });
    expect(callbacks.onToggleHealthDashboard).not.toHaveBeenCalled();
    km.destroy();
  });

  it('should not trigger shortcuts when Meta is held', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('m', { metaKey: true });
    expect(callbacks.onToggleMinimap).not.toHaveBeenCalled();
    km.destroy();
  });

  it('should not trigger when input has focus', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    fireKey('1', { target: { tagName: 'INPUT' } });
    expect(selectionStore.get().selectedId).toBe(null);
    km.destroy();
  });

  it('should clean up listeners on destroy', () => {
    const km = createKeyboardManager(selectionStore, callbacks);
    km.destroy();
    expect(mockWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(capturedListener).toBe(null);
  });
});
