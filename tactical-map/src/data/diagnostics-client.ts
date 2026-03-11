/**
 * Diagnostics API Client — Issue #205
 *
 * Fetches per-agent diagnostics data from the dashboard API
 * and transforms it into the format expected by the DiagnosticsPanel.
 */

import { API } from '@/config';
import type { AgentId } from '@/config';
import { fetchJson, getAuthToken } from '@/utils/fetch';
import type { DiagnosticsData } from '@/renderer/diagnostics-panel';

// ═══════════════════════════════════════════
// Raw API Response Types
// ═══════════════════════════════════════════

export interface RawMetricSample {
  ts?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  latencyMs?: number;
  requestsPerSec?: number;
  errorRate?: number;
}

export interface RawSessionDetail {
  key?: string;
  label?: string;
  updatedAt?: number;
  aborted?: boolean;
}

export interface RawErrorEntry {
  ts?: number;
  level?: string;
  message?: string;
  sessionKey?: string | null;
}

export interface RawAlertEntry {
  id?: string;
  severity?: string;
  title?: string;
  message?: string;
  metric?: string | null;
  value?: number | null;
  threshold?: number | null;
  createdAt?: number;
}

export interface RawDiagnosticsResponse {
  agentId?: string;
  now?: number;
  healthScore?: number;
  sessionCount?: number;
  abortedCount?: number;
  successRate?: number | null;
  recentSessions?: RawSessionDetail[];
  metricsHistory?: RawMetricSample[];
  recentErrors?: RawErrorEntry[];
  alerts?: RawAlertEntry[];
}

// ═══════════════════════════════════════════
// Transform
// ═══════════════════════════════════════════

function toNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return fallback;
}

/**
 * Transform raw API response into the panel's data model.
 */
export function transformDiagnostics(
  raw: RawDiagnosticsResponse,
  agentId: AgentId,
): DiagnosticsData {
  const history = Array.isArray(raw.metricsHistory) ? raw.metricsHistory : [];

  return {
    agentId,
    healthScore: toNumber(raw.healthScore, 0),
    sessionCount: toNumber(raw.sessionCount, 0),
    abortedCount: toNumber(raw.abortedCount, 0),
    successRate: raw.successRate !== null && raw.successRate !== undefined
      ? toNumber(raw.successRate, 0)
      : null,
    metricsHistory: {
      cpuUsage: history.map((s) => toNumber(s.cpuUsage, 0)),
      memoryUsage: history.map((s) => toNumber(s.memoryUsage, 0)),
      latencyMs: history.map((s) => toNumber(s.latencyMs, 0)),
      errorRate: history.map((s) => toNumber(s.errorRate, 0)),
    },
    recentErrors: (raw.recentErrors ?? []).map((e) => ({
      ts: toNumber(e.ts, 0),
      message: typeof e.message === 'string' ? e.message : 'Unknown error',
      level: typeof e.level === 'string' ? e.level : 'error',
    })),
    alerts: (raw.alerts ?? []).map((a) => ({
      severity: (a.severity === 'P0' || a.severity === 'P1') ? a.severity : 'P1',
      title: typeof a.title === 'string' ? a.title : 'Alert',
      message: typeof a.message === 'string' ? a.message : '',
    })),
  };
}

// ═══════════════════════════════════════════
// Client
// ═══════════════════════════════════════════

export type DiagnosticsClientOptions = {
  onData?: (data: DiagnosticsData) => void;
  onError?: (error: unknown) => void;
  /** Override the base URL. */
  baseUrl?: string;
};

export type DiagnosticsClient = {
  /** Fetch diagnostics for an agent. */
  fetch: (agentId: AgentId) => Promise<DiagnosticsData>;
};

export function createDiagnosticsClient(
  opts: DiagnosticsClientOptions = {},
  deps: { fetchJson?: typeof fetchJson; getAuthToken?: typeof getAuthToken } = {},
): DiagnosticsClient {
  const _fetchJson = deps.fetchJson ?? fetchJson;
  const _getAuthToken = deps.getAuthToken ?? getAuthToken;
  const baseUrl = opts.baseUrl ?? `${API.BASE_URL}/agent-health`;

  async function fetchDiagnostics(agentId: AgentId): Promise<DiagnosticsData> {
    const token = _getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `${baseUrl}/${agentId}/diagnostics`;
    const raw = await _fetchJson<RawDiagnosticsResponse>(url, { headers });
    const data = transformDiagnostics(raw, agentId);
    opts.onData?.(data);
    return data;
  }

  return {
    fetch: fetchDiagnostics,
  };
}

export const __test = {
  transformDiagnostics,
  toNumber,
};
