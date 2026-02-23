import fs from 'node:fs';
import path from 'node:path';
import {
  loadRiskPolicy,
  analyzeRiskTier,
  buildPreflightEvidence,
  validateEvidenceSha,
  collectSimpleReviewFindings,
  applyAutoRemediation,
  createHarnessGap,
  loadHarnessGaps,
  updateHarnessGap,
  summarizeHarnessGapSla,
  type RiskPolicyContract,
} from '../code-factory';

const tmpRoot = path.join('/tmp', `code-factory-test-${process.pid}`);

function fixedNow(): Date {
  return new Date('2026-02-21T12:00:00.000Z');
}

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('code-factory policy + preflight', () => {
  it('loads risk policy contract from repo file', () => {
    const policyPath = path.join(process.cwd(), '.github', 'code-factory', 'risk-policy.json');
    const policy = loadRiskPolicy(policyPath);
    expect(policy.version).toBeTruthy();
    expect(policy.required_checks.high.length).toBeGreaterThan(0);
  });

  it('assigns highest risk tier from changed files', () => {
    const policy: RiskPolicyContract = loadRiskPolicy(
      path.join(process.cwd(), '.github', 'code-factory', 'risk-policy.json'),
    );
    const high = analyzeRiskTier(['lib/model-router.ts', 'docs/readme.md'], policy);
    const medium = analyzeRiskTier(['docs/notes.md'], policy);
    const low = analyzeRiskTier(['README.md'], policy);

    expect(high.riskTier).toBe('high');
    expect(medium.riskTier).toBe('medium');
    expect(low.riskTier).toBe('low');
  });

  it('builds SHA-bound preflight evidence', () => {
    const policy: RiskPolicyContract = loadRiskPolicy(
      path.join(process.cwd(), '.github', 'code-factory', 'risk-policy.json'),
    );
    const analysis = analyzeRiskTier(['dashboard/client/index.html'], policy);
    const evidence = buildPreflightEvidence({
      prNumber: 123,
      headSha: 'abc123',
      analysis,
      now: fixedNow,
    });

    expect(evidence.pr_number).toBe(123);
    expect(evidence.risk_tier).toBeDefined();
    expect(evidence.required_checks.length).toBeGreaterThan(0);
    expect(validateEvidenceSha(evidence, 'abc123')).toBe(true);
    expect(validateEvidenceSha(evidence, 'def456')).toBe(false);
  });
});

describe('code-factory auto-remediation', () => {
  it('auto-fixes simple findings with >=60% fix rate', () => {
    const workspaceDir = path.join(tmpRoot, 'workspace');
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
    const filePath = path.join(workspaceDir, 'src', 'sample.ts');
    fs.writeFileSync(
      filePath,
      [
        'export function run() {  ',
        '  const debug = "console.log(debug)";',
        '  return 1;  ',
        '}',
      ].join('\n'), // no trailing newline + trailing spaces + console.log
    );

    const findings = collectSimpleReviewFindings(['src/sample.ts'], workspaceDir);
    expect(findings.length).toBeGreaterThan(0);

    const result = applyAutoRemediation(findings, workspaceDir);
    expect(result.attempted).toBeGreaterThan(0);
    expect(result.fixRate).toBeGreaterThanOrEqual(60);

    const next = fs.readFileSync(filePath, 'utf8');
    expect(next.includes('console.log(debug)')).toBe(true);
    expect(next.endsWith('\n')).toBe(true);
    expect(/[ \t]+$/m.test(next)).toBe(false);
  });
});

describe('harness-gap tracker', () => {
  it('creates, updates, and summarizes harness gaps', () => {
    const filePath = path.join(tmpRoot, 'data', 'harness-gaps.json');

    const gap = createHarnessGap(filePath, { incident_ref: 'INC-123', sla_days: 3 }, fixedNow);
    expect(gap.id).toBeTruthy();
    expect(gap.test_case_added).toBe(false);

    const loaded = loadHarnessGaps(filePath);
    expect(loaded).toHaveLength(1);

    const updated = updateHarnessGap(filePath, gap.id, { test_case_added: true }, fixedNow);
    expect(updated?.test_case_added).toBe(true);

    const summary = summarizeHarnessGapSla(loadHarnessGaps(filePath), fixedNow);
    expect(summary.total).toBe(1);
    expect(summary.open).toBe(0);
  });
});
