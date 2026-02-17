/**
 * Conversation HTTP Route Handler — VentureOS Conversation System
 *
 * Provides the HTTP API surface for the conversation engine.
 * Adapts the ConversationAPI class for integration with the dashboard's
 * node:http server via handleConversationApi().
 *
 * Issue #78 — API Integration (migrated from ventureos-rpg/api/conversation-http.js)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ConversationHandlerOptions,
  ListConversationsResponse,
  ConversationErrorResponse,
  StartConversationRequest,
  SendMessageRequest,
  AddParticipantRequest,
  SetStatusRequest,
} from './types/conversation';
import { ConversationEngine } from './conversation-engine';
import { ConversationAPI } from './conversation-api';
import { toSafeError } from './error-handler';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}

function parseUrl(req: IncomingMessage): URL | null {
  if (!req.url) return null;
  try {
    return new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return null;
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.from(c as Buffer));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

// ─── Singleton API Instance ─────────────────────────────────────────────────

let _apiInstance: ConversationAPI | null = null;

function getApi(_opts: ConversationHandlerOptions): ConversationAPI {
  if (_apiInstance) return _apiInstance;

  const engine = ConversationEngine.createWithDefaults({
    config: {
      persistDir:
        process.env.CONVERSATION_PERSIST_DIR ??
        `${process.env.HOME ?? '~'}/clawd/ventureos/runtime/conversations`,
    },
  });
  _apiInstance = new ConversationAPI(engine);
  return _apiInstance;
}

// ─── Route Handlers (async) ─────────────────────────────────────────────────

async function handleListConversations(
  api: ConversationAPI,
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ids = await api.listConversations();
  const body: ListConversationsResponse = { conversations: ids };
  sendJson(res, 200, body);
}

async function handleStartConversation(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = (await readJsonBody(req)) as unknown as StartConversationRequest;
  const state = await api.startConversation(body as any);
  sendJson(res, 201, state);
}

async function handleGetConversation(
  api: ConversationAPI,
  _req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const state = await api.getConversation(conversationId);
  sendJson(res, 200, state);
}

async function handleGetContext(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const url = parseUrl(req);
  const maxMessages = url?.searchParams.get('maxMessages');
  const ctx = await api.getContext(conversationId, {
    maxMessages: maxMessages ? Number(maxMessages) : undefined,
  });
  sendJson(res, 200, ctx);
}

async function handleSendMessage(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const body = (await readJsonBody(req)) as unknown as SendMessageRequest;
  const msg = await api.sendMessage({
    ...body,
    conversationId,
  } as any);
  sendJson(res, 201, msg);
}

async function handleAddParticipant(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const body = (await readJsonBody(req)) as unknown as AddParticipantRequest;
  const state = await api.addParticipant(conversationId, body.agentId);
  sendJson(res, 200, state);
}

async function handleSetStatus(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const body = (await readJsonBody(req)) as unknown as SetStatusRequest;
  const state = await api.setStatus(conversationId, body.status, body.reason);
  sendJson(res, 200, state);
}

// ─── Main Router ────────────────────────────────────────────────────────────

const PREFIX = '/api/conversation';

/**
 * Handle a conversation API request.
 *
 * Expected URL pattern: /api/conversation/conversations[/...]
 *
 * Returns `true` if the request was handled (or will be handled async),
 * `false` if it didn't match.
 *
 * Note: This dispatches async handlers via a .then/.catch wrapper,
 * returning `true` synchronously if the route matches. The actual
 * response is written asynchronously.
 */
export function handleConversationApi(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ConversationHandlerOptions,
): boolean {
  const url = parseUrl(req);
  if (!url) return false;

  const pathname = url.pathname;
  if (!pathname.startsWith(PREFIX)) return false;

  // Strip prefix to get the sub-path: /conversations, /conversations/:id, etc.
  const subPath = pathname.slice(PREFIX.length);
  const parts = subPath.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  // Must start with /conversations
  if (parts[0] !== 'conversations') return false;

  let handler: Promise<void> | null = null;
  const api = getApi(opts);

  try {
    // GET /api/conversation/conversations
    if (method === 'GET' && parts.length === 1) {
      handler = handleListConversations(api, req, res);
    }
    // POST /api/conversation/conversations
    else if (method === 'POST' && parts.length === 1) {
      handler = handleStartConversation(api, req, res);
    }
    // GET /api/conversation/conversations/:id
    else if (method === 'GET' && parts.length === 2) {
      handler = handleGetConversation(api, req, res, parts[1]);
    }
    // GET /api/conversation/conversations/:id/context
    else if (method === 'GET' && parts.length === 3 && parts[2] === 'context') {
      handler = handleGetContext(api, req, res, parts[1]);
    }
    // POST /api/conversation/conversations/:id/messages
    else if (method === 'POST' && parts.length === 3 && parts[2] === 'messages') {
      handler = handleSendMessage(api, req, res, parts[1]);
    }
    // POST /api/conversation/conversations/:id/participants
    else if (method === 'POST' && parts.length === 3 && parts[2] === 'participants') {
      handler = handleAddParticipant(api, req, res, parts[1]);
    }
    // POST /api/conversation/conversations/:id/status
    else if (method === 'POST' && parts.length === 3 && parts[2] === 'status') {
      handler = handleSetStatus(api, req, res, parts[1]);
    }
  } catch (err: unknown) {
    const safeError = toSafeError(err, { method, url: req.url });
    sendJson(res, safeError.status, {
      error: safeError.error,
      errorRef: safeError.errorRef,
    } satisfies ConversationErrorResponse);
    return true;
  }

  if (!handler) {
    // Route matched /api/conversation but no specific handler found
    sendJson(res, 404, { error: 'Not found' });
    return true;
  }

  // Fire-and-forget the async handler with error wrapper
  handler.catch((err: unknown) => {
    const safeError = toSafeError(err, { method, url: req.url });
    try {
      sendJson(res, safeError.status, {
        error: safeError.error,
        errorRef: safeError.errorRef,
      } satisfies ConversationErrorResponse);
    } catch {
      // Response may have already been sent
    }
  });

  return true;
}

/**
 * Factory function to create a conversation router with a fixed DB path.
 * Matches the target import style from Issue #78.
 */
export function createConversationRouter(dbPath: string) {
  return {
    handleConversationApi: (req: IncomingMessage, res: ServerResponse) =>
      handleConversationApi(req, res, { dbPath }),
  };
}

export default { handleConversationApi, createConversationRouter };
