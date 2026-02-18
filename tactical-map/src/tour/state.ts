/**
 * Tour State Machine — Issue #210
 *
 * Pure-function state machine for the onboarding tour.
 * All transitions are deterministic — no side effects.
 */

import type { TourState, TourStep } from './types';

export function createInitialTourState(): TourState {
  return { status: 'idle', stepIndex: -1, totalSteps: 0, everCompleted: false };
}

export function startTour(state: TourState, steps: TourStep[]): TourState {
  if (state.status === 'active') return state;
  if (steps.length === 0) return state;
  return { ...state, status: 'active', stepIndex: 0, totalSteps: steps.length };
}

export function nextStep(state: TourState): TourState {
  if (state.status !== 'active') return state;
  const next = state.stepIndex + 1;
  if (next >= state.totalSteps) {
    return { ...state, status: 'completed', stepIndex: -1, everCompleted: true };
  }
  return { ...state, stepIndex: next };
}

export function prevStep(state: TourState): TourState {
  if (state.status !== 'active') return state;
  if (state.stepIndex <= 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1 };
}

export function goToStep(state: TourState, index: number): TourState {
  if (state.status !== 'active') return state;
  const clamped = Math.max(0, Math.min(index, state.totalSteps - 1));
  return { ...state, stepIndex: clamped };
}

export function dismissTour(state: TourState): TourState {
  if (state.status !== 'active') return state;
  return { ...state, status: 'dismissed', stepIndex: -1 };
}

export function resetTour(state: TourState): TourState {
  return { ...state, status: 'idle', stepIndex: -1, totalSteps: 0 };
}

export function isActive(state: TourState): boolean {
  return state.status === 'active';
}

export function isFirstStep(state: TourState): boolean {
  return state.status === 'active' && state.stepIndex === 0;
}

export function isLastStep(state: TourState): boolean {
  return state.status === 'active' && state.stepIndex === state.totalSteps - 1;
}

export function currentStepIndex(state: TourState): number {
  return state.stepIndex;
}

export function progressFraction(state: TourState): number {
  if (state.status !== 'active' || state.totalSteps === 0) return 0;
  return (state.stepIndex + 1) / state.totalSteps;
}
