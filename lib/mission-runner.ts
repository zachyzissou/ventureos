/**
 * Mission Runner — VentureOS Mission Execution Workflow (P1 #29)
 *
 * Orchestrates missions end-to-end:
 *   brief → plan → execute → verify → deliver → closed
 *
 * Key properties:
 * - Persistent state (JSON file store by default)
 * - Resumable across restarts (continue from last saved phase)
 * - Failure-tolerant squad execution (configurable)
 * - Configurable gate checks and artifact collection
 */

import Ajv from 'ajv';
import path from 'node:path';

import {
  MissionStateMachine,
  type MissionBrief,
  type MissionRecord,
  type MissionPhase,
} from './mission-state-machine';

import { SquadCoordinator, type SquadAgent } from './squad-coordinator';
import { GateChecks, type GateDefinition } from './gate-checks';
import { ArtifactCollector } from './artifact-collector';

export interface MissionRunnerConfig {
  /** Directory where mission state is persisted. */
  persistDir?: string;
  /** Directory where mission artifacts are collected. */
  artifactsDir?: string;

  agents: SquadAgent[];

  continueOnFailure?: boolean;
  parallelize?: boolean;

  /** Custom gate definitions. */
  gates?: GateDefinition[];

  /** Optional deterministic time source for tests. */
  now?: () => Date;

  /** Optional approval callback for approval gates. */
  approve?: () => Promise<boolean>;
}

export interface MissionRunResult {
  mission: MissionRecord;
  /** Convenience paths to final delivery artifacts when closed. */
  delivered?: {
    artifactsDir: string;
    manifestPath: string;
    statusReportPath: string;
    completionSummaryPath: string;
  };
}

const briefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'requirements'],
  properties: {
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    requirements: { type: 'array', items: { type: 'string' } },
    deliverables: { type: 'array', items: { type: 'string' } },
    constraints: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
} as const;

export class MissionRunner {
  private readonly sm: MissionStateMachine;
  private readonly squad: SquadCoordinator;
  private readonly gates: GateChecks;
  private readonly artifacts: ArtifactCollector;
  private readonly now: () => Date;
  private readonly approve?: () => Promise<boolean>;

  constructor(config: MissionRunnerConfig) {
    if (!config?.agents?.length) throw new Error('MissionRunner requires agents[]');

    this.now = config.now ?? (() => new Date());
    this.approve = config.approve;

    this.sm = new MissionStateMachine({
      persistDir: config.persistDir,
      now: this.now,
    });

    this.squad = new SquadCoordinator({
      agents: config.agents,
      continueOnFailure: config.continueOnFailure,
      parallelize: config.parallelize,
      now: this.now,
    });

    this.gates = new GateChecks({
      gates: config.gates,
    });

    this.artifacts = new ArtifactCollector({
      baseDir: config.artifactsDir,
      now: this.now,
    });
  }

  /**
   * Start a new mission from a brief and run it end-to-end.
   */
  async runFromBrief(brief: MissionBrief): Promise<MissionRunResult> {
    this.validateBrief(brief);

    let mission = await this.sm.createMission(brief);

    try {
      mission = await this.runFromPhase(mission);
      return this.toRunResult(mission);
    } catch (err) {
      // If something threw outside of phase transitions, mark mission as failed.
      const failed = await this.sm.fail(mission, err);
      return this.toRunResult(failed);
    }
  }

  /**
   * Resume an existing mission from persisted state.
   */
  async resume(missionId: string): Promise<MissionRunResult> {
    const mission = await this.sm.loadMission(missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);

    if (mission.phase === 'closed') return this.toRunResult(mission);
    if (mission.phase === 'error') {
      // Caller must rollback or fix externally.
      return this.toRunResult(mission);
    }

    let updated = mission;
    try {
      updated = await this.runFromPhase(updated);
      return this.toRunResult(updated);
    } catch (err) {
      const failed = await this.sm.fail(updated, err);
      return this.toRunResult(failed);
    }
  }

  /**
   * Roll back a mission from error → prior phase.
   */
  async rollback(missionId: string, target: Exclude<MissionPhase, 'error'>): Promise<MissionRecord> {
    const mission = await this.sm.loadMission(missionId);
    if (!mission) throw new Error(`Mission not found: ${missionId}`);
    return this.sm.rollback(mission, target);
  }

  // ─── Internal Orchestration ───────────────────────────────────────────

  private async runFromPhase(mission: MissionRecord): Promise<MissionRecord> {
    let m = mission;

    if (m.phase === 'brief') {
      const plan = this.squad.createPlanFromBrief(m.brief!);
      m = await this.sm.transition(m, 'plan', { plan }, 'auto-planned');
    }

    if (m.phase === 'plan') {
      const execution = await this.squad.executePlan(m.missionId, m.brief!, m.plan!);
      m = await this.sm.transition(m, 'execute', { execution }, 'executed plan');
    }

    if (m.phase === 'execute') {
      const startedAt = this.now().toISOString();
      const gateCtxArtifactsDir = undefined; // artifacts not collected yet

      const { results, overall } = await this.gates.runAll({
        mission: m,
        artifactsDir: gateCtxArtifactsDir,
        approve: this.approve,
      });

      const verification = {
        startedAt,
        finishedAt: this.now().toISOString(),
        results,
        overall,
      };

      m = await this.sm.transition(m, 'verify', { verification }, 'gate checks');
    }

    if (m.phase === 'verify') {
      if (m.verification?.overall === 'fail') {
        return this.sm.fail(m, new Error('Gate checks failed'), 'gates_failed', 'execute');
      }
      if (m.verification?.overall === 'require_approval') {
        return this.sm.fail(m, new Error('Human approval required'), 'requires_approval', 'verify');
      }

      const reports = this.generateReports(m);
      const collected = await this.artifacts.collectFromResults(m.missionId, m.execution!.results, [
        { name: 'status-report.md', content: reports.statusReport },
        { name: 'completion-summary.md', content: reports.completionSummary },
        { name: 'failure-analysis.md', content: reports.failureAnalysis },
      ]);

      const delivery = {
        deliveredAt: this.now().toISOString(),
        artifactsDir: collected.artifactsDir,
        manifestPath: collected.manifestPath,
        artifacts: collected.artifacts,
        reports: {
          statusReportPath: path.join(collected.artifactsDir, 'status-report.md'),
          completionSummaryPath: path.join(collected.artifactsDir, 'completion-summary.md'),
        },
      };

      m = await this.sm.transition(m, 'deliver', { delivery }, 'delivered artifacts');
    }

    if (m.phase === 'deliver') {
      const created = Date.parse(m.createdAt);
      const closedAt = this.now().toISOString();
      const durationMs = Number.isFinite(created) ? Date.parse(closedAt) - created : undefined;
      m = await this.sm.transition(
        m,
        'closed',
        {
          updatedAt: closedAt,
          metrics: {
            ...(m.metrics ?? { createdAt: m.createdAt, updatedAt: closedAt }),
            updatedAt: closedAt,
            durationMs,
          },
        },
        'mission closed'
      );
    }

    return m;
  }

  private validateBrief(brief: MissionBrief) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(briefSchema);
    const ok = validate(brief);
    if (!ok) {
      const details = validate.errors?.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      throw new Error(`Invalid mission brief: ${details}`);
    }
  }

  private generateReports(m: MissionRecord): { statusReport: string; completionSummary: string; failureAnalysis: string } {
    const phase = m.phase;
    const taskResults = m.execution?.results ?? [];
    const failed = taskResults.filter((r) => r.status === 'failed');

    const statusReport = [
      `# Mission Status Report`,
      ``,
      `- Mission ID: ${m.missionId}`,
      `- Phase: ${phase}`,
      `- Created: ${m.createdAt}`,
      `- Updated: ${m.updatedAt}`,
      ``,
      `## Brief`,
      `- Title: ${m.brief?.title ?? ''}`,
      `- Description: ${m.brief?.description ?? ''}`,
      ``,
      `## Plan`,
      `- Tasks: ${(m.plan?.tasks?.length ?? 0)}`,
      ``,
      `## Execution`,
      ...taskResults.map((r) => `- ${r.taskId} (${r.agentId}): ${r.status}${r.summary ? ` — ${r.summary}` : ''}`),
      ``,
      `## Verification`,
      `- Overall: ${m.verification?.overall ?? 'n/a'}`,
      ...(m.verification?.results ?? []).map((gr) => `- [${gr.kind}] ${gr.gateId}: ${gr.status} — ${gr.message}`),
      ``,
    ].join('\n');

    const completionSummary = [
      `# Mission Completion Summary`,
      ``,
      `## Overview`,
      `- Mission ID: ${m.missionId}`,
      `- Title: ${m.brief?.title ?? ''}`,
      `- Closed: ${m.phase === 'closed' ? 'yes' : 'no'}`,
      ``,
      `## Deliverables`,
      ...(m.brief?.deliverables?.length ? m.brief.deliverables.map((d) => `- ${d}`) : ['- (none specified)']),
      ``,
      `## Metrics`,
      `- Duration (ms): ${m.metrics?.durationMs ?? 'n/a'}`,
      ``,
    ].join('\n');

    const failureAnalysis = [
      `# Failure Analysis`,
      ``,
      failed.length
        ? `Execution failures detected: ${failed.length}`
        : 'No execution failures detected.',
      ``,
      ...failed.map((f) => `- Task ${f.taskId} (${f.agentId}): ${f.error?.message ?? 'unknown error'}`),
      ``,
      m.error ? `State machine error: ${m.error.message}` : 'State machine error: none',
      ``,
    ].join('\n');

    return { statusReport, completionSummary, failureAnalysis };
  }

  private toRunResult(mission: MissionRecord): MissionRunResult {
    if (mission.phase !== 'closed') return { mission };
    return {
      mission,
      delivered: mission.delivery
        ? {
            artifactsDir: mission.delivery.artifactsDir,
            manifestPath: mission.delivery.manifestPath,
            statusReportPath: mission.delivery.reports.statusReportPath,
            completionSummaryPath: mission.delivery.reports.completionSummaryPath,
          }
        : undefined,
    };
  }
}
