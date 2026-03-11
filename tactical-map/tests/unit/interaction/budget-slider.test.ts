import { describe, it, expect, vi } from 'vitest';
import { createBudgetSlider } from '@/renderer/budget-slider';

describe('renderer/budget-slider', () => {
  it('creates with container hidden', () => {
    const slider = createBudgetSlider();
    expect(slider.container.visible).toBe(false);
    expect(slider.currentAgent()).toBeNull();
  });

  it('configure sets agent and value', () => {
    const slider = createBudgetSlider();
    slider.configure('synth', 50000, 100000);
    expect(slider.currentAgent()).toBe('synth');
    expect(slider.getValue()).toBe(50000);
  });

  it('configure with zero budget', () => {
    const slider = createBudgetSlider();
    slider.configure('oracle', 0, 100000);
    expect(slider.getValue()).toBe(0);
  });

  it('configure with full budget', () => {
    const slider = createBudgetSlider();
    slider.configure('atlas', 100000, 100000);
    expect(slider.getValue()).toBe(100000);
  });

  it('setVisible shows/hides', () => {
    const slider = createBudgetSlider();
    slider.setVisible(true);
    expect(slider.container.visible).toBe(true);
    slider.setVisible(false);
    expect(slider.container.visible).toBe(false);
  });

  it('onChange callback can be set', () => {
    const slider = createBudgetSlider();
    const cb = vi.fn();
    slider.onChange(cb);
    // Callback registered but not called yet
    expect(cb).not.toHaveBeenCalled();
  });

  it('onCommit callback can be set', () => {
    const slider = createBudgetSlider();
    const cb = vi.fn();
    slider.onCommit(cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('update does not throw', () => {
    const slider = createBudgetSlider();
    slider.configure('synth', 30000, 100000);
    expect(() => slider.update(16)).not.toThrow();
  });

  it('clamps value within range', () => {
    const slider = createBudgetSlider();
    // Configure with budget exceeding max
    slider.configure('synth', 200000, 100000);
    expect(slider.getValue()).toBe(100000);
  });

  it('handles very small max budget', () => {
    const slider = createBudgetSlider();
    slider.configure('echo', 5, 10);
    expect(slider.getValue()).toBe(5);
  });
});
