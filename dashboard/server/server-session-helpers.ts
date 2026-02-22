import fs from 'node:fs';
import path from 'node:path';

import type {
  SessionInfo,
  SessionsJsonEntry,
  JsonlEntry,
  SessionMessage,
  MessageContentBlock,
  AgentMetrics,
} from './types.js';

interface SessionsDeps {
  sessDir: string;
  cronFile: string;
}

interface AgentMetricsDeps {
  cronFile: string;
  getAgentSessionsDir: (agentId: string) => string;
}

export function resolveSessionName(key: string, cronFile: string): string {
  if (key.includes(':main:main')) return 'main';
  if (key.includes('teleg')) return 'telegram-group';
  if (key.includes('cron:')) {
    try {
      if (fs.existsSync(cronFile)) {
        const crons = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as {
          jobs?: Array<{ id: string; name?: string }>;
        };
        const jobs = crons.jobs ?? [];
        const cronPart: string = key.split('cron:')[1] ?? '';
        const cronUuid: string = cronPart.split(':')[0];
        const job = jobs.find((j) => j.id === cronUuid);
        if (job?.name) return job.name;
      }
    } catch {
      // ignore
    }
    const cronPart: string = key.split('cron:')[1] ?? '';
    const cronUuid: string = cronPart.split(':')[0];
    return 'Cron: ' + cronUuid.substring(0, 8);
  }
  if (key.includes('subagent')) {
    const parts: string[] = key.split(':');
    return parts[parts.length - 1].substring(0, 12);
  }
  return key.split(':').pop()?.substring(0, 12) ?? key.substring(0, 12);
}

function parseJsonlAvgLatencyMs(jsonlPath: string, maxLines: number = 600): number | null {
  try {
    if (!fs.existsSync(jsonlPath)) return null;
    const data: string = fs.readFileSync(jsonlPath, 'utf8');
    const lines: string[] = data.split('\n').filter((l) => l.trim());
    const slice: string[] = lines.slice(Math.max(0, lines.length - maxLines));
    let lastUserTs: number | null = null;
    const deltas: number[] = [];
    for (const line of slice) {
      let d: JsonlEntry;
      try {
        d = JSON.parse(line) as JsonlEntry;
      } catch {
        continue;
      }
      if (d.type !== 'message') continue;
      const msg: SessionMessage | undefined = d.message;
      if (!msg) continue;
      const role: string | undefined = msg.role;
      const tsStr: string | undefined =
        d.timestamp ??
        d.ts ??
        ((msg as Record<string, unknown>).timestamp as string | undefined);
      const ts: number = tsStr ? Date.parse(tsStr) : NaN;
      if (Number.isNaN(ts)) continue;
      if (role === 'user') {
        lastUserTs = ts;
      } else if (role === 'assistant') {
        if (lastUserTs && ts >= lastUserTs) {
          deltas.push(ts - lastUserTs);
          lastUserTs = null;
        }
      }
    }
    if (!deltas.length) return null;
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  } catch {
    return null;
  }
}

function getLastMessage(sessDir: string, sessionId: string): string {
  try {
    const filePath: string = path.join(sessDir, sessionId + '.jsonl');
    if (!fs.existsSync(filePath)) return '';
    const data: string = fs.readFileSync(filePath, 'utf8');
    const lines: string[] = data.split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      try {
        const d = JSON.parse(lines[i]) as JsonlEntry;
        if (d.type !== 'message') continue;
        const msg: SessionMessage | undefined = d.message;
        if (!msg) continue;
        const role: string | undefined = msg.role;
        if (role !== 'user' && role !== 'assistant') continue;
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
        if (text) return text.replace(/\n/g, ' ').substring(0, 80);
      } catch {
        // ignore parse error
      }
    }
    return '';
  } catch {
    return '';
  }
}

let sessionCostCache: Record<string, number> = {};
let sessionCostCacheTime: number = 0;
let sessionCostCacheDir: string = '';

function getSessionCost(sessDir: string, sessionId: string): number {
  const now: number = Date.now();
  if (sessionCostCacheDir !== sessDir || now - sessionCostCacheTime > 60000) {
    sessionCostCache = {};
    sessionCostCacheTime = now;
    sessionCostCacheDir = sessDir;
    try {
      const files: string[] = fs.readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
      for (const file of files) {
        const sid: string = file.replace('.jsonl', '');
        let total: number = 0;
        const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const d = JSON.parse(line) as JsonlEntry;
            if (d.type !== 'message') continue;
            const c: number = d.message?.usage?.cost?.total ?? 0;
            if (c > 0) total += c;
          } catch {
            // ignore
          }
        }
        if (total > 0) sessionCostCache[sid] = Math.round(total * 100) / 100;
      }
    } catch {
      // ignore
    }
  }
  return sessionCostCache[sessionId] ?? 0;
}

export function getSessionsJson({ sessDir, cronFile }: SessionsDeps): SessionInfo[] {
  try {
    const sFile: string = path.join(sessDir, 'sessions.json');
    const data = JSON.parse(fs.readFileSync(sFile, 'utf8')) as Record<string, SessionsJsonEntry>;
    return Object.entries(data).map(([key, s]): SessionInfo => ({
      key,
      label: s.label ?? resolveSessionName(key, cronFile),
      model: s.modelOverride ?? s.model ?? '-',
      totalTokens: s.totalTokens ?? 0,
      contextTokens: s.contextTokens ?? 0,
      kind: s.kind ?? (key.includes('group') ? 'group' : 'direct'),
      updatedAt: s.updatedAt ?? 0,
      createdAt: s.createdAt ?? s.updatedAt ?? 0,
      aborted: s.abortedLastRun ?? false,
      thinkingLevel: s.thinkingLevel ?? null,
      channel: s.channel ?? '-',
      sessionId: s.sessionId ?? '-',
      lastMessage: getLastMessage(sessDir, s.sessionId ?? key),
      cost: getSessionCost(sessDir, s.sessionId ?? key),
    }));
  } catch {
    return [];
  }
}

export function getAgentMetrics(agentId: string, deps: AgentMetricsDeps): AgentMetrics {
  const agentSessDir: string = deps.getAgentSessionsDir(agentId);
  const sFile: string = path.join(agentSessDir, 'sessions.json');
  let sessionsObj: Record<string, SessionsJsonEntry> = {};
  try {
    sessionsObj = JSON.parse(fs.readFileSync(sFile, 'utf8')) as Record<string, SessionsJsonEntry>;
  } catch {
    // ignore
  }
  const entries = Object.entries(sessionsObj ?? {}).map(([key, s]) => ({
    key,
    sessionId: s.sessionId ?? null,
    label: s.label ?? resolveSessionName(key, deps.cronFile),
    updatedAt: s.updatedAt ?? 0,
    createdAt: s.createdAt ?? s.updatedAt ?? 0,
    aborted: !!s.abortedLastRun,
  }));
  entries.sort((a, b) => b.updatedAt - a.updatedAt);

  const sessionCount: number = entries.length;
  const failures: number = entries.filter((e) => e.aborted).length;
  const successRate: number | null = sessionCount
    ? (sessionCount - failures) / sessionCount
    : null;

  let avgLatencyMs: number | null = null;
  try {
    const sample = entries.slice(0, 5);
    const lats: number[] = [];
    for (const e of sample) {
      const sid: string = e.sessionId ?? e.key;
      if (!sid) continue;
      const candidate: string = path.join(agentSessDir, sid + '.jsonl');
      const lat: number | null = parseJsonlAvgLatencyMs(candidate);
      if (lat !== null) lats.push(lat);
    }
    if (lats.length) avgLatencyMs = lats.reduce((a, b) => a + b, 0) / lats.length;
  } catch {
    // ignore
  }

  const now: number = Date.now();
  const lastUpdatedAt: number = entries[0]?.updatedAt ?? 0;
  const recentlyActive: boolean = !!lastUpdatedAt && now - lastUpdatedAt < 2 * 60 * 1000;
  const recentlyFailed: boolean = entries.some(
    (e) => e.aborted && now - (e.updatedAt || 0) < 60 * 60 * 1000,
  );
  const status: string = recentlyFailed ? 'degraded' : recentlyActive ? 'busy' : 'operational';

  return {
    agentId: String(agentId),
    sessionsDir: agentSessDir,
    sessionCount,
    successRate,
    avgLatencyMs,
    status,
    lastUpdatedAt,
    recentSessions: entries.slice(0, 10),
  };
}
