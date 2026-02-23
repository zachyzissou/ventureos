export type Unsubscribe = () => void;

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  update: (fn: (curr: T) => T) => void;
  subscribe: (fn: (next: T) => void) => Unsubscribe;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(next: T) => void>();

  function set(next: T) {
    value = next;
    for (const fn of subs) fn(value);
  }

  return {
    get: () => value,
    set,
    update: (fn) => set(fn(value)),
    subscribe: (fn) => {
      subs.add(fn);
      fn(value);
      return () => subs.delete(fn);
    }
  };
}
