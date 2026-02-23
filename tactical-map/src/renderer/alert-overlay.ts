/**
 * Alert Overlay Renderer — Phase 5.6
 *
 * Full-screen P0 alert overlay and P1 alert banners.
 * Renders as a screen-space overlay (not in world space).
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { AlertSeverity, HealthAlert } from '@/health/types';

export type AlertOverlayLayer = {
  container: Container;
  setAlerts: (alerts: HealthAlert[]) => void;
  setViewport: (width: number, height: number) => void;
  update: (elapsedMs: number) => void;
  /** Test access. */
  getVisibleCount: () => number;
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const MAX_VISIBLE_ALERTS = 5;
const BANNER_HEIGHT = 36;
const BANNER_GAP = 4;
const BANNER_MARGIN_TOP = 48; // Below HUD bar
const BANNER_MARGIN_X = 16;
const P0_FLASH_HZ = 2.5;
const FADE_DURATION_MS = 500;

const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  P0: 0xff1744,
  P1: 0xff9100,
};

const SEVERITY_BG_ALPHA: Record<AlertSeverity, number> = {
  P0: 0.85,
  P1: 0.72,
};

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

type AlertBannerView = {
  container: Container;
  bg: Graphics;
  icon: Text;
  message: Text;
  severity: AlertSeverity;
  phase: number;
  fadeProgress: number; // 0 = invisible, 1 = fully visible
  fadeDirection: 'in' | 'out' | 'steady';
  alertId: string;
};

// ═══════════════════════════════════════════
// Layer factory
// ═══════════════════════════════════════════

export function createAlertOverlay(): AlertOverlayLayer {
  const container = new Container();
  const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

  // P0 full-screen flash overlay
  const p0Flash = new Graphics();
  p0Flash.alpha = 0;
  container.addChild(p0Flash);

  // Banner container
  const bannerContainer = new Container();
  container.addChild(bannerContainer);

  let viewportW = 1920;
  let viewportH = 1080;
  let bannerViews: AlertBannerView[] = [];
  let currentAlerts: HealthAlert[] = [];
  let hasP0 = false;
  let p0Phase = 0;

  function createBannerView(): AlertBannerView {
    const c = new Container();
    const bg = new Graphics();
    const icon = new Text({
      text: '⚠',
      style: { fontSize: 14, fill: 0xffffff, fontFamily },
    });
    icon.anchor.set(0, 0.5);

    const message = new Text({
      text: '',
      style: { fontSize: 12, fill: 0xffffff, fontFamily },
    });
    message.anchor.set(0, 0.5);

    c.addChild(bg, icon, message);
    bannerContainer.addChild(c);

    return {
      container: c,
      bg,
      icon,
      message,
      severity: 'P1',
      phase: 0,
      fadeProgress: 0,
      fadeDirection: 'in',
      alertId: '',
    };
  }

  function layoutBanners() {
    const bannerW = Math.min(500, viewportW - BANNER_MARGIN_X * 2);
    const x = viewportW - bannerW - BANNER_MARGIN_X;

    for (let i = 0; i < bannerViews.length; i++) {
      const view = bannerViews[i];
      const y = BANNER_MARGIN_TOP + i * (BANNER_HEIGHT + BANNER_GAP);

      view.container.position.set(x, y);

      const bgColor = SEVERITY_COLORS[view.severity];
      const bgAlpha = SEVERITY_BG_ALPHA[view.severity];

      view.bg.clear();
      view.bg
        .roundRect(0, 0, bannerW, BANNER_HEIGHT, 6)
        .fill({ color: bgColor, alpha: bgAlpha })
        .stroke({ width: 1, color: 0xffffff, alpha: 0.2 });

      view.icon.position.set(10, BANNER_HEIGHT / 2);
      view.message.position.set(30, BANNER_HEIGHT / 2);
      view.message.style.wordWrapWidth = bannerW - 44;
    }
  }

  function layoutP0Flash() {
    p0Flash.clear();
    p0Flash
      .rect(0, 0, viewportW, viewportH)
      .fill({ color: 0xff0000, alpha: 0.08 });
  }

  function setViewport(width: number, height: number) {
    viewportW = width;
    viewportH = height;
    layoutP0Flash();
    layoutBanners();
  }

  function setAlerts(alerts: HealthAlert[]) {
    // Filter to only active alerts, sorted by severity then time
    const active = alerts
      .filter((a) => a.state === 'active')
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'P0' ? -1 : 1;
        return b.createdAt - a.createdAt;
      })
      .slice(0, MAX_VISIBLE_ALERTS);

    currentAlerts = active;
    hasP0 = active.some((a) => a.severity === 'P0');

    // Match existing views or create new ones
    const activeIds = new Set(active.map((a) => a.id));

    // Mark views for fade-out if their alert is no longer active
    for (const view of bannerViews) {
      if (!activeIds.has(view.alertId)) {
        view.fadeDirection = 'out';
      }
    }

    // Add new banners for new alerts
    for (const alert of active) {
      const existing = bannerViews.find((v) => v.alertId === alert.id);
      if (existing) continue;

      const view = createBannerView();
      view.alertId = alert.id;
      view.severity = alert.severity;
      view.icon.text = alert.severity === 'P0' ? '🔴' : '🟡';
      view.message.text = alert.message;
      view.fadeDirection = 'in';
      view.fadeProgress = 0;
      bannerViews.push(view);
    }

    layoutBanners();
  }

  function update(elapsedMs: number) {
    const dt = elapsedMs / 1000;

    // P0 full-screen flash
    if (hasP0) {
      p0Phase += dt * P0_FLASH_HZ * Math.PI * 2;
      p0Flash.alpha = 0.03 + Math.abs(Math.sin(p0Phase)) * 0.06;
    } else {
      p0Flash.alpha = Math.max(0, p0Flash.alpha - dt * 2);
    }

    // Banner fade animations
    const toRemove: number[] = [];
    for (let i = 0; i < bannerViews.length; i++) {
      const view = bannerViews[i];

      if (view.fadeDirection === 'in') {
        view.fadeProgress = Math.min(1, view.fadeProgress + elapsedMs / FADE_DURATION_MS);
        if (view.fadeProgress >= 1) view.fadeDirection = 'steady';
      } else if (view.fadeDirection === 'out') {
        view.fadeProgress = Math.max(0, view.fadeProgress - elapsedMs / FADE_DURATION_MS);
        if (view.fadeProgress <= 0) toRemove.push(i);
      }

      view.container.alpha = view.fadeProgress;

      // P0 banner pulsing
      if (view.severity === 'P0' && view.fadeDirection !== 'out') {
        view.phase += dt * 4;
        view.bg.alpha = 0.7 + Math.sin(view.phase) * 0.3;
      }
    }

    // Remove fully faded banners
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const view = bannerViews[idx];
      bannerContainer.removeChild(view.container);
      bannerViews.splice(idx, 1);
    }

    if (toRemove.length > 0) layoutBanners();
  }

  // Initialize
  setViewport(viewportW, viewportH);

  return {
    container,
    setAlerts,
    setViewport,
    update,
    getVisibleCount: () => bannerViews.filter((v) => v.fadeProgress > 0).length,
  };
}
