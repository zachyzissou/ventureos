import fs from 'node:fs/promises';
import path from 'node:path';

import Ajv, { type ErrorObject } from 'ajv';

import {
  EVIDENCE_DAILY_DIR,
  EVIDENCE_INCIDENTS_DIR,
  EVIDENCE_MONTHLY_DIR,
  EVIDENCE_WEEKLY_DIR,
  VENTUREOS_ROOT,
  getDailyEvidencePath,
  getIncidentEvidencePath,
  getMonthlyEvidencePath,
  getWeeklyEvidencePath,
} from './paths';

export enum EvidenceKind {
  KpiSnapshot = 'kpi_snapshot',
  AgentHealth = 'agent_health',
  HandoffLedger = 'handoff_ledger',
  SpendSnapshot = 'spend_snapshot',
  GoNoGo = 'go_no_go',
  DecisionLog = 'decision_log',
  WeeklyRollup = 'weekly_rollup',
  MonthlyRollup = 'monthly_rollup',
  Incident = 'incident',
}

export type EvidenceCadence = 'daily' | 'weekly' | 'monthly';
export type EvidenceStatus = 'pass' | 'fail';
export type EvidenceFormat = 'json' | 'markdown';
export type CheckStatus = 'pass' | 'fail' | 'warn';
export type HandoffComplianceStatus = 'on_time' | 'late' | 'exception';
export type HandoffBreachLevel = 'level_1' | 'level_2' | 'level_3';

export interface EvidenceFreshnessPolicy {
  dailyHours: number;
  weeklyDays: number;
  monthlyDays: number;
}

export interface EvidenceRetentionPolicy {
  dailyDays: number;
  weeklyDays: number;
  monthlyDays: number;
  evidenceReportDays: number;
  readinessReportDays: number;
}

export interface KpiRecord {
  kpi_id: string;
  period_start: string;
  period_end: string;
  value: number;
  target?: number;
  owner?: string;
  source_refs?: string[];
  entered_at?: string;
  approved_at?: string;
}

export interface KpiSnapshot {
  date: string;
  captured_at: string;
  source?: Record<string, unknown>;
  departments: Record<string, KpiRecord[]>;
  rollup?: Record<string, unknown>;
}

export interface AgentHealthRecord {
  agent_id: string;
  status: string;
  session_count?: number;
  aborted_count?: number;
  success_rate?: number;
  last_updated_at?: string | null;
  last_label?: string;
  notes?: string;
}

export interface AgentHealthReport {
  date: string;
  captured_at: string;
  source?: Record<string, unknown>;
  summary: Record<string, unknown>;
  agents: AgentHealthRecord[];
  incidents?: Array<Record<string, unknown>>;
}

export interface HandoffRecord {
  handoff_id: string;
  producer: string;
  consumer: string;
  artifact: string;
  sent_at: string;
  accepted_at?: string;
  producer_ts?: string;
  consumer_ts?: string;
  producer_binding_id?: string;
  consumer_binding_id?: string;
  producer_capability_id?: string;
  consumer_capability_id?: string;
  producer_specialist_id?: string;
  consumer_specialist_id?: string;
  sla_target_minutes?: number;
  latency_minutes?: number;
  sla_status?: string;
  compliance_status?: HandoffComplianceStatus;
  breach_level?: HandoffBreachLevel;
  breach_owner?: string;
  breach_action?: string;
  exception_approved_by?: string;
  exception_expires_at?: string;
  exceptions?: string;
}

export interface HandoffSummary {
  total_handoffs?: number;
  on_time_handoffs?: number;
  late_handoffs?: number;
  exception_handoffs?: number;
  on_time_rate?: number;
  level_1_breaches?: number;
  level_2_breaches?: number;
  level_3_breaches?: number;
  [key: string]: unknown;
}

export interface HandoffLedger {
  date: string;
  captured_at: string;
  handoffs: HandoffRecord[];
  summary: HandoffSummary;
}

export interface SpendSnapshot {
  date: string;
  captured_at: string;
  source?: Record<string, unknown>;
  totals: Record<string, unknown>;
  categories: Array<Record<string, unknown>>;
  per_model?: Array<Record<string, unknown>>;
  variance?: Record<string, unknown>;
  notes?: string[];
}

export interface EvidenceArtifactCheck {
  kind: EvidenceKind;
  cadence: EvidenceCadence;
  path: string;
  exists: boolean;
  valid: boolean;
  format: EvidenceFormat;
  aliasPath?: string;
  aliasUpdated?: boolean;
  timestamp?: string;
  ageHours?: number;
  stale?: boolean;
  details?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface EvidenceValidationResult {
  status: EvidenceStatus;
  cadence: EvidenceCadence;
  target: string;
  generatedAtUtc: string;
  freshnessPolicy: EvidenceFreshnessPolicy;
  artifacts: EvidenceArtifactCheck[];
  failures: string[];
  warnings: string[];
  reportJson?: string;
  reportMarkdown?: string;
}

export interface ReadinessCheck {
  id: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadinessGateResult {
  status: EvidenceStatus;
  generatedAtUtc: string;
  checks: ReadinessCheck[];
  failingGates: string[];
  staleArtifacts: string[];
  recommendedRemediations: string[];
  artifacts: Record<string, string>;
  reportJson?: string;
  reportMarkdown?: string;
}

export interface EvidenceInventoryTargetSummary {
  target: string;
  artifactCount: number;
  requiredCount: number;
  complete: boolean;
  artifacts: string[];
}

export interface EvidenceInventorySection {
  dir: string;
  totalTargets: number;
  completeTargets: number;
  incompleteTargets: number;
  latestTarget?: string;
  currentTarget?: string;
  currentTargetComplete?: boolean;
  targets: EvidenceInventoryTargetSummary[];
}

export interface EvidenceInventoryResult {
  generatedAtUtc: string;
  daily: EvidenceInventorySection;
  weekly: EvidenceInventorySection;
  monthly: EvidenceInventorySection;
  incidents: {
    dir: string;
    totalIncidents: number;
    incidentIds: string[];
  };
  reportJson?: string;
  reportMarkdown?: string;
}

export interface EvidenceRetentionEntry {
  bucket: string;
  path: string;
  ageDays: number;
  thresholdDays: number;
  deleted: boolean;
}

export interface EvidenceRetentionResult {
  generatedAtUtc: string;
  apply: boolean;
  policy: EvidenceRetentionPolicy;
  candidates: EvidenceRetentionEntry[];
  pruned: EvidenceRetentionEntry[];
  reportJson?: string;
  reportMarkdown?: string;
}

interface DailyArtifactDefinition {
  kind: EvidenceKind;
  basename: string;
  aliasName: string;
  format: EvidenceFormat;
  schemaFile?: string;
  requiredHeadings?: string[];
}

interface CadenceValidationOptions {
  cadence: EvidenceCadence;
  target?: string;
  dailyDir?: string;
  weeklyDir?: string;
  monthlyDir?: string;
  reportDir?: string;
  writeReport?: boolean;
  materializeAliases?: boolean;
  now?: Date;
  freshnessPolicy?: Partial<EvidenceFreshnessPolicy>;
}

interface DailyGenerationOptions {
  date?: string;
  dailyDir?: string;
  materializeAliases?: boolean;
}

interface WeeklyGenerationOptions {
  isoWeek?: string;
  dailyDir?: string;
  weeklyDir?: string;
}

interface MonthlyGenerationOptions {
  month?: string;
  dailyDir?: string;
  monthlyDir?: string;
}

interface Phase0ReadinessOptions {
  reportDir?: string;
  now?: Date;
  dailyTarget?: string;
  weeklyTarget?: string;
  localIntegrationMode?: boolean;
  hookMode?: boolean;
  localChecklistPath?: string;
  architectureDocPath?: string;
  localReadyStatusJson?: string;
  postMergeCadenceJson?: string;
  hookLogDir?: string;
}

interface EvidenceInventoryOptions {
  now?: Date;
  reportDir?: string;
  dailyDir?: string;
  weeklyDir?: string;
  monthlyDir?: string;
  incidentsDir?: string;
}

interface EvidenceRetentionOptions {
  now?: Date;
  apply?: boolean;
  reportDir?: string;
  readinessReportDir?: string;
  dailyDir?: string;
  weeklyDir?: string;
  monthlyDir?: string;
  policy?: Partial<EvidenceRetentionPolicy>;
}

interface DiscoveredDailyArtifact {
  date: string;
  path: string;
}

interface HandoffValidationOutcome {
  details: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

const DEFAULT_FRESHNESS_POLICY: EvidenceFreshnessPolicy = {
  dailyHours: 36,
  weeklyDays: 8,
  monthlyDays: 35,
};

const DEFAULT_RETENTION_POLICY: EvidenceRetentionPolicy = {
  dailyDays: 45,
  weeklyDays: 180,
  monthlyDays: 540,
  evidenceReportDays: 45,
  readinessReportDays: 45,
};

const DAILY_ARTIFACTS: DailyArtifactDefinition[] = [
  {
    kind: EvidenceKind.AgentHealth,
    basename: 'agent-health.json',
    aliasName: 'agent-health.json',
    format: 'json',
    schemaFile: 'agent-health.schema.json',
  },
  {
    kind: EvidenceKind.SpendSnapshot,
    basename: 'spend.json',
    aliasName: 'spend.json',
    format: 'json',
    schemaFile: 'spend.schema.json',
  },
  {
    kind: EvidenceKind.KpiSnapshot,
    basename: 'kpi-snapshot.json',
    aliasName: 'kpi-snapshot.json',
    format: 'json',
    schemaFile: 'kpi-snapshot.schema.json',
  },
  {
    kind: EvidenceKind.HandoffLedger,
    basename: 'handoff-ledger.json',
    aliasName: 'handoff-ledger.json',
    format: 'json',
    schemaFile: 'handoff-ledger.schema.json',
  },
  {
    kind: EvidenceKind.DecisionLog,
    basename: 'decision-log.md',
    aliasName: 'decision-log.md',
    format: 'markdown',
    requiredHeadings: ['## Status', '## Decisions', '## Evidence Links'],
  },
  {
    kind: EvidenceKind.GoNoGo,
    basename: 'go-no-go.md',
    aliasName: 'day1-go-no-go.md',
    format: 'markdown',
    requiredHeadings: ['## Verdict'],
  },
];

const WEEKLY_ARTIFACTS = [
  'kpi-rollup.json',
  'ops-review.md',
  'risk-register.md',
] as const;

const MONTHLY_ARTIFACTS = [
  'forecast.md',
  'spend-rollup.json',
  'readiness-summary.md',
] as const;

const WEEKLY_MARKDOWN_HEADINGS: Record<string, string[]> = {
  'ops-review.md': ['## Coverage', '## Highlights', '## Actions'],
  'risk-register.md': ['## Open Risks', '## Mitigations'],
};

const MONTHLY_MARKDOWN_HEADINGS: Record<string, string[]> = {
  'forecast.md': ['## Monthly Snapshot', '## Forecast Inputs'],
  'readiness-summary.md': ['## Readiness Status', '## Follow-Up Actions'],
};

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaCache = new Map<string, object>();
const CANONICAL_BINDING_PATTERN = /^[a-z][a-z0-9_]*:(director|operator|auditor)$/;
const CANONICAL_CAPABILITY_PATTERN = /^(venture_[a-z0-9_]+|human_arbiter)$/;
const CANONICAL_SPECIALIST_PATTERN = /^game_[a-z0-9_]+$/;
const HANDOFF_SUMMARY_KEYS = [
  'total_handoffs',
  'on_time_handoffs',
  'late_handoffs',
  'exception_handoffs',
  'on_time_rate',
  'level_1_breaches',
  'level_2_breaches',
  'level_3_breaches',
] as const;

export function resolveFreshnessPolicy(
  override: Partial<EvidenceFreshnessPolicy> = {},
): EvidenceFreshnessPolicy {
  return {
    dailyHours: override.dailyHours ?? DEFAULT_FRESHNESS_POLICY.dailyHours,
    weeklyDays: override.weeklyDays ?? DEFAULT_FRESHNESS_POLICY.weeklyDays,
    monthlyDays: override.monthlyDays ?? DEFAULT_FRESHNESS_POLICY.monthlyDays,
  };
}

export function resolveRetentionPolicy(
  override: Partial<EvidenceRetentionPolicy> = {},
): EvidenceRetentionPolicy {
  return {
    dailyDays: override.dailyDays ?? DEFAULT_RETENTION_POLICY.dailyDays,
    weeklyDays: override.weeklyDays ?? DEFAULT_RETENTION_POLICY.weeklyDays,
    monthlyDays: override.monthlyDays ?? DEFAULT_RETENTION_POLICY.monthlyDays,
    evidenceReportDays: override.evidenceReportDays ?? DEFAULT_RETENTION_POLICY.evidenceReportDays,
    readinessReportDays: override.readinessReportDays ?? DEFAULT_RETENTION_POLICY.readinessReportDays,
  };
}

export function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonth(date = new Date()): string {
  return formatLocalDate(date).slice(0, 7);
}

export function formatIsoWeek(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function ensureEvidenceDirectories(dirs?: {
  dailyDir?: string;
  weeklyDir?: string;
  monthlyDir?: string;
  incidentsDir?: string;
}): Promise<void> {
  await Promise.all([
    fs.mkdir(dirs?.dailyDir ?? EVIDENCE_DAILY_DIR, { recursive: true }),
    fs.mkdir(dirs?.weeklyDir ?? EVIDENCE_WEEKLY_DIR, { recursive: true }),
    fs.mkdir(dirs?.monthlyDir ?? EVIDENCE_MONTHLY_DIR, { recursive: true }),
    fs.mkdir(dirs?.incidentsDir ?? EVIDENCE_INCIDENTS_DIR, { recursive: true }),
  ]);
}

export async function loadSchema(schemaFile: string): Promise<object> {
  const cached = schemaCache.get(schemaFile);
  if (cached) {
    return cached;
  }
  const schemaPath = path.join(VENTUREOS_ROOT, 'schemas', 'evidence', schemaFile);
  const raw = await fs.readFile(schemaPath, 'utf-8');
  const parsed = JSON.parse(raw) as object;
  schemaCache.set(schemaFile, parsed);
  return parsed;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toUtcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function relFromRepo(absPath: string): string {
  return path.relative(VENTUREOS_ROOT, absPath) || absPath;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(targetPath: string): Promise<T> {
  return JSON.parse(await fs.readFile(targetPath, 'utf-8')) as T;
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHandoffComplianceStatus(value: unknown): value is HandoffComplianceStatus {
  return value === 'on_time' || value === 'late' || value === 'exception';
}

function isHandoffBreachLevel(value: unknown): value is HandoffBreachLevel {
  return value === 'level_1' || value === 'level_2' || value === 'level_3';
}

function isCanonicalRoleReference(value: string): boolean {
  return CANONICAL_BINDING_PATTERN.test(value)
    || CANONICAL_CAPABILITY_PATTERN.test(value)
    || CANONICAL_SPECIALIST_PATTERN.test(value);
}

function isCurrentTargetDate(targetDate: string, now: Date): boolean {
  return targetDate === formatLocalDate(now);
}

async function fileTimestamp(targetPath: string): Promise<Date> {
  const stat = await fs.stat(targetPath);
  return stat.mtime;
}

function getAgeHours(reference: Date, now: Date): number {
  return Number(((now.getTime() - reference.getTime()) / 3_600_000).toFixed(2));
}

function getLatencyMinutes(start: Date, end: Date): number {
  return Number(((end.getTime() - start.getTime()) / 60_000).toFixed(2));
}

function getMaxAgeHours(cadence: EvidenceCadence, freshnessPolicy: EvidenceFreshnessPolicy): number {
  if (cadence === 'daily') {
    return freshnessPolicy.dailyHours;
  }
  if (cadence === 'weekly') {
    return freshnessPolicy.weeklyDays * 24;
  }
  return freshnessPolicy.monthlyDays * 24;
}

async function discoverDailyArtifacts(
  basename: string,
  dailyDir: string,
): Promise<DiscoveredDailyArtifact[]> {
  const entries = await fs.readdir(dailyDir, { withFileTypes: true }).catch(() => []);
  const pattern = new RegExp(
    `^(\\d{4}-\\d{2}-\\d{2})(?:-[A-Za-z0-9._-]+)?-${escapeRegex(basename)}$`,
  );
  const discovered: DiscoveredDailyArtifact[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(pattern);
    if (!match) {
      continue;
    }
    discovered.push({
      date: match[1],
      path: path.join(dailyDir, entry.name),
    });
  }
  discovered.sort((left, right) => left.path.localeCompare(right.path));
  return discovered;
}

async function resolveDailyArtifactForDate(
  date: string,
  definition: DailyArtifactDefinition,
  dailyDir: string,
): Promise<string | null> {
  const exactPath = path.join(dailyDir, `${date}-${definition.basename}`);
  if (await pathExists(exactPath)) {
    return exactPath;
  }
  const discovered = await discoverDailyArtifacts(definition.basename, dailyDir);
  const matches = discovered.filter((artifact) => artifact.date === date);
  if (!matches.length) {
    return null;
  }
  matches.sort((left, right) => right.path.localeCompare(left.path));
  return matches[0].path;
}

async function resolveLatestDailyDate(dailyDir: string): Promise<string | null> {
  const dates = new Set<string>();
  for (const definition of DAILY_ARTIFACTS) {
    const discovered = await discoverDailyArtifacts(definition.basename, dailyDir);
    for (const artifact of discovered) {
      dates.add(artifact.date);
    }
  }
  const ordered = Array.from(dates).sort();
  return ordered.length ? ordered[ordered.length - 1] : null;
}

async function resolveLatestPeriodicTarget(
  dir: string,
  basenames: readonly string[],
): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const targets = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    for (const basename of basenames) {
      if (!entry.name.endsWith(`-${basename}`)) {
        continue;
      }
      targets.add(entry.name.slice(0, -(`-${basename}`.length)));
    }
  }
  const ordered = Array.from(targets).sort();
  return ordered.length ? ordered[ordered.length - 1] : null;
}

function isoWeekDateBounds(isoWeek: string): { start: Date; end: Date } {
  const match = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid ISO week: ${isoWeek}`);
  }
  const year = Number(match[1]);
  const week = Number(match[2]);
  const simple = new Date(Date.UTC(year, 0, 4 + (week - 1) * 7));
  const dayOfWeek = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

function dateInIsoWeek(dateText: string, isoWeek: string): boolean {
  const target = new Date(`${dateText}T00:00:00Z`);
  const bounds = isoWeekDateBounds(isoWeek);
  return target >= bounds.start && target <= bounds.end;
}

function dateInMonth(dateText: string, month: string): boolean {
  return dateText.startsWith(`${month}-`);
}

function parseDailyFilenameDate(entryName: string): Date | null {
  const match = entryName.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (!match) {
    return null;
  }
  return parseTimestamp(`${match[1]}T00:00:00Z`);
}

function parseMonthlyIdentifierDate(month: string): Date | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));
}

function getAgeDays(reference: Date, now: Date): number {
  return Number(((now.getTime() - reference.getTime()) / 86_400_000).toFixed(2));
}

function collectMarkdownErrors(
  contents: string,
  requiredHeadings: string[],
  requireEvidenceHeading = true,
): string[] {
  const errors: string[] = [];
  for (const heading of requiredHeadings) {
    if (!contents.includes(heading)) {
      errors.push(`Missing required heading: ${heading}`);
    }
  }
  if (requireEvidenceHeading && !contents.includes('## Evidence')) {
    const hasEvidenceHeading = /^## .*Evidence.*$/m.test(contents);
    if (!hasEvidenceHeading) {
      errors.push('Missing evidence section heading');
    }
  }
  return errors;
}

function validateHandoffLedger(
  payload: Record<string, unknown>,
  targetDate: string,
  now: Date,
): HandoffValidationOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];
  const strictCurrentDateValidation = isCurrentTargetDate(targetDate, now);
  const ledgerReferenceTime = strictCurrentDateValidation
    ? now
    : (parseTimestamp(payload.captured_at) ?? now);
  const handoffs = Array.isArray(payload.handoffs) ? payload.handoffs : [];
  const summary = isRecord(payload.summary) ? payload.summary : {};

  if (!Array.isArray(payload.handoffs)) {
    errors.push('handoffs must be an array');
  }
  if (!isRecord(payload.summary)) {
    errors.push('summary must be an object');
  }

  let onTimeHandoffs = 0;
  let lateHandoffs = 0;
  let exceptionHandoffs = 0;
  let level1Breaches = 0;
  let level2Breaches = 0;
  let level3Breaches = 0;
  let lateMissingBreachOwnerCount = 0;
  let lateMissingBreachActionCount = 0;
  let invalidComplianceCount = 0;
  let level3WithoutApprovalCount = 0;

  for (const entry of handoffs) {
    if (!isRecord(entry)) {
      errors.push('handoff record must be an object');
      continue;
    }

    const handoff = entry as unknown as HandoffRecord;
    const label = `handoff ${handoff.handoff_id ?? '<missing-id>'}`;
    const producerTs = parseTimestamp(handoff.producer_ts);
    const consumerTs = parseTimestamp(handoff.consumer_ts);
    const sentAt = parseTimestamp(handoff.sent_at);
    const acceptedAt = parseTimestamp(handoff.accepted_at);
    const explicitLatencyMinutes = parseFiniteNumber(handoff.latency_minutes);
    const slaTargetMinutes = parseFiniteNumber(handoff.sla_target_minutes);
    const recordedComplianceRaw = handoff.compliance_status ?? handoff.sla_status;
    const recordedCompliance = isHandoffComplianceStatus(recordedComplianceRaw)
      ? recordedComplianceRaw
      : null;
    const recordedBreachLevel = handoff.breach_level && isHandoffBreachLevel(handoff.breach_level)
      ? handoff.breach_level
      : null;
    const exceptionApprovalExpiry = parseTimestamp(handoff.exception_expires_at);
    const hasApprovalActor = typeof handoff.exception_approved_by === 'string' && handoff.exception_approved_by.length > 0;
    const exceptionApprovalActive = Boolean(
      hasApprovalActor
      && exceptionApprovalExpiry
      && exceptionApprovalExpiry.getTime() > ledgerReferenceTime.getTime(),
    );
    const severityText = typeof handoff.exceptions === 'string' ? handoff.exceptions : '';
    const explicitP0 = /\bP0\b/i.test(severityText);

    if (strictCurrentDateValidation) {
      if (!handoff.producer_binding_id) {
        errors.push(`${label} is missing producer_binding_id`);
      }
      if (!handoff.consumer_binding_id) {
        errors.push(`${label} is missing consumer_binding_id`);
      }
      if (typeof handoff.compliance_status !== 'string' || !handoff.compliance_status.trim()) {
        errors.push(`${label} is missing canonical compliance_status`);
      }
      if (!producerTs) {
        errors.push(`${label} is missing producer_ts`);
      }
      if (!consumerTs) {
        errors.push(`${label} is missing consumer_ts`);
      }
      if (slaTargetMinutes === null) {
        errors.push(`${label} is missing sla_target_minutes`);
      }
    }

    for (const [field, value] of [
      ['producer_binding_id', handoff.producer_binding_id],
      ['consumer_binding_id', handoff.consumer_binding_id],
    ] as const) {
      if (value && !CANONICAL_BINDING_PATTERN.test(value)) {
        errors.push(`${label} has invalid ${field}: ${value}`);
      }
    }
    for (const [field, value] of [
      ['producer_capability_id', handoff.producer_capability_id],
      ['consumer_capability_id', handoff.consumer_capability_id],
    ] as const) {
      if (value && !CANONICAL_CAPABILITY_PATTERN.test(value)) {
        errors.push(`${label} has invalid ${field}: ${value}`);
      }
    }
    for (const [field, value] of [
      ['producer_specialist_id', handoff.producer_specialist_id],
      ['consumer_specialist_id', handoff.consumer_specialist_id],
    ] as const) {
      if (value && !CANONICAL_SPECIALIST_PATTERN.test(value)) {
        errors.push(`${label} has invalid ${field}: ${value}`);
      }
    }

    if (recordedComplianceRaw !== undefined && recordedComplianceRaw !== null && !recordedCompliance) {
      errors.push(`${label} has invalid compliance status: ${String(recordedComplianceRaw)}`);
    }
    if (handoff.breach_level !== undefined && handoff.breach_level !== null && !recordedBreachLevel) {
      errors.push(`${label} has invalid breach_level: ${String(handoff.breach_level)}`);
    }
    if (hasApprovalActor && !isCanonicalRoleReference(handoff.exception_approved_by as string)) {
      errors.push(`${label} has non-canonical exception_approved_by: ${handoff.exception_approved_by}`);
    }
    if (handoff.exception_approved_by && !handoff.exception_expires_at) {
      errors.push(`${label} has exception_approved_by without exception_expires_at`);
    }
    if (handoff.exception_expires_at && !exceptionApprovalExpiry) {
      errors.push(`${label} has invalid exception_expires_at`);
    }
    if (
      handoff.exception_expires_at
      && exceptionApprovalExpiry
      && exceptionApprovalExpiry.getTime() <= ledgerReferenceTime.getTime()
    ) {
      errors.push(`${label} has expired exception approval`);
    }

    let timingStart = producerTs;
    let timingEnd = consumerTs;
    if (!timingStart || !timingEnd) {
      timingStart = sentAt;
      timingEnd = acceptedAt;
    }

    let derivedLatencyMinutes: number | null = null;
    if (timingStart && timingEnd) {
      if (timingEnd.getTime() < timingStart.getTime()) {
        errors.push(`${label} has impossible timestamp ordering`);
      } else {
        derivedLatencyMinutes = getLatencyMinutes(timingStart, timingEnd);
        if (derivedLatencyMinutes < 0) {
          errors.push(`${label} has negative latency`);
        }
      }
    } else if (strictCurrentDateValidation) {
      errors.push(`${label} is missing timestamp pair required to derive latency`);
    } else if (!recordedCompliance) {
      warnings.push(`${label} is missing a complete timestamp pair; using compatibility mode.`);
    }

    if (explicitLatencyMinutes !== null && derivedLatencyMinutes !== null && Math.abs(explicitLatencyMinutes - derivedLatencyMinutes) > 0.01) {
      errors.push(`${label} latency_minutes does not match derived latency`);
    }

    let derivedCompliance: HandoffComplianceStatus | null = null;
    if (exceptionApprovalActive) {
      derivedCompliance = 'exception';
    } else if (derivedLatencyMinutes !== null && slaTargetMinutes !== null) {
      derivedCompliance = derivedLatencyMinutes > slaTargetMinutes ? 'late' : 'on_time';
    } else if (!strictCurrentDateValidation && recordedCompliance) {
      derivedCompliance = recordedCompliance;
    } else {
      errors.push(`${label} lacks enough SLA instrumentation to derive compliance`);
      invalidComplianceCount += 1;
    }

    if (derivedCompliance && recordedCompliance && derivedCompliance !== recordedCompliance) {
      errors.push(`${label} compliance_status does not match derived compliance (${derivedCompliance})`);
      invalidComplianceCount += 1;
    }
    if (recordedCompliance === 'exception' && !exceptionApprovalActive) {
      errors.push(`${label} claims exception status without active approval evidence`);
      invalidComplianceCount += 1;
    }

    const effectiveCompliance = derivedCompliance ?? recordedCompliance;
    if (!effectiveCompliance) {
      continue;
    }

    if (effectiveCompliance === 'on_time') {
      onTimeHandoffs += 1;
    }
    const effectiveBreachLevel = recordedBreachLevel ?? (
      effectiveCompliance === 'late'
        ? (explicitP0 ? 'level_3' : 'level_1')
        : null
    );
    if (effectiveBreachLevel === 'level_1') {
      level1Breaches += 1;
    }
    if (effectiveBreachLevel === 'level_2') {
      level2Breaches += 1;
    }
    if (effectiveBreachLevel === 'level_3') {
      level3Breaches += 1;
      if (!exceptionApprovalActive) {
        level3WithoutApprovalCount += 1;
        warnings.push(`${label} is a level_3 breach without active exception approval evidence.`);
      }
    }

    if (effectiveCompliance === 'late') {
      lateHandoffs += 1;
      if (!handoff.breach_owner) {
        errors.push(`${label} is late but missing breach_owner`);
        lateMissingBreachOwnerCount += 1;
      } else if (!isCanonicalRoleReference(handoff.breach_owner)) {
        errors.push(`${label} has non-canonical breach_owner: ${handoff.breach_owner}`);
      }
      if (!handoff.breach_action) {
        errors.push(`${label} is late but missing breach_action`);
        lateMissingBreachActionCount += 1;
      }

      const ownerLabel = handoff.breach_owner ?? 'unassigned';
      warnings.push(`${label} is late and routed to ${ownerLabel}.`);
    }
    if (effectiveCompliance === 'exception') {
      exceptionHandoffs += 1;
    }
  }

  const totalHandoffs = handoffs.length;
  const onTimeRate = totalHandoffs ? Number((onTimeHandoffs / totalHandoffs).toFixed(4)) : 0;
  const expectedSummary: Record<(typeof HANDOFF_SUMMARY_KEYS)[number], number> = {
    total_handoffs: totalHandoffs,
    on_time_handoffs: onTimeHandoffs,
    late_handoffs: lateHandoffs,
    exception_handoffs: exceptionHandoffs,
    on_time_rate: onTimeRate,
    level_1_breaches: level1Breaches,
    level_2_breaches: level2Breaches,
    level_3_breaches: level3Breaches,
  };

  for (const key of HANDOFF_SUMMARY_KEYS) {
    const hasKey = Object.prototype.hasOwnProperty.call(summary, key);
    if (strictCurrentDateValidation && !hasKey) {
      errors.push(`summary is missing ${key}`);
      continue;
    }
    if (!hasKey) {
      continue;
    }
    const actual = parseFiniteNumber(summary[key]);
    if (actual === null) {
      errors.push(`summary.${key} must be a finite number`);
      continue;
    }
    const expected = expectedSummary[key];
    const tolerance = key === 'on_time_rate' ? 0.0001 : 0;
    if (Math.abs(actual - expected) > tolerance) {
      errors.push(`summary.${key} (${actual}) does not match derived value (${expected})`);
    }
  }

  const details: Record<string, unknown> = {
    strictCurrentDateValidation,
    totalHandoffs,
    onTimeHandoffs,
    lateHandoffs,
    exceptionHandoffs,
    onTimeRate,
    level1Breaches,
    level2Breaches,
    level3Breaches,
    lateMissingBreachOwnerCount,
    lateMissingBreachActionCount,
    invalidComplianceCount,
    level3WithoutApprovalCount,
  };

  return {
    details,
    errors,
    warnings,
  };
}

function ajvErrorMessage(error: ErrorObject): string {
  const instancePath = error.instancePath || '/';
  return `${instancePath} ${error.message ?? error.keyword}`.trim();
}

async function validateDailyArtifact(
  definition: DailyArtifactDefinition,
  targetDate: string,
  dailyDir: string,
  now: Date,
  freshnessPolicy: EvidenceFreshnessPolicy,
  materializeAliases: boolean,
): Promise<EvidenceArtifactCheck> {
  const targetPath = await resolveDailyArtifactForDate(targetDate, definition, dailyDir);
  const aliasPath = path.join(dailyDir, definition.aliasName);
  const result: EvidenceArtifactCheck = {
    kind: definition.kind,
    cadence: 'daily',
    path: targetPath ?? path.join(dailyDir, `${targetDate}-${definition.basename}`),
    aliasPath,
    exists: Boolean(targetPath),
    valid: false,
    format: definition.format,
    errors: [],
    warnings: [],
  };

  if (!targetPath) {
    result.errors.push(`Missing daily artifact for ${targetDate}: ${definition.basename}`);
    return result;
  }

  let timestamp: Date;
  if (definition.format === 'json') {
    let payload: Record<string, unknown>;
    try {
      payload = await readJsonFile<Record<string, unknown>>(targetPath);
    } catch (error) {
      result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    if (definition.schemaFile) {
      const schema = await loadSchema(definition.schemaFile);
      const validate = ajv.compile(schema);
      const valid = validate(payload);
      if (!valid) {
        for (const error of validate.errors ?? []) {
          result.errors.push(ajvErrorMessage(error));
        }
      }
    }

    if (definition.kind === EvidenceKind.HandoffLedger) {
      const handoffValidation = validateHandoffLedger(payload, targetDate, now);
      result.details = handoffValidation.details;
      result.errors.push(...handoffValidation.errors);
      result.warnings.push(...handoffValidation.warnings);
    }

    timestamp = parseTimestamp(payload.captured_at) ?? await fileTimestamp(targetPath);
  } else {
    const contents = await fs.readFile(targetPath, 'utf-8');
    for (const error of collectMarkdownErrors(contents, definition.requiredHeadings ?? [], true)) {
      result.errors.push(error);
    }
    timestamp = await fileTimestamp(targetPath);
  }

  result.timestamp = toUtcIso(timestamp);
  result.ageHours = getAgeHours(timestamp, now);
  result.stale = result.ageHours > getMaxAgeHours('daily', freshnessPolicy);
  if (result.stale) {
    result.errors.push(
      `Artifact is stale (${result.ageHours}h old; max ${getMaxAgeHours('daily', freshnessPolicy)}h)`,
    );
  }

  if (!result.errors.length && materializeAliases) {
    await fs.copyFile(targetPath, aliasPath);
    result.aliasUpdated = true;
  }

  result.valid = result.errors.length === 0;
  return result;
}

async function validatePeriodicArtifacts(
  cadence: 'weekly' | 'monthly',
  target: string,
  dir: string,
  now: Date,
  freshnessPolicy: EvidenceFreshnessPolicy,
): Promise<EvidenceArtifactCheck[]> {
  const basenames = cadence === 'weekly' ? WEEKLY_ARTIFACTS : MONTHLY_ARTIFACTS;
  const maxAgeHours = getMaxAgeHours(cadence, freshnessPolicy);
  const checks: EvidenceArtifactCheck[] = [];

  for (const basename of basenames) {
    const targetPath = path.join(dir, `${target}-${basename}`);
    const exists = await pathExists(targetPath);
    const check: EvidenceArtifactCheck = {
      kind: cadence === 'weekly' ? EvidenceKind.WeeklyRollup : EvidenceKind.MonthlyRollup,
      cadence,
      path: targetPath,
      exists,
      valid: false,
      format: basename.endsWith('.json') ? 'json' : 'markdown',
      errors: [],
      warnings: [],
    };

    if (!exists) {
      check.errors.push(`Missing ${cadence} artifact: ${path.basename(targetPath)}`);
      checks.push(check);
      continue;
    }

    if (basename.endsWith('.json')) {
      try {
        await readJsonFile<Record<string, unknown>>(targetPath);
      } catch (error) {
        check.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const contents = await fs.readFile(targetPath, 'utf-8');
      const requiredHeadings = cadence === 'weekly'
        ? WEEKLY_MARKDOWN_HEADINGS[basename] ?? []
        : MONTHLY_MARKDOWN_HEADINGS[basename] ?? [];
      for (const error of collectMarkdownErrors(contents, requiredHeadings, false)) {
        check.errors.push(error);
      }
    }

    const timestamp = await fileTimestamp(targetPath);
    check.timestamp = toUtcIso(timestamp);
    check.ageHours = getAgeHours(timestamp, now);
    check.stale = check.ageHours > maxAgeHours;
    if (check.stale) {
      check.errors.push(`Artifact is stale (${check.ageHours}h old; max ${maxAgeHours}h)`);
    }
    check.valid = check.errors.length === 0;
    checks.push(check);
  }

  return checks;
}

async function writeValidationReport(
  payload: EvidenceValidationResult,
  reportDir: string,
): Promise<EvidenceValidationResult> {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const baseName = `${payload.cadence}-${payload.target}-${timestamp}`.replace(/[^a-zA-Z0-9._-]/g, '-');
  const reportJson = path.join(reportDir, `evidence-validate-${baseName}.json`);
  const reportMarkdown = path.join(reportDir, `evidence-validate-${baseName}.md`);
  const latestJson = path.join(reportDir, 'evidence-validate-latest.json');
  const latestMarkdown = path.join(reportDir, 'evidence-validate-latest.md');

  const output = { ...payload, reportJson: relFromRepo(reportJson), reportMarkdown: relFromRepo(reportMarkdown) };
  await fs.writeFile(reportJson, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

  const lines = [
    '# Evidence Validation Summary',
    '',
    `- Generated: \`${payload.generatedAtUtc}\``,
    `- Cadence: \`${payload.cadence}\``,
    `- Target: \`${payload.target}\``,
    `- Status: \`${payload.status.toUpperCase()}\``,
    '',
    '| Artifact | Exists | Valid | Stale | Path |',
    '|---|---|---|---|---|',
  ];
  for (const artifact of payload.artifacts) {
    lines.push(
      `| \`${artifact.kind}\` | \`${artifact.exists ? 'yes' : 'no'}\` | \`${artifact.valid ? 'yes' : 'no'}\` | \`${artifact.stale ? 'yes' : 'no'}\` | \`${relFromRepo(artifact.path)}\` |`,
    );
  }
  if (payload.failures.length) {
    lines.push('', '## Failures');
    for (const failure of payload.failures) {
      lines.push(`- ${failure}`);
    }
  }
  if (payload.warnings.length) {
    lines.push('', '## Warnings');
    for (const warning of payload.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  await fs.writeFile(reportMarkdown, `${lines.join('\n')}\n`, 'utf-8');
  await fs.copyFile(reportJson, latestJson);
  await fs.copyFile(reportMarkdown, latestMarkdown);

  return {
    ...output,
    reportJson: reportJson,
    reportMarkdown: reportMarkdown,
  };
}

export async function validateEvidence(options: CadenceValidationOptions): Promise<EvidenceValidationResult> {
  const now = options.now ?? new Date();
  const freshnessPolicy = resolveFreshnessPolicy(options.freshnessPolicy);
  const dailyDir = options.dailyDir ?? EVIDENCE_DAILY_DIR;
  const weeklyDir = options.weeklyDir ?? EVIDENCE_WEEKLY_DIR;
  const monthlyDir = options.monthlyDir ?? EVIDENCE_MONTHLY_DIR;
  const materializeAliases = options.materializeAliases ?? false;

  let target = options.target;
  if (!target || target === 'today') {
    target = options.cadence === 'daily'
      ? formatLocalDate(now)
      : options.cadence === 'weekly'
        ? formatIsoWeek(now)
        : formatMonth(now);
  }
  if (target === 'latest') {
    if (options.cadence === 'daily') {
      const latestDate = await resolveLatestDailyDate(dailyDir);
      target = latestDate ?? 'latest';
    } else if (options.cadence === 'weekly') {
      target = (await resolveLatestPeriodicTarget(weeklyDir, WEEKLY_ARTIFACTS)) ?? 'latest';
    } else {
      target = (await resolveLatestPeriodicTarget(monthlyDir, MONTHLY_ARTIFACTS)) ?? 'latest';
    }
  }

  let artifacts: EvidenceArtifactCheck[] = [];
  if (options.cadence === 'daily') {
    if (target === 'latest') {
      artifacts = DAILY_ARTIFACTS.map((definition) => ({
        kind: definition.kind,
        cadence: 'daily',
        path: path.join(dailyDir, definition.aliasName),
        exists: false,
        valid: false,
        format: definition.format,
        aliasPath: path.join(dailyDir, definition.aliasName),
        errors: ['No dated daily artifacts discovered'],
        warnings: [],
      }));
    } else {
      artifacts = await Promise.all(
        DAILY_ARTIFACTS.map((definition) =>
          validateDailyArtifact(definition, target as string, dailyDir, now, freshnessPolicy, materializeAliases),
        ),
      );
    }
  } else if (options.cadence === 'weekly') {
    artifacts = await validatePeriodicArtifacts('weekly', target as string, weeklyDir, now, freshnessPolicy);
  } else {
    artifacts = await validatePeriodicArtifacts('monthly', target as string, monthlyDir, now, freshnessPolicy);
  }

  const failures = artifacts.flatMap((artifact) => artifact.errors.map((error) => `${artifact.kind}: ${error}`));
  const warnings = artifacts.flatMap((artifact) => artifact.warnings.map((warning) => `${artifact.kind}: ${warning}`));
  const payload: EvidenceValidationResult = {
    status: failures.length ? 'fail' : 'pass',
    cadence: options.cadence,
    target: target as string,
    generatedAtUtc: toUtcIso(now),
    freshnessPolicy,
    artifacts,
    failures,
    warnings,
  };

  if (options.writeReport === false) {
    return payload;
  }
  const reportDir = options.reportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'evidence');
  return writeValidationReport(payload, reportDir);
}

export async function materializeDailyEvidence(
  options: DailyGenerationOptions = {},
): Promise<EvidenceValidationResult> {
  await ensureEvidenceDirectories({ dailyDir: options.dailyDir });
  return validateEvidence({
    cadence: 'daily',
    target: options.date ?? 'today',
    dailyDir: options.dailyDir,
    materializeAliases: options.materializeAliases ?? true,
  });
}

function dedupeSortedDates(entries: DiscoveredDailyArtifact[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.date))).sort();
}

async function summarizeDailyCoverage(dailyDir: string): Promise<Map<string, Set<EvidenceKind>>> {
  const coverage = new Map<string, Set<EvidenceKind>>();
  for (const definition of DAILY_ARTIFACTS) {
    const discovered = await discoverDailyArtifacts(definition.basename, dailyDir);
    for (const artifact of discovered) {
      const bucket = coverage.get(artifact.date) ?? new Set<EvidenceKind>();
      bucket.add(definition.kind);
      coverage.set(artifact.date, bucket);
    }
  }
  return coverage;
}

async function summarizePeriodicCoverage(
  dir: string,
  basenames: readonly string[],
): Promise<Map<string, Set<string>>> {
  const coverage = new Map<string, Set<string>>();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    for (const basename of basenames) {
      if (!entry.name.endsWith(`-${basename}`)) {
        continue;
      }
      const target = entry.name.slice(0, -(`-${basename}`.length));
      const bucket = coverage.get(target) ?? new Set<string>();
      bucket.add(basename);
      coverage.set(target, bucket);
    }
  }
  return coverage;
}

function buildInventorySection(
  dir: string,
  coverage: Map<string, Set<string>>,
  requiredCount: number,
  currentTarget: string,
): EvidenceInventorySection {
  const targets = Array.from(coverage.keys()).sort().map((target) => {
    const artifacts = Array.from(coverage.get(target) ?? []).sort();
    return {
      target,
      artifactCount: artifacts.length,
      requiredCount,
      complete: artifacts.length === requiredCount,
      artifacts,
    };
  });
  const latestTarget = targets.length ? targets[targets.length - 1].target : undefined;
  const completeTargets = targets.filter((target) => target.complete).length;
  const current = targets.find((target) => target.target === currentTarget);
  return {
    dir: relFromRepo(dir),
    totalTargets: targets.length,
    completeTargets,
    incompleteTargets: targets.length - completeTargets,
    latestTarget,
    currentTarget,
    currentTargetComplete: current?.complete ?? false,
    targets,
  };
}

async function writeEvidenceIndexReport(
  payload: EvidenceInventoryResult,
  reportDir: string,
): Promise<EvidenceInventoryResult> {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const reportJson = path.join(reportDir, `evidence-index-${timestamp}.json`);
  const reportMarkdown = path.join(reportDir, `evidence-index-${timestamp}.md`);
  const latestJson = path.join(reportDir, 'evidence-index-latest.json');
  const latestMarkdown = path.join(reportDir, 'evidence-index-latest.md');
  const output = {
    ...payload,
    reportJson: relFromRepo(reportJson),
    reportMarkdown: relFromRepo(reportMarkdown),
  };
  await fs.writeFile(reportJson, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

  const lines = [
    '# Evidence Inventory Summary',
    '',
    `- Generated: \`${payload.generatedAtUtc}\``,
    '',
    '| Cadence | Total Targets | Complete | Incomplete | Latest | Current | Current Complete |',
    '|---|---:|---:|---:|---|---|---|',
    `| daily | \`${payload.daily.totalTargets}\` | \`${payload.daily.completeTargets}\` | \`${payload.daily.incompleteTargets}\` | \`${payload.daily.latestTarget ?? 'n/a'}\` | \`${payload.daily.currentTarget ?? 'n/a'}\` | \`${payload.daily.currentTargetComplete ? 'yes' : 'no'}\` |`,
    `| weekly | \`${payload.weekly.totalTargets}\` | \`${payload.weekly.completeTargets}\` | \`${payload.weekly.incompleteTargets}\` | \`${payload.weekly.latestTarget ?? 'n/a'}\` | \`${payload.weekly.currentTarget ?? 'n/a'}\` | \`${payload.weekly.currentTargetComplete ? 'yes' : 'no'}\` |`,
    `| monthly | \`${payload.monthly.totalTargets}\` | \`${payload.monthly.completeTargets}\` | \`${payload.monthly.incompleteTargets}\` | \`${payload.monthly.latestTarget ?? 'n/a'}\` | \`${payload.monthly.currentTarget ?? 'n/a'}\` | \`${payload.monthly.currentTargetComplete ? 'yes' : 'no'}\` |`,
    '',
    `- Incident bundles tracked: \`${payload.incidents.totalIncidents}\``,
  ];

  for (const [label, section] of [
    ['Daily Targets', payload.daily],
    ['Weekly Targets', payload.weekly],
    ['Monthly Targets', payload.monthly],
  ] as const) {
    lines.push('', `## ${label}`);
    if (!section.targets.length) {
      lines.push('- No targets discovered.');
      continue;
    }
    for (const target of section.targets.slice(-10)) {
      lines.push(`- \`${target.target}\`: ${target.complete ? 'complete' : 'partial'} (${target.artifactCount}/${target.requiredCount})`);
    }
  }

  await fs.writeFile(reportMarkdown, `${lines.join('\n')}\n`, 'utf-8');
  await fs.copyFile(reportJson, latestJson);
  await fs.copyFile(reportMarkdown, latestMarkdown);
  return {
    ...payload,
    reportJson,
    reportMarkdown,
  };
}

async function writeRetentionReport(
  payload: EvidenceRetentionResult,
  reportDir: string,
): Promise<EvidenceRetentionResult> {
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const reportJson = path.join(reportDir, `evidence-retention-${timestamp}.json`);
  const reportMarkdown = path.join(reportDir, `evidence-retention-${timestamp}.md`);
  const latestJson = path.join(reportDir, 'evidence-retention-latest.json');
  const latestMarkdown = path.join(reportDir, 'evidence-retention-latest.md');
  const output = {
    ...payload,
    reportJson: relFromRepo(reportJson),
    reportMarkdown: relFromRepo(reportMarkdown),
  };
  await fs.writeFile(reportJson, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

  const lines = [
    '# Evidence Retention Summary',
    '',
    `- Generated: \`${payload.generatedAtUtc}\``,
    `- Mode: \`${payload.apply ? 'apply' : 'preview'}\``,
    `- Candidates: \`${payload.candidates.length}\``,
    `- Pruned: \`${payload.pruned.length}\``,
  ];
  if (payload.candidates.length) {
    lines.push('', '## Candidates');
    for (const entry of payload.candidates.slice(0, 50)) {
      lines.push(`- [${entry.deleted ? 'x' : ' '}] \`${entry.bucket}\` \`${entry.path}\` (${entry.ageDays}d > ${entry.thresholdDays}d)`);
    }
  }

  await fs.writeFile(reportMarkdown, `${lines.join('\n')}\n`, 'utf-8');
  await fs.copyFile(reportJson, latestJson);
  await fs.copyFile(reportMarkdown, latestMarkdown);
  return {
    ...payload,
    reportJson,
    reportMarkdown,
  };
}

export async function buildEvidenceIndex(
  options: EvidenceInventoryOptions = {},
): Promise<EvidenceInventoryResult> {
  const now = options.now ?? new Date();
  const dailyDir = options.dailyDir ?? EVIDENCE_DAILY_DIR;
  const weeklyDir = options.weeklyDir ?? EVIDENCE_WEEKLY_DIR;
  const monthlyDir = options.monthlyDir ?? EVIDENCE_MONTHLY_DIR;
  const incidentsDir = options.incidentsDir ?? EVIDENCE_INCIDENTS_DIR;
  const reportDir = options.reportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'evidence');

  await ensureEvidenceDirectories({ dailyDir, weeklyDir, monthlyDir, incidentsDir });

  const dailyCoverageRaw = await summarizeDailyCoverage(dailyDir);
  const dailyCoverage = new Map<string, Set<string>>();
  for (const [target, artifacts] of dailyCoverageRaw.entries()) {
    dailyCoverage.set(target, new Set(Array.from(artifacts)));
  }
  const weeklyCoverage = await summarizePeriodicCoverage(weeklyDir, WEEKLY_ARTIFACTS);
  const monthlyCoverage = await summarizePeriodicCoverage(monthlyDir, MONTHLY_ARTIFACTS);
  const incidentIds = (await fs.readdir(incidentsDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const payload: EvidenceInventoryResult = {
    generatedAtUtc: toUtcIso(now),
    daily: buildInventorySection(dailyDir, dailyCoverage, DAILY_ARTIFACTS.length, formatLocalDate(now)),
    weekly: buildInventorySection(weeklyDir, weeklyCoverage, WEEKLY_ARTIFACTS.length, formatIsoWeek(now)),
    monthly: buildInventorySection(monthlyDir, monthlyCoverage, MONTHLY_ARTIFACTS.length, formatMonth(now)),
    incidents: {
      dir: relFromRepo(incidentsDir),
      totalIncidents: incidentIds.length,
      incidentIds,
    },
  };

  return writeEvidenceIndexReport(payload, reportDir);
}

async function scanRetentionCandidates(
  dir: string,
  bucket: string,
  thresholdDays: number,
  now: Date,
  referenceForEntry: (entryName: string, fullPath: string) => Promise<Date | null> | Date | null,
  apply: boolean,
): Promise<EvidenceRetentionEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const candidates: EvidenceRetentionEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.includes('-latest.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const reference = await referenceForEntry(entry.name, fullPath);
    if (!reference) {
      continue;
    }
    const ageDays = getAgeDays(reference, now);
    if (ageDays <= thresholdDays) {
      continue;
    }
    if (apply) {
      await fs.rm(fullPath, { force: true });
    }
    candidates.push({
      bucket,
      path: relFromRepo(fullPath),
      ageDays,
      thresholdDays,
      deleted: apply,
    });
  }
  return candidates;
}

export async function enforceEvidenceRetention(
  options: EvidenceRetentionOptions = {},
): Promise<EvidenceRetentionResult> {
  const now = options.now ?? new Date();
  const apply = options.apply ?? false;
  const policy = resolveRetentionPolicy(options.policy);
  const dailyDir = options.dailyDir ?? EVIDENCE_DAILY_DIR;
  const weeklyDir = options.weeklyDir ?? EVIDENCE_WEEKLY_DIR;
  const monthlyDir = options.monthlyDir ?? EVIDENCE_MONTHLY_DIR;
  const reportDir = options.reportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'evidence');
  const readinessReportDir = options.readinessReportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'phase0-readiness');

  await ensureEvidenceDirectories({ dailyDir, weeklyDir, monthlyDir });
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(readinessReportDir, { recursive: true });

  const candidates = [
    ...await scanRetentionCandidates(
      dailyDir,
      'daily',
      policy.dailyDays,
      now,
      (entryName) => parseDailyFilenameDate(entryName),
      apply,
    ),
    ...await scanRetentionCandidates(
      weeklyDir,
      'weekly',
      policy.weeklyDays,
      now,
      (entryName) => {
        const match = entryName.match(/^(\d{4}-W\d{2})-/);
        if (!match) {
          return null;
        }
        return isoWeekDateBounds(match[1]).end;
      },
      apply,
    ),
    ...await scanRetentionCandidates(
      monthlyDir,
      'monthly',
      policy.monthlyDays,
      now,
      (entryName) => {
        const match = entryName.match(/^(\d{4}-\d{2})-/);
        if (!match) {
          return null;
        }
        return parseMonthlyIdentifierDate(match[1]);
      },
      apply,
    ),
    ...await scanRetentionCandidates(
      reportDir,
      'evidence-report',
      policy.evidenceReportDays,
      now,
      async (_entryName, fullPath) => fileTimestamp(fullPath),
      apply,
    ),
    ...await scanRetentionCandidates(
      readinessReportDir,
      'readiness-report',
      policy.readinessReportDays,
      now,
      async (_entryName, fullPath) => fileTimestamp(fullPath),
      apply,
    ),
  ];

  const payload: EvidenceRetentionResult = {
    generatedAtUtc: toUtcIso(now),
    apply,
    policy,
    candidates,
    pruned: candidates.filter((entry) => entry.deleted),
  };

  return writeRetentionReport(payload, reportDir);
}

export async function generateWeeklyRollup(
  options: WeeklyGenerationOptions = {},
): Promise<Record<string, string>> {
  const now = new Date();
  const isoWeek = options.isoWeek ?? formatIsoWeek(now);
  const dailyDir = options.dailyDir ?? EVIDENCE_DAILY_DIR;
  const weeklyDir = options.weeklyDir ?? EVIDENCE_WEEKLY_DIR;
  await ensureEvidenceDirectories({ dailyDir, weeklyDir });

  const coverage = await summarizeDailyCoverage(dailyDir);
  const dates = Array.from(coverage.keys()).filter((date) => dateInIsoWeek(date, isoWeek)).sort();
  const dailyCoverage = dates.map((date) => ({
    date,
    artifacts: Array.from(coverage.get(date) ?? []).sort(),
    complete: (coverage.get(date)?.size ?? 0) === DAILY_ARTIFACTS.length,
  }));

  const kpiRollupPath = path.join(weeklyDir, `${isoWeek}-kpi-rollup.json`);
  const opsReviewPath = path.join(weeklyDir, `${isoWeek}-ops-review.md`);
  const riskRegisterPath = path.join(weeklyDir, `${isoWeek}-risk-register.md`);

  const kpiPayload = {
    schemaVersion: 1,
    generatedAtUtc: toUtcIso(now),
    isoWeek,
    daysCovered: dailyCoverage.length,
    completeDays: dailyCoverage.filter((day) => day.complete).length,
    incompleteDays: dailyCoverage.filter((day) => !day.complete).length,
    dailyCoverage,
  };
  await fs.writeFile(kpiRollupPath, `${JSON.stringify(kpiPayload, null, 2)}\n`, 'utf-8');

  const opsReview = [
    `# Weekly Ops Review — ${isoWeek}`,
    '',
    '## Coverage',
    `- Days covered: \`${dailyCoverage.length}\``,
    `- Complete days: \`${kpiPayload.completeDays}\``,
    `- Incomplete days: \`${kpiPayload.incompleteDays}\``,
    '',
    '## Highlights',
    dailyCoverage.length
      ? dailyCoverage.map((day) => `- ${day.date}: ${day.complete ? 'complete evidence set' : 'partial evidence set'}`).join('\n')
      : '- No daily evidence discovered for this ISO week.',
    '',
    '## Actions',
    dailyCoverage.length
      ? '- Backfill missing daily artifacts before the next executive review.'
      : '- Generate at least one daily evidence set before rerunning weekly rollup.',
  ].join('\n');
  await fs.writeFile(opsReviewPath, `${opsReview}\n`, 'utf-8');

  const riskRegister = [
    `# Weekly Risk Register — ${isoWeek}`,
    '',
    '## Open Risks',
    dailyCoverage.some((day) => !day.complete)
      ? '- Partial daily evidence coverage leaves executive rollups non-authoritative.'
      : '- No material evidence coverage gaps detected this week.',
    '',
    '## Mitigations',
    dailyCoverage.some((day) => !day.complete)
      ? '- Re-run `bash scripts/run-evidence-daily.sh --date <YYYY-MM-DD>` for incomplete dates.'
      : '- Maintain daily evidence cadence and freshness checks.',
  ].join('\n');
  await fs.writeFile(riskRegisterPath, `${riskRegister}\n`, 'utf-8');

  return {
    kpiRollupPath,
    opsReviewPath,
    riskRegisterPath,
  };
}

export async function generateMonthlyRollup(
  options: MonthlyGenerationOptions = {},
): Promise<Record<string, string>> {
  const now = new Date();
  const month = options.month ?? formatMonth(now);
  const dailyDir = options.dailyDir ?? EVIDENCE_DAILY_DIR;
  const monthlyDir = options.monthlyDir ?? EVIDENCE_MONTHLY_DIR;
  await ensureEvidenceDirectories({ dailyDir, monthlyDir });

  const coverage = await summarizeDailyCoverage(dailyDir);
  const dates = Array.from(coverage.keys()).filter((date) => dateInMonth(date, month)).sort();
  const dailyCoverage = dates.map((date) => ({
    date,
    artifacts: Array.from(coverage.get(date) ?? []).sort(),
    complete: (coverage.get(date)?.size ?? 0) === DAILY_ARTIFACTS.length,
  }));

  const forecastPath = path.join(monthlyDir, `${month}-forecast.md`);
  const spendRollupPath = path.join(monthlyDir, `${month}-spend-rollup.json`);
  const readinessSummaryPath = path.join(monthlyDir, `${month}-readiness-summary.md`);

  const spendPayload = {
    schemaVersion: 1,
    generatedAtUtc: toUtcIso(now),
    month,
    daysCovered: dailyCoverage.length,
    completeDays: dailyCoverage.filter((day) => day.complete).length,
    incompleteDays: dailyCoverage.filter((day) => !day.complete).length,
    dailyCoverage,
  };
  await fs.writeFile(spendRollupPath, `${JSON.stringify(spendPayload, null, 2)}\n`, 'utf-8');

  const forecast = [
    `# Monthly Forecast — ${month}`,
    '',
    '## Monthly Snapshot',
    `- Days covered: \`${dailyCoverage.length}\``,
    `- Complete evidence days: \`${spendPayload.completeDays}\``,
    '',
    '## Forecast Inputs',
    dailyCoverage.length
      ? '- Forecast quality is constrained by the current monthly evidence coverage shown above.'
      : '- No daily evidence coverage exists for this month yet.',
  ].join('\n');
  await fs.writeFile(forecastPath, `${forecast}\n`, 'utf-8');

  const readinessSummary = [
    `# Monthly Readiness Summary — ${month}`,
    '',
    '## Readiness Status',
    dailyCoverage.length && dailyCoverage.every((day) => day.complete)
      ? '- Readiness posture: `PASSING` based on complete daily evidence coverage.'
      : '- Readiness posture: `AT_RISK` due to incomplete or missing daily evidence coverage.',
    '',
    '## Follow-Up Actions',
    dailyCoverage.length && dailyCoverage.every((day) => day.complete)
      ? '- Continue weekly and monthly rollups on the established cadence.'
      : '- Backfill incomplete days and rerun monthly rollup before relying on this report for planning.',
  ].join('\n');
  await fs.writeFile(readinessSummaryPath, `${readinessSummary}\n`, 'utf-8');

  return {
    forecastPath,
    spendRollupPath,
    readinessSummaryPath,
  };
}

function buildReadinessMarkdown(payload: ReadinessGateResult): string {
  const lines = [
    '# Phase 0 Readiness Summary',
    '',
    `- Generated: \`${payload.generatedAtUtc}\``,
    `- Status: \`${payload.status.toUpperCase()}\``,
    '',
    '## Gate Results',
  ];
  for (const check of payload.checks) {
    lines.push(`- [${check.status === 'pass' ? 'x' : ' '}] \`${check.id}\` ${check.message}`);
  }
  if (payload.staleArtifacts.length) {
    lines.push('', '## Stale Artifacts');
    for (const item of payload.staleArtifacts) {
      lines.push(`- ${item}`);
    }
  }
  if (payload.recommendedRemediations.length) {
    lines.push('', '## Recommended Remediations');
    for (const item of payload.recommendedRemediations) {
      lines.push(`- ${item}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function latestHookLog(logDir: string): Promise<string | null> {
  const entries = await fs.readdir(logDir, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.isFile() && /^post-merge-cadence-.*\.log$/.test(entry.name))
    .map((entry) => path.join(logDir, entry.name))
    .sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

export async function runPhase0Readiness(
  options: Phase0ReadinessOptions = {},
): Promise<ReadinessGateResult> {
  const now = options.now ?? new Date();
  const reportDir = options.reportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'phase0-readiness');
  const architectureDocPath = options.architectureDocPath ?? path.join(VENTUREOS_ROOT, 'docs', 'VentureOS_Department_Architecture_v1.md');
  const localChecklistPath = options.localChecklistPath ?? path.join(VENTUREOS_ROOT, 'docs', 'LOCAL_INTEGRATION_CHECKLIST.md');
  const localReadyStatusJson = options.localReadyStatusJson ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'openclaw-local-smoke', 'openclaw-local-ready-latest.json');
  const postMergeCadenceJson = options.postMergeCadenceJson ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'post-merge-cadence', 'post-merge-cadence-latest.json');
  const hookLogDir = options.hookLogDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'logs', 'git-hooks');
  const evidenceIndexLatestJson = path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'evidence', 'evidence-index-latest.json');
  const evidenceRetentionLatestJson = path.join(VENTUREOS_ROOT, 'runtime', 'reports', 'evidence', 'evidence-retention-latest.json');

  const checks: ReadinessCheck[] = [];
  const recommendedRemediations: string[] = [];
  const staleArtifacts: string[] = [];

  const architectureExists = await pathExists(architectureDocPath);
  checks.push({
    id: 'architecture-doc',
    status: architectureExists ? 'pass' : 'fail',
    message: architectureExists
      ? 'Department architecture document is restored in the working tree.'
      : 'Department architecture document is missing from the working tree.',
    details: { path: relFromRepo(architectureDocPath) },
  });
  if (!architectureExists) {
    recommendedRemediations.push('Restore docs/VentureOS_Department_Architecture_v1.md from commit f8ab267f.');
  }

  const dailyValidation = await validateEvidence({ cadence: 'daily', target: options.dailyTarget ?? 'latest', now, writeReport: false });
  checks.push({
    id: 'daily-evidence',
    status: dailyValidation.status === 'pass' ? 'pass' : 'fail',
    message: dailyValidation.status === 'pass'
      ? `Daily evidence for ${dailyValidation.target} is present and fresh.`
      : `Daily evidence validation failed for ${dailyValidation.target}.`,
    details: { target: dailyValidation.target },
  });
  if (dailyValidation.status === 'fail') {
    staleArtifacts.push(...dailyValidation.artifacts.filter((artifact) => artifact.stale).map((artifact) => relFromRepo(artifact.path)));
    recommendedRemediations.push('Run bash scripts/run-evidence-daily.sh --date latest after backfilling missing or stale daily artifacts.');
  }

  const handoffArtifact = dailyValidation.artifacts.find((artifact) => artifact.kind === EvidenceKind.HandoffLedger);
  const handoffDetails = handoffArtifact?.details ?? {};
  const handoffOnTimeRate = parseFiniteNumber(handoffDetails.onTimeRate);
  const lateMissingBreachOwnerCount = parseFiniteNumber(handoffDetails.lateMissingBreachOwnerCount) ?? 0;
  const lateMissingBreachActionCount = parseFiniteNumber(handoffDetails.lateMissingBreachActionCount) ?? 0;
  const level3WithoutApprovalCount = parseFiniteNumber(handoffDetails.level3WithoutApprovalCount) ?? 0;
  const handoffSlaPass = Boolean(
    handoffArtifact?.exists
    && handoffOnTimeRate !== null
    && handoffOnTimeRate >= 0.9
    && lateMissingBreachOwnerCount === 0
    && lateMissingBreachActionCount === 0
    && level3WithoutApprovalCount === 0
  );
  checks.push({
    id: 'handoff-sla',
    status: handoffSlaPass ? 'pass' : 'fail',
    message: handoffSlaPass
      ? `Handoff SLA evidence is within threshold for ${dailyValidation.target}.`
      : `Handoff SLA evidence for ${dailyValidation.target} is degraded or incomplete.`,
    details: {
      target: dailyValidation.target,
      onTimeRate: handoffOnTimeRate,
      lateMissingBreachOwnerCount,
      lateMissingBreachActionCount,
      level3WithoutApprovalCount,
    },
  });
  if (!handoffSlaPass) {
    recommendedRemediations.push('Update the daily handoff ledger with canonical bindings, breach routing, and current SLA remediation details before rerunning readiness.');
  }

  const weeklyValidation = await validateEvidence({ cadence: 'weekly', target: options.weeklyTarget ?? 'latest', now, writeReport: false });
  checks.push({
    id: 'weekly-rollup',
    status: weeklyValidation.status === 'pass' ? 'pass' : 'fail',
    message: weeklyValidation.status === 'pass'
      ? `Weekly evidence for ${weeklyValidation.target} is present and fresh.`
      : `Weekly evidence validation failed for ${weeklyValidation.target}.`,
    details: { target: weeklyValidation.target },
  });
  if (weeklyValidation.status === 'fail') {
    staleArtifacts.push(...weeklyValidation.artifacts.filter((artifact) => artifact.stale).map((artifact) => relFromRepo(artifact.path)));
    recommendedRemediations.push('Run bash scripts/run-evidence-weekly.sh to generate the current ISO-week rollup before rechecking readiness.');
  }

  const checklistExists = await pathExists(localChecklistPath);
  checks.push({
    id: 'local-integration-checklist',
    status: checklistExists ? 'pass' : 'fail',
    message: checklistExists
      ? 'Local integration checklist is present.'
      : 'Local integration checklist is missing.',
    details: { path: relFromRepo(localChecklistPath) },
  });
  if (!checklistExists) {
    recommendedRemediations.push('Regenerate docs/LOCAL_INTEGRATION_CHECKLIST.md before relying on readiness output.');
  }

  if (options.localIntegrationMode ?? true) {
    const localReadyExists = await pathExists(localReadyStatusJson);
    let localReadyPass = false;
    let latestTimestamp = 'n/a';
    if (localReadyExists) {
      const payload = await readJsonFile<Record<string, unknown>>(localReadyStatusJson);
      const status = String(payload.status ?? 'unknown').toLowerCase();
      const generatedAt = typeof payload.generatedAt === 'string'
        ? payload.generatedAt
        : typeof payload.latestTimestamp === 'string'
          ? payload.latestTimestamp
          : '';
      const generatedAtDate = parseTimestamp(generatedAt);
      latestTimestamp = generatedAt || latestTimestamp;
      const ageHours = generatedAtDate ? getAgeHours(generatedAtDate, now) : Number.POSITIVE_INFINITY;
      localReadyPass = status === 'ok' && ageHours <= DEFAULT_FRESHNESS_POLICY.dailyHours;
      if (!localReadyPass && Number.isFinite(ageHours) && ageHours > DEFAULT_FRESHNESS_POLICY.dailyHours) {
        staleArtifacts.push(relFromRepo(localReadyStatusJson));
      }
    }
    checks.push({
      id: 'local-openclaw-smoke',
      status: localReadyPass ? 'pass' : 'fail',
      message: localReadyPass
        ? 'Local OpenClaw readiness evidence is present and fresh.'
        : 'Local OpenClaw readiness evidence is missing, stale, or failing.',
      details: { path: relFromRepo(localReadyStatusJson), latestTimestamp },
    });
    if (!localReadyPass) {
      recommendedRemediations.push('Run bash scripts/openclaw-local-ready-cadence.sh or refresh the local readiness report before rerunning readiness.');
    }
  }

  if (options.hookMode ?? true) {
    const cadenceExists = await pathExists(postMergeCadenceJson);
    const latestLog = await latestHookLog(hookLogDir);
    let hookPass = false;
    if (cadenceExists && latestLog) {
      const cadencePayload = await readJsonFile<Record<string, unknown>>(postMergeCadenceJson);
      const generatedAt = parseTimestamp(cadencePayload.generatedAtUtc);
      const cadenceAgeHours = generatedAt ? getAgeHours(generatedAt, now) : Number.POSITIVE_INFINITY;
      const logAgeHours = getAgeHours(await fileTimestamp(latestLog), now);
      hookPass = cadenceAgeHours <= DEFAULT_FRESHNESS_POLICY.dailyHours && logAgeHours <= DEFAULT_FRESHNESS_POLICY.dailyHours;
      if (!hookPass) {
        if (cadenceAgeHours > DEFAULT_FRESHNESS_POLICY.dailyHours) {
          staleArtifacts.push(relFromRepo(postMergeCadenceJson));
        }
        if (logAgeHours > DEFAULT_FRESHNESS_POLICY.dailyHours) {
          staleArtifacts.push(relFromRepo(latestLog));
        }
      }
    }
    checks.push({
      id: 'post-merge-hook-health',
      status: hookPass ? 'pass' : 'warn',
      message: hookPass
        ? 'Post-merge cadence evidence and hook log are fresh.'
        : 'Post-merge cadence evidence or hook log is missing/stale.',
      details: { cadenceJson: relFromRepo(postMergeCadenceJson), hookLog: latestLog ? relFromRepo(latestLog) : 'n/a' },
    });
    if (!hookPass) {
      recommendedRemediations.push('Run bash scripts/post-merge-hook-health.sh and refresh the post-merge cadence artifacts if hook mode is required.');
    }
  }

  const failingGates = checks.filter((check) => check.status === 'fail').map((check) => check.id);
  const payload: ReadinessGateResult = {
    status: failingGates.length ? 'fail' : 'pass',
    generatedAtUtc: toUtcIso(now),
    checks,
    failingGates,
    staleArtifacts: Array.from(new Set(staleArtifacts)),
    recommendedRemediations: Array.from(new Set(recommendedRemediations)),
    artifacts: {
      architectureDoc: relFromRepo(architectureDocPath),
      localChecklist: relFromRepo(localChecklistPath),
      localReadyStatusJson: relFromRepo(localReadyStatusJson),
      postMergeCadenceJson: relFromRepo(postMergeCadenceJson),
      evidenceIndexLatestJson: relFromRepo(evidenceIndexLatestJson),
      evidenceRetentionLatestJson: relFromRepo(evidenceRetentionLatestJson),
    },
  };

  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const reportJson = path.join(reportDir, `phase0-readiness-${timestamp}.json`);
  const reportMarkdown = path.join(reportDir, `phase0-readiness-${timestamp}.md`);
  const latestJson = path.join(reportDir, 'phase0-readiness-latest.json');
  const latestMarkdown = path.join(reportDir, 'phase0-readiness-latest.md');
  const output = {
    ...payload,
    reportJson: relFromRepo(reportJson),
    reportMarkdown: relFromRepo(reportMarkdown),
  };
  await fs.writeFile(reportJson, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');
  await fs.writeFile(reportMarkdown, buildReadinessMarkdown(payload), 'utf-8');
  await fs.copyFile(reportJson, latestJson);
  await fs.copyFile(reportMarkdown, latestMarkdown);

  return {
    ...payload,
    reportJson,
    reportMarkdown,
  };
}

export async function scaffoldIncidentEvidence(
  incidentId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const incidentDir = getIncidentEvidencePath(incidentId);
  await fs.mkdir(incidentDir, { recursive: true });
  const incidentPath = path.join(incidentDir, 'timeline.json');
  await fs.writeFile(incidentPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return incidentPath;
}

export async function latestDailyDates(dailyDir = EVIDENCE_DAILY_DIR): Promise<string[]> {
  const discovered = await discoverDailyArtifacts('kpi-snapshot.json', dailyDir);
  return dedupeSortedDates(discovered);
}
