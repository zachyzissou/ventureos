/**
 * Phase 5.7 — Help Overlay
 *
 * Shows keyboard shortcut reference. Toggle with '?'.
 */

import { Container, Graphics, Text } from 'pixi.js';

const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const SHORTCUTS = [
  ['1–7', 'Select agent (ring order)'],
  ['8', 'Select Nexus'],
  ['Tab', 'Cycle selection'],
  ['Esc', 'Deselect / close'],
  ['H', 'Toggle Health dashboard'],
  ['M', 'Toggle Minimap'],
  ['D', 'Toggle Detail panel'],
  ['Home', 'Reset camera'],
  ['Scroll', 'Zoom in/out'],
  ['Drag', 'Pan camera'],
  ['?', 'This help screen']
];

export type HelpOverlay = {
  container: Container;
  setVisible: (v: boolean) => void;
  toggle: () => void;
  isVisible: () => boolean;
  setViewport: (w: number, h: number) => void;
};

export function createHelpOverlay(): HelpOverlay {
  const container = new Container();
  container.visible = false;
  container.zIndex = 200;

  let viewportW = 1920;
  let viewportH = 1080;

  const dimmer = new Graphics();
  container.addChild(dimmer);

  const panel = new Container();
  container.addChild(panel);

  const panelBg = new Graphics();
  panel.addChild(panelBg);

  const title = new Text({
    text: 'KEYBOARD SHORTCUTS',
    style: { fontSize: 14, fontWeight: 'bold', fill: 0xffd700, fontFamily: FONT }
  });
  title.position.set(20, 16);
  panel.addChild(title);

  const rows: { key: Text; desc: Text }[] = [];
  let yPos = 44;
  for (const [key, desc] of SHORTCUTS) {
    const keyText = new Text({
      text: key,
      style: { fontSize: 12, fontWeight: 'bold', fill: 0x00d4ff, fontFamily: `'SF Mono', 'Fira Code', monospace` }
    });
    keyText.position.set(24, yPos);
    panel.addChild(keyText);

    const descText = new Text({
      text: desc,
      style: { fontSize: 12, fill: 0xcccccc, fontFamily: FONT }
    });
    descText.position.set(110, yPos);
    panel.addChild(descText);

    rows.push({ key: keyText, desc: descText });
    yPos += 22;
  }

  const panelW = 340;
  const panelH = yPos + 16;

  function layout() {
    dimmer.clear();
    dimmer.rect(0, 0, viewportW, viewportH).fill({ color: 0x000000, alpha: 0.5 });

    dimmer.eventMode = 'static';
    dimmer.cursor = 'pointer';
    dimmer.removeAllListeners();
    dimmer.on('pointertap', () => setVisible(false));

    panelBg.clear();
    panelBg.roundRect(0, 0, panelW, panelH, 8)
      .fill({ color: 0x0a0a1a, alpha: 0.95 });
    panelBg.roundRect(0, 0, panelW, panelH, 8)
      .stroke({ width: 1, color: 0x00d4ff, alpha: 0.3 });

    panel.position.set(
      (viewportW - panelW) / 2,
      (viewportH - panelH) / 2
    );
  }

  function setVisible(v: boolean) {
    container.visible = v;
    if (v) layout();
  }

  function toggle() {
    setVisible(!container.visible);
  }

  function setViewport(w: number, h: number) {
    viewportW = w;
    viewportH = h;
    if (container.visible) layout();
  }

  layout();
  return { container, setVisible, toggle, isVisible: () => container.visible, setViewport };
}
