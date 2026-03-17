import path from 'node:path';

import {
  EVIDENCE_DAILY_DIR,
  EVIDENCE_MONTHLY_DIR,
  EVIDENCE_WEEKLY_DIR,
  VENTUREOS_ROOT,
} from '../lib/paths';
import {
  buildEvidenceIndex,
  enforceEvidenceRetention,
  formatIsoWeek,
  formatLocalDate,
  formatMonth,
  generateMonthlyRollup,
  generateWeeklyRollup,
  materializeDailyEvidence,
  runPhase0Readiness,
  validateEvidence,
  resolveRetentionPolicy,
} from '../lib/evidence';

type Command = 'daily' | 'weekly' | 'monthly' | 'validate' | 'readiness' | 'index' | 'retention';

interface CliOptions {
  reportDir?: string;
  date?: string;
  isoWeek?: string;
  month?: string;
  target?: string;
  cadence?: 'daily' | 'weekly' | 'monthly';
  dailyDir?: string;
  weeklyDir?: string;
  monthlyDir?: string;
  materializeAliases?: boolean;
  localIntegrationMode?: boolean;
  hookMode?: boolean;
  syncRollups?: boolean;
  apply?: boolean;
  readinessReportDir?: string;
  dailyRetentionDays?: number;
  weeklyRetentionDays?: number;
  monthlyRetentionDays?: number;
  evidenceReportRetentionDays?: number;
  readinessReportRetentionDays?: number;
}

function usage(): never {
  console.error(`Usage:
  node -r ts-node/register scripts/evidence-cli.ts daily [--date YYYY-MM-DD] [--report-dir <path>] [--no-aliases] [--no-sync-rollups]
  node -r ts-node/register scripts/evidence-cli.ts weekly [--iso-week YYYY-Www] [--report-dir <path>]
  node -r ts-node/register scripts/evidence-cli.ts monthly [--month YYYY-MM] [--report-dir <path>]
  node -r ts-node/register scripts/evidence-cli.ts validate --cadence <daily|weekly|monthly> [--target today|latest|<id>] [--report-dir <path>]
  node -r ts-node/register scripts/evidence-cli.ts readiness [--report-dir <path>] [--local-integration-mode|--no-local-integration-mode] [--hook-mode|--no-hook-mode]
  node -r ts-node/register scripts/evidence-cli.ts index [--report-dir <path>]
  node -r ts-node/register scripts/evidence-cli.ts retention [--report-dir <path>] [--readiness-report-dir <path>] [--apply]`);
  process.exit(2);
}

function parseArgs(argv: string[]): { command: Command; options: CliOptions } {
  if (!argv.length) {
    usage();
  }
  const [command, ...rest] = argv;
  if (!['daily', 'weekly', 'monthly', 'validate', 'readiness', 'index', 'retention'].includes(command)) {
    usage();
  }

  const options: CliOptions = {
    materializeAliases: true,
    localIntegrationMode: true,
    hookMode: true,
    syncRollups: true,
    apply: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];
    switch (arg) {
      case '--report-dir':
        if (!next) usage();
        options.reportDir = next;
        index += 1;
        break;
      case '--date':
        if (!next) usage();
        options.date = next;
        index += 1;
        break;
      case '--iso-week':
        if (!next) usage();
        options.isoWeek = next;
        index += 1;
        break;
      case '--month':
        if (!next) usage();
        options.month = next;
        index += 1;
        break;
      case '--target':
        if (!next) usage();
        options.target = next;
        index += 1;
        break;
      case '--cadence':
        if (!next || !['daily', 'weekly', 'monthly'].includes(next)) usage();
        options.cadence = next as 'daily' | 'weekly' | 'monthly';
        index += 1;
        break;
      case '--daily-dir':
        if (!next) usage();
        options.dailyDir = next;
        index += 1;
        break;
      case '--weekly-dir':
        if (!next) usage();
        options.weeklyDir = next;
        index += 1;
        break;
      case '--monthly-dir':
        if (!next) usage();
        options.monthlyDir = next;
        index += 1;
        break;
      case '--no-aliases':
        options.materializeAliases = false;
        break;
      case '--local-integration-mode':
        options.localIntegrationMode = true;
        break;
      case '--no-local-integration-mode':
        options.localIntegrationMode = false;
        break;
      case '--hook-mode':
        options.hookMode = true;
        break;
      case '--no-hook-mode':
        options.hookMode = false;
        break;
      case '--no-sync-rollups':
        options.syncRollups = false;
        break;
      case '--apply':
        options.apply = true;
        break;
      case '--readiness-report-dir':
        if (!next) usage();
        options.readinessReportDir = next;
        index += 1;
        break;
      case '--daily-retention-days':
        if (!next) usage();
        options.dailyRetentionDays = Number(next);
        index += 1;
        break;
      case '--weekly-retention-days':
        if (!next) usage();
        options.weeklyRetentionDays = Number(next);
        index += 1;
        break;
      case '--monthly-retention-days':
        if (!next) usage();
        options.monthlyRetentionDays = Number(next);
        index += 1;
        break;
      case '--evidence-report-retention-days':
        if (!next) usage();
        options.evidenceReportRetentionDays = Number(next);
        index += 1;
        break;
      case '--readiness-report-retention-days':
        if (!next) usage();
        options.readinessReportRetentionDays = Number(next);
        index += 1;
        break;
      case '-h':
      case '--help':
        usage();
        break;
      default:
        console.error(`Unknown arg: ${arg}`);
        usage();
    }
  }

  return { command: command as Command, options };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const reportDir = options.reportDir ?? path.join(VENTUREOS_ROOT, 'runtime', 'reports', command === 'readiness' ? 'phase0-readiness' : 'evidence');
  const retentionPolicy = resolveRetentionPolicy({
    dailyDays: options.dailyRetentionDays,
    weeklyDays: options.weeklyRetentionDays,
    monthlyDays: options.monthlyRetentionDays,
    evidenceReportDays: options.evidenceReportRetentionDays,
    readinessReportDays: options.readinessReportRetentionDays,
  });

  if (command === 'daily') {
    const date = options.date ?? formatLocalDate();
    const result = await materializeDailyEvidence({
      date,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      materializeAliases: options.materializeAliases,
    });
    const targetDate = new Date(`${date}T12:00:00Z`);
    const weeklyTarget = formatIsoWeek(targetDate);
    const monthlyTarget = formatMonth(targetDate);
    let weeklyRollupPath = 'n/a';
    let monthlyRollupPath = 'n/a';
    if (result.status === 'pass' && options.syncRollups !== false) {
      const weeklyGenerated = await generateWeeklyRollup({
        isoWeek: weeklyTarget,
        dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
        weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      });
      const monthlyGenerated = await generateMonthlyRollup({
        month: monthlyTarget,
        dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
        monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      });
      weeklyRollupPath = weeklyGenerated.kpiRollupPath;
      monthlyRollupPath = monthlyGenerated.spendRollupPath;
    }
    const evidenceIndex = await buildEvidenceIndex({
      reportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    const retention = await enforceEvidenceRetention({
      reportDir,
      readinessReportDir: options.readinessReportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      apply: options.apply,
      policy: retentionPolicy,
    });
    console.log(`EVIDENCE_DAILY_STATUS=${result.status.toUpperCase()}`);
    console.log(`EVIDENCE_DAILY_DATE=${result.target}`);
    console.log(`EVIDENCE_DAILY_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_DAILY_MD=${result.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_DAILY_WEEKLY_ROLLUP=${weeklyRollupPath}`);
    console.log(`EVIDENCE_DAILY_MONTHLY_ROLLUP=${monthlyRollupPath}`);
    console.log(`EVIDENCE_INDEX_JSON=${evidenceIndex.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_INDEX_MD=${evidenceIndex.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_JSON=${retention.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_MD=${retention.reportMarkdown ?? 'n/a'}`);
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return;
  }

  if (command === 'weekly') {
    const isoWeek = options.isoWeek ?? formatIsoWeek();
    const generated = await generateWeeklyRollup({
      isoWeek,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
    });
    const result = await validateEvidence({
      cadence: 'weekly',
      target: isoWeek,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      reportDir,
    });
    const evidenceIndex = await buildEvidenceIndex({
      reportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    const retention = await enforceEvidenceRetention({
      reportDir,
      readinessReportDir: options.readinessReportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      apply: options.apply,
      policy: retentionPolicy,
    });
    console.log(`EVIDENCE_WEEKLY_STATUS=${result.status.toUpperCase()}`);
    console.log(`EVIDENCE_WEEKLY_TARGET=${result.target}`);
    console.log(`EVIDENCE_WEEKLY_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_WEEKLY_MD=${result.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_WEEKLY_KPI_ROLLUP=${generated.kpiRollupPath}`);
    console.log(`EVIDENCE_INDEX_JSON=${evidenceIndex.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_INDEX_MD=${evidenceIndex.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_JSON=${retention.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_MD=${retention.reportMarkdown ?? 'n/a'}`);
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return;
  }

  if (command === 'monthly') {
    const month = options.month ?? formatMonth();
    const generated = await generateMonthlyRollup({
      month,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    const result = await validateEvidence({
      cadence: 'monthly',
      target: month,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      reportDir,
    });
    const evidenceIndex = await buildEvidenceIndex({
      reportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    const retention = await enforceEvidenceRetention({
      reportDir,
      readinessReportDir: options.readinessReportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      apply: options.apply,
      policy: retentionPolicy,
    });
    console.log(`EVIDENCE_MONTHLY_STATUS=${result.status.toUpperCase()}`);
    console.log(`EVIDENCE_MONTHLY_TARGET=${result.target}`);
    console.log(`EVIDENCE_MONTHLY_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_MONTHLY_MD=${result.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_MONTHLY_SPEND_ROLLUP=${generated.spendRollupPath}`);
    console.log(`EVIDENCE_INDEX_JSON=${evidenceIndex.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_INDEX_MD=${evidenceIndex.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_JSON=${retention.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_MD=${retention.reportMarkdown ?? 'n/a'}`);
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return;
  }

  if (command === 'validate') {
    if (!options.cadence) {
      usage();
    }
    const result = await validateEvidence({
      cadence: options.cadence,
      target: options.target ?? 'today',
      reportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    console.log(`EVIDENCE_VALIDATE_STATUS=${result.status.toUpperCase()}`);
    console.log(`EVIDENCE_VALIDATE_CADENCE=${result.cadence}`);
    console.log(`EVIDENCE_VALIDATE_TARGET=${result.target}`);
    console.log(`EVIDENCE_VALIDATE_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_VALIDATE_MD=${result.reportMarkdown ?? 'n/a'}`);
    if (result.status !== 'pass') {
      process.exit(1);
    }
    return;
  }

  if (command === 'index') {
    const result = await buildEvidenceIndex({
      reportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
    });
    console.log(`EVIDENCE_INDEX_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_INDEX_MD=${result.reportMarkdown ?? 'n/a'}`);
    return;
  }

  if (command === 'retention') {
    const result = await enforceEvidenceRetention({
      reportDir,
      readinessReportDir: options.readinessReportDir,
      dailyDir: options.dailyDir ?? EVIDENCE_DAILY_DIR,
      weeklyDir: options.weeklyDir ?? EVIDENCE_WEEKLY_DIR,
      monthlyDir: options.monthlyDir ?? EVIDENCE_MONTHLY_DIR,
      apply: options.apply,
      policy: retentionPolicy,
    });
    console.log(`EVIDENCE_RETENTION_MODE=${result.apply ? 'APPLY' : 'PREVIEW'}`);
    console.log(`EVIDENCE_RETENTION_JSON=${result.reportJson ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_MD=${result.reportMarkdown ?? 'n/a'}`);
    console.log(`EVIDENCE_RETENTION_PRUNED=${result.pruned.length}`);
    return;
  }

  const readiness = await runPhase0Readiness({
    reportDir,
    localIntegrationMode: options.localIntegrationMode,
    hookMode: options.hookMode,
  });
  console.log(`PHASE0_READINESS_STATUS=${readiness.status.toUpperCase()}`);
  console.log(`PHASE0_READINESS_JSON=${readiness.reportJson ?? 'n/a'}`);
  console.log(`PHASE0_READINESS_MD=${readiness.reportMarkdown ?? 'n/a'}`);
  if (readiness.status !== 'pass') {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
