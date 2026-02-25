import { BlurFilter, Container, Graphics } from 'pixi.js';
import { CANVAS, COLORS } from '@/config';

export type Terrain = {
  container: Container;
  /** Main hit area graphics used for camera interactions. */
  hit: Graphics;
};

function drawHexGrid(g: Graphics, width: number, height: number, size = 56) {
  // Low-opacity hex grid. Flat-top hexes.
  const w = size * 2;
  const h = Math.sqrt(3) * size;
  const horiz = (3 / 2) * size;

  const cols = Math.ceil(width / horiz) + 2;
  const rows = Math.ceil(height / h) + 2;

  g.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const x = col * horiz;
      const y = row * h + (col % 2 ? h / 2 : 0);
      const cx = x - width / 2;
      const cy = y - height / 2;

      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        pts.push(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      }
      g.poly(pts, true);
    }
  }
}

function crystalCluster(x: number, y: number, seed: number) {
  const c = new Container();
  c.position.set(x, y);

  const base = new Graphics();
  base.circle(0, 0, 26).fill({ color: 0x0b1020, alpha: 0.55 });
  base.filters = [new BlurFilter({ strength: 2 })];
  c.addChild(base);

  const spikes = new Graphics();
  const colors = [COLORS.PROTOSS_BLUE, COLORS.PROTOSS_GOLD];

  for (let i = 0; i < 7; i++) {
    const angle = ((i * 2 + (seed % 3)) / 7) * Math.PI * 2;
    const r1 = 10 + ((seed + i * 13) % 7);
    const r2 = 28 + ((seed + i * 7) % 9);
    const w = 8 + ((seed + i * 3) % 5);

    const tipX = Math.cos(angle) * r2;
    const tipY = Math.sin(angle) * r2;
    const leftX = Math.cos(angle - 0.22) * r1;
    const leftY = Math.sin(angle - 0.22) * r1;
    const rightX = Math.cos(angle + 0.22) * r1;
    const rightY = Math.sin(angle + 0.22) * r1;

    const col = colors[(seed + i) % colors.length];
    spikes
      .poly([leftX, leftY, tipX, tipY, rightX, rightY], true)
      .fill({ color: col, alpha: 0.35 });

    // small inner highlight
    spikes
      .poly([leftX * 0.65, leftY * 0.65, tipX * 0.72, tipY * 0.72, rightX * 0.65, rightY * 0.65], true)
      .fill({ color: 0xffffff, alpha: 0.08 });

    // slight thickness shadow
    spikes
      .rect(leftX - w / 2, leftY - w / 2, w, w)
      .fill({ color: 0x000000, alpha: 0.05 });
  }

  spikes.filters = [new BlurFilter({ strength: 1.5 })];
  c.addChild(spikes);

  const glow = new Graphics();
  glow.circle(0, 0, 42).fill({ color: COLORS.PROTOSS_BLUE, alpha: 0.08 });
  glow.filters = [new BlurFilter({ strength: 8 })];
  c.addChild(glow);

  return c;
}

export function createTerrain(): Terrain {
  const container = new Container();

  // Background + hit area
  const hit = new Graphics();
  hit.rect(-CANVAS.WIDTH, -CANVAS.HEIGHT, CANVAS.WIDTH * 2, CANVAS.HEIGHT * 2).fill({
    color: CANVAS.BG_COLOR,
    alpha: 1
  });
  container.addChild(hit);

  // Subtle vignette / ambient wash
  const vignette = new Graphics();
  vignette.circle(0, 0, 580).fill({ color: 0x0b1426, alpha: 0.25 });
  vignette.filters = [new BlurFilter({ strength: 32 })];
  container.addChild(vignette);

  // Hex grid overlay
  const grid = new Graphics();
  drawHexGrid(grid, CANVAS.WIDTH * 2, CANVAS.HEIGHT * 2);
  container.addChild(grid);

  // Center pylon glow
  const coreGlow = new Graphics();
  coreGlow.circle(0, 0, 220).fill({ color: COLORS.PROTOSS_GOLD, alpha: 0.05 });
  coreGlow.filters = [new BlurFilter({ strength: 28 })];
  container.addChild(coreGlow);

  // Crystal clusters
  const clusters = [
    crystalCluster(-720, -220, 11),
    crystalCluster(720, -260, 29),
    crystalCluster(-560, 420, 41),
    crystalCluster(680, 410, 57),
    crystalCluster(0, -540, 73)
  ];
  for (const cl of clusters) container.addChild(cl);

  // Interaction surface
  hit.eventMode = 'static';
  hit.cursor = 'grab';

  return { container, hit };
}
