import { describe, it, expect } from 'vitest';
import {
  createInitialUIState,
  DEFAULT_PERMISSIONS,
  ROLE_HIERARCHY,
  TACTICAL_ROLE_SUBJECTS,
} from '@/interaction/types';
import type { ControlActionType, UserRole } from '@/interaction/types';

describe('interaction/types', () => {
  describe('createInitialUIState', () => {
    it('returns default state', () => {
      const state = createInitialUIState();
      expect(state.selectedAgent).toBeNull();
      expect(state.hoveredAgent).toBeNull();
      expect(state.paletteOpen).toBe(false);
      expect(state.confirmation).toBeNull();
      expect(state.missionSpawnOpen).toBe(false);
      expect(state.configEditorOpen).toBe(false);
      expect(state.userRole).toBe('operator');
    });

    it('returns a new object each time', () => {
      const a = createInitialUIState();
      const b = createInitialUIState();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('DEFAULT_PERMISSIONS', () => {
    it('covers all expected action types', () => {
      const expectedTypes: ControlActionType[] = [
        'agent:view',
        'agent:pause',
        'agent:resume',
        'mission:spawn',
        'mission:priority',
        'budget:adjust',
        'config:edit',
        'command:execute',
      ];

      for (const type of expectedTypes) {
        expect(DEFAULT_PERMISSIONS[type]).toBeDefined();
      }
    });

    it('viewer actions are minimal', () => {
      const viewerActions = Object.entries(DEFAULT_PERMISSIONS)
        .filter(([_, role]) => role === 'viewer')
        .map(([action]) => action);
      expect(viewerActions).toContain('agent:view');
      expect(viewerActions).not.toContain('agent:pause');
    });

    it('admin-only actions exist', () => {
      expect(DEFAULT_PERMISSIONS['budget:adjust']).toBe('admin');
      expect(DEFAULT_PERMISSIONS['config:edit']).toBe('admin');
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('has all three roles', () => {
      const roles: UserRole[] = ['viewer', 'operator', 'admin'];
      for (const role of roles) {
        expect(ROLE_HIERARCHY[role]).toBeTypeOf('number');
      }
    });

    it('hierarchy is strictly ordered', () => {
      expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.operator);
      expect(ROLE_HIERARCHY.operator).toBeLessThan(ROLE_HIERARCHY.admin);
    });
  });

  describe('TACTICAL_ROLE_SUBJECTS', () => {
    it('maps each legacy UI role to a canonical subject', () => {
      expect(TACTICAL_ROLE_SUBJECTS.viewer.bindingId).toBe('trust_evidence:auditor');
      expect(TACTICAL_ROLE_SUBJECTS.operator.bindingId).toBe('operations:operator');
      expect(TACTICAL_ROLE_SUBJECTS.admin.bindingId).toBe('executive_office:director');
    });
  });
});
