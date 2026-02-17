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
