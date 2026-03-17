import { describe, it, expect } from 'vitest';
import {
  createUndoStack,
  pushUndo,
  undo,
  redo,
  canUndo,
  canRedo,
  clearUndoStack,
  peekUndo,
  peekRedo,
} from '@/interaction/undo';
import type { ControlAction } from '@/interaction/types';

function makeAction(type: string, target = 'venture_delivery'): ControlAction {
  return {
    type: type as ControlAction['type'],
    target: target as ControlAction['target'],
    payload: {},
    createdAt: new Date().toISOString(),
  };
}

describe('interaction/undo', () => {
  describe('createUndoStack', () => {
    it('creates empty stack', () => {
      const stack = createUndoStack();
      expect(stack.entries).toHaveLength(0);
      expect(stack.cursor).toBe(-1);
      expect(stack.maxSize).toBe(50);
    });

    it('accepts custom max size', () => {
      const stack = createUndoStack(10);
      expect(stack.maxSize).toBe(10);
    });
  });

  describe('pushUndo', () => {
    it('adds entry and advances cursor', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { paused: false });
      expect(stack.entries).toHaveLength(1);
      expect(stack.cursor).toBe(0);
    });

    it('multiple pushes accumulate', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { paused: false });
      stack = pushUndo(stack, makeAction('agent:resume'), { paused: true });
      expect(stack.entries).toHaveLength(2);
      expect(stack.cursor).toBe(1);
    });

    it('evicts oldest when over max size', () => {
      let stack = createUndoStack(3);
      for (let i = 0; i < 5; i++) {
        stack = pushUndo(stack, makeAction('agent:pause'), { i });
      }
      expect(stack.entries).toHaveLength(3);
      expect(stack.cursor).toBe(2);
      // First two should have been evicted
      expect(stack.entries[0].previousState).toEqual({ i: 2 });
    });

    it('discards redo entries after undo + new push', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { step: 1 });
      stack = pushUndo(stack, makeAction('agent:resume'), { step: 2 });
      // Undo once
      const [undoneStack] = undo(stack);
      // Push new action — should discard the redo entry
      const newStack = pushUndo(undoneStack, makeAction('mission:spawn'), { step: 3 });
      expect(newStack.entries).toHaveLength(2);
      expect(newStack.cursor).toBe(1);
      expect(newStack.entries[1].action.type).toBe('mission:spawn');
    });
  });

  describe('undo', () => {
    it('returns null on empty stack', () => {
      const stack = createUndoStack();
      const [newStack, entry] = undo(stack);
      expect(entry).toBeNull();
      expect(newStack.cursor).toBe(-1);
    });

    it('returns entry and moves cursor back', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { paused: false });
      const [newStack, entry] = undo(stack);
      expect(entry).not.toBeNull();
      expect(entry!.action.type).toBe('agent:pause');
      expect(newStack.cursor).toBe(-1);
    });

    it('multiple undos work in order', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause', 'venture_delivery'), { step: 1 });
      stack = pushUndo(stack, makeAction('agent:resume', 'venture_infrastructure'), { step: 2 });

      const [s1, e1] = undo(stack);
      expect(e1!.action.target).toBe('venture_infrastructure');

      const [s2, e2] = undo(s1);
      expect(e2!.action.target).toBe('venture_delivery');

      const [s3, e3] = undo(s2);
      expect(e3).toBeNull();
    });
  });

  describe('redo', () => {
    it('returns null when nothing to redo', () => {
      const stack = createUndoStack();
      const [_, entry] = redo(stack);
      expect(entry).toBeNull();
    });

    it('redoes after undo', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { paused: false });
      const [undoneStack] = undo(stack);
      const [redoneStack, entry] = redo(undoneStack);
      expect(entry).not.toBeNull();
      expect(entry!.action.type).toBe('agent:pause');
      expect(redoneStack.cursor).toBe(0);
    });

    it('undo then redo preserves state', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), { a: 1 });
      stack = pushUndo(stack, makeAction('agent:resume'), { a: 2 });

      const [s1] = undo(stack);
      const [s2] = undo(s1);
      const [s3, e3] = redo(s2);
      expect(e3!.previousState).toEqual({ a: 1 });
      const [s4, e4] = redo(s3);
      expect(e4!.previousState).toEqual({ a: 2 });
    });
  });

  describe('canUndo / canRedo', () => {
    it('canUndo is false on empty stack', () => {
      expect(canUndo(createUndoStack())).toBe(false);
    });

    it('canUndo is true after push', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      expect(canUndo(stack)).toBe(true);
    });

    it('canRedo is false after push', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      expect(canRedo(stack)).toBe(false);
    });

    it('canRedo is true after undo', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      const [undone] = undo(stack);
      expect(canRedo(undone)).toBe(true);
    });
  });

  describe('peekUndo / peekRedo', () => {
    it('peekUndo returns current entry without modifying stack', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      const entry = peekUndo(stack);
      expect(entry).not.toBeNull();
      expect(stack.cursor).toBe(0); // unchanged
    });

    it('peekRedo returns next entry after undo', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      const [undone] = undo(stack);
      const entry = peekRedo(undone);
      expect(entry).not.toBeNull();
    });
  });

  describe('clearUndoStack', () => {
    it('empties the stack', () => {
      let stack = createUndoStack();
      stack = pushUndo(stack, makeAction('agent:pause'), {});
      stack = pushUndo(stack, makeAction('agent:resume'), {});
      const cleared = clearUndoStack(stack);
      expect(cleared.entries).toHaveLength(0);
      expect(cleared.cursor).toBe(-1);
    });
  });
});
