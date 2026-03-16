import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');

async function copyFixture(srcRelative: string, destPath: string): Promise<void> {
  const source = path.join(repoRoot, srcRelative);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(source, destPath);
}

async function rewriteJsonFixture(destPath: string, date: string, capturedAt: string): Promise<void> {
  const payload = JSON.parse(await fs.readFile(destPath, 'utf-8')) as Record<string, unknown>;
  payload.date = date;
  payload.captured_at = capturedAt;
  await fs.writeFile(destPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

type HandoffFixtureMode = 'all-on-time' | 'late-missing-breach-fields' | 'exception-approved' | 'legacy-status-only';

function buildHandoffSummary(handoffs: Array<Record<string, unknown>>): Record<string, number> {
  const complianceValues = handoffs.map((handoff) => {
    const compliance = handoff.compliance_status ?? handoff.sla_status;
    return typeof compliance === 'string' ? compliance : 'late';
  });
  const totalHandoffs = handoffs.length;
  const onTimeHandoffs = complianceValues.filter((value) => value === 'on_time').length;
  const lateHandoffs = complianceValues.filter((value) => value === 'late').length;
  const exceptionHandoffs = complianceValues.filter((value) => value === 'exception').length;
  const level1Breaches = handoffs.filter((handoff) => handoff.breach_level === 'level_1').length;
  const level2Breaches = handoffs.filter((handoff) => handoff.breach_level === 'level_2').length;
  const level3Breaches = handoffs.filter((handoff) => handoff.breach_level === 'level_3').length;
  return {
    total_handoffs: totalHandoffs,
    on_time_handoffs: onTimeHandoffs,
    late_handoffs: lateHandoffs,
    exception_handoffs: exceptionHandoffs,
    on_time_rate: Number((onTimeHandoffs / totalHandoffs).toFixed(4)),
    level_1_breaches: level1Breaches,
    level_2_breaches: level2Breaches,
    level_3_breaches: level3Breaches,
  };
}

async function rewriteHandoffFixture(
  destPath: string,
  date: string,
  capturedAt: string,
  mode: HandoffFixtureMode,
): Promise<void> {
  const payload = JSON.parse(await fs.readFile(destPath, 'utf-8')) as Record<string, unknown>;
  payload.date = date;
  payload.captured_at = capturedAt;
  const handoffs = Array.isArray(payload.handoffs) ? payload.handoffs as Array<Record<string, unknown>> : [];

  for (const handoff of handoffs) {
    if (mode === 'all-on-time') {
      handoff.compliance_status = 'on_time';
      handoff.sla_status = 'on_time';
      delete handoff.breach_level;
      delete handoff.breach_owner;
      delete handoff.breach_action;
      delete handoff.exception_approved_by;
      delete handoff.exception_expires_at;
      if (handoff.handoff_id === 'h-003') {
        handoff.sla_target_minutes = 240;
        handoff.latency_minutes = 190;
      }
    }

    if (mode === 'late-missing-breach-fields' && handoff.handoff_id === 'h-003') {
      handoff.compliance_status = 'late';
      handoff.sla_status = 'late';
      handoff.sla_target_minutes = 60;
      handoff.latency_minutes = 190;
      delete handoff.breach_level;
      delete handoff.breach_owner;
      delete handoff.breach_action;
      delete handoff.exception_approved_by;
      delete handoff.exception_expires_at;
    }

    if (mode === 'exception-approved' && handoff.handoff_id === 'h-003') {
      handoff.compliance_status = 'exception';
      handoff.sla_status = 'exception';
      handoff.breach_level = 'level_3';
      handoff.exception_approved_by = 'executive_office:director';
      handoff.exception_expires_at = '2026-03-17T12:00:00Z';
      handoff.breach_owner = 'executive_office:director';
      handoff.breach_action = 'Defer downstream closeout until the approved exception window expires.';
    }

    if (mode === 'legacy-status-only') {
      delete handoff.compliance_status;
      if (handoff.handoff_id === 'h-003') {
        handoff.sla_status = 'late';
        handoff.breach_owner = 'finance:director';
        handoff.breach_action = 'Escalate manual reconciliation coverage and republish before closeout.';
      } else {
        handoff.sla_status = 'on_time';
        delete handoff.breach_owner;
        delete handoff.breach_action;
      }
      delete handoff.breach_level;
      delete handoff.exception_approved_by;
      delete handoff.exception_expires_at;
      delete handoff.producer_binding_id;
      delete handoff.consumer_binding_id;
      delete handoff.producer_capability_id;
      delete handoff.consumer_capability_id;
      delete handoff.producer_specialist_id;
      delete handoff.consumer_specialist_id;
      delete handoff.sla_target_minutes;
      delete handoff.latency_minutes;
    }
  }

  if (mode === 'legacy-status-only') {
    payload.summary = {
      total_handoffs: handoffs.length,
      on_time: handoffs.filter((handoff) => handoff.sla_status === 'on_time').length,
      late: handoffs.filter((handoff) => handoff.sla_status === 'late').length,
      on_time_rate: Number((handoffs.filter((handoff) => handoff.sla_status === 'on_time').length / handoffs.length).toFixed(4)),
    };
  } else {
    payload.summary = buildHandoffSummary(handoffs);
  }

  await fs.writeFile(destPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

describe('lib/evidence', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('validates a daily evidence bundle and refreshes compatibility aliases', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-evidence-'));
    const dailyDir = path.join(tmpDir, 'daily');
    const weeklyDir = path.join(tmpDir, 'weekly');
    const monthlyDir = path.join(tmpDir, 'monthly');
    const reportDir = path.join(tmpDir, 'reports');
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.mkdir(weeklyDir, { recursive: true });
    await fs.mkdir(monthlyDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;
    process.env.VENTUREOS_EVIDENCE_WEEKLY_DIR = weeklyDir;
    process.env.VENTUREOS_EVIDENCE_MONTHLY_DIR = monthlyDir;

    const date = '2026-03-16';
    const capturedAt = '2026-03-16T08:00:00Z';
    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, `${date}-agent-health.json`));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, `${date}-spend.json`));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, `${date}-kpi-snapshot.json`));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, `${date}-handoff-ledger.json`));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, `${date}-decision-log.md`));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, `${date}-go-no-go.md`));
    await rewriteJsonFixture(path.join(dailyDir, `${date}-agent-health.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-spend.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-kpi-snapshot.json`), date, capturedAt);
    await rewriteHandoffFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt, 'all-on-time');

    const evidence = require('../evidence') as typeof import('../evidence');
    const result = await evidence.materializeDailyEvidence({
      date,
      dailyDir,
    });

    expect(result.status).toBe('pass');
    expect(result.artifacts.every((artifact) => artifact.valid)).toBe(true);
    expect(await fs.readFile(path.join(dailyDir, 'agent-health.json'), 'utf-8')).toContain('captured_at');

    const weeklyTarget = evidence.formatIsoWeek(new Date('2026-03-16T12:00:00Z'));
    await evidence.generateWeeklyRollup({ isoWeek: weeklyTarget, dailyDir, weeklyDir });
    const weeklyValidation = await evidence.validateEvidence({
      cadence: 'weekly',
      target: weeklyTarget,
      weeklyDir,
      reportDir,
      now: new Date('2026-03-13T12:00:00Z'),
    });
    expect(weeklyValidation.status).toBe('pass');

    const monthlyTarget = '2026-03';
    await evidence.generateMonthlyRollup({ month: monthlyTarget, dailyDir, monthlyDir });
    const monthlyValidation = await evidence.validateEvidence({
      cadence: 'monthly',
      target: monthlyTarget,
      monthlyDir,
      reportDir,
      now: new Date('2026-03-13T12:00:00Z'),
    });
    expect(monthlyValidation.status).toBe('pass');
  });

  it('fails readiness when required evidence is stale', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-readiness-'));
    const dailyDir = path.join(tmpDir, 'daily');
    const weeklyDir = path.join(tmpDir, 'weekly');
    const monthlyDir = path.join(tmpDir, 'monthly');
    const logDir = path.join(tmpDir, 'git-hooks');
    const reportDir = path.join(tmpDir, 'reports');
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.mkdir(weeklyDir, { recursive: true });
    await fs.mkdir(monthlyDir, { recursive: true });
    await fs.mkdir(logDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;
    process.env.VENTUREOS_EVIDENCE_WEEKLY_DIR = weeklyDir;
    process.env.VENTUREOS_EVIDENCE_MONTHLY_DIR = monthlyDir;

    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, '2026-03-12-agent-health.json'));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, '2026-03-12-spend.json'));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, '2026-03-12-kpi-snapshot.json'));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, '2026-03-12-handoff-ledger.json'));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, '2026-03-12-decision-log.md'));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, '2026-03-12-go-no-go.md'));

    const evidence = require('../evidence') as typeof import('../evidence');
    const weeklyTarget = evidence.formatIsoWeek(new Date('2026-03-12T12:00:00Z'));
    await evidence.generateWeeklyRollup({ isoWeek: weeklyTarget, dailyDir, weeklyDir });

    const architectureDocPath = path.join(tmpDir, 'VentureOS_Department_Architecture_v1.md');
    const checklistPath = path.join(tmpDir, 'LOCAL_INTEGRATION_CHECKLIST.md');
    const localReadyJson = path.join(tmpDir, 'openclaw-local-ready-latest.json');
    const cadenceJson = path.join(tmpDir, 'post-merge-cadence-latest.json');
    const hookLog = path.join(logDir, 'post-merge-cadence-20260316T000000Z.log');

    await fs.writeFile(architectureDocPath, '# architecture\n', 'utf-8');
    await fs.writeFile(checklistPath, '# checklist\n', 'utf-8');
    await fs.writeFile(localReadyJson, JSON.stringify({ status: 'ok', generatedAt: '2026-03-16T08:00:00Z' }), 'utf-8');
    await fs.writeFile(cadenceJson, JSON.stringify({ generatedAtUtc: '2026-03-16T08:00:00Z' }), 'utf-8');
    await fs.writeFile(hookLog, 'hook ok\n', 'utf-8');

    const readiness = await evidence.runPhase0Readiness({
      reportDir,
      now: new Date('2026-03-16T12:00:00Z'),
      architectureDocPath,
      localChecklistPath: checklistPath,
      localReadyStatusJson: localReadyJson,
      postMergeCadenceJson: cadenceJson,
      hookLogDir: logDir,
    });
    expect(readiness.status).toBe('fail');
    expect(readiness.failingGates).toContain('daily-evidence');
  });

  it('validates periodic artifacts from the caller-provided directories', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-weekly-dir-'));
    const dailyDir = path.join(tmpDir, 'daily');
    const weeklyDir = path.join(tmpDir, 'weekly-custom');
    const envWeeklyDir = path.join(tmpDir, 'weekly-env');
    const monthlyDir = path.join(tmpDir, 'monthly-custom');
    const envMonthlyDir = path.join(tmpDir, 'monthly-env');
    const reportDir = path.join(tmpDir, 'reports');
    await fs.mkdir(dailyDir, { recursive: true });
    await fs.mkdir(weeklyDir, { recursive: true });
    await fs.mkdir(envWeeklyDir, { recursive: true });
    await fs.mkdir(monthlyDir, { recursive: true });
    await fs.mkdir(envMonthlyDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;
    process.env.VENTUREOS_EVIDENCE_WEEKLY_DIR = envWeeklyDir;
    process.env.VENTUREOS_EVIDENCE_MONTHLY_DIR = envMonthlyDir;

    const date = '2026-03-16';
    const capturedAt = '2026-03-16T08:00:00Z';
    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, `${date}-agent-health.json`));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, `${date}-spend.json`));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, `${date}-kpi-snapshot.json`));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, `${date}-handoff-ledger.json`));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, `${date}-decision-log.md`));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, `${date}-go-no-go.md`));
    await rewriteJsonFixture(path.join(dailyDir, `${date}-agent-health.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-spend.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-kpi-snapshot.json`), date, capturedAt);
    await rewriteHandoffFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt, 'all-on-time');

    const evidence = require('../evidence') as typeof import('../evidence');
    const isoWeek = evidence.formatIsoWeek(new Date('2026-03-16T12:00:00Z'));
    await evidence.generateWeeklyRollup({ isoWeek, dailyDir, weeklyDir });

    const result = await evidence.validateEvidence({
      cadence: 'weekly',
      target: isoWeek,
      weeklyDir,
      reportDir,
      now: new Date('2026-03-16T12:00:00Z'),
    });

    expect(result.status).toBe('pass');
    expect(result.artifacts.every((artifact) => artifact.path.startsWith(weeklyDir))).toBe(true);

    const month = '2026-03';
    await evidence.generateMonthlyRollup({ month, dailyDir, monthlyDir });

    const monthlyResult = await evidence.validateEvidence({
      cadence: 'monthly',
      target: month,
      monthlyDir,
      reportDir,
      now: new Date('2026-03-16T12:00:00Z'),
    });

    expect(monthlyResult.status).toBe('pass');
    expect(monthlyResult.artifacts.every((artifact) => artifact.path.startsWith(monthlyDir))).toBe(true);
  });

  it('fails current-date validation when a late handoff is missing breach routing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-handoff-fail-'));
    const dailyDir = path.join(tmpDir, 'daily');
    await fs.mkdir(dailyDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;

    const date = '2026-03-16';
    const capturedAt = '2026-03-16T08:00:00Z';
    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, `${date}-agent-health.json`));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, `${date}-spend.json`));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, `${date}-kpi-snapshot.json`));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, `${date}-handoff-ledger.json`));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, `${date}-decision-log.md`));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, `${date}-go-no-go.md`));
    await rewriteJsonFixture(path.join(dailyDir, `${date}-agent-health.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-spend.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-kpi-snapshot.json`), date, capturedAt);
    await rewriteHandoffFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt, 'late-missing-breach-fields');

    const evidence = require('../evidence') as typeof import('../evidence');
    const result = await evidence.validateEvidence({
      cadence: 'daily',
      target: date,
      dailyDir,
      now: new Date('2026-03-16T12:00:00Z'),
      writeReport: false,
    });

    expect(result.status).toBe('fail');
    expect(result.failures.some((failure) => failure.includes('missing breach_owner'))).toBe(true);
    expect(result.failures.some((failure) => failure.includes('missing breach_action'))).toBe(true);
  });

  it('accepts legacy handoff ledgers in compatibility mode', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-handoff-legacy-'));
    const dailyDir = path.join(tmpDir, 'daily');
    await fs.mkdir(dailyDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;

    const date = '2026-03-12';
    const capturedAt = '2026-03-12T08:00:00Z';
    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, `${date}-agent-health.json`));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, `${date}-spend.json`));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, `${date}-kpi-snapshot.json`));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, `${date}-handoff-ledger.json`));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, `${date}-decision-log.md`));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, `${date}-go-no-go.md`));
    await rewriteJsonFixture(path.join(dailyDir, `${date}-agent-health.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-spend.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-kpi-snapshot.json`), date, capturedAt);
    await rewriteHandoffFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt, 'legacy-status-only');

    const evidence = require('../evidence') as typeof import('../evidence');
    const result = await evidence.validateEvidence({
      cadence: 'daily',
      target: date,
      dailyDir,
      now: new Date('2026-03-16T12:00:00Z'),
      writeReport: false,
    });

    expect(result.status).toBe('pass');
    expect(result.artifacts.find((artifact) => artifact.kind === 'handoff_ledger')?.valid).toBe(true);
  });

  it('accepts current-date exception-approved handoffs', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ventureos-handoff-exception-'));
    const dailyDir = path.join(tmpDir, 'daily');
    await fs.mkdir(dailyDir, { recursive: true });

    process.env.VENTUREOS_ROOT = repoRoot;
    process.env.VENTUREOS_EVIDENCE_DAILY_DIR = dailyDir;

    const date = '2026-03-16';
    const capturedAt = '2026-03-16T08:00:00Z';
    await copyFixture('runtime/logs/daily/agent-health.json', path.join(dailyDir, `${date}-agent-health.json`));
    await copyFixture('runtime/logs/daily/spend.json', path.join(dailyDir, `${date}-spend.json`));
    await copyFixture('runtime/logs/daily/kpi-snapshot.json', path.join(dailyDir, `${date}-kpi-snapshot.json`));
    await copyFixture('runtime/logs/daily/handoff-ledger.json', path.join(dailyDir, `${date}-handoff-ledger.json`));
    await copyFixture('runtime/logs/daily/decision-log.md', path.join(dailyDir, `${date}-decision-log.md`));
    await copyFixture('runtime/logs/daily/day1-go-no-go.md', path.join(dailyDir, `${date}-go-no-go.md`));
    await rewriteJsonFixture(path.join(dailyDir, `${date}-agent-health.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-spend.json`), date, capturedAt);
    await rewriteJsonFixture(path.join(dailyDir, `${date}-kpi-snapshot.json`), date, capturedAt);
    await rewriteHandoffFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt, 'exception-approved');

    const evidence = require('../evidence') as typeof import('../evidence');
    const result = await evidence.validateEvidence({
      cadence: 'daily',
      target: date,
      dailyDir,
      now: new Date('2026-03-16T12:00:00Z'),
      writeReport: false,
    });

    expect(result.status).toBe('pass');
    expect(result.warnings.some((warning) => warning.includes('level_3'))).toBe(false);
  });
});
