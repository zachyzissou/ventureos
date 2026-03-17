/**
 * Permission System
 *
 * Tactical-map controls now resolve through canonical VentureOS bindings while
 * preserving the existing viewer/operator/admin compatibility surface.
 */

import type {
  ControlActionType,
  UserRole,
  PermissionMap,
  InteractionSubjectProfile,
  InteractionAuthorityClass,
} from './types';
import {
  DEFAULT_PERMISSIONS,
  ROLE_HIERARCHY,
  TACTICAL_ROLE_SUBJECTS,
} from './types';

export type PermissionSubject = UserRole | InteractionSubjectProfile;

interface TacticalActionPolicy {
  allowedAuthorityClasses: readonly InteractionAuthorityClass[];
  allowedBindingIds: readonly string[];
}

const TACTICAL_ACTION_POLICY: Record<ControlActionType, TacticalActionPolicy> = {
  'agent:view': {
    allowedAuthorityClasses: ['delegated_agent', 'control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['trust_evidence:auditor', 'operations:operator', 'executive_office:director'],
  },
  'agent:pause': {
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['operations:operator', 'operations:director', 'executive_office:director'],
  },
  'agent:resume': {
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['operations:operator', 'operations:director', 'executive_office:director'],
  },
  'mission:spawn': {
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['operations:operator', 'operations:director', 'executive_office:director'],
  },
  'mission:priority': {
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['operations:operator', 'operations:director', 'executive_office:director'],
  },
  'budget:adjust': {
    allowedAuthorityClasses: ['human_final_arbiter', 'control_plane'],
    allowedBindingIds: ['operations:director', 'executive_office:director'],
  },
  'config:edit': {
    allowedAuthorityClasses: ['human_final_arbiter', 'control_plane'],
    allowedBindingIds: ['operations:director', 'executive_office:director'],
  },
  'command:execute': {
    allowedAuthorityClasses: ['control_plane', 'human_final_arbiter'],
    allowedBindingIds: ['operations:operator', 'operations:director', 'executive_office:director'],
  },
};

function isInteractionSubjectProfile(value: PermissionSubject): value is InteractionSubjectProfile {
  return typeof value === 'object' && value !== null;
}

export function resolvePermissionSubject(subject: PermissionSubject): InteractionSubjectProfile {
  if (isInteractionSubjectProfile(subject)) return subject;
  return TACTICAL_ROLE_SUBJECTS[subject];
}

/**
 * Check if a user role satisfies the minimum required role.
 * Compatibility helper for callers that still pass a custom permission map.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

function usesDefaultPermissions(permissions: PermissionMap): boolean {
  return permissions === DEFAULT_PERMISSIONS;
}

function canPerformWithLegacyHierarchy(
  userRole: UserRole,
  actionType: ControlActionType,
  permissions: PermissionMap,
): boolean {
  const required = permissions[actionType];
  if (!required) return false;
  return hasRole(userRole, required);
}

function canPerformWithCanonicalPolicy(
  subject: InteractionSubjectProfile,
  actionType: ControlActionType,
): boolean {
  const policy = TACTICAL_ACTION_POLICY[actionType];
  if (!policy) return false;
  if (!policy.allowedAuthorityClasses.includes(subject.authorityClass)) return false;
  return policy.allowedBindingIds.includes(subject.bindingId);
}

/**
 * Check if a subject can perform a specific action.
 */
export function canPerformAction(
  subject: PermissionSubject,
  actionType: ControlActionType,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): boolean {
  if (!usesDefaultPermissions(permissions)) {
    if (typeof subject === 'string') {
      return canPerformWithLegacyHierarchy(subject, actionType, permissions);
    }
    if (subject.userRole) {
      return canPerformWithLegacyHierarchy(subject.userRole, actionType, permissions);
    }
  }
  return canPerformWithCanonicalPolicy(resolvePermissionSubject(subject), actionType);
}

/**
 * Get all actions a subject can perform.
 */
export function allowedActions(
  subject: PermissionSubject,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): ControlActionType[] {
  return (Object.keys(permissions) as ControlActionType[]).filter(
    (action) => canPerformAction(subject, action, permissions),
  );
}

/**
 * Validate an action against the current subject.
 * Returns an error message if not permitted, or null if ok.
 */
export function validatePermission(
  subject: PermissionSubject,
  actionType: ControlActionType,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): string | null {
  if (canPerformAction(subject, actionType, permissions)) return null;

  if (!usesDefaultPermissions(permissions) && typeof subject === 'string') {
    const required = permissions[actionType] ?? 'unknown';
    return `Insufficient permissions: '${actionType}' requires '${required}' role (current: '${subject}')`;
  }

  if (!usesDefaultPermissions(permissions) && isInteractionSubjectProfile(subject) && subject.userRole) {
    const required = permissions[actionType] ?? 'unknown';
    return `Insufficient permissions: '${actionType}' requires '${required}' role (current compatibility role: '${subject.userRole}')`;
  }

  const resolved = resolvePermissionSubject(subject);
  return `Insufficient permissions: '${actionType}' is not allowed for binding '${resolved.bindingId}' (${resolved.authorityClass})`;
}
