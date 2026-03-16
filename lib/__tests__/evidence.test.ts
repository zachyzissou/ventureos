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
    await rewriteJsonFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt);

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
    await rewriteJsonFixture(path.join(dailyDir, `${date}-handoff-ledger.json`), date, capturedAt);

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
});
