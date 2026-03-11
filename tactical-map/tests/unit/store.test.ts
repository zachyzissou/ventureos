import { describe, it, expect } from 'vitest';
import { createStore } from '@/state/store';

describe('state/store', () => {
  it('subscribes, updates, and unsubscribes', () => {
    const s = createStore(0);
    const seen: number[] = [];

    const unsub = s.subscribe((v) => seen.push(v));
    expect(seen).toEqual([0]);

    s.set(1);
    s.update((v) => v + 1);
    expect(s.get()).toBe(2);
    expect(seen).toEqual([0, 1, 2]);

    unsub();
    s.set(3);
    expect(seen).toEqual([0, 1, 2]);
  });
});
