/**
 * Interactive Controls Module — Phase 5.7
 *
 * Re-exports all interaction subsystems for clean imports.
 */

export { createEventBus } from './event-bus';
export type { EventBus } from './event-bus';

export { createInteractionController } from './controller';
export type { InteractionController, InteractionControllerOptions } from './controller';

export { hasRole, canPerformAction, allowedActions, validatePermission } from './permissions';

export {
  createUndoStack,
  pushUndo,
  undo,
  redo,
  canUndo,
  canRedo,
  clearUndoStack,
} from './undo';

export { fuzzyScore, fuzzySearch, fuzzySearchMulti } from './fuzzy-search';

export {
  createInitialUIState,
  DEFAULT_PERMISSIONS,
  ROLE_HIERARCHY,
} from './types';

export type {
  UserRole,
  ControlActionType,
  ControlAction,
  ControlActionResult,
  AgentDetailData,
  MissionPriority,
  MissionSpawnRequest,
  MissionSpawnResult,
  BudgetAdjustment,
  PaletteCommand,
  UndoEntry,
  UndoStack,
  InteractionEvent,
  InteractionEventType,
  InteractionHandler,
  ConfirmationRequest,
  InteractiveUIState,
  PermissionMap,
} from './types';
