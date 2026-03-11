/**
 * Conversation route handler — Dashboard integration
 *
 * Thin adapter that integrates the monorepo's lib/conversation-http module
 * into the dashboard's HTTP server.
 *
 * Issue #78 — API Integration
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConversationHandlerOptions } from '../../../lib/types/conversation.js';
import conversationHttp from '../../../lib/conversation-http.js';

const { handleConversationApi } = conversationHttp as typeof import('../../../lib/conversation-http.js');
export { handleConversationApi };
export type { ConversationHandlerOptions };

/**
 * Conversation API route handler for the dashboard.
 *
 * Handles:
 *   GET  /api/conversation/conversations           — List conversations
 *   POST /api/conversation/conversations           — Start a conversation
 *   GET  /api/conversation/conversations/:id       — Get conversation state
 *   GET  /api/conversation/conversations/:id/context — Get context bundle
 *   POST /api/conversation/conversations/:id/messages — Send a message
 *   POST /api/conversation/conversations/:id/participants — Add participant
 *   POST /api/conversation/conversations/:id/status — Set status
 *
 * @returns true if the request was handled, false otherwise
 */
export function handleConversation(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ConversationHandlerOptions,
): boolean {
  return handleConversationApi(req, res, opts);
}
