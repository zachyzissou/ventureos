/**
 * Conversation API — VentureOS Conversation Orchestration (Track 5)
 *
 * This is the integration surface for Oracle's UI and any future services.
 *
 * - TypeScript interface: ConversationAPI
 * - EventEmitter-based realtime updates (no external deps)
 * - Optional minimal REST server (node:http) for dashboards
 */

import { EventEmitter } from 'node:events';
import http from 'node:http';
import { URL } from 'node:url';

import {
  ConversationEngine,
  type ConversationId,
  type ConversationMessage,
  type ConversationState,
  type ContextBundle,
  type StartConversationParams,
  type SendMessageParams,
  type ConversationStatus,
} from './conversation-engine';
import { toSafeError } from './error-handler';

export type ConversationEventMap = {
  conversation_started: { state: ConversationState };
  message: { message: ConversationMessage; state: ConversationState };
  participant_added: { state: ConversationState; agentId: string };
  status_changed: { state: ConversationState; status: ConversationStatus; reason?: string };
};

export class ConversationAPI extends EventEmitter {
  constructor(public readonly engine: ConversationEngine) {
    super();
  }

  async startConversation(params: StartConversationParams): Promise<ConversationState> {
    const state = await this.engine.startConversation(params);
    this.emit('conversation_started', { state } satisfies ConversationEventMap['conversation_started']);
    return state;
  }

  async sendMessage(params: SendMessageParams): Promise<ConversationMessage> {
    const message = await this.engine.sendMessage(params);
    const state = await this.engine.getConversation(params.conversationId);
    this.emit('message', { message, state } satisfies ConversationEventMap['message']);
    return message;
  }

  async addParticipant(conversationId: ConversationId, agentId: string): Promise<ConversationState> {
    const state = await this.engine.addParticipant(conversationId, agentId);
    this.emit('participant_added', { state, agentId } satisfies ConversationEventMap['participant_added']);
    return state;
  }

  async setStatus(conversationId: ConversationId, status: ConversationStatus, reason?: string): Promise<ConversationState> {
    const state = await this.engine.setStatus(conversationId, status, reason);
    this.emit('status_changed', { state, status, reason } satisfies ConversationEventMap['status_changed']);
    return state;
  }

  getConversation(conversationId: ConversationId): Promise<ConversationState> {
    return this.engine.getConversation(conversationId);
  }

  listConversations(): Promise<ConversationId[]> {
    return this.engine.listConversations();
  }

  getContext(conversationId: ConversationId, opts?: { maxMessages?: number }): Promise<ContextBundle> {
    return this.engine.getContext(conversationId, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Optional REST server (no external deps)
// ─────────────────────────────────────────────────────────────────────────

export interface ConversationRestServerOptions {
  port: number;
  host?: string;
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
async function readJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<any | null> {
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
        writeJson(res, 413, {
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
        resolve(JSON.parse(raw));
      } catch {
        writeJson(res, 400, { error: 'Malformed JSON in request body' });
        resolve(null);
      }
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      writeJson(res, 400, { error: 'Request stream error' });
      resolve(null);
    });
  });
}

function writeJson(res: http.ServerResponse, status: number, body: any): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(json);
}

export function createConversationRestServer(api: ConversationAPI, options: ConversationRestServerOptions): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) return writeJson(res, 400, { error: 'missing url' });
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
      const parts = url.pathname.split('/').filter(Boolean);

      // GET /conversations
      if (req.method === 'GET' && parts.length === 1 && parts[0] === 'conversations') {
        const ids = await api.listConversations();
        return writeJson(res, 200, { conversations: ids });
      }

      // POST /conversations
      if (req.method === 'POST' && parts.length === 1 && parts[0] === 'conversations') {
        const body = await readJson(req, res);
        if (!body) return; // response already sent (413/400)
        const state = await api.startConversation(body as any);
        return writeJson(res, 201, state);
      }

      // GET /conversations/:id
      if (req.method === 'GET' && parts.length === 2 && parts[0] === 'conversations') {
        const state = await api.getConversation(parts[1]);
        return writeJson(res, 200, state);
      }

      // GET /conversations/:id/context
      if (req.method === 'GET' && parts.length === 3 && parts[0] === 'conversations' && parts[2] === 'context') {
        const maxMessages = url.searchParams.get('maxMessages');
        const ctx = await api.getContext(parts[1], { maxMessages: maxMessages ? Number(maxMessages) : undefined });
        return writeJson(res, 200, ctx);
      }

      // POST /conversations/:id/messages
      if (req.method === 'POST' && parts.length === 3 && parts[0] === 'conversations' && parts[2] === 'messages') {
        const body = await readJson(req, res);
        if (!body) return; // response already sent (413/400)
        const msg = await api.sendMessage({ ...(body as any), conversationId: parts[1] });
        return writeJson(res, 201, msg);
      }

      return writeJson(res, 404, { error: 'not found' });
    } catch (err: any) {
      const safeError = toSafeError(err, { method: req.method, url: req.url });
      return writeJson(res, safeError.status, {
        error: safeError.error,
        errorRef: safeError.errorRef,
      });
    }
  });

  server.listen(options.port, options.host);
  return server;
}
