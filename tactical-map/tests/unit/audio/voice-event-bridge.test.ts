/**
 * VoiceEventBridge — unit tests (#209)
 *
 * Tests the bridge that wires InteractionEvent bus + MapState store
 * to the VoiceLineEngine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVoiceEventBridge } from '@/audio/voice-event-bridge';
import { createEventBus } from '@/interaction/event-bus';
import { createStore } from '@/state/store';
import type { MapState } from '@/state/types';
import type { EventBus } from '@/interaction/event-bus';
import type { Store } from '@/state/store';
import type { VoiceLineEngine } from '@/audio/voice-line-engine';
import type { VoiceMapEvent } from '@/audio/voice-types';

// ═══════════════════════════════════════════
// Mock VoiceLineEngine
// ═══════════════════════════════════════════

function createMockEngine(): VoiceLineEngine & { events: VoiceMapEvent[] } {
  const events: VoiceMapEvent[] = [];
  return {
    events,
    handleEvent: vi.fn((event: VoiceMapEvent) => {
      events.push(event);
      return true;
    }),
  } as any;
}

function createTestMapState(): MapState {
  return {
    updatedAt: new Date().toISOString(),
    agents: {
      oracle: { id: 'oracle', position: { x: 0, y: 0 }, state: 'IDLE' },
      atlas: { id: 'atlas', position: { x: 10, y: 0 }, state: 'IDLE' },
      sentinel: { id: 'sentinel', position: { x: 20, y: 0 }, state: 'IDLE' },
      verifier: { id: 'verifier', position: { x: 30, y: 0 }, state: 'IDLE' },
      archivist: { id: 'archivist', position: { x: 40, y: 0 }, state: 'IDLE' },
      synth: { id: 'synth', position: { x: 50, y: 0 }, state: 'IDLE' },
      echo: { id: 'echo', position: { x: 60, y: 0 }, state: 'IDLE' },
      nexus: { id: 'nexus', position: { x: 0, y: 0 }, state: 'IDLE' },
    } as any,
  };
}

// ═══════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════

describe('VoiceEventBridge — agent:click → agent-selected', () => {
  let engine: ReturnType<typeof createMockEngine>;
  let eventBus: EventBus;

  beforeEach(() => {
    engine = createMockEngine();
    eventBus = createEventBus();
  });

  it('translates agent:click to agent-selected event', () => {
    const bridge = createVoiceEventBridge(engine, eventBus, null);

    eventBus.emit({
      type: 'agent:click',
      agentId: 'oracle',
      timestamp: 12345,
    });

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('agent-selected');
    expect(engine.events[0].agentId).toBe('oracle');

    bridge.dispose();
  });

  it('ignores agent:click without agentId', () => {
    const bridge = createVoiceEventBridge(engine, eventBus, null);

    eventBus.emit({
      type: 'agent:click',
      timestamp: 12345,
    });

    expect(engine.events).toHaveLength(0);

    bridge.dispose();
  });

  it('ignores events after dispose', () => {
    const bridge = createVoiceEventBridge(engine, eventBus, null);
    bridge.dispose();

    eventBus.emit({
      type: 'agent:click',
      agentId: 'oracle',
      timestamp: 12345,
    });

    expect(engine.events).toHaveLength(0);
  });
});

describe('VoiceEventBridge — MapState transitions', () => {
  let engine: ReturnType<typeof createMockEngine>;
  let mapStore: Store<MapState>;

  beforeEach(() => {
    engine = createMockEngine();
    mapStore = createStore<MapState>(createTestMapState());
  });

  it('detects IDLE → ACTIVE state transition', () => {
    const bridge = createVoiceEventBridge(engine, null, mapStore);

    // The initial subscribe fires immediately — clear any init events
    engine.events.length = 0;

    // Trigger state change
    mapStore.update((s) => ({
      ...s,
      agents: {
        ...s.agents,
        oracle: { ...s.agents.oracle, state: 'ACTIVE' },
      },
    }));

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('state-change');
    expect(engine.events[0].agentId).toBe('oracle');
    expect(engine.events[0].newState).toBe('ACTIVE');
    expect(engine.events[0].previousState).toBe('IDLE');

    bridge.dispose();
  });

  it('does not fire for same state', () => {
    const bridge = createVoiceEventBridge(engine, null, mapStore);
    engine.events.length = 0;

    // Set same state — should not trigger
    mapStore.update((s) => ({
      ...s,
      agents: {
        ...s.agents,
        oracle: { ...s.agents.oracle, state: 'IDLE' },
      },
    }));

    expect(engine.events).toHaveLength(0);

    bridge.dispose();
  });

  it('detects transitions for multiple agents', () => {
    const bridge = createVoiceEventBridge(engine, null, mapStore);
    engine.events.length = 0;

    mapStore.update((s) => ({
      ...s,
      agents: {
        ...s.agents,
        oracle: { ...s.agents.oracle, state: 'ACTIVE' },
        atlas: { ...s.agents.atlas, state: 'ERROR' },
      },
    }));

    expect(engine.events).toHaveLength(2);
    const agents = engine.events.map((e) => e.agentId);
    expect(agents).toContain('oracle');
    expect(agents).toContain('atlas');

    bridge.dispose();
  });
});

describe('VoiceEventBridge — imperative push', () => {
  let engine: ReturnType<typeof createMockEngine>;

  beforeEach(() => {
    engine = createMockEngine();
  });

  it('push sends event to engine', () => {
    const bridge = createVoiceEventBridge(engine, null, null);

    bridge.push('mission-completed', 'synth' as any);

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('mission-completed');
    expect(engine.events[0].agentId).toBe('synth');

    bridge.dispose();
  });

  it('push is no-op after dispose', () => {
    const bridge = createVoiceEventBridge(engine, null, null);
    bridge.dispose();

    bridge.push('agent-spawned', 'oracle' as any);
    expect(engine.events).toHaveLength(0);
  });
});

describe('VoiceEventBridge — lifecycle', () => {
  it('starts not disposed', () => {
    const bridge = createVoiceEventBridge(createMockEngine(), null, null);
    expect(bridge.disposed).toBe(false);
    bridge.dispose();
  });

  it('marks as disposed', () => {
    const bridge = createVoiceEventBridge(createMockEngine(), null, null);
    bridge.dispose();
    expect(bridge.disposed).toBe(true);
  });

  it('dispose is idempotent', () => {
    const bridge = createVoiceEventBridge(createMockEngine(), null, null);
    bridge.dispose();
    bridge.dispose();
    expect(bridge.disposed).toBe(true);
  });

  it('works with all sources null (minimal/testing mode)', () => {
    const engine = createMockEngine();
    const bridge = createVoiceEventBridge(engine, null, null);

    // Should still support push
    bridge.push('agent-spawned', 'oracle' as any);
    expect(engine.events).toHaveLength(1);

    bridge.dispose();
  });
});
