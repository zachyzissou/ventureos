/**
 * Phase 5.7 — Selection Ring Renderer
 *
 * Draws a golden pulsing ring around the selected agent building
 * in world space. Subscribes to the selection store.
 */

import { Container, Graphics } from 'pixi.js';
import { AGENT_ORDER, AGENTS, SELECTION, FEATURES } from '@/config';
import type { AgentId, Point } from '@/config';
import type { Store } from '@/state/store';
import type { SelectionState } from '@/state/types';
import { clamp01 } from '@/utils/color';

export type SelectionRing = {
  container: Container;
  update: (elapsedMs: number) => void;
  destroy: () => void;
};

export function createSelectionRing(
  selectionStore: Store<SelectionState>,
  getAgentPosition: (id: AgentId) => Point
): SelectionRing {
  const container = new Container();

  const ring = new Graphics();
  const glow = new Graphics();
  container.addChild(glow, ring);

  let selectedId: AgentId | null = null;
  let phase = 0;

  const unsub = selectionStore.subscribe((s) => {
    selectedId = s.selectedId;
    if (!selectedId) {
      container.visible = false;
    } else {
      container.visible = FEATURES.INTERACTIVE_SELECTION;
      const pos = getAgentPosition(selectedId);
      container.position.set(pos.x, pos.y);
      redraw();
    }
  });

  function redraw() {
    const r = SELECTION.RING_RADIUS;

    ring.clear();
    ring.circle(0, 0, r).stroke({
      width: SELECTION.RING_WIDTH,
      color: SELECTION.RING_COLOR,
      alpha: SELECTION.RING_ALPHA
    });

    // Corner ticks (Protoss-style brackets)
    const tickLen = 12;
    const tickR = r + 6;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
      const cx = Math.cos(angle) * tickR;
      const cy = Math.sin(angle) * tickR;
      const dx = Math.cos(angle) * tickLen * 0.5;
      const dy = Math.sin(angle) * tickLen * 0.5;
      // perpendicular for bracket arms
      const px = -dy * 0.6;
      const py = dx * 0.6;
      ring.moveTo(cx - px, cy - py).lineTo(cx + dx, cy + dy).lineTo(cx + px, cy + py)
        .stroke({ width: 2, color: SELECTION.RING_COLOR, alpha: 0.7 });
    }

    glow.clear();
    glow.circle(0, 0, r + 2).stroke({
      width: SELECTION.RING_WIDTH + 4,
      color: SELECTION.RING_COLOR,
      alpha: 0.15
    });
  }

  function update(elapsedMs: number) {
    if (!selectedId || !container.visible) return;

    phase += (elapsedMs / 1000) * SELECTION.PULSE_HZ * Math.PI * 2;
    const pulse = 0.7 + Math.sin(phase) * 0.3;
    glow.alpha = pulse * 0.5;
    ring.alpha = 0.7 + pulse * 0.3;

    // Update position in case agent moved
    const pos = getAgentPosition(selectedId);
    container.position.set(pos.x, pos.y);
  }

  function destroy() {
    unsub();
  }

  container.visible = false;
  return { container, update, destroy };
}
