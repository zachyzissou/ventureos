import { Container, Graphics } from 'pixi.js';
import { CAPACITY, HEALTH_BARS } from '@/config';
import type { AgentId, Point } from '@/config';
import type { BuildingState } from '@/state/types';
import { clamp01, lerpColor } from '@/utils/color';

export type HealthBarsLayer = {
  container: Container;
  setAgent: (agentId: AgentId, pos: Point, state: BuildingState, sessions?: number) => void;
  update: (elapsedMs: number) => void;
};

type BarView = {
  bg: Graphics;
  fill: Graphics;
  lastRatio: number;
  lastState: BuildingState;
  state: BuildingState;
  sessions: number;
  max: number;
};

// Spec gradient: green → yellow → orange → red.
const C_GREEN = 0x33ff88;
const C_YELLOW = 0xf6c445;
const C_ORANGE = 0xff6633;
const C_RED = 0xff3333;
const C_ERROR = 0x666666;

export function healthColor(ratio: number, state: BuildingState): number {
  if (state === 'ERROR') return C_ERROR;
  const r = clamp01(ratio);
  if (r < 0.5) return lerpColor(C_GREEN, C_YELLOW, r / 0.5);
  if (r < 0.8) return lerpColor(C_YELLOW, C_ORANGE, (r - 0.5) / 0.3);
  return lerpColor(C_ORANGE, C_RED, (r - 0.8) / 0.2);
}

export function createHealthBarsLayer(agentIds: AgentId[]): HealthBarsLayer {
  const container = new Container();
  const bars = new Map<AgentId, BarView>();

  for (const id of agentIds) {
    const bg = new Graphics();
    const fill = new Graphics();
    container.addChild(bg, fill);

    bars.set(id, {
      bg,
      fill,
      lastRatio: -1,
      lastState: 'IDLE',
      state: 'IDLE',
      sessions: 0,
      max: CAPACITY.MAX_SESSIONS[id] ?? 1
    });
  }

  let t = 0;

  function redraw(bar: BarView, ratio: number) {
    const w = HEALTH_BARS.WIDTH;
    const h = HEALTH_BARS.HEIGHT;

    const rr = clamp01(ratio);
    const color = healthColor(rr, bar.state);

    bar.bg.clear();
    bar.bg
      .roundRect(-w / 2, HEALTH_BARS.OFFSET_Y, w, h, 2)
      .fill({ color: 0x000000, alpha: 0.55 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.10 });

    // Flash when at/over 100%.
    const flash = rr >= 1 ? 0.65 + Math.sin(t * 12) * 0.25 : 0.9;

    bar.fill.clear();
    bar.fill
      .roundRect(-w / 2 + 1, HEALTH_BARS.OFFSET_Y + 1, (w - 2) * rr, h - 2, 2)
      .fill({ color, alpha: flash });
  }

  function setAgent(agentId: AgentId, pos: Point, state: BuildingState, sessions?: number) {
    const bar = bars.get(agentId);
    if (!bar) return;

    bar.bg.position.set(pos.x, pos.y);
    bar.fill.position.set(pos.x, pos.y);

    bar.state = state;
    bar.sessions = Math.max(0, sessions ?? 0);

    const ratio = bar.sessions / bar.max;

    // Redraw if ratio or state changes.
    if (Math.abs(ratio - bar.lastRatio) > 0.001 || bar.lastState !== bar.state) {
      bar.lastRatio = ratio;
      bar.lastState = bar.state;
      redraw(bar, ratio);
    } else {
      // still redraw if flash is needed
      if (ratio >= 1) redraw(bar, ratio);
    }
  }

  function update(elapsedMs: number) {
    t += elapsedMs / 1000;
    // Redraw flashing bars.
    for (const bar of bars.values()) {
      const ratio = bar.sessions / bar.max;
      if (ratio >= 1) redraw(bar, ratio);
    }
  }

  return { container, setAgent, update };
}
