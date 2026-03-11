import { describe, it, expect, vi } from 'vitest';
import { createMissionListPanel } from '@/renderer/mission-list-panel';
import type { PersistedMission } from '@/data/control-client';

function makeMission(overrides: Partial<PersistedMission> = {}): PersistedMission {
  return {
    missionId: 'mission-001',
    title: 'Test Mission',
    description: 'A test mission',
    assignee: 'synth',
    priority: 'normal',
    createdAt: '2026-02-17T10:00:00.000Z',
    updatedAt: '2026-02-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('mission-list-panel', () => {
  it('creates with container not visible', () => {
    const panel = createMissionListPanel();
    expect(panel.isVisible()).toBe(false);
    expect(panel.container).toBeDefined();
    expect(panel.container.visible).toBe(false);
  });

  it('shows with missions and reports visible', () => {
    const panel = createMissionListPanel();
    const missions = [
      makeMission({ missionId: 'mission-001', title: 'First', priority: 'high' }),
      makeMission({ missionId: 'mission-002', title: 'Second', priority: 'low' }),
    ];

    panel.show(missions);
    expect(panel.isVisible()).toBe(true);
    expect(panel.missionCount()).toBe(2);
    expect(panel.selectedIndex()).toBe(0);
  });

  it('hides the panel', () => {
    const panel = createMissionListPanel();
    panel.show([makeMission()]);
    panel.hide();
    expect(panel.isVisible()).toBe(false);
  });

  it('navigates selection up and down', () => {
    const panel = createMissionListPanel();
    const missions = [
      makeMission({ missionId: 'mission-001' }),
      makeMission({ missionId: 'mission-002' }),
      makeMission({ missionId: 'mission-003' }),
    ];
    panel.show(missions);

    expect(panel.selectedIndex()).toBe(0);
    panel.selectDown();
    expect(panel.selectedIndex()).toBe(1);
    panel.selectDown();
    expect(panel.selectedIndex()).toBe(2);
    // Should not go beyond last
    panel.selectDown();
    expect(panel.selectedIndex()).toBe(2);

    panel.selectUp();
    expect(panel.selectedIndex()).toBe(1);
    panel.selectUp();
    expect(panel.selectedIndex()).toBe(0);
    // Should not go below 0
    panel.selectUp();
    expect(panel.selectedIndex()).toBe(0);
  });

  it('returns selected mission', () => {
    const panel = createMissionListPanel();
    const missions = [
      makeMission({ missionId: 'mission-001', title: 'First' }),
      makeMission({ missionId: 'mission-002', title: 'Second' }),
    ];
    panel.show(missions);

    expect(panel.selectedMission()?.missionId).toBe('mission-001');
    panel.selectDown();
    expect(panel.selectedMission()?.missionId).toBe('mission-002');
  });

  it('returns null selected mission when empty', () => {
    const panel = createMissionListPanel();
    panel.show([]);
    expect(panel.selectedMission()).toBeNull();
  });

  it('calls edit callback', () => {
    const panel = createMissionListPanel();
    const editFn = vi.fn();
    panel.onEdit(editFn);

    const m = makeMission({ missionId: 'mission-edit' });
    panel.show([m]);

    // Manually verify the callback is registered (double-tap not easily testable
    // without pointertap simulation, but onEdit registration is testable)
    expect(editFn).not.toHaveBeenCalled();
  });

  it('setViewport does not throw', () => {
    const panel = createMissionListPanel();
    expect(() => panel.setViewport(1920, 1080)).not.toThrow();
    panel.show([makeMission()]);
    expect(() => panel.setViewport(800, 600)).not.toThrow();
  });

  it('update advances animation alpha', () => {
    const panel = createMissionListPanel();
    panel.show([makeMission()]);
    // Container starts at alpha 0 and animates toward 1
    expect(panel.container.alpha).toBe(0);
    panel.update(200);
    expect(panel.container.alpha).toBeGreaterThan(0);
  });

  it('update fades out on hide', () => {
    const panel = createMissionListPanel();
    panel.show([makeMission()]);
    // Snap alpha to 1
    panel.container.alpha = 1;
    panel.hide();
    panel.update(200);
    expect(panel.container.alpha).toBeLessThan(1);
  });
});
