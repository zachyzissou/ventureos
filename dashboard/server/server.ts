/**
 * Dashboard server entry point.
 * Migrated from server.js (Phase 3 — Issue #76).
 *
 * Single-file HTTP server: middleware pipeline → route dispatch → static serving.
 * Uses Node.js built-in `http` module (no Express).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';

import type { IncomingMessage, ServerResponse, Server } from 'node:http';

import type {
  DashboardConfig,
  KpiFileData,
  KpiTrendItem,
  KpiHistoryPoint,
  SloCheck,
  SloStatus,
  ObservationEntry,
  TagCount,
  ObservationSearchParams,
  SessionInfo,
  SessionsJsonEntry,
  CostData,
  ModelUsageStats,
  UsageWindowsResponse,
  SystemStats,
  LiveEvent,
  CronJobInfo,
  AgentSessionEntry,
  AgentMetrics,
  VentureOSAgentSummary,
  VentureOSAgentsResponse,
  MissionControlResponse,
  VentureOSFeatureFlagsResponse,
  WorkflowPatternsResponse,
  WorkflowRun,
  WorkflowEvent,
  HealthSnapshot,
  LifetimeStats,
  GitCommit,
  GitRepo,
  JsonlEntry,
  SessionMessage,
  MessageContentBlock,
  CookieMap,
  VentureOSKpiResponse,
  TelemetrySnapshot,
  SchedulerJobInfo,
} from './types.js';

// Shared VentureOS libraries (Issue #79)
import errors from '../../lib/error-handler.js';
import paths from '../../lib/paths.js';

const { toSafeError } = errors as typeof import('../../lib/error-handler.js');
const {
  VENTUREOS_ROOT,
  OPENCLAW_DIR,
  SHARED_CONTEXT_DIR: SHARED_CONTEXT,
  KPI_DIR,
  DASHBOARD_DATA_DIR,
  OBSERVATIONS_DIR,
  LOG_DIR,
  RPG_ROOT,
  RPG_DB_PATH,
  ACTIVE_WORK_PATH,
  PRIORITIES_PATH,
  agentSessionsDir,
} = paths as typeof import('../../lib/paths.js');

// Phase 5.1 Security Middleware
import {
  authenticate,
  isAuthenticated,
  getToken,
  COOKIE_NAME,
  logAuthEvent,
  tokenMatch,
  parseCookies,
} from './middleware/auth.js';
import { applyCors, handlePreflight } from './middleware/cors.js';
import { applySecurityHeaders } from './middleware/security-headers.js';
import { rateLimit } from './middleware/rate-limit.js';
import { auditLog } from './middleware/audit-log.js';
import { authorizeActionRequest } from './middleware/action-guard.js';
import { withCorrelationId, CORRELATION_HEADER } from './middleware/correlation-id.js';
import { proxyBridgeJson, proxyBridgeSse } from './bridge-proxy.js';
import { tryServeStatic } from './static-serve.js';
import {
  safeReadJson,
  safeReadText,
  sendJson,
  clampInt,
  readEnvFlag,
  readRequestBody,
  buildAuthCookie,
  buildClearAuthCookie,
  timingSafeStringEqual,
} from './server-utils.js';

// Structured logging (Issue #195 — Observability)
import structuredLogger from '../../lib/structured-logger.js';
const { logInfo, logWarn, logError: slogError } = structuredLogger as typeof import('../../lib/structured-logger.js');

// Route handlers
import { handleKpis } from './routes/kpis.js';
import { handleObservations } from './routes/observations.js';
import { handleAgentHealth } from './routes/agent-health.js';
import { handleRpgApi } from './routes/rpg.js';
import { handleConversationApi } from './routes/conversation.js';
import { handleTacticalMapControls } from './routes/tactical-map-controls.js';
import { handleLogs } from './routes/logs.js';
import { handleTacticalMapReplay } from './routes/tactical-map-replay.js';
import { handleTacticalMapLive, handleTacticalMapLiveUpgrade } from './routes/tactical-map-live.js';
import { handleProgressionApi } from './routes/progression.js';
import { handleProgressionV2Api } from '../../lib/progression-http-v2.js';
import { getDefaultModelRouter } from '../../lib/model-router.js';
import { handleChangelog } from './routes/changelog.js';
import { handleTaskBoard, resumeRunningTasksFromSnapshot } from './routes/task-board.js';
import { emitTaskEvent } from './task-board-events.js';
import { handleMemoryState } from './routes/memory-state.js';
import { handleUnifiedSearch } from './routes/unified-search.js';
import { handleObsidianConnector } from './routes/obsidian-connector.js';
import { handleSharedContext } from './routes/shared-context.js';
import { handleTokenCompaction } from './routes/token-compaction.js';
import { handleSelfImprovement } from './routes/self-improvement.js';
import { handleCodeFactory } from './routes/code-factory.js';
import { handleWebMcp } from './routes/webmcp.js';
import { handleVisualExplainer } from './routes/visual-explainer.js';
import { handleProposalLifecycle, handleProposalLifecycleUpgrade } from './routes/proposal-lifecycle.js';
import { handleLivingFiles } from './routes/living-files.js';
import { handleActionRoutes } from './routes/action-routes.js';
import { handleRpgCompat } from './routes/rpg-compat.js';
import {
  handleOpenclawLocalReadiness,
  resolveOpenclawLocalReadinessReportDir,
} from './routes/openclaw-local-readiness.js';
import {
  appendOverviewFreshnessEvent,
  evaluateOverviewFreshnessEventForPersistence,
  parseOverviewFreshnessEvent,
  readOverviewFreshnessEvents,
  resolveOverviewFreshnessEventDedupeWindowMs,
  resolveOverviewFreshnessThresholds,
  resolveOverviewFreshnessTimelineLimit,
} from './overview-freshness.js';
import { getSchedulerJobs } from './scheduler-jobs.js';
import {
  buildAvgResponseTime,
  buildCostData,
  buildLifetimeStats,
  buildSystemStats,
  buildTodayTokens,
  buildUsageWindows,
  readHealthHistory,
  sampleCpuPercent as sampleCpuPercentInternal,
  trackDiskHistory,
} from './bridge-metrics.js';
import {
  getAgentMetrics as getAgentMetricsInternal,
  getSessionsJson as getSessionsJsonInternal,
  resolveSessionName,
} from './server-session-helpers.js';
import {
  getCronJobs as getCronJobsInternal,
  getGitActivity as getGitActivityInternal,
  getMemoryFiles as getMemoryFilesInternal,
  getServicesStatus as getServicesStatusInternal,
} from './server-ops-helpers.js';
import { resolveRestartActionCommand } from './platform-ops.js';

// ─── Configuration ───────────────────────────────────────────────────────────
// All VentureOS data paths flow through lib/paths.ts (no os.homedir() needed).

export const PORT: number = parseInt(process.env.DASHBOARD_PORT ?? '8001');
const HOST: string = process.env.DASHBOARD_HOST ?? '127.0.0.1';
const WORKSPACE_DIR: string = process.env.WORKSPACE_DIR ?? process.env.OPENCLAW_WORKSPACE ?? process.cwd();
const AGENT_ID: string = process.env.OPENCLAW_AGENT ?? 'main';
const DASHBOARD_DATA_MODE: string = (process.env.DASHBOARD_DATA_MODE ?? 'filesystem').toLowerCase();
const BRIDGE_URL: string = process.env.BRIDGE_URL ?? 'http://127.0.0.1:18790';
const BRIDGE_TOKEN: string = process.env.BRIDGE_TOKEN ?? '';
const sessDir: string = path.join(OPENCLAW_DIR, 'agents', AGENT_ID, 'sessions');
const cronFile: string = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
const dataDir: string = path.join(WORKSPACE_DIR, 'data');
const memoryDir: string = path.join(WORKSPACE_DIR, 'memory');
const memoryMdPath: string = path.join(WORKSPACE_DIR, 'MEMORY.md');
const heartbeatPath: string = path.join(WORKSPACE_DIR, 'HEARTBEAT.md');
const healthHistoryFile: string = path.join(dataDir, 'health-history.json');
const claudeUsageFile: string = path.join(dataDir, 'claude-usage.json');
const scrapeScript: string = path.join(WORKSPACE_DIR, 'scripts', 'scrape-claude-usage.sh');
const OPENCLAW_LOCAL_READINESS_REPORT_DIR: string = resolveOpenclawLocalReadinessReportDir(
  VENTUREOS_ROOT,
  process.env,
);
const OVERVIEW_FRESHNESS_THRESHOLDS_MS = resolveOverviewFreshnessThresholds(process.env);
const OVERVIEW_FRESHNESS_TIMELINE_LIMIT = resolveOverviewFreshnessTimelineLimit(process.env);
const OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS = resolveOverviewFreshnessEventDedupeWindowMs(process.env);
const overviewFreshnessEventDedupeState = new Map<string, number>();

// Client HTML paths — served from client/ directory
const htmlPath: string = path.join(import.meta.dirname, '..', 'client', 'index.html');
const loginHtmlPath: string = path.join(import.meta.dirname, '..', 'client', 'login.html');
const visualExplainerHtmlPath: string = path.join(import.meta.dirname, '..', 'client', 'visual-explainer.html');
const clientAssetsDir: string = path.join(import.meta.dirname, '..', 'client', 'assets');

const VENTUREOS_AGENTS: string[] = (
  process.env.VENTUREOS_AGENTS ?? 'oracle,atlas,sentinel,verifier,archivist,synth'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const bridgeProxyDeps = {
  dataMode: DASHBOARD_DATA_MODE,
  bridgeUrl: BRIDGE_URL,
  bridgeToken: BRIDGE_TOKEN,
};

const execAsync = promisify(exec);

async function runShellCommand(
  command: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    const output = [stdout, stderr].map((s) => s.trim()).filter(Boolean).join('\n');
    return { ok: true, output };
  } catch (error: unknown) {
    const e = error as { message?: string; stdout?: string; stderr?: string };
    const output = [e.stdout, e.stderr].map((s) => (s ?? '').trim()).filter(Boolean).join('\n');
    return { ok: false, output, error: e.message ?? 'Command execution failed' };
  }
}

// Ensure data directory exists
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch {
  // may exist
}

// Crash recovery (Issue #223): re-queue running tasks from active-tasks.md
// so heartbeat workers can resume after restart without losing work context.
try {
  const recovery = resumeRunningTasksFromSnapshot(dataDir, {
    limit: 50,
  });
  if (recovery.resumedCount > 0) {
    logInfo('dashboard', 'task_recovery', 'Recovered running tasks on startup', { ...recovery });
  }
} catch {
  // Non-critical: dashboard can still start without recovery.
}

// ─── Utility Functions ───────────────────────────────────────────────────────

// ─── VentureOS helpers + cache ───────────────────────────────────────────────

const VENTUREOS_CACHE_TTL_MS: number = clampInt(
  process.env.VENTUREOS_CACHE_TTL_MS ?? '5000',
  1000,
  60000,
  5000,
);
const _ventureCache: Map<string, { t: number; v: unknown }> = new Map();

function ventureCached<T>(key: string, computeFn: () => T): T {
  const now: number = Date.now();
  const hit = _ventureCache.get(key);
  if (hit && now - hit.t < VENTUREOS_CACHE_TTL_MS) return hit.v as T;
  const v: T = computeFn();
  _ventureCache.set(key, { t: now, v });
  return v;
}

function getAgentSessionsDir(agentId: string): string {
  return agentSessionsDir(agentId);
}

function resolveName(key: string): string {
  return resolveSessionName(key, cronFile);
}

function getSessionsJson(): SessionInfo[] {
  return getSessionsJsonInternal({ sessDir, cronFile });
}

function getCostData(): CostData {
  return buildCostData({ sessDir, cronFile });
}

let costCache: CostData | null = null;
let costCacheTime: number = 0;

function getUsageWindows(): UsageWindowsResponse {
  return buildUsageWindows({ sessDir });
}

let usageCache: UsageWindowsResponse | null = null;
let usageCacheTime: number = 0;

export const sampleCpuPercent = sampleCpuPercentInternal;

function getSystemStats(): SystemStats {
  return buildSystemStats();
}

// ─── Live Feed (SSE) ─────────────────────────────────────────────────────────

let liveClients: ServerResponse[] = [];
let liveWatcher: fs.FSWatcher | null = null;
const _fileWatchers: Record<string, fs.FSWatcher> = {};
const _fileSizes: Record<string, number> = {};

function watchSessionFile(file: string): void {
  const filePath: string = path.join(sessDir, file);
  const sessionKey: string = file.replace('.jsonl', '');
  if (_fileWatchers[file]) return;
  try {
    _fileSizes[file] = fs.statSync(filePath).size;
  } catch {
    _fileSizes[file] = 0;
  }

  try {
    _fileWatchers[file] = fs.watch(filePath, (eventType) => {
      if (eventType !== 'change') return;
      try {
        const stats: fs.Stats = fs.statSync(filePath);
        if (stats.size <= (_fileSizes[file] ?? 0)) return;
        const fd: number = fs.openSync(filePath, 'r');
        const buffer: Buffer = Buffer.allocUnsafe(stats.size - (_fileSizes[file] ?? 0));
        fs.readSync(fd, buffer, 0, buffer.length, _fileSizes[file] ?? 0);
        fs.closeSync(fd);
        _fileSizes[file] = stats.size;
        buffer
          .toString('utf8')
          .split('\n')
          .filter((l) => l.trim())
          .forEach((line) => {
            try {
              const data = JSON.parse(line) as JsonlEntry;
              data._sessionKey = sessionKey;
              broadcastLiveEvent(data);
            } catch {
              // ignore
            }
          });
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

function startLiveWatcher(): void {
  if (liveWatcher) return;
  try {
    fs.readdirSync(sessDir)
      .filter((f) => f.endsWith('.jsonl'))
      .forEach(watchSessionFile);
    liveWatcher = fs.watch(sessDir, (_eventType, filename) => {
      if (filename && filename.endsWith('.jsonl') && !_fileWatchers[filename]) {
        try {
          if (fs.existsSync(path.join(sessDir, filename))) watchSessionFile(filename);
        } catch {
          // ignore
        }
      }
    });
  } catch {
    // ignore
  }
}

function broadcastLiveEvent(data: JsonlEntry): void {
  if (liveClients.length === 0) return;
  const event: LiveEvent | null = formatLiveEvent(data);
  if (!event) return;
  const message: string = `data: ${JSON.stringify(event)}\n\n`;
  liveClients.forEach((res) => {
    try {
      res.write(message);
    } catch {
      // ignore
    }
  });
}

function formatLiveEvent(data: JsonlEntry): LiveEvent | null {
  const timestamp: string = data.timestamp ?? new Date().toISOString();
  const sessionKey: string = data._sessionKey ?? 'unknown';

  const sessions: SessionInfo[] = getSessionsJson();
  const session = sessions.find(
    (s) => s.sessionId === sessionKey || s.key.includes(sessionKey),
  );
  const label: string = session ? session.label : sessionKey.substring(0, 8);

  if (data.type === 'message') {
    const msg: SessionMessage | undefined = data.message;
    if (!msg) return null;

    const role: string = msg.role ?? 'unknown';
    let content: string = '';

    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          content = block.text.substring(0, 150);
          break;
        } else if (block.type === 'toolCall' || block.type === 'tool_use') {
          content = `🔧 ${block.name ?? block.toolName ?? 'tool'}(${JSON.stringify(block.arguments ?? block.input ?? {}).substring(0, 80)})`;
          break;
        } else if (block.type === 'toolResult' || block.type === 'tool_result') {
          const rc: string =
            typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          content = `📋 Result: ${rc.substring(0, 100)}`;
          break;
        } else if (block.type === 'thinking') {
          content = `💭 ${(block.thinking ?? '').substring(0, 100)}`;
          break;
        }
      }
      if (!content && msg.content[0]) {
        content = JSON.stringify(msg.content[0]).substring(0, 100);
      }
    } else if (typeof msg.content === 'string') {
      content = msg.content.substring(0, 150);
    }

    if (!content && msg.type === 'tool_result') {
      const rc: string =
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');
      content = `📋 ${rc.substring(0, 100)}`;
    }

    if (!content) return null;

    return {
      timestamp,
      session: label,
      role,
      content: content.replace(/\n/g, ' ').trim(),
    };
  }

  return null;
}

// ─── Cron ────────────────────────────────────────────────────────────────────

function getCronJobs(): CronJobInfo[] {
  return getCronJobsInternal(cronFile);
}

// ─── Git ─────────────────────────────────────────────────────────────────────

function getGitActivity(): GitCommit[] {
  return getGitActivityInternal(WORKSPACE_DIR);
}

// ─── Services ────────────────────────────────────────────────────────────────

function getServicesStatus(): Array<{ name: string; active: boolean }> {
  return getServicesStatusInternal();
}

// ─── Memory ──────────────────────────────────────────────────────────────────

function getMemoryFiles(): Array<{ name: string; modified: number; size: number }> {
  return getMemoryFilesInternal(memoryMdPath, heartbeatPath, memoryDir);
}

// ─── Tokens / Response Time ──────────────────────────────────────────────────

function getTodayTokens(): { totalInput: number; totalOutput: number; perModel: Record<string, { input: number; output: number }> } {
  return buildTodayTokens({ sessDir });
}

function getAvgResponseTime(): number {
  return buildAvgResponseTime({ sessDir });
}

// ─── VentureOS Extensions ────────────────────────────────────────────────────

function getAgentMetrics(agentId: string): AgentMetrics {
  return getAgentMetricsInternal(agentId, { cronFile, getAgentSessionsDir });
}

function getLatestKpiFiles(limitDays: number = 7): string[] {
  try {
    if (!fs.existsSync(KPI_DIR)) return [];
    const files: string[] = fs
      .readdirSync(KPI_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort((a, b) => b.localeCompare(a));
    return files.slice(0, limitDays).map((f) => path.join(KPI_DIR, f));
  } catch {
    return [];
  }
}

function getKpiData(): { latest: KpiFileData | null; trend7d: KpiTrendItem[]; count: number } {
  const paths: string[] = getLatestKpiFiles(7);
  const items: KpiFileData[] = paths
    .map((p) => safeReadJson(p, null) as KpiFileData | null)
    .filter((item): item is KpiFileData => item !== null);
  items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const latest: KpiFileData | null = items[items.length - 1] ?? null;

  const trend7d: KpiTrendItem[] = items.map((k) => ({
    date: k.date,
    successRate: k.overall?.success_rate ?? null,
    p95LatencyS:
      k.overall?.latency_ms?.p95 != null ? k.overall.latency_ms.p95 / 1000 : null,
  }));

  return { latest, trend7d, count: items.length };
}

function getWorkflowStats(): Record<string, unknown> {
  const baseTmp: string = '/private/tmp';
  interface ByAgent {
    runsTotal: number;
    runsSuccess: number;
    runsFailure: number;
    retriesTotal: number;
    avgVerifyCycles: number | null;
  }

  const stats = {
    runsTotal: 0,
    runsSuccess: 0,
    runsFailure: 0,
    successRate: null as number | null,
    avgVerifyCycles: null as number | null,
    retriesTotal: 0,
    spawnRetriesTotal: 0,
    byAgent: {} as Record<string, ByAgent>,
    dailyCounts: [] as Array<{ date: string; count: number }>,
  };

  interface RunInfo {
    runId: string;
    agentId: string;
    startTs: number | null;
    verifyCyclesMax: number;
    retries: number;
    spawnRetries: number;
    ok: boolean | null;
  }

  const runMap: Map<string, RunInfo> = new Map();
  const startDates: Record<string, number> = {};

  function ensureAgent(aid: string): ByAgent {
    if (!stats.byAgent[aid])
      stats.byAgent[aid] = {
        runsTotal: 0,
        runsSuccess: 0,
        runsFailure: 0,
        retriesTotal: 0,
        avgVerifyCycles: null,
      };
    return stats.byAgent[aid];
  }

  let dirs: string[] = [];
  try {
    dirs = fs
      .readdirSync(baseTmp)
      .filter((d) => d.startsWith('agent-'))
      .map((d) => path.join(baseTmp, d));
  } catch {
    // ignore
  }

  for (const d of dirs) {
    const logFile: string = path.join(d, 'antfarm-validation.jsonl');
    if (!fs.existsSync(logFile)) continue;
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(logFile, 'utf8').split('\n').filter((l) => l.trim());
    } catch {
      continue;
    }

    for (const line of lines) {
      let ev: WorkflowEvent;
      try {
        ev = JSON.parse(line) as WorkflowEvent;
      } catch {
        continue;
      }
      const event: string | undefined = ev.event;
      const runId: string | undefined = ev.runId;
      const ts: number = ev.ts ? Date.parse(ev.ts) : NaN;
      const agentId: string = (ev.agentId ?? '').toLowerCase();

      if (event === 'workflow_start' && runId) {
        stats.runsTotal++;
        const r: RunInfo = {
          runId,
          agentId,
          startTs: Number.isNaN(ts) ? null : ts,
          verifyCyclesMax: 0,
          retries: 0,
          spawnRetries: 0,
          ok: null,
        };
        runMap.set(runId, r);
        ensureAgent(agentId).runsTotal++;
        if (!Number.isNaN(ts)) {
          const day: string = new Date(ts).toISOString().slice(0, 10);
          startDates[day] = (startDates[day] ?? 0) + 1;
        }
        continue;
      }

      if (!runId || !runMap.has(runId)) continue;
      const r: RunInfo = runMap.get(runId)!;

      if (event === 'verify_status') {
        const cycle: number = parseInt(ev.cycle ?? '0');
        if (cycle > r.verifyCyclesMax) r.verifyCyclesMax = cycle;
        if (String(ev.status) === 'retry') r.retries++;
      }
      if (event === 'spawn_attempt') {
        const attempt: number = parseInt(ev.attempt ?? '1');
        if (attempt > 1) r.spawnRetries++;
      }
      if (event === 'workflow_success') {
        r.ok = !!ev.ok;
        if (ev.cyclesUsed)
          r.verifyCyclesMax = Math.max(r.verifyCyclesMax, parseInt(ev.cyclesUsed));
      }
      if (event === 'workflow_error') {
        r.ok = false;
      }
    }
  }

  const cycles: number[] = [];
  for (const r of runMap.values()) {
    if (r.ok === true) {
      stats.runsSuccess++;
      ensureAgent(r.agentId).runsSuccess++;
    } else if (r.ok === false) {
      stats.runsFailure++;
      ensureAgent(r.agentId).runsFailure++;
    }
    stats.retriesTotal += r.retries;
    stats.spawnRetriesTotal += r.spawnRetries;
    ensureAgent(r.agentId).retriesTotal += r.retries;
    if (r.verifyCyclesMax) cycles.push(r.verifyCyclesMax);
  }

  stats.successRate = stats.runsTotal ? stats.runsSuccess / stats.runsTotal : null;
  stats.avgVerifyCycles = cycles.length
    ? cycles.reduce((a, b) => a + b, 0) / cycles.length
    : null;

  for (const [aid, a] of Object.entries(stats.byAgent)) {
    const agentRuns = Array.from(runMap.values()).filter(
      (r) => r.agentId === aid && r.verifyCyclesMax,
    );
    const ac: number[] = agentRuns.map((r) => r.verifyCyclesMax);
    a.avgVerifyCycles = ac.length ? ac.reduce((x, y) => x + y, 0) / ac.length : null;
  }

  const days: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d: string = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, count: startDates[d] ?? 0 });
  }
  stats.dailyCounts = days;

  return stats;
}

interface ObsItem {
  path: string;
  date: string;
  title: string;
  snippet: string;
  mtimeMs: number;
  topics: string[];
  tags: string[];
}

function listObservations(limit: number = 30): { items: ObsItem[]; tagCloud: TagCount[] } {
  const obsDir: string = OBSERVATIONS_DIR;
  const indexPath: string = path.join(obsDir, 'index.json');
  const index = safeReadJson(indexPath, null) as {
    dates?: Record<string, { topics?: string[]; tags?: string[] }>;
    tags?: Record<string, string[]>;
  } | null;

  let files: Array<{ file: string; fullPath: string; mtimeMs: number }> = [];
  try {
    if (fs.existsSync(obsDir)) {
      files = fs
        .readdirSync(obsDir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .map((f) => ({
          file: f,
          fullPath: path.join(obsDir, f),
          mtimeMs: (() => {
            try {
              return fs.statSync(path.join(obsDir, f)).mtimeMs;
            } catch {
              return 0;
            }
          })(),
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    }
  } catch {
    // ignore
  }

  const items: ObsItem[] = [];
  for (const f of files.slice(0, limit)) {
    const content: string = safeReadText(f.fullPath, '');
    const date: string = f.file.replace('.md', '');
    const title: string =
      (content.split('\n').find((l) => l.startsWith('# ')) ?? '').replace(/^#\s+/, '') || date;
    const snippet: string = content.replace(/\s+/g, ' ').trim().slice(0, 220);
    const meta = index?.dates?.[date] ?? {};
    items.push({
      path: f.file,
      date,
      title,
      snippet,
      mtimeMs: f.mtimeMs,
      topics: (meta as Record<string, string[]>).topics ?? [],
      tags: (meta as Record<string, string[]>).tags ?? [],
    });
  }

  let tagCloud: TagCount[] = [];
  try {
    if (index?.tags) {
      const counts = Object.entries(index.tags).map(([tag, dates]) => ({
        tag,
        count: (dates ?? []).length,
      }));
      counts.sort((a, b) => b.count - a.count);
      tagCloud = counts.slice(0, 30);
    }
  } catch {
    // ignore
  }

  return { items, tagCloud };
}

function getObservationFile(relPath: string): string | null {
  const safe: string = String(relPath || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(safe)) return null;
  const dir: string = path.resolve(OBSERVATIONS_DIR);
  const full: string = path.resolve(path.join(dir, safe));
  if (!full.startsWith(dir + path.sep)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

function getLastMessageFromDir(agentSessDir: string, sessionId: string): string {
  try {
    const filePath: string = path.join(agentSessDir, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return '';
    const data: string = fs.readFileSync(filePath, 'utf8');
    const lines: string[] = data.split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
      try {
        const d = JSON.parse(lines[i]) as JsonlEntry;
        if (d.type !== 'message') continue;
        const msg: SessionMessage | undefined = d.message;
        if (!msg) continue;
        if (msg.role !== 'assistant') continue;
        let text: string = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const b of msg.content) {
            if (b.type === 'text' && b.text) {
              text = b.text;
              break;
            }
          }
        }
        if (text) return text.replace(/\n/g, ' ').trim().substring(0, 140);
      } catch {
        // ignore
      }
    }
    return '';
  } catch {
    return '';
  }
}

function getAgentSessionsIndex(agentId: string): AgentSessionEntry[] {
  const agentSessDir: string = getAgentSessionsDir(agentId);
  try {
    const sFile: string = path.join(agentSessDir, 'sessions.json');
    const data = safeReadJson(sFile, {}) as Record<string, SessionsJsonEntry>;
    return Object.entries(data ?? {}).map(([key, s]): AgentSessionEntry => {
      const sid: string = s.sessionId ?? key;
      return {
        agentId,
        key,
        sessionId: sid,
        label: s.label ?? resolveName(key),
        updatedAt: s.updatedAt ?? 0,
        createdAt: s.createdAt ?? s.updatedAt ?? 0,
        aborted: s.abortedLastRun ?? false,
        model: s.modelOverride ?? s.model ?? '-',
        lastMessage: getLastMessageFromDir(agentSessDir, sid),
      };
    });
  } catch {
    return [];
  }
}

function getAgentAvgLatencySeconds(
  agentId: string,
  windowMs: number = 24 * 3600000,
): number | null {
  const agentSessDir: string = getAgentSessionsDir(agentId);
  try {
    if (!fs.existsSync(agentSessDir)) return null;
    const now: number = Date.now();
    const cutoff: number = now - windowMs;
    const files: string[] = fs.readdirSync(agentSessDir).filter((f) => f.endsWith('.jsonl'));
    const diffs: number[] = [];

    const recentFiles: string[] = files.filter((f) => {
      try {
        return fs.statSync(path.join(agentSessDir, f)).mtimeMs >= cutoff;
      } catch {
        return false;
      }
    });

    for (const file of recentFiles) {
      const lines: string[] = fs
        .readFileSync(path.join(agentSessDir, file), 'utf8')
        .split('\n');
      let lastUserTs: number | null = null;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          if (!d.timestamp) continue;
          const ts: number = new Date(d.timestamp).getTime();
          if (!ts || ts < cutoff) continue;
          const role: string | undefined = d.message?.role;
          if (role === 'user') {
            lastUserTs = ts;
          } else if (role === 'assistant' && lastUserTs) {
            const diff: number = ts - lastUserTs;
            if (diff > 0 && diff < 15 * 60 * 1000) diffs.push(diff);
            lastUserTs = null;
            if (diffs.length > 4000) break;
          }
        } catch {
          // ignore
        }
      }
      if (diffs.length > 4000) break;
    }

    if (diffs.length === 0) return null;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length / 1000);
  } catch {
    return null;
  }
}

let ventureosAgentsCache: VentureOSAgentsResponse | null = null;
let ventureosAgentsCacheTime: number = 0;

function getVentureosAgents(): VentureOSAgentsResponse {
  const now: number = Date.now();
  if (ventureosAgentsCache && now - ventureosAgentsCacheTime < 5000)
    return ventureosAgentsCache;

  const agents: Record<string, VentureOSAgentSummary> = {};
  for (const agentId of VENTUREOS_AGENTS) {
    const sessions: AgentSessionEntry[] = getAgentSessionsIndex(agentId);
    const last24h: AgentSessionEntry[] = sessions.filter(
      (s) => now - (s.updatedAt || 0) < 24 * 3600000,
    );
    const success: number = last24h.filter((s) => !s.aborted).length;
    const failure: number = last24h.filter((s) => s.aborted).length;
    const total: number = success + failure;
    const maxUpdatedAt: number = sessions.reduce((m, s) => Math.max(m, s.updatedAt || 0), 0);
    const status: string =
      maxUpdatedAt && now - maxUpdatedAt < 120000 ? 'working' : 'idle';
    const avgLatencySeconds: number | null = getAgentAvgLatencySeconds(agentId);

    const recentSessions = last24h
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 10)
      .map((s) => ({
        label: s.label,
        sessionId: s.sessionId,
        updatedAt: s.updatedAt,
        aborted: s.aborted,
        lastMessage: s.lastMessage || '',
      }));

    const recentCompletions = last24h
      .filter((s) => !s.aborted && now - (s.updatedAt || 0) > 5 * 60000)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 6)
      .map((s) => ({
        label: s.label,
        sessionId: s.sessionId,
        updatedAt: s.updatedAt,
        summary: s.lastMessage || '',
      }));

    const allSuccess: number = sessions.filter((s) => !s.aborted).length;
    const allFailure: number = sessions.filter((s) => s.aborted).length;
    const allTotal: number = allSuccess + allFailure;

    agents[agentId] = {
      agentId,
      status,
      lastActivityMs: maxUpdatedAt || 0,
      sessionCount: sessions.length,
      successRate: allTotal > 0 ? allSuccess / allTotal : null,
      avgLatencyMs:
        typeof avgLatencySeconds === 'number' ? avgLatencySeconds * 1000 : null,
      recentSessions,
      recentSessions24h: last24h.length,
      successRate24h: total > 0 ? success / total : null,
      avgLatencySeconds24h: avgLatencySeconds,
      recentCompletions,
    };
  }

  ventureosAgentsCache = { updatedAt: now, agentIds: VENTUREOS_AGENTS, agents };
  ventureosAgentsCacheTime = now;
  return ventureosAgentsCache;
}

let ventureosKpisCache: Record<string, unknown> | null = null;
let ventureosKpisCacheTime: number = 0;

function computeSloStatus(latest: KpiFileData): SloStatus {
  const slo = latest?.slo ?? {};
  const overall = latest?.overall ?? {};
  const successRate: number | undefined = overall.success_rate;
  const p95s: number | null =
    overall.latency_ms?.p95 != null ? overall.latency_ms.p95 / 1000 : null;
  const backupAgeH: number | undefined = overall.backup?.age_hours;

  const checks: SloCheck[] = [];
  if (typeof slo.success_rate === 'number' && typeof successRate === 'number') {
    let status: 'ok' | 'warn' | 'bad' = 'ok';
    if (successRate < slo.success_rate) status = 'bad';
    else if (successRate < slo.success_rate + 0.01) status = 'warn';
    checks.push({ metric: 'success_rate', status, value: successRate, target: slo.success_rate });
  }
  if (typeof slo.p95_latency_s === 'number' && typeof p95s === 'number') {
    let status: 'ok' | 'warn' | 'bad' = 'ok';
    if (p95s > slo.p95_latency_s) status = 'bad';
    else if (p95s > slo.p95_latency_s * 0.8) status = 'warn';
    checks.push({ metric: 'p95_latency_s', status, value: p95s, target: slo.p95_latency_s });
  }
  if (typeof slo.backup_age_h === 'number' && typeof backupAgeH === 'number') {
    let status: 'ok' | 'warn' | 'bad' = 'ok';
    if (backupAgeH > slo.backup_age_h) status = 'bad';
    else if (backupAgeH > slo.backup_age_h * 0.8) status = 'warn';
    checks.push({ metric: 'backup_age_h', status, value: backupAgeH, target: slo.backup_age_h });
  }

  const rank = (s: string): number => (s === 'bad' ? 2 : s === 'warn' ? 1 : 0);
  const worst: number = checks.reduce((m, c) => Math.max(m, rank(c.status)), 0);
  const overallStatus: 'ok' | 'warn' | 'bad' =
    worst === 2 ? 'bad' : worst === 1 ? 'warn' : 'ok';
  const emoji: string = overallStatus === 'ok' ? '✅' : overallStatus === 'warn' ? '⚠️' : '🔴';
  return { status: overallStatus, emoji, checks };
}

function listKpiFilesLocal(): string[] {
  try {
    if (!fs.existsSync(KPI_DIR)) return [];
    return fs
      .readdirSync(KPI_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

function getVentureOSKpis(): VentureOSKpiResponse {
  const files: string[] = listKpiFilesLocal();
  const slice: string[] = files.slice(-7);

  const round1 = (n: number | null): number | null =>
    typeof n === 'number' && !Number.isNaN(n) ? Math.round(n * 10) / 10 : null;
  const trend7d: KpiTrendItem[] = [];
  let latestRaw: { date: string; successRate: number | null; p95LatencySRaw: number | null } | null = null;

  for (const f of slice) {
    const p: string = path.join(KPI_DIR, f);
    const j = safeReadJson(p, null) as KpiFileData | null;
    if (!j) continue;

    const date: string = j.date ?? f.replace('.json', '');
    const successRate: number | null =
      typeof j.overall?.success_rate === 'number' ? j.overall.success_rate : null;
    const p95ms: number | null =
      typeof j.overall?.latency_ms?.p95 === 'number' ? j.overall.latency_ms.p95 : null;
    const p95LatencySRaw: number | null =
      typeof p95ms === 'number' ? p95ms / 1000 : null;
    const p95LatencyS: number | null =
      typeof p95LatencySRaw === 'number' ? round1(p95LatencySRaw) : null;

    trend7d.push({ date, successRate, p95LatencyS });
    latestRaw = { date, successRate, p95LatencySRaw };
  }

  const sloStatus = (sr: number | null, p95: number | null): string => {
    if (typeof sr !== 'number' || typeof p95 !== 'number') return 'warn';
    if (sr < 0.95 || p95 > 60) return 'critical';
    if (sr < 0.97 || p95 > 50) return 'warn';
    return 'ok';
  };

  const last = trend7d.length > 0 ? trend7d[trend7d.length - 1] : null;
  const latest = last
    ? {
        ...last,
        sloStatus: sloStatus(latestRaw?.successRate ?? null, latestRaw?.p95LatencySRaw ?? null),
      }
    : null;

  return { latest, trend7d };
}

function getVentureosKpis(days: number = 7): Record<string, unknown> {
  const now: number = Date.now();
  if (ventureosKpisCache && now - ventureosKpisCacheTime < 5000) return ventureosKpisCache;

  const files: string[] = listKpiFilesLocal();
  const slice: string[] = files.slice(-days);
  const history: KpiHistoryPoint[] = [];
  for (const f of slice) {
    const p: string = path.join(KPI_DIR, f);
    const j = safeReadJson(p, null) as KpiFileData | null;
    if (!j) continue;
    const overall = j.overall ?? {};
    history.push({
      date: j.date ?? f.replace('.json', ''),
      successRate: typeof overall.success_rate === 'number' ? overall.success_rate : null,
      p50s: overall.latency_ms?.p50 != null ? overall.latency_ms.p50 / 1000 : null,
      p95s: overall.latency_ms?.p95 != null ? overall.latency_ms.p95 / 1000 : null,
      p99s: overall.latency_ms?.p99 != null ? overall.latency_ms.p99 / 1000 : null,
      backupAgeH: overall.backup?.age_hours ?? null,
    });
  }

  const latest: (KpiHistoryPoint & { raw?: KpiFileData }) | null =
    history.length > 0
      ? {
          ...history[history.length - 1],
          raw: safeReadJson(path.join(KPI_DIR, slice[slice.length - 1]), null) as
            | KpiFileData
            | undefined,
        }
      : null;
  const baselineWindow = history.slice(0, Math.max(0, history.length - 1));
  const mean = (arr: (number | null)[]): number | null => {
    const vals: number[] = arr.filter(
      (v): v is number => typeof v === 'number' && !Number.isNaN(v),
    );
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const baseline = {
    successRate: mean(baselineWindow.map((p) => p.successRate)),
    p95s: mean(baselineWindow.map((p) => p.p95s)),
    backupAgeH: mean(baselineWindow.map((p) => p.backupAgeH)),
  };

  ventureosKpisCache = {
    updatedAt: now,
    latest: latest
      ? {
          date: latest.date,
          successRate: latest.successRate,
          p95s: latest.p95s,
          handoffSuccessRate: null,
          backupAgeH: latest.backupAgeH,
          slo: latest.raw?.slo ?? null,
          sloStatus: latest.raw ? computeSloStatus(latest.raw) : null,
        }
      : null,
    baseline,
    history: history.map((p) => ({
      date: p.date,
      successRate: p.successRate,
      p50s: p.p50s,
      p95s: p.p95s,
      p99s: p.p99s,
      backupAgeH: p.backupAgeH,
    })),
  };
  ventureosKpisCacheTime = now;
  return ventureosKpisCache;
}

// ─── Workflow Patterns ───────────────────────────────────────────────────────

let workflowPatternsCache: WorkflowPatternsResponse | null = null;
let workflowPatternsCacheTime: number = 0;

function listWorkflowLogFiles(): string[] {
  const root: string = '/tmp';
  const out: string[] = [];
  const maxFiles: number = 800;

  function walk(dir: string, depth: number): void {
    if (out.length >= maxFiles) return;
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (out.length >= maxFiles) return;
      const full: string = path.join(dir, ent.name);
      if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        out.push(full);
      } else if (ent.isDirectory() && depth > 0) {
        if (ent.name.startsWith('.')) continue;
        walk(full, depth - 1);
      }
    }
  }

  try {
    const dirs: string[] = fs.readdirSync(root).filter((d) => d.startsWith('agent-'));
    for (const d of dirs) {
      const dir: string = path.join(root, d);
      let st: fs.Stats | null = null;
      try {
        st = fs.statSync(dir);
      } catch {
        st = null;
      }
      if (!st || !st.isDirectory()) continue;
      walk(dir, 2);
    }
  } catch {
    // ignore
  }

  return out;
}

function getWorkflowPatterns(): WorkflowPatternsResponse {
  const now: number = Date.now();
  if (workflowPatternsCache && now - workflowPatternsCacheTime < 5000)
    return workflowPatternsCache;

  const logFiles: string[] = listWorkflowLogFiles();
  interface WfRun {
    runId: string;
    startTs: number | null;
    ok: boolean | null;
    verifyCycles: number;
    verifyRetries: number;
    spawnRetries: number;
  }
  const runs: Record<string, WfRun> = {};

  for (const filePath of logFiles) {
    const txt: string = safeReadText(filePath, '');
    if (!txt) continue;
    const lines: string[] = txt.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      let e: WorkflowEvent;
      try {
        e = JSON.parse(line) as WorkflowEvent;
      } catch {
        continue;
      }
      const event: string | undefined = e.event;
      if (!event) continue;
      const runId: string | undefined = e.runId ?? e.runID ?? e.run;
      const ts: number | null = e.ts
        ? new Date(e.ts).getTime()
        : e.timestamp
          ? new Date(e.timestamp).getTime()
          : null;
      if (!runId) continue;
      if (!runs[runId])
        runs[runId] = {
          runId,
          startTs: null,
          ok: null,
          verifyCycles: 0,
          verifyRetries: 0,
          spawnRetries: 0,
        };

      if (event === 'workflow_start') {
        runs[runId].startTs = ts ?? runs[runId].startTs;
      }
      if (event === 'workflow_success') {
        runs[runId].ok = true;
      }
      if (event === 'workflow_fail' || event === 'workflow_failure') {
        runs[runId].ok = false;
      }
      if (event === 'verify_status') {
        const c: number = parseInt(e.cycle ?? '0') || 0;
        runs[runId].verifyCycles = Math.max(runs[runId].verifyCycles, c);
      }
      if (event === 'verify_retry') {
        runs[runId].verifyRetries++;
      }
      if (event === 'spawn_attempt') {
        const attempt: number = parseInt(e.attempt ?? '1') || 1;
        if (attempt > 1) runs[runId].spawnRetries++;
      }
    }
  }

  const runList: WfRun[] = Object.values(runs).filter((r) => r.startTs);
  const totalWorkflowRuns: number = runList.length;
  const successful: number = runList.filter((r) => r.ok === true).length;
  const failed: number = runList.filter((r) => r.ok === false).length;
  const successRate: number | null =
    totalWorkflowRuns > 0 ? successful / totalWorkflowRuns : null;

  const vcycles: number[] = runList.map((r) => r.verifyCycles || 0).filter((n) => n > 0);
  const avgVerifyCycles: number = vcycles.length
    ? vcycles.reduce((a, b) => a + b, 0) / vcycles.length
    : 0;
  const maxVerifyCycles: number = vcycles.length ? Math.max(...vcycles) : 0;

  const retryCounts: number[] = runList.map(
    (r) => (r.verifyRetries || 0) + (r.spawnRetries || 0),
  );
  const avgRetries: number = retryCounts.length
    ? retryCounts.reduce((a, b) => a + b, 0) / retryCounts.length
    : 0;
  const maxRetries: number = retryCounts.length ? Math.max(...retryCounts) : 0;

  const perDay: Record<
    string,
    {
      runs: number;
      success: number;
      failure: number;
      verifyCyclesSum: number;
      verifyCyclesMax: number;
      retriesSum: number;
    }
  > = {};
  for (const r of runList) {
    const day: string = new Date(r.startTs!).toISOString().substring(0, 10);
    if (!perDay[day])
      perDay[day] = {
        runs: 0,
        success: 0,
        failure: 0,
        verifyCyclesSum: 0,
        verifyCyclesMax: 0,
        retriesSum: 0,
      };
    perDay[day].runs++;
    if (r.ok === true) perDay[day].success++;
    if (r.ok === false) perDay[day].failure++;
    perDay[day].verifyCyclesSum += r.verifyCycles || 0;
    perDay[day].verifyCyclesMax = Math.max(perDay[day].verifyCyclesMax, r.verifyCycles || 0);
    perDay[day].retriesSum += (r.verifyRetries || 0) + (r.spawnRetries || 0);
  }

  const perDayArr = Object.entries(perDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, d]) => ({
      day,
      runs: d.runs,
      success: d.success,
      failure: d.failure,
      avgVerifyCycles: d.runs ? d.verifyCyclesSum / d.runs : 0,
      maxVerifyCycles: d.verifyCyclesMax,
      avgRetries: d.runs ? d.retriesSum / d.runs : 0,
    }));

  workflowPatternsCache = {
    updatedAt: now,
    totals: {
      totalWorkflowRuns,
      successful,
      failed,
      successRate,
      avgVerifyCycles: Math.round(avgVerifyCycles * 100) / 100,
      maxVerifyCycles,
      avgRetries: Math.round(avgRetries * 100) / 100,
      maxRetries,
    },
    perDay: perDayArr.slice(-30),
  };
  workflowPatternsCacheTime = now;
  return workflowPatternsCache;
}

// ─── Mission Control ─────────────────────────────────────────────────────────

let missionControlCache: MissionControlResponse | null = null;
let missionControlCacheTime: number = 0;

function getMissionControl(): MissionControlResponse {
  const now: number = Date.now();
  if (missionControlCache && now - missionControlCacheTime < 5000)
    return missionControlCache;

  const activeWorkMd: string = safeReadText(ACTIVE_WORK_PATH, '');
  const prioritiesMd: string = safeReadText(PRIORITIES_PATH, '');

  const agentStats: VentureOSAgentsResponse = getVentureosAgents();
  const completions: Array<{
    agentId: string;
    label: string;
    sessionId: string;
    updatedAt: number;
    summary: string;
  }> = [];
  for (const [agentId, a] of Object.entries(agentStats.agents ?? {})) {
    for (const c of a.recentCompletions ?? []) {
      completions.push({ agentId, ...c });
    }
  }
  completions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const team = {
    overall: Object.values(agentStats.agents ?? {}).some((a) => a.status === 'working')
      ? 'busy'
      : 'idle',
    agents: Object.values(agentStats.agents ?? {}).map((a) => ({
      agentId: a.agentId,
      status: a.status,
      lastActivityMs: a.lastActivityMs,
      successRate24h: a.successRate24h,
      recentSessions24h: a.recentSessions24h,
      avgLatencySeconds24h: a.avgLatencySeconds24h,
    })),
  };

  missionControlCache = {
    updatedAt: now,
    activeWorkMd,
    prioritiesMd,
    team,
    recentCompletions: completions.slice(0, 20),
  };
  missionControlCacheTime = now;
  return missionControlCache;
}

// ─── Observational Memory (Archivist) ────────────────────────────────────────

let observationsCache: {
  updatedAt: number;
  entries: ObservationEntry[];
  tags: TagCount[];
  index: Record<string, unknown> | null;
} | null = null;
let observationsCacheTime: number = 0;

function parseObservationFile(date: string, filePath: string): ObservationEntry[] {
  const content: string = safeReadText(filePath, '');
  if (!content) return [];
  const entries: ObservationEntry[] = [];

  const blocks: string[] = content
    .split(/\n---\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const dayBase: number | null = (() => {
    try {
      return new Date(`${date}T00:00:00`).getTime();
    } catch {
      return null;
    }
  })();

  for (let idx = 0; idx < blocks.length; idx++) {
    const block: string = blocks[idx];
    const m: RegExpMatchArray | null = block.match(/^## \[([^\]]+)\] (.+)$/m);
    if (!m) continue;

    const when: string = (m[1] ?? '').trim();
    const title: string = (m[2] ?? '').trim();
    const ctx: string = (block.match(/\*\*Context\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const action: string = (block.match(/\*\*Action\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const outcome: string = (block.match(/\*\*Outcome\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const tagsLine: string = (block.match(/\*\*Tags\*\*:\s*([^\n]+)/) ?? [])[1] ?? '';
    const tags: string[] = tagsLine
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.startsWith('#'));

    let tsMs: number | null = null;
    const timeMatch: RegExpMatchArray | null = when.match(/^(\d{2}):(\d{2})$/);
    if (timeMatch && dayBase) {
      tsMs = dayBase + parseInt(timeMatch[1]) * 3600000 + parseInt(timeMatch[2]) * 60000;
    } else if (dayBase) {
      const w: string = when.toLowerCase();
      let hour: number = 0;
      if (w.includes('morning')) hour = 9;
      else if (w.includes('noon') || w.includes('midday')) hour = 12;
      else if (w.includes('afternoon')) hour = 15;
      else if (w.includes('evening')) hour = 19;
      else if (w.includes('night')) hour = 23;
      tsMs = dayBase + hour * 3600000 + idx * 1000;
    }

    entries.push({ date, time: when, tsMs, title, context: ctx, action, outcome, tags, raw: block });
  }

  return entries;
}

function getAllObservations(): {
  updatedAt: number;
  entries: ObservationEntry[];
  tags: TagCount[];
  index: Record<string, unknown> | null;
} {
  const now: number = Date.now();
  if (observationsCache && now - observationsCacheTime < 5000) return observationsCache;

  const dir: string = OBSERVATIONS_DIR;
  const files: string[] = [];
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) files.push(f);
      }
    }
  } catch {
    // ignore
  }

  const entries: ObservationEntry[] = [];
  const tagCounts: Record<string, number> = {};

  for (const f of files.sort()) {
    const date: string = f.replace('.md', '');
    const fp: string = path.join(dir, f);
    for (const e of parseObservationFile(date, fp)) {
      entries.push(e);
      for (const tag of e.tags ?? []) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  entries.sort((a, b) => (b.tsMs ?? 0) - (a.tsMs ?? 0));
  const tags: TagCount[] = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([tag, count]) => ({ tag, count }));

  const idx = safeReadJson(path.join(dir, 'index.json'), null);

  observationsCache = { updatedAt: now, entries, tags, index: idx };
  observationsCacheTime = now;
  return observationsCache;
}

function searchObservations(params: ObservationSearchParams): {
  updatedAt: number;
  total: number;
  entries: ObservationEntry[];
} {
  const obs = getAllObservations();
  let entries: ObservationEntry[] = obs.entries ?? [];
  if (params.tag) entries = entries.filter((e) => (e.tags ?? []).includes(params.tag!));
  if (params.topic) {
    const idx = obs.index as { topics?: Record<string, string[]> } | null;
    const dates: string[] = idx?.topics?.[params.topic] ?? [];
    entries = entries.filter((e) => dates.includes(e.date));
  }
  if (params.q) {
    const qq: string = params.q.toLowerCase();
    entries = entries.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(qq) ||
        (e.context || '').toLowerCase().includes(qq) ||
        (e.action || '').toLowerCase().includes(qq) ||
        (e.outcome || '').toLowerCase().includes(qq) ||
        (e.raw || '').toLowerCase().includes(qq),
    );
  }
  const total: number = entries.length;
  const slice: ObservationEntry[] = entries.slice(params.offset, params.offset + params.limit);
  return { updatedAt: obs.updatedAt, total, entries: slice };
}

// ─── Health History ──────────────────────────────────────────────────────────

let healthHistory: HealthSnapshot[] = readHealthHistory(healthHistoryFile);

function saveHealthSnapshot(): void {
  try {
    const stats: SystemStats = getSystemStats();
    const now: number = Date.now();
    healthHistory.push({
      t: now,
      cpu: stats.cpu?.usage ?? 0,
      ram: stats.memory?.percent ?? 0,
    });
    if (healthHistory.length > 288) {
      healthHistory = healthHistory.slice(-288);
    }
    const dir: string = path.dirname(healthHistoryFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(healthHistoryFile, JSON.stringify(healthHistory));
  } catch (e: unknown) {
    console.error('Health snapshot error:', e);
  }
}

setInterval(saveHealthSnapshot, 5 * 60 * 1000);
saveHealthSnapshot();

// ─── Lifetime Stats Cache ────────────────────────────────────────────────────

let lifetimeStatsCache: LifetimeStats | null = null;
let lifetimeStatsCacheTime: number = 0;

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server: Server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
  // ── Phase 5.1 Security Middleware Pipeline ────────────────────────
  applySecurityHeaders(res);
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (!authenticate(req, res)) return;
  if (!rateLimit(req, res)) return;
  if (!authorizeActionRequest(req, res)) return;
  // ── End Security Middleware ───────────────────────────────────────

  // ── Correlation ID (Issue #195) — wraps the async handler ─────────
  const handleRequest = async () => {
    const reqStart = Date.now();

    logInfo('dashboard', 'request_received', `${req.method} ${(req.url ?? '/').split('?')[0]}`, {
      method: req.method ?? 'UNKNOWN',
      path: (req.url ?? '/').split('?')[0],
      ip: req.socket?.remoteAddress ?? 'unknown',
    });

    // Log on response finish for latency tracking
    res.on('finish', () => {
      const latencyMs = Date.now() - reqStart;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const logFn = level === 'error' ? slogError : level === 'warn' ? logWarn : logInfo;
      logFn('dashboard', 'request_completed', `${req.method} ${(req.url ?? '/').split('?')[0]} → ${res.statusCode}`, {
        method: req.method ?? 'UNKNOWN',
        path: (req.url ?? '/').split('?')[0],
        statusCode: res.statusCode,
        latencyMs,
      });
    });

  // ── Health Check (unauthenticated — for container healthchecks) ─── Issue #191
  if (req.url === '/api/health' && req.method === 'GET') {
    sendJson(res, {
      ok: true,
      service: 'ventureos-dashboard',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dataMode: DASHBOARD_DATA_MODE,
    });
    return;
  }

  // Auth session endpoints (cookie-based browser auth)
  if (req.url === '/api/login' && req.method === 'POST') {
    try {
      const raw: string = await readRequestBody(req);
      const ct: string = ((req.headers['content-type'] as string | undefined) ?? '').toLowerCase();
      let providedToken: string = '';

      if (ct.includes('application/json')) {
        try {
          const parsed = JSON.parse(raw || '{}') as { token?: string };
          providedToken = (parsed.token ?? '').toString();
        } catch {
          // ignore
        }
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(raw);
          providedToken = (params.get('token') ?? '').toString();
        } catch {
          // ignore
        }
      } else {
        providedToken = (raw ?? '').toString();
      }

      providedToken = providedToken.trim();
      const validToken: string = getToken();

      if (!providedToken || !timingSafeStringEqual(providedToken, validToken)) {
        logAuthEvent('login_failure', req, providedToken ? 'Invalid token' : 'Missing token');
        logWarn('auth', 'login_failure', 'Login attempt failed', { reason: providedToken ? 'invalid_token' : 'missing_token' });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
        return;
      }

      res.setHeader('Set-Cookie', buildAuthCookie(req, validToken));
      logAuthEvent('login_success', req, 'Auth cookie issued');
      logInfo('auth', 'login_success', 'User authenticated via login');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
      return;
    }
  }

  if (req.url === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', buildClearAuthCookie(req));
    logAuthEvent('logout', req, 'Auth cookie cleared');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Conversation adapter routes (Issue #live-data) ─────────────────────
  // The <live-conversation-panel> component fetches /api/rpg/conversations/active
  // and /api/rpg/conversations/:id, but the real conversation API lives at
  // /api/conversation/conversations. These adapter routes bridge the mismatch
  // by internally rewriting the URL so handleConversationApi handles it.
  if (req.url && req.url.startsWith('/api/rpg/conversations')) {
    const convUrl = new URL(req.url, 'http://localhost');
    const convSubPath = convUrl.pathname.slice('/api/rpg/conversations'.length);

    // GET /api/rpg/conversations/active → list + enrich with state
    if (req.method === 'GET' && (convSubPath === '/active' || convSubPath === '/active/')) {
      try {
        // Internally call the conversation list endpoint
        const origUrl = req.url;
        (req as { url: string }).url = '/api/conversation/conversations';
        const listResult = await new Promise<{ conversations: string[] }>((resolve, reject) => {
          const fakeRes = {
            writeHead(_status: number, _headers?: Record<string, string>) { /* no-op */ },
            end(body?: string) { 
              try { resolve(JSON.parse(body ?? '{}')); }
              catch { reject(new Error('Failed to parse conversation list')); }
            },
            setHeader() {},
            getHeader() { return undefined; },
            write() { return true; },
          } as unknown as ServerResponse;
          const handled = handleConversationApi(req, fakeRes, { dbPath: RPG_DB_PATH });
          if (!handled) reject(new Error('Conversation API did not handle list request'));
        });
        (req as { url: string }).url = origUrl;

        // Enrich: fetch state for each conversation
        const enriched: Array<{ id: string; title: string; status: string }> = [];
        const convIds = listResult.conversations ?? [];
        for (const id of convIds.slice(0, 20)) {
          try {
            const innerReq = Object.create(req, {
              url: { value: `/api/conversation/conversations/${encodeURIComponent(id)}`, writable: true },
              method: { value: 'GET', writable: true },
            });
            const state = await new Promise<Record<string, unknown>>((resolve, reject) => {
              const fakeRes2 = {
                writeHead(_status: number) { /* no-op */ },
                end(body?: string) {
                  try { resolve(JSON.parse(body ?? '{}')); }
                  catch { reject(new Error('Parse error')); }
                },
                setHeader() {},
                getHeader() { return undefined; },
                write() { return true; },
              } as unknown as ServerResponse;
              const handled = handleConversationApi(innerReq, fakeRes2, { dbPath: RPG_DB_PATH });
              if (!handled) reject(new Error('not handled'));
            });
            enriched.push({
              id,
              title: (state as any).metadata?.title ?? `Conversation ${id.slice(0, 8)}`,
              status: (state as any).status ?? 'active',
            });
          } catch {
            enriched.push({ id, title: `Conversation ${id.slice(0, 8)}`, status: 'unknown' });
          }
        }

        sendJson(res, { ok: true, conversations: enriched });
      } catch (e: unknown) {
        // If no conversations exist yet, return empty list (not an error)
        sendJson(res, { ok: true, conversations: [] });
      }
      return;
    }

    // GET /api/rpg/conversations/:id → fetch full state, wrap for component
    if (req.method === 'GET' && convSubPath && /^\/[a-zA-Z0-9_-]+\/?$/.test(convSubPath)) {
      const convId = convSubPath.replace(/^\//, '').replace(/\/$/, '');
      try {
        const innerReq = Object.create(req, {
          url: { value: `/api/conversation/conversations/${encodeURIComponent(convId)}`, writable: true },
          method: { value: 'GET', writable: true },
        });
        const state = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const fakeRes3 = {
            writeHead(_status: number) { /* no-op */ },
            end(body?: string) {
              try { resolve(JSON.parse(body ?? '{}')); }
              catch { reject(new Error('Parse error')); }
            },
            setHeader() {},
            getHeader() { return undefined; },
            write() { return true; },
          } as unknown as ServerResponse;
          const handled = handleConversationApi(innerReq, fakeRes3, { dbPath: RPG_DB_PATH });
          if (!handled) reject(new Error('not handled'));
        });

        // Transform ConversationState → component-expected shape
        const convState = state as any;
        const participants = (convState.participants ?? []).map((agentId: string) => ({
          agent: agentId,
          status: agentId === convState.currentTurn ? 'active' : 'idle',
          lastActive: convState.updatedAt ?? new Date().toISOString(),
        }));
        const messages = (convState.messages ?? []).map((m: any, i: number) => ({
          id: m.messageId ?? `msg-${i}`,
          agent: m.from ?? 'unknown',
          type: m.payload?.type ?? 'fact',
          text: m.content ?? '',
          timestamp: m.createdAt ?? new Date().toISOString(),
          violations: [],
          injectionScore: m.security?.injectionScore ?? 0,
        }));

        sendJson(res, {
          ok: true,
          conversation: {
            id: convState.conversationId ?? convId,
            title: convState.metadata?.title ?? `Conversation ${convId.slice(0, 8)}`,
            status: convState.status ?? 'active',
            participants,
            messages,
            currentSpeaker: convState.currentTurn ?? null,
            queue: [],
            affinities: [],
          },
        });
      } catch (e: unknown) {
        sendJson(res, { ok: false, error: 'Conversation not found' }, 404);
      }
      return;
    }
  }

  // Conversation API (Issue #78 — monorepo integration)
  if (handleConversationApi(req, res, { dbPath: RPG_DB_PATH })) return;

  // VentureOS RPG APIs (Issue #78 — monorepo integration)
  if (handleRpgApi(req, res, { dbPath: RPG_DB_PATH })) return;

  // VentureOS Progression V2 APIs (Issue #207 — Phase 4.5 Phase 2)
  if (handleProgressionV2Api(req, res, { dbPath: RPG_DB_PATH })) return;

  // VentureOS Progression APIs (Issue #203 — Phase 4.5)
  if (handleProgressionApi(req, res, { dbPath: RPG_DB_PATH })) return;

  // VentureOS APIs
  if (req.url && req.url.startsWith('/api/ventureos-kpis')) {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/ventureos-kpis',
        forwardQuery: true,
      })
    )
      return;
    const params = new URL(req.url, 'http://localhost').searchParams;
    const days: number = clampInt(params.get('days'), 1, 60, 7);
    sendJson(res, getVentureosKpis(days));
    return;
  }
  if (req.url === '/api/ventureos-agents') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/ventureos-agents',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getVentureosAgents());
    return;
  }
  if (req.url === '/api/workflow-patterns') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/workflow-patterns',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getWorkflowPatterns());
    return;
  }
  if (req.url === '/api/mission-control') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/mission-control',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getMissionControl());
    return;
  }
  if (req.url === '/api/observations-index') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/observations-index',
        forwardQuery: true,
      })
    )
      return;
    const obs = getAllObservations();
    sendJson(res, {
      updatedAt: obs.updatedAt,
      tags: obs.tags,
      index: obs.index,
      total: obs.entries?.length ?? 0,
    });
    return;
  }
  if (req.url && req.url.startsWith('/api/observations?')) {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/observations',
        forwardQuery: true,
      })
    )
      return;
    const params = new URL(req.url, 'http://localhost').searchParams;
    const q: string = params.get('q') ?? '';
    const tag: string = params.get('tag') ?? '';
    const topic: string = params.get('topic') ?? '';
    const limit: number = clampInt(params.get('limit'), 1, 200, 30);
    const offset: number = clampInt(params.get('offset'), 0, 100000, 0);
    sendJson(
      res,
      searchObservations({
        q: q.trim() || null,
        tag: tag.trim() || null,
        topic: topic.trim() || null,
        limit,
        offset,
      }),
    );
    return;
  }
  if (req.url && req.url.startsWith('/api/observations/')) {
    const targetPath = req.url.split('?')[0].replace('/api/observations', '/api/bridge/observations');
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath,
        forwardQuery: true,
      })
    )
      return;
  }

  if (req.url && req.url.startsWith('/api/kpis/')) {
    const targetPath = req.url.split('?')[0].replace('/api/kpis', '/api/bridge/kpis');
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath,
        forwardQuery: true,
      })
    )
      return;
  }

  // Modular route handlers
  try {
    if (handleKpis(req, res, { KPI_DIR, safeReadJson, sendJson, clampInt })) return;
  } catch {
    // ignore
  }
  try {
    if (
      handleObservations(req, res, {
        OBSERVATIONS_DIR,
        safeReadText,
        sendJson,
        clampInt,
      })
    )
      return;
  } catch {
    // ignore
  }

  // Memory State API — Phase 4 (#233)
  try {
    if (handleMemoryState(req, res, {
      dbPath: process.env.OBSERVATIONS_DB_PATH ?? path.join(dataDir, 'observations.db'),
      defaultAgentId: AGENT_ID,
      sendJson,
    })) return;
  } catch {
    // ignore
  }

  // Obsidian Vault Connector — Issue #299
  try {
    if (await handleObsidianConnector(req, res, {
      dataDir,
      sendJson,
      readRequestBody,
    })) return;
  } catch {
    // ignore
  }

  // Local OpenClaw readiness summary (Mission Control card)
  try {
    if (handleOpenclawLocalReadiness(req, res, {
      reportDir: OPENCLAW_LOCAL_READINESS_REPORT_DIR,
      sendJson,
    })) return;
  } catch {
    // ignore
  }

  // Unified Search — Issue #302
  try {
    if (await handleUnifiedSearch(req, res, {
      dataDir,
      observationsDir: OBSERVATIONS_DIR,
      sendJson,
    })) return;
  } catch {
    // ignore
  }

  // Shared-Context Activity Feed — Phase 4 (#244)
  if (req.url && req.url.startsWith('/api/shared-context/')) {
    try {
      if (handleSharedContext(req, res, {
        teamDbPath: process.env.TEAM_DB_PATH ?? path.join(dataDir, 'teams.db'),
        auditDbPath: process.env.AUDIT_DB_PATH ?? path.join(dataDir, 'shared-context-audit.db'),
        sharedContextDir: SHARED_CONTEXT,
        sendJson,
        clampInt,
      })) return;
    } catch (e: unknown) {
      const safe = toSafeError(e, { route: 'shared-context' });
      slogError('dashboard', 'route_error', 'shared-context error', { errorRef: safe.errorRef });
      sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
      return;
    }
  }

  try {
    if (
      req.url &&
      req.url.startsWith('/api/agent-health') &&
      (await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/agent-health',
        forwardQuery: true,
      }))
    )
      return;
    if (handleAgentHealth(req, res, { OPENCLAW_DIR, WORKSPACE_DIR, sendJson })) return;
  } catch {
    // ignore
  }
  try {
    if (
      handleTacticalMapLive(req, res, {
        openclawDir: OPENCLAW_DIR,
        dataDir,
        sendJson,
        isAuthenticated,
        primaryAgentId: AGENT_ID,
      })
    )
      return;
  } catch {
    // ignore
  }

  try {
    if (
      await handleTacticalMapControls(req, res, {
        dataDir,
        sendJson,
        readRequestBody,
      })
    )
      return;
  } catch {
    // ignore
  }

  // Tactical Map Replay Sessions — Issue #193
  try {
    if (
      await handleTacticalMapReplay(req, res, {
        dataDir,
        sendJson,
        readRequestBody,
        clampInt,
      })
    )
      return;
  } catch {
    // ignore
  }

  if (req.url === '/api/sessions') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/sessions',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getSessionsJson());
    return;
  }
  if (req.url === '/api/usage') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/usage',
        forwardQuery: true,
      })
    )
      return;
    const now: number = Date.now();
    if (!usageCache || now - usageCacheTime > 10000) {
      usageCache = getUsageWindows();
      usageCacheTime = now;
    }
    sendJson(res, usageCache);
    return;
  }
  if (req.url === '/api/costs') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/costs',
        forwardQuery: true,
      })
    )
      return;
    const now: number = Date.now();
    if (!costCache || now - costCacheTime > 60000) {
      costCache = getCostData();
      costCacheTime = now;
    }
    sendJson(res, costCache);
    return;
  }
  if (req.url === '/api/system') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/system',
        forwardQuery: true,
      })
    )
      return;
    const stats: SystemStats & { diskHistory?: Array<{ t: number; v: number }> } = getSystemStats();
    if (stats.disk) stats.diskHistory = trackDiskHistory(stats.disk.percent || 0);
    sendJson(res, stats);
    return;
  }

  if (req.url && req.url.startsWith('/api/model-routing/security')) {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const limit = params.has('limit')
        ? Math.max(1, Math.min(Number(params.get('limit')) || 100, 1000))
        : undefined;
      const router = getDefaultModelRouter();

      if (req.url.startsWith('/api/model-routing/security/injections')) {
        const events = router.getInjectionDetections(limit ?? 100);
        sendJson(res, {
          updatedAt: Date.now(),
          total: events.length,
          events,
        });
        return;
      }

      const summary = router.getSecurityRoutingSummary(limit);
      sendJson(res, {
        summary,
        integrations: {
          source: 'model-router',
          dashboardReady: true,
        },
      });
    } catch {
      sendJson(res, { error: 'Failed to load model-routing security metrics' }, 500);
    }
    return;
  }

  try {
    if (await handleTokenCompaction(req, res, { dataDir, sendJson, readRequestBody })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process token compaction request' }, 500);
    return;
  }

  try {
    if (await handleSelfImprovement(req, res, {
      dataDir,
      workspaceDir: WORKSPACE_DIR,
      defaultAgentId: AGENT_ID,
      sendJson,
      readRequestBody,
    }))
      return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process self-improvement request' }, 500);
    return;
  }

  try {
    if (await handleCodeFactory(req, res, { dataDir, workspaceDir: WORKSPACE_DIR, sendJson, readRequestBody })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process code-factory request' }, 500);
    return;
  }

  try {
    if (await handleWebMcp(req, res, { sendJson, readRequestBody })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process WebMCP request' }, 500);
    return;
  }

  try {
    if (await handleVisualExplainer(req, res, { sendJson, readRequestBody })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process visual-explainer request' }, 500);
    return;
  }

  try {
    if (await handleProposalLifecycle(req, res, {
      dataDir,
      sendJson,
      readRequestBody,
      isAuthenticated,
    })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process proposal lifecycle request' }, 500);
    return;
  }

  try {
    if (await handleLivingFiles(req, res, {
      dataDir,
      workspaceDir: WORKSPACE_DIR,
      sendJson,
      readRequestBody,
    })) return;
  } catch {
    sendJson(res, { ok: false, error: 'Failed to process living-files request' }, 500);
    return;
  }

  // VentureOS API aliases
  if (req.url === '/api/ventureos-mission-control') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/mission-control',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getMissionControl());
    return;
  }
  if (
    (req.url && req.url.startsWith('/api/ventureos-feature-flags')) ||
    (req.url && req.url.startsWith('/api/feature-flags'))
  ) {
    const flags: VentureOSFeatureFlagsResponse = {
      updatedAt: Date.now(),
      officeViewEnabled: readEnvFlag('VENTUREOS_OFFICE_VIEW_ENABLED', false),
    };
    sendJson(res, flags);
    return;
  }
  if (req.url === '/api/ventureos-workflow-patterns') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/workflow-patterns',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getWorkflowPatterns());
    return;
  }
  if (req.url === '/api/ventureos-observations') {
    const data = ventureCached('ventureos:observationsIndex', () => {
      const obs = getAllObservations();
      return {
        updatedAt: obs.updatedAt,
        tags: obs.tags,
        index: obs.index,
        total: obs.entries?.length ?? 0,
        entries: (obs.entries ?? []).slice(0, 50),
      };
    });
    sendJson(res, data);
    return;
  }
  if (req.url && req.url.startsWith('/api/ventureos-observation?')) {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/observation',
        forwardQuery: true,
      })
    )
      return;
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const rel: string = params.get('path') ?? '';
      const cacheKey: string = 'ventureos:observationFile:' + rel;
      const data = ventureCached(cacheKey, () => {
        const fpath: string | null = getObservationFile(rel);
        if (!fpath) return { ok: false, error: 'Not found' };
        return { ok: true, path: rel, content: safeReadText(fpath, '') };
      });
      sendJson(res, data);
    } catch {
      sendJson(res, { ok: false, error: 'Bad request' }, 400);
    }
    return;
  }

  if (req.url && req.url.startsWith('/api/session-messages?')) {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/session-messages',
        forwardQuery: true,
      })
    )
      return;
    const params = new URL(req.url, 'http://localhost').searchParams;
    const rawId: string = params.get('id') ?? '';
    const sessionId: string = rawId.replace(/[^a-zA-Z0-9\-_:.]/g, '');
    const messages: Array<{ role: string; content: string; timestamp: string }> = [];
    try {
      const files: string[] = fs.readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
      let targetFile: string | undefined = files.find((f) => f.includes(sessionId));
      if (!targetFile) {
        const sFile: string = path.join(sessDir, 'sessions.json');
        const data = JSON.parse(fs.readFileSync(sFile, 'utf8')) as Record<string, SessionsJsonEntry>;
        for (const [k, v] of Object.entries(data)) {
          if (k === sessionId && v.sessionId) {
            targetFile = files.find((f) => f.includes(v.sessionId!));
            break;
          }
        }
      }
      if (targetFile) {
        const lines: string[] = fs
          .readFileSync(path.join(sessDir, targetFile), 'utf8')
          .split('\n')
          .filter((l) => l.trim());
        for (let i = Math.max(0, lines.length - 30); i < lines.length; i++) {
          try {
            const d = JSON.parse(lines[i]) as JsonlEntry;
            if (d.type !== 'message') continue;
            const msg: SessionMessage | undefined = d.message;
            if (!msg) continue;
            let text: string = '';
            if (typeof msg.content === 'string') text = msg.content;
            else if (Array.isArray(msg.content)) {
              for (const b of msg.content) {
                if (b.type === 'text' && b.text) {
                  text = b.text;
                  break;
                }
                if (b.type === 'tool_use' || b.type === 'toolCall') {
                  text = '🔧 ' + (b.name ?? b.toolName ?? 'tool');
                  break;
                }
              }
            }
            if (text)
              messages.push({
                role: msg.role ?? 'unknown',
                content: text.substring(0, 300),
                timestamp: d.timestamp ?? '',
              });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
    sendJson(res, messages);
    return;
  }
  if (req.url === '/api/crons') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/crons',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getCronJobs());
    return;
  }
  if (req.url) {
    const schedulerUrl = new URL(req.url, 'http://localhost');
    if (schedulerUrl.pathname === '/api/scheduler-jobs') {
      if (
        await proxyBridgeJson(req, res, bridgeProxyDeps, {
          targetPath: '/api/bridge/scheduler-jobs',
          forwardQuery: true,
        })
      )
        return;
      const jobs: SchedulerJobInfo[] = getSchedulerJobs({
        cronFile,
        openclawDir: OPENCLAW_DIR,
      });
      sendJson(res, jobs);
      return;
    }
  }
  if (req.url === '/api/git') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/git',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getGitActivity());
    return;
  }
  if (req.url === '/api/services') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/services',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getServicesStatus());
    return;
  }
  if (req.url === '/api/memory') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/memory',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getMemoryFiles());
    return;
  }
  if (req.url === '/api/tokens-today') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/tokens-today',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, getTodayTokens());
    return;
  }
  if (req.url === '/api/config') {
    sendJson(res, {
      name: 'OpenClaw Dashboard',
      version: '1.0.0',
      overviewFreshnessThresholdsMs: OVERVIEW_FRESHNESS_THRESHOLDS_MS,
      overviewFreshnessTimelineLimit: OVERVIEW_FRESHNESS_TIMELINE_LIMIT,
      overviewFreshnessEventDedupeWindowMs: OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS,
      ventureos: {
        VENTUREOS_ROOT,
        SHARED_CONTEXT,
        KPI_DIR,
        OBSERVATIONS_DIR,
      },
      capabilities: [
        { id: 'dashboard', name: 'OpenClaw Dashboard', version: '1.0.0', port: PORT, status: 'active' },
        { id: 'tactical-map', name: 'Tactical Map', status: 'active' },
        { id: 'rpg-api', name: 'VentureOS RPG API', status: 'active' },
        { id: 'conversation-api', name: 'Conversation API', status: 'active' },
        { id: 'kpi-tracker', name: 'KPI Tracker', status: 'active' },
        { id: 'observations', name: 'Observational Memory', status: 'active' },
        { id: 'agent-health', name: 'Agent Health Monitor', status: 'active' },
        { id: 'mission-control', name: 'Mission Control', status: 'active' },
        { id: 'workflow-patterns', name: 'Workflow Patterns', status: 'active' },
      ],
    });
    return;
  }
  if (req.url && req.url.startsWith('/api/overview-freshness-events') && req.method === 'GET') {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const limit = clampInt(
        params.get('limit') ?? String(OVERVIEW_FRESHNESS_TIMELINE_LIMIT),
        1,
        40,
        OVERVIEW_FRESHNESS_TIMELINE_LIMIT,
      );
      const events = readOverviewFreshnessEvents(dataDir, { limit });
      sendJson(res, {
        ok: true,
        limit,
        events,
        dedupeWindowMs: OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS,
      });
    } catch {
      sendJson(res, { ok: false, error: 'Invalid freshness events query' }, 400);
    }
    return;
  }
  if (req.url === '/api/overview-freshness-event' && req.method === 'POST') {
    try {
      const raw = await readRequestBody(req, { maxBytes: 32 * 1024 });
      const payload: unknown = JSON.parse(raw || '{}');
      const event = parseOverviewFreshnessEvent(payload);
      if (!event) {
        sendJson(res, { ok: false, error: 'Invalid freshness event payload' }, 400);
        return;
      }

      const dedupe = evaluateOverviewFreshnessEventForPersistence(
        event,
        OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS,
        overviewFreshnessEventDedupeState,
        event.receivedAt || Date.now(),
      );
      if (dedupe.accepted) {
        appendOverviewFreshnessEvent(dataDir, event);
        if (event.state === 'stale') {
          logWarn('dashboard', 'overview_freshness_stale', 'Overview freshness stale state reported', {
            stale: event.stale,
            aging: event.aging,
            unavailable: event.unavailable,
            total: event.total,
            source: event.source,
          });
        } else {
          logInfo('dashboard', 'overview_freshness_update', 'Overview freshness non-stale update reported', {
            state: event.state,
            stale: event.stale,
            aging: event.aging,
            unavailable: event.unavailable,
            total: event.total,
            source: event.source,
          });
        }
      } else {
        logInfo('dashboard', 'overview_freshness_duplicate_suppressed', 'Suppressed duplicate overview freshness event', {
          state: event.state,
          stale: event.stale,
          aging: event.aging,
          unavailable: event.unavailable,
          total: event.total,
          source: event.source,
          dedupeWindowMs: OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS,
        });
      }

      sendJson(res, {
        ok: true,
        state: event.state,
        recordedAt: event.receivedAt,
        accepted: dedupe.accepted,
        dedupeWindowMs: OVERVIEW_FRESHNESS_EVENT_DEDUPE_WINDOW_MS,
        duplicateOfReceivedAt: dedupe.duplicateOfReceivedAt,
      });
    } catch {
      sendJson(res, { ok: false, error: 'Invalid freshness event payload' }, 400);
    }
    return;
  }
  if (req.url === '/api/claude-usage-scrape' && req.method === 'POST') {
    if (fs.existsSync(scrapeScript)) {
      exec(`bash ${scrapeScript}`, { timeout: 60000 }, () => {});
      sendJson(res, { status: 'started' });
    } else {
      sendJson(res, { status: 'error', message: 'Scrape script not found' });
    }
    return;
  }
  if (req.url === '/api/claude-usage') {
    try {
      const data = JSON.parse(fs.readFileSync(claudeUsageFile, 'utf8')) as Record<string, unknown>;
      sendJson(res, data);
    } catch {
      sendJson(res, { error: 'No usage data. Run scrape-claude-usage.sh first.' });
    }
    return;
  }
  if (req.url === '/api/response-time') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/response-time',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, { avgSeconds: getAvgResponseTime() });
    return;
  }
  // Incident Report Bundle — Issue #195: Observability
  if (req.url && req.url.startsWith('/api/incident-report') && req.method === 'POST') {
    try {
      logInfo('dashboard', 'incident_report_requested', 'Incident report bundle generation started');
      const params = new URL(req.url, 'http://localhost').searchParams;
      const windowMinutes = clampInt(params.get('window') ?? '30', 1, 1440, 30);

      // Dynamic import to avoid loading at startup
      const { generateIncidentBundle } = await import('../../scripts/incident-report.js');
      const bundle = await generateIncidentBundle(windowMinutes);
      logInfo('dashboard', 'incident_report_generated', `Bundle generated (${windowMinutes}m window, ${bundle.sections.structuredLogs.length} log entries)`);
      sendJson(res, bundle);
    } catch (e: unknown) {
      const safe = toSafeError(e, { action: 'incident-report' });
      slogError('dashboard', 'incident_report_failed', 'Failed to generate incident bundle', { errorRef: safe.errorRef });
      sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
    }
    return;
  }

  // Logs API — Issue #137: Observability Logs Page
  try {
    if (handleLogs(req, res, { LOG_DIR, VENTUREOS_ROOT, sendJson, clampInt })) return;
  } catch {
    // ignore
  }

  // Changelog / Release Notes — Issue #211
  try {
    if (handleChangelog(req, res, { ventureosRoot: VENTUREOS_ROOT, sendJson, clampInt })) return;
  } catch {
    // ignore
  }

  // Task Board (Kanban) — Issue #219
  if (req.url && req.url.startsWith('/api/task-board')) {
    try {
      const handled = await handleTaskBoard(req, res, {
        dataDir: DASHBOARD_DATA_DIR,
        sendJson,
        readRequestBody,
        emitEvent: emitTaskEvent,
      });
      if (handled) return;
    } catch (e: unknown) {
      const safe = toSafeError(e, { route: 'task-board' });
      slogError('dashboard', 'route_error', 'task-board error', { errorRef: safe.errorRef });
      sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
      return;
    }
  }

  // Action endpoints — extracted for maintainability (Issue #450)
  if (
    await handleActionRoutes(req, res, {
      sendJson,
      runShellCommand,
      resolveRestartActionCommand,
      toSafeError,
      logInfo,
      logError: slogError,
      clearCaches: () => {
        costCache = null;
        usageCache = null;
        costCacheTime = 0;
        usageCacheTime = 0;
      },
      workspaceDir: WORKSPACE_DIR,
      execCommand: exec,
    })
  )
    return;

  // RPG API compatibility routes (legacy aliases → canonical /api/rpg/*)
  if (handleRpgCompat(req, res, { dbPath: RPG_DB_PATH, handleRpgApi })) return;

  if (req.url === '/api/tailscale') {
    try {
      const statusJson: string = execSync('tailscale status --json 2>/dev/null', {
        encoding: 'utf8',
        timeout: 5000,
      });
      const status = JSON.parse(statusJson) as {
        Self?: { HostName?: string; TailscaleIPs?: string[]; Online?: boolean };
        Peer?: Record<string, { Online?: boolean }>;
      };
      const self = status.Self ?? {};
      const peers: number = Object.values(status.Peer ?? {}).filter((p) => p.Online).length;
      let routes: string[] = [];
      try {
        const serveStatus: string = execSync('tailscale serve status 2>/dev/null', {
          encoding: 'utf8',
          timeout: 3000,
        });
        if (serveStatus && !serveStatus.includes('No serve config')) {
          routes = serveStatus
            .split('\n')
            .filter((l) => l.includes('http'))
            .map((l) => l.trim());
        }
      } catch {
        // ignore
      }
      sendJson(res, {
        hostname: self.HostName ?? 'unknown',
        ip: self.TailscaleIPs?.[0] ?? 'unknown',
        online: self.Online ?? false,
        peers,
        routes,
      });
    } catch {
      sendJson(res, {
        error: 'Tailscale not available',
        hostname: '--',
        ip: '--',
        online: false,
        peers: 0,
        routes: [],
      });
    }
    return;
  }

  if (req.url === '/api/lifetime-stats') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/lifetime-stats',
        forwardQuery: true,
      })
    )
      return;
    try {
      const now: number = Date.now();
      if (lifetimeStatsCache && now - lifetimeStatsCacheTime < 300000) {
        sendJson(res, lifetimeStatsCache);
        return;
      }
      const result: LifetimeStats = buildLifetimeStats({ sessDir });
      lifetimeStatsCache = result;
      lifetimeStatsCacheTime = now;
      sendJson(res, result);
    } catch {
      sendJson(res, {
        totalTokens: 0,
        totalMessages: 0,
        totalCost: 0,
        totalSessions: 0,
        firstSessionDate: null,
        daysActive: 0,
      });
    }
    return;
  }

  if (req.url === '/api/health-history') {
    if (
      await proxyBridgeJson(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/health-history',
        forwardQuery: true,
      })
    )
      return;
    sendJson(res, healthHistory);
    return;
  }
  if (req.url === '/api/memory-files') {
    sendJson(res, getMemoryFiles());
    return;
  }
  if (req.url && req.url.startsWith('/api/memory-file?')) {
    try {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const fname: string = params.get('path') ?? '';
      let fpath: string = '';
      if (fname === 'MEMORY.md') fpath = memoryMdPath;
      else if (fname === 'HEARTBEAT.md') fpath = heartbeatPath;
      else if (fname.startsWith('memory/') && !fname.includes('..'))
        fpath = path.join(WORKSPACE_DIR, fname);
      else throw new Error('Invalid path');

      if (fs.existsSync(fpath)) {
        const content: string = fs.readFileSync(fpath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
    }
    return;
  }

  if (req.url && req.url.startsWith('/api/cron/') && req.method === 'POST') {
    try {
      const parts: string[] = req.url.split('/');
      const action: string = parts[parts.length - 1];
      const id: string = parts[parts.length - 2].replace(/[^a-zA-Z0-9\-_]/g, '');
      if (!id) {
        res.writeHead(400);
        res.end('Invalid id');
        return;
      }

      if (action === 'toggle') {
        if (!fs.existsSync(cronFile)) throw new Error('No cron file');
        const data = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as {
          jobs?: Array<{ id: string; enabled?: boolean }>;
        };
        const job = (data.jobs ?? []).find((j) => j.id === id);
        if (!job) throw new Error('Job not found');
        job.enabled = !job.enabled;
        fs.writeFileSync(cronFile, JSON.stringify(data, null, 2));
        sendJson(res, { success: true, enabled: job.enabled });
      } else if (action === 'run') {
        exec(`openclaw cron run ${id}`, { timeout: 60000 }, () => {});
        sendJson(res, { success: true });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e: unknown) {
      const safe = toSafeError(e, { action: 'cron' });
      sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
    }
    return;
  }

  // ── Live Telemetry SSE (Issue #live-data-v1) ──────────────────────────────
  if (req.url === '/api/live-telemetry') {
    if (
      await proxyBridgeSse(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/live-telemetry',
        forwardQuery: true,
      })
    )
      return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    function buildTelemetrySnapshot(): TelemetrySnapshot {
      const sys: SystemStats = getSystemStats();
      const sess: SessionInfo[] = getSessionsJson();
      const now: number = Date.now();
      const running: number = sess.filter(
        (s) => now - s.updatedAt < 300000 && !s.aborted,
      ).length;

      // Cost data (cached)
      const nowMs: number = Date.now();
      if (!costCache || nowMs - costCacheTime > 60000) {
        costCache = getCostData();
        costCacheTime = nowMs;
      }

      // Usage data (cached)
      if (!usageCache || nowMs - usageCacheTime > 10000) {
        usageCache = getUsageWindows();
        usageCacheTime = nowMs;
      }

      // VentureOS agents
      const vaResp: VentureOSAgentsResponse = getVentureosAgents();
      const busyIds: string[] = Object.values(vaResp.agents ?? {})
        .filter((a) => a.status === 'working')
        .map((a) => a.agentId);

      // KPI snapshot
      const vKpis = getVentureOSKpis();
      const kpiLatest = vKpis.latest;

      return {
        type: 'telemetry',
        ts: nowMs,
        system: {
          cpuUsage: sys.cpu?.usage ?? 0,
          memoryPercent: sys.memory?.percent ?? 0,
          memoryUsedGB: sys.memory?.usedGB ?? '0.0',
          memoryTotalGB: sys.memory?.totalGB ?? '0.0',
          diskPercent: sys.disk?.percent ?? 0,
          loadAvg1m: sys.loadAvg?.['1m'] ?? '0',
          uptime: sys.uptime ?? 0,
        },
        agents: {
          total: Object.keys(vaResp.agents ?? {}).length,
          active: busyIds.length,
          busyIds,
        },
        sessions: {
          total: sess.length,
          running,
        },
        costs: {
          today: costCache?.today ?? 0,
          week: costCache?.week ?? 0,
        },
        usage: {
          opusPct: usageCache?.current?.opusPct ?? 0,
          sonnetPct: usageCache?.current?.sonnetPct ?? 0,
          totalCost5h: usageCache?.current?.totalCost ?? 0,
          totalCalls5h: usageCache?.current?.totalCalls ?? 0,
          burnTokensPerMin: usageCache?.burnRate?.tokensPerMinute ?? 0,
          burnCostPerMin: usageCache?.burnRate?.costPerMinute ?? 0,
        },
        kpi: {
          successRate: kpiLatest?.successRate ?? null,
          p95LatencyS: kpiLatest?.p95LatencyS ?? null,
          sloStatus: kpiLatest?.sloStatus ?? null,
          date: kpiLatest?.date ?? null,
        },
      };
    }

    // Send initial snapshot immediately
    try {
      const initial: TelemetrySnapshot = buildTelemetrySnapshot();
      res.write(`data: ${JSON.stringify(initial)}\n\n`);
    } catch {
      // If the client disconnects before the first write completes, safely stop.
      return;
    }

    // Push updates every 5 seconds
    const telemetryInterval: NodeJS.Timeout = setInterval(() => {
      try {
        if (!res.writable) {
          clearInterval(telemetryInterval);
          return;
        }
        const snap: TelemetrySnapshot = buildTelemetrySnapshot();
        res.write(`data: ${JSON.stringify(snap)}\n\n`);
      } catch {
        clearInterval(telemetryInterval);
      }
    }, 5000);

    req.on('close', () => {
      clearInterval(telemetryInterval);
    });

    return;
  }

  if (req.url === '/api/live') {
    if (
      await proxyBridgeSse(req, res, bridgeProxyDeps, {
        targetPath: '/api/bridge/live',
        forwardQuery: true,
      })
    )
      return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    liveClients.push(res);
    startLiveWatcher();

    res.write('data: {"status":"connected"}\n\n');

    try {
      const cutoff: number = Date.now() - 3600000;
      const files: string[] = fs.readdirSync(sessDir).filter((f) => {
        if (!f.endsWith('.jsonl')) return false;
        try {
          return fs.statSync(path.join(sessDir, f)).mtimeMs > cutoff;
        } catch {
          return false;
        }
      });
      const recentEvents: LiveEvent[] = [];
      files.forEach((file) => {
        const sessionKey: string = file.replace('.jsonl', '');
        const content: string = fs.readFileSync(path.join(sessDir, file), 'utf8');
        const lines: string[] = content.split('\n').filter((l) => l.trim());
        lines.slice(-5).forEach((line) => {
          try {
            const data = JSON.parse(line) as JsonlEntry;
            data._sessionKey = sessionKey;
            const event: LiveEvent | null = formatLiveEvent(data);
            if (event) recentEvents.push(event);
          } catch {
            // ignore
          }
        });
      });
      recentEvents.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      recentEvents.slice(0, 20).forEach((event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });
    } catch {
      // ignore
    }

    req.on('close', () => {
      liveClients = liveClients.filter((client) => client !== res);
      if (liveClients.length === 0) {
        if (liveWatcher) {
          try {
            liveWatcher.close();
          } catch {
            // ignore
          }
          liveWatcher = null;
        }
        Object.keys(_fileWatchers).forEach((k) => {
          try {
            _fileWatchers[k].close();
          } catch {
            // ignore
          }
          delete _fileWatchers[k];
        });
      }
    });

    return;
  }

  // Serve dashboard client static assets
  if (tryServeStatic(req, res, { urlPrefix: '/assets/', rootDir: clientAssetsDir })) return;

  // Serve Tactical Map static files
  const TACTICAL_MAP_DIST: string = path.join(
    VENTUREOS_ROOT,
    'tactical-map',
    'dist',
  );
  if (tryServeStatic(req, res, { urlPrefix: '/map/', rootDir: TACTICAL_MAP_DIST })) return;

  // Serve VentureOS RPG static modules/assets — auth-gated (Issue #145)
  if (req.url && req.url.startsWith('/rpg/') && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }
    if (tryServeStatic(req, res, { urlPrefix: '/rpg/', rootDir: RPG_ROOT })) return;
  }

  // Public login page
  if (req.method === 'GET' && (req.url === '/login' || (req.url && req.url.startsWith('/login?')))) {
    if (isAuthenticated(req)) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    try {
      const html: string = fs.readFileSync(loginHtmlPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('Error loading login page');
    }
    return;
  }

  // Dashboard HTML — gated behind auth
  if (req.method === 'GET' && req.url && !req.url.startsWith('/api/')) {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }

    try {
      const wantsVisualExplainer = req.url === '/visual-explainer' || req.url.startsWith('/visual-explainer?');
      const html: string = fs.readFileSync(wantsVisualExplainer ? visualExplainerHtmlPath : htmlPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('Error loading dashboard');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');

  }; // end handleRequest

  // Run with correlation context (Issue #195)
  withCorrelationId(req, res, handleRequest);
});

export { server };

server.on('upgrade', (req: IncomingMessage, socket: import('node:net').Socket, head: Buffer) => {
  if (
    handleProposalLifecycleUpgrade(req, socket, head, {
      dataDir,
      sendJson,
      readRequestBody,
      isAuthenticated,
    })
  ) {
    return;
  }

  if (
    handleTacticalMapLiveUpgrade(req, socket, head, {
      openclawDir: OPENCLAW_DIR,
      dataDir,
      sendJson,
      isAuthenticated,
      primaryAgentId: AGENT_ID,
    })
  ) {
    return;
  }

  try {
    socket.destroy();
  } catch {
    // ignore
  }
});

// ─── Startup Diagnostics ─────────────────────────────────────────────────────

function logStartupDiagnostics(): void {
  const runtimeMode: string = import.meta.dirname.includes('/dist/')
    ? 'dist (compiled)'
    : 'source (tsx/dev)';
  console.log('[STARTUP] Dashboard runtime diagnostics');
  console.log(`[STARTUP]   mode:              ${runtimeMode}`);
  console.log(`[STARTUP]   VENTUREOS_ROOT:    ${VENTUREOS_ROOT}`);
  console.log(`[STARTUP]   DASHBOARD_DATA_DIR:${DASHBOARD_DATA_DIR}`);
  console.log(`[STARTUP]   TOKEN_PATH:        ${path.join(DASHBOARD_DATA_DIR, '.api-token')}`);
  console.log(`[STARTUP]   PORT:              ${PORT}`);

  // Drift guard: warn if a stale dist-relative token exists
  const canonical: string = path.resolve(path.join(DASHBOARD_DATA_DIR, '.api-token'));
  const distRelative: string = path.resolve(path.join(import.meta.dirname, '..', '..', 'data', '.api-token'));
  if (canonical !== distRelative && fs.existsSync(distRelative)) {
    console.warn(`[STARTUP] ⚠️  DRIFT: stale token at ${distRelative}`);
    console.warn(`[STARTUP]    Canonical: ${canonical}`);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Dashboard: http://${HOST}:${PORT}`);
  logStartupDiagnostics();
});
