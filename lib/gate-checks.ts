/**
 * Gate Check Framework — VentureOS Mission Runner (P1 #29)
 *
 * Supports configurable gates:
 * - Quality gates (format, completeness, testing)
 * - Security gates (basic content scanning hooks)
 * - Approval gates (human review)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  GateKind,
  GateResult,
  GateStatus,
  MissionRecord,
} from './mission-state-machine';

export interface GateContext {
  mission: MissionRecord;
  /** Base directory where artifacts are stored (if available). */
  artifactsDir?: string;
  /** Optional external signal for approval gates. */
  approve?: () => Promise<boolean>;
}

export interface GateDefinition {
  gateId: string;
  kind: GateKind;
  description: string;
  run(ctx: GateContext): Promise<GateResult>;
}

export interface GateCheckConfig {
  gates?: GateDefinition[];
  /** If true, warnings do not block overall pass. Default: true */
  allowWarnings?: boolean;
}

export class GateChecks {
  private readonly gates: GateDefinition[];
  private readonly allowWarnings: boolean;

  constructor(config: GateCheckConfig = {}) {
    this.gates = config.gates ?? getDefaultGates();
    this.allowWarnings = config.allowWarnings ?? true;
  }

  async runAll(ctx: GateContext): Promise<{ results: GateResult[]; overall: 'pass' | 'fail' | 'require_approval' }>{
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      const result = await gate.run(ctx);
      results.push(result);

      // Fail-fast on hard fail or approval requirement
      if (result.status === 'fail') {
        return { results, overall: 'fail' };
      }
      if (result.status === 'require_approval') {
        return { results, overall: 'require_approval' };
      }
    }

    const hasWarn = results.some((r) => r.status === 'warn');
    if (hasWarn && !this.allowWarnings) return { results, overall: 'fail' };
    return { results, overall: 'pass' };
  }
}

function ok(gateId: string, kind: GateKind, message: string, details?: Record<string, unknown>): GateResult {
  return { gateId, kind, status: 'pass', message, details };
}

function warn(gateId: string, kind: GateKind, message: string, details?: Record<string, unknown>): GateResult {
  return { gateId, kind, status: 'warn', message, details };
}

function fail(gateId: string, kind: GateKind, message: string, details?: Record<string, unknown>): GateResult {
  return { gateId, kind, status: 'fail', message, details };
}

function requireApproval(gateId: string, message: string, details?: Record<string, unknown>): GateResult {
  return { gateId, kind: 'approval', status: 'require_approval', message, details };
}

export function getDefaultGates(): GateDefinition[] {
  return [
    {
      gateId: 'quality.plan.nonempty',
      kind: 'quality',
      description: 'Plan must contain at least one task.',
      async run(ctx) {
        const tasks = ctx.mission.plan?.tasks ?? [];
        if (!tasks.length) return fail('quality.plan.nonempty', 'quality', 'Mission plan contains zero tasks.');
        return ok('quality.plan.nonempty', 'quality', `Plan has ${tasks.length} tasks.`);
      },
    },
    {
      gateId: 'quality.execute.all_succeeded_or_skipped',
      kind: 'quality',
      description: 'All tasks must be succeeded or skipped (no failed tasks).',
      async run(ctx) {
        const statuses = ctx.mission.execution?.taskStatus ?? {};
        const failed = Object.entries(statuses).filter(([, st]) => st === 'failed');
        if (failed.length) {
          return fail(
            'quality.execute.all_succeeded_or_skipped',
            'quality',
            `Execution has ${failed.length} failed task(s).`,
            { failedTaskIds: failed.map(([id]) => id) }
          );
        }
        return ok('quality.execute.all_succeeded_or_skipped', 'quality', 'No failed tasks detected.');
      },
    },
    {
      gateId: 'security.artifacts.no_obvious_secrets',
      kind: 'security',
      description:
        'Basic scan for obvious secret markers in task-produced artifacts (and, if provided, the artifacts directory on disk).',
      async run(ctx) {
        // Common markers (intentionally small set; this is a “tripwire”, not a full secret scanner).
        const markers = [
          /AKIA[0-9A-Z]{16}/, // AWS access key id
          /-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----/, // private keys
          /xox[baprs]-[0-9a-zA-Z-]{10,}/, // Slack tokens
        ];

        const findings: Array<{ where: string; marker: string }> = [];

        // 1) Scan in-memory task artifacts (available before delivery)
        for (const r of ctx.mission.execution?.results ?? []) {
          for (const a of r.artifacts ?? []) {
            for (const m of markers) {
              if (m.test(a.content)) {
                findings.push({ where: `task:${r.taskId}/${a.name}`, marker: String(m) });
                break;
              }
            }
          }
        }

        // 2) Optionally scan the on-disk artifacts directory (best-effort)
        if (ctx.artifactsDir) {
          const walk = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const ent of entries) {
              const p = path.join(dir, ent.name);
              if (ent.isDirectory()) {
                await walk(p);
              } else if (ent.isFile()) {
                try {
                  const stat = await fs.stat(p);
                  if (stat.size > 512_000) continue;
                  const buf = await fs.readFile(p);
                  const text = buf.toString('utf8');
                  for (const m of markers) {
                    if (m.test(text)) {
                      findings.push({ where: `file:${p}`, marker: String(m) });
                      break;
                    }
                  }
                } catch {
                  // ignore read errors
                }
              }
            }
          };
          await walk(ctx.artifactsDir);
        }

        if (findings.length) {
          return fail(
            'security.artifacts.no_obvious_secrets',
            'security',
            `Potential secret material detected (${findings.length} finding(s)).`,
            { findings }
          );
        }

        return ok('security.artifacts.no_obvious_secrets', 'security', 'No obvious secret markers detected.');
      },
    },
    {
      gateId: 'approval.optional',
      kind: 'approval',
      description: 'Optional human approval gate (only triggers when approve() is provided and returns false).',
      async run(ctx) {
        if (!ctx.approve) return ok('approval.optional', 'approval', 'No approval callback provided; auto-approved.');
        const approved = await ctx.approve();
        if (!approved) return requireApproval('approval.optional', 'Mission requires human approval to proceed.');
        return ok('approval.optional', 'approval', 'Approved.');
      },
    },
  ];
}

export function isTerminalGateStatus(status: GateStatus): boolean {
  return status === 'fail' || status === 'require_approval';
}
