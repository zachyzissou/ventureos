/**
 * Bridge API — Host-native proxy for dashboard data access (Issue #140).
 *
 * This service runs on the host and exposes a minimal, authenticated API
 * for the containerized dashboard. Endpoints are namespaced under
 * `/api/bridge/*` and MUST enforce token auth + CIDR allowlist.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { handleKpis } from './routes/kpis.js';
import { handleObservations } from './routes/observations.js';
import { handleAgentHealth } from './routes/agent-health.js';
import {
  normalizeIp,
  isAllowedIp,
  readBridgeToken,
  logBridgeAudit,
  parseRateLimits,
  rateLimitGroup,
  createRateLimiter,
  authorizeRequest,
} from './bridge-security.js';
import { createBridgeTelemetryBuilder, type BridgeLiveEvent, type BridgeTelemetrySnapshot } from './bridge-live-telemetry.js';
import {
  buildCostData,
  buildUsageWindows,
  buildTodayTokens,
  buildAvgResponseTime,
  buildLifetimeStats,
  buildSystemStats,
  trackDiskHistory,
  readHealthHistory,
} from './bridge-metrics.js';
import { createBridgeAggregationHelpers } from './bridge-aggregation-helpers.js';
import { getSchedulerJobs } from './scheduler-jobs.js';
import paths from '../../lib/paths.js';

const {
  VENTUREOS_ROOT,
  OPENCLAW_DIR,
  SHARED_CONTEXT_DIR: SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
  LOG_DIR,
  ACTIVE_WORK_PATH,
  PRIORITIES_PATH,
  agentSessionsDir,
  agentWorkspaceDir,
} = paths as typeof import('../../lib/paths.js');

const BRIDGE_PORT: number = parseInt(process.env.BRIDGE_PORT ?? '18790');
const BRIDGE_TOKEN_FILE: string =
  process.env.BRIDGE_TOKEN_FILE ?? path.join(OPENCLAW_DIR, 'bridge', 'bridge-token');
const BRIDGE_ALLOW_CIDRS: string =
  process.env.BRIDGE_ALLOW_CIDRS ?? '127.0.0.1/32,::1/128,192.168.65.0/24,172.17.0.0/16';
const BRIDGE_AUDIT_LOG: string =
  process.env.BRIDGE_AUDIT_LOG ?? path.join(LOG_DIR, 'bridge-access.jsonl');
const BRIDGE_RATE_LIMITS: string =
  process.env.BRIDGE_RATE_LIMITS ?? 'default=60/60s;expensive=10/60s;sse=4/60s';

const AGENT_ID: string = process.env.OPENCLAW_AGENT ?? 'main';
const WORKSPACE_DIR: string =
  process.env.WORKSPACE_DIR ??
  process.env.OPENCLAW_WORKSPACE ??
  agentWorkspaceDir(AGENT_ID);

const sessDir: string = agentSessionsDir(AGENT_ID);
const cronFile: string = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
const DATA_DIR: string = path.join(WORKSPACE_DIR, 'data');
const memoryDir: string = path.join(WORKSPACE_DIR, 'memory');
const memoryMdPath: string = path.join(WORKSPACE_DIR, 'MEMORY.md');
const heartbeatPath: string = path.join(WORKSPACE_DIR, 'HEARTBEAT.md');
const healthHistoryFile: string = path.join(DATA_DIR, 'health-history.json');
const VENTUREOS_AGENTS: string[] = (
  process.env.VENTUREOS_AGENTS ?? 'oracle,atlas,sentinel,verifier,archivist,synth'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ─── Utilities ─────────────────────────────────────────────────────────────

function sendJson(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function clampInt(raw: string | number | null, min: number, max: number, fallback: number): number {
  const v = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  if (Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeReadJson(filePath: string, fallback: null): Record<string, unknown> | null;
function safeReadJson(filePath: string, fallback: Record<string, unknown>): Record<string, unknown>;
function safeReadJson(
  filePath: string,
  fallback: Record<string, unknown> | null,
): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

function safeReadText(filePath: string, fallback = ''): string {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

const BRIDGE_TOKEN: string = (() => {
  try {
    return readBridgeToken(BRIDGE_TOKEN_FILE, process.env.BRIDGE_TOKEN);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BRIDGE] FATAL:', msg);
    process.exit(1);
  }
})();

const ALLOWLIST: string[] = BRIDGE_ALLOW_CIDRS.split(',').map((c) => c.trim()).filter(Boolean);
const RATE_LIMITS = parseRateLimits(BRIDGE_RATE_LIMITS);
const checkRateLimit = createRateLimiter(RATE_LIMITS);

// ─── Sessions (filtered) ───────────────────────────────────────────────────

interface SessionsJsonEntry {
  label?: string;
  modelOverride?: string;
  model?: string;
  totalTokens?: number;
  contextTokens?: number;
  kind?: string;
  updatedAt?: number;
  createdAt?: number;
  abortedLastRun?: boolean;
  thinkingLevel?: string | null;
  channel?: string;
  sessionId?: string;
}

function isIsolatedSession(key: string, entry?: SessionsJsonEntry): boolean {
  const lower = key.toLowerCase();
  if (entry?.kind === 'isolated') return true;
  if (lower.includes('isolated') || lower.includes('subagent')) return true;
  return false;
}

function resolveName(key: string): string {
  if (key.includes(':main:main')) return 'main';
  if (key.includes('cron:')) {
    try {
      if (fs.existsSync(cronFile)) {
        const crons = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as { jobs?: Array<{ id: string; name?: string }> };
        const jobs = crons.jobs ?? [];
        const cronPart: string = key.split('cron:')[1] ?? '';
        const cronUuid: string = cronPart.split(':')[0];
        const job = jobs.find((j) => j.id === cronUuid);
        if (job?.name) return job.name;
      }
    } catch {
      // ignore
    }
  }
  return key.split(':').pop()?.substring(0, 12) ?? key.substring(0, 12);
}

function getLastMessage(sessionId: string): string {
  try {
    const filePath: string = path.join(sessDir, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return '';
    const data: string = fs.readFileSync(filePath, 'utf8');
    const lines: string[] = data.split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      try {
        const d = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown } };
        if (d.type !== 'message') continue;
        const msg = d.message;
        if (!msg) continue;
        const role = msg.role;
        if (role !== 'user' && role !== 'assistant') continue;
        if (typeof msg.content === 'string') return msg.content.replace(/\n/g, ' ').substring(0, 80);
        if (Array.isArray(msg.content)) {
          for (const b of msg.content) {
            if (b && typeof b === 'object' && (b as { type?: string; text?: string }).type === 'text') {
              const text = (b as { text?: string }).text ?? '';
              if (text) return text.replace(/\n/g, ' ').substring(0, 80);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function getSessionsJson(): Array<Record<string, unknown>> {
  try {
    const sFile: string = path.join(sessDir, 'sessions.json');
    const data = safeReadJson(sFile, {}) as Record<string, SessionsJsonEntry>;
    const items = Object.entries(data)
      .filter(([key, entry]) => !isIsolatedSession(key, entry))
      .map(([key, s]) => ({
        key,
        label: s.label ?? resolveName(key),
        model: s.modelOverride ?? s.model ?? '-',
        totalTokens: s.totalTokens ?? 0,
        contextTokens: s.contextTokens ?? 0,
        kind: s.kind ?? (key.includes('group') ? 'group' : 'direct'),
        updatedAt: s.updatedAt ?? 0,
        createdAt: s.createdAt ?? s.updatedAt ?? 0,
        aborted: s.abortedLastRun ?? false,
        thinkingLevel: s.thinkingLevel ?? null,
        channel: s.channel ?? '-',
        sessionId: s.sessionId ?? key,
        lastMessage: getLastMessage(s.sessionId ?? key),
        cost: 0,
      }));
    return items;
  } catch {
    return [];
  }
}

function getAllowedSessionIds(): Set<string> | null {
  const sFile: string = path.join(sessDir, 'sessions.json');
  const data = safeReadJson(sFile, null) as Record<string, SessionsJsonEntry> | null;
  if (!data) {
    try {
      const files = fs.readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
      const ids = new Set<string>();
      for (const file of files) {
        const id = file.replace(/\.jsonl$/, '');
        const lower = id.toLowerCase();
        if (lower.includes('isolated') || lower.includes('subagent')) continue;
        ids.add(id);
      }
      return ids;
    } catch {
      return null;
    }
  }
  const ids = new Set<string>();
  for (const [key, entry] of Object.entries(data)) {
    if (isIsolatedSession(key, entry)) continue;
    const id = (entry.sessionId ?? key).trim();
    if (id) ids.add(id);
  }
  return ids;
}

function getSessionMessages(sessionId: string): Array<{ role: string; content: string; timestamp: string }> {
  const messages: Array<{ role: string; content: string; timestamp: string }> = [];
  const filePath = path.join(sessDir, sessionId + '.jsonl');
  if (!fs.existsSync(filePath)) return messages;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim());
  for (let i = Math.max(0, lines.length - 30); i < lines.length; i++) {
    try {
      const d = JSON.parse(lines[i]) as { type?: string; message?: { role?: string; content?: unknown }; timestamp?: string };
      if (d.type !== 'message') continue;
      const msg = d.message;
      if (!msg?.role) continue;
      let text = '';
      if (typeof msg.content === 'string') text = msg.content;
      else if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && typeof b === 'object' && (b as { type?: string; text?: string }).type === 'text') {
            text = (b as { text?: string }).text ?? '';
            break;
          }
        }
      }
      messages.push({ role: msg.role, content: text, timestamp: d.timestamp ?? '' });
    } catch {
      // ignore
    }
  }
  return messages;
}

// ─── Dashboard Parity Data Helpers ─────────────────────────────────────────

interface BridgeObservationEntry {
  date: string;
  time: string;
  tsMs: number | null;
  title: string;
  context: string;
  action: string;
  outcome: string;
  tags: string[];
  raw: string;
}

const {
  getVentureosAgents,
  getWorkflowPatterns,
  getMissionControl,
  getCronJobs,
  getGitActivity,
  getServicesStatus,
  getMemoryFiles,
} = createBridgeAggregationHelpers({
  activeWorkPath: ACTIVE_WORK_PATH,
  cronFile,
  heartbeatPath,
  memoryDir,
  memoryMdPath,
  openclawDir: OPENCLAW_DIR,
  prioritiesPath: PRIORITIES_PATH,
  readJson: (filePath, fallback) =>
    fallback === null
      ? safeReadJson(filePath, null)
      : safeReadJson(filePath, fallback),
  readText: safeReadText,
  ventureosAgents: VENTUREOS_AGENTS,
  workspaceDir: WORKSPACE_DIR,
});

function parseObservationFile(date: string, filePath: string): BridgeObservationEntry[] {
  const content = safeReadText(filePath, '');
  if (!content) return [];
  const blocks = content
    .split(/\n---\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const dayBase = new Date(`${date}T00:00:00`).getTime();
  const entries: BridgeObservationEntry[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    const titleMatch = block.match(/^## \[([^\]]+)\] (.+)$/m);
    if (!titleMatch) continue;
    const when = (titleMatch[1] ?? '').trim();
    const title = (titleMatch[2] ?? '').trim();
    const context = (block.match(/\*\*Context\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const action = (block.match(/\*\*Action\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const outcome = (block.match(/\*\*Outcome\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const tags = (((block.match(/\*\*Tags\*\*:\s*([^\n]+)/) ?? [])[1] ?? '') as string)
      .split(/\s+/)
      .filter((tag) => tag.startsWith('#'));

    let tsMs: number | null = null;
    const explicitTime = when.match(/^(\d{2}):(\d{2})$/);
    if (explicitTime && Number.isFinite(dayBase)) {
      tsMs = dayBase + parseInt(explicitTime[1] ?? '0', 10) * 3600000 + parseInt(explicitTime[2] ?? '0', 10) * 60000;
    } else if (Number.isFinite(dayBase)) {
      tsMs = dayBase + idx * 1000;
    }

    entries.push({
      date,
      time: when,
      tsMs,
      title,
      context,
      action,
      outcome,
      tags,
      raw: block,
    });
  }

  return entries;
}

function getAllObservations(): {
  updatedAt: number;
  entries: BridgeObservationEntry[];
  tags: Array<{ tag: string; count: number }>;
  index: Record<string, unknown> | null;
} {
  const now = Date.now();
  if (observationsCache && now - observationsCache.updatedAt < 5000) return observationsCache;

  const files: string[] = [];
  try {
    if (fs.existsSync(OBSERVATIONS_DIR)) {
      for (const name of fs.readdirSync(OBSERVATIONS_DIR)) {
        if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) files.push(name);
      }
    }
  } catch {
    // ignore
  }

  const entries: BridgeObservationEntry[] = [];
  const tagCounts: Record<string, number> = {};
  for (const fileName of files.sort()) {
    const date = fileName.replace('.md', '');
    const fullPath = path.join(OBSERVATIONS_DIR, fileName);
    for (const entry of parseObservationFile(date, fullPath)) {
      entries.push(entry);
      for (const tag of entry.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  entries.sort((a, b) => (b.tsMs ?? 0) - (a.tsMs ?? 0));
  observationsCache = {
    updatedAt: now,
    entries,
    tags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([tag, count]) => ({ tag, count })),
    index: safeReadJson(path.join(OBSERVATIONS_DIR, 'index.json'), null),
  };
  return observationsCache;
}

function getObservationFile(relPath: string): string | null {
  const safe = String(relPath ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(safe)) return null;
  const dir = path.resolve(OBSERVATIONS_DIR);
  const full = path.resolve(path.join(dir, safe));
  if (!full.startsWith(`${dir}${path.sep}`)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

function parseLiveMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, 150);
  if (!Array.isArray(content)) return '';

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const type = String((block as { type?: string }).type ?? '');
    if (type === 'text') {
      const text = String((block as { text?: string }).text ?? '');
      if (text) return text.slice(0, 150);
      continue;
    }
    if (type === 'toolCall' || type === 'tool_use') {
      const name = String((block as { name?: string; toolName?: string }).name ?? (block as { toolName?: string }).toolName ?? 'tool');
      const args = (block as { arguments?: unknown; input?: unknown }).arguments ?? (block as { input?: unknown }).input ?? {};
      return `🔧 ${name}(${JSON.stringify(args).slice(0, 80)})`;
    }
    if (type === 'toolResult' || type === 'tool_result') {
      const rc = (block as { content?: unknown }).content;
      return `📋 Result: ${typeof rc === 'string' ? rc.slice(0, 100) : JSON.stringify(rc ?? '').slice(0, 100)}`;
    }
    if (type === 'thinking') {
      const thinking = String((block as { thinking?: string }).thinking ?? '');
      return `💭 ${thinking.slice(0, 100)}`;
    }
  }

  return content[0] ? JSON.stringify(content[0]).slice(0, 100) : '';
}

function formatBridgeLiveEvent(
  sessionKey: string,
  data: { timestamp?: string; type?: string; message?: { role?: string; content?: unknown; type?: string } },
  sessions: Array<Record<string, unknown>>,
): BridgeLiveEvent | null {
  if (data.type !== 'message' || !data.message) return null;
  const role = String(data.message.role ?? 'unknown');
  let content = parseLiveMessageContent(data.message.content);
  if (!content && data.message.type === 'tool_result') {
    const raw = data.message.content;
    content = `📋 ${typeof raw === 'string' ? raw.slice(0, 100) : JSON.stringify(raw ?? '').slice(0, 100)}`;
  }
  if (!content) return null;

  const session = sessions.find(
    (item) =>
      String(item.sessionId ?? '') === sessionKey ||
      String(item.key ?? '').includes(sessionKey),
  );
  const label = session ? String(session.label ?? sessionKey.slice(0, 8)) : sessionKey.slice(0, 8);

  return {
    timestamp: data.timestamp ?? new Date().toISOString(),
    session: label,
    role,
    content: content.replace(/\n/g, ' ').trim(),
  };
}

function readRecentBridgeLiveEvents(sinceMs: number, maxEvents = 60): BridgeLiveEvent[] {
  const events: Array<{ event: BridgeLiveEvent; ts: number }> = [];
  const sessions = getSessionsJson();
  let files: string[] = [];
  try {
    files = fs.readdirSync(sessDir).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }

  for (const fileName of files) {
    const filePath = path.join(sessDir, fileName);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (stats.mtimeMs < sinceMs - 60_000) continue;

    const sessionKey = fileName.replace(/\.jsonl$/, '');
    const lines = safeReadText(filePath, '')
      .split('\n')
      .filter((line) => line.trim())
      .slice(-120);

    for (const line of lines) {
      let row: { timestamp?: string; type?: string; message?: { role?: string; content?: unknown; type?: string } };
      try {
        row = JSON.parse(line) as { timestamp?: string; type?: string; message?: { role?: string; content?: unknown; type?: string } };
      } catch {
        continue;
      }
      const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
      if (Number.isFinite(ts) && ts > 0 && ts < sinceMs) continue;
      const event = formatBridgeLiveEvent(sessionKey, row, sessions);
      if (event) events.push({ event, ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now() });
    }
  }

  events.sort((a, b) => a.ts - b.ts);
  return events.slice(-maxEvents).map((item) => item.event);
}

function listKpiFiles(): string[] {
  try {
    if (!fs.existsSync(KPI_DIR)) return [];
    return fs
      .readdirSync(KPI_DIR)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
  } catch {
    return [];
  }
}

function getLatestKpiSummary(): {
  date: string | null;
  successRate: number | null;
  p95LatencyS: number | null;
  sloStatus: string | null;
} {
  const files = listKpiFiles();
  const latest = files.length > 0 ? files[files.length - 1] : null;
  if (!latest) {
    return { date: null, successRate: null, p95LatencyS: null, sloStatus: null };
  }

  const row = safeReadJson(path.join(KPI_DIR, latest), null) as Record<string, unknown> | null;
  if (!row) {
    return { date: latest.replace('.json', ''), successRate: null, p95LatencyS: null, sloStatus: null };
  }

  const overall = (row.overall ?? {}) as Record<string, unknown>;
  const successRate = typeof overall.success_rate === 'number' ? overall.success_rate : null;
  const latency = (overall.latency_ms ?? {}) as Record<string, unknown>;
  const p95LatencyS = typeof latency.p95 === 'number' ? latency.p95 / 1000 : null;
  let sloStatus: string | null = null;
  if (typeof successRate === 'number' && typeof p95LatencyS === 'number') {
    if (successRate < 0.95 || p95LatencyS > 60) sloStatus = 'critical';
    else if (successRate < 0.97 || p95LatencyS > 50) sloStatus = 'warn';
    else sloStatus = 'ok';
  }

  return {
    date: String(row.date ?? latest.replace('.json', '')),
    successRate,
    p95LatencyS,
    sloStatus,
  };
}

function getVentureosKpis(days = 7): {
  updatedAt: number;
  latest: {
    date: string;
    successRate: number | null;
    p95s: number | null;
    handoffSuccessRate: null;
    backupAgeH: number | null;
    slo: Record<string, unknown> | null;
    sloStatus: {
      status: 'ok' | 'warn' | 'bad';
      emoji: string;
      checks: Array<{ metric: string; status: 'ok' | 'warn' | 'bad'; value: number; target: number }>;
    } | null;
  } | null;
  baseline: {
    successRate: number | null;
    p95s: number | null;
    backupAgeH: number | null;
  };
  history: Array<{
    date: string;
    successRate: number | null;
    p50s: number | null;
    p95s: number | null;
    p99s: number | null;
    backupAgeH: number | null;
  }>;
} {
  const files = listKpiFiles();
  const slice = files.slice(-Math.max(1, Math.min(days, 60)));
  const history: Array<{
    date: string;
    successRate: number | null;
    p50s: number | null;
    p95s: number | null;
    p99s: number | null;
    backupAgeH: number | null;
    raw?: Record<string, unknown>;
  }> = [];

  for (const fileName of slice) {
    const row = safeReadJson(path.join(KPI_DIR, fileName), null) as Record<string, unknown> | null;
    if (!row) continue;
    const overall = (row.overall ?? {}) as Record<string, unknown>;
    const latency = (overall.latency_ms ?? {}) as Record<string, unknown>;
    const backup = (overall.backup ?? {}) as Record<string, unknown>;
    history.push({
      date: String(row.date ?? fileName.replace('.json', '')),
      successRate: typeof overall.success_rate === 'number' ? overall.success_rate : null,
      p50s: typeof latency.p50 === 'number' ? latency.p50 / 1000 : null,
      p95s: typeof latency.p95 === 'number' ? latency.p95 / 1000 : null,
      p99s: typeof latency.p99 === 'number' ? latency.p99 / 1000 : null,
      backupAgeH: typeof backup.age_hours === 'number' ? backup.age_hours : null,
      raw: row,
    });
  }

  const mean = (values: Array<number | null>): number | null => {
    const valid = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  };

  const latest = history.length > 0 ? history[history.length - 1] : null;
  const baselineWindow = history.slice(0, Math.max(0, history.length - 1));
  const baseline = {
    successRate: mean(baselineWindow.map((row) => row.successRate)),
    p95s: mean(baselineWindow.map((row) => row.p95s)),
    backupAgeH: mean(baselineWindow.map((row) => row.backupAgeH)),
  };

  let latestOut: {
    date: string;
    successRate: number | null;
    p95s: number | null;
    handoffSuccessRate: null;
    backupAgeH: number | null;
    slo: Record<string, unknown> | null;
    sloStatus: {
      status: 'ok' | 'warn' | 'bad';
      emoji: string;
      checks: Array<{ metric: string; status: 'ok' | 'warn' | 'bad'; value: number; target: number }>;
    } | null;
  } | null = null;

  if (latest) {
    const raw = latest.raw ?? {};
    const slo = (raw.slo ?? null) as Record<string, unknown> | null;
    const checks: Array<{ metric: string; status: 'ok' | 'warn' | 'bad'; value: number; target: number }> = [];

    const successTarget = typeof slo?.success_rate === 'number' ? slo.success_rate : null;
    if (successTarget != null && latest.successRate != null) {
      checks.push({
        metric: 'success_rate',
        status:
          latest.successRate < successTarget
            ? 'bad'
            : latest.successRate < successTarget + 0.01
              ? 'warn'
              : 'ok',
        value: latest.successRate,
        target: successTarget,
      });
    }

    const p95Target = typeof slo?.p95_latency_s === 'number' ? slo.p95_latency_s : null;
    if (p95Target != null && latest.p95s != null) {
      checks.push({
        metric: 'p95_latency_s',
        status: latest.p95s > p95Target ? 'bad' : latest.p95s > p95Target * 0.8 ? 'warn' : 'ok',
        value: latest.p95s,
        target: p95Target,
      });
    }

    const backupTarget = typeof slo?.backup_age_h === 'number' ? slo.backup_age_h : null;
    if (backupTarget != null && latest.backupAgeH != null) {
      checks.push({
        metric: 'backup_age_h',
        status:
          latest.backupAgeH > backupTarget
            ? 'bad'
            : latest.backupAgeH > backupTarget * 0.8
              ? 'warn'
              : 'ok',
        value: latest.backupAgeH,
        target: backupTarget,
      });
    }

    const worst =
      checks.some((check) => check.status === 'bad')
        ? 'bad'
        : checks.some((check) => check.status === 'warn')
          ? 'warn'
          : 'ok';
    latestOut = {
      date: latest.date,
      successRate: latest.successRate,
      p95s: latest.p95s,
      handoffSuccessRate: null,
      backupAgeH: latest.backupAgeH,
      slo,
      sloStatus: checks.length
        ? {
            status: worst,
            emoji: worst === 'ok' ? '✅' : worst === 'warn' ? '⚠️' : '🔴',
            checks,
          }
        : null,
    };
  }

  return {
    updatedAt: Date.now(),
    latest: latestOut,
    baseline,
    history: history.map((row) => ({
      date: row.date,
      successRate: row.successRate,
      p50s: row.p50s,
      p95s: row.p95s,
      p99s: row.p99s,
      backupAgeH: row.backupAgeH,
    })),
  };
}

const buildBridgeTelemetrySnapshot = createBridgeTelemetryBuilder({
  sessDir,
  cronFile,
  getAllowedSessionIds,
  getSessionsJson,
  getVentureosAgents,
  getLatestKpiSummary,
  buildSystemStats,
  buildCostData,
  buildUsageWindows,
});

let costCache: ReturnType<typeof buildCostData> | null = null;
let costCacheTime: number = 0;
let usageCache: ReturnType<typeof buildUsageWindows> | null = null;
let usageCacheTime: number = 0;
let lifetimeStatsCache: ReturnType<typeof buildLifetimeStats> | null = null;
let lifetimeStatsCacheTime: number = 0;
let observationsCache: {
  updatedAt: number;
  entries: BridgeObservationEntry[];
  tags: Array<{ tag: string; count: number }>;
  index: Record<string, unknown> | null;
} | null = null;

// ─── Server ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, { ok: false, error: 'Missing URL' }, 400);
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/health') {
    sendJson(res, { ok: true, version: 'bridge-0.1', uptime: process.uptime(), bridgeTime: new Date().toISOString() });
    return;
  }

  const peerIp = normalizeIp(req.socket?.remoteAddress ?? 'unknown');
  if (!isAllowedIp(peerIp, ALLOWLIST)) {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'deny_ip', req, peerIp);
    sendJson(res, { ok: false, error: 'Forbidden' }, 403);
    return;
  }

  if (!authorizeRequest(req.headers['authorization']?.toString(), BRIDGE_TOKEN)) {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'auth_failed', req);
    sendJson(res, { ok: false, error: 'Unauthorized' }, 401);
    return;
  }

  const group = rateLimitGroup(pathname);
  const rateLimit = checkRateLimit(peerIp, group);
  const retryAfter = Math.max(1, Math.ceil(rateLimit.resetMs / 1000));
  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(retryAfter));
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'rate_limited', req, group);
    sendJson(res, { ok: false, error: 'Rate limit exceeded' }, 429);
    return;
  }

  if (pathname === '/api/bridge/config') {
    sendJson(res, {
      name: 'OpenClaw Bridge API',
      version: '0.1.0',
      ventureos: {
        VENTUREOS_ROOT,
        SHARED_CONTEXT,
        KPI_DIR,
        OBSERVATIONS_DIR,
      },
      capabilities: [
        { id: 'bridge', name: 'Bridge API', port: BRIDGE_PORT, status: 'active' },
      ],
    });
    return;
  }

  // KPI endpoints (reuse existing handlers)
  if (pathname.startsWith('/api/bridge/kpis')) {
    req.url = pathname.replace('/api/bridge', '/api') + url.search;
    if (handleKpis(req, res, { KPI_DIR, safeReadJson, sendJson, clampInt })) return;
  }

  // Observation endpoints (reuse existing handlers)
  if (pathname.startsWith('/api/bridge/observations')) {
    req.url = pathname.replace('/api/bridge', '/api') + url.search;
    if (handleObservations(req, res, { OBSERVATIONS_DIR, safeReadText, sendJson, clampInt })) return;
  }

  // Agent health
  if (pathname === '/api/bridge/agent-health') {
    req.url = '/api/agent-health';
    if (handleAgentHealth(req, res, { OPENCLAW_DIR, WORKSPACE_DIR, sendJson })) return;
  }

  // Sessions (filtered)
  if (pathname === '/api/bridge/sessions') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'sessions_read', req);
    sendJson(res, getSessionsJson());
    return;
  }

  if (pathname === '/api/bridge/session-messages') {
    const rawId = url.searchParams.get('id') ?? '';
    const sessionId = rawId.replace(/[^a-zA-Z0-9\-_.:]/g, '');
    if (!sessionId) {
      sendJson(res, { ok: false, error: 'Missing id' }, 400);
      return;
    }
    const sessions = getSessionsJson();
    const match = sessions.find(
      (s) => (s as { sessionId?: string; key?: string }).sessionId === sessionId || (s as { key?: string }).key === sessionId,
    );
    if (!match) {
      sendJson(res, { ok: false, error: 'Not found' }, 404);
      return;
    }
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'session_messages', req, sessionId);
    sendJson(res, getSessionMessages(sessionId));
    return;
  }

  const allowedSessionIds = getAllowedSessionIds();

  if (pathname === '/api/bridge/usage') {
    const now = Date.now();
    if (!usageCache || now - usageCacheTime > 10000) {
      usageCache = buildUsageWindows({ sessDir, allowedSessionIds });
      usageCacheTime = now;
    }
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'usage_read', req);
    sendJson(res, usageCache);
    return;
  }

  if (pathname === '/api/bridge/costs') {
    const now = Date.now();
    if (!costCache || now - costCacheTime > 60000) {
      costCache = buildCostData({ sessDir, cronFile, allowedSessionIds });
      costCacheTime = now;
    }
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'costs_read', req);
    sendJson(res, costCache);
    return;
  }

  if (pathname === '/api/bridge/tokens-today') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'tokens_today', req);
    sendJson(res, buildTodayTokens({ sessDir, allowedSessionIds }));
    return;
  }

  if (pathname === '/api/bridge/response-time') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'response_time', req);
    sendJson(res, { avgSeconds: buildAvgResponseTime({ sessDir, allowedSessionIds }) });
    return;
  }

  if (pathname === '/api/bridge/system') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'system_stats', req);
    const stats = buildSystemStats() as ReturnType<typeof buildSystemStats> & {
      diskHistory?: Array<{ t: number; v: number }>;
    };
    if (stats.disk) stats.diskHistory = trackDiskHistory(stats.disk.percent || 0);
    sendJson(res, stats);
    return;
  }

  if (pathname === '/api/bridge/lifetime-stats') {
    const now = Date.now();
    if (!lifetimeStatsCache || now - lifetimeStatsCacheTime > 300000) {
      lifetimeStatsCache = buildLifetimeStats({ sessDir, allowedSessionIds });
      lifetimeStatsCacheTime = now;
    }
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'lifetime_stats', req);
    sendJson(res, lifetimeStatsCache);
    return;
  }

  if (pathname === '/api/bridge/health-history') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'health_history', req);
    sendJson(res, readHealthHistory(healthHistoryFile));
    return;
  }

  if (pathname === '/api/bridge/ventureos-agents') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'ventureos_agents', req);
    sendJson(res, getVentureosAgents());
    return;
  }

  if (pathname === '/api/bridge/ventureos-kpis') {
    const days = clampInt(url.searchParams.get('days'), 1, 60, 7);
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'ventureos_kpis', req, `days=${days}`);
    sendJson(res, getVentureosKpis(days));
    return;
  }

  if (pathname === '/api/bridge/workflow-patterns') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'workflow_patterns', req);
    sendJson(res, getWorkflowPatterns());
    return;
  }

  if (pathname === '/api/bridge/mission-control') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'mission_control', req);
    sendJson(res, getMissionControl());
    return;
  }

  if (pathname === '/api/bridge/crons') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'crons', req);
    sendJson(res, getCronJobs());
    return;
  }

  if (pathname === '/api/bridge/scheduler-jobs') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'scheduler_jobs', req);
    sendJson(
      res,
      getSchedulerJobs({
        cronFile,
        openclawDir: OPENCLAW_DIR,
      }),
    );
    return;
  }

  if (pathname === '/api/bridge/git') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'git', req);
    sendJson(res, getGitActivity());
    return;
  }

  if (pathname === '/api/bridge/services') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'services', req);
    sendJson(res, getServicesStatus());
    return;
  }

  if (pathname === '/api/bridge/memory') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'memory', req);
    sendJson(res, getMemoryFiles());
    return;
  }

  if (pathname === '/api/bridge/observations-index') {
    const observations = getAllObservations();
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'observations_index', req);
    sendJson(res, {
      updatedAt: observations.updatedAt,
      tags: observations.tags,
      index: observations.index,
      total: observations.entries.length,
    });
    return;
  }

  if (pathname === '/api/bridge/observation') {
    const relPath = url.searchParams.get('path') ?? '';
    const filePath = getObservationFile(relPath);
    if (!filePath) {
      sendJson(res, { ok: false, error: 'Not found' }, 404);
      return;
    }
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'observation_file', req, relPath);
    sendJson(res, {
      ok: true,
      path: relPath,
      content: safeReadText(filePath, ''),
    });
    return;
  }

  // SSE live telemetry feed
  if (pathname === '/api/bridge/live-telemetry') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'live_telemetry', req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sendSnapshot = () => {
      try {
        const snapshot = buildBridgeTelemetrySnapshot();
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      } catch {
        // ignore transient snapshot build errors
      }
    };

    sendSnapshot();
    const interval = setInterval(sendSnapshot, 5000);
    req.on('close', () => clearInterval(interval));
    return;
  }

  // SSE live feed
  if (pathname === '/api/bridge/live') {
    logBridgeAudit(BRIDGE_AUDIT_LOG, 'live_feed', req);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write('data: {"status":"connected"}\n\n');

    const sentEventIds = new Set<string>();
    let sinceMs = Date.now() - 60 * 60 * 1000;
    const recent = readRecentBridgeLiveEvents(sinceMs, 60);
    for (const event of recent) {
      const id = `${event.timestamp}|${event.session}|${event.role}|${event.content}`;
      if (sentEventIds.has(id)) continue;
      sentEventIds.add(id);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      const ts = new Date(event.timestamp).getTime();
      if (Number.isFinite(ts) && ts > sinceMs) sinceMs = ts;
    }

    const interval = setInterval(() => {
      const fresh = readRecentBridgeLiveEvents(Math.max(0, sinceMs - 1000), 80);
      for (const event of fresh) {
        const id = `${event.timestamp}|${event.session}|${event.role}|${event.content}`;
        if (sentEventIds.has(id)) continue;
        sentEventIds.add(id);
        if (sentEventIds.size > 1200) {
          sentEventIds.clear();
          sentEventIds.add(id);
        }
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // ignore write failures
        }
        const ts = new Date(event.timestamp).getTime();
        if (Number.isFinite(ts) && ts > sinceMs) sinceMs = ts;
      }
    }, 5000);

    req.on('close', () => clearInterval(interval));
    return;
  }

  sendJson(res, { ok: false, error: 'Not found', path: pathname }, 404);
});

server.listen(BRIDGE_PORT, () => {
  console.log(`[BRIDGE] Listening on http://127.0.0.1:${BRIDGE_PORT}`);
  console.log(`[BRIDGE] OPENCLAW_DIR: ${OPENCLAW_DIR}`);
  console.log(`[BRIDGE] WORKSPACE_DIR: ${WORKSPACE_DIR}`);
});
