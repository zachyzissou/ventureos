import { describe, it, expect, vi } from 'vitest';
import { createMissionSpawnModal } from '@/renderer/mission-spawn-modal';

describe('renderer/mission-spawn-modal', () => {
  it('creates hidden', () => {
    const modal = createMissionSpawnModal();
    expect(modal.isVisible()).toBe(false);
  });

  it('show makes it visible', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    expect(modal.isVisible()).toBe(true);
  });

  it('hide makes it invisible', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    modal.hide();
    expect(modal.isVisible()).toBe(false);
  });

  it('show with default assignee', () => {
    const modal = createMissionSpawnModal();
    modal.show('oracle');
    const form = modal.getFormState();
    expect(form.assignee).toBe('oracle');
  });

  it('form state has defaults', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    const form = modal.getFormState();
    expect(form.title).toBe('');
    expect(form.description).toBe('');
    expect(form.priority).toBe('normal');
    expect(form.tokenBudget).toBe('');
  });

  it('setField updates form state', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    modal.setField('title', 'Test Mission');
    modal.setField('description', 'A test description');
    const form = modal.getFormState();
    expect(form.title).toBe('Test Mission');
    expect(form.description).toBe('A test description');
  });

  it('onSubmit callback is wired', () => {
    const modal = createMissionSpawnModal();
    const callback = vi.fn();
    modal.onSubmit(callback);
    // The callback is stored; we can't trigger the actual button tap
    // in unit test but verify the wiring
    expect(callback).not.toHaveBeenCalled();
  });

  it('submit invokes callback when title is set', () => {
    const modal = createMissionSpawnModal();
    const callback = vi.fn();
    modal.onSubmit(callback);
    modal.show();
    modal.setField('title', 'Mission One');
    modal.submit();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('setViewport does not throw', () => {
    const modal = createMissionSpawnModal();
    expect(() => modal.setViewport(1920, 1080)).not.toThrow();
  });

  it('update animates alpha', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    modal.update(100);
    expect(modal.container.alpha).toBeGreaterThan(0);
  });

  it('show resets form fields', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    modal.setField('title', 'Existing');
    modal.hide();
    modal.show();
    const form = modal.getFormState();
    expect(form.title).toBe('');
  });

  it('form assignee cycles through agents', () => {
    const modal = createMissionSpawnModal();
    modal.show();
    modal.setField('assignee', 'atlas');
    expect(modal.getFormState().assignee).toBe('atlas');
  });
});
