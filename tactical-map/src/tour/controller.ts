/**
 * Tour Controller — Issue #210
 *
 * Wires the tour state machine to the overlay renderer and event bus.
 */

import type { EventBus } from '@/interaction/event-bus';
import type { TourOverlayLayer } from '@/renderer/tour-overlay';
import type { HelpOverlayLayer } from '@/renderer/help-overlay';
import type { TourStep, TourState } from './types';
import {
  createInitialTourState, startTour, nextStep, prevStep,
  dismissTour, resetTour, isActive,
} from './state';

const STORAGE_KEY = 'ventureos_tour_completed';

export type TourControllerOptions = {
  eventBus: EventBus;
  tourOverlay: TourOverlayLayer;
  helpOverlay: HelpOverlayLayer;
  steps: TourStep[];
};

export type TourController = {
  start: () => void;
  hasCompleted: () => boolean;
  getState: () => TourState;
  toggleHelp: () => void;
  destroy: () => void;
};

export function createTourController(opts: TourControllerOptions): TourController {
  let state: TourState = createInitialTourState();
  let autoAdvanceUnsub: (() => void) | null = null;

  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true') {
      state = { ...state, everCompleted: true };
    }
  } catch { /* SSR / privacy mode */ }

  function persist() {
    try {
      if (typeof localStorage !== 'undefined' && state.everCompleted) {
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    } catch { /* noop */ }
  }

  function renderCurrentStep() {
    if (!isActive(state)) { opts.tourOverlay.hide(); return; }
    const step = opts.steps[state.stepIndex];
    if (!step) return;
    opts.tourOverlay.show(step, state.stepIndex, state.totalSteps);
    setupAutoAdvance(step);
  }

  function setupAutoAdvance(step: TourStep) {
    autoAdvanceUnsub?.();
    autoAdvanceUnsub = null;
    if (!step.advanceOn) return;
    if (step.advanceOn.type === 'event') {
      const targetType = step.advanceOn.eventType;
      autoAdvanceUnsub = opts.eventBus.on(targetType as any, () => advance());
    } else if (step.advanceOn.type === 'delay') {
      const timer = setTimeout(() => advance(), step.advanceOn.ms);
      autoAdvanceUnsub = () => clearTimeout(timer);
    }
  }

  function advance() {
    if (!isActive(state)) return;
    state = nextStep(state);
    if (state.status === 'completed') {
      persist();
      opts.tourOverlay.hide();
      opts.eventBus.emit({ type: 'tour:complete', timestamp: performance.now() });
      autoAdvanceUnsub?.(); autoAdvanceUnsub = null;
    } else {
      opts.eventBus.emit({ type: 'tour:next', timestamp: performance.now() });
      renderCurrentStep();
    }
  }

  function goBack() {
    if (!isActive(state)) return;
    state = prevStep(state);
    opts.eventBus.emit({ type: 'tour:back', timestamp: performance.now() });
    renderCurrentStep();
  }

  function dismiss() {
    if (!isActive(state)) return;
    state = dismissTour(state);
    opts.tourOverlay.hide();
    autoAdvanceUnsub?.(); autoAdvanceUnsub = null;
    opts.eventBus.emit({ type: 'tour:dismiss', timestamp: performance.now() });
  }

  function start() {
    state = resetTour(state);
    state = startTour(state, opts.steps);
    opts.eventBus.emit({ type: 'tour:start', timestamp: performance.now() });
    renderCurrentStep();
  }

  function toggleHelp() {
    opts.helpOverlay.toggle();
    opts.eventBus.emit({ type: 'help:toggle', timestamp: performance.now() });
  }

  opts.tourOverlay.onNext(() => advance());
  opts.tourOverlay.onBack(() => goBack());
  opts.tourOverlay.onDismiss(() => dismiss());

  return {
    start,
    hasCompleted: () => state.everCompleted,
    getState: () => state,
    toggleHelp,
    destroy: () => { autoAdvanceUnsub?.(); autoAdvanceUnsub = null; },
  };
}
