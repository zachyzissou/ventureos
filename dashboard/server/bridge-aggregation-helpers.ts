import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getPlatformServiceStatuses } from './platform-ops.js';

interface BridgeAgentSessionEntry {
  sessionId: string;
  label: string;
  updatedAt: number;
  createdAt: number;
  aborted: boolean;
  lastMessage: string;
}

interface BridgeAggregationDeps {
  activeWorkPath: string;
  cronFile: string;
  heartbeatPath: string;
  memoryDir: string;
  memoryMdPath: string;
  openclawDir: string;
  prioritiesPath: string;
  readJson: (filePath: string, fallback: Record<string, unknown> | null) => Record<string, unknown> | null;
  readText: (filePath: string, fallback?: string) => string;
  ventureosAgents: string[];
  workspaceDir: string;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getLastMessageFromDir(agentSessDir: string, sessionId: string): string {
  try {
    const filePath = path.join(agentSessDir, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return '';
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((line) => line.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
      try {
        const row = JSON.parse(lines[i]) as {
          type?: string;
          message?: { role?: string; content?: unknown };
        };
        if (row.type !== 'message') continue;
        const msg = row.message;
        if (!msg || msg.role !== 'assistant') continue;
        if (typeof msg.content === 'string') return msg.content.slice(0, 150);
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (
              block &&
              typeof block === 'object' &&
              (block as { type?: string }).type === 'text'
            ) {
              const text = (block as { text?: string }).text ?? '';
              if (text) return text.slice(0, 150);
            }
          }
        }
      } catch {
        // ignore line parse errors
      }
    }
  } catch {
    // ignore read errors
  }
  return '';
}

function getAgentSessionsIndex(
  agentId: string,
  deps: Pick<BridgeAggregationDeps, 'openclawDir' | 'readJson'>,
): BridgeAgentSessionEntry[] {
  try {
    const safeAgentId = agentId.toLowerCase().replace(/[^a-z0-9\-_]/g, '');
    if (!safeAgentId) return [];
    const agentSessDir = path.join(deps.openclawDir, 'agents', safeAgentId, 'sessions');
    const indexPath = path.join(agentSessDir, 'sessions.json');
    if (!fs.existsSync(indexPath)) return [];
    const data = deps.readJson(indexPath, {}) as Record<string, Record<string, unknown>>;
    const items = Object.entries(data).map(([key, entry]) => {
      const sessionId = String(entry.sessionId ?? key);
      const updatedAt = parseNumber(entry.updatedAt, 0);
      const createdAt = parseNumber(entry.createdAt, updatedAt);
      return {
        sessionId,
        label: String(entry.label ?? sessionId),
        updatedAt,
        createdAt,
        aborted: entry.abortedLastRun === true,
        lastMessage: getLastMessageFromDir(agentSessDir, sessionId),
      } satisfies BridgeAgentSessionEntry;
    });
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items;
  } catch {
    return [];
  }
}

function listWorkflowLogFiles(): string[] {
  const out: string[] = [];
  const root = '/tmp';

  function walk(dir: string, depth: number): void {
    if (depth < 0 || out.length >= 800) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= 800) return;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full);
      } else if (entry.isDirectory() && depth > 0 && !entry.name.startsWith('.')) {
        walk(full, depth - 1);
      }
    }
  }

  try {
    const dirs = fs.readdirSync(root).filter((name) => name.startsWith('agent-'));
    for (const name of dirs) {
      const dir = path.join(root, name);
      try {
        if (fs.statSync(dir).isDirectory()) walk(dir, 2);
      } catch {
        // ignore invalid entries
      }
    }
  } catch {
    // ignore read errors
  }

  return out;
}

interface CronJobRaw {
  id: string;
  name?: string;
  schedule?: { expr?: string; tz?: string };
  enabled?: boolean;
  state?: {
    lastStatus?: string;
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastDurationMs?: number;
  };
}

function getCronJobs(cronFile: string): Array<{
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastStatus: string;
  lastRunAt: number;
  nextRunAt: number;
  lastDuration: number;
}> {
  try {
    if (!fs.existsSync(cronFile)) return [];
    const data = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as { jobs?: CronJobRaw[] };
    return (data.jobs ?? []).map((job) => ({
      id: job.id,
      name: job.name ?? job.id.slice(0, 8),
      schedule: job.schedule?.expr ?? '',
      enabled: job.enabled !== false,
      lastStatus: job.state?.lastStatus ?? 'unknown',
      lastRunAt: job.state?.lastRunAtMs ?? 0,
      nextRunAt: job.state?.nextRunAtMs ?? 0,
      lastDuration: job.state?.lastDurationMs ?? 0,
    }));
  } catch {
    return [];
  }
}

function getGitActivity(workspaceDir: string): Array<{ repo: string; hash: string; message: string; timestamp: number }> {
  const commits: Array<{ repo: string; hash: string; message: string; timestamp: number }> = [];
  const repos: Array<{ path: string; name: string }> = [];
  const projectsDir = path.join(workspaceDir, 'projects');
  try {
    if (fs.existsSync(projectsDir)) {
      for (const dir of fs.readdirSync(projectsDir)) {
        const full = path.join(projectsDir, dir);
        if (fs.existsSync(path.join(full, '.git'))) repos.push({ path: full, name: dir });
      }
    }
  } catch {
    // ignore
  }
  if (fs.existsSync(path.join(workspaceDir, '.git'))) {
    repos.push({ path: workspaceDir, name: path.basename(workspaceDir) });
  }
  for (const repo of repos) {
    try {
      const raw = execSync(
        `git -C ${repo.path} log --oneline --since='7 days ago' -10 --format='%H|%s|%at'`,
        { encoding: 'utf8', timeout: 5000 },
      ).trim();
      if (!raw) continue;
      for (const line of raw.split('\n')) {
        const [hash, message, ts] = line.split('|');
        commits.push({
          repo: repo.name,
          hash: (hash ?? '').slice(0, 7),
          message: message ?? '',
          timestamp: (parseInt(ts ?? '0', 10) || 0) * 1000,
        });
      }
    } catch {
      // ignore per-repo failures
    }
  }
  commits.sort((a, b) => b.timestamp - a.timestamp);
  return commits.slice(0, 15);
}

function getServicesStatus(): Array<{ name: string; active: boolean }> {
  return getPlatformServiceStatuses();
}

function getMemoryFiles(
  memoryMdPath: string,
  heartbeatPath: string,
  memoryDir: string,
): Array<{ name: string; modified: number; size: number }> {
  const files: Array<{ name: string; modified: number; size: number }> = [];

  try {
    if (fs.existsSync(memoryMdPath)) {
      const stat = fs.statSync(memoryMdPath);
      files.push({ name: 'MEMORY.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(heartbeatPath)) {
      const stat = fs.statSync(heartbeatPath);
      files.push({ name: 'HEARTBEAT.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {
    // ignore
  }

  try {
    if (fs.existsSync(memoryDir)) {
      const entries = fs.readdirSync(memoryDir).filter((name) => name.endsWith('.md')).sort().reverse();
      for (const name of entries) {
        try {
          const stat = fs.statSync(path.join(memoryDir, name));
          files.push({ name: `memory/${name}`, modified: stat.mtimeMs, size: stat.size });
        } catch {
          // ignore missing file races
        }
      }
    }
  } catch {
    // ignore
  }

  return files;
}

export function createBridgeAggregationHelpers(deps: BridgeAggregationDeps): {
  getCronJobs: () => ReturnType<typeof getCronJobs>;
  getGitActivity: () => ReturnType<typeof getGitActivity>;
  getMemoryFiles: () => ReturnType<typeof getMemoryFiles>;
  getMissionControl: () => {
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
  };
  getServicesStatus: () => ReturnType<typeof getServicesStatus>;
  getVentureosAgents: () => {
    updatedAt: number;
    agentIds: string[];
    agents: Record<string, {
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
    }>;
  };
  getWorkflowPatterns: () => {
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
  };
} {
  function getVentureosAgents(): {
    updatedAt: number;
    agentIds: string[];
    agents: Record<string, {
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
    }>;
  } {
    const now = Date.now();
    const agents: Record<string, {
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
    }> = {};

    for (const agentId of deps.ventureosAgents) {
      const sessions = getAgentSessionsIndex(agentId, {
        openclawDir: deps.openclawDir,
        readJson: deps.readJson,
      });
      const last24h = sessions.filter((s) => now - s.updatedAt < 24 * 60 * 60 * 1000);
      const success24h = last24h.filter((s) => !s.aborted).length;
      const total24h = last24h.length;
      const allSuccess = sessions.filter((s) => !s.aborted).length;
      const allTotal = sessions.length;
      const maxUpdatedAt = sessions.reduce((max, s) => Math.max(max, s.updatedAt), 0);

      agents[agentId] = {
        agentId,
        status: maxUpdatedAt > 0 && now - maxUpdatedAt < 120_000 ? 'working' : 'idle',
        lastActivityMs: maxUpdatedAt,
        sessionCount: sessions.length,
        successRate: allTotal > 0 ? allSuccess / allTotal : null,
        avgLatencyMs: null,
        recentSessions: sessions.slice(0, 10).map((s) => ({
          label: s.label,
          sessionId: s.sessionId,
          updatedAt: s.updatedAt,
          aborted: s.aborted,
          lastMessage: s.lastMessage,
        })),
        recentSessions24h: last24h.length,
        successRate24h: total24h > 0 ? success24h / total24h : null,
        avgLatencySeconds24h: null,
        recentCompletions: last24h
          .filter((s) => !s.aborted && now - s.updatedAt > 5 * 60_000)
          .slice(0, 6)
          .map((s) => ({
            label: s.label,
            sessionId: s.sessionId,
            updatedAt: s.updatedAt,
            summary: s.lastMessage,
          })),
      };
    }

    return {
      updatedAt: now,
      agentIds: deps.ventureosAgents,
      agents,
    };
  }

  function getWorkflowPatterns(): {
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
  } {
    const runs: Record<string, {
      startTs: number | null;
      ok: boolean | null;
      verifyCycles: number;
      verifyRetries: number;
      spawnRetries: number;
    }> = {};

    for (const filePath of listWorkflowLogFiles()) {
      const lines = deps.readText(filePath, '').split('\n').filter((line) => line.trim());
      for (const line of lines) {
        let eventRow: Record<string, unknown>;
        try {
          eventRow = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const event = String(eventRow.event ?? '');
        const runId = String(eventRow.runId ?? eventRow.runID ?? eventRow.run ?? '');
        if (!event || !runId) continue;
        if (!runs[runId]) {
          runs[runId] = {
            startTs: null,
            ok: null,
            verifyCycles: 0,
            verifyRetries: 0,
            spawnRetries: 0,
          };
        }

        const tsRaw = String(eventRow.ts ?? eventRow.timestamp ?? '');
        const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
        if (event === 'workflow_start' && Number.isFinite(ts) && ts > 0) runs[runId].startTs = ts;
        if (event === 'workflow_success') runs[runId].ok = true;
        if (event === 'workflow_fail' || event === 'workflow_failure') runs[runId].ok = false;
        if (event === 'verify_status') {
          runs[runId].verifyCycles = Math.max(
            runs[runId].verifyCycles,
            parseInt(String(eventRow.cycle ?? '0'), 10) || 0,
          );
        }
        if (event === 'verify_retry') runs[runId].verifyRetries += 1;
        if (event === 'spawn_attempt') {
          const attempt = parseInt(String(eventRow.attempt ?? '1'), 10) || 1;
          if (attempt > 1) runs[runId].spawnRetries += 1;
        }
      }
    }

    const runList = Object.values(runs).filter((run) => run.startTs && run.startTs > 0);
    const totalWorkflowRuns = runList.length;
    const successful = runList.filter((run) => run.ok === true).length;
    const failed = runList.filter((run) => run.ok === false).length;
    const successRate = totalWorkflowRuns > 0 ? successful / totalWorkflowRuns : null;
    const verifyCycles = runList.map((run) => run.verifyCycles).filter((n) => n > 0);
    const retryCounts = runList.map((run) => run.verifyRetries + run.spawnRetries);

    const perDay: Record<string, {
      runs: number;
      success: number;
      failure: number;
      verifyCyclesSum: number;
      verifyCyclesMax: number;
      retriesSum: number;
    }> = {};
    for (const run of runList) {
      const day = new Date(run.startTs ?? 0).toISOString().slice(0, 10);
      if (!perDay[day]) {
        perDay[day] = {
          runs: 0,
          success: 0,
          failure: 0,
          verifyCyclesSum: 0,
          verifyCyclesMax: 0,
          retriesSum: 0,
        };
      }
      perDay[day].runs += 1;
      if (run.ok === true) perDay[day].success += 1;
      if (run.ok === false) perDay[day].failure += 1;
      perDay[day].verifyCyclesSum += run.verifyCycles;
      perDay[day].verifyCyclesMax = Math.max(perDay[day].verifyCyclesMax, run.verifyCycles);
      perDay[day].retriesSum += run.verifyRetries + run.spawnRetries;
    }

    return {
      updatedAt: Date.now(),
      totals: {
        totalWorkflowRuns,
        successful,
        failed,
        successRate,
        avgVerifyCycles: verifyCycles.length
          ? Math.round((verifyCycles.reduce((a, b) => a + b, 0) / verifyCycles.length) * 100) / 100
          : 0,
        maxVerifyCycles: verifyCycles.length ? Math.max(...verifyCycles) : 0,
        avgRetries: retryCounts.length
          ? Math.round((retryCounts.reduce((a, b) => a + b, 0) / retryCounts.length) * 100) / 100
          : 0,
        maxRetries: retryCounts.length ? Math.max(...retryCounts) : 0,
      },
      perDay: Object.entries(perDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-30)
        .map(([day, row]) => ({
          day,
          runs: row.runs,
          success: row.success,
          failure: row.failure,
          avgVerifyCycles: row.runs ? row.verifyCyclesSum / row.runs : 0,
          maxVerifyCycles: row.verifyCyclesMax,
          avgRetries: row.runs ? row.retriesSum / row.runs : 0,
        })),
    };
  }

  function getMissionControl(): {
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
  } {
    const agentsData = getVentureosAgents();
    const completions: Array<{
      agentId: string;
      label: string;
      sessionId: string;
      updatedAt: number;
      summary: string;
    }> = [];

    for (const [agentId, summary] of Object.entries(agentsData.agents)) {
      for (const completion of summary.recentCompletions) {
        completions.push({ agentId, ...completion });
      }
    }

    completions.sort((a, b) => b.updatedAt - a.updatedAt);

    return {
      updatedAt: Date.now(),
      activeWorkMd: deps.readText(deps.activeWorkPath, ''),
      prioritiesMd: deps.readText(deps.prioritiesPath, ''),
      team: {
        overall: Object.values(agentsData.agents).some((agent) => agent.status === 'working')
          ? 'busy'
          : 'idle',
        agents: Object.values(agentsData.agents).map((agent) => ({
          agentId: agent.agentId,
          status: agent.status,
          lastActivityMs: agent.lastActivityMs,
          successRate24h: agent.successRate24h,
          recentSessions24h: agent.recentSessions24h,
          avgLatencySeconds24h: agent.avgLatencySeconds24h,
        })),
      },
      recentCompletions: completions.slice(0, 20),
    };
  }

  return {
    getVentureosAgents,
    getWorkflowPatterns,
    getMissionControl,
    getCronJobs: () => getCronJobs(deps.cronFile),
    getGitActivity: () => getGitActivity(deps.workspaceDir),
    getServicesStatus,
    getMemoryFiles: () => getMemoryFiles(deps.memoryMdPath, deps.heartbeatPath, deps.memoryDir),
  };
}
