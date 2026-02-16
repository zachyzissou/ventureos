/**
 * Phase 5.7 — Keyboard Manager
 *
 * Centralized keyboard shortcut handling for the tactical map.
 * Coordinates with the camera controller (which owns Home key)
 * and the selection store.
 */

import type { AgentId } from '@/config';
import { AGENT_ORDER } from '@/config';
import type { Store } from '@/state/store';
import type { SelectionState } from '@/state/types';

/** Ring agents (excludes nexus — not clickable). */
const RING_IDS: AgentId[] = AGENT_ORDER.filter((id) => id !== 'nexus') as AgentId[];

export type KeyboardCallbacks = {
  onToggleHealthDashboard?: () => void;
  onToggleMinimap?: () => void;
  onToggleDetailPanel?: () => void;
  onToggleHelp?: () => void;
};

export type KeyboardManager = {
  /** Detach all listeners. */
  destroy: () => void;
};

export function createKeyboardManager(
  selectionStore: Store<SelectionState>,
  callbacks: KeyboardCallbacks = {}
): KeyboardManager {

  function handleKey(e: KeyboardEvent) {
    // Don't capture if an input/textarea has focus
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key;

    // Number keys 1-7 select an agent (ring order, no nexus)
    if (key >= '1' && key <= '7') {
      const index = parseInt(key, 10) - 1;
      if (index < RING_IDS.length) {
        e.preventDefault();
        const id = RING_IDS[index];
        selectionStore.update((s) => ({
          ...s,
          selectedId: s.selectedId === id ? null : id
        }));
      }
      return;
    }

    // 8 selects nexus
    if (key === '8') {
      e.preventDefault();
      selectionStore.update((s) => ({
        ...s,
        selectedId: s.selectedId === 'nexus' ? null : 'nexus'
      }));
      return;
    }

    // Escape: deselect
    if (key === 'Escape') {
      e.preventDefault();
      selectionStore.update((s) => ({ ...s, selectedId: null }));
      return;
    }

    // Tab: cycle selection
    if (key === 'Tab') {
      e.preventDefault();
      selectionStore.update((s) => {
        if (!s.selectedId) {
          return { ...s, selectedId: RING_IDS[0] };
        }
        const idx = AGENT_ORDER.indexOf(s.selectedId);
        const nextIdx = (idx + 1) % AGENT_ORDER.length;
        return { ...s, selectedId: AGENT_ORDER[nextIdx] };
      });
      return;
    }

    // H: toggle health dashboard
    if (key === 'h' || key === 'H') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        callbacks.onToggleHealthDashboard?.();
      }
      return;
    }

    // M: toggle minimap
    if (key === 'm' || key === 'M') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        callbacks.onToggleMinimap?.();
      }
      return;
    }

    // D: toggle detail panel (focus on selected)
    if (key === 'd' || key === 'D') {
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        callbacks.onToggleDetailPanel?.();
      }
      return;
    }

    // ?: toggle help overlay
    if (key === '?' || (key === '/' && e.shiftKey)) {
      e.preventDefault();
      callbacks.onToggleHelp?.();
      return;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKey);
  }

  function destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKey);
    }
  }

  return { destroy };
}
