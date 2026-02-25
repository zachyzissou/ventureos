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
import { SqliteConversationStore } from './sqlite-conversation-store';
import { InteractionLogger } from './interaction-logger';
import { RuntimeConversationBridge } from './runtime-conversation-bridge';

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

/**
 * Maximum request body size (1 MB).
 * Prevents memory exhaustion from unbounded body reads (Issue #149).
 */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Read and parse a JSON request body with a size limit.
 *
 * Returns `null` and sends an error response (413 or 400) if the body
 * exceeds MAX_BODY_BYTES or is malformed JSON. Callers must check for
 * `null` before proceeding.
 */
async function readJsonBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        req.resume(); // drain remaining data
        sendJson(res, 413, {
          error: 'Request body too large',
          maxBytes: MAX_BODY_BYTES,
        });
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        sendJson(res, 400, { error: 'Malformed JSON in request body' });
        resolve(null);
      }
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      sendJson(res, 400, { error: 'Request stream error' });
      resolve(null);
    });
  });
}

// ─── Singleton API Instance ─────────────────────────────────────────────────

let _apiInstance: ConversationAPI | null = null;
let _interactionLogger: InteractionLogger | null = null;
let _runtimeBridge: RuntimeConversationBridge | null = null;

function getApi(opts: ConversationHandlerOptions): ConversationAPI {
  if (_apiInstance) return _apiInstance;

  // Issue #182: Use SQLite-backed store when dbPath is available,
  // so conversations are persisted in the RPG database and visible
  // to dashboard APIs (/api/rpg/conversations/active, etc.).
  const store = opts.dbPath
    ? new SqliteConversationStore(opts.dbPath)
    : undefined;

  const engine = ConversationEngine.createWithDefaults({
    config: {
      persistDir:
        process.env.CONVERSATION_PERSIST_DIR ??
        `${process.env.HOME ?? '~'}/clawd/ventureos/runtime/conversations`,
    },
    store,
  });
  _apiInstance = new ConversationAPI(engine);

  // Issue #181: Wire interaction logging into agent handoffs.
  // Listen to ConversationAPI events and write to interaction_logs.
  if (opts.dbPath) {
    _interactionLogger = new InteractionLogger(opts.dbPath);

    _apiInstance.on('message', (evt: { message: any; state: any }) => {
      const msg = evt.message;
      if (!msg || msg.from === 'system') return;

      const recipients = msg.deliveredTo ?? msg.to ?? [];
      const agentRecipients = recipients.filter(
        (r: string) => r !== 'user' && r !== 'system' && r !== 'broadcast',
      );
      if (agentRecipients.length === 0) return;

      _interactionLogger!.logHandoff({
        from: msg.from,
        to: agentRecipients,
        type: msg.payload?.type ?? 'message',
        outcome: msg.status ?? 'success',
        conversationId: msg.conversationId,
        description: msg.content?.slice(0, 200),
      });
    });

    _apiInstance.on('conversation_started', (evt: { state: any }) => {
      const state = evt.state;
      if (!state || state.participants.length < 2) return;

      // Log the conversation start as a collaboration interaction
      // between the first two participants.
      _interactionLogger!.logHandoff({
        from: state.participants[0],
        to: state.participants[1],
        type: 'conversation_start',
        outcome: 'success',
        conversationId: state.conversationId,
        description: `Conversation started with ${state.participants.length} participants`,
      });
    });

    // Minimal observability: log stats periodically (every 50 interactions)
    const origLog = _interactionLogger.logInteraction.bind(_interactionLogger);
    let callCount = 0;
    const wrappedLogger = _interactionLogger;
    _apiInstance.on('message', () => {
      callCount++;
      if (callCount % 50 === 0) {
        const stats = wrappedLogger.getStats();
        console.log(
          `[interaction-logger] stats: total=${stats.totalLogged} lastWrite=${stats.lastWriteAt}`,
        );
      }
    });
  }

  // Issue #184: Create runtime conversation bridge for mission integration.
  // This bridge is accessible via getRuntimeBridge() so MissionRunner
  // callers can pass bridge.hooks to their config.
  if (!_runtimeBridge) {
    _runtimeBridge = new RuntimeConversationBridge(_apiInstance);
  }

  return _apiInstance;
}

/**
 * Get the singleton RuntimeConversationBridge instance.
 * Returns null if getApi() hasn't been called yet (i.e., no DB path configured).
 *
 * Usage in MissionRunner callers:
 *   const bridge = getRuntimeBridge();
 *   const runner = new MissionRunner({ ..., hooks: bridge ?? undefined });
 *
 * Fixes #184
 */
export function getRuntimeBridge(): RuntimeConversationBridge | null {
  return _runtimeBridge;
}

/**
 * Reset the singleton instances. Primarily for testing.
 * @internal
 */
export function resetSingletons(): void {
  _apiInstance = null;
  _interactionLogger?.close();
  _interactionLogger = null;
  _runtimeBridge = null;
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
  const body = await readJsonBody(req, res);
  if (!body) return; // response already sent (413/400)
  const state = await api.startConversation(body as unknown as StartConversationRequest as any);
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
  const body = await readJsonBody(req, res);
  if (!body) return; // response already sent (413/400)
  const msg = await api.sendMessage({
    ...(body as unknown as SendMessageRequest),
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
  const body = await readJsonBody(req, res);
  if (!body) return; // response already sent (413/400)
  const state = await api.addParticipant(conversationId, (body as unknown as AddParticipantRequest).agentId);
  sendJson(res, 200, state);
}

async function handleSetStatus(
  api: ConversationAPI,
  req: IncomingMessage,
  res: ServerResponse,
  conversationId: string,
): Promise<void> {
  const body = await readJsonBody(req, res);
  if (!body) return; // response already sent (413/400)
  const casted = body as unknown as SetStatusRequest;
  const state = await api.setStatus(conversationId, casted.status, casted.reason);
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

export default { handleConversationApi, createConversationRouter, getRuntimeBridge, resetSingletons };
