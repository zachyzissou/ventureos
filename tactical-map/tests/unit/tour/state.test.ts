/**
 * Tour State Machine Tests — Issue #210
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialTourState, startTour, nextStep, prevStep, goToStep,
  dismissTour, resetTour, isActive, isFirstStep, isLastStep,
  currentStepIndex, progressFraction,
} from '@/tour/state';
import type { TourStep } from '@/tour/types';

function makeSteps(count: number): TourStep[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `step-${i}`, title: `Step ${i}`, body: `Body ${i}`, anchor: 'viewport' as const,
  }));
}

describe('Tour State Machine', () => {
  describe('createInitialTourState', () => {
    it('returns idle state', () => {
      const s = createInitialTourState();
      expect(s.status).toBe('idle');
      expect(s.stepIndex).toBe(-1);
      expect(s.totalSteps).toBe(0);
      expect(s.everCompleted).toBe(false);
    });
  });

  describe('startTour', () => {
    it('transitions from idle to active at step 0', () => {
      const s = startTour(createInitialTourState(), makeSteps(5));
      expect(s.status).toBe('active');
      expect(s.stepIndex).toBe(0);
      expect(s.totalSteps).toBe(5);
    });

    it('is no-op when already active', () => {
      const active = startTour(createInitialTourState(), makeSteps(3));
      const result = startTour(active, makeSteps(5));
      expect(result).toBe(active);
    });

    it('is no-op with empty steps', () => {
      const s = startTour(createInitialTourState(), []);
      expect(s.status).toBe('idle');
    });

    it('can restart after dismissed', () => {
      let s = startTour(createInitialTourState(), makeSteps(3));
      s = dismissTour(s);
      s = startTour(s, makeSteps(4));
      expect(s.status).toBe('active');
      expect(s.totalSteps).toBe(4);
    });

    it('can restart after completed', () => {
      let s = startTour(createInitialTourState(), makeSteps(1));
      s = nextStep(s);
      expect(s.status).toBe('completed');
      s = startTour(s, makeSteps(2));
      expect(s.status).toBe('active');
    });
  });

  describe('nextStep', () => {
    it('advances step index', () => {
      let s = startTour(createInitialTourState(), makeSteps(5));
      s = nextStep(s);
      expect(s.stepIndex).toBe(1);
      s = nextStep(s);
      expect(s.stepIndex).toBe(2);
    });

    it('completes on last step', () => {
      let s = startTour(createInitialTourState(), makeSteps(2));
      s = nextStep(s);
      s = nextStep(s);
      expect(s.status).toBe('completed');
      expect(s.stepIndex).toBe(-1);
      expect(s.everCompleted).toBe(true);
    });

    it('single-step tour completes immediately', () => {
      let s = startTour(createInitialTourState(), makeSteps(1));
      s = nextStep(s);
      expect(s.status).toBe('completed');
    });

    it('is no-op when not active', () => {
      const s = createInitialTourState();
      expect(nextStep(s)).toBe(s);
    });

    it('is no-op after dismissed', () => {
      let s = startTour(createInitialTourState(), makeSteps(3));
      s = dismissTour(s);
      expect(nextStep(s)).toBe(s);
    });
  });

  describe('prevStep', () => {
    it('goes back one step', () => {
      let s = startTour(createInitialTourState(), makeSteps(5));
      s = nextStep(nextStep(s));
      s = prevStep(s);
      expect(s.stepIndex).toBe(1);
    });

    it('is no-op at first step', () => {
      const s = startTour(createInitialTourState(), makeSteps(5));
      expect(prevStep(s)).toBe(s);
    });

    it('is no-op when not active', () => {
      const s = createInitialTourState();
      expect(prevStep(s)).toBe(s);
    });
  });

  describe('goToStep', () => {
    it('jumps to specified index', () => {
      let s = startTour(createInitialTourState(), makeSteps(5));
      s = goToStep(s, 3);
      expect(s.stepIndex).toBe(3);
    });

    it('clamps below 0', () => {
      let s = startTour(createInitialTourState(), makeSteps(5));
      s = goToStep(s, -5);
      expect(s.stepIndex).toBe(0);
    });

    it('clamps above max', () => {
      let s = startTour(createInitialTourState(), makeSteps(5));
      s = goToStep(s, 100);
      expect(s.stepIndex).toBe(4);
    });

    it('is no-op when not active', () => {
      const s = createInitialTourState();
      expect(goToStep(s, 2)).toBe(s);
    });
  });

  describe('dismissTour', () => {
    it('transitions to dismissed', () => {
      let s = startTour(createInitialTourState(), makeSteps(3));
      s = dismissTour(s);
      expect(s.status).toBe('dismissed');
      expect(s.stepIndex).toBe(-1);
    });

    it('does not set everCompleted', () => {
      let s = startTour(createInitialTourState(), makeSteps(3));
      s = dismissTour(s);
      expect(s.everCompleted).toBe(false);
    });

    it('is no-op when not active', () => {
      const s = createInitialTourState();
      expect(dismissTour(s)).toBe(s);
    });
  });

  describe('resetTour', () => {
    it('returns to idle preserving everCompleted', () => {
      let s = startTour(createInitialTourState(), makeSteps(1));
      s = nextStep(s);
      s = resetTour(s);
      expect(s.status).toBe('idle');
      expect(s.everCompleted).toBe(true);
    });
  });

  describe('query helpers', () => {
    it('isActive', () => {
      expect(isActive(createInitialTourState())).toBe(false);
      expect(isActive(startTour(createInitialTourState(), makeSteps(3)))).toBe(true);
    });

    it('isFirstStep / isLastStep', () => {
      let s = startTour(createInitialTourState(), makeSteps(3));
      expect(isFirstStep(s)).toBe(true);
      expect(isLastStep(s)).toBe(false);
      s = nextStep(nextStep(s));
      expect(isFirstStep(s)).toBe(false);
      expect(isLastStep(s)).toBe(true);
    });

    it('currentStepIndex', () => {
      let s = startTour(createInitialTourState(), makeSteps(4));
      expect(currentStepIndex(s)).toBe(0);
      s = nextStep(s);
      expect(currentStepIndex(s)).toBe(1);
    });

    it('progressFraction', () => {
      let s = startTour(createInitialTourState(), makeSteps(4));
      expect(progressFraction(s)).toBeCloseTo(0.25);
      s = nextStep(nextStep(nextStep(s)));
      expect(progressFraction(s)).toBeCloseTo(1.0);
      expect(progressFraction(createInitialTourState())).toBe(0);
    });
  });

  describe('full lifecycle', () => {
    it('idle → active → completed → reset → active → dismissed', () => {
      let s = createInitialTourState();
      s = startTour(s, makeSteps(2));
      s = nextStep(nextStep(s));
      expect(s.status).toBe('completed');
      expect(s.everCompleted).toBe(true);
      s = resetTour(s);
      s = startTour(s, makeSteps(3));
      expect(s.status).toBe('active');
      expect(s.everCompleted).toBe(true);
      s = nextStep(s);
      s = dismissTour(s);
      expect(s.status).toBe('dismissed');
      expect(s.everCompleted).toBe(true);
    });
  });
});
