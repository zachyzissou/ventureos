import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import type { SchedulerJobInfo, SchedulerJobStatus } from './types.js';
import paths from '../../lib/paths.js';

const { LAUNCH_AGENT_DIRS } = paths as typeof import('../../lib/paths.js');

interface OpenClawCronState {
  lastStatus?: string;
  lastRunAtMs?: number;
  nextRunAtMs?: number;
  lastDurationMs?: number;
  lastLogPath?: string;
}

interface OpenClawCronRaw {
  id: string;
  name?: string;
  schedule?: { expr?: string; tz?: string };
  enabled?: boolean;
  state?: OpenClawCronState;
}

interface LaunchAgentCalendarSpec {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Weekday?: number;
  Month?: number;
}

interface LaunchAgentRaw {
  Label?: string;
  Program?: string;
  ProgramArguments?: unknown;
  StartInterval?: number;
  StartCalendarInterval?: unknown;
  RunAtLoad?: boolean;
  WatchPaths?: unknown;
  StandardOutPath?: string;
  StandardErrorPath?: string;
}

interface LaunchctlStatus {
  pid: number | null;
  status: number | null;
}

interface SchedulerBuildOptions {
  cronFile: string;
  openclawDir: string;
  platform?: NodeJS.Platform;
  nowMs?: number;
  launchAgentDirs?: string[];
  runCommand?: (command: string, args: string[]) => string;
}

const AUTOMATION_KEYWORDS: string[] = ['nexus', 'openclaw', 'ventureos', 'clawd'];

function defaultRunCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function coerceInt(value: unknown, min: number, max: number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n >= min && n <= max) return n;
    return null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  }
  return null;
}

function sanitizePathCandidate(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return value;
}

function basenameWithoutExt(filePath: string): string {
  return path.basename(filePath).replace(/\.(jsonl|log|txt)$/i, '');
}

function statusFromOpenClaw(rawStatus: string): SchedulerJobStatus {
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized === 'ok' || normalized === 'success' || normalized === 'passed') return 'ok';
  if (normalized === 'running' || normalized === 'in_progress') return 'running';
  return 'failed';
}

function statusLabel(status: SchedulerJobStatus, code: number | null): string {
  if (status === 'ok') return 'ok';
  if (status === 'running') return 'running';
  if (status === 'unknown') return 'unknown';
  if (typeof code === 'number') return `exit ${code}`;
  return 'failed';
}

function formatDurationCompact(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainMinutes}m`;
}

function isAutomationLaunchAgent(job: LaunchAgentRaw, filePath: string): boolean {
  const text = [
    job.Label,
    job.Program,
    ...(Array.isArray(job.ProgramArguments) ? job.ProgramArguments : []),
    job.StandardOutPath,
    job.StandardErrorPath,
    filePath,
  ]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .join(' ')
    .toLowerCase();

  return AUTOMATION_KEYWORDS.some((keyword) => text.includes(keyword));
}

function parseLaunchctlList(raw: string): Map<string, LaunchctlStatus> {
  const statuses = new Map<string, LaunchctlStatus>();
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('PID\tStatus\tLabel')) continue;
    const parts = trimmed.split(/\s+/, 3);
    if (parts.length !== 3) continue;
    const [pidRaw, statusRaw, label] = parts;
    const pid = pidRaw === '-' ? null : Number.parseInt(pidRaw, 10);
    const status = statusRaw === '-' ? null : Number.parseInt(statusRaw, 10);
    statuses.set(label, {
      pid: Number.isFinite(pid) ? pid : null,
      status: Number.isFinite(status) ? status : null,
    });
  }
  return statuses;
}

function normalizeWeekday(raw: number): number {
  if (raw === 7) return 0;
  if (raw >= 0 && raw <= 6) return raw;
  return ((raw % 7) + 7) % 7;
}

function normalizeCalendarSpecs(value: unknown): LaunchAgentCalendarSpec[] {
  const toSpec = (candidate: unknown): LaunchAgentCalendarSpec | null => {
    if (!candidate || typeof candidate !== 'object') return null;
    const record = candidate as Record<string, unknown>;
    const spec: LaunchAgentCalendarSpec = {};
    const minute = coerceInt(record.Minute, 0, 59);
    const hour = coerceInt(record.Hour, 0, 23);
    const day = coerceInt(record.Day, 1, 31);
    const weekday = coerceInt(record.Weekday, 0, 7);
    const month = coerceInt(record.Month, 1, 12);

    if (minute !== null) spec.Minute = minute;
    if (hour !== null) spec.Hour = hour;
    if (day !== null) spec.Day = day;
    if (weekday !== null) spec.Weekday = weekday;
    if (month !== null) spec.Month = month;

    if (
      spec.Minute === undefined &&
      spec.Hour === undefined &&
      spec.Day === undefined &&
      spec.Weekday === undefined &&
      spec.Month === undefined
    ) {
      return null;
    }
    return spec;
  };

  if (Array.isArray(value)) {
    return value
      .map((entry) => toSpec(entry))
      .filter((entry): entry is LaunchAgentCalendarSpec => entry !== null);
  }
  const single = toSpec(value);
  return single ? [single] : [];
}

function describeCalendarSpec(spec: LaunchAgentCalendarSpec): string {
  const weekdayNames: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const parts: string[] = [];

  if (typeof spec.Month === 'number') parts.push(`month ${spec.Month}`);
  if (typeof spec.Day === 'number') parts.push(`day ${spec.Day}`);
  if (typeof spec.Weekday === 'number') {
    parts.push(weekdayNames[normalizeWeekday(spec.Weekday)] ?? `weekday ${spec.Weekday}`);
  }

  const hour = typeof spec.Hour === 'number' ? spec.Hour : 0;
  const minute = typeof spec.Minute === 'number' ? spec.Minute : 0;
  const timePart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  if (parts.length === 0) return timePart;
  return `${parts.join(' ')} ${timePart}`;
}

function computeNextCalendarRun(spec: LaunchAgentCalendarSpec, nowMs: number): number | null {
  const now = new Date(nowMs);
  const hour = typeof spec.Hour === 'number' ? spec.Hour : 0;
  const minute = typeof spec.Minute === 'number' ? spec.Minute : 0;

  for (let dayOffset = 0; dayOffset <= 370; dayOffset++) {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(minute);
    candidate.setHours(hour);
    candidate.setDate(now.getDate() + dayOffset);

    if (candidate.getTime() <= nowMs) continue;
    if (typeof spec.Month === 'number' && candidate.getMonth() + 1 !== spec.Month) continue;
    if (typeof spec.Day === 'number' && candidate.getDate() !== spec.Day) continue;
    if (
      typeof spec.Weekday === 'number' &&
      candidate.getDay() !== normalizeWeekday(spec.Weekday)
    ) {
      continue;
    }
    return candidate.getTime();
  }

  return null;
}

function readPlistJson(
  filePath: string,
  runCommand: (command: string, args: string[]) => string,
): LaunchAgentRaw | null {
  try {
    const raw = runCommand('plutil', ['-convert', 'json', '-o', '-', filePath]);
    const parsed = JSON.parse(raw) as LaunchAgentRaw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function getLaunchAgentDirs(override?: string[]): string[] {
  if (override && override.length > 0) return override;
  return LAUNCH_AGENT_DIRS;
}

function collectOpenClawJobs(
  cronFile: string,
  openclawDir: string,
): SchedulerJobInfo[] {
  const jobs: SchedulerJobInfo[] = [];
  try {
    if (!fs.existsSync(cronFile)) return jobs;
    const parsed = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as { jobs?: OpenClawCronRaw[] };
    for (const job of parsed.jobs ?? []) {
      const rawStatus = job.state?.lastStatus ?? '';
      const lastExit = statusFromOpenClaw(rawStatus);
      const nextRunAt = coerceInt(job.state?.nextRunAtMs ?? null, 1, Number.MAX_SAFE_INTEGER);
      const lastRunAt = coerceInt(job.state?.lastRunAtMs ?? null, 1, Number.MAX_SAFE_INTEGER);
      const logPath = sanitizePathCandidate(job.state?.lastLogPath) ?? path.join(openclawDir, 'cron', 'runs');

      jobs.push({
        id: `openclaw:${job.id}`,
        source: 'openclaw-cron',
        label: job.name ?? job.id.slice(0, 8),
        triggerTypes: ['Cron'],
        triggerLabel: job.schedule?.expr
          ? `${job.schedule.expr}${job.schedule?.tz ? ` (${job.schedule.tz})` : ''}`
          : 'Cron (unspecified)',
        nextRunAt,
        nextRunLabel: nextRunAt ? 'scheduled' : 'pending',
        lastRunAt,
        lastExit,
        lastExitLabel: rawStatus || statusLabel(lastExit, null),
        lastExitCode: null,
        enabled: job.enabled !== false,
        logPath,
        logSourceHint: basenameWithoutExt(logPath),
        actions: {
          canToggle: true,
          canRun: true,
          toggleId: job.id,
          runId: job.id,
        },
      });
    }
  } catch {
    return jobs;
  }
  return jobs;
}

function collectLaunchdJobs(options: {
  platform: NodeJS.Platform;
  nowMs: number;
  launchAgentDirs: string[];
  runCommand: (command: string, args: string[]) => string;
}): SchedulerJobInfo[] {
  if (options.platform !== 'darwin') return [];

  let launchctlStatuses = new Map<string, LaunchctlStatus>();
  try {
    launchctlStatuses = parseLaunchctlList(options.runCommand('launchctl', ['list']));
  } catch {
    // Best-effort lookup; UI remains useful without launchctl metadata.
  }

  const jobs: SchedulerJobInfo[] = [];
  const seenLabels = new Set<string>();
  for (const dir of options.launchAgentDirs) {
    let entries: string[] = [];
    try {
      if (!fs.existsSync(dir)) continue;
      entries = fs.readdirSync(dir).filter((name) => name.endsWith('.plist'));
    } catch {
      continue;
    }

    for (const name of entries) {
      const filePath = path.join(dir, name);
      const plist = readPlistJson(filePath, options.runCommand);
      if (!plist || !isAutomationLaunchAgent(plist, filePath)) continue;

      const label =
        typeof plist.Label === 'string' && plist.Label.trim().length > 0
          ? plist.Label.trim()
          : name.replace(/\.plist$/, '');
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const triggerTypes: string[] = [];
      const triggerParts: string[] = [];
      const nextCandidates: number[] = [];

      const startInterval = coerceInt(plist.StartInterval, 1, Number.MAX_SAFE_INTEGER);
      if (startInterval !== null) {
        triggerTypes.push('StartInterval');
        triggerParts.push(`every ${formatDurationCompact(startInterval)}`);
        nextCandidates.push(options.nowMs + startInterval * 1000);
      }

      const calendarSpecs = normalizeCalendarSpecs(plist.StartCalendarInterval);
      if (calendarSpecs.length > 0) {
        triggerTypes.push('StartCalendarInterval');
        const details = calendarSpecs.map((spec) => describeCalendarSpec(spec));
        triggerParts.push(details.join(', '));
        for (const spec of calendarSpecs) {
          const next = computeNextCalendarRun(spec, options.nowMs);
          if (next !== null) nextCandidates.push(next);
        }
      }

      if (plist.RunAtLoad === true) {
        triggerTypes.push('RunAtLoad');
        triggerParts.push('at load');
      }

      const watchPaths: string[] = Array.isArray(plist.WatchPaths)
        ? plist.WatchPaths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : [];
      if (watchPaths.length > 0) {
        triggerTypes.push('WatchPaths');
        triggerParts.push(`watch ${watchPaths.length} path${watchPaths.length === 1 ? '' : 's'}`);
      }

      const stdoutPath = sanitizePathCandidate(plist.StandardOutPath);
      const stderrPath = sanitizePathCandidate(plist.StandardErrorPath);
      const logPath = stderrPath ?? stdoutPath;

      let lastRunAt: number | null = null;
      for (const candidate of [stderrPath, stdoutPath]) {
        if (!candidate) continue;
        try {
          if (!fs.existsSync(candidate)) continue;
          const mtimeMs = fs.statSync(candidate).mtimeMs;
          if (!lastRunAt || mtimeMs > lastRunAt) lastRunAt = Math.trunc(mtimeMs);
        } catch {
          // ignore
        }
      }

      const launchctlState = launchctlStatuses.get(label);
      const lastExitCode = launchctlState?.status ?? null;

      let lastExit: SchedulerJobStatus = 'unknown';
      if (typeof launchctlState?.pid === 'number' && launchctlState.pid > 0) {
        lastExit = 'running';
      } else if (typeof lastExitCode === 'number') {
        lastExit = lastExitCode === 0 ? 'ok' : 'failed';
      }

      const nextRunAt = nextCandidates.length > 0 ? Math.min(...nextCandidates) : null;
      let nextRunLabel = '--';
      if (nextRunAt !== null) nextRunLabel = 'scheduled';
      else if (watchPaths.length > 0) nextRunLabel = 'on change';
      else if (plist.RunAtLoad === true) nextRunLabel = 'on load';

      jobs.push({
        id: `launchd:${label}`,
        source: 'launchd',
        label,
        triggerTypes: triggerTypes.length > 0 ? triggerTypes : ['Manual'],
        triggerLabel: triggerParts.length > 0 ? triggerParts.join(' · ') : 'manual',
        nextRunAt,
        nextRunLabel,
        lastRunAt,
        lastExit,
        lastExitLabel: statusLabel(lastExit, lastExitCode),
        lastExitCode,
        enabled: launchctlStatuses.has(label),
        logPath,
        logSourceHint: logPath ? basenameWithoutExt(logPath) : null,
        actions: {
          canToggle: false,
          canRun: false,
        },
      });
    }
  }

  return jobs;
}

export function getSchedulerJobs(options: SchedulerBuildOptions): SchedulerJobInfo[] {
  const nowMs = options.nowMs ?? Date.now();
  const platform = options.platform ?? process.platform;
  const launchAgentDirs = getLaunchAgentDirs(options.launchAgentDirs);
  const runCommand = options.runCommand ?? defaultRunCommand;

  const jobs = [
    ...collectOpenClawJobs(options.cronFile, options.openclawDir),
    ...collectLaunchdJobs({
      platform,
      nowMs,
      launchAgentDirs,
      runCommand,
    }),
  ];

  const statusRank: Record<SchedulerJobStatus, number> = {
    failed: 0,
    running: 1,
    unknown: 2,
    ok: 3,
  };

  jobs.sort((a, b) => {
    const byStatus = statusRank[a.lastExit] - statusRank[b.lastExit];
    if (byStatus !== 0) return byStatus;

    if (a.nextRunAt !== null && b.nextRunAt !== null) return a.nextRunAt - b.nextRunAt;
    if (a.nextRunAt !== null) return -1;
    if (b.nextRunAt !== null) return 1;

    return a.label.localeCompare(b.label);
  });

  return jobs;
}

export const __testOnly = {
  parseLaunchctlList,
  normalizeCalendarSpecs,
  describeCalendarSpec,
  computeNextCalendarRun,
};
