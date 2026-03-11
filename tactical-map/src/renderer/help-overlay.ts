/**
 * Help Overlay Renderer — Issue #210
 *
 * Keyboard shortcuts card toggled with '?'.
 * Follows Container/Graphics/Text pattern.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { HelpOverlayEntry } from '@/tour/types';

export type HelpOverlayLayer = {
  container: Container;
  toggle: () => void;
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  setViewport: (width: number, height: number) => void;
  update: (elapsedMs: number) => void;
};

const PANEL_WIDTH = 300;
const PANEL_PADDING = 16;
const ROW_HEIGHT = 22;
const CATEGORY_GAP = 12;
const HEADER_HEIGHT = 32;
const ANIM_SPEED = 0.006;
const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const CATEGORY_LABELS: Record<string, string> = {
  navigation: '🧭  Navigation',
  controls: '⌨️  Controls',
  views: '👁  Views',
};

export function createHelpOverlay(entries: HelpOverlayEntry[]): HelpOverlayLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 1900;
  container.eventMode = 'static';

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;

  const bg = new Graphics();
  container.addChild(bg);

  const titleText = new Text({
    text: 'Keyboard Shortcuts',
    style: { fontSize: 14, fontWeight: 'bold', fill: 0x00d4ff, fontFamily },
  });
  titleText.position.set(PANEL_PADDING, PANEL_PADDING);
  container.addChild(titleText);

  const closeHint = new Text({
    text: 'Press ? to close',
    style: { fontSize: 9, fill: 0x667788, fontFamily },
  });
  container.addChild(closeHint);

  const categories = ['navigation', 'controls', 'views'];
  let yOffset = PANEL_PADDING + HEADER_HEIGHT;

  for (const cat of categories) {
    const group = entries.filter((e) => e.category === cat);
    if (group.length === 0) continue;

    const catLabel = new Text({
      text: CATEGORY_LABELS[cat] ?? cat,
      style: { fontSize: 11, fontWeight: 'bold', fill: 0x88aacc, fontFamily },
    });
    catLabel.position.set(PANEL_PADDING, yOffset);
    container.addChild(catLabel);
    yOffset += ROW_HEIGHT;

    for (const entry of group) {
      const row = new Container();
      const shortcutText = new Text({
        text: entry.shortcut,
        style: { fontSize: 11, fill: 0xffd700, fontFamily },
      });
      shortcutText.position.set(PANEL_PADDING + 8, 0);
      const descText = new Text({
        text: entry.description,
        style: { fontSize: 11, fill: 0xcccccc, fontFamily },
      });
      descText.position.set(PANEL_PADDING + 90, 0);
      row.addChild(shortcutText, descText);
      row.position.set(0, yOffset);
      container.addChild(row);
      yOffset += ROW_HEIGHT;
    }
    yOffset += CATEGORY_GAP;
  }

  const totalHeight = yOffset + PANEL_PADDING;

  function drawBackground() {
    bg.clear();
    bg.roundRect(0, 0, PANEL_WIDTH, totalHeight, 8)
      .fill({ color: 0x060a14, alpha: 0.92 })
      .stroke({ width: 1, color: 0x1a3050, alpha: 0.6 });
  }

  function layout() {
    container.position.set(
      Math.round((vpWidth - PANEL_WIDTH) / 2),
      Math.round((vpHeight - totalHeight) / 2),
    );
    closeHint.position.set(PANEL_WIDTH - PANEL_PADDING - closeHint.width, PANEL_PADDING + 4);
  }

  drawBackground();
  layout();

  function show() { visible = true; targetAlpha = 1; container.visible = true; }
  function hide() { visible = false; targetAlpha = 0; }
  function toggle() { if (visible) hide(); else show(); }

  function setViewport(width: number, height: number) {
    vpWidth = width; vpHeight = height; layout();
  }

  function update(elapsedMs: number) {
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) container.visible = false;
    }
  }

  return { container, toggle, show, hide, isVisible: () => visible, setViewport, update };
}
