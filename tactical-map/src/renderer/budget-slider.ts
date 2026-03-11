/**
 * Budget Slider Renderer — Phase 5.7
 *
 * Draggable slider for adjusting agent token budgets.
 * Renders inside the Agent Detail Panel when budget editing is active.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { AgentId } from '@/config';

export type BudgetSliderLayer = {
  container: Container;
  /** Configure the slider for an agent. */
  configure: (agentId: AgentId, currentBudget: number, maxBudget: number) => void;
  /** Get current slider value. */
  getValue: () => number;
  /** Set the on-change callback. */
  onChange: (callback: (agentId: AgentId, newBudget: number) => void) => void;
  /** Set the on-commit callback (drag end). */
  onCommit: (callback: (agentId: AgentId, newBudget: number, previousBudget: number) => void) => void;
  /** Show/hide. */
  setVisible: (visible: boolean) => void;
  /** Per-frame update. */
  update: (elapsedMs: number) => void;
  /** Current agent. */
  currentAgent: () => AgentId | null;
};

const SLIDER_WIDTH = 260;
const SLIDER_HEIGHT = 8;
const THUMB_RADIUS = 10;
const PADDING = 16;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

export function createBudgetSlider(): BudgetSliderLayer {
  const container = new Container();
  container.visible = false;

  let agentId: AgentId | null = null;
  let currentBudget = 0;
  let maxBudget = 100000;
  let sliderValue = 0; // 0..1
  let isDragging = false;
  let previousBudget = 0;
  let changeCallback: ((agentId: AgentId, newBudget: number) => void) | null = null;
  let commitCallback: ((agentId: AgentId, newBudget: number, previousBudget: number) => void) | null = null;

  // Track background
  const track = new Graphics();
  container.addChild(track);

  // Filled portion
  const fill = new Graphics();
  container.addChild(fill);

  // Thumb
  const thumb = new Graphics();
  thumb.eventMode = 'static';
  thumb.cursor = 'grab';
  container.addChild(thumb);

  // Value display
  const valueText = new Text({
    text: '0',
    style: { fontSize: 12, fill: 0xffffff, fontFamily },
  });
  valueText.anchor.set(0.5, 1);
  container.addChild(valueText);

  // Min/max labels
  const minLabel = new Text({
    text: '0',
    style: { fontSize: 10, fill: 0x666688, fontFamily },
  });
  minLabel.position.set(PADDING, SLIDER_HEIGHT + 14);
  container.addChild(minLabel);

  const maxLabel = new Text({
    text: '100k',
    style: { fontSize: 10, fill: 0x666688, fontFamily },
  });
  maxLabel.anchor.set(1, 0);
  maxLabel.position.set(PADDING + SLIDER_WIDTH, SLIDER_HEIGHT + 14);
  container.addChild(maxLabel);

  // Hit area for track clicks
  const hitArea = new Graphics();
  hitArea.eventMode = 'static';
  hitArea.cursor = 'pointer';
  hitArea.rect(PADDING - 4, -8, SLIDER_WIDTH + 8, SLIDER_HEIGHT + 16).fill({ color: 0x000000, alpha: 0.01 });
  container.addChild(hitArea);

  function xToRatio(x: number): number {
    return Math.max(0, Math.min(1, (x - PADDING) / SLIDER_WIDTH));
  }

  function ratioToX(ratio: number): number {
    return PADDING + ratio * SLIDER_WIDTH;
  }

  function renderSlider() {
    const x = ratioToX(sliderValue);
    const budget = Math.round(sliderValue * maxBudget);

    // Track
    track.clear();
    track.roundRect(PADDING, 0, SLIDER_WIDTH, SLIDER_HEIGHT, 4)
      .fill({ color: 0x222244, alpha: 0.8 });

    // Fill
    fill.clear();
    const fillColor = sliderValue > 0.8 ? 0xff3b3b : sliderValue > 0.5 ? 0xffc247 : 0x39e58c;
    fill.roundRect(PADDING, 0, Math.max(0, x - PADDING), SLIDER_HEIGHT, 4)
      .fill({ color: fillColor, alpha: 0.8 });

    // Thumb
    thumb.clear();
    thumb.circle(0, 0, THUMB_RADIUS)
      .fill({ color: 0xffffff, alpha: 0.95 });
    thumb.circle(0, 0, THUMB_RADIUS + 2)
      .stroke({ width: 2, color: fillColor, alpha: 0.6 });
    thumb.position.set(x, SLIDER_HEIGHT / 2);

    // Value label
    valueText.text = formatBudget(budget);
    valueText.position.set(x, -8);
  }

  function formatBudget(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return value.toString();
  }

  function handlePointerEvent(e: FederatedPointerEvent) {
    const local = container.toLocal(e.global);
    sliderValue = xToRatio(local.x);
    renderSlider();
    if (agentId && changeCallback) {
      changeCallback(agentId, Math.round(sliderValue * maxBudget));
    }
  }

  thumb.on('pointerdown', (e: FederatedPointerEvent) => {
    isDragging = true;
    previousBudget = Math.round(sliderValue * maxBudget);
    thumb.cursor = 'grabbing';
    handlePointerEvent(e);
  });

  hitArea.on('pointerdown', (e: FederatedPointerEvent) => {
    isDragging = true;
    previousBudget = Math.round(sliderValue * maxBudget);
    handlePointerEvent(e);
  });

  // Global move/up (wired by parent stage; we expose simple handlers)
  container.eventMode = 'static';
  container.on('globalpointermove', (e: FederatedPointerEvent) => {
    if (!isDragging) return;
    handlePointerEvent(e);
  });

  container.on('pointerup', endDrag);
  container.on('pointerupoutside', endDrag);

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    thumb.cursor = 'grab';
    if (agentId && commitCallback) {
      commitCallback(agentId, Math.round(sliderValue * maxBudget), previousBudget);
    }
  }

  function configure(id: AgentId, budget: number, max: number) {
    agentId = id;
    currentBudget = budget;
    maxBudget = Math.max(1, max);
    sliderValue = Math.max(0, Math.min(1, budget / maxBudget));
    previousBudget = budget;

    minLabel.text = '0';
    maxLabel.text = formatBudget(maxBudget);

    renderSlider();
  }

  return {
    container,
    configure,
    getValue: () => Math.round(sliderValue * maxBudget),
    onChange: (cb) => { changeCallback = cb; },
    onCommit: (cb) => { commitCallback = cb; },
    setVisible: (v) => { container.visible = v; },
    update: (_elapsedMs) => { /* Static for now; could animate thumb glow */ },
    currentAgent: () => agentId,
  };
}
