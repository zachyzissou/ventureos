import { describe, it, expect, vi } from 'vitest';
import { createConfirmationDialog } from '@/renderer/confirmation-dialog';
import type { ConfirmationRequest } from '@/interaction/types';

function makeRequest(overrides: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  return {
    id: 'test-confirm-1',
    title: 'Confirm Action',
    message: 'Are you sure?',
    confirmLabel: 'Yes',
    cancelLabel: 'No',
    severity: 'warning',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe('renderer/confirmation-dialog', () => {
  it('creates hidden', () => {
    const dialog = createConfirmationDialog();
    expect(dialog.isVisible()).toBe(false);
  });

  it('show makes it visible', () => {
    const dialog = createConfirmationDialog();
    dialog.show(makeRequest());
    expect(dialog.isVisible()).toBe(true);
  });

  it('hide makes it invisible', () => {
    const dialog = createConfirmationDialog();
    dialog.show(makeRequest());
    dialog.hide();
    expect(dialog.isVisible()).toBe(false);
  });

  it('setViewport updates layout', () => {
    const dialog = createConfirmationDialog();
    expect(() => dialog.setViewport(800, 600)).not.toThrow();
  });

  it('update animates alpha', () => {
    const dialog = createConfirmationDialog();
    dialog.show(makeRequest());
    dialog.update(100);
    expect(dialog.container.alpha).toBeGreaterThan(0);
  });

  it('handles different severities', () => {
    const dialog = createConfirmationDialog();
    for (const severity of ['info', 'warning', 'danger'] as const) {
      dialog.show(makeRequest({ severity }));
      expect(dialog.isVisible()).toBe(true);
      dialog.hide();
    }
  });

  it('fade-out animation', () => {
    const dialog = createConfirmationDialog();
    dialog.show(makeRequest());
    dialog.container.alpha = 1;
    dialog.hide();
    dialog.update(50);
    expect(dialog.container.alpha).toBeLessThan(1);
  });
});
