import { Container, Graphics, Text } from 'pixi.js';
import { API, COLORS } from '@/config';
import type { RpgStats } from '@/state/types';
import { sanitizePlainText } from '@/utils/sanitize';

export type Hud = {
  container: Container;
  setSize: (w: number, h: number) => void;
  setKpiText: (text: string) => void;
  update: (elapsedMs: number) => void;
};

function formatKpis(stats: RpgStats): string {
  // Order loosely matches the spec example; tolerate arbitrary keys.
  const preferred = ['Oracle WIS', 'Atlas SPD', 'Sentinel TRU', 'Verifier LOG', 'Archivist MEM', 'Synth CRE', 'Echo CHA', 'Nexus POW'];
  const parts: string[] = [];

  const lower = new Map<string, number>();
  for (const [k, v] of Object.entries(stats)) lower.set(k.toLowerCase(), v);

  for (const k of preferred) {
    const v = lower.get(k.toLowerCase());
    if (typeof v === 'number') parts.push(`${k}: ${v}`);
  }

  // Append any other stats not in preferred list.
  for (const [k, v] of Object.entries(stats)) {
    if (!preferred.some((p) => p.toLowerCase() === k.toLowerCase())) parts.push(`${k}: ${v}`);
  }

  return parts.length ? parts.join(' | ') : 'Loading KPIs…';
}

export function createHud(): Hud {
  const container = new Container();

  const bg = new Graphics();
  container.addChild(bg);

  const tabs = new Container();
  container.addChild(tabs);

  const tabNames = ['Tactical Map', 'Conversations', 'Pylon Network', 'KPIs'];
  const tabTexts: Text[] = [];
  for (const name of tabNames) {
    const t = new Text({
      text: name,
      style: {
        fontSize: 14,
        fill: name === 'Tactical Map' ? COLORS.PROTOSS_GOLD : 0xffffff,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      }
    });
    t.alpha = name === 'Tactical Map' ? 1 : 0.75;
    tabTexts.push(t);
    tabs.addChild(t);
  }

  const tickerContainer = new Container();
  container.addChild(tickerContainer);

  const tickerBg = new Graphics();
  tickerContainer.addChild(tickerBg);

  // Keep ticker text constrained to the strip bounds.
  const tickerViewport = new Container();
  tickerContainer.addChild(tickerViewport);
  const tickerMask = new Graphics();
  tickerContainer.addChild(tickerMask);
  tickerViewport.mask = tickerMask;

  const tickerText = new Text({
    text: 'Loading KPIs…',
    style: {
      fontSize: 14,
      fill: COLORS.PROTOSS_BLUE,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
    }
  });
  tickerText.anchor.set(0, 0.5);
  tickerViewport.addChild(tickerText);

  let width = 1920;
  let height = 1080;
  const barH = 44;
  const pad = 14;

  // ticker scroll state
  let scrollX = 0;
  let tickerW = 520;

  function setSize(w: number, h: number) {
    width = w;
    height = h;

    bg.clear();
    bg.rect(0, 0, width, barH).fill({ color: COLORS.HUD_BG, alpha: COLORS.HUD_BG_ALPHA });

    // Tabs layout
    let x = pad;
    for (const t of tabTexts) {
      t.position.set(x, (barH - t.height) / 2);
      x += t.width + 18;
    }

    // KPI ticker layout
    tickerW = Math.min(720, Math.max(380, Math.floor(width * 0.42)));
    tickerContainer.position.set(width - pad - tickerW, 0);
    tickerBg.clear();
    tickerBg.rect(0, 0, tickerW, barH).fill({ color: 0x000000, alpha: 0.66 });
    tickerMask.clear();
    tickerMask.rect(0, 0, tickerW, barH).fill({ color: 0xffffff, alpha: 1 });

    tickerText.position.set(12, barH / 2);
    scrollX = tickerW; // reset scroll
  }

  function setKpiText(text: string) {
    // SECURITY (P0-3): sanitize DB/API sourced strings before rendering.
    tickerText.text = sanitizePlainText(text, 800);
    scrollX = tickerW;
  }

  function update(elapsedMs: number) {
    // Move text left; wrap.
    const pxPerSec = 65;
    scrollX -= (elapsedMs / 1000) * pxPerSec;

    const textW = tickerText.width;
    const startX = 12;

    tickerText.x = startX + scrollX;

    if (tickerText.x + textW < 0) {
      scrollX = tickerW;
    }
  }

  // initialize
  setSize(width, height);

  return { container, setSize, setKpiText, update };
}

export async function pollKpis(fetcher: () => Promise<RpgStats>, onText: (t: string) => void) {
  async function runOnce() {
    try {
      const stats = await fetcher();
      onText(formatKpis(stats));
    } catch {
      // Keep last known string; on cold start show fallback.
      onText('KPIs unavailable (retrying)…');
    }
  }

  await runOnce();
  window.setInterval(runOnce, API.KPI_POLL_INTERVAL);
}
