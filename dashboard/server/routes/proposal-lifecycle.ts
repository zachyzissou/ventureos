/**
 * Proposal → Mission → Step lifecycle API routes (Issue #227).
 */

import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

import {
  getProposalLifecycleEngine,
  type MissionStatus,
  type ProposalStatus,
} from '../proposal-lifecycle.js';

export interface ProposalLifecycleRouteDeps {
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  readRequestBody: (req: IncomingMessage, opts?: { maxBytes?: number }) => Promise<string>;
  isAuthenticated?: (req: IncomingMessage) => boolean;
}

function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '', 'http://localhost');
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function sanitize(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function parseLimit(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function asProposalStatus(raw: string | null): ProposalStatus | undefined {
  const value = sanitize(raw).toLowerCase();
  if (value === 'pending' || value === 'approved' || value === 'rejected' || value === 'needs_changes') {
    return value;
  }
  return undefined;
}

function asMissionStatus(raw: string | null): MissionStatus | undefined {
  const value = sanitize(raw).toLowerCase();
  if (value === 'pending' || value === 'running' || value === 'completed' || value === 'failed' || value === 'blocked') {
    return value;
  }
  return undefined;
}

function wsFrameFromJson(payload: unknown): Buffer {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const len = data.length;

  if (len < 126) {
    const out = Buffer.allocUnsafe(2 + len);
    out[0] = 0x81;
    out[1] = len;
    data.copy(out, 2);
    return out;
  }

  if (len < 65536) {
    const out = Buffer.allocUnsafe(4 + len);
    out[0] = 0x81;
    out[1] = 126;
    out.writeUInt16BE(len, 2);
    data.copy(out, 4);
    return out;
  }

  const out = Buffer.allocUnsafe(10 + len);
  out[0] = 0x81;
  out[1] = 127;
  out.writeUInt32BE(0, 2);
  out.writeUInt32BE(len, 6);
  data.copy(out, 10);
  return out;
}

function writeUpgradeError(socket: Socket, status: number, message: string): void {
  const body = JSON.stringify({ ok: false, error: message });
  socket.write(
    `HTTP/1.1 ${status} Error\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      body,
  );
  socket.destroy();
}

export async function handleProposalLifecycle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ProposalLifecycleRouteDeps,
): Promise<boolean> {
  if (!req.url || !req.url.startsWith('/api/proposal-lifecycle')) return false;
  const url = parseUrl(req);
  if (!url) {
    deps.sendJson(res, { ok: false, error: 'Bad request URL' }, 400);
    return true;
  }
  const engine = getProposalLifecycleEngine(deps.dataDir);
  const method = req.method ?? 'GET';
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/proposal-lifecycle/summary') {
    deps.sendJson(res, { ok: true, summary: engine.getSummary() });
    return true;
  }

  if (method === 'GET' && pathname === '/api/proposal-lifecycle/proposals') {
    const status = asProposalStatus(url.searchParams.get('status'));
    const limit = parseLimit(url.searchParams.get('limit'), 50, 1, 500);
    deps.sendJson(res, { ok: true, proposals: engine.listProposals({ status, limit }) });
    return true;
  }

  if (method === 'POST' && pathname === '/api/proposal-lifecycle/proposals') {
    const payload = parseJson<{
      title?: string;
      goal?: string;
      submittedByAgentId?: string;
      estimatedCostUsd?: number;
      requiredSkills?: string[];
      riskAssessment?: {
        level?: string;
        summary?: string;
        mitigations?: string[];
      };
      steps?: Array<{
        stepId?: string;
        title?: string;
        description?: string;
        agentId?: string;
        dependsOnStepIds?: string[];
        expectedOutcome?: string;
        simulateFailure?: boolean;
      }>;
    }>(await deps.readRequestBody(req, { maxBytes: 262_144 })) ?? {};

    try {
      const proposal = engine.submitProposal({
        title: sanitize(payload.title),
        goal: sanitize(payload.goal),
        submittedByAgentId: sanitize(payload.submittedByAgentId) || 'agent',
        estimatedCostUsd: Number(payload.estimatedCostUsd ?? 0),
        requiredSkills: Array.isArray(payload.requiredSkills) ? payload.requiredSkills : [],
        riskAssessment: {
          level: sanitize(payload.riskAssessment?.level) as 'low' | 'medium' | 'high' | 'critical',
          summary: sanitize(payload.riskAssessment?.summary),
          mitigations: Array.isArray(payload.riskAssessment?.mitigations) ? payload.riskAssessment.mitigations : [],
        },
        steps: Array.isArray(payload.steps)
          ? payload.steps.map((step) => ({
            stepId: sanitize(step.stepId) || undefined,
            title: sanitize(step.title),
            description: sanitize(step.description),
            agentId: sanitize(step.agentId) || 'agent',
            dependsOnStepIds: Array.isArray(step.dependsOnStepIds) ? step.dependsOnStepIds : [],
            expectedOutcome: sanitize(step.expectedOutcome) || undefined,
            simulateFailure: step.simulateFailure === true,
          }))
          : [],
      });
      deps.sendJson(res, { ok: true, proposal }, 201);
      return true;
    } catch (err: unknown) {
      deps.sendJson(res, { ok: false, error: err instanceof Error ? err.message : 'Failed to submit proposal' }, 400);
      return true;
    }
  }

  if (method === 'POST' && pathname.startsWith('/api/proposal-lifecycle/proposals/') && pathname.endsWith('/review')) {
    const proposalId = sanitize(pathname.split('/api/proposal-lifecycle/proposals/')[1]?.replace('/review', ''));
    if (!proposalId) {
      deps.sendJson(res, { ok: false, error: 'proposalId is required' }, 400);
      return true;
    }
    const payload = parseJson<{
      action?: 'approve' | 'reject' | 'modify';
      reviewerId?: string;
      notes?: string;
      autoStart?: boolean;
      modifications?: {
        title?: string;
        goal?: string;
        estimatedCostUsd?: number;
        requiredSkills?: string[];
        riskAssessment?: {
          level?: string;
          summary?: string;
          mitigations?: string[];
        };
        steps?: Array<{
          stepId?: string;
          title?: string;
          description?: string;
          agentId?: string;
          dependsOnStepIds?: string[];
          expectedOutcome?: string;
          simulateFailure?: boolean;
        }>;
      };
    }>(await deps.readRequestBody(req, { maxBytes: 262_144 })) ?? {};
    try {
      const result = engine.reviewProposal(proposalId, {
        action: (sanitize(payload.action) || 'modify') as 'approve' | 'reject' | 'modify',
        reviewerId: sanitize(payload.reviewerId) || 'human',
        notes: sanitize(payload.notes) || undefined,
        autoStart: payload.autoStart !== false,
        modifications: payload.modifications
          ? {
            title: sanitize(payload.modifications.title) || undefined,
            goal: sanitize(payload.modifications.goal) || undefined,
            estimatedCostUsd: payload.modifications.estimatedCostUsd,
            requiredSkills: Array.isArray(payload.modifications.requiredSkills)
              ? payload.modifications.requiredSkills
              : undefined,
            riskAssessment: payload.modifications.riskAssessment
              ? {
                level: sanitize(payload.modifications.riskAssessment.level) as 'low' | 'medium' | 'high' | 'critical',
                summary: sanitize(payload.modifications.riskAssessment.summary) || undefined,
                mitigations: Array.isArray(payload.modifications.riskAssessment.mitigations)
                  ? payload.modifications.riskAssessment.mitigations
                  : undefined,
              }
              : undefined,
            steps: Array.isArray(payload.modifications.steps)
              ? payload.modifications.steps.map((step) => ({
                stepId: sanitize(step.stepId) || undefined,
                title: sanitize(step.title),
                description: sanitize(step.description),
                agentId: sanitize(step.agentId) || 'agent',
                dependsOnStepIds: Array.isArray(step.dependsOnStepIds) ? step.dependsOnStepIds : [],
                expectedOutcome: sanitize(step.expectedOutcome) || undefined,
                simulateFailure: step.simulateFailure === true,
              }))
              : undefined,
          }
          : undefined,
      });
      deps.sendJson(res, { ok: true, proposal: result.proposal, mission: result.mission });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to review proposal';
      const status = /not found/i.test(message) ? 404 : 400;
      deps.sendJson(res, { ok: false, error: message }, status);
      return true;
    }
  }

  if (method === 'GET' && pathname === '/api/proposal-lifecycle/missions') {
    const status = asMissionStatus(url.searchParams.get('status'));
    const limit = parseLimit(url.searchParams.get('limit'), 50, 1, 500);
    deps.sendJson(res, { ok: true, missions: engine.listMissions({ status, limit }) });
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/proposal-lifecycle/missions/')) {
    const missionId = sanitize(pathname.split('/api/proposal-lifecycle/missions/')[1]);
    if (!missionId) {
      deps.sendJson(res, { ok: false, error: 'missionId is required' }, 400);
      return true;
    }
    const mission = engine.getMission(missionId);
    if (!mission) {
      deps.sendJson(res, { ok: false, error: 'Mission not found' }, 404);
      return true;
    }
    deps.sendJson(res, { ok: true, mission });
    return true;
  }

  if (method === 'POST' && pathname.startsWith('/api/proposal-lifecycle/missions/') && pathname.endsWith('/start')) {
    const missionId = sanitize(pathname.split('/api/proposal-lifecycle/missions/')[1]?.replace('/start', ''));
    if (!missionId) {
      deps.sendJson(res, { ok: false, error: 'missionId is required' }, 400);
      return true;
    }

    try {
      const mission = engine.startMission({ missionId });
      deps.sendJson(res, { ok: true, mission });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start mission';
      const status = /not found/i.test(message) ? 404 : 400;
      deps.sendJson(res, { ok: false, error: message }, status);
      return true;
    }
  }

  if (method === 'GET' && pathname === '/api/proposal-lifecycle/events') {
    const missionId = sanitize(url.searchParams.get('missionId'));
    const proposalId = sanitize(url.searchParams.get('proposalId'));
    const limit = parseLimit(url.searchParams.get('limit'), 100, 1, 1000);
    deps.sendJson(res, {
      ok: true,
      events: engine.listEvents({
        missionId: missionId || undefined,
        proposalId: proposalId || undefined,
        limit,
      }),
    });
    return true;
  }

  if (method === 'GET' && pathname === '/api/proposal-lifecycle/events/stream') {
    deps.sendJson(res, { ok: false, error: 'WebSocket upgrade required for stream endpoint' }, 426);
    return true;
  }

  deps.sendJson(res, { ok: false, error: 'Not found' }, 404);
  return true;
}

export function handleProposalLifecycleUpgrade(
  req: IncomingMessage,
  socket: Socket,
  _head: Buffer,
  deps: ProposalLifecycleRouteDeps,
): boolean {
  if (!req.url) return false;
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/proposal-lifecycle/events/stream') return false;

  if (deps.isAuthenticated && !deps.isAuthenticated(req)) {
    writeUpgradeError(socket, 401, 'Unauthorized');
    return true;
  }

  const upgrade = String(req.headers.upgrade ?? '').toLowerCase();
  const wsKey = String(req.headers['sec-websocket-key'] ?? '');
  if (upgrade !== 'websocket' || !wsKey) {
    writeUpgradeError(socket, 400, 'Invalid WebSocket upgrade request');
    return true;
  }

  const accept = crypto
    .createHash('sha1')
    .update(`${wsKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
  );

  const engine = getProposalLifecycleEngine(deps.dataDir);
  const send = (payload: unknown): void => {
    try {
      socket.write(wsFrameFromJson(payload));
    } catch {
      // socket closed
    }
  };

  send({ type: 'snapshot', summary: engine.getSummary() });
  const unsubscribe = engine.subscribe((event) => {
    send({ type: 'event', event });
  });
  const heartbeat = setInterval(() => send({ type: 'heartbeat', ts: Date.now() }), 15_000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    try {
      socket.end();
    } catch {
      // ignore
    }
  };

  socket.on('data', (buf: Buffer) => {
    if (buf.length > 0 && (buf[0] & 0x0f) === 0x08) cleanup();
  });
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
  return true;
}
