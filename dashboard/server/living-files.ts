/**
 * Living Files engine (Issue #228).
 *
 * Tracks file ownership + freshness and auto-triggers remediation tasks
 * when registered files become stale.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { TaskCard } from './types.js';
import { isPathInsideRoot } from './path-containment.js';

export type LivingFileStatus = 'fresh' | 'warning' | 'stale' | 'missing' | 'static';
export type LivingFileTriggerStatus = 'queued' | 'acknowledged' | 'resolved';

export interface LivingFileEntry {
  fileId: string;
  filePath: string;
  ownerAgentId: string;
  expectedUpdateHours: number;
  intentionallyStatic: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastStatus?: LivingFileStatus;
  lastKnownMtimeMs?: number;
  lastAgeHours?: number | null;
  lastTriggeredAt?: string;
}

export interface LivingFileTrigger {
  triggerId: string;
  fileId: string;
  filePath: string;
  ownerAgentId: string;
  status: LivingFileTriggerStatus;
  reason: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

export interface LivingFileCheckRun {
  runId: string;
  source: string;
  startedAt: string;
  finishedAt: string;
  counts: {
    fresh: number;
    warning: number;
    stale: number;
    missing: number;
    static: number;
    triggered: number;
  };
}

export interface LivingFileSnapshot {
  entry: LivingFileEntry;
  status: LivingFileStatus;
  ageHours: number | null;
  mtimeMs: number | null;
  overdueByHours: number | null;
  expectedUpdateHours: number;
}

interface LivingFileStore {
  version: 1;
  files: LivingFileEntry[];
  triggers: LivingFileTrigger[];
  checks: LivingFileCheckRun[];
}

export interface RegisterLivingFileInput {
  filePath: string;
  ownerAgentId: string;
  expectedUpdateHours: number;
  intentionallyStatic?: boolean;
  notes?: string;
}

export interface UpdateLivingFileInput {
  ownerAgentId?: string;
  expectedUpdateHours?: number;
  intentionallyStatic?: boolean;
  notes?: string;
}

export interface LivingFileEngineOptions {
  now?: () => Date;
  checkIntervalMs?: number;
}

export interface LivingFileDashboardSummary {
  updatedAt: string;
  counts: {
    total: number;
    fresh: number;
    warning: number;
    stale: number;
    missing: number;
    static: number;
    openTriggers: number;
  };
  files: LivingFileSnapshot[];
  triggers: LivingFileTrigger[];
  checks: LivingFileCheckRun[];
}

const STORE_FILE = 'living-files.json';
const TASK_BOARD_FILE = 'task-board.json';
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MAX_CHECK_HISTORY = 120;
const MAX_TRIGGER_HISTORY = 1000;

function sanitizeText(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function sanitizeAgentId(input: unknown): string {
  const cleaned = sanitizeText(input).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'agent';
}

function normalizeExpectedUpdateHours(input: unknown, fallback = 24): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(24 * 90, Math.round(parsed)));
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeReadStore(storePath: string): LivingFileStore {
  try {
    if (!fs.existsSync(storePath)) return { version: 1, files: [], triggers: [], checks: [] };
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<LivingFileStore>;
    return {
      version: 1,
      files: Array.isArray(parsed.files) ? parsed.files : [],
      triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
    };
  } catch {
    return { version: 1, files: [], triggers: [], checks: [] };
  }
}

function normalizeRelativeFilePath(workspaceDir: string, rawPath: string): string {
  const normalizedInput = sanitizeText(rawPath).replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalizedInput) || /^[A-Za-z]:\//.test(normalizedInput)) {
    throw new Error('filePath must stay inside workspace');
  }
  const cleaned = normalizedInput.replace(/^\/+/, '');
  if (!cleaned) throw new Error('filePath is required');
  const resolved = path.resolve(workspaceDir, cleaned);
  const root = path.resolve(workspaceDir);
  if (!isPathInsideRoot(root, resolved)) throw new Error('filePath must stay inside workspace');
  return path.relative(root, resolved).replace(/\\/g, '/');
}

function evaluateSnapshot(
  entry: LivingFileEntry,
  workspaceDir: string,
  nowMs: number,
): { status: LivingFileStatus; ageHours: number | null; mtimeMs: number | null; overdueByHours: number | null } {
  if (entry.intentionallyStatic) {
    return { status: 'static', ageHours: null, mtimeMs: null, overdueByHours: null };
  }

  const absPath = path.resolve(workspaceDir, entry.filePath);
  const workspaceRoot = path.resolve(workspaceDir);
  if (!isPathInsideRoot(workspaceRoot, absPath) || !fs.existsSync(absPath)) {
    return {
      status: 'missing',
      ageHours: null,
      mtimeMs: null,
      overdueByHours: null,
    };
  }

  const stat = fs.statSync(absPath);
  const mtimeMs = stat.mtimeMs;
  const ageHours = Math.max(0, (nowMs - mtimeMs) / (1000 * 60 * 60));
  const overdueByHours = Math.max(0, ageHours - entry.expectedUpdateHours);

  if (ageHours <= entry.expectedUpdateHours) {
    return { status: 'fresh', ageHours, mtimeMs, overdueByHours: null };
  }
  if (ageHours <= entry.expectedUpdateHours * 1.25) {
    return { status: 'warning', ageHours, mtimeMs, overdueByHours };
  }
  return { status: 'stale', ageHours, mtimeMs, overdueByHours };
}

function readTaskBoardCards(dataDir: string): TaskCard[] {
  try {
    const filePath = path.join(dataDir, TASK_BOARD_FILE);
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { tasks?: TaskCard[] };
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch {
    return [];
  }
}

function saveTaskBoardCards(dataDir: string, tasks: TaskCard[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, TASK_BOARD_FILE);
  fs.writeFileSync(filePath, JSON.stringify({ tasks }, null, 2), 'utf8');
}

function isOpenTriggerStatus(status: LivingFileTriggerStatus): boolean {
  return status === 'queued' || status === 'acknowledged';
}

export class LivingFileEngine {
  private readonly dataDir: string;
  private readonly workspaceDir: string;
  private readonly storePath: string;
  private readonly now: () => Date;
  private readonly checkIntervalMs: number;
  private readonly timer: NodeJS.Timeout | null;
  private store: LivingFileStore;

  constructor(dataDir: string, workspaceDir: string, opts: LivingFileEngineOptions = {}) {
    this.dataDir = path.resolve(dataDir);
    this.workspaceDir = path.resolve(workspaceDir);
    this.storePath = path.join(this.dataDir, STORE_FILE);
    this.now = opts.now ?? (() => new Date());
    this.checkIntervalMs = opts.checkIntervalMs == null
      ? DEFAULT_CHECK_INTERVAL_MS
      : Math.max(0, Math.trunc(opts.checkIntervalMs));
    this.store = safeReadStore(this.storePath);

    if (this.checkIntervalMs > 0) {
      this.timer = setInterval(() => {
        try {
          this.runStalenessCheck({ source: 'scheduler', autoTrigger: true });
        } catch {
          // Scheduler should never crash the server.
        }
      }, this.checkIntervalMs);
      this.timer.unref();
    } else {
      this.timer = null;
    }
  }

  listFiles(filter: { ownerAgentId?: string } = {}): LivingFileEntry[] {
    const owner = sanitizeAgentId(filter.ownerAgentId);
    const rows = this.store.files
      .slice()
      .sort((a, b) => a.filePath.localeCompare(b.filePath))
      .filter((entry) => !filter.ownerAgentId || entry.ownerAgentId === owner);
    return deepClone(rows);
  }

  getFile(fileId: string): LivingFileEntry | null {
    const row = this.store.files.find((entry) => entry.fileId === fileId);
    return row ? deepClone(row) : null;
  }

  registerFile(input: RegisterLivingFileInput): LivingFileEntry {
    const filePath = normalizeRelativeFilePath(this.workspaceDir, input.filePath);
    const ownerAgentId = sanitizeAgentId(input.ownerAgentId);
    const expectedUpdateHours = normalizeExpectedUpdateHours(input.expectedUpdateHours, 24);
    const intentionallyStatic = input.intentionallyStatic === true;
    const notes = sanitizeText(input.notes) || undefined;
    const ts = nowIso(this.now);

    const existing = this.store.files.find((entry) => entry.filePath === filePath);
    if (existing) {
      existing.ownerAgentId = ownerAgentId;
      existing.expectedUpdateHours = expectedUpdateHours;
      existing.intentionallyStatic = intentionallyStatic;
      existing.notes = notes;
      existing.updatedAt = ts;
      this.persist();
      return deepClone(existing);
    }

    const created: LivingFileEntry = {
      fileId: `lf-${crypto.randomUUID().slice(0, 10)}`,
      filePath,
      ownerAgentId,
      expectedUpdateHours,
      intentionallyStatic,
      notes,
      createdAt: ts,
      updatedAt: ts,
    };
    this.store.files.push(created);
    this.persist();
    return deepClone(created);
  }

  updateFile(fileId: string, patch: UpdateLivingFileInput): LivingFileEntry {
    const entry = this.store.files.find((row) => row.fileId === fileId);
    if (!entry) throw new Error(`Living file not found: ${fileId}`);

    if (patch.ownerAgentId != null) entry.ownerAgentId = sanitizeAgentId(patch.ownerAgentId);
    if (patch.expectedUpdateHours != null) {
      entry.expectedUpdateHours = normalizeExpectedUpdateHours(patch.expectedUpdateHours, entry.expectedUpdateHours);
    }
    if (patch.intentionallyStatic != null) entry.intentionallyStatic = patch.intentionallyStatic === true;
    if (patch.notes != null) entry.notes = sanitizeText(patch.notes) || undefined;
    entry.updatedAt = nowIso(this.now);

    this.persist();
    return deepClone(entry);
  }

  unregisterFile(fileId: string): boolean {
    const before = this.store.files.length;
    this.store.files = this.store.files.filter((entry) => entry.fileId !== fileId);
    if (this.store.files.length === before) return false;
    this.persist();
    return true;
  }

  listTriggers(filter: { status?: LivingFileTriggerStatus; fileId?: string; limit?: number } = {}): LivingFileTrigger[] {
    const limit = Math.max(1, Math.min(500, Math.trunc(filter.limit ?? 200)));
    const rows = this.store.triggers
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .filter((trigger) => (!filter.status || trigger.status === filter.status) && (!filter.fileId || trigger.fileId === filter.fileId));
    return deepClone(rows.slice(0, limit));
  }

  acknowledgeTrigger(triggerId: string): LivingFileTrigger {
    const trigger = this.store.triggers.find((row) => row.triggerId === triggerId);
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`);
    if (trigger.status !== 'queued') return deepClone(trigger);
    trigger.status = 'acknowledged';
    trigger.updatedAt = nowIso(this.now);
    this.persist();
    return deepClone(trigger);
  }

  resolveTrigger(triggerId: string, note?: string): LivingFileTrigger {
    const trigger = this.store.triggers.find((row) => row.triggerId === triggerId);
    if (!trigger) throw new Error(`Trigger not found: ${triggerId}`);
    if (trigger.status === 'resolved') return deepClone(trigger);
    const ts = nowIso(this.now);
    trigger.status = 'resolved';
    trigger.resolvedAt = ts;
    trigger.updatedAt = ts;
    trigger.resolutionNote = sanitizeText(note) || undefined;
    this.persist();
    return deepClone(trigger);
  }

  runStalenessCheck(input: { source?: string; autoTrigger?: boolean } = {}): {
    run: LivingFileCheckRun;
    snapshots: LivingFileSnapshot[];
    triggered: LivingFileTrigger[];
  } {
    const source = sanitizeText(input.source) || 'manual';
    const autoTrigger = input.autoTrigger !== false;
    const startedAt = nowIso(this.now);
    const nowMs = this.now().getTime();
    const counts = { fresh: 0, warning: 0, stale: 0, missing: 0, static: 0, triggered: 0 };
    const triggered: LivingFileTrigger[] = [];
    const snapshots: LivingFileSnapshot[] = [];

    for (const entry of this.store.files) {
      const evaluation = evaluateSnapshot(entry, this.workspaceDir, nowMs);
      counts[evaluation.status] += 1;
      entry.lastCheckedAt = startedAt;
      entry.lastStatus = evaluation.status;
      entry.lastKnownMtimeMs = evaluation.mtimeMs ?? undefined;
      entry.lastAgeHours = evaluation.ageHours;

      snapshots.push({
        entry: deepClone(entry),
        status: evaluation.status,
        ageHours: evaluation.ageHours,
        mtimeMs: evaluation.mtimeMs,
        overdueByHours: evaluation.overdueByHours,
        expectedUpdateHours: entry.expectedUpdateHours,
      });

      if (!autoTrigger) continue;
      if (evaluation.status !== 'stale' && evaluation.status !== 'missing') {
        this.resolveOpenTriggersForFile(entry.fileId, 'File returned to healthy state');
        continue;
      }

      const open = this.store.triggers.find(
        (row) => row.fileId === entry.fileId && isOpenTriggerStatus(row.status),
      );
      if (open) continue;

      const trigger = this.createTrigger(entry, source, evaluation.status);
      triggered.push(trigger);
      counts.triggered += 1;
    }

    const finishedAt = nowIso(this.now);
    const run: LivingFileCheckRun = {
      runId: `lf-run-${crypto.randomUUID().slice(0, 10)}`,
      source,
      startedAt,
      finishedAt,
      counts,
    };
    this.store.checks.push(run);
    if (this.store.checks.length > MAX_CHECK_HISTORY) {
      this.store.checks.splice(0, this.store.checks.length - MAX_CHECK_HISTORY);
    }
    this.persist();

    return {
      run: deepClone(run),
      snapshots: deepClone(snapshots),
      triggered: deepClone(triggered),
    };
  }

  getDashboardSummary(limit = 200): LivingFileDashboardSummary {
    const nowMs = this.now().getTime();
    const snapshots: LivingFileSnapshot[] = this.store.files
      .map((entry) => {
        const evaluation = evaluateSnapshot(entry, this.workspaceDir, nowMs);
        return {
          entry: deepClone(entry),
          status: evaluation.status,
          ageHours: evaluation.ageHours,
          mtimeMs: evaluation.mtimeMs,
          overdueByHours: evaluation.overdueByHours,
          expectedUpdateHours: entry.expectedUpdateHours,
        };
      })
      .sort((a, b) => a.entry.filePath.localeCompare(b.entry.filePath))
      .slice(0, Math.max(1, Math.min(1000, Math.trunc(limit))));

    const counts = {
      total: snapshots.length,
      fresh: snapshots.filter((row) => row.status === 'fresh').length,
      warning: snapshots.filter((row) => row.status === 'warning').length,
      stale: snapshots.filter((row) => row.status === 'stale').length,
      missing: snapshots.filter((row) => row.status === 'missing').length,
      static: snapshots.filter((row) => row.status === 'static').length,
      openTriggers: this.store.triggers.filter((row) => isOpenTriggerStatus(row.status)).length,
    };

    return deepClone({
      updatedAt: nowIso(this.now),
      counts,
      files: snapshots,
      triggers: this.listTriggers({ limit: 80 }),
      checks: this.store.checks.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 30),
    });
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private resolveOpenTriggersForFile(fileId: string, note: string): void {
    const ts = nowIso(this.now);
    for (const trigger of this.store.triggers) {
      if (trigger.fileId !== fileId || !isOpenTriggerStatus(trigger.status)) continue;
      trigger.status = 'resolved';
      trigger.resolvedAt = ts;
      trigger.updatedAt = ts;
      trigger.resolutionNote = note;
    }
  }

  private createTrigger(entry: LivingFileEntry, source: string, status: LivingFileStatus): LivingFileTrigger {
    const ts = nowIso(this.now);
    const trigger: LivingFileTrigger = {
      triggerId: `lf-trg-${crypto.randomUUID().slice(0, 10)}`,
      fileId: entry.fileId,
      filePath: entry.filePath,
      ownerAgentId: entry.ownerAgentId,
      status: 'queued',
      reason: status === 'missing'
        ? `Registered file is missing: ${entry.filePath}`
        : `File is stale beyond ${entry.expectedUpdateHours}h window`,
      source,
      createdAt: ts,
      updatedAt: ts,
    };
    trigger.taskId = this.enqueueTaskForTrigger(entry, trigger);
    this.store.triggers.push(trigger);
    if (this.store.triggers.length > MAX_TRIGGER_HISTORY) {
      this.store.triggers.splice(0, this.store.triggers.length - MAX_TRIGGER_HISTORY);
    }
    entry.lastTriggeredAt = ts;
    entry.updatedAt = ts;
    return trigger;
  }

  private enqueueTaskForTrigger(entry: LivingFileEntry, trigger: LivingFileTrigger): string | undefined {
    const tasks = readTaskBoardCards(this.dataDir);
    const openExisting = tasks.find((task) =>
      task.status !== 'done' &&
      task.status !== 'failed' &&
      task.title === `Living File Refresh: ${entry.filePath}` &&
      task.assigneeId === entry.ownerAgentId,
    );
    if (openExisting) return openExisting.id;

    const nowMs = this.now().getTime();
    const id = `task-${crypto.randomUUID().slice(0, 10)}`;
    const card: TaskCard = {
      id,
      agentId: entry.ownerAgentId,
      title: `Living File Refresh: ${entry.filePath}`,
      description: `${trigger.reason}\n\nOwner: ${entry.ownerAgentId}\nExpected cadence: ${entry.expectedUpdateHours}h`,
      priority: 'medium',
      status: 'queued',
      createdAt: nowMs,
      queuedAt: nowMs,
      startedAt: null,
      completedAt: null,
      resultSummary: null,
      tokensUsed: null,
      error: null,
      costEstimate: null,
      runtimeMs: null,
      missionId: `living-files-${new Date(nowMs).toISOString().slice(0, 10)}`,
      missionBrief: 'Living files staleness remediation',
      assigneeType: 'agent',
      assigneeId: entry.ownerAgentId,
      dependencies: [],
      artifactLinks: [entry.filePath],
      replaySessionId: null,
      statusHistory: [
        {
          status: 'queued',
          at: nowMs,
          by: 'living-files',
          note: trigger.triggerId,
        },
      ],
    };
    tasks.push(card);
    saveTaskBoardCards(this.dataDir, tasks);
    return id;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf8');
  }
}

const engineCache = new Map<string, LivingFileEngine>();

function engineKey(dataDir: string, workspaceDir: string): string {
  return `${path.resolve(dataDir)}::${path.resolve(workspaceDir)}`;
}

export function getLivingFileEngine(
  dataDir: string,
  workspaceDir: string,
  opts: LivingFileEngineOptions = {},
): LivingFileEngine {
  const key = engineKey(dataDir, workspaceDir);
  const cached = engineCache.get(key);
  if (cached) return cached;
  const created = new LivingFileEngine(dataDir, workspaceDir, opts);
  engineCache.set(key, created);
  return created;
}

export function resetLivingFileEngine(dataDir?: string, workspaceDir?: string): void {
  if (!dataDir || !workspaceDir) {
    for (const engine of engineCache.values()) engine.dispose();
    engineCache.clear();
    return;
  }
  const key = engineKey(dataDir, workspaceDir);
  const engine = engineCache.get(key);
  if (engine) engine.dispose();
  engineCache.delete(key);
}
