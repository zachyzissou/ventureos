/**
 * Undo/Redo Stack — Phase 5.7
 *
 * Tracks control actions with their previous state
 * for reversal. Uses a linear undo stack with cursor.
 */

import type { ControlAction, UndoEntry, UndoStack } from './types';

const DEFAULT_MAX_SIZE = 50;

export function createUndoStack(maxSize = DEFAULT_MAX_SIZE): UndoStack {
  return {
    entries: [],
    cursor: -1,
    maxSize,
  };
}

/**
 * Push a new action onto the undo stack.
 * Discards any redo entries beyond the cursor.
 */
export function pushUndo(
  stack: UndoStack,
  action: ControlAction,
  previousState: Record<string, unknown>,
): UndoStack {
  // Discard redo history beyond cursor
  const entries = stack.entries.slice(0, stack.cursor + 1);

  const entry: UndoEntry = {
    id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    previousState,
    createdAt: Date.now(),
  };

  entries.push(entry);

  // Evict oldest if over max size
  while (entries.length > stack.maxSize) {
    entries.shift();
  }

  return {
    ...stack,
    entries,
    cursor: entries.length - 1,
  };
}

/**
 * Get the entry to undo (current cursor position).
 * Returns null if nothing to undo.
 */
export function peekUndo(stack: UndoStack): UndoEntry | null {
  if (stack.cursor < 0 || stack.cursor >= stack.entries.length) return null;
  return stack.entries[stack.cursor];
}

/**
 * Move cursor back (undo).
 * Returns [new stack, entry to undo] or [stack, null] if nothing.
 */
export function undo(stack: UndoStack): [UndoStack, UndoEntry | null] {
  const entry = peekUndo(stack);
  if (!entry) return [stack, null];
  return [{ ...stack, cursor: stack.cursor - 1 }, entry];
}

/**
 * Get the entry to redo (cursor + 1).
 * Returns null if nothing to redo.
 */
export function peekRedo(stack: UndoStack): UndoEntry | null {
  const nextIdx = stack.cursor + 1;
  if (nextIdx >= stack.entries.length) return null;
  return stack.entries[nextIdx];
}

/**
 * Move cursor forward (redo).
 * Returns [new stack, entry to redo] or [stack, null] if nothing.
 */
export function redo(stack: UndoStack): [UndoStack, UndoEntry | null] {
  const entry = peekRedo(stack);
  if (!entry) return [stack, null];
  return [{ ...stack, cursor: stack.cursor + 1 }, entry];
}

/**
 * Check if undo is available.
 */
export function canUndo(stack: UndoStack): boolean {
  return stack.cursor >= 0 && stack.cursor < stack.entries.length;
}

/**
 * Check if redo is available.
 */
export function canRedo(stack: UndoStack): boolean {
  return stack.cursor + 1 < stack.entries.length;
}

/**
 * Clear the entire undo stack.
 */
export function clearUndoStack(stack: UndoStack): UndoStack {
  return { ...stack, entries: [], cursor: -1 };
}
