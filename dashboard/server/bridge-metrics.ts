/**
 * Bridge metrics helpers (costs/usage/system/etc.).
 * Extracted for the Bridge API subset in Issue #140.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import type {
  CostData,
  UsageWindowsResponse,
  ModelUsageStats,
  SystemStats,
  SessionsJsonEntry,
  JsonlEntry,
  SessionMessage,
  MessageContentBlock,
  LifetimeStats,
  HealthSnapshot,
} from './types.js';

interface MetricsDeps {
  sessDir: string;
  cronFile: string;
  allowedSessionIds?: Set<string> | null;
}

function listSessionFiles(sessDir: string, allowedSessionIds?: Set<string> | null): string[] {
  try {
    const files = fs.readdirSync(sessDir).filter((f) => f.endsWith('.jsonl'));
    if (!allowedSessionIds) return files;
    return files.filter((f) => allowedSessionIds.has(f.replace(/\.jsonl$/, '')));
  } catch {
    return [];
  }
}

/**
 * Try to resolve a human-readable label for a session ID by scanning the JSONL.
 */
function resolveSessionLabel(sessDir: string, cronFile: string, sid: string): string | null {
  try {
    const jf: string = path.join(sessDir, sid + '.jsonl');
    if (!fs.existsSync(jf)) return null;
    const lines: string[] = fs.readFileSync(jf, 'utf8').split('\n');
    for (const l of lines) {
      if (!l.includes('"user"')) continue;
      try {
        const d = JSON.parse(l) as JsonlEntry;
        const c = d.message?.content;
        const txt: string =
          typeof c === 'string'
            ? c
            : Array.isArray(c)
              ? (c as MessageContentBlock[]).find((x) => x.type === 'text')?.text ?? ''
              : '';
        if (txt) {
          let t: string = txt.replace(/\n/g, ' ').trim();
          const bgMatch: RegExpMatchArray | null = t.match(/background task "([^"]+)"/i);
          if (bgMatch) t = 'Sub: ' + bgMatch[1];
          const cronMatch: RegExpMatchArray | null = t.match(/\[cron:([^\]]+)\]/);
          if (cronMatch) {
            let cronName: string = cronMatch[1].substring(0, 8);
            try {
              const cj = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as {
                jobs?: Array<{ id: string; name?: string }>;
              };
              const job = cj.jobs?.find((j) => j.id?.startsWith(cronMatch[1].substring(0, 8)));
              if (job?.name) cronName = job.name;
            } catch {
              // ignore
            }
            t = 'Cron: ' + cronName;
          }
          if (t.startsWith('System:')) t = t.substring(7).trim();
          t = t.replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, '');
          if (t.startsWith('You are running a boot')) t = 'Boot check';
          if (/whatsapp/i.test(t)) t = 'WhatsApp session';
          const subMatch2: RegExpMatchArray | null = t.match(/background task "([^"]+)"/i);
          if (!bgMatch && subMatch2) t = 'Sub: ' + subMatch2[1];
          let label: string = t.substring(0, 35);
          if (t.length > 35) label += '…';
          return label;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function buildCostData({ sessDir, cronFile, allowedSessionIds }: MetricsDeps): CostData {
  try {
    const files: string[] = listSessionFiles(sessDir, allowedSessionIds);
    const perModel: Record<string, number> = {};
    const perDay: Record<string, number> = {};
    const perSession: Record<string, number> = {};
    let total: number = 0;

    for (const file of files) {
      const sid: string = file.replace('.jsonl', '');
      let scost: number = 0;
      const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          const msg: SessionMessage | undefined = d.message;
          if (!msg?.usage?.cost) continue;
          const c: number = msg.usage.cost.total ?? 0;
          if (c <= 0) continue;
          const model: string = msg.model ?? 'unknown';
          if (model.includes('delivery-mirror')) continue;
          const ts: string = d.timestamp ?? '';
          const day: string = ts.substring(0, 10);
          perModel[model] = (perModel[model] ?? 0) + c;
          perDay[day] = (perDay[day] ?? 0) + c;
          scost += c;
          total += c;
        } catch {
          // ignore
        }
      }
      if (scost > 0) perSession[sid] = scost;
    }

    const now = new Date();
    const todayKey: string = now.toISOString().substring(0, 10);
    const weekAgo: string = new Date(now.getTime() - 7 * 86400000).toISOString().substring(0, 10);
    let weekCost: number = 0;
    for (const [d, c] of Object.entries(perDay)) {
      if (d >= weekAgo) weekCost += c;
    }

    // Build per-session with labels
    let sidLabels: Record<string, string> = {};
    try {
      const sData = JSON.parse(
        fs.readFileSync(path.join(sessDir, 'sessions.json'), 'utf8'),
      ) as Record<string, SessionsJsonEntry>;
      for (const [key, val] of Object.entries(sData)) {
        if (val.sessionId) sidLabels[val.sessionId] = val.label ?? key.split(':').slice(2).join(':');
      }
    } catch {
      // ignore
    }

    const perSessionLabeled: Record<string, { cost: number; label: string }> = {};
    const topSessions = Object.entries(perSession)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [sid, cost] of topSessions) {
      let label: string | null = sidLabels[sid] ?? null;
      if (!label) {
        label = resolveSessionLabel(sessDir, cronFile, sid);
      }
      perSessionLabeled[sid] = { cost, label: label ?? 'session-' + sid.substring(0, 8) };
    }

    return {
      total: Math.round(total * 100) / 100,
      today: Math.round((perDay[todayKey] ?? 0) * 100) / 100,
      week: Math.round(weekCost * 100) / 100,
      perModel,
      perDay: Object.fromEntries(
        Object.entries(perDay)
          .sort((a, b) => b[0].localeCompare(a[0]))
          .slice(0, 14),
      ),
      perSession: perSessionLabeled,
    };
  } catch {
    return { total: 0, today: 0, week: 0, perModel: {}, perDay: {}, perSession: {} };
  }
}

export function buildUsageWindows({ sessDir, allowedSessionIds }: Omit<MetricsDeps, 'cronFile'>): UsageWindowsResponse {
  try {
    const now: number = Date.now();
    const fiveHoursMs: number = 5 * 3600000;
    const oneWeekMs: number = 7 * 86400000;
    const files: string[] = listSessionFiles(sessDir, allowedSessionIds).filter((f) => {
      try {
        return fs.statSync(path.join(sessDir, f)).mtimeMs > now - oneWeekMs;
      } catch {
        return false;
      }
    });

    const perModel5h: Record<string, ModelUsageStats> = {};
    const perModelWeek: Record<string, ModelUsageStats> = {};
    const recentMessages: Array<{ ts: number; model: string; input: number; output: number; cost: number }> = [];

    for (const file of files) {
      const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          const msg: SessionMessage | undefined = d.message;
          if (!msg?.usage) continue;
          const ts: number = d.timestamp ? new Date(d.timestamp).getTime() : 0;
          if (!ts) continue;
          const model: string = msg.model ?? 'unknown';
          const inTok: number =
            (msg.usage.input ?? 0) + (msg.usage.cacheRead ?? 0) + (msg.usage.cacheWrite ?? 0);
          const outTok: number = msg.usage.output ?? 0;
          const cost: number = msg.usage.cost?.total ?? 0;

          if (now - ts < fiveHoursMs) {
            if (!perModel5h[model])
              perModel5h[model] = { input: 0, output: 0, cost: 0, calls: 0 };
            perModel5h[model].input += inTok;
            perModel5h[model].output += outTok;
            perModel5h[model].cost += cost;
            perModel5h[model].calls++;
          }
          if (now - ts < oneWeekMs) {
            if (!perModelWeek[model])
              perModelWeek[model] = { input: 0, output: 0, cost: 0, calls: 0 };
            perModelWeek[model].input += inTok;
            perModelWeek[model].output += outTok;
            perModelWeek[model].cost += cost;
            perModelWeek[model].calls++;
          }
          if (now - ts < fiveHoursMs) {
            recentMessages.push({ ts, model, input: inTok, output: outTok, cost });
          }
        } catch {
          // ignore
        }
      }
    }

    recentMessages.sort((a, b) => b.ts - a.ts);

    const estimatedLimits = { opus: 88000, sonnet: 220000 };

    let windowStart: number | null = null;
    if (recentMessages.length > 0) {
      windowStart = recentMessages[recentMessages.length - 1].ts;
    }
    const windowResetIn: number = windowStart
      ? Math.max(0, windowStart + fiveHoursMs - now)
      : 0;

    const thirtyMinAgo: number = now - 30 * 60000;
    const recent30 = recentMessages.filter((m) => m.ts >= thirtyMinAgo);
    let burnTokensPerMin: number = 0;
    let burnCostPerMin: number = 0;
    if (recent30.length > 0) {
      const totalOut30: number = recent30.reduce((s, m) => s + m.output, 0);
      const totalCost30: number = recent30.reduce((s, m) => s + m.cost, 0);
      const spanMs: number = Math.max(now - Math.min(...recent30.map((m) => m.ts)), 60000);
      burnTokensPerMin = totalOut30 / (spanMs / 60000);
      burnCostPerMin = totalCost30 / (spanMs / 60000);
    }

    const opusKey: string = Object.keys(perModel5h).find((k) => k.includes('opus')) ?? '';
    const opusOut: number = opusKey ? perModel5h[opusKey].output : 0;
    const sonnetKey: string = Object.keys(perModel5h).find((k) => k.includes('sonnet')) ?? '';
    const sonnetOut: number = sonnetKey ? perModel5h[sonnetKey].output : 0;

    const opusRemaining: number = estimatedLimits.opus - opusOut;
    const timeToLimit: number | null =
      burnTokensPerMin > 0 ? (opusRemaining / burnTokensPerMin) * 60000 : null;

    const perModelCost5h: Record<string, { inputCost: number; outputCost: number; totalCost: number }> = {};
    for (const [model, data] of Object.entries(perModel5h)) {
      const isOpus: boolean = model.includes('opus');
      const isSonnet: boolean = model.includes('sonnet');
      let inputPrice: number = 0;
      let outputPrice: number = 0;
      if (isOpus) {
        inputPrice = 15;
        outputPrice = 75;
      } else if (isSonnet) {
        inputPrice = 3;
        outputPrice = 15;
      }
      perModelCost5h[model] = {
        inputCost: (data.input || 0) / 1000000 * inputPrice,
        outputCost: (data.output || 0) / 1000000 * outputPrice,
        totalCost: data.cost || 0,
      };
    }

    const totalCost5h: number = Object.values(perModel5h).reduce((s, m) => s + (m.cost || 0), 0);
    const totalCalls5h: number = Object.values(perModel5h).reduce(
      (s, m) => s + (m.calls || 0),
      0,
    );
    const costLimit: number = 35.0;
    const messageLimit: number = 1000;

    return {
      fiveHour: {
        perModel: perModel5h,
        perModelCost: perModelCost5h,
        windowStart,
        windowResetIn,
        recentCalls: recentMessages.slice(0, 20).map((m) => ({
          ...m,
          ago: Math.round((now - m.ts) / 60000) + 'm ago',
        })),
      },
      weekly: {
        perModel: perModelWeek,
      },
      burnRate: {
        tokensPerMinute: Math.round(burnTokensPerMin * 100) / 100,
        costPerMinute: Math.round(burnCostPerMin * 10000) / 10000,
      },
      estimatedLimits,
      current: {
        opusOutput: opusOut,
        sonnetOutput: sonnetOut,
        totalCost: Math.round(totalCost5h * 100) / 100,
        totalCalls: totalCalls5h,
        opusPct: Math.round((opusOut / estimatedLimits.opus) * 100),
        sonnetPct: Math.round((sonnetOut / estimatedLimits.sonnet) * 100),
        costPct: Math.round((totalCost5h / costLimit) * 100),
        messagePct: Math.round((totalCalls5h / messageLimit) * 100),
        costLimit,
        messageLimit,
      },
      predictions: {
        timeToLimit: timeToLimit ? Math.round(timeToLimit) : null,
        safe: !timeToLimit || timeToLimit > 3600000,
      },
    };
  } catch {
    return {
      fiveHour: { perModel: {}, windowStart: null, windowResetIn: 0 },
      weekly: { perModel: {} },
    };
  }
}

export function buildTodayTokens({ sessDir, allowedSessionIds }: Omit<MetricsDeps, 'cronFile'>): {
  totalInput: number;
  totalOutput: number;
  perModel: Record<string, { input: number; output: number }>;
} {
  try {
    const files: string[] = listSessionFiles(sessDir, allowedSessionIds);
    const now = new Date();
    const todayStr: string = now.toISOString().substring(0, 10);
    const perModel: Record<string, { input: number; output: number }> = {};
    let totalInput: number = 0;
    let totalOutput: number = 0;

    for (const file of files) {
      const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          const ts: string = d.timestamp ?? '';
          if (!ts.startsWith(todayStr)) continue;
          const msg: SessionMessage | undefined = d.message;
          if (!msg?.usage) continue;
          const model: string = (msg.model ?? 'unknown').split('/').pop() ?? 'unknown';
          if (model === 'delivery-mirror') continue;
          const inTok: number =
            (msg.usage.input ?? 0) + (msg.usage.cacheRead ?? 0) + (msg.usage.cacheWrite ?? 0);
          const outTok: number = msg.usage.output ?? 0;
          if (!perModel[model]) perModel[model] = { input: 0, output: 0 };
          perModel[model].input += inTok;
          perModel[model].output += outTok;
          totalInput += inTok;
          totalOutput += outTok;
        } catch {
          // ignore
        }
      }
    }
    return { totalInput, totalOutput, perModel };
  } catch {
    return { totalInput: 0, totalOutput: 0, perModel: {} };
  }
}

export function buildAvgResponseTime({ sessDir, allowedSessionIds }: Omit<MetricsDeps, 'cronFile'>): number {
  try {
    const files: string[] = listSessionFiles(sessDir, allowedSessionIds);
    const now = new Date();
    const todayStr: string = now.toISOString().substring(0, 10);
    const diffs: number[] = [];

    for (const file of files) {
      const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
      let lastUserTs: number | null = null;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          const ts: string = d.timestamp ?? '';
          if (!ts.startsWith(todayStr)) continue;
          const role: string | undefined = d.message?.role;
          const msgTs: number = new Date(ts).getTime();
          if (role === 'user') {
            lastUserTs = msgTs;
          } else if (role === 'assistant' && lastUserTs) {
            const diff: number = msgTs - lastUserTs;
            if (diff > 0 && diff < 600000) diffs.push(diff);
            lastUserTs = null;
          }
        } catch {
          // ignore
        }
      }
    }
    if (diffs.length === 0) return 0;
    return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length / 1000);
  } catch {
    return 0;
  }
}

export function buildLifetimeStats({ sessDir, allowedSessionIds }: Omit<MetricsDeps, 'cronFile'>): LifetimeStats {
  try {
    const files: string[] = listSessionFiles(sessDir, allowedSessionIds);
    let totalTokens: number = 0;
    let totalMessages: number = 0;
    let totalCost: number = 0;
    const totalSessions: number = files.length;
    let firstSessionDate: number | null = null;
    const activeDays: Set<string> = new Set();
    for (const file of files) {
      const lines: string[] = fs.readFileSync(path.join(sessDir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const d = JSON.parse(line) as JsonlEntry;
          if (d.type !== 'message') continue;
          totalMessages++;
          const msg: SessionMessage | undefined = d.message;
          if (msg?.usage) {
            const inTok: number =
              (msg.usage.input ?? 0) + (msg.usage.cacheRead ?? 0) + (msg.usage.cacheWrite ?? 0);
            const outTok: number = msg.usage.output ?? 0;
            totalTokens += inTok + outTok;
            totalCost += msg.usage.cost?.total ?? 0;
          }
          if (d.timestamp) {
            const ts: number = new Date(d.timestamp).getTime();
            if (!firstSessionDate || ts < firstSessionDate) firstSessionDate = ts;
            const day: string = d.timestamp.substring(0, 10);
            activeDays.add(day);
          }
        } catch {
          // ignore
        }
      }
    }
    return {
      totalTokens,
      totalMessages,
      totalCost: Math.round(totalCost * 100) / 100,
      totalSessions,
      firstSessionDate,
      daysActive: activeDays.size,
    };
  } catch {
    return {
      totalTokens: 0,
      totalMessages: 0,
      totalCost: 0,
      totalSessions: 0,
      firstSessionDate: null,
      daysActive: 0,
    };
  }
}

// ─── CPU Sampler (delta-based) ─────────────────────────────────────────────

interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

let _prevCpuSample: CpuTimes[] | null = null;
let _lastCpuPercent: number = 0;

function _snapshotCpuTimes(): CpuTimes[] {
  return os.cpus().map((c) => ({ ...c.times }));
}

export function sampleCpuPercent(): number {
  const current: CpuTimes[] = _snapshotCpuTimes();

  if (_prevCpuSample && _prevCpuSample.length === current.length) {
    let totalDelta: number = 0;
    let idleDelta: number = 0;
    for (let i = 0; i < current.length; i++) {
      const p: CpuTimes = _prevCpuSample[i];
      const c: CpuTimes = current[i];
      const pTotal: number = p.user + p.nice + p.sys + p.idle + p.irq;
      const cTotal: number = c.user + c.nice + c.sys + c.idle + c.irq;
      totalDelta += cTotal - pTotal;
      idleDelta += c.idle - p.idle;
    }
    _prevCpuSample = current;

    if (totalDelta > 0) {
      _lastCpuPercent = Math.min(Math.round(((totalDelta - idleDelta) / totalDelta) * 100), 100);
    }
    return _lastCpuPercent;
  }

  _prevCpuSample = current;

  try {
    const loadAvg1m: number = os.loadavg()[0];
    const numCpus: number = current.length || 1;
    _lastCpuPercent = Math.min(Math.round((loadAvg1m / numCpus) * 100), 100);
  } catch {
    _lastCpuPercent = 0;
  }
  return _lastCpuPercent;
}

// Seed the first sample so the first real call has a delta to work with.
sampleCpuPercent();

export function buildSystemStats(): SystemStats {
  try {
    const totalMem: number = os.totalmem();
    const freeMem: number = os.freemem();
    const usedMem: number = totalMem - freeMem;
    const memPercent: number = Math.round((usedMem / totalMem) * 100);

    let cpuTemp: number | null = null;
    try {
      const tempRaw: string = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
      cpuTemp = parseInt(tempRaw) / 1000;
    } catch {
      // not available on this platform
    }

    const loadAvg: number[] = os.loadavg();
    const uptime: number = os.uptime();

    const cpuUsage: number = sampleCpuPercent();

    let diskPercent: number = 0;
    let diskUsed: string = '';
    let diskTotal: string = '';
    try {
      let out: string = '';
      try {
        out = execSync("df / --output=pcent,used,size -B1G 2>/dev/null | tail -1", {
          encoding: 'utf8',
        }).trim();
        const parts: string[] = out.split(/\s+/);
        if (parts.length >= 3 && parts[0].includes('%')) {
          diskPercent = parseInt(parts[0]);
          diskUsed = parts[1] + 'G';
          diskTotal = parts[2] + 'G';
        } else {
          throw new Error('df output not in expected GNU format');
        }
      } catch {
        out = execSync("df -k / 2>/dev/null | tail -1", { encoding: 'utf8' }).trim();
        const parts: string[] = out.split(/\s+/);
        const totalKb: number = parseInt(parts[1]) || 0;
        const usedKb: number = parseInt(parts[2]) || 0;
        const cap: string = parts[4] ?? '';
        diskPercent = parseInt(cap.replace('%', '')) || 0;
        const usedG: number = Math.round(usedKb / 1048576);
        const totalG: number = Math.round(totalKb / 1048576);
        if (usedG > 0) diskUsed = usedG + 'G';
        if (totalG > 0) diskTotal = totalG + 'G';
      }
    } catch {
      // ignore
    }

    let crashCount: number = 0;
    try {
      const logs: string = execSync(
        "journalctl -u openclaw --since '7 days ago' --no-pager -o short 2>/dev/null | grep -ci 'SIGABRT\\|SIGSEGV\\|exit code [1-9]\\|process crashed\\|fatal error' || echo 0",
        { encoding: 'utf8' },
      ).trim();
      crashCount = parseInt(logs) || 0;
    } catch {
      // not available
    }

    let crashesToday: number = 0;
    try {
      const logs: string = execSync(
        "journalctl -u openclaw --since today --no-pager -o short 2>/dev/null | grep -ci 'SIGABRT\\|SIGSEGV\\|exit code [1-9]\\|process crashed\\|fatal error' || echo 0",
        { encoding: 'utf8' },
      ).trim();
      crashesToday = parseInt(logs) || 0;
    } catch {
      // not available
    }

    return {
      cpu: { usage: cpuUsage, temp: cpuTemp },
      disk: { percent: diskPercent, used: diskUsed, total: diskTotal },
      crashCount,
      crashesToday,
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percent: memPercent,
        totalGB: (totalMem / 1073741824).toFixed(1),
        usedGB: (usedMem / 1073741824).toFixed(1),
        freeGB: (freeMem / 1073741824).toFixed(1),
      },
      loadAvg: {
        '1m': loadAvg[0].toFixed(2),
        '5m': loadAvg[1].toFixed(2),
        '15m': loadAvg[2].toFixed(2),
      },
      uptime,
    };
  } catch {
    return {
      cpu: { usage: 0, temp: null },
      disk: { percent: 0, used: '', total: '' },
      crashCount: 0,
      crashesToday: 0,
      memory: {
        total: 0,
        used: 0,
        free: 0,
        percent: 0,
        totalGB: '0.0',
        usedGB: '0.0',
        freeGB: '0.0',
      },
      loadAvg: { '1m': '0', '5m': '0', '15m': '0' },
      uptime: 0,
    };
  }
}

export function trackDiskHistory(
  diskPercent: number,
  historyPath: string = path.join(import.meta.dirname, '..', 'disk-history.json'),
): Array<{ t: number; v: number }> {
  let history: Array<{ t: number; v: number }> = [];
  try {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf8')) as Array<{ t: number; v: number }>;
  } catch {
    // ignore
  }
  const now: number = Date.now();
  if (history.length > 0 && now - history[history.length - 1].t < 1800000) return history;
  history.push({ t: now, v: diskPercent });
  if (history.length > 48) history = history.slice(-48);
  try {
    fs.writeFileSync(historyPath, JSON.stringify(history));
  } catch {
    // ignore
  }
  return history;
}

export function readHealthHistory(filePath: string): HealthSnapshot[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as HealthSnapshot[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
