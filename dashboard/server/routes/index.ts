/**
 * Route barrel export.
 * Migrated from Phase 3 — Issue #76.
 * Updated Issue #78 — API Integration (RPG + Conversation routes).
 */

export { handleKpis } from './kpis.js';
export { handleObservations } from './observations.js';
export { handleAgentHealth } from './agent-health.js';
export { handleLogs } from './logs.js';
export { handleRpg, handleRpgApi } from './rpg.js';
export { handleConversation, handleConversationApi } from './conversation.js';
export { handleTacticalMapControls } from './tactical-map-controls.js';
export { handleTacticalMapReplay } from './tactical-map-replay.js';
export { handleAgentDiagnostics } from './agent-diagnostics.js';
export { handleChangelog } from './changelog.js';
export { handleTaskBoard } from './task-board.js';
export {
  maybeAppendSnapshot,
  queryHistory,
  readHistory,
  pruneSnapshots,
  shouldSnapshot,
  createSnapshot,
} from '../metrics-history.js';
export type {
  MetricsSnapshot,
  MetricsHistoryFile,
  MetricsHistoryConfig,
} from '../metrics-history.js';
export {
  emitTaskEvent,
  broadcastTaskEvent,
  addClient,
  addFilteredClient,
  removeClient,
  removeAllClients,
  clientCount,
  parseSubscriptionFilter,
  matchesFilter,
} from '../task-board-events.js';
export type { SseSubscriptionFilter } from '../task-board-events.js';
export { handleMemoryState } from './memory-state.js';
export { handleSharedContext } from './shared-context.js';
export {
  readAlertConfig,
  writeAlertConfig,
  evaluateAlerts,
  validateAlertConfig,
  mergeWithDefaults,
  DEFAULT_ALERT_CONFIG,
} from '../alert-rules.js';
export type {
  AlertRulesConfig,
  AlertThreshold,
  AlertSeverity,
  AlertRuleResult,
  AlertEvaluation,
  AlertMetricsInput,
  AlertConfigValidationError,
} from '../alert-rules.js';
export {
  readAlertHistory,
  createAlertEvent,
  isStateChange,
  pruneAlertHistory,
  shouldRecordEvent,
  maybeAppendAlertEvent,
  queryAlertTimeline,
} from '../alert-history.js';
export type {
  AlertHistoryEvent,
  AlertHistoryFile,
  AlertHistoryConfig,
  AlertHistoryQuery,
  AlertTimelineSummary,
} from '../alert-history.js';
export {
  readWebhookConfig,
  writeWebhookConfig,
  validateWebhookConfig,
  sanitizeConfig as sanitizeWebhookConfig,
  redactConfig as redactWebhookConfig,
  buildWebhookPayload,
  deliverWebhook,
  maybeDeliverWebhooks,
  isTransition,
  selectTargets,
  resetDeliveryState,
  getDeliveryState,
  maskUrl,
  computeSignature,
  DEFAULT_WEBHOOK_CONFIG,
} from '../alert-webhook.js';
export type {
  WebhookConfig,
  WebhookTarget,
  WebhookPayload,
  WebhookDeliveryResult,
  WebhookDeliveryState,
  WebhookConfigValidationError,
} from '../alert-webhook.js';
export {
  readDeliveryHistory,
  appendDeliveryEvents,
  queryDeliveryHistory,
  pruneDeliveryEvents,
  createDeliveryEvent,
  truncateError,
} from '../webhook-delivery-history.js';
export type {
  WebhookDeliveryEvent,
  WebhookDeliveryHistoryFile,
  WebhookDeliveryHistoryConfig,
  DeliveryHistoryQuery,
  DeliveryHistorySummary,
  DeliveryHistoryResponse,
} from '../webhook-delivery-history.js';
