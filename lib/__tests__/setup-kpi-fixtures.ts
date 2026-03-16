import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

type FormulaType = 'ratio' | 'count' | 'percentage' | 'average';
type Direction = 'higher_is_better' | 'lower_is_better';

interface FixtureFormula {
  type: FormulaType;
  numerator?: string;
  denominator?: string;
  field?: string;
  scale?: number;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count';
}

interface FixtureKpiSpec {
  id: string;
  agent: string;
  category: string;
  name: string;
  description: string;
  stakeholder: string;
  formula: FixtureFormula;
  direction?: Direction;
  sourceTable?: 'performance_stats' | 'interaction_logs';
}

const FIXTURE_ROOT_ENV = 'VENTUREOS_TEST_FIXTURE_ROOT';

function highThresholds(direction: Direction = 'higher_is_better') {
  if (direction === 'lower_is_better') {
    return {
      excellent: 5,
      good: 15,
      acceptable: 30,
      poor: 60,
      direction,
    };
  }
  return {
    excellent: 0.95,
    good: 0.85,
    acceptable: 0.7,
    poor: 0.5,
    direction,
  };
}

function buildKpiDefinition(spec: FixtureKpiSpec) {
  let sourceField = spec.formula.field ?? '*';
  if (spec.formula.type === 'ratio' || spec.formula.type === 'percentage') {
    sourceField = `${spec.formula.numerator}, ${spec.formula.denominator}`;
  } else if (spec.formula.type === 'average' && spec.formula.field) {
    sourceField = `AVG(${spec.formula.field}) AS ${spec.formula.field}`;
  }

  return {
    kpi_id: spec.id,
    agent_id: spec.agent,
    category: spec.category,
    name: spec.name,
    description: spec.description,
    stakeholder_description: spec.stakeholder,
    formula: spec.formula,
    data_sources: [
      {
        table: spec.sourceTable ?? 'performance_stats',
        field: sourceField,
      },
    ],
    thresholds: highThresholds(spec.direction),
    visualization: {
      dashboard_section: `${spec.agent}-overview`,
      chart_type: 'number',
      update_frequency: 'daily',
    },
    audit_trail: {
      created: '2026-02-01T00:00:00.000Z',
      last_modified: '2026-02-01T00:00:00.000Z',
      change_log: [
        {
          date: '2026-02-01',
          description: 'Fixture seed for automated tests',
          modified_by: 'test-harness',
        },
      ],
    },
  };
}

function fixtureSpecs(): FixtureKpiSpec[] {
  return [
    {
      id: 'oracle_citation_accuracy',
      agent: 'oracle',
      category: 'quality',
      name: 'Citation Accuracy',
      description: 'Claims backed by citations',
      stakeholder: 'How often research claims are source-backed',
      formula: {
        type: 'ratio',
        numerator: 'claims_with_citations',
        denominator: 'total_claims',
        scale: 100,
      },
    },
    {
      id: 'oracle_knowledge_gap_detection',
      agent: 'oracle',
      category: 'impact',
      name: 'Knowledge Gap Detection',
      description: 'Unresolved research gaps found',
      stakeholder: 'Gaps identified before downstream execution',
      formula: { type: 'count', field: 'knowledge_gaps_detected' },
    },
    {
      id: 'oracle_cross_domain_connections',
      agent: 'oracle',
      category: 'collaboration',
      name: 'Cross-Domain Connections',
      description: 'Cross-domain link count',
      stakeholder: 'Cross-functional insight creation',
      formula: { type: 'count', field: 'cross_domain_links' },
    },
    {
      id: 'oracle_research_depth',
      agent: 'oracle',
      category: 'quality',
      name: 'Research Depth',
      description: 'Average sources per output',
      stakeholder: 'Depth of supporting evidence',
      formula: { type: 'average', field: 'source_count', aggregation: 'avg' },
    },
    {
      id: 'atlas_pylon_uptime',
      agent: 'atlas',
      category: 'reliability',
      name: 'Network Uptime',
      description: 'Infrastructure uptime',
      stakeholder: 'Service availability ratio',
      formula: {
        type: 'percentage',
        numerator: 'pylon_uptime_minutes',
        denominator: 'total_minutes',
        scale: 100,
      },
    },
    {
      id: 'atlas_deployment_success',
      agent: 'atlas',
      category: 'reliability',
      name: 'Deployment Success',
      description: 'Successful deployments ratio',
      stakeholder: 'Stable production rollout success',
      formula: {
        type: 'ratio',
        numerator: 'deploy_successes',
        denominator: 'deploy_attempts',
        scale: 100,
      },
    },
    {
      id: 'atlas_mttr',
      agent: 'atlas',
      category: 'performance',
      name: 'Mean Time to Recovery',
      description: 'Average incident recovery time',
      stakeholder: 'Time to restore normal operations',
      formula: { type: 'average', field: 'mttr_minutes', aggregation: 'avg' },
      direction: 'lower_is_better',
    },
    {
      id: 'atlas_infra_throughput',
      agent: 'atlas',
      category: 'performance',
      name: 'Infrastructure Throughput',
      description: 'Infrastructure event throughput',
      stakeholder: 'Volume of infrastructure events processed',
      formula: { type: 'count', field: 'infra_events_processed' },
    },
    {
      id: 'sentinel_escalation_signal_ratio',
      agent: 'sentinel',
      category: 'security',
      name: 'Escalation Signal Ratio',
      description: 'Escalations with actionable signal',
      stakeholder: 'Signal quality of escalations',
      formula: {
        type: 'ratio',
        numerator: 'escalations_with_signal',
        denominator: 'total_escalations',
        scale: 100,
      },
    },
    {
      id: 'sentinel_false_positive_rate',
      agent: 'sentinel',
      category: 'security',
      name: 'False Positive Rate',
      description: 'False positive alert ratio',
      stakeholder: 'Noise level in security alerts',
      formula: {
        type: 'ratio',
        numerator: 'false_positives',
        denominator: 'total_alerts',
        scale: 100,
      },
      direction: 'lower_is_better',
    },
    {
      id: 'sentinel_response_latency',
      agent: 'sentinel',
      category: 'performance',
      name: 'Response Latency',
      description: 'Average response latency',
      stakeholder: 'Incident response speed',
      formula: { type: 'average', field: 'duration_ms', aggregation: 'avg' },
      direction: 'lower_is_better',
      sourceTable: 'interaction_logs',
    },
    {
      id: 'verifier_test_pass_rate',
      agent: 'verifier',
      category: 'quality',
      name: 'Test Pass Rate',
      description: 'Passed tests ratio',
      stakeholder: 'Overall verification quality',
      formula: {
        type: 'ratio',
        numerator: 'test_passed',
        denominator: 'total_tests',
        scale: 100,
      },
    },
    {
      id: 'verifier_regression_escape_rate',
      agent: 'verifier',
      category: 'reliability',
      name: 'Regression Escape Rate',
      description: 'Regressions per release',
      stakeholder: 'Regression leakage into production',
      formula: {
        type: 'ratio',
        numerator: 'regressions',
        denominator: 'total_releases',
        scale: 100,
      },
      direction: 'lower_is_better',
    },
    {
      id: 'verifier_review_turnaround',
      agent: 'verifier',
      category: 'performance',
      name: 'Review Turnaround',
      description: 'Average code review turnaround time',
      stakeholder: 'Validation cycle speed',
      formula: { type: 'average', field: 'review_turnaround_minutes', aggregation: 'avg' },
      direction: 'lower_is_better',
    },
    {
      id: 'archivist_memory_recall_accuracy',
      agent: 'archivist',
      category: 'quality',
      name: 'Memory Recall Accuracy',
      description: 'Successful recall ratio',
      stakeholder: 'Reliability of historical memory recall',
      formula: {
        type: 'ratio',
        numerator: 'memory_hits',
        denominator: 'memory_queries',
        scale: 100,
      },
    },
    {
      id: 'archivist_archive_coverage',
      agent: 'archivist',
      category: 'impact',
      name: 'Archive Coverage',
      description: 'Archived documents coverage ratio',
      stakeholder: 'Breadth of archived mission intelligence',
      formula: {
        type: 'ratio',
        numerator: 'archive_docs',
        denominator: 'total_docs',
        scale: 100,
      },
    },
    {
      id: 'archivist_retrieval_latency',
      agent: 'archivist',
      category: 'performance',
      name: 'Retrieval Latency',
      description: 'Average archive retrieval latency',
      stakeholder: 'Memory retrieval speed',
      formula: { type: 'average', field: 'retrieval_ms', aggregation: 'avg' },
      direction: 'lower_is_better',
    },
    {
      id: 'synth_content_velocity',
      agent: 'synth',
      category: 'performance',
      name: 'Content Velocity',
      description: 'Delivered content velocity ratio',
      stakeholder: 'Creative output speed versus plan',
      formula: {
        type: 'ratio',
        numerator: 'content_items',
        denominator: 'planned_items',
        scale: 100,
      },
    },
    {
      id: 'synth_asset_reuse_ratio',
      agent: 'synth',
      category: 'impact',
      name: 'Asset Reuse Ratio',
      description: 'Reusable assets ratio',
      stakeholder: 'Efficiency from content reuse',
      formula: {
        type: 'ratio',
        numerator: 'assets_reused',
        denominator: 'total_assets',
        scale: 100,
      },
    },
    {
      id: 'synth_quality_acceptance',
      agent: 'synth',
      category: 'quality',
      name: 'Quality Acceptance',
      description: 'Accepted outputs ratio',
      stakeholder: 'Creative quality acceptance rate',
      formula: {
        type: 'ratio',
        numerator: 'accepted_outputs',
        denominator: 'total_outputs',
        scale: 100,
      },
    },
    {
      id: 'echo_decision_alignment',
      agent: 'echo',
      category: 'collaboration',
      name: 'Decision Alignment',
      description: 'Cross-team decision alignment ratio',
      stakeholder: 'Alignment quality across teams',
      formula: {
        type: 'ratio',
        numerator: 'decision_alignments',
        denominator: 'total_decisions',
        scale: 100,
      },
    },
    {
      id: 'echo_escalation_resolution_time',
      agent: 'echo',
      category: 'reliability',
      name: 'Escalation Resolution Time',
      description: 'Average escalation resolution time',
      stakeholder: 'How quickly escalations are resolved',
      formula: { type: 'average', field: 'resolution_minutes', aggregation: 'avg' },
      direction: 'lower_is_better',
    },
    {
      id: 'echo_cross_team_sync',
      agent: 'echo',
      category: 'collaboration',
      name: 'Cross-Team Sync',
      description: 'Cross-team sync event ratio',
      stakeholder: 'Coordination cadence consistency',
      formula: {
        type: 'ratio',
        numerator: 'sync_events',
        denominator: 'sync_targets',
        scale: 100,
      },
    },
    {
      id: 'nexus_mission_completion_rate',
      agent: 'nexus',
      category: 'impact',
      name: 'Mission Completion Rate',
      description: 'Mission completion ratio',
      stakeholder: 'Mission execution reliability',
      formula: {
        type: 'ratio',
        numerator: 'missions_completed',
        denominator: 'missions_total',
        scale: 100,
      },
    },
    {
      id: 'nexus_schedule_adherence',
      agent: 'nexus',
      category: 'reliability',
      name: 'Schedule Adherence',
      description: 'Planned schedule adherence ratio',
      stakeholder: 'Schedule discipline for ops execution',
      formula: {
        type: 'ratio',
        numerator: 'schedule_hits',
        denominator: 'schedule_checks',
        scale: 100,
      },
    },
    {
      id: 'nexus_queue_health',
      agent: 'nexus',
      category: 'reliability',
      name: 'Queue Health',
      description: 'Healthy queue check ratio',
      stakeholder: 'Operational queue stability',
      formula: {
        type: 'ratio',
        numerator: 'healthy_queue_checks',
        denominator: 'total_queue_checks',
        scale: 100,
      },
    },
  ];
}

function seedKpiFixtures(kpiDir: string): void {
  if (fs.existsSync(path.join(kpiDir, 'oracle_citation_accuracy.json'))) return;
  fs.mkdirSync(kpiDir, { recursive: true });

  for (const spec of fixtureSpecs()) {
    const def = buildKpiDefinition(spec);
    fs.writeFileSync(path.join(kpiDir, `${spec.id}.json`), JSON.stringify(def, null, 2), 'utf8');
  }

  fs.writeFileSync(path.join(kpiDir, 'schema.json'), JSON.stringify({ fixture: true }, null, 2), 'utf8');
}

function seedRpgDb(dbPath: string): void {
  if (fs.existsSync(dbPath)) return;

  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE performance_stats (
        snapshot_date TEXT NOT NULL,
        claims_with_citations REAL,
        total_claims REAL,
        knowledge_gaps_detected REAL,
        cross_domain_links REAL,
        source_count REAL,
        pylon_uptime_minutes REAL,
        total_minutes REAL,
        deploy_successes REAL,
        deploy_attempts REAL,
        mttr_minutes REAL,
        infra_events_processed REAL,
        escalations_with_signal REAL,
        total_escalations REAL,
        false_positives REAL,
        total_alerts REAL,
        test_passed REAL,
        total_tests REAL,
        regressions REAL,
        total_releases REAL,
        review_turnaround_minutes REAL,
        memory_hits REAL,
        memory_queries REAL,
        archive_docs REAL,
        total_docs REAL,
        retrieval_ms REAL,
        content_items REAL,
        planned_items REAL,
        assets_reused REAL,
        total_assets REAL,
        accepted_outputs REAL,
        total_outputs REAL,
        decision_alignments REAL,
        total_decisions REAL,
        resolution_minutes REAL,
        sync_events REAL,
        sync_targets REAL,
        missions_completed REAL,
        missions_total REAL,
        schedule_hits REAL,
        schedule_checks REAL,
        healthy_queue_checks REAL,
        total_queue_checks REAL
      );

      CREATE TABLE interaction_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        duration_ms REAL
      );

      CREATE TABLE affinity_network (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_a TEXT NOT NULL,
        agent_b TEXT NOT NULL,
        affinity REAL NOT NULL
      );
    `);

    const insertPsionic = db.prepare(`
      INSERT INTO performance_stats (
        snapshot_date, claims_with_citations, total_claims, knowledge_gaps_detected,
        cross_domain_links, source_count, pylon_uptime_minutes, total_minutes,
        deploy_successes, deploy_attempts, mttr_minutes, infra_events_processed,
        escalations_with_signal, total_escalations, false_positives, total_alerts,
        test_passed, total_tests, regressions, total_releases, review_turnaround_minutes,
        memory_hits, memory_queries, archive_docs, total_docs, retrieval_ms,
        content_items, planned_items, assets_reused, total_assets,
        accepted_outputs, total_outputs, decision_alignments, total_decisions,
        resolution_minutes, sync_events, sync_targets, missions_completed, missions_total,
        schedule_hits, schedule_checks, healthy_queue_checks, total_queue_checks
      ) VALUES (
        @snapshot_date, @claims_with_citations, @total_claims, @knowledge_gaps_detected,
        @cross_domain_links, @source_count, @pylon_uptime_minutes, @total_minutes,
        @deploy_successes, @deploy_attempts, @mttr_minutes, @infra_events_processed,
        @escalations_with_signal, @total_escalations, @false_positives, @total_alerts,
        @test_passed, @total_tests, @regressions, @total_releases, @review_turnaround_minutes,
        @memory_hits, @memory_queries, @archive_docs, @total_docs, @retrieval_ms,
        @content_items, @planned_items, @assets_reused, @total_assets,
        @accepted_outputs, @total_outputs, @decision_alignments, @total_decisions,
        @resolution_minutes, @sync_events, @sync_targets, @missions_completed, @missions_total,
        @schedule_hits, @schedule_checks, @healthy_queue_checks, @total_queue_checks
      )
    `);

    const sampleRow = {
      claims_with_citations: 92,
      total_claims: 100,
      knowledge_gaps_detected: 6,
      cross_domain_links: 14,
      source_count: 7,
      pylon_uptime_minutes: 1400,
      total_minutes: 1440,
      deploy_successes: 45,
      deploy_attempts: 50,
      mttr_minutes: 12,
      infra_events_processed: 120,
      escalations_with_signal: 18,
      total_escalations: 20,
      false_positives: 2,
      total_alerts: 60,
      test_passed: 195,
      total_tests: 200,
      regressions: 1,
      total_releases: 25,
      review_turnaround_minutes: 18,
      memory_hits: 88,
      memory_queries: 100,
      archive_docs: 450,
      total_docs: 500,
      retrieval_ms: 85,
      content_items: 30,
      planned_items: 40,
      assets_reused: 22,
      total_assets: 30,
      accepted_outputs: 28,
      total_outputs: 32,
      decision_alignments: 27,
      total_decisions: 30,
      resolution_minutes: 20,
      sync_events: 18,
      sync_targets: 20,
      missions_completed: 12,
      missions_total: 15,
      schedule_hits: 40,
      schedule_checks: 50,
      healthy_queue_checks: 48,
      total_queue_checks: 50,
    };

    insertPsionic.run({ snapshot_date: '2026-02-14', ...sampleRow });
    insertPsionic.run({
      snapshot_date: new Date().toISOString().slice(0, 10),
      ...sampleRow,
    });

    const insertInteraction = db.prepare(
      `INSERT INTO interaction_logs(created_at, duration_ms) VALUES (?, ?)`,
    );
    insertInteraction.run('2026-02-14T12:00:00.000Z', 120);
    insertInteraction.run(new Date().toISOString(), 95);
    insertInteraction.run(new Date().toISOString(), 110);

    db.prepare(`INSERT INTO affinity_network(agent_a, agent_b, affinity) VALUES (?, ?, ?)`)
      .run('oracle', 'atlas', 0.82);
  } finally {
    db.close();
  }
}

function ensureFixtures(): string {
  const existing = process.env[FIXTURE_ROOT_ENV];
  if (existing && fs.existsSync(existing)) return existing;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ventureos-test-fixtures-'));
  const kpiDir = path.join(root, 'kpis');
  const dbPath = path.join(root, 'ventureos-rpg.db');
  seedKpiFixtures(kpiDir);
  seedRpgDb(dbPath);
  process.env[FIXTURE_ROOT_ENV] = root;
  return root;
}

const fixtureRoot = ensureFixtures();
process.env.KPI_DIR = path.join(fixtureRoot, 'kpis');
process.env.VENTUREOS_RPG_DB = path.join(fixtureRoot, 'ventureos-rpg.db');
