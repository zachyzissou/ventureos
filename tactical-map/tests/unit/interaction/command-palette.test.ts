import { describe, it, expect, vi } from 'vitest';
import { createCommandPalette } from '@/renderer/command-palette';
import type { PaletteCommand } from '@/interaction/types';

function makeCommands(): PaletteCommand[] {
  return [
    {
      id: 'view-venture_delivery',
      label: 'View Synth Details',
      category: 'agent',
      requiredRole: 'viewer',
      execute: vi.fn(),
      keywords: ['venture_delivery', 'inspect'],
    },
    {
      id: 'pause-venture_infrastructure',
      label: 'Pause Atlas',
      category: 'agent',
      requiredRole: 'operator',
      execute: vi.fn(),
      keywords: ['venture_infrastructure', 'stop'],
    },
    {
      id: 'spawn-mission',
      label: 'Spawn New Mission',
      shortcut: '⌘+M',
      category: 'mission',
      requiredRole: 'operator',
      execute: vi.fn(),
      keywords: ['create', 'new', 'task'],
    },
    {
      id: 'adjust-budget',
      label: 'Adjust Budget',
      category: 'system',
      requiredRole: 'admin',
      execute: vi.fn(),
      keywords: ['money', 'tokens'],
    },
  ];
}

describe('renderer/command-palette', () => {
  it('creates hidden', () => {
    const palette = createCommandPalette();
    expect(palette.isVisible()).toBe(false);
  });

  it('show makes it visible', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.show();
    expect(palette.isVisible()).toBe(true);
  });

  it('hide makes it invisible', () => {
    const palette = createCommandPalette();
    palette.show();
    palette.hide();
    expect(palette.isVisible()).toBe(false);
  });

  it('shows all commands when no query', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    expect(palette.resultCount()).toBe(4);
  });

  it('filters by role — viewer', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('viewer');
    palette.show();
    // Only 'view-venture_delivery' should be visible (requires viewer role)
    expect(palette.resultCount()).toBe(1);
  });

  it('filters by role — operator', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('operator');
    palette.show();
    // viewer + operator commands (3 of 4)
    expect(palette.resultCount()).toBe(3);
  });

  it('filters by search query', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    palette.setQuery('venture_delivery');
    expect(palette.resultCount()).toBeGreaterThanOrEqual(1);
  });

  it('no results for garbage query', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    palette.setQuery('zzzzzzz');
    expect(palette.resultCount()).toBe(0);
  });

  it('selectDown / selectUp navigation', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();

    expect(palette.selectedIndex()).toBe(0);
    palette.selectDown();
    expect(palette.selectedIndex()).toBe(1);
    palette.selectDown();
    expect(palette.selectedIndex()).toBe(2);
    palette.selectUp();
    expect(palette.selectedIndex()).toBe(1);
  });

  it('selectUp clamps at 0', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    palette.selectUp();
    expect(palette.selectedIndex()).toBe(0);
  });

  it('selectDown clamps at last item', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    for (let i = 0; i < 20; i++) palette.selectDown();
    expect(palette.selectedIndex()).toBe(3); // 4 items, 0-indexed
  });

  it('executeSelected calls command execute fn', () => {
    const cmds = makeCommands();
    const palette = createCommandPalette();
    palette.setCommands(cmds);
    palette.setUserRole('admin');
    palette.show();

    palette.executeSelected();
    expect(cmds[0].execute).toHaveBeenCalledOnce();
  });

  it('setQuery resets selectedIndex', () => {
    const palette = createCommandPalette();
    palette.setCommands(makeCommands());
    palette.setUserRole('admin');
    palette.show();
    palette.selectDown();
    palette.selectDown();
    expect(palette.selectedIndex()).toBe(2);

    palette.setQuery('mission');
    expect(palette.selectedIndex()).toBe(0);
  });

  it('getQuery returns current query', () => {
    const palette = createCommandPalette();
    palette.show();
    palette.setQuery('test');
    expect(palette.getQuery()).toBe('test');
  });

  it('update animates alpha', () => {
    const palette = createCommandPalette();
    palette.show();
    palette.update(100);
    expect(palette.container.alpha).toBeGreaterThan(0);
  });

  it('setViewport does not throw', () => {
    const palette = createCommandPalette();
    expect(() => palette.setViewport(1280, 720)).not.toThrow();
  });
});
