/**
 * Permission System — Phase 5.7
 *
 * Role-based access control for interactive actions.
 * Checks user role against required permission for each action type.
 */

import type { ControlActionType, UserRole, PermissionMap } from './types';
import { DEFAULT_PERMISSIONS, ROLE_HIERARCHY } from './types';

/**
 * Check if a user role satisfies the minimum required role.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

/**
 * Check if a user can perform a specific action.
 */
export function canPerformAction(
  userRole: UserRole,
  actionType: ControlActionType,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): boolean {
  const required = permissions[actionType];
  if (!required) return false;
  return hasRole(userRole, required);
}

/**
 * Get all actions a role can perform.
 */
export function allowedActions(
  userRole: UserRole,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): ControlActionType[] {
  return (Object.keys(permissions) as ControlActionType[]).filter(
    (action) => canPerformAction(userRole, action, permissions),
  );
}

/**
 * Validate an action against the current user role.
 * Returns an error message if not permitted, or null if ok.
 */
export function validatePermission(
  userRole: UserRole,
  actionType: ControlActionType,
  permissions: PermissionMap = DEFAULT_PERMISSIONS,
): string | null {
  if (canPerformAction(userRole, actionType, permissions)) return null;
  const required = permissions[actionType] ?? 'unknown';
  return `Insufficient permissions: '${actionType}' requires '${required}' role (current: '${userRole}')`;
}
