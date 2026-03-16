import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { AGENTS, COLORS } from '@/config';
import { hexagonPoints, toPixiPolygon } from '@/renderer/primitives';

export type NexusView = {
  container: Container;
  /** call per-frame with elapsed ms */
  update: (elapsedMs: number) => void;
  setStateColor: (color: number) => void;
};

export function createNexus(): NexusView {
  const container = new Container();

  const size = AGENTS.BUILDING_SIZE;
  const r = size * 0.5;

  const outerPts = toPixiPolygon(hexagonPoints(r));
  const midPts = toPixiPolygon(hexagonPoints(r * 0.72));
  const innerPts = toPixiPolygon(hexagonPoints(r * 0.42));

  const glow = new Graphics();
  glow.poly(outerPts, true).fill({ color: COLORS.COMMAND_GOLD, alpha: 0.20 });
  glow.filters = [new BlurFilter({ strength: 14 })];
  glow.scale.set(1.18);

  const shell = new Graphics();
  shell.poly(outerPts, true).fill({ color: 0x1b1a12, alpha: 0.85 });
  shell.poly(outerPts, true).stroke({ width: 2, color: COLORS.COMMAND_GOLD, alpha: 0.85 });

  const mid = new Graphics();
  mid.poly(midPts, true).fill({ color: 0x2a2410, alpha: 0.85 });
  mid.poly(midPts, true).stroke({ width: 1, color: 0xffffff, alpha: 0.08 });

  const core = new Graphics();
  core.poly(innerPts, true).fill({ color: COLORS.COMMAND_GOLD, alpha: 0.9 });
  core.filters = [new BlurFilter({ strength: 2 })];

  const coreGlow = new Graphics();
  coreGlow.circle(0, 0, r * 0.55).fill({ color: COLORS.COMMAND_GOLD, alpha: 0.08 });
  coreGlow.filters = [new BlurFilter({ strength: 18 })];

  const label = new Text({
    text: 'NEXUS',
    style: {
      fontSize: 14,
      fill: 0xffffff,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      letterSpacing: 2
    }
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, r + 10);
  label.alpha = 0.95;

  container.addChild(glow, shell, mid, coreGlow, core, label);

  let t = 0;
  function update(elapsedMs: number) {
    // Gentle 2s loop: 0.98 → 1.02
    t += elapsedMs / 1000;
    const phase = (t % 2) / 2;
    const s = 0.98 + Math.sin(phase * Math.PI * 2) * 0.02;
    core.scale.set(s);
  }

  function setStateColor(color: number) {
    core.clear();
    core.poly(innerPts, true).fill({ color, alpha: 0.9 });
  }

  return { container, update, setStateColor };
}
