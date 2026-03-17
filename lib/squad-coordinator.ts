/**
 * Squad Coordinator — VentureOS Mission Runner (P1 #29)
 *
 * Responsible for:
 * - Inferring required roles from mission brief / plan
 * - Dispatching tasks to agents
 * - Tracking progress and handling agent failures without crashing
 */

import crypto from 'node:crypto';

import type {
  MissionBrief,
  MissionPlan,
  MissionTask,
  MissionExecution,
  SquadRole,
  TaskRunResult,
  MissionTaskStatus,
  TaskRunArtifact,
} from './mission-state-machine';

export interface AgentTaskContext {
  missionId: string;
  brief: MissionBrief;
  plan: MissionPlan;
}

export interface AgentTaskOutput {
  summary?: string;
  artifacts?: TaskRunArtifact[];
}

export interface SquadAgent {
  id: SquadRole;
  /**
   * Execute a single mission task.
   * Throw to signal failure; coordinator will capture and continue.
   */
  runTask(task: MissionTask, ctx: AgentTaskContext): Promise<AgentTaskOutput>;
}

/**
 * Optional task-level lifecycle hooks for runtime integration.
 * All hooks are optional and async-safe.
 * Fixes #184 — ConversationEngine runtime integration.
 */
export interface SquadExecutionHooks {
  onTaskStart?(task: MissionTask, agentId: string): Promise<void>;
  onTaskComplete?(task: MissionTask, result: TaskRunResult): Promise<void>;
}

export interface SquadCoordinatorConfig {
  agents: SquadAgent[];
  /** If true, keep running remaining tasks after a failure. Default: true. */
  continueOnFailure?: boolean;
  /** If true, run tasks in parallel when no dependencies. Default: false. */
  parallelize?: boolean;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

function iso(now: () => Date) {
  return now().toISOString();
}

export class SquadCoordinator {
  private readonly agentsById: Map<SquadRole, SquadAgent>;
  private readonly continueOnFailure: boolean;
  private readonly parallelize: boolean;
  private readonly now: () => Date;

  constructor(config: SquadCoordinatorConfig) {
    if (!config?.agents?.length) throw new Error('SquadCoordinator requires agents[]');
    this.agentsById = new Map(config.agents.map((a) => [a.id, a]));
    this.continueOnFailure = config.continueOnFailure ?? true;
    this.parallelize = config.parallelize ?? false;
    this.now = config.now ?? (() => new Date());
  }

  /**
   * Simple role inference heuristic.
   * Used when the caller wants auto-planning from a brief.
   */
  inferRolesFromBrief(brief: MissionBrief): SquadRole[] {
    const text = `${brief.title}\n${brief.description}\n${(brief.requirements ?? []).join('\n')}`.toLowerCase();
    const roles = new Set<SquadRole>();

    // Always include Venture Delivery as the general implementation lane.
    roles.add('venture_delivery');

    // NOTE: use word boundaries to avoid accidental matches (e.g. "spe**ci**al" should not trigger infra).
    if (/\b(security|vuln|xss|secrets|sanitize|auth|threat)\b/i.test(text) || /sql\s+injection/i.test(text)) {
      roles.add('venture_security');
    }

    if (/\b(tests?|jest|vitest|qa|verify|lint|coverage)\b/i.test(text)) roles.add('venture_evidence');
    if (/\b(doc|docs|documentation|readme|guide|diagram)\b/i.test(text)) roles.add('venture_memory');
    if (/\b(research|investigate|compare|option|options|tradeoff|tradeoffs|benchmark)\b/i.test(text)) roles.add('venture_research');
    if (/\b(deploy|ci|pipeline|infra|docker|k8s|config|configuration)\b/i.test(text) || /ci\/cd/i.test(text)) {
      roles.add('venture_infrastructure');
    }

    return Array.from(roles);
  }

  /**
   * Generate a minimal plan from a brief.
   * This is intentionally simple; sophisticated planning can be layered later.
   */
  createPlanFromBrief(brief: MissionBrief): MissionPlan {
    const createdAt = iso(this.now);
    const roles = this.inferRolesFromBrief(brief);

    // Default tasks by role.
    const tasks: MissionTask[] = [];

    // Research task (optional)
    if (roles.includes('venture_research')) {
      tasks.push({
        taskId: crypto.randomUUID(),
        title: 'Research & risk assessment',
        description: 'Identify unknowns, risks, and recommended approach for the mission.',
        role: 'venture_research',
      });
    }

    // Core implementation
    tasks.push({
      taskId: crypto.randomUUID(),
      title: 'Implement mission deliverables',
      description: 'Produce the requested artifacts / changes described in the brief.',
      role: 'venture_delivery',
      dependsOnTaskIds: tasks.length ? [tasks[0].taskId] : undefined,
    });

    // Security review
    if (roles.includes('venture_security')) {
      tasks.push({
        taskId: crypto.randomUUID(),
        title: 'Security review',
        description: 'Run security checks and review for common vulnerability classes.',
        role: 'venture_security',
        dependsOnTaskIds: [tasks[tasks.length - 1].taskId],
      });
    }

    // QA
    if (roles.includes('venture_evidence')) {
      tasks.push({
        taskId: crypto.randomUUID(),
        title: 'Verification & testing',
        description: 'Run tests and verify acceptance criteria.',
        role: 'venture_evidence',
        dependsOnTaskIds: [tasks[tasks.length - 1].taskId],
      });
    }

    // Docs
    if (roles.includes('venture_memory')) {
      tasks.push({
        taskId: crypto.randomUUID(),
        title: 'Documentation & reporting',
        description: 'Write usage docs, diagrams, and summary report artifacts.',
        role: 'venture_memory',
        dependsOnTaskIds: [tasks[tasks.length - 1].taskId],
      });
    }

    // Infra / packaging
    if (roles.includes('venture_infrastructure')) {
      tasks.push({
        taskId: crypto.randomUUID(),
        title: 'Integration & packaging',
        description: 'Ensure integration points are wired up (CI/config) and ready to ship.',
        role: 'venture_infrastructure',
        dependsOnTaskIds: [tasks[tasks.length - 1].taskId],
      });
    }

    return { createdAt, tasks };
  }

  /**
   * Execute all tasks in a plan.
   *
   * Dependency handling:
   * - If parallelize=false: runs in listed order.
   * - If parallelize=true: runs tasks whose dependencies are satisfied.
   */
  async executePlan(missionId: string, brief: MissionBrief, plan: MissionPlan, hooks?: SquadExecutionHooks): Promise<MissionExecution> {
    const startedAt = iso(this.now);
    const taskStatus: Record<string, MissionTaskStatus> = {};
    for (const t of plan.tasks) taskStatus[t.taskId] = 'pending';

    const results: TaskRunResult[] = [];

    const ctx: AgentTaskContext = { missionId, brief, plan };

    const taskById = new Map(plan.tasks.map((t) => [t.taskId, t] as const));

    // Dependency graph: taskId -> [dependentTaskId, ...]
    const dependentsByTaskId = new Map<string, string[]>();
    for (const t of plan.tasks) {
      for (const depId of t.dependsOnTaskIds ?? []) {
        const arr = dependentsByTaskId.get(depId) ?? [];
        arr.push(t.taskId);
        dependentsByTaskId.set(depId, arr);
      }
    }

    const canRun = (task: MissionTask) => {
      const deps = task.dependsOnTaskIds ?? [];
      // Dependencies are satisfied only when they succeeded (NOT skipped).
      return deps.every((depId) => taskStatus[depId] === 'succeeded');
    };

    // If a task fails or is skipped, all downstream dependents must be skipped (transitively).
    const markSkippedDependents = (rootTaskId: string) => {
      const queue: string[] = [rootTaskId];
      const visited = new Set<string>();

      while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);

        for (const dependentId of dependentsByTaskId.get(cur) ?? []) {
          const st = taskStatus[dependentId];
          if (st === 'pending') {
            taskStatus[dependentId] = 'skipped';
            queue.push(dependentId);
          } else if (st === 'skipped') {
            // Already skipped, but still propagate further.
            queue.push(dependentId);
          }
        }
      }
    };

    const runOne = async (task: MissionTask): Promise<void> => {
      const agent = this.agentsById.get(task.role);
      if (!agent) {
        const failResult: TaskRunResult = {
          taskId: task.taskId,
          agentId: task.role,
          startedAt: iso(this.now),
          finishedAt: iso(this.now),
          status: 'failed',
          error: { message: `No agent registered for role: ${task.role}` },
        };
        taskStatus[task.taskId] = 'failed';
        results.push(failResult);
        // Issue #184: Notify hooks of task failure
        try { await hooks?.onTaskComplete?.(task, failResult); } catch { /* hook error ignored */ }
        markSkippedDependents(task.taskId);
        if (!this.continueOnFailure) throw new Error(`Task failed: ${task.title} (no agent for ${task.role})`);
        return;
      }

      // Issue #184: Notify hooks of task start
      try { await hooks?.onTaskStart?.(task, agent.id); } catch { /* hook error ignored */ }

      taskStatus[task.taskId] = 'running';
      const started = iso(this.now);
      try {
        const out = await agent.runTask(task, ctx);
        const finished = iso(this.now);
        taskStatus[task.taskId] = 'succeeded';
        const successResult: TaskRunResult = {
          taskId: task.taskId,
          agentId: agent.id,
          startedAt: started,
          finishedAt: finished,
          status: 'succeeded',
          summary: out?.summary,
          artifacts: out?.artifacts,
        };
        results.push(successResult);
        // Issue #184: Notify hooks of task completion
        try { await hooks?.onTaskComplete?.(task, successResult); } catch { /* hook error ignored */ }
      } catch (err: any) {
        const finished = iso(this.now);
        taskStatus[task.taskId] = 'failed';
        const failResult: TaskRunResult = {
          taskId: task.taskId,
          agentId: agent.id,
          startedAt: started,
          finishedAt: finished,
          status: 'failed',
          error: { message: String(err?.message ?? err ?? 'Unknown error'), name: err?.name },
        };
        results.push(failResult);
        // Issue #184: Notify hooks of task failure
        try { await hooks?.onTaskComplete?.(task, failResult); } catch { /* hook error ignored */ }
        markSkippedDependents(task.taskId);
        if (!this.continueOnFailure) throw err;
      }
    };

    if (!this.parallelize) {
      for (const task of plan.tasks) {
        if (taskStatus[task.taskId] !== 'pending') continue;
        if (!canRun(task)) {
          // If dependencies are not satisfied, mark skipped (and skip downstream dependents).
          taskStatus[task.taskId] = 'skipped';
          markSkippedDependents(task.taskId);
          continue;
        }
        await runOne(task);
      }
    } else {
      // Kahn-like execution loop.
      const pending = new Set(plan.tasks.map((t) => t.taskId));

      while (pending.size) {
        const runnable: MissionTask[] = [];
        for (const id of pending) {
          const t = taskById.get(id)!;
          if (taskStatus[t.taskId] !== 'pending') {
            pending.delete(id);
            continue;
          }
          if (canRun(t)) runnable.push(t);
        }

        if (!runnable.length) {
          // Deadlock due to failed deps or cycle — skip remaining.
          for (const id of pending) {
            taskStatus[id] = taskStatus[id] === 'pending' ? 'skipped' : taskStatus[id];
          }
          break;
        }

        await Promise.all(runnable.map(async (t) => {
          pending.delete(t.taskId);
          await runOne(t);
        }));
      }
    }

    const finishedAt = iso(this.now);
    return { startedAt, finishedAt, taskStatus, results };
  }
}
