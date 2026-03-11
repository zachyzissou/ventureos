/**
 * Voice Event Bridge — Phase 5.9 (#209)
 *
 * Bridges the tactical map's InteractionEvent bus and MapState store
 * to the VoiceLineEngine.  Translates low-level UI/state events into
 * VoiceMapEvents that the trigger-rule system understands.
 *
 * Responsibilities:
 *   1. Subscribe to the EventBus for agent:click → agent-selected
 *   2. Subscribe to the MapState store for state transitions
 *   3. Accept imperative push events (mission-completed, agent-spawned, etc.)
 *   4. Feed everything into VoiceLineEngine.handleEvent()
 *
 * Lifecycle:
 *   const bridge = createVoiceEventBridge(engine, eventBus, mapStore);
 *   // ... later:
 *   bridge.dispose();  // unsubscribes everything
 */

import type { AgentId } from '@/config';
import { AGENT_ORDER } from '@/config';
import type { EventBus } from '@/interaction/event-bus';
import type { Store } from '@/state/store';
import type { MapState, BuildingState } from '@/state/types';
import type { VoiceLineEngine } from './voice-line-engine';
import type { VoiceMapEvent, VoiceMapEventType } from './voice-types';

// ═══════════════════════════════════════════
// Bridge
// ═══════════════════════════════════════════

export interface VoiceEventBridge {
  /**
   * Push an imperative event (e.g., from server-sent events).
   * Useful for events that don't come through the store or event bus.
   */
  push(type: VoiceMapEventType, agentId: AgentId, extra?: Partial<VoiceMapEvent>): void;

  /** Unsubscribe from all event sources. */
  dispose(): void;

  /** Whether the bridge has been disposed. */
  readonly disposed: boolean;
}

export function createVoiceEventBridge(
  engine: VoiceLineEngine,
  eventBus: EventBus | null,
  mapStore: Store<MapState> | null,
): VoiceEventBridge {
  const unsubs: Array<() => void> = [];
  let _disposed = false;

  // ── Track previous agent states for transition detection ──
  const prevStates = new Map<AgentId, BuildingState>();

  // Initialize previous states from current store value
  if (mapStore) {
    const initial = mapStore.get();
    for (const id of AGENT_ORDER) {
      const agent = initial.agents[id];
      if (agent) {
        prevStates.set(id, agent.state);
      }
    }
  }

  // ── EventBus: agent:click → agent-selected ──
  if (eventBus) {
    const unsub = eventBus.on('agent:click', (event) => {
      if (!event.agentId || _disposed) return;
      engine.handleEvent({
        type: 'agent-selected',
        agentId: event.agentId as AgentId,
        timestamp: event.timestamp,
      });
    });
    unsubs.push(unsub);
  }

  // ── MapState store: detect state transitions ──
  if (mapStore) {
    const unsub = mapStore.subscribe((state) => {
      if (_disposed) return;

      for (const id of AGENT_ORDER) {
        const agent = state.agents[id];
        if (!agent) continue;

        const prev = prevStates.get(id);
        if (prev !== undefined && prev !== agent.state) {
          engine.handleEvent({
            type: 'state-change',
            agentId: id,
            newState: agent.state,
            previousState: prev,
            timestamp: Date.now(),
          });
        }
        prevStates.set(id, agent.state);
      }
    });
    unsubs.push(unsub);
  }

  // ── Public API ──

  function push(
    type: VoiceMapEventType,
    agentId: AgentId,
    extra?: Partial<VoiceMapEvent>,
  ): void {
    if (_disposed) return;
    engine.handleEvent({
      type,
      agentId,
      timestamp: Date.now(),
      ...extra,
    });
  }

  function dispose(): void {
    if (_disposed) return;
    _disposed = true;
    for (const unsub of unsubs) unsub();
    unsubs.length = 0;
    prevStates.clear();
  }

  return {
    push,
    dispose,
    get disposed() { return _disposed; },
  };
}
