/**
 * Tactical Map Replay & Session Routes — Phase 5.8 → Issue #193
 *
 * Full CRUD endpoints for managing replay sessions with file-based persistence.
 * Replaces all previous 501 stubs with production mutation handlers.
 *
 * Supported paths:
 *   GET    /api/tactical-map/sessions              List sessions (paginated, filtered)
 *   GET    /api/tactical-map/sessions/:id          Get session detail
 *   POST   /api/tactical-map/sessions              Create / upload a replay session
 *   PUT    /api/tactical-map/sessions/:id          Update session metadata
 *   DELETE /api/tactical-map/sessions/:id          Delete a replay session
 *   GET    /api/replay/sessions                    (alias) List sessions
 *   GET    /api/replay/sessions/:id                (alias) Get session detail
 *   POST   /api/replay/sessions                    (alias) Create session
 *   PUT    /api/replay/sessions/:id                (alias) Update session
 *   DELETE /api/replay/sessions/:id                (alias) Delete session
 *   GET    /api/replay/events                      Query events across sessions
 *   GET    /api/replay/explain                     Replay-only route/verdict explanation
 *   GET    /api/replay/control-health              Aggregated authority health metrics
 *
 * Storage layout (dataDir):
 *   data/replay/sessions.json            (index)
 *   data/replay/sessions/<id>.json       (session detail)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ReplayCapturedStore, ReplaySessionListResponse, ReplaySessionMeta } from '../types.js';
import { auditLog } from '../middleware/audit-log.js';
import { isPathInsideRoot } from '../path-containment.js';

export interface TacticalMapReplayDeps {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage, opts?: { maxBytes?: number }) => Promise<string>;
  clampInt: (n: string | number | null, lo: number, hi: number, dflt: number) => number;
}

type ReplayIndex = {
  updatedAt?: string;
  sessions: ReplaySessionMeta[];
};

const SESSION_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;
const STORE_SET = new Set<ReplayCapturedStore>(['map', 'economy', 'health']);
const MAX_BODY_BYTES = 16 * 1024 * 1024; // 16 MiB
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 64;
const MAX_NAME_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 2048;
const AUTHORITY_EVENT_PATTERN = /(route|verdict|arbit|contract|gate|authority)/i;

type AuthorityReplayEvent = {
  sessionId: string;
  ts: number;
  type: string;
  missionId: string | null;
  summary: string;
  raw: unknown;
};

function isSafeSessionId(id: string): boolean {
  return SESSION_ID_PATTERN.test(id);
}

function generateSessionId(): string {
  return `replay-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

export function normalizeSession(raw: Partial<ReplaySessionMeta>): ReplaySessionMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;

  const id = raw.id.trim();
  const startedAt = typeof raw.startedAt === 'number' ? raw.startedAt : 0;
  const endedAt = typeof raw.endedAt === 'number' ? raw.endedAt : null;
  const durationMs =
    typeof raw.durationMs === 'number'
      ? raw.durationMs
      : endedAt !== null && startedAt > 0
        ? Math.max(0, endedAt - startedAt)
        : 0;
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim().substring(0, MAX_TAG_LENGTH))
        .slice(0, MAX_TAGS)
    : [];
  const capturedStores = Array.isArray(raw.capturedStores)
    ? raw.capturedStores.filter((s): s is ReplayCapturedStore => STORE_SET.has(s))
    : [];

  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().substring(0, MAX_NAME_LENGTH)
      : `Session ${id.substring(0, 8)}`,
    description: typeof raw.description === 'string'
      ? raw.description.substring(0, MAX_DESCRIPTION_LENGTH)
      : undefined,
    startedAt,
    endedAt,
    durationMs,
    eventCount: typeof raw.eventCount === 'number' ? raw.eventCount : 0,
    checkpointCount: typeof raw.checkpointCount === 'number' ? raw.checkpointCount : 0,
    chunkCount: typeof raw.chunkCount === 'number' ? raw.chunkCount : 0,
    compressedBytes: typeof raw.compressedBytes === 'number' ? raw.compressedBytes : 0,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
    tags,
    capturedStores,
  };
}

function ensureReplayDirs(dataDir: string): void {
  const replayDir = path.join(dataDir, 'replay');
  const sessionsDir = path.join(replayDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
}

function readIndex(indexPath: string): ReplayIndex {
  if (!fs.existsSync(indexPath)) return { sessions: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as Partial<ReplayIndex>;
    const sessions: ReplaySessionMeta[] = Array.isArray(raw.sessions)
      ? raw.sessions
          .map((s) => normalizeSession(s as Partial<ReplaySessionMeta>))
          .filter((s): s is ReplaySessionMeta => !!s)
      : [];
    return { updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined, sessions };
  } catch {
    return { sessions: [] };
  }
}

function writeIndex(indexPath: string, index: ReplayIndex): void {
  const dir = path.dirname(indexPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function filterSessions(
  sessions: ReplaySessionMeta[],
  opts: { tags?: string[]; startAfter?: number | null; startBefore?: number | null },
): ReplaySessionMeta[] {
  let out = sessions.slice();

  if (opts.tags && opts.tags.length > 0) {
    const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
    out = out.filter((s) => (s.tags ?? []).some((t) => tagSet.has(t.toLowerCase())));
  }

  if (typeof opts.startAfter === 'number') {
    out = out.filter((s) => s.startedAt >= opts.startAfter!);
  }
  if (typeof opts.startBefore === 'number') {
    out = out.filter((s) => s.startedAt <= opts.startBefore!);
  }

  return out;
}

function sortSessions(sessions: ReplaySessionMeta[], sortParam: string | null): ReplaySessionMeta[] {
  const value = sortParam ?? 'startedAt:desc';
  const [fieldRaw, dirRaw] = value.split(':');
  const field = fieldRaw?.trim() || 'startedAt';
  const dir = (dirRaw ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;

  const accessor: (s: ReplaySessionMeta) => string | number =
    field === 'endedAt'
      ? (s) => s.endedAt ?? 0
      : field === 'name'
        ? (s) => s.name ?? ''
        : (s) => s.startedAt ?? 0;

  return sessions.slice().sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
    return (Number(av) - Number(bv)) * dir;
  });
}

function sessionFilePath(baseDir: string, sessionId: string): string {
  const sessionsDir = path.join(baseDir, 'replay', 'sessions');
  const resolved = path.resolve(path.join(sessionsDir, `${sessionId}.json`));
  const root = path.resolve(sessionsDir);
  if (!isPathInsideRoot(root, resolved)) return '';
  return resolved;
}

function parseEventTs(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const numeric = Number(v);
    if (Number.isFinite(numeric)) return Math.trunc(numeric);
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return fallback;
}

function asEventSummary(type: string, raw: Record<string, unknown>): string {
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (message) return message.slice(0, 240);
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  const winnerAgent = typeof raw.winnerAgentId === 'string' ? raw.winnerAgentId.trim() : '';
  const winnerCandidate = typeof raw.winnerCandidateId === 'string' ? raw.winnerCandidateId.trim() : '';
  const detailBits = [
    reason ? `reason=${reason}` : '',
    winnerAgent ? `winnerAgent=${winnerAgent}` : '',
    winnerCandidate ? `winnerCandidate=${winnerCandidate}` : '',
  ].filter(Boolean);
  if (detailBits.length > 0) return `${type}: ${detailBits.join(', ')}`.slice(0, 240);
  return type.slice(0, 240);
}

function extractAuthorityEvents(sessionId: string, events: unknown[]): AuthorityReplayEvent[] {
  const out: AuthorityReplayEvent[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const raw = events[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type.trim() : '';
    if (!type || !AUTHORITY_EVENT_PATTERN.test(type)) continue;
    const details = obj.details && typeof obj.details === 'object' && !Array.isArray(obj.details)
      ? (obj.details as Record<string, unknown>)
      : obj;
    const missionId = typeof obj.missionId === 'string'
      ? obj.missionId
      : typeof details.missionId === 'string'
        ? details.missionId
        : null;
    out.push({
      sessionId,
      ts: parseEventTs(obj.ts ?? obj.timestamp, i),
      type,
      missionId,
      summary: asEventSummary(type, details),
      raw,
    });
  }
  return out;
}

function buildReplayExplanation(timeline: AuthorityReplayEvent[]): string {
  if (timeline.length === 0) {
    return 'No authority timeline events were found in this replay session.';
  }
  let route: AuthorityReplayEvent | undefined;
  let verdict: AuthorityReplayEvent | undefined;
  let arbitration: AuthorityReplayEvent | undefined;
  for (let i = timeline.length - 1; i >= 0 && (!route || !verdict || !arbitration); i -= 1) {
    const e = timeline[i];
    if (!route && /route/i.test(e.type)) {
      route = e;
      continue;
    }
    if (!verdict && /verdict/i.test(e.type)) {
      verdict = e;
      continue;
    }
    if (!arbitration && /arbit/i.test(e.type)) {
      arbitration = e;
    }
  }

  const lines: string[] = [];
  if (route) lines.push(`Route event: ${route.summary}`);
  if (verdict) lines.push(`Verdict event: ${verdict.summary}`);
  if (arbitration) lines.push(`Arbitration event: ${arbitration.summary}`);
  if (!lines.length) lines.push(`Authority timeline contains ${timeline.length} event(s) with no route/verdict/arbitration markers.`);
  return lines.join(' ');
}

function summarizeControlHealth(authorityEvents: AuthorityReplayEvent[]) {
  const counts = {
    routeDecisions: 0,
    verdicts: 0,
    arbitrationAccepted: 0,
    arbitrationRejected: 0,
    contractFailures: 0,
  };

  for (const ev of authorityEvents) {
    if (/route/i.test(ev.type)) counts.routeDecisions += 1;
    if (/verdict/i.test(ev.type)) counts.verdicts += 1;
    if (/arbit/i.test(ev.type) && /accept/i.test(ev.type)) counts.arbitrationAccepted += 1;
    if (/arbit/i.test(ev.type) && /reject|den(y|ied)|block/i.test(ev.type)) counts.arbitrationRejected += 1;
    if (/contract|gate/i.test(ev.type) && /fail|reject|deny|block/i.test(ev.type)) counts.contractFailures += 1;
  }

  const arbitrationTotal = counts.arbitrationAccepted + counts.arbitrationRejected;
  const arbitrationResolutionRate = arbitrationTotal > 0
    ? Number((counts.arbitrationAccepted / arbitrationTotal).toFixed(3))
    : null;

  const incidents = authorityEvents
    .filter((e) => /reject|deny|block|fail/i.test(e.type))
    .slice(-20)
    .map((e) => ({
      sessionId: e.sessionId,
      ts: e.ts,
      type: e.type,
      summary: e.summary,
      missionId: e.missionId,
    }));

  const status = counts.contractFailures > 0 || counts.arbitrationRejected > counts.arbitrationAccepted
    ? 'at-risk'
    : counts.arbitrationRejected > 0
      ? 'degraded'
      : 'healthy';

  return {
    status,
    counts,
    arbitrationResolutionRate,
    incidents,
    evaluatedEventCount: authorityEvents.length,
  };
}

/** Result of parsing a session request body. */
interface ParseSuccess { ok: true; data: Record<string, unknown> }
interface ParseFailure { ok: false; error: string }
type ParseResult = ParseSuccess | ParseFailure;

/**
 * Validate and parse a JSON request body for session creation/update.
 */
function parseSessionBody(raw: string): ParseResult {
  if (!raw || !raw.trim()) {
    return { ok: false, error: 'Request body is empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON in request body' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  return { ok: true, data: parsed as Record<string, unknown> };
}

/**
 * Handle tactical map replay/session endpoints.
 */
export async function handleTacticalMapReplay(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TacticalMapReplayDeps,
): Promise<boolean> {
  if (!req.url) return false;

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  const indexPath = path.join(deps.dataDir, 'replay', 'sessions.json');

  const sendBadRequest = (error: string) => {
    deps.sendJson(res, { ok: false, error }, 400);
  };

  const sendNotFound = (error = 'Not found') => {
    deps.sendJson(res, { ok: false, error }, 404);
  };

  const sendConflict = (error: string) => {
    deps.sendJson(res, { ok: false, error }, 409);
  };

  const readSessionDetail = (sessionId: string): Record<string, unknown> | null => {
    if (!isSafeSessionId(sessionId)) return null;
    const filePath = sessionFilePath(deps.dataDir, sessionId);
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const detail = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      return detail && typeof detail === 'object' && !Array.isArray(detail)
        ? (detail as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  // ── GET /api/tactical-map/sessions or /api/replay/sessions ─────────────
  if (req.method === 'GET' && (pathname === '/api/tactical-map/sessions' || pathname === '/api/replay/sessions')) {
    const page = deps.clampInt(url.searchParams.get('page'), 1, 10_000, 1);
    const pageSize = deps.clampInt(url.searchParams.get('pageSize'), 1, 100, 20);

    const tags = (url.searchParams.get('tags') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const startAfterRaw = url.searchParams.get('startAfter');
    const startBeforeRaw = url.searchParams.get('startBefore');

    const startAfter = startAfterRaw ? Number(startAfterRaw) : null;
    const startBefore = startBeforeRaw ? Number(startBeforeRaw) : null;

    const index = readIndex(indexPath);
    let sessions = filterSessions(index.sessions, {
      tags: tags.length ? tags : undefined,
      startAfter: Number.isFinite(startAfter as number) ? startAfter : null,
      startBefore: Number.isFinite(startBefore as number) ? startBefore : null,
    });
    sessions = sortSessions(sessions, url.searchParams.get('sort'));

    const totalCount = sessions.length;
    const start = (page - 1) * pageSize;
    const pageItems = sessions.slice(start, start + pageSize);

    auditLog('replay_list', req, {
      sessionId: 'list',
      fromTs: Number.isFinite(startAfter as number) ? (startAfter as number) : 0,
      toTs: Number.isFinite(startBefore as number) ? (startBefore as number) : 0,
      resultCount: pageItems.length,
    });

    const body: ReplaySessionListResponse = {
      sessions: pageItems,
      totalCount,
      pageSize,
      page,
    };

    deps.sendJson(res, { ok: true, ...body, updatedAt: index.updatedAt ?? new Date().toISOString() });
    return true;
  }

  // ── GET /api/tactical-map/sessions/:id or /api/replay/sessions/:id ─────
  {
    const match = pathname.match(/^\/api\/(?:tactical-map|replay)\/sessions\/([^/]+)$/);
    if (req.method === 'GET' && match) {
      const id = decodeURIComponent(match[1]);
      if (!isSafeSessionId(id)) return sendBadRequest('Invalid session id'), true;

      const index = readIndex(indexPath);
      const summary = index.sessions.find((s) => s.id === id) ?? null;
      const filePath = sessionFilePath(deps.dataDir, id);

      let payload: Record<string, unknown> | null = null;
      if (filePath && fs.existsSync(filePath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
          payload = raw && typeof raw === 'object' ? raw : null;
        } catch {
          payload = null;
        }
      }

      if (!payload && !summary) return sendNotFound('Replay session not found'), true;

      let session: ReplaySessionMeta | null = null;
      if (payload) {
        if (payload.session && typeof payload.session === 'object') {
          session = normalizeSession(payload.session as Partial<ReplaySessionMeta>);
        } else {
          session = normalizeSession(payload as Partial<ReplaySessionMeta>);
        }
      }
      if (!session && summary) session = summary;
      if (!session) return sendNotFound('Replay session not found'), true;

      auditLog('replay_read', req, {
        sessionId: id,
        fromTs: 0,
        toTs: 0,
        resultCount: session.eventCount ?? 0,
      });

      deps.sendJson(res, { ok: true, session: payload ?? session });
      return true;
    }
  }

  // ── POST /api/tactical-map/sessions or /api/replay/sessions ────────────
  // Create a new replay session (or upload an existing one).
  if (req.method === 'POST' && (pathname === '/api/tactical-map/sessions' || pathname === '/api/replay/sessions')) {
    let rawBody: string;
    try {
      rawBody = await deps.readRequestBody(req, { maxBytes: MAX_BODY_BYTES });
    } catch (err) {
      return sendBadRequest('Request body too large or unreadable'), true;
    }

    const parsed = parseSessionBody(rawBody);
    if (!parsed.ok) {
      return sendBadRequest(parsed.error), true;
    }

    const data = parsed.data;

    // Allow client to supply an id or generate one
    const suppliedId = typeof data.id === 'string' && data.id.trim() ? data.id.trim() : null;
    const sessionId = suppliedId ?? generateSessionId();

    if (!isSafeSessionId(sessionId)) {
      return sendBadRequest('Invalid session id format. Must match [a-zA-Z0-9._-]{1,128}'), true;
    }

    // Check for duplicate
    const index = readIndex(indexPath);
    if (index.sessions.some((s) => s.id === sessionId)) {
      return sendConflict(`Replay session '${sessionId}' already exists`), true;
    }

    // Build normalized session metadata
    const sessionData: Partial<ReplaySessionMeta> = {
      id: sessionId,
      name: typeof data.name === 'string' ? data.name : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
      endedAt: typeof data.endedAt === 'number' ? data.endedAt : null,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
      eventCount: typeof data.eventCount === 'number' ? data.eventCount : 0,
      checkpointCount: typeof data.checkpointCount === 'number' ? data.checkpointCount : 0,
      chunkCount: typeof data.chunkCount === 'number' ? data.chunkCount : 0,
      compressedBytes: typeof data.compressedBytes === 'number' ? data.compressedBytes : 0,
      schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : 1,
      tags: Array.isArray(data.tags) ? data.tags : [],
      capturedStores: Array.isArray(data.capturedStores) ? data.capturedStores : [],
    };

    const session = normalizeSession(sessionData);
    if (!session) {
      return sendBadRequest('Could not construct valid session from provided data'), true;
    }

    // Persist
    ensureReplayDirs(deps.dataDir);

    // Write session detail file (includes any extra fields from the upload)
    const detailPath = sessionFilePath(deps.dataDir, sessionId);
    if (detailPath) {
      const detailPayload = { ...data, id: sessionId };
      fs.writeFileSync(detailPath, JSON.stringify(detailPayload, null, 2));
    }

    // Update index
    index.sessions.push(session);
    index.updatedAt = new Date().toISOString();
    writeIndex(indexPath, index);

    auditLog('replay_create', req, {
      sessionId,
      fromTs: 0,
      toTs: 0,
      resultCount: 1,
    });

    deps.sendJson(res, { ok: true, session, created: true }, 201);
    return true;
  }

  // ── PUT /api/tactical-map/sessions/:id or /api/replay/sessions/:id ─────
  // Update session metadata (partial update — only supplied fields are changed).
  {
    const match = pathname.match(/^\/api\/(?:tactical-map|replay)\/sessions\/([^/]+)$/);
    if ((req.method === 'PUT' || req.method === 'PATCH') && match) {
      const id = decodeURIComponent(match[1]);
      if (!isSafeSessionId(id)) return sendBadRequest('Invalid session id'), true;

      let rawBody: string;
      try {
        rawBody = await deps.readRequestBody(req, { maxBytes: MAX_BODY_BYTES });
      } catch {
        return sendBadRequest('Request body too large or unreadable'), true;
      }

      const parsed = parseSessionBody(rawBody);
      if (!parsed.ok) {
        return sendBadRequest(parsed.error), true;
      }

      const updates = parsed.data;

      // Prevent id mutation
      if (updates.id !== undefined && updates.id !== id) {
        return sendBadRequest('Cannot change session id via update'), true;
      }

      const index = readIndex(indexPath);
      const existingIdx = index.sessions.findIndex((s) => s.id === id);
      if (existingIdx === -1) {
        return sendNotFound('Replay session not found'), true;
      }

      const existing = index.sessions[existingIdx];

      // Merge updates into existing session
      const merged: Partial<ReplaySessionMeta> = {
        ...existing,
        ...(typeof updates.name === 'string' ? { name: updates.name } : {}),
        ...(typeof updates.description === 'string' ? { description: updates.description } : {}),
        ...(typeof updates.startedAt === 'number' ? { startedAt: updates.startedAt } : {}),
        ...(typeof updates.endedAt === 'number' || updates.endedAt === null
          ? { endedAt: updates.endedAt as number | null }
          : {}),
        ...(typeof updates.durationMs === 'number' ? { durationMs: updates.durationMs } : {}),
        ...(typeof updates.eventCount === 'number' ? { eventCount: updates.eventCount } : {}),
        ...(typeof updates.checkpointCount === 'number' ? { checkpointCount: updates.checkpointCount } : {}),
        ...(typeof updates.chunkCount === 'number' ? { chunkCount: updates.chunkCount } : {}),
        ...(typeof updates.compressedBytes === 'number' ? { compressedBytes: updates.compressedBytes } : {}),
        ...(typeof updates.schemaVersion === 'number' ? { schemaVersion: updates.schemaVersion } : {}),
        ...(Array.isArray(updates.tags) ? { tags: updates.tags } : {}),
        ...(Array.isArray(updates.capturedStores) ? { capturedStores: updates.capturedStores } : {}),
        id, // ensure id never changes
      };

      const session = normalizeSession(merged);
      if (!session) {
        return sendBadRequest('Could not construct valid session from merged data'), true;
      }

      // Update index entry
      index.sessions[existingIdx] = session;
      index.updatedAt = new Date().toISOString();
      writeIndex(indexPath, index);

      // Update detail file if it exists
      ensureReplayDirs(deps.dataDir);
      const filePath = sessionFilePath(deps.dataDir, id);
      if (filePath) {
        let detailPayload: Record<string, unknown> = {};
        if (fs.existsSync(filePath)) {
          try {
            detailPayload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
          } catch {
            detailPayload = {};
          }
        }
        // Merge updates into detail payload
        Object.assign(detailPayload, updates, { id });
        fs.writeFileSync(filePath, JSON.stringify(detailPayload, null, 2));
      }

      auditLog('replay_update', req, {
        sessionId: id,
        fromTs: 0,
        toTs: 0,
        resultCount: 1,
      });

      deps.sendJson(res, { ok: true, session, updated: true });
      return true;
    }
  }

  // ── DELETE /api/tactical-map/sessions/:id or /api/replay/sessions/:id ──
  {
    const match = pathname.match(/^\/api\/(?:tactical-map|replay)\/sessions\/([^/]+)$/);
    if (req.method === 'DELETE' && match) {
      const id = decodeURIComponent(match[1]);
      if (!isSafeSessionId(id)) return sendBadRequest('Invalid session id'), true;

      const index = readIndex(indexPath);
      const existingIdx = index.sessions.findIndex((s) => s.id === id);
      if (existingIdx === -1) {
        return sendNotFound('Replay session not found'), true;
      }

      // Remove from index
      index.sessions.splice(existingIdx, 1);
      index.updatedAt = new Date().toISOString();
      writeIndex(indexPath, index);

      // Remove detail file if present
      const filePath = sessionFilePath(deps.dataDir, id);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Non-fatal: index already updated
        }
      }

      auditLog('replay_delete', req, {
        sessionId: id,
        fromTs: 0,
        toTs: 0,
        resultCount: 0,
      });

      deps.sendJson(res, { ok: true, deleted: true, id });
      return true;
    }
  }

  // ── GET /api/replay/events — query events across sessions ──────────────
  if (req.method === 'GET' && pathname === '/api/replay/events') {
    const sessionId = url.searchParams.get('sessionId') ?? null;
    const limit = deps.clampInt(url.searchParams.get('limit'), 1, 1000, 100);
    const offset = deps.clampInt(url.searchParams.get('offset'), 0, 100_000, 0);

    if (!sessionId) {
      return sendBadRequest('sessionId query parameter is required'), true;
    }

    if (!isSafeSessionId(sessionId)) {
      return sendBadRequest('Invalid session id'), true;
    }

    // Look for the session detail file which may contain events
    const filePath = sessionFilePath(deps.dataDir, sessionId);
    if (!filePath || !fs.existsSync(filePath)) {
      return sendNotFound('Replay session not found'), true;
    }

    let detail: Record<string, unknown>;
    try {
      detail = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    } catch {
      return sendNotFound('Replay session data is corrupt'), true;
    }

    // Events may be stored as `events` array in the detail file
    const allEvents = Array.isArray(detail.events) ? detail.events : [];
    const sliced = allEvents.slice(offset, offset + limit);

    auditLog('replay_events', req, {
      sessionId,
      fromTs: 0,
      toTs: 0,
      resultCount: sliced.length,
    });

    deps.sendJson(res, {
      ok: true,
      sessionId,
      events: sliced,
      totalCount: allEvents.length,
      limit,
      offset,
    });
    return true;
  }

  // ── GET /api/replay/explain — replay-only route/verdict explanation ────
  if (req.method === 'GET' && pathname === '/api/replay/explain') {
    const sessionId = url.searchParams.get('sessionId') ?? null;
    const limit = deps.clampInt(url.searchParams.get('limit'), 1, 1000, 200);
    const offset = deps.clampInt(url.searchParams.get('offset'), 0, 100_000, 0);

    if (!sessionId) {
      return sendBadRequest('sessionId query parameter is required'), true;
    }
    const detail = readSessionDetail(sessionId);
    if (!detail) {
      return sendNotFound('Replay session not found'), true;
    }

    const allEvents = Array.isArray(detail.events) ? detail.events : [];
    const authorityEvents = extractAuthorityEvents(sessionId, allEvents)
      .sort((a, b) => a.ts - b.ts);
    const sliced = authorityEvents.slice(offset, offset + limit);
    const explanation = buildReplayExplanation(authorityEvents);

    auditLog('replay_explain', req, {
      sessionId,
      fromTs: sliced[0]?.ts ?? 0,
      toTs: sliced[sliced.length - 1]?.ts ?? 0,
      resultCount: sliced.length,
    });

    deps.sendJson(res, {
      ok: true,
      sessionId,
      explanation,
      timeline: sliced,
      totalCount: authorityEvents.length,
      limit,
      offset,
    });
    return true;
  }

  // ── GET /api/replay/control-health — authority disagreement visibility ──
  if (req.method === 'GET' && pathname === '/api/replay/control-health') {
    const sessionId = url.searchParams.get('sessionId')?.trim() || null;
    const sessionLimit = deps.clampInt(url.searchParams.get('sessionLimit'), 1, 200, 20);

    const authorityEvents: AuthorityReplayEvent[] = [];
    const sessionIds: string[] = [];
    if (sessionId) {
      const detail = readSessionDetail(sessionId);
      if (!detail) {
        return sendNotFound('Replay session not found'), true;
      }
      const allEvents = Array.isArray(detail.events) ? detail.events : [];
      authorityEvents.push(...extractAuthorityEvents(sessionId, allEvents));
      sessionIds.push(sessionId);
    } else {
      const index = readIndex(indexPath);
      const selected = index.sessions
        .slice()
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, sessionLimit);
      for (const session of selected) {
        const detail = readSessionDetail(session.id);
        if (!detail) continue;
        const allEvents = Array.isArray(detail.events) ? detail.events : [];
        authorityEvents.push(...extractAuthorityEvents(session.id, allEvents));
        sessionIds.push(session.id);
      }
    }

    if (!sessionId && sessionIds.length === 0) {
      auditLog('replay_control_health', req, {
        sessionId: 'multi',
        fromTs: 0,
        toTs: 0,
        resultCount: 0,
      });
      deps.sendJson(res, {
        ok: true,
        scope: 'recent-sessions',
        sessionIds,
        health: null,
        status: 'no-data',
        message: 'No replay sessions are available to compute control health.',
        updatedAt: Date.now(),
      });
      return true;
    }

    const health = summarizeControlHealth(authorityEvents.sort((a, b) => a.ts - b.ts));
    auditLog('replay_control_health', req, {
      sessionId: sessionId ?? 'multi',
      fromTs: 0,
      toTs: 0,
      resultCount: health.evaluatedEventCount,
    });

    deps.sendJson(res, {
      ok: true,
      scope: sessionId ? 'session' : 'recent-sessions',
      sessionIds,
      health,
      updatedAt: Date.now(),
    });
    return true;
  }

  // ── GET /api/replay/:timestamp (legacy timestamp replay) ───────────────
  if (req.method === 'GET' && /^\/api\/replay\/\d+$/.test(pathname)) {
    const tsStr = pathname.split('/').pop();
    const ts = parseInt(tsStr ?? '', 10);

    if (!Number.isFinite(ts)) {
      return sendBadRequest('Invalid timestamp'), true;
    }

    // Find the session that contains this timestamp
    const index = readIndex(indexPath);
    const session = index.sessions.find(
      (s) => s.startedAt <= ts && (s.endedAt === null || s.endedAt >= ts),
    );

    if (!session) {
      return sendNotFound('No replay session covers this timestamp'), true;
    }

    auditLog('replay_timestamp', req, {
      sessionId: session.id,
      fromTs: ts,
      toTs: ts,
      resultCount: 1,
    });

    deps.sendJson(res, { ok: true, session, timestamp: ts });
    return true;
  }

  // ── Catch-all for unmatched /api/replay/* paths ────────────────────────
  if (pathname.startsWith('/api/replay/') && !pathname.startsWith('/api/replay/sessions')) {
    auditLog('replay_unknown', req, { sessionId: 'unknown', fromTs: 0, toTs: 0, resultCount: 0 });
    deps.sendJson(res, { ok: false, error: 'Replay endpoint not found' }, 404);
    return true;
  }

  // ── Method not allowed for /api/tactical-map/sessions/* ────────────────
  if (pathname.startsWith('/api/tactical-map/sessions')) {
    deps.sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
    return true;
  }

  return false;
}
