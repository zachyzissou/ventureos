/**
 * Self-Improvement Digest Engine (Issue #222)
 *
 * Stores daily digest records and explicit recommendation approval/apply state.
 * Recommendations are always scoped to the requesting agent's own workspace.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RecommendationType =
  | 'soul_edit'
  | 'skill_add'
  | 'skill_config'
  | 'memory_restructure'
  | 'workflow_change';

export type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface ImprovementRecommendation {
  id: string;
  digestId: string;
  type: RecommendationType;
  target: string;
  currentValue: string;
  proposedValue: string;
  rationale: string;
  status: RecommendationStatus;
  diff: string;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  appliedAt?: string;
}

export interface SelfImprovementDigestRecord {
  id: string;
  agentId: string;
  date: string;
  digestContent: string;
  recommendations: ImprovementRecommendation[];
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
  sourceMetrics: {
    totalTasks: number;
    doneTasks: number;
    failedTasks: number;
    failureRate: number;
    avgRuntimeMs: number;
    staleRunningCount: number;
  };
}

export interface GenerateDigestOptions {
  dataDir: string;
  workspaceDir: string;
  agentId: string;
  now?: () => Date;
  minRecommendations?: number;
  dateOverride?: string;
}

interface TaskCardLike {
  id: string;
  title: string;
  status: string;
  agentId: string | null;
  runtimeMs: number | null;
  startedAt: number | null;
}

interface TaskSignals {
  totalTasks: number;
  doneTasks: number;
  failedTasks: number;
  failureRate: number;
  avgRuntimeMs: number;
  staleRunningCount: number;
}

interface RecommendationDraft {
  type: RecommendationType;
  target: string;
  rationale: string;
  proposedValue: string;
}

const DIGESTS_FILE = 'self-improvement-digests.json';

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function sanitizeAgentId(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return cleaned || 'main';
}

function digestFilePath(dataDir: string): string {
  return path.join(dataDir, DIGESTS_FILE);
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as T[];
  } catch {
    return [];
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function loadSelfImprovementDigests(dataDir: string): SelfImprovementDigestRecord[] {
  return readJsonArray<SelfImprovementDigestRecord>(digestFilePath(dataDir))
    .filter((digest) => typeof digest.id === 'string' && Array.isArray(digest.recommendations));
}

function saveSelfImprovementDigests(dataDir: string, digests: SelfImprovementDigestRecord[]): void {
  const sorted = [...digests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 365);
  writeJson(digestFilePath(dataDir), sorted);
}

function readTaskBoardSignals(dataDir: string, agentId: string, now: () => Date): TaskSignals {
  const filePath = path.join(dataDir, 'task-board.json');
  let tasks: TaskCardLike[] = [];
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { tasks?: Array<Record<string, unknown>> };
      tasks = Array.isArray(parsed.tasks)
        ? parsed.tasks.map((t): TaskCardLike => ({
          id: String(t.id ?? ''),
          title: String(t.title ?? ''),
          status: String(t.status ?? 'unknown'),
          agentId: t.agentId == null ? null : String(t.agentId),
          runtimeMs: typeof t.runtimeMs === 'number' ? t.runtimeMs : null,
          startedAt: typeof t.startedAt === 'number' ? t.startedAt : null,
        }))
        : [];
    }
  } catch {
    tasks = [];
  }

  const relevant = tasks.filter((task) => task.agentId == null || sanitizeAgentId(task.agentId) === agentId);
  const doneTasks = relevant.filter((task) => task.status === 'done').length;
  const failedTasks = relevant.filter((task) => task.status === 'failed').length;
  const runtimeValues = relevant
    .map((task) => task.runtimeMs)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const avgRuntimeMs = runtimeValues.length > 0
    ? Math.round(runtimeValues.reduce((sum, value) => sum + value, 0) / runtimeValues.length)
    : 0;

  const staleCutoff = now().getTime() - (90 * 60 * 1000); // 90 minutes
  const staleRunningCount = relevant.filter((task) => (
    task.status === 'running'
    && typeof task.startedAt === 'number'
    && task.startedAt > 0
    && task.startedAt < staleCutoff
  )).length;

  const totalTasks = relevant.length;
  const failureRate = totalTasks > 0 ? failedTasks / totalTasks : 0;

  return {
    totalTasks,
    doneTasks,
    failedTasks,
    failureRate: Number(failureRate.toFixed(4)),
    avgRuntimeMs,
    staleRunningCount,
  };
}

function formatRuntime(ms: number): string {
  if (ms <= 0) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 120) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function buildDigestId(agentId: string, date: string, now: () => Date): string {
  const seed = `${agentId}:${date}:${nowIso(now)}`;
  const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10);
  return `sid-${date}-${agentId}-${hash}`;
}

function buildRecommendationId(digestId: string, target: string, type: RecommendationType, index: number): string {
  const hash = crypto.createHash('sha1').update(`${digestId}:${target}:${type}:${index}`).digest('hex').slice(0, 10);
  return `sir-${hash}`;
}

function readFileIfExists(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function buildUnifiedDiff(target: string, currentValue: string, proposedValue: string): string {
  const oldLines = currentValue ? currentValue.split('\n') : [''];
  const newLines = proposedValue.split('\n');
  const removed = oldLines.map((line) => `-${line}`).join('\n');
  const added = newLines.map((line) => `+${line}`).join('\n');
  return [
    `--- a/${target}`,
    `+++ b/${target}`,
    '@@',
    removed,
    added,
  ].join('\n');
}

function recommendationsFromSignals(agentId: string, signals: TaskSignals): RecommendationDraft[] {
  const soulTarget = `souls/${agentId}/SOUL.md`;
  const principlesTarget = `souls/${agentId}/PRINCIPLES.md`;
  const playbookTarget = `memory/self-improvement/${agentId}-playbook.md`;
  const queueTarget = `memory/self-improvement/${agentId}-queue.md`;

  const drafts: RecommendationDraft[] = [];

  if (signals.failureRate >= 0.15 || signals.failedTasks >= 3) {
    drafts.push({
      type: 'workflow_change',
      target: principlesTarget,
      rationale: `Failure rate is ${(signals.failureRate * 100).toFixed(1)}%; codify a tighter recovery loop after failed tasks.`,
      proposedValue: [
        '## Failure Recovery Loop',
        '- After any failed task, record root cause in one sentence.',
        '- Run a focused retry with one changed variable only.',
        '- If two retries fail, escalate with explicit blocker + owner.',
      ].join('\n'),
    });
  }

  if (signals.avgRuntimeMs >= 120_000 || signals.staleRunningCount > 0) {
    drafts.push({
      type: 'skill_config',
      target: soulTarget,
      rationale: `Average runtime is ${formatRuntime(signals.avgRuntimeMs)} with ${signals.staleRunningCount} stale running tasks; enforce tighter execution budgets.`,
      proposedValue: [
        '## Execution Budget Guardrails',
        '- Default implementation window: 45 minutes.',
        '- If estimate exceeds window, split into two tracked tasks before coding.',
        '- Emit checkpoint update every 20 minutes with current blocker.',
      ].join('\n'),
    });
  }

  drafts.push({
    type: 'memory_restructure',
    target: playbookTarget,
    rationale: 'Create a stable daily reflection structure so improvements are easy to compare day-over-day.',
    proposedValue: [
      '# Daily Improvement Playbook',
      '',
      '## Reflection Checklist',
      '- Top 2 wins with evidence',
      '- Top 2 misses with root cause',
      '- One rule change to test tomorrow',
      '- One workflow optimization to test tomorrow',
    ].join('\n'),
  });

  drafts.push({
    type: 'skill_add',
    target: queueTarget,
    rationale: 'Track repeated questions and slow tasks in one queue to reduce repeated context misses.',
    proposedValue: [
      '# Improvement Queue',
      '',
      '| Date | Pattern | Proposed Fix | Owner | Status |',
      '|------|---------|--------------|-------|--------|',
      '| YYYY-MM-DD | repeated clarification on scope | add tighter intake checklist | self | pending |',
    ].join('\n'),
  });

  drafts.push({
    type: 'soul_edit',
    target: soulTarget,
    rationale: 'Harden explicit self-review expectations directly in the role card.',
    proposedValue: [
      '## Daily Self-Review Contract',
      '- Generate one self-improvement digest every 24h.',
      '- Include at least 3 concrete, diffable recommendations.',
      '- Never auto-apply changes without explicit approval.',
    ].join('\n'),
  });

  return drafts;
}

function toRecommendation(
  draft: RecommendationDraft,
  digestId: string,
  index: number,
  workspaceDir: string,
  now: () => Date,
): ImprovementRecommendation {
  const absoluteTarget = path.join(workspaceDir, draft.target);
  const existing = readFileIfExists(absoluteTarget);
  const currentValue = existing.includes(draft.proposedValue) ? draft.proposedValue : '';
  const createdAt = nowIso(now);
  return {
    id: buildRecommendationId(digestId, draft.target, draft.type, index),
    digestId,
    type: draft.type,
    target: draft.target,
    currentValue,
    proposedValue: draft.proposedValue,
    rationale: draft.rationale,
    status: 'pending',
    diff: buildUnifiedDiff(draft.target, currentValue, draft.proposedValue),
    createdAt,
  };
}

function ensureMinRecommendations(
  drafts: RecommendationDraft[],
  minRecommendations: number,
): RecommendationDraft[] {
  if (drafts.length >= minRecommendations) return drafts;

  const fallback: RecommendationDraft[] = [
    {
      type: 'workflow_change',
      target: 'memory/self-improvement/default-workflow.md',
      rationale: 'Fallback recommendation to ensure minimum actionable set.',
      proposedValue: [
        '# Default Workflow Tune-Up',
        '- Track assumptions explicitly before implementation.',
        '- Add one measurable success metric for each task.',
      ].join('\n'),
    },
    {
      type: 'memory_restructure',
      target: 'memory/self-improvement/default-memory.md',
      rationale: 'Fallback recommendation to improve memory hygiene.',
      proposedValue: [
        '# Default Memory Hygiene',
        '- Archive stale notes weekly.',
        '- Keep active notes concise and evidence-linked.',
      ].join('\n'),
    },
  ];

  const out = [...drafts];
  for (const candidate of fallback) {
    if (out.length >= minRecommendations) break;
    out.push(candidate);
  }
  return out;
}

function computeCounts(recommendations: ImprovementRecommendation[]): {
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
} {
  let approvedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  for (const recommendation of recommendations) {
    if (recommendation.status === 'rejected') rejectedCount += 1;
    else if (recommendation.status === 'pending') pendingCount += 1;
    else approvedCount += 1; // approved + applied
  }
  return { approvedCount, rejectedCount, pendingCount };
}

function digestMarkdown(
  digest: SelfImprovementDigestRecord,
  recommendations: ImprovementRecommendation[],
): string {
  const wins: string[] = [];
  if (digest.sourceMetrics.doneTasks > 0) wins.push(`Completed tasks: ${digest.sourceMetrics.doneTasks}`);
  if (digest.sourceMetrics.failureRate < 0.15) wins.push(`Failure rate remained low (${(digest.sourceMetrics.failureRate * 100).toFixed(1)}%)`);
  if (wins.length === 0) wins.push('No major wins detected today; focus on consistency improvements.');

  const misses: string[] = [];
  if (digest.sourceMetrics.failedTasks > 0) misses.push(`Failed tasks: ${digest.sourceMetrics.failedTasks}`);
  if (digest.sourceMetrics.staleRunningCount > 0) misses.push(`Stale running tasks: ${digest.sourceMetrics.staleRunningCount}`);
  if (digest.sourceMetrics.avgRuntimeMs > 120_000) misses.push(`Average runtime is high (${formatRuntime(digest.sourceMetrics.avgRuntimeMs)})`);
  if (misses.length === 0) misses.push('No critical misses detected; maintain current operating rhythm.');

  const recommendationLines = recommendations.map((rec, idx) => [
    `### ${idx + 1}. ${rec.type} → \`${rec.target}\``,
    `- ID: \`${rec.id}\``,
    `- Status: \`${rec.status}\``,
    `- Rationale: ${rec.rationale}`,
    '',
    '```diff',
    rec.diff,
    '```',
  ].join('\n'));

  return [
    `# Self-Improvement Digest — ${digest.date}`,
    '',
    `- Agent: \`${digest.agentId}\``,
    `- Digest ID: \`${digest.id}\``,
    `- Created At: ${digest.createdAt}`,
    '',
    '## What Went Well',
    ...wins.map((line) => `- ${line}`),
    '',
    '## What Did Not Go Well',
    ...misses.map((line) => `- ${line}`),
    '',
    '## Recommendations',
    ...recommendationLines,
    '',
    '## Approval Notes',
    '- Recommendations are suggestions only.',
    '- Nothing is auto-applied until explicitly approved.',
  ].join('\n');
}

function writeDigestMarkdown(workspaceDir: string, date: string, content: string): string {
  const relPath = path.join('memory', 'self-improvement', `${date}.md`);
  const absPath = path.join(workspaceDir, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return relPath;
}

function isPathWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isAllowedTargetForAgent(workspaceDir: string, agentId: string, target: string): boolean {
  if (!target || target.includes('\0')) return false;
  const normalizedTarget = target.replace(/\\/g, '/');
  const absTarget = path.resolve(workspaceDir, normalizedTarget);
  const soulRoot = path.resolve(workspaceDir, 'souls', agentId);
  const memoryRoot = path.resolve(workspaceDir, 'memory', 'self-improvement');

  if (absTarget === soulRoot || absTarget === memoryRoot) return false;
  return isPathWithin(soulRoot, absTarget) || isPathWithin(memoryRoot, absTarget);
}

function applyRecommendationToWorkspace(
  workspaceDir: string,
  agentId: string,
  recommendation: ImprovementRecommendation,
): { applied: boolean; message: string } {
  if (!isAllowedTargetForAgent(workspaceDir, agentId, recommendation.target)) {
    return { applied: false, message: 'Recommendation target is outside allowed agent workspace scope' };
  }

  const absTarget = path.resolve(workspaceDir, recommendation.target);
  const existing = readFileIfExists(absTarget);

  let next: string;
  if (existing.includes(recommendation.proposedValue)) {
    next = existing;
  } else if (recommendation.currentValue && existing.includes(recommendation.currentValue)) {
    next = existing.replace(recommendation.currentValue, recommendation.proposedValue);
  } else if (!existing.trim()) {
    next = recommendation.proposedValue.trim() + '\n';
  } else {
    next = `${existing.replace(/\s+$/, '')}\n\n${recommendation.proposedValue.trim()}\n`;
  }

  fs.mkdirSync(path.dirname(absTarget), { recursive: true });
  fs.writeFileSync(absTarget, next);
  return { applied: true, message: 'Applied recommendation to target file' };
}

export function generateSelfImprovementDigest(
  options: GenerateDigestOptions,
): { digest: SelfImprovementDigestRecord; digestPath: string } {
  const now = options.now ?? (() => new Date());
  const agentId = sanitizeAgentId(options.agentId);
  const date = options.dateOverride ?? nowIso(now).slice(0, 10);
  const minRecommendations = Math.max(1, options.minRecommendations ?? 3);
  const signals = readTaskBoardSignals(options.dataDir, agentId, now);

  const digestId = buildDigestId(agentId, date, now);
  const drafts = ensureMinRecommendations(recommendationsFromSignals(agentId, signals), minRecommendations).slice(0, 12);
  const recommendations = drafts.map((draft, index) => (
    toRecommendation(draft, digestId, index, options.workspaceDir, now)
  ));

  const createdAt = nowIso(now);
  const digest: SelfImprovementDigestRecord = {
    id: digestId,
    agentId,
    date,
    digestContent: '',
    recommendations,
    approvedCount: 0,
    rejectedCount: 0,
    pendingCount: recommendations.length,
    createdAt,
    updatedAt: createdAt,
    sourceMetrics: signals,
  };

  digest.digestContent = digestMarkdown(digest, recommendations);
  const digestPath = writeDigestMarkdown(options.workspaceDir, date, digest.digestContent);

  const allDigests = loadSelfImprovementDigests(options.dataDir).filter((entry) => !(entry.agentId === agentId && entry.date === date));
  allDigests.push(digest);
  saveSelfImprovementDigests(options.dataDir, allDigests);

  return { digest, digestPath };
}

export function listSelfImprovementDigests(
  dataDir: string,
  opts: { agentId?: string; limit?: number } = {},
): SelfImprovementDigestRecord[] {
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 365));
  const agentId = opts.agentId ? sanitizeAgentId(opts.agentId) : undefined;
  return loadSelfImprovementDigests(dataDir)
    .filter((digest) => !agentId || digest.agentId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

function withUpdatedCounts(digest: SelfImprovementDigestRecord): SelfImprovementDigestRecord {
  const counts = computeCounts(digest.recommendations);
  return {
    ...digest,
    approvedCount: counts.approvedCount,
    rejectedCount: counts.rejectedCount,
    pendingCount: counts.pendingCount,
  };
}

export function setRecommendationStatus(
  options: {
    dataDir: string;
    workspaceDir: string;
    agentId: string;
    recommendationId: string;
    action: 'approve' | 'reject';
    now?: () => Date;
  },
): { ok: boolean; digest?: SelfImprovementDigestRecord; recommendation?: ImprovementRecommendation; message: string } {
  const now = options.now ?? (() => new Date());
  const agentId = sanitizeAgentId(options.agentId);
  const digests = loadSelfImprovementDigests(options.dataDir);
  let updatedDigest: SelfImprovementDigestRecord | undefined;
  let updatedRecommendation: ImprovementRecommendation | undefined;

  for (let i = 0; i < digests.length; i += 1) {
    const digest = digests[i];
    const recommendationIndex = digest.recommendations.findIndex((rec) => rec.id === options.recommendationId);
    if (recommendationIndex < 0) continue;

    if (digest.agentId !== agentId) {
      return { ok: false, message: 'Recommendation does not belong to the requested agent scope' };
    }

    const recommendation = { ...digest.recommendations[recommendationIndex] };
    if (recommendation.status === 'rejected' && options.action === 'reject') {
      return { ok: false, message: 'Recommendation is already rejected' };
    }
    if (recommendation.status === 'applied' && options.action === 'approve') {
      return { ok: false, message: 'Recommendation is already applied' };
    }

    if (options.action === 'reject') {
      recommendation.status = 'rejected';
      recommendation.rejectedAt = nowIso(now);
    } else {
      recommendation.status = 'approved';
      recommendation.approvedAt = nowIso(now);
      const applyResult = applyRecommendationToWorkspace(options.workspaceDir, agentId, recommendation);
      if (!applyResult.applied) {
        return { ok: false, message: applyResult.message };
      }
      recommendation.status = 'applied';
      recommendation.appliedAt = nowIso(now);
    }

    const nextRecommendations = [...digest.recommendations];
    nextRecommendations[recommendationIndex] = recommendation;
    const refreshedDigest = withUpdatedCounts({
      ...digest,
      recommendations: nextRecommendations,
      updatedAt: nowIso(now),
    });

    digests[i] = refreshedDigest;
    updatedDigest = refreshedDigest;
    updatedRecommendation = recommendation;
    break;
  }

  if (!updatedDigest || !updatedRecommendation) {
    return { ok: false, message: 'Recommendation not found' };
  }

  saveSelfImprovementDigests(options.dataDir, digests);
  return {
    ok: true,
    digest: updatedDigest,
    recommendation: updatedRecommendation,
    message: options.action === 'approve' ? 'Recommendation approved and applied' : 'Recommendation rejected',
  };
}
