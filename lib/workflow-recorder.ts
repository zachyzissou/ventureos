import type {
  RetryPolicy,
  WorkflowCommandReference,
  WorkflowCommandStepDefinition,
  WorkflowDefinition,
  WorkflowOnError,
  WorkflowRunResult,
  WorkflowStepDefinition,
  WorkflowStepMode,
} from './workflow-macros';
import { cloneValue } from './workflow-macros-helpers';

export class WorkflowRecorder {
  private draft?: WorkflowDefinition;
  private readonly stepOrder: string[] = [];

  start(config: { name: string; description: string; version?: number; tags?: string[] }): void {
    this.draft = {
      version: config.version ?? 1,
      name: config.name,
      description: config.description,
      tags: config.tags,
      steps: [],
    };
    this.stepOrder.length = 0;
  }

  recordStep(step: WorkflowStepDefinition): void {
    this.assertStarted();

    const clone = cloneValue(step) as WorkflowStepDefinition;
    this.draft!.steps.push(clone);
    this.stepOrder.push(clone.id);
  }

  recordCommand(stepId: string, command: WorkflowCommandReference, options?: {
    description?: string;
    mode?: WorkflowStepMode;
    retry?: RetryPolicy;
    onError?: WorkflowOnError;
  }): void {
    this.assertStarted();

    const existing = this.draft!.steps.find((s) => s.id === stepId && s.type !== 'batch') as WorkflowCommandStepDefinition | undefined;
    if (existing) {
      existing.commands.push(cloneValue(command) as WorkflowCommandReference);
      return;
    }

    const step: WorkflowCommandStepDefinition = {
      id: stepId,
      description: options?.description,
      type: 'commands',
      mode: options?.mode,
      retry: options?.retry,
      onError: options?.onError,
      commands: [cloneValue(command) as WorkflowCommandReference],
    };

    this.draft!.steps.push(step);
    this.stepOrder.push(stepId);
  }

  stop(): WorkflowDefinition {
    this.assertStarted();

    const out = cloneValue(this.draft) as WorkflowDefinition;
    this.draft = undefined;
    this.stepOrder.length = 0;
    return out;
  }

  static fromRun(
    result: WorkflowRunResult,
    config: { name?: string; description?: string; version?: number; tags?: string[] } = {},
  ): WorkflowDefinition {
    const steps: WorkflowStepDefinition[] = [];

    for (const step of result.steps) {
      if (!step.commands.length) continue;

      const commands: WorkflowCommandReference[] = step.commands.map((cmd) => ({
        command: cmd.command,
        params: cloneValue(cmd.params) as Record<string, unknown>,
      }));

      steps.push({
        id: step.stepId,
        description: `Recorded from run ${result.runId}`,
        type: step.type,
        commands,
        ...(step.type === 'batch'
          ? {
              itemsPath: 'items',
              continueOnItemFailure: true,
            }
          : {}),
      } as WorkflowStepDefinition);
    }

    return {
      version: config.version ?? 1,
      name: config.name ?? `${result.workflowName}.recorded`,
      description: config.description ?? `Recorded from workflow ${result.workflowName}`,
      tags: config.tags,
      steps,
    };
  }

  private assertStarted(): void {
    if (!this.draft) throw new Error('Recorder not started. Call start() first.');
  }
}
