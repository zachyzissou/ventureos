/**
 * Tour Overlay Renderer — Issue #210
 *
 * Full-screen overlay with spotlight cutout + tooltip card.
 * Follows Container/Graphics/Text show-hide/update pattern.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { TourStep, TourAnchor } from '@/tour/types';
import type { AgentId, Point } from '@/config';
import { AGENTS, AGENT_ORDER } from '@/config';

export type TourOverlayLayer = {
  container: Container;
  show: (step: TourStep, stepIndex: number, totalSteps: number) => void;
  hide: () => void;
  isVisible: () => boolean;
  setViewport: (width: number, height: number) => void;
  update: (elapsedMs: number) => void;
  onNext: (cb: () => void) => void;
  onBack: (cb: () => void) => void;
  onDismiss: (cb: () => void) => void;
  getDisplayedStepIndex: () => number;
};

const BACKDROP_ALPHA = 0.55;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_PADDING = 16;
const TOOLTIP_RADIUS = 8;
const ANIM_SPEED = 0.005;
const DEFAULT_SPOTLIGHT_RADIUS = 80;
const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

export function createTourOverlay(): TourOverlayLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 2000;
  container.eventMode = 'static';

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let displayedStepIndex = -1;
  let nextCb: (() => void) | null = null;
  let backCb: (() => void) | null = null;
  let dismissCb: (() => void) | null = null;

  const backdrop = new Graphics();
  container.addChild(backdrop);

  const tooltip = new Container();
  container.addChild(tooltip);

  const tooltipBg = new Graphics();
  tooltip.addChild(tooltipBg);

  const titleText = new Text({
    text: '',
    style: { fontSize: 16, fontWeight: 'bold', fill: 0x00d4ff, fontFamily },
  });
  titleText.position.set(TOOLTIP_PADDING, TOOLTIP_PADDING);
  tooltip.addChild(titleText);

  const bodyText = new Text({
    text: '',
    style: {
      fontSize: 12, fill: 0xdddddd, fontFamily,
      wordWrap: true, wordWrapWidth: TOOLTIP_WIDTH - TOOLTIP_PADDING * 2, lineHeight: 18,
    },
  });
  bodyText.position.set(TOOLTIP_PADDING, TOOLTIP_PADDING + 26);
  tooltip.addChild(bodyText);

  const progressText = new Text({
    text: '', style: { fontSize: 10, fill: 0x667788, fontFamily },
  });
  tooltip.addChild(progressText);

  const backBtn = createButton('← Back', () => backCb?.());
  tooltip.addChild(backBtn.container);
  const nextBtn = createButton('Next →', () => nextCb?.());
  tooltip.addChild(nextBtn.container);
  const dismissBtn = createButton('Skip tour', () => dismissCb?.());
  tooltip.addChild(dismissBtn.container);

  let currentSpotlight: Point = { x: 0, y: 0 };
  let currentRadius = DEFAULT_SPOTLIGHT_RADIUS;
  let isFullScreen = false;

  function resolveAnchor(anchor: TourAnchor): { point: Point; fullScreen: boolean } {
    if (anchor === 'viewport') return { point: { x: vpWidth / 2, y: vpHeight / 2 }, fullScreen: true };
    if (anchor === 'control_hub') return { point: { x: vpWidth / 2, y: vpHeight / 2 }, fullScreen: false };
    if (anchor === 'hud') return { point: { x: vpWidth / 2, y: 22 }, fullScreen: false };
    if (typeof anchor === 'object' && 'x' in anchor) {
      return { point: { x: anchor.x + vpWidth / 2, y: anchor.y + vpHeight / 2 }, fullScreen: false };
    }
    const agentId = anchor.replace('agent:', '') as AgentId;
    const idx = AGENT_ORDER.indexOf(agentId);
    if (idx >= 0 && AGENTS.POSITIONS[idx]) {
      const pos = AGENTS.POSITIONS[idx];
      return { point: { x: pos.x + vpWidth / 2, y: pos.y + vpHeight / 2 }, fullScreen: false };
    }
    return { point: { x: vpWidth / 2, y: vpHeight / 2 }, fullScreen: true };
  }

  function drawBackdrop() {
    backdrop.clear();
    backdrop.rect(0, 0, vpWidth, vpHeight).fill({ color: 0x000000, alpha: BACKDROP_ALPHA });
    if (!isFullScreen) {
      backdrop.circle(currentSpotlight.x, currentSpotlight.y, currentRadius).cut();
    }
  }

  function layoutTooltip(step: TourStep, stepIdx: number, total: number) {
    titleText.text = step.title;
    bodyText.text = step.body;
    progressText.text = `${stepIdx + 1} / ${total}`;

    const contentHeight = 26 + bodyText.height + 12;
    const buttonRowY = TOOLTIP_PADDING + contentHeight + 8;
    const tooltipHeight = buttonRowY + 32 + TOOLTIP_PADDING;

    tooltipBg.clear();
    tooltipBg.roundRect(0, 0, TOOLTIP_WIDTH, tooltipHeight, TOOLTIP_RADIUS)
      .fill({ color: 0x0a0e1a, alpha: 0.92 })
      .stroke({ width: 1, color: 0x1a3050, alpha: 0.7 });

    progressText.position.set(TOOLTIP_WIDTH - TOOLTIP_PADDING - progressText.width, TOOLTIP_PADDING + 2);

    const isFirst = stepIdx === 0;
    const isLast = stepIdx === total - 1;

    backBtn.container.visible = !isFirst;
    backBtn.container.position.set(TOOLTIP_PADDING, buttonRowY);
    nextBtn.setText(isLast ? 'Finish ✓' : 'Next →');
    nextBtn.container.position.set(TOOLTIP_WIDTH - TOOLTIP_PADDING - 72, buttonRowY);
    dismissBtn.container.position.set(isFirst ? TOOLTIP_PADDING : TOOLTIP_PADDING + 72, buttonRowY);
    dismissBtn.container.visible = !isLast;

    let tx: number, ty: number;
    if (isFullScreen) {
      tx = (vpWidth - TOOLTIP_WIDTH) / 2;
      ty = (vpHeight - tooltipHeight) / 2;
    } else {
      tx = currentSpotlight.x + currentRadius + 20;
      ty = currentSpotlight.y - tooltipHeight / 2;
      if (tx + TOOLTIP_WIDTH > vpWidth - 16) tx = currentSpotlight.x - currentRadius - TOOLTIP_WIDTH - 20;
      if (tx < 16) tx = 16;
      if (ty < 16) ty = 16;
      if (ty + tooltipHeight > vpHeight - 16) ty = vpHeight - tooltipHeight - 16;
    }
    tooltip.position.set(tx, ty);
  }

  function show(step: TourStep, stepIndex: number, totalSteps: number) {
    displayedStepIndex = stepIndex;
    visible = true;
    targetAlpha = 1;
    container.visible = true;
    const resolved = resolveAnchor(step.anchor);
    currentSpotlight = resolved.point;
    currentRadius = step.spotlightRadius ?? DEFAULT_SPOTLIGHT_RADIUS;
    isFullScreen = resolved.fullScreen;
    drawBackdrop();
    layoutTooltip(step, stepIndex, totalSteps);
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
    displayedStepIndex = -1;
  }

  function setViewport(width: number, height: number) {
    vpWidth = width; vpHeight = height;
    if (visible) drawBackdrop();
  }

  function update(elapsedMs: number) {
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) container.visible = false;
    }
  }

  return {
    container, show, hide,
    isVisible: () => visible,
    setViewport, update,
    onNext: (cb) => { nextCb = cb; },
    onBack: (cb) => { backCb = cb; },
    onDismiss: (cb) => { dismissCb = cb; },
    getDisplayedStepIndex: () => displayedStepIndex,
  };
}

type ButtonView = { container: Container; setText: (text: string) => void };

function createButton(label: string, onClick: () => void): ButtonView {
  const c = new Container();
  c.eventMode = 'static';
  c.cursor = 'pointer';
  const bg = new Graphics();
  const txt = new Text({ text: label, style: { fontSize: 11, fill: 0xccddee, fontFamily } });
  txt.position.set(8, 5);

  function draw() {
    bg.clear();
    bg.roundRect(0, 0, Math.max(64, txt.width + 16), 24, 4)
      .fill({ color: 0x1a2840, alpha: 0.8 })
      .stroke({ width: 1, color: 0x2a4a6a, alpha: 0.5 });
  }
  draw();
  c.addChild(bg, txt);
  c.on('pointertap', (e) => { e.stopPropagation(); onClick(); });
  return { container: c, setText: (text: string) => { txt.text = text; draw(); } };
}
