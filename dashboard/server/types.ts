/**
 * Shared types for the OpenClaw Dashboard server.
 * All request/response types and domain models live here.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

// ─── HTTP Primitives ─────────────────────────────────────────────────────────

/** Incoming HTTP request with possible socket properties. */
export interface DashboardRequest extends IncomingMessage {
  socket: Socket & { remoteAddress?: string; encrypted?: boolean };
}

/** Standard JSON API response envelope. */
export interface ApiResponse<T = unknown> {
  ok?: boolean;
  error?: string;
  [key: string]: T | boolean | string | number | undefined;
}

// ─── Dependency Injection Bags ───────────────────────────────────────────────

/** Dependencies injected into KPI route handlers. */
export interface KpiDeps {
  KPI_DIR: string;
  safeReadJson: (filePath: string, fallback: null) => Record<string, unknown> | null;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  clampInt: (n: string | number, lo: number, hi: number, dflt: number) => number;
}

/** Dependencies injected into Observations route handlers. */
export interface ObservationsDeps {
  OBSERVATIONS_DIR: string;
  safeReadText: (filePath: string, fallback: string) => string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  clampInt: (n: string | number, lo: number, hi: number, dflt: number) => number;
}

/** Dependencies injected into Agent Health route handlers. */
export interface AgentHealthDeps {
  OPENCLAW_DIR: string;
  WORKSPACE_DIR: string;
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Result of a rate limit check. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/** Per-endpoint rate limit config. */
export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Parsed cookie key-value map. */
export type CookieMap = Record<string, string>;

// ─── Audit Log ───────────────────────────────────────────────────────────────

/** A single audit log entry. */
export interface AuditLogEntry {
  ts: string;
  event: string;
  ip: string;
  method: string;
  path: string;
  userAgent: string;
  [key: string]: string | number | boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface DashboardConfig {
  VENTUREOS_ROOT: string;
  SHARED_CONTEXT: string;
  KPI_DIR: string;
  OBSERVATIONS_DIR: string;
}

// ─── KPI Domain ──────────────────────────────────────────────────────────────

/** A single KPI file read from disk. */
export interface KpiFileData {
  date: string;
  overall?: {
    success_rate?: number;
    latency_ms?: {
      p50?: number;
      p95?: number;
      p99?: number;
    };
    handoff?: { success_rate?: number };
    backup?: { age_hours?: number };
  };
  slo?: {
    success_rate?: number;
    p95_latency_s?: number;
    backup_age_h?: number;
  };
  [key: string]: unknown;
}

/** KPI 7-day trend item. */
export interface KpiTrendItem {
  date: string;
  successRate: number | null;
  p95LatencyS: number | null;
}

/** VentureOS KPI response. */
export interface VentureOSKpiResponse {
  latest: (KpiTrendItem & { sloStatus: string }) | null;
  trend7d: KpiTrendItem[];
}

/** KPI history point. */
export interface KpiHistoryPoint {
  date: string;
  successRate: number | null;
  p50s: number | null;
  p95s: number | null;
  p99s: number | null;
  backupAgeH: number | null;
}

/** SLO status check result. */
export interface SloCheck {
  metric: string;
  status: 'ok' | 'warn' | 'bad';
  value: number;
  target: number;
}

export interface SloStatus {
  status: 'ok' | 'warn' | 'bad';
  emoji: string;
  checks: SloCheck[];
}

// ─── Observations Domain ─────────────────────────────────────────────────────

/** Observation file metadata from directory listing. */
export interface ObservationFileMeta {
  path: string;
  full: string;
  mtimeMs: number;
  size: number;
  type: 'md' | 'jsonl';
}

/** Parsed observation entry from a daily .md file. */
export interface ObservationEntry {
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

/** Tag count for observation tag cloud. */
export interface TagCount {
  tag: string;
  count: number;
}

/** Search parameters for observations. */
export interface ObservationSearchParams {
  q: string | null;
  tag: string | null;
  topic: string | null;
  limit: number;
  offset: number;
}

// ─── Agent Health Domain ─────────────────────────────────────────────────────

/** Summary of an agent's health. */
export interface AgentSummary {
  agentId: string;
  sessionsDir: string;
  sessionCount: number;
  abortedCount: number;
  successRate: number | null;
  lastUpdatedAt: number;
  lastLabel: string | null;
}

/** Agent health API response. */
export interface AgentHealthResponse {
  now: number;
  openclawDir: string;
  workspaceDir: string;
  lastActiveMs: number;
  workspace: { bytes: number; bytesHuman: string | null };
  openclaw: { bytes: number; bytesHuman: string | null };
  agents: AgentSummary[];
}

// ─── Sessions Domain ─────────────────────────────────────────────────────────

/** A session as returned from the sessions API. */
export interface SessionInfo {
  key: string;
  label: string;
  model: string;
  totalTokens: number;
  contextTokens: number;
  kind: string;
  updatedAt: number;
  createdAt: number;
  aborted: boolean;
  thinkingLevel: string | null;
  channel: string;
  sessionId: string;
  lastMessage: string;
  cost: number;
}

/** Sessions JSON file entry. */
export interface SessionsJsonEntry {
  sessionId?: string;
  label?: string;
  modelOverride?: string;
  model?: string;
  totalTokens?: number;
  contextTokens?: number;
  kind?: string;
  updatedAt?: number;
  createdAt?: number;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  channel?: string;
}

// ─── Cost Domain ─────────────────────────────────────────────────────────────

/** Cost data response. */
export interface CostData {
  total: number;
  today: number;
  week: number;
  perModel: Record<string, number>;
  perDay: Record<string, number>;
  perSession: Record<string, { cost: number; label: string }>;
}

// ─── Usage Domain ────────────────────────────────────────────────────────────

/** Per-model usage stats for a time window. */
export interface ModelUsageStats {
  input: number;
  output: number;
  cost: number;
  calls: number;
}

/** Usage API response. */
export interface UsageWindowsResponse {
  fiveHour: {
    perModel: Record<string, ModelUsageStats>;
    perModelCost?: Record<string, { inputCost: number; outputCost: number; totalCost: number }>;
    windowStart: number | null;
    windowResetIn: number;
    recentCalls?: Array<{ ts: number; model: string; input: number; output: number; cost: number; ago: string }>;
  };
  weekly: {
    perModel: Record<string, ModelUsageStats>;
  };
  burnRate?: { tokensPerMinute: number; costPerMinute: number };
  estimatedLimits?: { opus: number; sonnet: number };
  current?: {
    opusOutput: number;
    sonnetOutput: number;
    totalCost: number;
    totalCalls: number;
    opusPct: number;
    sonnetPct: number;
    costPct: number;
    messagePct: number;
    costLimit: number;
    messageLimit: number;
  };
  predictions?: { timeToLimit: number | null; safe: boolean };
}

// ─── System Stats Domain ─────────────────────────────────────────────────────

/** System resource stats. */
export interface SystemStats {
  cpu: { usage: number; temp: number | null };
  disk: { percent: number; used: string; total: string };
  crashCount: number;
  crashesToday: number;
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
    totalGB: string;
    usedGB: string;
    freeGB: string;
  };
  loadAvg: { '1m': string; '5m': string; '15m': string };
  uptime: number;
  diskHistory?: Array<{ t: number; v: number }>;
}

// ─── Live Feed Domain ────────────────────────────────────────────────────────

/** A formatted live event sent over SSE. */
export interface LiveEvent {
  timestamp: string;
  session: string;
  role: string;
  content: string;
}

// ─── Cron Domain ─────────────────────────────────────────────────────────────

/** Cron job info as returned from the API. */
export interface CronJobInfo {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastStatus: string;
  lastRunAt: number;
  nextRunAt: number;
  lastDuration: number;
}

// ─── VentureOS Agents Domain ─────────────────────────────────────────────────

/** Agent session index entry. */
export interface AgentSessionEntry {
  agentId: string;
  key: string;
  sessionId: string;
  label: string;
  updatedAt: number;
  createdAt: number;
  aborted: boolean;
  model: string;
  lastMessage: string;
}

/** Agent metrics for the agents API. */
export interface AgentMetrics {
  agentId: string;
  sessionsDir: string;
  sessionCount: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  status: string;
  lastUpdatedAt: number;
  recentSessions: Array<{
    key: string;
    sessionId: string | null;
    label: string;
    updatedAt: number;
    createdAt: number;
    aborted: boolean;
  }>;
}

/** VentureOS agent summary. */
export interface VentureOSAgentSummary {
  agentId: string;
  status: string;
  lastActivityMs: number;
  sessionCount: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  recentSessions: Array<{
    label: string;
    sessionId: string;
    updatedAt: number;
    aborted: boolean;
    lastMessage: string;
  }>;
  recentSessions24h: number;
  successRate24h: number | null;
  avgLatencySeconds24h: number | null;
  recentCompletions: Array<{
    label: string;
    sessionId: string;
    updatedAt: number;
    summary: string;
  }>;
}

/** VentureOS agents API response. */
export interface VentureOSAgentsResponse {
  updatedAt: number;
  agentIds: string[];
  agents: Record<string, VentureOSAgentSummary>;
}

// ─── Mission Control Domain ──────────────────────────────────────────────────

export interface MissionControlResponse {
  updatedAt: number;
  activeWorkMd: string;
  prioritiesMd: string;
  team: {
    overall: string;
    agents: Array<{
      agentId: string;
      status: string;
      lastActivityMs: number;
      successRate24h: number | null;
      recentSessions24h: number;
      avgLatencySeconds24h: number | null;
    }>;
  };
  recentCompletions: Array<{
    agentId: string;
    label: string;
    sessionId: string;
    updatedAt: number;
    summary: string;
  }>;
}

// ─── Workflow Patterns Domain ────────────────────────────────────────────────

export interface WorkflowPatternsResponse {
  updatedAt: number;
  totals: {
    totalWorkflowRuns: number;
    successful: number;
    failed: number;
    successRate: number | null;
    avgVerifyCycles: number;
    maxVerifyCycles: number;
    avgRetries: number;
    maxRetries: number;
  };
  perDay: Array<{
    day: string;
    runs: number;
    success: number;
    failure: number;
    avgVerifyCycles: number;
    maxVerifyCycles: number;
    avgRetries: number;
  }>;
}

// ─── Health History ──────────────────────────────────────────────────────────

export interface HealthSnapshot {
  t: number;
  cpu: number;
  ram: number;
}

// ─── JSONL Message Types ─────────────────────────────────────────────────────

/** A content block inside a message. */
export interface MessageContentBlock {
  type: string;
  text?: string;
  name?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  content?: string | unknown;
  thinking?: string;
}

/** Usage info attached to a message. */
export interface MessageUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
}

/** A message from a JSONL session file. */
export interface SessionMessage {
  role?: string;
  model?: string;
  content?: string | MessageContentBlock[];
  usage?: MessageUsage;
  type?: string;
  stopReason?: string;
}

/** A JSONL line entry. */
export interface JsonlEntry {
  type: string;
  timestamp?: string;
  ts?: string;
  message?: SessionMessage;
  _sessionKey?: string;
  event?: string;
  [key: string]: unknown;
}

// ─── Git Domain ──────────────────────────────────────────────────────────────

export interface GitCommit {
  repo: string;
  hash: string;
  message: string;
  timestamp: number;
}

export interface GitRepo {
  path: string;
  name: string;
}

// ─── Lifetime Stats ──────────────────────────────────────────────────────────

export interface LifetimeStats {
  totalTokens: number;
  totalMessages: number;
  totalCost: number;
  totalSessions: number;
  firstSessionDate: number | null;
  daysActive: number;
}

// ─── Workflow Run Tracking ───────────────────────────────────────────────────

export interface WorkflowRun {
  runId: string;
  agentId: string;
  startTs: number | null;
  verifyCyclesMax: number;
  retries: number;
  spawnRetries: number;
  ok: boolean | null;
}

export interface WorkflowEvent {
  event: string;
  runId?: string;
  runID?: string;
  run?: string;
  ts?: string;
  timestamp?: string;
  agentId?: string;
  cycle?: string;
  status?: string;
  attempt?: string;
  ok?: boolean;
  cyclesUsed?: string;
  [key: string]: unknown;
}
