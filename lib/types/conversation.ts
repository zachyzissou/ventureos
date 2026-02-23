/**
 * Conversation API TypeScript Interfaces — VentureOS Conversation System
 *
 * Type contracts for all Conversation HTTP API request/response shapes.
 * Used by lib/conversation-http.ts and dashboard/server/routes/conversation.ts.
 *
 * Issue #78 — API Integration
 */

// Re-export the engine types that are part of the public API contract
export type {
  ConversationId,
  ConversationMessage,
  ConversationState,
  ContextBundle,
  StartConversationParams,
  SendMessageParams,
  ConversationStatus,
} from '../conversation-engine';

// ─── HTTP Request Bodies ────────────────────────────────────────────────────

/** POST /api/conversation/conversations request body. */
export interface StartConversationRequest {
  topic?: string;
  participants: string[];
  initiator: string;
  metadata?: Record<string, unknown>;
}

/** POST /api/conversation/conversations/:id/messages request body. */
export interface SendMessageRequest {
  agentId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** POST /api/conversation/conversations/:id/participants request body. */
export interface AddParticipantRequest {
  agentId: string;
}

/** POST /api/conversation/conversations/:id/status request body. */
export interface SetStatusRequest {
  status: 'active' | 'paused' | 'require_approval' | 'closed';
  reason?: string;
}

// ─── HTTP Response Types ────────────────────────────────────────────────────

/** GET /api/conversation/conversations response. */
export interface ListConversationsResponse {
  conversations: string[];
}

/** GET /api/conversation/conversations/:id/context response. */
export interface ConversationContextResponse {
  conversationId: string;
  messages: Array<{
    id: string;
    agentId: string;
    content: string;
    timestamp: string;
  }>;
  summaries: Array<{
    summaryId: string;
    content: string;
    createdAt: string;
  }>;
  estimatedTokens: number;
}

/** Error response envelope. */
export interface ConversationErrorResponse {
  error: string;
  errorRef?: string;
}

// ─── Shared ─────────────────────────────────────────────────────────────────

/** Options passed to conversation route handler. */
export interface ConversationHandlerOptions {
  dbPath: string;
}

/** Conversation module interface for dashboard integration. */
export interface ConversationModule {
  handleConversationApi: (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    opts: ConversationHandlerOptions,
  ) => boolean;
}
