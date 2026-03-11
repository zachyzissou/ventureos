/**
 * Token Compactor (Issue #221)
 *
 * Deterministic, zero-LLM prompt-context compression pipeline with five layers:
 * 1) whitespace normalization
 * 2) comment stripping
 * 3) cross-file deduplication
 * 4) abbreviation (bundle metadata)
 * 5) priority pruning
 */

import crypto from 'node:crypto';
import path from 'node:path';

export type CompressionLevel = 'conservative' | 'standard' | 'aggressive';
export type CompactionLayer =
  | 'whitespace-normalization'
  | 'comment-stripping'
  | 'deduplication'
  | 'abbreviation'
  | 'priority-pruning';

export interface CompactorConfig {
  level?: CompressionLevel;
  protectedFiles?: string[];
  maxProcessingMs?: number;
  now?: () => Date;
  sessionId?: string;
  agentId?: string;
  costPer1kTokensUsd?: number;
}

export interface CompactorFileInput {
  path: string;
  content: string;
  /** Higher number = higher retention priority. Default 0. */
  priority?: number;
  /** Optional recency signal in epoch milliseconds. Higher = more recent. */
  updatedAtMs?: number;
}

export interface CompactorFileOutput {
  path: string;
  protected: boolean;
  skippedReason?: 'protected-file-pattern' | 'non-text-file' | 'priority-pruned' | 'max-processing-ms-exceeded';
  layersApplied: CompactionLayer[];
  originalChars: number;
  compressedChars: number;
  content: string;
}

export interface LayerContribution {
  layer: CompactionLayer;
  preTokens: number;
  postTokens: number;
  savedTokens: number;
  savedPct: number;
}

export interface CompactionMetrics {
  sessionId: string;
  agentId?: string;
  level: CompressionLevel;
  startedAt: string;
  completedAt: string;
  timestamp: string;
  durationMs: number;
  preTokens: number;
  postTokens: number;
  compressionRatio: number;
  reductionPct: number;
  targetReductionPct: number;
  layersApplied: CompactionLayer[];
  layerContributions: LayerContribution[];
  estimatedSavingsUsd: number;
  timedOut: boolean;
}

export interface CompactionResult {
  files: CompactorFileOutput[];
  bundledContext: string;
  metrics: CompactionMetrics;
}

interface WorkingFile {
  readonly index: number;
  readonly path: string;
  readonly originalContent: string;
  readonly priority: number;
  readonly updatedAtMs?: number;
  readonly originalChars: number;
  readonly originalTokens: number;
  readonly protectedByPattern: boolean;
  readonly textFile: boolean;
  content: string;
  pruned: boolean;
  layersApplied: Set<CompactionLayer>;
}

interface ScoreEntry {
  index: number;
  score: number;
}

const DEFAULT_LEVEL: CompressionLevel = 'standard';
const DEFAULT_MAX_PROCESSING_MS = 200;
const DEFAULT_PROTECTED_FILES = ['SOUL.md', 'PRINCIPLES.md', '*.key'];
const DEFAULT_COST_PER_1K_TOKENS_USD = 0.003;
const COMPACTION_LAYERS: CompactionLayer[] = [
  'whitespace-normalization',
  'comment-stripping',
  'deduplication',
  'abbreviation',
  'priority-pruning',
];

const TARGET_REDUCTION_BY_LEVEL: Record<CompressionLevel, number> = {
  conservative: 0.5,
  standard: 0.7,
  aggressive: 0.9,
};

const MIN_RETAINED_NON_PROTECTED_BY_LEVEL: Record<CompressionLevel, number> = {
  conservative: 2,
  standard: 1,
  aggressive: 1,
};

const NON_TEXT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.tgz', '.mov', '.mp4', '.wav', '.mp3',
  '.wasm', '.node', '.sqlite', '.db',
]);

const COMMENT_STRIP_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.go', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.kt', '.swift',
  '.py', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.rb',
]);

function nowMs(now: () => Date): number {
  return now().getTime();
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.split('?').map(escapeRegex).join('.'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function isProtectedFile(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized);
  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const rx = wildcardToRegex(normalizedPattern);
    if (rx.test(normalized) || rx.test(base)) return true;
  }
  return false;
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true;
  return !NON_TEXT_EXTENSIONS.has(ext);
}

function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripComments(content: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (!COMMENT_STRIP_EXTENSIONS.has(ext) || ext === '.md') return content;

  let out = content;

  if ([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.java', '.go', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp', '.kt', '.swift',
  ].includes(ext)) {
    out = out.replace(/\/\*[\s\S]*?\*\//g, '');
    out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  if (['.py', '.sh', '.bash', '.zsh', '.yml', '.yaml', '.rb'].includes(ext)) {
    out = out
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#!')) return true; // keep shebangs
        return !trimmed.startsWith('#');
      })
      .join('\n');
  }

  return out;
}

function normalizeBlockForDedup(block: string): string {
  return normalizeWhitespace(block).toLowerCase();
}

function splitIntoDedupBlocks(content: string): string[] {
  if (!content.trim()) return [];
  return content.split(/\n\s*\n/g);
}

function createWorkingFiles(
  files: CompactorFileInput[],
  protectedPatterns: string[],
): WorkingFile[] {
  return files
    .map((input, index): WorkingFile => {
      const filePath = input.path.trim();
      const content = typeof input.content === 'string' ? input.content : String(input.content ?? '');
      const priority = Number.isFinite(input.priority) ? Number(input.priority) : 0;
      const updatedAtMs = Number.isFinite(input.updatedAtMs) ? Number(input.updatedAtMs) : undefined;
      return {
        index,
        path: filePath,
        originalContent: content,
        priority,
        updatedAtMs,
        originalChars: content.length,
        originalTokens: estimateTokens(content),
        protectedByPattern: isProtectedFile(filePath, protectedPatterns),
        textFile: isTextFile(filePath),
        content,
        pruned: false,
        layersApplied: new Set<CompactionLayer>(),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function applyLayerContribution(
  metrics: LayerContribution[],
  layer: CompactionLayer,
  preTokens: number,
  postTokens: number,
): void {
  const saved = Math.max(0, preTokens - postTokens);
  const savedPct = preTokens > 0 ? (saved / preTokens) * 100 : 0;
  metrics.push({
    layer,
    preTokens,
    postTokens,
    savedTokens: saved,
    savedPct: Number(savedPct.toFixed(2)),
  });
}

function toHeader(file: WorkingFile, abbreviated: boolean): string {
  const updated = file.updatedAtMs ? new Date(file.updatedAtMs).toISOString() : 'n/a';
  if (abbreviated) return `F:${file.path} (p=${file.priority},u=${updated})`;
  return `FILE:${file.path} (priority=${file.priority}, updatedAt=${updated})`;
}

function buildBundle(files: WorkingFile[], opts: { abbreviatedHeaders: boolean; includePruned: boolean }): string {
  const lines: string[] = [];
  for (const file of files) {
    if (!opts.includePruned && file.pruned) continue;
    if (!file.content) continue;
    lines.push(`${toHeader(file, opts.abbreviatedHeaders)}\n${file.content}`);
  }
  return lines.join('\n\n');
}

function applyCrossFileDedup(files: WorkingFile[], deadlineMs: number, now: () => Date): boolean {
  const seenBlocks = new Set<string>();
  for (const file of files) {
    if (file.protectedByPattern || !file.textFile) continue;
    if (nowMs(now) > deadlineMs) return false;

    const blocks = splitIntoDedupBlocks(file.content);
    if (blocks.length === 0) continue;
    const kept: string[] = [];

    for (const block of blocks) {
      const normalized = normalizeBlockForDedup(block);
      if (!normalized) continue;
      if (nowMs(now) > deadlineMs) return false;
      if (normalized.length < 80) {
        kept.push(block);
        continue;
      }
      const digest = crypto.createHash('sha1').update(normalized).digest('hex');
      if (seenBlocks.has(digest)) continue;
      seenBlocks.add(digest);
      kept.push(block);
    }

    file.content = kept.join('\n\n');
    file.layersApplied.add('deduplication');
  }
  return true;
}

function scoreForPruning(file: WorkingFile, nowMsValue: number): number {
  const priorityScore = Math.max(-10, Math.min(10, file.priority)) * 3;
  const ageDays = file.updatedAtMs
    ? Math.max(0, (nowMsValue - file.updatedAtMs) / (24 * 60 * 60 * 1000))
    : 10;
  const recencyScore = file.updatedAtMs ? Math.max(0, 4 - ageDays / 3) : 0.5;
  const tokenWeight = Math.max(0, 2 - file.originalTokens / 1500);
  return priorityScore + recencyScore + tokenWeight;
}

function applyPriorityPruning(files: WorkingFile[], level: CompressionLevel, preTokens: number, nowValue: number): void {
  const targetReduction = TARGET_REDUCTION_BY_LEVEL[level];
  const targetPostTokens = Math.floor(preTokens * (1 - targetReduction));
  const protectedTokens = files
    .filter((file) => file.protectedByPattern || !file.textFile)
    .reduce((sum, file) => sum + estimateTokens(file.content), 0);

  const candidates = files.filter((file) => !file.protectedByPattern && file.textFile && file.content.length > 0);
  if (candidates.length === 0) return;

  const totalCurrentTokens = files.reduce((sum, file) => sum + estimateTokens(file.content), 0);
  const effectiveTarget = Math.max(protectedTokens, targetPostTokens);
  if (totalCurrentTokens <= effectiveTarget) {
    for (const file of candidates) file.layersApplied.add('priority-pruning');
    return;
  }

  const minRetained = Math.min(
    candidates.length,
    Math.max(1, MIN_RETAINED_NON_PROTECTED_BY_LEVEL[level]),
  );

  const sortedByPrunePriority: ScoreEntry[] = candidates
    .map((file) => ({ index: file.index, score: scoreForPruning(file, nowValue) }))
    .sort((a, b) => {
      if (a.score === b.score) return a.index - b.index;
      return a.score - b.score;
    });

  const byIndex = new Map(files.map((file) => [file.index, file]));
  let currentTokens = totalCurrentTokens;
  let retainedCandidates = candidates.length;

  for (const candidate of sortedByPrunePriority) {
    if (currentTokens <= effectiveTarget) break;
    if (retainedCandidates <= minRetained) break;
    const file = byIndex.get(candidate.index);
    if (!file || file.pruned || !file.content) continue;
    file.pruned = true;
    currentTokens -= estimateTokens(file.content);
    retainedCandidates -= 1;
  }

  for (const file of candidates) {
    file.layersApplied.add('priority-pruning');
  }
}

function createDefaultSessionId(files: WorkingFile[], now: () => Date): string {
  const digestSeed = files
    .map((f) => `${f.path}:${f.originalChars}:${f.priority}:${f.updatedAtMs ?? 'na'}`)
    .join('|');
  const digest = crypto.createHash('sha1').update(digestSeed).digest('hex').slice(0, 10);
  const stamp = now().toISOString().replace(/[-:.TZ]/g, '');
  return `cmp-${stamp}-${digest}`;
}

export function runTokenCompaction(
  inputFiles: CompactorFileInput[],
  config: CompactorConfig = {},
): CompactionResult {
  const now = config.now ?? (() => new Date());
  const startedAtIso = now().toISOString();
  const startedMs = nowMs(now);
  const maxProcessingMs = Math.max(25, config.maxProcessingMs ?? DEFAULT_MAX_PROCESSING_MS);
  const deadlineMs = startedMs + maxProcessingMs;
  const level = config.level ?? DEFAULT_LEVEL;
  const protectedPatterns = config.protectedFiles ?? DEFAULT_PROTECTED_FILES;
  const costPer1kTokensUsd = config.costPer1kTokensUsd ?? DEFAULT_COST_PER_1K_TOKENS_USD;

  const files = createWorkingFiles(inputFiles, protectedPatterns);
  const sessionId = config.sessionId || createDefaultSessionId(files, now);

  const layerContributions: LayerContribution[] = [];
  const layersApplied = new Set<CompactionLayer>();
  let timedOut = false;

  const preBundle = buildBundle(files.map((file) => ({ ...file, content: file.originalContent } as WorkingFile)), {
    abbreviatedHeaders: false,
    includePruned: true,
  });
  const preTokens = estimateTokens(preBundle);
  let lastTokens = preTokens;

  // Layer 1: Whitespace normalization
  for (const file of files) {
    if (file.protectedByPattern || !file.textFile) continue;
    if (nowMs(now) > deadlineMs) {
      timedOut = true;
      break;
    }
    file.content = normalizeWhitespace(file.content);
    file.layersApplied.add('whitespace-normalization');
  }
  const afterWhitespaceTokens = estimateTokens(buildBundle(files, { abbreviatedHeaders: false, includePruned: true }));
  applyLayerContribution(layerContributions, 'whitespace-normalization', lastTokens, afterWhitespaceTokens);
  layersApplied.add('whitespace-normalization');
  lastTokens = afterWhitespaceTokens;

  // Layer 2: Comment stripping
  if (!timedOut) {
    for (const file of files) {
      if (file.protectedByPattern || !file.textFile) continue;
      if (nowMs(now) > deadlineMs) {
        timedOut = true;
        break;
      }
      file.content = stripComments(file.content, file.path);
      file.layersApplied.add('comment-stripping');
    }
  }
  const afterCommentTokens = estimateTokens(buildBundle(files, { abbreviatedHeaders: false, includePruned: true }));
  applyLayerContribution(layerContributions, 'comment-stripping', lastTokens, afterCommentTokens);
  layersApplied.add('comment-stripping');
  lastTokens = afterCommentTokens;

  // Layer 3: Cross-file deduplication
  if (!timedOut) {
    const complete = applyCrossFileDedup(files, deadlineMs, now);
    if (!complete) timedOut = true;
  }
  const afterDedupeTokens = estimateTokens(buildBundle(files, { abbreviatedHeaders: false, includePruned: true }));
  applyLayerContribution(layerContributions, 'deduplication', lastTokens, afterDedupeTokens);
  layersApplied.add('deduplication');
  lastTokens = afterDedupeTokens;

  // Layer 4: Abbreviation (metadata header compaction)
  const afterAbbreviationTokens = estimateTokens(buildBundle(files, { abbreviatedHeaders: true, includePruned: true }));
  applyLayerContribution(layerContributions, 'abbreviation', lastTokens, afterAbbreviationTokens);
  layersApplied.add('abbreviation');
  lastTokens = afterAbbreviationTokens;

  // Layer 5: Priority pruning
  if (!timedOut && nowMs(now) <= deadlineMs) {
    applyPriorityPruning(files, level, preTokens, startedMs);
  } else {
    timedOut = true;
  }
  const postBundle = buildBundle(files, { abbreviatedHeaders: true, includePruned: false });
  const postTokens = estimateTokens(postBundle);
  applyLayerContribution(layerContributions, 'priority-pruning', lastTokens, postTokens);
  layersApplied.add('priority-pruning');

  for (const file of files) {
    if (timedOut && file.layersApplied.size === 0 && !file.protectedByPattern && file.textFile) {
      // Budget exhausted before any transformation reached this file.
      file.content = file.originalContent;
    }
  }

  const completedMs = nowMs(now);
  const durationMs = Math.max(0, completedMs - startedMs);
  const compressionRatio = preTokens > 0 ? postTokens / preTokens : 1;
  const reductionPct = preTokens > 0 ? ((preTokens - postTokens) / preTokens) * 100 : 0;
  const estimatedSavingsUsd = ((preTokens - postTokens) / 1000) * costPer1kTokensUsd;

  const outputs: CompactorFileOutput[] = files.map((file) => {
    const isProtected = file.protectedByPattern;
    const nonText = !file.textFile;
    let skippedReason: CompactorFileOutput['skippedReason'];

    if (isProtected) skippedReason = 'protected-file-pattern';
    else if (nonText) skippedReason = 'non-text-file';
    else if (file.pruned) skippedReason = 'priority-pruned';
    else if (timedOut && file.layersApplied.size === 0) skippedReason = 'max-processing-ms-exceeded';

    return {
      path: file.path,
      protected: isProtected,
      skippedReason,
      layersApplied: COMPACTION_LAYERS.filter((layer) => file.layersApplied.has(layer)),
      originalChars: file.originalChars,
      compressedChars: file.pruned ? 0 : file.content.length,
      content: file.pruned ? '' : file.content,
    };
  });

  return {
    files: outputs,
    bundledContext: postBundle,
    metrics: {
      sessionId,
      agentId: config.agentId,
      level,
      startedAt: startedAtIso,
      completedAt: new Date(completedMs).toISOString(),
      timestamp: new Date(completedMs).toISOString(),
      durationMs,
      preTokens,
      postTokens,
      compressionRatio: Number(compressionRatio.toFixed(4)),
      reductionPct: Number(reductionPct.toFixed(2)),
      targetReductionPct: Number((TARGET_REDUCTION_BY_LEVEL[level] * 100).toFixed(2)),
      layersApplied: COMPACTION_LAYERS.filter((layer) => layersApplied.has(layer)),
      layerContributions,
      estimatedSavingsUsd: Number(Math.max(0, estimatedSavingsUsd).toFixed(6)),
      timedOut,
    },
  };
}

