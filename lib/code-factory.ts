/**
 * Code Factory Pipeline primitives (Issue #220).
 *
 * Provides:
 * - risk policy contract loading + path-based tier assignment
 * - preflight evidence records bound to a specific head SHA
 * - simple review finding detection + auto-remediation helpers
 * - harness-gap tracker storage helpers
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type RiskTier = 'low' | 'medium' | 'high';

export interface RiskTierRule {
  pattern: string;
  tier: RiskTier;
}

export interface MergePolicy {
  auto_merge_low_risk: boolean;
  human_approval_high_risk: boolean;
}

export interface HarnessGapPolicy {
  sla_days: number;
}

export interface RiskPolicyContract {
  version: string;
  risk_tier_rules: RiskTierRule[];
  required_checks: Record<RiskTier, string[]>;
  merge_policy: MergePolicy;
  browser_evidence_patterns: string[];
  harness_gap_policy: HarnessGapPolicy;
}

export interface RiskAnalysisResult {
  riskTier: RiskTier;
  changedFiles: string[];
  matchedRules: Array<{ file: string; pattern: string; tier: RiskTier }>;
  requiredChecks: string[];
  uiAffecting: boolean;
}

export interface PreflightEvidenceRecord {
  id: string;
  pr_number: number;
  head_sha: string;
  risk_tier: RiskTier;
  required_checks: string[];
  check_results: Record<string, 'pending' | 'pass' | 'fail' | 'skipped'>;
  review_state: 'pending' | 'clean' | 'blocked';
  browser_evidence: {
    required: boolean;
    patterns: string[];
    manifest_path?: string;
  };
  changed_files: string[];
  matched_rules: Array<{ file: string; pattern: string; tier: RiskTier }>;
  created_at: string;
}

export type SimpleFindingKind = 'console-log' | 'trailing-whitespace' | 'missing-final-newline';

export interface SimpleReviewFinding {
  id: string;
  filePath: string;
  kind: SimpleFindingKind;
  message: string;
  remediable: boolean;
}

export interface AutoRemediationResult {
  attempted: number;
  applied: number;
  failed: number;
  fixRate: number;
  patchedFiles: string[];
  findings: SimpleReviewFinding[];
}

export interface HarnessGapRecord {
  id: string;
  incident_ref: string;
  test_case_added: boolean;
  sla_days: number;
  created_at: string;
  resolved_at?: string;
}

const DEFAULT_POLICY: RiskPolicyContract = {
  version: '2026-02-21',
  risk_tier_rules: [{ pattern: '**', tier: 'low' }],
  required_checks: {
    low: ['lint', 'typecheck'],
    medium: ['lint', 'typecheck', 'test', 'build'],
    high: ['lint', 'typecheck', 'test', 'build', 'review-agent', 'sha-discipline'],
  },
  merge_policy: {
    auto_merge_low_risk: false,
    human_approval_high_risk: true,
  },
  browser_evidence_patterns: ['dashboard/client/**', 'tactical-map/**'],
  harness_gap_policy: { sla_days: 3 },
};

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.yml', '.yaml', '.txt', '.sql',
  '.sh', '.py', '.go', '.rs', '.java', '.kt', '.rb', '.php',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.html', '.css',
]);

function tierWeight(tier: RiskTier): number {
  if (tier === 'high') return 3;
  if (tier === 'medium') return 2;
  return 1;
}

function higherTier(a: RiskTier, b: RiskTier): RiskTier {
  return tierWeight(a) >= tierWeight(b) ? a : b;
}

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  const escaped = normalized
    .split('*')
    .map((part) => part.split('?').map(escapeRegex).join('.'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function patternMatches(pattern: string, filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);
  const rx = wildcardToRegex(pattern);
  return rx.test(normalized) || rx.test(basename);
}

function normalizeFiles(files: string[]): string[] {
  return Array.from(new Set(
    files
      .map((f) => f.trim().replace(/\\/g, '/'))
      .filter(Boolean),
  )).sort();
}

function safeNow(now?: () => Date): () => Date {
  return now ?? (() => new Date());
}

export function loadRiskPolicy(policyPath: string): RiskPolicyContract {
  try {
    const raw = fs.readFileSync(policyPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RiskPolicyContract>;
    const rules = Array.isArray(parsed.risk_tier_rules)
      ? parsed.risk_tier_rules.filter((rule): rule is RiskTierRule => {
        return !!rule && typeof rule.pattern === 'string' && (rule.tier === 'low' || rule.tier === 'medium' || rule.tier === 'high');
      })
      : [];
    const requiredChecksRaw = parsed.required_checks as Partial<Record<RiskTier, string[]>> | undefined;
    const requiredChecks: Record<RiskTier, string[]> = {
      low: Array.isArray(requiredChecksRaw?.low) ? requiredChecksRaw.low.filter((v): v is string => typeof v === 'string') : DEFAULT_POLICY.required_checks.low,
      medium: Array.isArray(requiredChecksRaw?.medium) ? requiredChecksRaw.medium.filter((v): v is string => typeof v === 'string') : DEFAULT_POLICY.required_checks.medium,
      high: Array.isArray(requiredChecksRaw?.high) ? requiredChecksRaw.high.filter((v): v is string => typeof v === 'string') : DEFAULT_POLICY.required_checks.high,
    };
    const browserPatterns = Array.isArray(parsed.browser_evidence_patterns)
      ? parsed.browser_evidence_patterns.filter((v): v is string => typeof v === 'string')
      : DEFAULT_POLICY.browser_evidence_patterns;
    const slaDays = typeof parsed.harness_gap_policy?.sla_days === 'number'
      ? Math.max(1, Math.min(30, Math.floor(parsed.harness_gap_policy.sla_days)))
      : DEFAULT_POLICY.harness_gap_policy.sla_days;

    return {
      version: typeof parsed.version === 'string' ? parsed.version : DEFAULT_POLICY.version,
      risk_tier_rules: rules.length > 0 ? rules : DEFAULT_POLICY.risk_tier_rules,
      required_checks: requiredChecks,
      merge_policy: {
        auto_merge_low_risk: parsed.merge_policy?.auto_merge_low_risk ?? DEFAULT_POLICY.merge_policy.auto_merge_low_risk,
        human_approval_high_risk: parsed.merge_policy?.human_approval_high_risk ?? DEFAULT_POLICY.merge_policy.human_approval_high_risk,
      },
      browser_evidence_patterns: browserPatterns.length > 0 ? browserPatterns : DEFAULT_POLICY.browser_evidence_patterns,
      harness_gap_policy: { sla_days: slaDays },
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

export function analyzeRiskTier(changedFilesInput: string[], policy: RiskPolicyContract): RiskAnalysisResult {
  const changedFiles = normalizeFiles(changedFilesInput);
  let riskTier: RiskTier = 'low';
  const matchedRules: Array<{ file: string; pattern: string; tier: RiskTier }> = [];

  for (const file of changedFiles) {
    let fileTier: RiskTier = 'low';
    for (const rule of policy.risk_tier_rules) {
      if (!patternMatches(rule.pattern, file)) continue;
      matchedRules.push({ file, pattern: rule.pattern, tier: rule.tier });
      fileTier = higherTier(fileTier, rule.tier);
    }
    riskTier = higherTier(riskTier, fileTier);
  }

  const uiAffecting = changedFiles.some((file) => (
    policy.browser_evidence_patterns.some((pattern) => patternMatches(pattern, file))
  ));

  return {
    riskTier,
    changedFiles,
    matchedRules,
    requiredChecks: policy.required_checks[riskTier] ?? [],
    uiAffecting,
  };
}

export function buildPreflightEvidence(input: {
  prNumber: number;
  headSha: string;
  analysis: RiskAnalysisResult;
  now?: () => Date;
}): PreflightEvidenceRecord {
  const now = safeNow(input.now);
  const createdAt = now().toISOString();
  const requiredChecks = input.analysis.requiredChecks;
  const checkResults: Record<string, 'pending'> = {};
  for (const check of requiredChecks) checkResults[check] = 'pending';

  const idSeed = `${input.prNumber}:${input.headSha}:${createdAt}:${input.analysis.riskTier}`;
  const id = `evi-${crypto.createHash('sha1').update(idSeed).digest('hex').slice(0, 12)}`;
  return {
    id,
    pr_number: input.prNumber,
    head_sha: input.headSha,
    risk_tier: input.analysis.riskTier,
    required_checks: requiredChecks,
    check_results: checkResults,
    review_state: 'pending',
    browser_evidence: {
      required: input.analysis.uiAffecting,
      patterns: input.analysis.uiAffecting ? ['playwright', 'assertion-manifest'] : [],
    },
    changed_files: input.analysis.changedFiles,
    matched_rules: input.analysis.matchedRules,
    created_at: createdAt,
  };
}

export function validateEvidenceSha(evidence: PreflightEvidenceRecord, expectedSha: string): boolean {
  const left = evidence.head_sha.trim();
  const right = expectedSha.trim();
  return left.length > 0 && left === right;
}

function isLikelyTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return true;
  return TEXT_EXTENSIONS.has(ext);
}

function readFileSafe(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function findingId(filePath: string, kind: SimpleFindingKind, index: number): string {
  const hash = crypto.createHash('sha1').update(`${filePath}:${kind}:${index}`).digest('hex').slice(0, 10);
  return `cf-${hash}`;
}

export function collectSimpleReviewFindings(changedFiles: string[], workspaceDir: string): SimpleReviewFinding[] {
  const files = normalizeFiles(changedFiles);
  const findings: SimpleReviewFinding[] = [];

  for (const file of files) {
    if (!isLikelyTextFile(file)) continue;
    const abs = path.join(workspaceDir, file);
    const content = readFileSafe(abs);
    if (content == null) continue;

    let idx = 0;
    const lines = content.split('\n');
    for (const line of lines) {
      if (/[ \t]+$/.test(line)) {
        findings.push({
          id: findingId(file, 'trailing-whitespace', idx++),
          filePath: file,
          kind: 'trailing-whitespace',
          message: 'Trailing whitespace found',
          remediable: true,
        });
      }
    }
    if (content.length > 0 && !content.endsWith('\n')) {
      findings.push({
        id: findingId(file, 'missing-final-newline', idx++),
        filePath: file,
        kind: 'missing-final-newline',
        message: 'File missing trailing newline',
        remediable: true,
      });
    }
  }

  return findings;
}

function remediateContent(content: string, kinds: Set<SimpleFindingKind>): string {
  let out = content;
  if (kinds.has('console-log')) {
    out = out
      .split('\n')
      .filter((line) => !line.includes('console.log('))
      .join('\n');
  }
  if (kinds.has('trailing-whitespace')) {
    out = out.replace(/[ \t]+$/gm, '');
  }
  if (kinds.has('missing-final-newline') && out.length > 0 && !out.endsWith('\n')) {
    out = `${out}\n`;
  }
  return out;
}

export function applyAutoRemediation(findings: SimpleReviewFinding[], workspaceDir: string): AutoRemediationResult {
  const byFile = new Map<string, SimpleReviewFinding[]>();
  for (const finding of findings) {
    if (!finding.remediable) continue;
    if (!byFile.has(finding.filePath)) byFile.set(finding.filePath, []);
    byFile.get(finding.filePath)?.push(finding);
  }

  const patchedFiles: string[] = [];
  let applied = 0;
  let failed = 0;

  for (const [filePath, fileFindings] of byFile) {
    const abs = path.join(workspaceDir, filePath);
    const original = readFileSafe(abs);
    if (original == null) {
      failed += fileFindings.length;
      continue;
    }

    const kinds = new Set(fileFindings.map((finding) => finding.kind));
    const remediated = remediateContent(original, kinds);
    if (remediated !== original) {
      fs.writeFileSync(abs, remediated);
      patchedFiles.push(filePath);
    }

    for (const finding of fileFindings) {
      const fixed = (
        (finding.kind === 'console-log' && !remediated.includes('console.log('))
        || (finding.kind === 'trailing-whitespace' && !/[ \t]+$/m.test(remediated))
        || (finding.kind === 'missing-final-newline' && (remediated.endsWith('\n') || remediated.length === 0))
      );
      if (fixed) applied += 1;
      else failed += 1;
    }
  }

  const attempted = findings.filter((finding) => finding.remediable).length;
  const fixRate = attempted > 0 ? (applied / attempted) * 100 : 100;
  return {
    attempted,
    applied,
    failed,
    fixRate: Number(fixRate.toFixed(2)),
    patchedFiles: patchedFiles.sort(),
    findings,
  };
}

function readHarnessGapFile(filePath: string): HarnessGapRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as HarnessGapRecord[];
  } catch {
    return [];
  }
}

function writeHarnessGapFile(filePath: string, records: HarnessGapRecord[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
}

export function loadHarnessGaps(filePath: string): HarnessGapRecord[] {
  return readHarnessGapFile(filePath).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createHarnessGap(
  filePath: string,
  input: { incident_ref: string; sla_days?: number; test_case_added?: boolean },
  now?: () => Date,
): HarnessGapRecord {
  const nowFn = safeNow(now);
  const createdAt = nowFn().toISOString();
  const idSeed = `${input.incident_ref}:${createdAt}`;
  const id = `hg-${crypto.createHash('sha1').update(idSeed).digest('hex').slice(0, 10)}`;
  const record: HarnessGapRecord = {
    id,
    incident_ref: input.incident_ref,
    test_case_added: Boolean(input.test_case_added),
    sla_days: Math.max(1, Math.min(30, Math.floor(input.sla_days ?? 3))),
    created_at: createdAt,
    resolved_at: input.test_case_added ? createdAt : undefined,
  };
  const current = readHarnessGapFile(filePath);
  current.push(record);
  writeHarnessGapFile(filePath, current);
  return record;
}

export function updateHarnessGap(
  filePath: string,
  id: string,
  patch: { test_case_added?: boolean },
  now?: () => Date,
): HarnessGapRecord | null {
  const nowFn = safeNow(now);
  const current = readHarnessGapFile(filePath);
  const index = current.findIndex((record) => record.id === id);
  if (index < 0) return null;
  const next: HarnessGapRecord = { ...current[index] };
  if (typeof patch.test_case_added === 'boolean') {
    next.test_case_added = patch.test_case_added;
    if (patch.test_case_added) next.resolved_at = nowFn().toISOString();
    else delete next.resolved_at;
  }
  current[index] = next;
  writeHarnessGapFile(filePath, current);
  return next;
}

export function summarizeHarnessGapSla(records: HarnessGapRecord[], now?: () => Date): {
  total: number;
  open: number;
  overdue: number;
} {
  const nowFn = safeNow(now);
  const nowMs = nowFn().getTime();
  let open = 0;
  let overdue = 0;
  for (const record of records) {
    if (record.test_case_added) continue;
    open += 1;
    const createdMs = Date.parse(record.created_at);
    const deadlineMs = createdMs + record.sla_days * 24 * 60 * 60 * 1000;
    if (Number.isFinite(deadlineMs) && nowMs > deadlineMs) overdue += 1;
  }
  return {
    total: records.length,
    open,
    overdue,
  };
}
