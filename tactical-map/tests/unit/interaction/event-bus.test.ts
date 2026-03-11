import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '@/interaction/event-bus';
import type { InteractionEvent } from '@/interaction/types';

describe('interaction/event-bus', () => {
  it('creates a bus with zero subscribers', () => {
    const bus = createEventBus();
    expect(bus.subscriberCount()).toBe(0);
  });

  it('emits events to typed subscribers', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('agent:click', handler);

    const event: InteractionEvent = {
      type: 'agent:click',
      agentId: 'synth',
      timestamp: 1000,
    };
    bus.emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not emit to non-matching type', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('agent:hover', handler);

    bus.emit({ type: 'agent:click', timestamp: 1000 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('onAny receives all events', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.onAny(handler);

    bus.emit({ type: 'agent:click', timestamp: 1000 });
    bus.emit({ type: 'palette:open', timestamp: 2000 });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.on('agent:click', handler);

    bus.emit({ type: 'agent:click', timestamp: 1000 });
    expect(handler).toHaveBeenCalledOnce();

    unsub();
    bus.emit({ type: 'agent:click', timestamp: 2000 });
    expect(handler).toHaveBeenCalledOnce(); // still 1
  });

  it('onAny unsubscribe works', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsub = bus.onAny(handler);

    bus.emit({ type: 'agent:click', timestamp: 1000 });
    unsub();
    bus.emit({ type: 'agent:click', timestamp: 2000 });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('clear removes all subscribers', () => {
    const bus = createEventBus();
    bus.on('agent:click', vi.fn());
    bus.on('agent:hover', vi.fn());
    bus.onAny(vi.fn());

    expect(bus.subscriberCount()).toBe(3);
    bus.clear();
    expect(bus.subscriberCount()).toBe(0);
  });

  it('multiple subscribers for same event type', () => {
    const bus = createEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('agent:click', h1);
    bus.on('agent:click', h2);

    bus.emit({ type: 'agent:click', timestamp: 1000 });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('subscriberCount is accurate', () => {
    const bus = createEventBus();
    bus.on('agent:click', vi.fn());
    bus.on('agent:hover', vi.fn());
    bus.onAny(vi.fn());
    expect(bus.subscriberCount()).toBe(3);
  });

  it('emits position data', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('terrain:click', handler);

    bus.emit({
      type: 'terrain:click',
      position: { x: 100, y: 200 },
      timestamp: 1000,
    });

    expect(handler.mock.calls[0][0].position).toEqual({ x: 100, y: 200 });
  });
});
