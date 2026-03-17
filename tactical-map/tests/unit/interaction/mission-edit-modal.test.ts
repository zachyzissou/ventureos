import { describe, it, expect, vi } from 'vitest';
import { createMissionEditModal } from '@/renderer/mission-edit-modal';
import type { PersistedMission } from '@/data/control-client';

function makeMission(overrides: Partial<PersistedMission> = {}): PersistedMission {
  return {
    missionId: 'mission-001',
    title: 'Test Mission',
    description: 'A test mission',
    assignee: 'venture_delivery',
    priority: 'normal',
    createdAt: '2026-02-17T10:00:00.000Z',
    updatedAt: '2026-02-17T10:00:00.000Z',
    ...overrides,
  };
}

describe('mission-edit-modal', () => {
  it('creates with container not visible', () => {
    const modal = createMissionEditModal();
    expect(modal.isVisible()).toBe(false);
    expect(modal.container).toBeDefined();
    expect(modal.container.visible).toBe(false);
    expect(modal.editingMissionId()).toBeNull();
  });

  it('shows pre-populated with mission data', () => {
    const modal = createMissionEditModal();
    const m = makeMission({
      missionId: 'mission-edit-1',
      title: 'Edit Me',
      description: 'Some description',
      assignee: 'venture_research',
      priority: 'high',
      tokenBudget: 50000,
    });

    modal.show(m);
    expect(modal.isVisible()).toBe(true);
    expect(modal.editingMissionId()).toBe('mission-edit-1');

    const form = modal.getFormState();
    expect(form.title).toBe('Edit Me');
    expect(form.description).toBe('Some description');
    expect(form.assignee).toBe('venture_research');
    expect(form.priority).toBe('high');
    expect(form.tokenBudget).toBe('50000');
  });

  it('handles mission without tokenBudget', () => {
    const modal = createMissionEditModal();
    modal.show(makeMission({ tokenBudget: undefined }));

    const form = modal.getFormState();
    expect(form.tokenBudget).toBe('');
  });

  it('hides the modal', () => {
    const modal = createMissionEditModal();
    modal.show(makeMission());
    modal.hide();
    expect(modal.isVisible()).toBe(false);
  });

  it('setField updates form state', () => {
    const modal = createMissionEditModal();
    modal.show(makeMission());

    modal.setField('title', 'Updated Title');
    expect(modal.getFormState().title).toBe('Updated Title');

    modal.setField('priority', 'critical');
    expect(modal.getFormState().priority).toBe('critical');

    modal.setField('assignee', 'venture_infrastructure');
    expect(modal.getFormState().assignee).toBe('venture_infrastructure');
  });

  it('submit calls callback with missionId and updates', () => {
    const modal = createMissionEditModal();
    const submitFn = vi.fn();
    modal.onSubmit(submitFn);

    modal.show(makeMission({ missionId: 'mission-submit-test', title: 'Original' }));
    modal.setField('title', 'Updated Title');
    modal.setField('priority', 'critical');
    modal.setField('assignee', 'venture_infrastructure');

    modal.submit();

    expect(submitFn).toHaveBeenCalledOnce();
    const [missionId, updates] = submitFn.mock.calls[0];
    expect(missionId).toBe('mission-submit-test');
    expect(updates.title).toBe('Updated Title');
    expect(updates.priority).toBe('critical');
    expect(updates.assignee).toBe('venture_infrastructure');
  });

  it('submit does not fire without title', () => {
    const modal = createMissionEditModal();
    const submitFn = vi.fn();
    modal.onSubmit(submitFn);

    modal.show(makeMission());
    modal.setField('title', '');
    modal.submit();

    expect(submitFn).not.toHaveBeenCalled();
  });

  it('submit includes tokenBudget when set', () => {
    const modal = createMissionEditModal();
    const submitFn = vi.fn();
    modal.onSubmit(submitFn);

    modal.show(makeMission());
    modal.setField('tokenBudget', '75000');
    modal.submit();

    expect(submitFn).toHaveBeenCalledOnce();
    const [, updates] = submitFn.mock.calls[0];
    expect(updates.tokenBudget).toBe(75000);
  });

  it('submit excludes tokenBudget when empty', () => {
    const modal = createMissionEditModal();
    const submitFn = vi.fn();
    modal.onSubmit(submitFn);

    modal.show(makeMission({ tokenBudget: undefined }));
    modal.submit();

    expect(submitFn).toHaveBeenCalledOnce();
    const [, updates] = submitFn.mock.calls[0];
    expect(updates.tokenBudget).toBeUndefined();
  });

  it('setViewport does not throw', () => {
    const modal = createMissionEditModal();
    expect(() => modal.setViewport(1920, 1080)).not.toThrow();
    modal.show(makeMission());
    expect(() => modal.setViewport(800, 600)).not.toThrow();
  });

  it('update advances animation alpha', () => {
    const modal = createMissionEditModal();
    modal.show(makeMission());
    expect(modal.container.alpha).toBe(0);
    modal.update(200);
    expect(modal.container.alpha).toBeGreaterThan(0);
  });
});
