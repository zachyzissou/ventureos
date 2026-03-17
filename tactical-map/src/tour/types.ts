/**
 * Onboarding Tour Types — Issue #210
 *
 * Type definitions for the guided onboarding tour and help overlay.
 */

import type { AgentId, Point } from '@/config';

// ═══════════════════════════════════════════
// Tour Step
// ═══════════════════════════════════════════

export type TourStepId = string;

export type TourAnchor =
  | `agent:${AgentId}`
  | 'control_hub'
  | 'hud'
  | 'viewport'
  | Point;

export interface TourStep {
  id: TourStepId;
  title: string;
  body: string;
  anchor: TourAnchor;
  spotlightRadius?: number;
  advanceOn?: TourAdvanceTrigger;
}

export type TourAdvanceTrigger =
  | { type: 'event'; eventType: string }
  | { type: 'delay'; ms: number };

// ═══════════════════════════════════════════
// Tour State Machine
// ═══════════════════════════════════════════

export type TourStatus = 'idle' | 'active' | 'completed' | 'dismissed';

export interface TourState {
  status: TourStatus;
  stepIndex: number;
  totalSteps: number;
  everCompleted: boolean;
}

// ═══════════════════════════════════════════
// Help Overlay
// ═══════════════════════════════════════════

export interface HelpOverlayEntry {
  id: string;
  shortcut: string;
  description: string;
  category: 'navigation' | 'controls' | 'views';
}
