/**
 * Interaction Event Bus — Phase 5.7
 *
 * Pub/sub system for interaction events (click, hover, palette open, etc.)
 * Decouples PixiJS canvas events from React overlay state.
 */

import type { InteractionEvent, InteractionEventType, InteractionHandler } from './types';

export type EventBus = {
  /** Subscribe to a specific event type. Returns unsubscribe fn. */
  on: (type: InteractionEventType, handler: InteractionHandler) => () => void;
  /** Subscribe to all events. Returns unsubscribe fn. */
  onAny: (handler: InteractionHandler) => () => void;
  /** Emit an event to all matching subscribers. */
  emit: (event: InteractionEvent) => void;
  /** Remove all subscribers. */
  clear: () => void;
  /** Get subscriber count (for testing). */
  subscriberCount: () => number;
};

export function createEventBus(): EventBus {
  const typed = new Map<InteractionEventType, Set<InteractionHandler>>();
  const wildcard = new Set<InteractionHandler>();

  function on(type: InteractionEventType, handler: InteractionHandler): () => void {
    let set = typed.get(type);
    if (!set) {
      set = new Set();
      typed.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  function onAny(handler: InteractionHandler): () => void {
    wildcard.add(handler);
    return () => wildcard.delete(handler);
  }

  function emit(event: InteractionEvent): void {
    const set = typed.get(event.type);
    if (set) {
      for (const fn of set) fn(event);
    }
    for (const fn of wildcard) fn(event);
  }

  function clear(): void {
    typed.clear();
    wildcard.clear();
  }

  function subscriberCount(): number {
    let count = wildcard.size;
    for (const set of typed.values()) count += set.size;
    return count;
  }

  return { on, onAny, emit, clear, subscriberCount };
}
