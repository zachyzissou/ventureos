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
      venture_research: { id: 'venture_research', position: { x: 0, y: 0 }, state: 'IDLE' },
      venture_infrastructure: { id: 'venture_infrastructure', position: { x: 10, y: 0 }, state: 'IDLE' },
      venture_security: { id: 'venture_security', position: { x: 20, y: 0 }, state: 'IDLE' },
      venture_evidence: { id: 'venture_evidence', position: { x: 30, y: 0 }, state: 'IDLE' },
      venture_memory: { id: 'venture_memory', position: { x: 40, y: 0 }, state: 'IDLE' },
      venture_delivery: { id: 'venture_delivery', position: { x: 50, y: 0 }, state: 'IDLE' },
      venture_strategy: { id: 'venture_strategy', position: { x: 60, y: 0 }, state: 'IDLE' },
      venture_control: { id: 'venture_control', position: { x: 0, y: 0 }, state: 'IDLE' },
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
      agentId: 'venture_research',
      timestamp: 12345,
    });

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('agent-selected');
    expect(engine.events[0].agentId).toBe('venture_research');

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
      agentId: 'venture_research',
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
        venture_research: { ...s.agents.venture_research, state: 'ACTIVE' },
      },
    }));

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('state-change');
    expect(engine.events[0].agentId).toBe('venture_research');
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
        venture_research: { ...s.agents.venture_research, state: 'IDLE' },
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
        venture_research: { ...s.agents.venture_research, state: 'ACTIVE' },
        venture_infrastructure: { ...s.agents.venture_infrastructure, state: 'ERROR' },
      },
    }));

    expect(engine.events).toHaveLength(2);
    const agents = engine.events.map((e) => e.agentId);
    expect(agents).toContain('venture_research');
    expect(agents).toContain('venture_infrastructure');

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

    bridge.push('mission-completed', 'venture_delivery' as any);

    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].type).toBe('mission-completed');
    expect(engine.events[0].agentId).toBe('venture_delivery');

    bridge.dispose();
  });

  it('push is no-op after dispose', () => {
    const bridge = createVoiceEventBridge(engine, null, null);
    bridge.dispose();

    bridge.push('agent-spawned', 'venture_research' as any);
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
    bridge.push('agent-spawned', 'venture_research' as any);
    expect(engine.events).toHaveLength(1);

    bridge.dispose();
  });
});
