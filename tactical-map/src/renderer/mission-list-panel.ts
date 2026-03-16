/**
 * Mission List Panel — Phase 5.7 (Issue #135)
 *
 * Compact overlay listing existing persisted missions.
 * Allows selecting a mission to open the edit modal.
 * Supports keyboard navigation (↑/↓, Enter to edit, Esc to close).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_COLORS } from '@/config';
import type { PersistedMission } from '@/data/control-client';
import type { MissionPriority } from '@/interaction/types';

export type MissionListPanelLayer = {
  container: Container;
  /** Show the panel and populate with missions. */
  show: (missions: PersistedMission[]) => void;
  /** Hide the panel. */
  hide: () => void;
  /** Set viewport for positioning. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is shown? */
  isVisible: () => boolean;
  /** Navigate selection up. */
  selectUp: () => void;
  /** Navigate selection down. */
  selectDown: () => void;
  /** Get selected mission index. */
  selectedIndex: () => number;
  /** Get selected mission (or null). */
  selectedMission: () => PersistedMission | null;
  /** Set callback for when a mission is selected (double-click or Enter). */
  onEdit: (callback: (mission: PersistedMission) => void) => void;
  /** Current mission count. */
  missionCount: () => number;
};

const PANEL_WIDTH = 420;
const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 8;
const HEADER_HEIGHT = 44;
const CORNER_RADIUS = 10;
const ANIM_SPEED = 0.007;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const PRIORITY_COLORS: Record<MissionPriority, number> = {
  low: 0x4aa0ff,
  normal: 0x39e58c,
  high: 0xffc247,
  critical: 0xff3b3b,
};

const PRIORITY_LABELS: Record<MissionPriority, string> = {
  low: 'LOW',
  normal: 'NORM',
  high: 'HIGH',
  critical: 'CRIT',
};

export function createMissionListPanel(): MissionListPanelLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 2500;

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let missions: PersistedMission[] = [];
  let selectedIdx = 0;
  let editCallback: ((mission: PersistedMission) => void) | null = null;

  // Backdrop
  const backdrop = new Graphics();
  backdrop.eventMode = 'static';
  backdrop.cursor = 'default';
  backdrop.on('pointertap', hide);
  container.addChild(backdrop);

  // Panel body
  const panel = new Container();
  container.addChild(panel);

  const bg = new Graphics();
  panel.addChild(bg);

  // Title
  const titleText = new Text({
    text: '📋 MISSION DIRECTIVES',
    style: { fontSize: 14, fontWeight: 'bold', fill: 0xffd700, fontFamily },
  });
  titleText.position.set(16, 14);
  panel.addChild(titleText);

  // Hint
  const hintText = new Text({
    text: '↑↓ Navigate · Enter Edit · Esc Close',
    style: { fontSize: 10, fill: 0x666688, fontFamily },
  });
  panel.addChild(hintText);

  // Close button
  const closeBtn = new Container();
  closeBtn.eventMode = 'static';
  closeBtn.cursor = 'pointer';
  const closeTxt = new Text({ text: '✕', style: { fontSize: 16, fill: 0xffffff, fontFamily } });
  closeTxt.anchor.set(0.5, 0.5);
  closeBtn.addChild(closeTxt);
  closeBtn.on('pointertap', hide);
  panel.addChild(closeBtn);

  // Empty state
  const emptyText = new Text({
    text: 'No missions yet. Spawn one with ⌘+M',
    style: { fontSize: 12, fill: 0x666688, fontFamily },
  });
  emptyText.anchor.set(0.5, 0);
  emptyText.visible = false;
  panel.addChild(emptyText);

  // Rows
  const rows: {
    container: Container;
    bg: Graphics;
    priorityBadge: Graphics;
    priorityText: Text;
    titleLabel: Text;
    assigneeLabel: Text;
    dateLabel: Text;
  }[] = [];

  for (let i = 0; i < MAX_VISIBLE_ROWS; i++) {
    const row = new Container();
    const rowBg = new Graphics();
    const priorityBadge = new Graphics();
    const priorityText = new Text({ text: '', style: { fontSize: 9, fontWeight: 'bold', fill: 0xffffff, fontFamily } });
    priorityText.anchor.set(0.5, 0.5);
    const titleLabel = new Text({ text: '', style: { fontSize: 12, fill: 0xffffff, fontFamily } });
    const assigneeLabel = new Text({ text: '', style: { fontSize: 10, fill: 0x888899, fontFamily } });
    const dateLabel = new Text({ text: '', style: { fontSize: 10, fill: 0x555566, fontFamily } });

    row.addChild(rowBg, priorityBadge, priorityText, titleLabel, assigneeLabel, dateLabel);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    const idx = i;
    row.on('pointertap', () => {
      if (selectedIdx === idx && editCallback && missions[idx]) {
        editCallback(missions[idx]);
      } else {
        selectedIdx = idx;
        renderRows();
      }
    });
    row.on('pointerover', () => {
      selectedIdx = idx;
      renderRows();
    });
    panel.addChild(row);
    rows.push({ container: row, bg: rowBg, priorityBadge, priorityText, titleLabel, assigneeLabel, dateLabel });
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function renderRows() {
    const visibleCount = Math.min(missions.length, MAX_VISIBLE_ROWS);
    emptyText.visible = missions.length === 0;

    for (let i = 0; i < MAX_VISIBLE_ROWS; i++) {
      const row = rows[i];
      if (i >= visibleCount) {
        row.container.visible = false;
        continue;
      }

      row.container.visible = true;
      const m = missions[i];
      const isSelected = i === selectedIdx;

      row.container.position.set(0, HEADER_HEIGHT + i * ROW_HEIGHT);

      // Row background
      row.bg.clear();
      row.bg.rect(0, 0, PANEL_WIDTH, ROW_HEIGHT)
        .fill({ color: isSelected ? 0x1a1a44 : 0x000000, alpha: isSelected ? 0.9 : 0.01 });
      if (isSelected) {
        row.bg.rect(0, 0, 3, ROW_HEIGHT)
          .fill({ color: 0xffd700, alpha: 0.8 });
      }

      // Priority badge
      const badgeW = 36;
      const badgeH = 16;
      row.priorityBadge.clear();
      row.priorityBadge.roundRect(0, 0, badgeW, badgeH, 3)
        .fill({ color: PRIORITY_COLORS[m.priority] ?? 0x666688, alpha: 0.85 });
      row.priorityBadge.position.set(12, (ROW_HEIGHT - badgeH) / 2);
      row.priorityText.text = PRIORITY_LABELS[m.priority] ?? m.priority.toUpperCase();
      row.priorityText.position.set(12 + badgeW / 2, ROW_HEIGHT / 2);

      // Title
      const maxTitleLen = 32;
      const titleStr = m.title.length > maxTitleLen ? m.title.slice(0, maxTitleLen - 1) + '…' : m.title;
      row.titleLabel.text = titleStr;
      row.titleLabel.style.fill = isSelected ? 0xffffff : 0xcccccc;
      row.titleLabel.position.set(56, 6);

      // Assignee
      row.assigneeLabel.text = m.assignee.toUpperCase();
      row.assigneeLabel.style.fill = AGENT_COLORS[m.assignee] ?? 0x888899;
      row.assigneeLabel.position.set(56, 24);

      // Date
      row.dateLabel.text = formatDate(m.updatedAt);
      row.dateLabel.position.set(PANEL_WIDTH - 16, 14);
      row.dateLabel.anchor.set(1, 0);
    }
  }

  function drawPanel() {
    const visibleCount = Math.min(missions.length, MAX_VISIBLE_ROWS);
    const height = HEADER_HEIGHT + Math.max(1, visibleCount) * ROW_HEIGHT + 8;

    bg.clear();
    bg.roundRect(0, 0, PANEL_WIDTH, height, CORNER_RADIUS)
      .fill({ color: 0x0a0a1e, alpha: 0.96 });
    bg.roundRect(0, 0, PANEL_WIDTH, height, CORNER_RADIUS)
      .stroke({ width: 1.5, color: 0xffd700, alpha: 0.4 });
    // Gold accent bar
    bg.roundRect(0, 0, PANEL_WIDTH, 3, CORNER_RADIUS)
      .fill({ color: 0xffd700, alpha: 0.7 });
    // Header separator
    bg.moveTo(0, HEADER_HEIGHT).lineTo(PANEL_WIDTH, HEADER_HEIGHT)
      .stroke({ width: 1, color: 0x222244, alpha: 0.5 });

    hintText.position.set(PANEL_WIDTH - 16, 16);
    hintText.anchor.set(1, 0);

    closeBtn.position.set(PANEL_WIDTH - 24, 6);

    emptyText.position.set(PANEL_WIDTH / 2, HEADER_HEIGHT + 20);
  }

  function layoutCenter() {
    backdrop.clear();
    backdrop.rect(0, 0, vpWidth, vpHeight).fill({ color: 0x000000, alpha: 0.45 });
    backdrop.hitArea = { contains: () => true };

    panel.position.set(
      (vpWidth - PANEL_WIDTH) / 2,
      Math.max(80, vpHeight * 0.15),
    );
  }

  function show(missionData: PersistedMission[]) {
    missions = [...missionData];
    selectedIdx = 0;
    visible = true;
    targetAlpha = 1;
    container.visible = true;

    drawPanel();
    renderRows();
    layoutCenter();
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
  }

  function setViewport(width: number, height: number) {
    vpWidth = width;
    vpHeight = height;
    if (visible) layoutCenter();
  }

  function update(elapsedMs: number) {
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) container.visible = false;
    }
  }

  function selectUp() {
    selectedIdx = Math.max(0, selectedIdx - 1);
    renderRows();
  }

  function selectDown() {
    selectedIdx = Math.min(missions.length - 1, selectedIdx + 1);
    renderRows();
  }

  return {
    container,
    show,
    hide,
    setViewport,
    update,
    isVisible: () => visible,
    selectUp,
    selectDown,
    selectedIndex: () => selectedIdx,
    selectedMission: () => (selectedIdx >= 0 && selectedIdx < missions.length ? missions[selectedIdx] : null),
    onEdit: (cb) => { editCallback = cb; },
    missionCount: () => missions.length,
  };
}
