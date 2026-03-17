import { describe, it, expect } from 'vitest';
import {
  hasRole,
  canPerformAction,
  allowedActions,
  validatePermission,
  resolvePermissionSubject,
} from '@/interaction/permissions';
import { DEFAULT_PERMISSIONS, ROLE_HIERARCHY, TACTICAL_ROLE_SUBJECTS } from '@/interaction/types';
import type { UserRole, ControlActionType, PermissionMap, InteractionSubjectProfile } from '@/interaction/types';

describe('interaction/permissions', () => {
  describe('hasRole', () => {
    it('viewer has viewer role', () => {
      expect(hasRole('viewer', 'viewer')).toBe(true);
    });

    it('operator has viewer and operator roles', () => {
      expect(hasRole('operator', 'viewer')).toBe(true);
      expect(hasRole('operator', 'operator')).toBe(true);
    });

    it('admin has all roles', () => {
      expect(hasRole('admin', 'viewer')).toBe(true);
      expect(hasRole('admin', 'operator')).toBe(true);
      expect(hasRole('admin', 'admin')).toBe(true);
    });

    it('viewer cannot act as operator', () => {
      expect(hasRole('viewer', 'operator')).toBe(false);
    });

    it('operator cannot act as admin', () => {
      expect(hasRole('operator', 'admin')).toBe(false);
    });
  });

  describe('canPerformAction', () => {
    it('viewer can view agents', () => {
      expect(canPerformAction('viewer', 'agent:view')).toBe(true);
    });

    it('viewer cannot pause agents', () => {
      expect(canPerformAction('viewer', 'agent:pause')).toBe(false);
    });

    it('operator can pause and resume agents', () => {
      expect(canPerformAction('operator', 'agent:pause')).toBe(true);
      expect(canPerformAction('operator', 'agent:resume')).toBe(true);
    });

    it('operator cannot adjust budget', () => {
      expect(canPerformAction('operator', 'budget:adjust')).toBe(false);
    });

    it('admin can do everything', () => {
      const allActions = Object.keys(DEFAULT_PERMISSIONS) as ControlActionType[];
      for (const action of allActions) {
        expect(canPerformAction('admin', action)).toBe(true);
      }
    });

    it('returns false for unknown action type', () => {
      // @ts-expect-error - testing invalid input
      expect(canPerformAction('admin', 'nonexistent:action')).toBe(false);
    });

    it('uses custom permission map', () => {
      const custom: PermissionMap = {
        ...DEFAULT_PERMISSIONS,
        'agent:view': 'admin', // lock down viewing
      };
      expect(canPerformAction('viewer', 'agent:view', custom)).toBe(false);
      expect(canPerformAction('admin', 'agent:view', custom)).toBe(true);
    });

    it('accepts canonical subject profiles directly', () => {
      const subject: InteractionSubjectProfile = {
        bindingId: 'operations:operator',
        authorityClass: 'control_plane',
        capabilityId: 'venture_control',
      };
      expect(canPerformAction(subject, 'mission:spawn')).toBe(true);
      expect(canPerformAction(subject, 'budget:adjust')).toBe(false);
    });
  });

  describe('allowedActions', () => {
    it('viewer gets only view actions', () => {
      const actions = allowedActions('viewer');
      expect(actions).toContain('agent:view');
      expect(actions).not.toContain('agent:pause');
      expect(actions).not.toContain('budget:adjust');
    });

    it('operator gets operational actions', () => {
      const actions = allowedActions('operator');
      expect(actions).toContain('agent:view');
      expect(actions).toContain('agent:pause');
      expect(actions).toContain('mission:spawn');
      expect(actions).not.toContain('budget:adjust');
    });

    it('admin gets all actions', () => {
      const actions = allowedActions('admin');
      const allActions = Object.keys(DEFAULT_PERMISSIONS) as ControlActionType[];
      expect(actions.length).toBe(allActions.length);
    });
  });

  describe('validatePermission', () => {
    it('returns null for permitted actions', () => {
      expect(validatePermission('admin', 'budget:adjust')).toBeNull();
    });

    it('returns error message for denied actions', () => {
      const result = validatePermission('viewer', 'agent:pause');
      expect(result).toBeTypeOf('string');
      expect(result).toContain('Insufficient permissions');
      expect(result).toContain('trust_evidence:auditor');
    });
  });

  describe('resolvePermissionSubject', () => {
    it('maps legacy tactical-map roles to canonical VentureOS subjects', () => {
      expect(resolvePermissionSubject('viewer')).toEqual(TACTICAL_ROLE_SUBJECTS.viewer);
      expect(resolvePermissionSubject('operator')).toEqual(TACTICAL_ROLE_SUBJECTS.operator);
      expect(resolvePermissionSubject('admin')).toEqual(TACTICAL_ROLE_SUBJECTS.admin);
    });
  });

  describe('ROLE_HIERARCHY', () => {
    it('has correct ordering', () => {
      expect(ROLE_HIERARCHY.viewer).toBeLessThan(ROLE_HIERARCHY.operator);
      expect(ROLE_HIERARCHY.operator).toBeLessThan(ROLE_HIERARCHY.admin);
    });
  });
});
