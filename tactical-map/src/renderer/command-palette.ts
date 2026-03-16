/**
 * Command Palette Renderer — Phase 5.7
 *
 * Cmd+K searchable command palette. Opens as a centered overlay
 * with fuzzy-filtered list of available commands.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { PaletteCommand, UserRole } from '@/interaction/types';
import { fuzzySearchMulti } from '@/interaction/fuzzy-search';
import { hasRole } from '@/interaction/permissions';

export type CommandPaletteLayer = {
  container: Container;
  /** Open the palette. */
  show: () => void;
  /** Close the palette. */
  hide: () => void;
  /** Set available commands. */
  setCommands: (commands: PaletteCommand[]) => void;
  /** Set current user role (filters commands). */
  setUserRole: (role: UserRole) => void;
  /** Set the search query. */
  setQuery: (query: string) => void;
  /** Get current query. */
  getQuery: () => string;
  /** Navigate selection up. */
  selectUp: () => void;
  /** Navigate selection down. */
  selectDown: () => void;
  /** Execute selected command. */
  executeSelected: () => void;
  /** Set viewport for centering. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is shown? */
  isVisible: () => boolean;
  /** Current result count (for testing). */
  resultCount: () => number;
  /** Current selected index (for testing). */
  selectedIndex: () => number;
};

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════

const PALETTE_WIDTH = 480;
const ROW_HEIGHT = 34;
const MAX_VISIBLE_ROWS = 10;
const HEADER_HEIGHT = 48;
const CORNER_RADIUS = 10;
const ANIM_SPEED = 0.008;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const CATEGORY_ICONS: Record<string, string> = {
  agent: '🤖',
  mission: '⚔',
  system: '⚙',
  view: '👁',
};

export function createCommandPalette(): CommandPaletteLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 3000;

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let commands: PaletteCommand[] = [];
  let userRole: UserRole = 'operator';
  let query = '';
  let selectedIdx = 0;
  let filteredCommands: PaletteCommand[] = [];

  // Backdrop
  const backdrop = new Graphics();
  backdrop.eventMode = 'static';
  backdrop.on('pointertap', hide);
  container.addChild(backdrop);

  // Palette body
  const palette = new Container();
  container.addChild(palette);

  const bg = new Graphics();
  palette.addChild(bg);

  // Search input display
  const searchIcon = new Text({ text: '🔍', style: { fontSize: 16, fill: 0xffffff, fontFamily } });
  searchIcon.position.set(16, 14);
  palette.addChild(searchIcon);

  const searchText = new Text({
    text: '',
    style: { fontSize: 15, fill: 0xffffff, fontFamily },
  });
  searchText.position.set(44, 15);
  palette.addChild(searchText);

  // Shortcut hint
  const hintText = new Text({
    text: 'ESC to close',
    style: { fontSize: 11, fill: 0x666688, fontFamily },
  });
  palette.addChild(hintText);

  // Result rows
  const rows: { container: Container; bg: Graphics; icon: Text; label: Text; shortcut: Text; category: Text }[] = [];
  for (let i = 0; i < MAX_VISIBLE_ROWS; i++) {
    const row = new Container();
    const rowBg = new Graphics();
    const rowIcon = new Text({ text: '', style: { fontSize: 14, fill: 0xffffff, fontFamily } });
    rowIcon.position.set(16, 8);
    const rowLabel = new Text({ text: '', style: { fontSize: 13, fill: 0xffffff, fontFamily } });
    rowLabel.position.set(40, 9);
    const rowShortcut = new Text({ text: '', style: { fontSize: 11, fill: 0x666688, fontFamily } });
    const rowCategory = new Text({ text: '', style: { fontSize: 10, fill: 0x555577, fontFamily } });

    row.addChild(rowBg, rowIcon, rowLabel, rowShortcut, rowCategory);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    const idx = i;
    row.on('pointertap', () => {
      selectedIdx = idx;
      executeSelected();
    });
    row.on('pointerover', () => {
      selectedIdx = idx;
      renderRows();
    });

    palette.addChild(row);
    rows.push({ container: row, bg: rowBg, icon: rowIcon, label: rowLabel, shortcut: rowShortcut, category: rowCategory });
  }

  // No results text
  const noResultsText = new Text({
    text: 'No commands found',
    style: { fontSize: 13, fill: 0x666688, fontFamily },
  });
  noResultsText.position.set(PALETTE_WIDTH / 2, HEADER_HEIGHT + 20);
  noResultsText.anchor.set(0.5, 0);
  noResultsText.visible = false;
  palette.addChild(noResultsText);

  function filterCommands() {
    // Filter by role
    const roleFiltered = commands.filter((c) => hasRole(userRole, c.requiredRole));

    if (!query.trim()) {
      filteredCommands = roleFiltered;
    } else {
      const results = fuzzySearchMulti(
        query,
        roleFiltered,
        (c) => [c.label, ...(c.keywords ?? []), c.category],
        { maxResults: MAX_VISIBLE_ROWS },
      );
      filteredCommands = results.map((r) => r.item);
    }

    selectedIdx = Math.min(selectedIdx, Math.max(0, filteredCommands.length - 1));
  }

  function renderRows() {
    const visibleCount = Math.min(filteredCommands.length, MAX_VISIBLE_ROWS);
    noResultsText.visible = filteredCommands.length === 0 && query.trim().length > 0;

    for (let i = 0; i < MAX_VISIBLE_ROWS; i++) {
      const row = rows[i];
      if (i >= visibleCount) {
        row.container.visible = false;
        continue;
      }

      row.container.visible = true;
      const cmd = filteredCommands[i];
      const isSelected = i === selectedIdx;

      row.container.position.set(0, HEADER_HEIGHT + i * ROW_HEIGHT);
      row.bg.clear();
      row.bg.rect(0, 0, PALETTE_WIDTH, ROW_HEIGHT)
        .fill({ color: isSelected ? 0x1a1a44 : 0x000000, alpha: isSelected ? 0.9 : 0.01 });

      row.icon.text = CATEGORY_ICONS[cmd.category] ?? '•';
      row.label.text = cmd.label;
      row.label.style.fill = isSelected ? 0xffffff : 0xcccccc;

      row.shortcut.text = cmd.shortcut ?? '';
      row.shortcut.position.set(PALETTE_WIDTH - 16, 10);
      row.shortcut.anchor.set(1, 0);

      row.category.text = cmd.category;
      row.category.position.set(PALETTE_WIDTH - 16 - (cmd.shortcut?.length ?? 0) * 7 - 8, 10);
      row.category.anchor.set(1, 0);
    }
  }

  function drawPalette() {
    const visibleCount = Math.min(filteredCommands.length, MAX_VISIBLE_ROWS);
    const height = HEADER_HEIGHT + Math.max(1, visibleCount) * ROW_HEIGHT + 8;

    bg.clear();
    bg.roundRect(0, 0, PALETTE_WIDTH, height, CORNER_RADIUS)
      .fill({ color: 0x0a0a1e, alpha: 0.96 });
    bg.roundRect(0, 0, PALETTE_WIDTH, height, CORNER_RADIUS)
      .stroke({ width: 1, color: 0x333366, alpha: 0.6 });

    // Search area separator
    bg.moveTo(0, HEADER_HEIGHT).lineTo(PALETTE_WIDTH, HEADER_HEIGHT)
      .stroke({ width: 1, color: 0x222244, alpha: 0.5 });

    hintText.position.set(PALETTE_WIDTH - 16, 18);
    hintText.anchor.set(1, 0);
  }

  function refresh() {
    filterCommands();
    drawPalette();
    renderRows();
    searchText.text = query || 'Type a command…';
    searchText.style.fill = query ? 0xffffff : 0x666688;
  }

  function layoutCenter() {
    backdrop.clear();
    backdrop.rect(0, 0, vpWidth, vpHeight).fill({ color: 0x000000, alpha: 0.4 });
    backdrop.hitArea = { contains: () => true };

    palette.position.set(
      (vpWidth - PALETTE_WIDTH) / 2,
      Math.max(80, vpHeight * 0.2),
    );
  }

  function show() {
    visible = true;
    targetAlpha = 1;
    container.visible = true;
    query = '';
    selectedIdx = 0;
    refresh();
    layoutCenter();
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
  }

  function setCommands(cmds: PaletteCommand[]) {
    commands = cmds;
    if (visible) refresh();
  }

  function setUserRole(role: UserRole) {
    userRole = role;
    if (visible) refresh();
  }

  function setQuery(q: string) {
    query = q;
    selectedIdx = 0;
    if (visible) refresh();
  }

  function selectUp() {
    selectedIdx = Math.max(0, selectedIdx - 1);
    renderRows();
  }

  function selectDown() {
    selectedIdx = Math.min(filteredCommands.length - 1, selectedIdx + 1);
    renderRows();
  }

  function executeSelected() {
    if (selectedIdx >= 0 && selectedIdx < filteredCommands.length) {
      const cmd = filteredCommands[selectedIdx];
      hide();
      cmd.execute();
    }
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

  return {
    container,
    show,
    hide,
    setCommands,
    setUserRole,
    setQuery,
    getQuery: () => query,
    selectUp,
    selectDown,
    executeSelected,
    setViewport,
    update,
    isVisible: () => visible,
    resultCount: () => filteredCommands.length,
    selectedIndex: () => selectedIdx,
  };
}
