/**
 * Tactical Map Live Data Routes
 *
 * Provides read endpoints used by the tactical map client:
 * - GET /api/tactical-map/state
 * - GET /api/tactical-map/resources
 * - GET /api/tactical-map/health
 *
 * Also handles optional WebSocket upgrades for:
 * - /api/tactical-map/resources/stream
 * - /api/tactical-map/health/stream
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

const AGENT_IDS = [
  'oracle',
  'atlas',
  'sentinel',
  'verifier',
  'archivist',
  'synth',
  'echo',
  'nexus',
] as const;
type AgentId = (typeof AGENT_IDS)[number];

const CAPACITY: Record<AgentId, number> = {
  oracle: 3,
  atlas: 5,
  sentinel: 3,
  verifier: 4,
  archivist: 3,
  synth: 3,
  echo: 5,
  nexus: 5,
};

const DEFAULT_BUDGETS: Record<AgentId, number> = {
  oracle: 100_000,
  atlas: 100_000,
  sentinel: 100_000,
  verifier: 100_000,
  archivist: 100_000,
  synth: 100_000,
  echo: 100_000,
  nexus: 200_000,
};

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const RECENT_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const ECONOMY_WINDOW_MS = 24 * 60 * 60 * 1000;
const TOKEN_COST_USD_PER_TOKEN = 5 / 1_000_000; // $5 per 1M tokens

interface SessionIndexEntry {
  sessionId: string;
  label: string;
  updatedAt: number;
  createdAt: number;
  aborted: boolean;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

interface ControlStore {
  pausedAgents: Partial<Record<AgentId, boolean>>;
  budgets: Partial<Record<AgentId, number>>;
}

export interface TacticalMapLiveDeps {
  openclawDir: string;
  dataDir: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  isAuthenticated: (req: IncomingMessage) => boolean;
  primaryAgentId?: string;
  now?: () => Date;
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

function decodeLabel(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function sessionFile(openclawDir: string, agentId: string): string {
  return path.join(openclawDir, 'agents', agentId, 'sessions', 'sessions.json');
}

function listSessionEntries(openclawDir: string, agentId: string): SessionIndexEntry[] {
  const filePath = sessionFile(openclawDir, agentId);
  const index = safeReadJson<Record<string, Record<string, unknown>>>(filePath, {});

  const entries = Object.entries(index).map(([key, row]) => {
    const sessionId = typeof row.sessionId === 'string' && row.sessionId ? row.sessionId : key;
    const inputTokens = Math.max(0, parseNumber(row.inputTokens, 0));
    const outputTokens = Math.max(0, parseNumber(row.outputTokens, 0));
    const totalTokens = Math.max(
      0,
      parseNumber(row.totalTokens, inputTokens + outputTokens),
    );
    const totalCostUsd = Math.max(
      0,
      parseNumber(row.totalCostUsd, totalTokens * TOKEN_COST_USD_PER_TOKEN),
    );

    return {
      sessionId,
      label: decodeLabel(row.label, sessionId),
      updatedAt: parseNumber(row.updatedAt, 0),
      createdAt: parseNumber(row.createdAt, parseNumber(row.updatedAt, 0)),
      aborted: row.abortedLastRun === true,
      totalTokens,
      inputTokens,
      outputTokens,
      totalCostUsd,
    } satisfies SessionIndexEntry;
  });

  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries;
}

function readControlStore(dataDir: string): ControlStore {
  const storePath = path.join(dataDir, 'tactical-map-controls.json');
  const raw = safeReadJson<Record<string, unknown>>(storePath, {});
  const pausedAgents = (raw.pausedAgents ?? {}) as Partial<Record<AgentId, boolean>>;
  const budgets = (raw.budgets ?? {}) as Partial<Record<AgentId, number>>;
  return { pausedAgents, budgets };
}

function deriveBuildingState(
  activeCount: number,
  recentFailures: number,
  paused: boolean,
  capacity: number,
): 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR' {
  if (paused) return 'IDLE';
  if (recentFailures > 0) return 'ERROR';
  if (activeCount >= Math.max(1, Math.ceil(capacity * 0.8))) return 'OVERLOADED';
  if (activeCount > 0) return 'ACTIVE';
  return 'IDLE';
}

function withPrimaryFallback(
  entries: SessionIndexEntry[],
  agentId: AgentId,
  deps: TacticalMapLiveDeps,
): SessionIndexEntry[] {
  if (entries.length > 0) return entries;
  if (agentId !== 'nexus') return entries;
  const primary = (deps.primaryAgentId ?? '').trim().toLowerCase();
  if (!primary || !/^[a-z0-9._-]+$/.test(primary)) return entries;
  return listSessionEntries(deps.openclawDir, primary);
}

function buildMapState(deps: TacticalMapLiveDeps): {
  updatedAt: string;
  agents: Record<AgentId, {
    state: 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR';
    sessions: number;
    paused: boolean;
    activeSessions: Array<{ id: string; label: string; startedAt: string }>;
  }>;
} {
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const controls = readControlStore(deps.dataDir);
  const agents = {} as Record<AgentId, {
    state: 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR';
    sessions: number;
    paused: boolean;
    activeSessions: Array<{ id: string; label: string; startedAt: string }>;
  }>;

  for (const id of AGENT_IDS) {
    const paused = controls.pausedAgents[id] === true;
    const entries = withPrimaryFallback(listSessionEntries(deps.openclawDir, id), id, deps);
    const activeEntries = entries.filter((e) => nowMs - e.updatedAt <= ACTIVE_WINDOW_MS);
    const recentFailures = entries.filter(
      (e) => e.aborted && nowMs - e.updatedAt <= RECENT_FAILURE_WINDOW_MS,
    ).length;

    agents[id] = {
      state: deriveBuildingState(activeEntries.length, recentFailures, paused, CAPACITY[id]),
      sessions: activeEntries.length,
      paused,
      activeSessions: activeEntries.slice(0, 5).map((e) => ({
        id: e.sessionId,
        label: e.label,
        startedAt: new Date(Math.max(0, e.createdAt || e.updatedAt || nowMs)).toISOString(),
      })),
    };
  }

  return {
    updatedAt: new Date(nowMs).toISOString(),
    agents,
  };
}

function buildEconomySnapshot(deps: TacticalMapLiveDeps): {
  updatedAt: number;
  agents: Record<AgentId, {
    agentId: AgentId;
    tokenBudget: number;
    tokensUsed: number;
    tokensRemaining: number;
    usageRatio: number;
    quotaRemainingRatio: number;
    costUsd: number;
    burnRateUsdPerHour: number;
    updatedAt: number;
    history: Array<{ ts: number; tokensUsed: number; costUsd: number }>;
  }>;
  pool: {
    tokenQuotaTotal: number;
    tokenQuotaUsed: number;
    tokenQuotaRemaining: number;
    tokenQuotaRemainingRatio: number;
    costBudgetUsd: number;
    costUsedUsd: number;
    costRemainingUsd: number;
    costRemainingRatio: number;
    updatedAt: number;
  };
} {
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const controls = readControlStore(deps.dataDir);
  const agents = {} as Record<AgentId, {
    agentId: AgentId;
    tokenBudget: number;
    tokensUsed: number;
    tokensRemaining: number;
    usageRatio: number;
    quotaRemainingRatio: number;
    costUsd: number;
    burnRateUsdPerHour: number;
    updatedAt: number;
    history: Array<{ ts: number; tokensUsed: number; costUsd: number }>;
  }>;

  let poolBudget = 0;
  let poolUsed = 0;
  let poolCostUsed = 0;

  for (const id of AGENT_IDS) {
    const entries = withPrimaryFallback(listSessionEntries(deps.openclawDir, id), id, deps)
      .filter((e) => nowMs - e.updatedAt <= ECONOMY_WINDOW_MS);

    const tokenBudget = Math.max(
      1,
      parseNumber(controls.budgets[id], DEFAULT_BUDGETS[id]),
    );
    const tokensUsed = entries.reduce((sum, e) => sum + Math.max(0, e.totalTokens), 0);
    const costUsd = entries.reduce((sum, e) => sum + Math.max(0, e.totalCostUsd), 0);
    const tokensRemaining = Math.max(0, tokenBudget - tokensUsed);
    const usageRatio = tokenBudget > 0 ? clamp01(tokensUsed / tokenBudget) : 0;
    const quotaRemainingRatio = tokenBudget > 0 ? clamp01(tokensRemaining / tokenBudget) : 1;
    const burnRateUsdPerHour = costUsd / 24;
    const history = entries
      .slice()
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(-24)
      .map((e) => ({
        ts: e.updatedAt || nowMs,
        tokensUsed: e.totalTokens,
        costUsd: e.totalCostUsd,
      }));

    agents[id] = {
      agentId: id,
      tokenBudget,
      tokensUsed,
      tokensRemaining,
      usageRatio,
      quotaRemainingRatio,
      costUsd,
      burnRateUsdPerHour,
      updatedAt: nowMs,
      history,
    };

    poolBudget += tokenBudget;
    poolUsed += tokensUsed;
    poolCostUsed += costUsd;
  }

  const tokenQuotaRemaining = Math.max(0, poolBudget - poolUsed);
  const tokenQuotaRemainingRatio = poolBudget > 0 ? clamp01(tokenQuotaRemaining / poolBudget) : 1;
  const costBudgetUsd = poolBudget * TOKEN_COST_USD_PER_TOKEN;
  const costRemainingUsd = Math.max(0, costBudgetUsd - poolCostUsed);
  const costRemainingRatio = costBudgetUsd > 0 ? clamp01(costRemainingUsd / costBudgetUsd) : 1;

  return {
    updatedAt: nowMs,
    agents,
    pool: {
      tokenQuotaTotal: poolBudget,
      tokenQuotaUsed: poolUsed,
      tokenQuotaRemaining,
      tokenQuotaRemainingRatio,
      costBudgetUsd,
      costUsedUsd: poolCostUsed,
      costRemainingUsd,
      costRemainingRatio,
      updatedAt: nowMs,
    },
  };
}

function buildHealthSnapshot(deps: TacticalMapLiveDeps): {
  updatedAt: number;
  agents: Record<AgentId, {
    agentId: AgentId;
    status: 'green' | 'yellow' | 'red';
    connectivity: 'online' | 'offline' | 'degraded';
    cpuUsage: number;
    memoryUsage: number;
    latencyMs: number;
    requestsPerSec: number;
    errorRate: number;
    uptimeSec: number;
    lastCheckAt: number;
    consecutiveFailures: number;
    errorMessages: string[];
  }>;
  system: {
    overallStatus: 'green' | 'yellow' | 'red';
    aggregateMetrics: {
      cpuUsage: number;
      memoryUsage: number;
      latencyMs: number;
      requestsPerSec: number;
      errorRate: number;
      uptimeSec: number;
    };
  };
} {
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const agents = {} as Record<AgentId, {
    agentId: AgentId;
    status: 'green' | 'yellow' | 'red';
    connectivity: 'online' | 'offline' | 'degraded';
    cpuUsage: number;
    memoryUsage: number;
    latencyMs: number;
    requestsPerSec: number;
    errorRate: number;
    uptimeSec: number;
    lastCheckAt: number;
    consecutiveFailures: number;
    errorMessages: string[];
  }>;

  let redCount = 0;
  let yellowCount = 0;
  let cpuSum = 0;
  let memSum = 0;
  let latencySum = 0;
  let rpsSum = 0;
  let errorSum = 0;
  let uptimeSum = 0;

  for (const id of AGENT_IDS) {
    const agentDir = path.join(deps.openclawDir, 'agents', id);
    const agentExists = fs.existsSync(agentDir);
    const entries = withPrimaryFallback(listSessionEntries(deps.openclawDir, id), id, deps);
    const active = entries.filter((e) => nowMs - e.updatedAt <= ACTIVE_WINDOW_MS).length;
    const failures24h = entries.filter(
      (e) => e.aborted && nowMs - e.updatedAt <= ECONOMY_WINDOW_MS,
    ).length;
    const total24h = entries.filter((e) => nowMs - e.updatedAt <= ECONOMY_WINDOW_MS).length;
    const errorRate = total24h > 0 ? clamp01(failures24h / total24h) : 0;
    const capacity = CAPACITY[id];
    const cpuUsage = clamp01(active / Math.max(1, capacity));
    const memoryUsage = clamp01((active + Math.min(2, total24h / 10)) / Math.max(1, capacity));
    const latencyMs = active > 0 ? 220 + active * 90 : 120;
    const requestsPerSec = active * 0.4;
    const oldest = entries.length > 0 ? entries[entries.length - 1] : null;
    const uptimeSec = oldest ? Math.max(0, Math.floor((nowMs - oldest.createdAt) / 1000)) : 0;
    const consecutiveFailures = entries
      .slice(0, 10)
      .reduce((count, e) => (count === 0 && !e.aborted ? 0 : e.aborted ? count + 1 : count), 0);

    let status: 'green' | 'yellow' | 'red' = 'green';
    let connectivity: 'online' | 'offline' | 'degraded' = agentExists ? 'online' : 'offline';

    if (!agentExists) {
      status = 'red';
    } else if (errorRate >= 0.2 || consecutiveFailures >= 2) {
      status = 'red';
      connectivity = 'degraded';
    } else if (errorRate >= 0.05 || cpuUsage >= 0.8 || memoryUsage >= 0.8) {
      status = 'yellow';
      connectivity = 'degraded';
    }

    if (status === 'red') redCount++;
    else if (status === 'yellow') yellowCount++;

    cpuSum += cpuUsage;
    memSum += memoryUsage;
    latencySum += latencyMs;
    rpsSum += requestsPerSec;
    errorSum += errorRate;
    uptimeSum += uptimeSec;

    agents[id] = {
      agentId: id,
      status,
      connectivity,
      cpuUsage,
      memoryUsage,
      latencyMs,
      requestsPerSec,
      errorRate,
      uptimeSec,
      lastCheckAt: nowMs,
      consecutiveFailures,
      errorMessages: consecutiveFailures > 0 ? ['Recent aborted sessions detected'] : [],
    };
  }

  const count = AGENT_IDS.length;
  const overallStatus: 'green' | 'yellow' | 'red' =
    redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';

  return {
    updatedAt: nowMs,
    agents,
    system: {
      overallStatus,
      aggregateMetrics: {
        cpuUsage: cpuSum / count,
        memoryUsage: memSum / count,
        latencyMs: latencySum / count,
        requestsPerSec: rpsSum,
        errorRate: errorSum / count,
        uptimeSec: uptimeSum / count,
      },
    },
  };
}

function wsFrameFromJson(payload: unknown): Buffer {
  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const len = data.length;

  if (len < 126) {
    const out = Buffer.allocUnsafe(2 + len);
    out[0] = 0x81; // FIN + text
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
  out.writeUInt32BE(0, 2); // high 32 bits
  out.writeUInt32BE(len, 6); // low 32 bits
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

export function handleTacticalMapLive(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TacticalMapLiveDeps,
): boolean {
  if (!req.url) return false;
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/tactical-map/')) return false;

  if (req.method === 'GET' && pathname === '/api/tactical-map/state') {
    deps.sendJson(res, buildMapState(deps), 200);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/tactical-map/resources') {
    deps.sendJson(res, buildEconomySnapshot(deps), 200);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/tactical-map/health') {
    deps.sendJson(res, buildHealthSnapshot(deps), 200);
    return true;
  }

  if (
    req.method === 'GET' &&
    (pathname === '/api/tactical-map/resources/stream' || pathname === '/api/tactical-map/health/stream')
  ) {
    deps.sendJson(
      res,
      { ok: false, error: 'WebSocket upgrade required for stream endpoint' },
      426,
    );
    return true;
  }

  return false;
}

export function handleTacticalMapLiveUpgrade(
  req: IncomingMessage,
  socket: Socket,
  _head: Buffer,
  deps: TacticalMapLiveDeps,
): boolean {
  if (!req.url) return false;
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const isResources = pathname === '/api/tactical-map/resources/stream';
  const isHealth = pathname === '/api/tactical-map/health/stream';

  if (!isResources && !isHealth) return false;

  if (!deps.isAuthenticated(req)) {
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
    .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
  );

  const send = (payload: unknown): void => {
    try {
      socket.write(wsFrameFromJson(payload));
    } catch {
      // socket already closed
    }
  };

  const sendSnapshot = (): void => {
    if (isResources) send({ type: 'snapshot', snapshot: buildEconomySnapshot(deps) });
    if (isHealth) send({ type: 'snapshot', snapshot: buildHealthSnapshot(deps) });
  };

  sendSnapshot();
  const snapshotInterval = setInterval(sendSnapshot, 10_000);
  const heartbeatInterval = setInterval(() => send({ type: 'heartbeat', ts: Date.now() }), 15_000);

  const cleanup = () => {
    clearInterval(snapshotInterval);
    clearInterval(heartbeatInterval);
    try {
      socket.end();
    } catch {
      // ignore
    }
  };

  socket.on('data', (buf: Buffer) => {
    // Minimal close-frame handling.
    if (buf.length > 0 && (buf[0] & 0x0f) === 0x08) cleanup();
  });
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
  return true;
}
