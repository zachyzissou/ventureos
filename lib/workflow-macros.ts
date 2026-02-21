/**
 * Workflow Macros — VentureOS Workflow Acceleration (P2 #32)
 *
 * Provides:
 * - Reusable workflow macro registry
 * - Command composition engine + shortcut command library
 * - Batch processing framework
 * - Real-time progress tracking
 * - Retry + rollback execution semantics
 * - Workflow recorder utility
 * - 5 prebuilt workflows (DSL)
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PREBUILT_WORKFLOWS, registerDefaultCommandsAndShortcuts } from './workflow-macros-defaults';
import {
  cloneValue,
  estimateTotalUnits,
  evaluateCondition,
  getPathValue,
  resolveBatchItems,
  resolveTemplateValue,
} from './workflow-macros-helpers';
import { WorkflowRecorder } from './workflow-recorder';

export { PREBUILT_WORKFLOWS };
export { WorkflowRecorder };

// ============================================================================
// Shared Types
// ============================================================================

export interface WorkflowLogger {
  debug?(msg: string, meta?: Record<string, unknown>): void;
  info?(msg: string, meta?: Record<string, unknown>): void;
  warn?(msg: string, meta?: Record<string, unknown>): void;
  error?(msg: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: WorkflowLogger = {
  debug: (msg, meta) => {
    if (process.env.WORKFLOW_DEBUG) console.debug(`[workflow] ${msg}`, meta ?? '');
  },
  info: (msg, meta) => console.info(`[workflow] ${msg}`, meta ?? ''),
  warn: (msg, meta) => console.warn(`[workflow] ${msg}`, meta ?? ''),
  error: (msg, meta) => console.error(`[workflow] ${msg}`, meta ?? ''),
};

export interface RetryPolicy {
  maxAttempts?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
}

export type WorkflowStepMode = 'sequential' | 'parallel';
export type WorkflowOnError = 'abort' | 'continue' | 'rollback';

export interface WorkflowCommandReference {
  command: string;
  params?: Record<string, unknown>;
  retry?: RetryPolicy;
  idempotencyKey?: string;
  rollback?: WorkflowCommandReference;
}

export interface WorkflowStepBase {
  id: string;
  description?: string;
  condition?: string | ((ctx: WorkflowEvaluationContext) => boolean);
  onError?: WorkflowOnError;
  retry?: RetryPolicy;
  rollback?: WorkflowCommandReference[];
}

export interface WorkflowCommandStepDefinition extends WorkflowStepBase {
  type?: 'commands';
  mode?: WorkflowStepMode;
  commands: WorkflowCommandReference[];
}

export interface WorkflowBatchStepDefinition extends WorkflowStepBase {
  type: 'batch';
  mode?: WorkflowStepMode;
  commands: WorkflowCommandReference[];
  itemsPath: string;
  concurrency?: number;
  continueOnItemFailure?: boolean;
}

export type WorkflowStepDefinition = WorkflowCommandStepDefinition | WorkflowBatchStepDefinition;

export interface WorkflowDefinition {
  version: number;
  name: string;
  description: string;
  tags?: string[];
  defaults?: Record<string, unknown>;
  rollbackOnFailure?: boolean;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowEvaluationContext {
  workflowName: string;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface CommandRuntimeContext {
  runId: string;
  workflowName: string;
  stepId: string;
  attempt: number;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  item?: unknown;
  now: () => Date;
}

export interface CommandResult {
  output?: unknown;
  stateUpdates?: Record<string, unknown>;
  artifacts?: string[];
  message?: string;
}

export type CommandHandler = (
  params: Record<string, unknown>,
  context: CommandRuntimeContext
) => Promise<CommandResult> | CommandResult;

export type CommandRollbackHandler = (
  params: Record<string, unknown>,
  context: CommandRuntimeContext,
  result: CommandResult | undefined
) => Promise<void> | void;

export interface CommandDefinition {
  name: string;
  description?: string;
  idempotent?: boolean;
  handler: CommandHandler;
  rollback?: CommandRollbackHandler;
}

interface ShortcutDefinition {
  alias: string;
  target: string;
  defaults?: Record<string, unknown>;
}

export interface CommandExecutionRecord {
  command: string;
  resolvedCommand: string;
  params: Record<string, unknown>;
  status: 'succeeded' | 'failed';
  attempts: number;
  startedAt: string;
  finishedAt: string;
  output?: unknown;
  error?: string;
  rollbackApplied?: boolean;
  rollbackError?: string;
  rollbackCommand?: WorkflowCommandReference;
}

export interface CommandExecutionSummary {
  commands: CommandExecutionRecord[];
}

export interface BatchItemResult {
  index: number;
  item: unknown;
  status: 'succeeded' | 'failed';
  commands: CommandExecutionRecord[];
  error?: string;
}

export interface BatchProcessingResult {
  totalItems: number;
  succeeded: number;
  failed: number;
  itemResults: BatchItemResult[];
}

export interface WorkflowStepRunRecord {
  stepId: string;
  type: 'commands' | 'batch';
  status: 'succeeded' | 'failed' | 'skipped';
  startedAt: string;
  finishedAt: string;
  commands: CommandExecutionRecord[];
  batch?: BatchProcessingResult;
  error?: string;
}

export interface WorkflowRollbackResult {
  attempted: boolean;
  succeeded: boolean;
  errors: string[];
}

export interface WorkflowRunResult {
  runId: string;
  workflowName: string;
  status: 'succeeded' | 'failed' | 'dry-run';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  steps: WorkflowStepRunRecord[];
  rollback: WorkflowRollbackResult;
  progress: WorkflowProgressSnapshot;
  error?: string;
}

export type WorkflowProgressEventType =
  | 'run-started'
  | 'step-started'
  | 'step-completed'
  | 'step-failed'
  | 'batch-item-completed'
  | 'retry'
  | 'rollback-started'
  | 'rollback-completed'
  | 'run-completed'
  | 'run-failed';

export interface WorkflowProgressSnapshot {
  runId: string;
  workflowName: string;
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  totalUnits: number;
  completedUnits: number;
  failedUnits: number;
  percent: number;
  currentStepId?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface WorkflowProgressEvent {
  type: WorkflowProgressEventType;
  timestamp: string;
  snapshot: WorkflowProgressSnapshot;
  stepId?: string;
  error?: string;
  attempt?: number;
  command?: string;
  batch?: {
    stepId: string;
    index: number;
    total: number;
    succeeded: number;
    failed: number;
  };
}

// ============================================================================
// Command Library + Composition Engine
// ============================================================================

export class ShortcutCommandLibrary {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly shortcuts = new Map<string, ShortcutDefinition>();

  registerCommand(def: CommandDefinition): void {
    if (!def.name) throw new Error('CommandDefinition.name is required');
    if (this.shortcuts.has(def.name)) {
      throw new Error(`Cannot register command '${def.name}' because a shortcut with that name exists`);
    }
    this.commands.set(def.name, def);
  }

  registerShortcut(alias: string, target: string, defaults?: Record<string, unknown>): void {
    if (!alias) throw new Error('Shortcut alias is required');
    if (!target) throw new Error('Shortcut target is required');
    if (this.commands.has(alias)) {
      throw new Error(`Cannot register shortcut '${alias}' because a command with that name exists`);
    }
    this.shortcuts.set(alias, { alias, target, defaults });
  }

  has(name: string): boolean {
    return this.commands.has(name) || this.shortcuts.has(name);
  }

  list(): string[] {
    return [...this.commands.keys(), ...this.shortcuts.keys()].sort();
  }

  resolve(ref: WorkflowCommandReference): {
    definition: CommandDefinition;
    resolvedCommand: string;
    params: Record<string, unknown>;
  } {
    const shortcut = this.shortcuts.get(ref.command);
    if (shortcut) {
      const definition = this.commands.get(shortcut.target);
      if (!definition) throw new Error(`Shortcut target not found: ${shortcut.target}`);
      return {
        definition,
        resolvedCommand: definition.name,
        params: {
          ...(shortcut.defaults ?? {}),
          ...(ref.params ?? {}),
        },
      };
    }

    const definition = this.commands.get(ref.command);
    if (!definition) throw new Error(`Command not found: ${ref.command}`);
    return {
      definition,
      resolvedCommand: definition.name,
      params: { ...(ref.params ?? {}) },
    };
  }
}

interface CompositionContext {
  runId: string;
  workflowName: string;
  stepId: string;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  item?: unknown;
  now: () => Date;
  idempotencyCache: Map<string, CommandResult>;
  signal?: AbortSignal;
}

interface CompositionOptions {
  mode?: WorkflowStepMode;
  defaultRetry?: RetryPolicy;
  onRetry?: (event: { stepId: string; command: string; attempt: number; error: string }) => void;
}

interface RollbackOptions {
  onRollbackError?: (event: { stepId: string; command: string; error: string }) => void;
}

interface CommandExecutionWithDefinition {
  record: CommandExecutionRecord;
  definition: CommandDefinition;
  result?: CommandResult;
}

class ParallelExecutionError extends Error {
  readonly records: CommandExecutionWithDefinition[];

  constructor(message: string, records: CommandExecutionWithDefinition[]) {
    super(message);
    this.name = 'ParallelExecutionError';
    this.records = records;
  }
}

export class CommandCompositionEngine {
  private readonly library: ShortcutCommandLibrary;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: {
    library: ShortcutCommandLibrary;
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.library = config.library;
    this.now = config.now ?? (() => new Date());
    this.sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async execute(
    commands: WorkflowCommandReference[],
    context: CompositionContext,
    options: CompositionOptions = {}
  ): Promise<{ records: CommandExecutionWithDefinition[] }> {
    this.assertNotAborted(context.signal);

    const mode = options.mode ?? 'sequential';
    if (mode === 'parallel') {
      const settled = await Promise.allSettled(
        commands.map((commandRef) => this.executeSingle(commandRef, context, options))
      );

      const records: CommandExecutionWithDefinition[] = [];
      const errors: string[] = [];

      for (const item of settled) {
        if (item.status === 'fulfilled') {
          records.push(item.value);
        } else {
          errors.push(item.reason instanceof Error ? item.reason.message : String(item.reason));
        }
      }

      if (errors.length) {
        throw new ParallelExecutionError(`Parallel command execution failed: ${errors.join('; ')}`, records);
      }

      return { records };
    }

    const records: CommandExecutionWithDefinition[] = [];
    for (const commandRef of commands) {
      this.assertNotAborted(context.signal);
      const result = await this.executeSingle(commandRef, context, options);
      records.push(result);
      if (result.record.status === 'failed') break;
    }

    return { records };
  }

  async rollback(
    records: CommandExecutionWithDefinition[],
    context: CompositionContext,
    options: RollbackOptions = {}
  ): Promise<string[]> {
    const errors: string[] = [];

    for (const executed of [...records].reverse()) {
      this.assertNotAborted(context.signal);
      const command = executed.record.rollbackCommand;

      try {
        if (command) {
          await this.executeSingle(
            {
              ...command,
              retry: { maxAttempts: 1, backoffMs: 0, maxBackoffMs: 0 },
            },
            {
              ...context,
              stepId: `${context.stepId}:rollback`,
            }
          );
          executed.record.rollbackApplied = true;
          continue;
        }

        if (executed.definition.rollback) {
          await executed.definition.rollback(
            executed.record.params,
            {
              runId: context.runId,
              workflowName: context.workflowName,
              stepId: `${context.stepId}:rollback`,
              attempt: 1,
              inputs: context.inputs,
              state: context.state,
              item: context.item,
              now: context.now,
            },
            executed.result
          );
          executed.record.rollbackApplied = true;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        executed.record.rollbackError = msg;
        errors.push(`${executed.record.command}: ${msg}`);
        options.onRollbackError?.({
          stepId: context.stepId,
          command: executed.record.command,
          error: msg,
        });
      }
    }

    return errors;
  }

  private async executeSingle(
    commandRef: WorkflowCommandReference,
    context: CompositionContext,
    options: CompositionOptions = {}
  ): Promise<CommandExecutionWithDefinition> {
    const resolved = this.library.resolve(commandRef);
    const resolvedParams = resolveTemplateValue(resolved.params, {
      inputs: context.inputs,
      state: context.state,
      item: context.item,
      runId: context.runId,
      workflow: context.workflowName,
      step: context.stepId,
    }) as Record<string, unknown>;

    const rollbackCommand = commandRef.rollback
      ? (resolveTemplateValue(commandRef.rollback, {
          inputs: context.inputs,
          state: context.state,
          item: context.item,
          runId: context.runId,
          workflow: context.workflowName,
          step: context.stepId,
        }) as WorkflowCommandReference)
      : undefined;

    const retry = {
      maxAttempts: commandRef.retry?.maxAttempts ?? options.defaultRetry?.maxAttempts ?? 1,
      backoffMs: commandRef.retry?.backoffMs ?? options.defaultRetry?.backoffMs ?? 0,
      maxBackoffMs: commandRef.retry?.maxBackoffMs ?? options.defaultRetry?.maxBackoffMs ?? 5_000,
    };

    const idempotencyKeyTemplate = commandRef.idempotencyKey ?? `${context.workflowName}:${context.stepId}:${commandRef.command}`;
    const idempotencyKey = String(
      resolveTemplateValue(idempotencyKeyTemplate, {
        inputs: context.inputs,
        state: context.state,
        item: context.item,
        runId: context.runId,
        workflow: context.workflowName,
        step: context.stepId,
      })
    );

    const startedAt = context.now().toISOString();
    let attempts = 0;

    if (resolved.definition.idempotent !== false && context.idempotencyCache.has(idempotencyKey)) {
      const cached = context.idempotencyCache.get(idempotencyKey);
      return {
        definition: resolved.definition,
        result: cached,
        record: {
          command: commandRef.command,
          resolvedCommand: resolved.resolvedCommand,
          params: resolvedParams,
          status: 'succeeded',
          attempts: 0,
          startedAt,
          finishedAt: context.now().toISOString(),
          output: cached?.output,
          rollbackCommand,
        },
      };
    }

    while (attempts < retry.maxAttempts) {
      this.assertNotAborted(context.signal);
      attempts += 1;

      try {
        const result = await resolved.definition.handler(resolvedParams, {
          runId: context.runId,
          workflowName: context.workflowName,
          stepId: context.stepId,
          attempt: attempts,
          inputs: context.inputs,
          state: context.state,
          item: context.item,
          now: context.now,
        });

        if (result?.stateUpdates) {
          Object.assign(context.state, result.stateUpdates);
        }

        if (resolved.definition.idempotent !== false) {
          context.idempotencyCache.set(idempotencyKey, result);
        }

        return {
          definition: resolved.definition,
          result,
          record: {
            command: commandRef.command,
            resolvedCommand: resolved.resolvedCommand,
            params: resolvedParams,
            status: 'succeeded',
            attempts,
            startedAt,
            finishedAt: context.now().toISOString(),
            output: result?.output,
            rollbackCommand,
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        if (attempts >= retry.maxAttempts) {
          return {
            definition: resolved.definition,
            record: {
              command: commandRef.command,
              resolvedCommand: resolved.resolvedCommand,
              params: resolvedParams,
              status: 'failed',
              attempts,
              startedAt,
              finishedAt: context.now().toISOString(),
              error: msg,
              rollbackCommand,
            },
          };
        }

        options.onRetry?.({
          stepId: context.stepId,
          command: commandRef.command,
          attempt: attempts,
          error: msg,
        });

        const base = Math.max(0, retry.backoffMs);
        if (base > 0) {
          const waitMs = Math.min(base * attempts, Math.max(base, retry.maxBackoffMs));
          await this.sleep(waitMs);
        }
      }
    }

    return {
      definition: resolved.definition,
      record: {
        command: commandRef.command,
        resolvedCommand: resolved.resolvedCommand,
        params: resolvedParams,
        status: 'failed',
        attempts,
        startedAt,
        finishedAt: context.now().toISOString(),
        error: 'Unknown execution failure',
        rollbackCommand,
      },
    };
  }

  private assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Workflow execution aborted by signal');
    }
  }
}

// ============================================================================
// Progress Tracker
// ============================================================================

export class WorkflowProgressTracker extends EventEmitter {
  private readonly now: () => Date;
  private snapshotState: WorkflowProgressSnapshot;

  constructor(config: {
    runId: string;
    workflowName: string;
    totalUnits: number;
    now?: () => Date;
  }) {
    super();
    this.now = config.now ?? (() => new Date());

    this.snapshotState = {
      runId: config.runId,
      workflowName: config.workflowName,
      status: 'idle',
      totalUnits: Math.max(1, config.totalUnits),
      completedUnits: 0,
      failedUnits: 0,
      percent: 0,
      updatedAt: this.now().toISOString(),
    };
  }

  snapshot(): WorkflowProgressSnapshot {
    return { ...this.snapshotState };
  }

  runStarted(): void {
    this.snapshotState.status = 'running';
    this.snapshotState.startedAt = this.now().toISOString();
    this.publish('run-started', {});
  }

  stepStarted(stepId: string): void {
    this.snapshotState.currentStepId = stepId;
    this.publish('step-started', { stepId });
  }

  stepCompleted(stepId: string, units = 1): void {
    this.snapshotState.completedUnits += Math.max(0, units);
    this.publish('step-completed', { stepId });
  }

  stepFailed(stepId: string, error: string, units = 1): void {
    this.snapshotState.failedUnits += Math.max(0, units);
    this.publish('step-failed', { stepId, error });
  }

  retry(stepId: string, command: string, attempt: number, error: string): void {
    this.publish('retry', { stepId, command, attempt, error });
  }

  batchItem(stepId: string, index: number, total: number, succeeded: number, failed: number): void {
    this.snapshotState.completedUnits = Math.min(this.snapshotState.totalUnits, this.snapshotState.completedUnits + 1);
    this.publish('batch-item-completed', {
      stepId,
      batch: { stepId, index, total, succeeded, failed },
    });
  }

  rollbackStarted(stepId: string): void {
    this.publish('rollback-started', { stepId });
  }

  rollbackCompleted(stepId: string, error?: string): void {
    this.publish('rollback-completed', { stepId, error });
  }

  runCompleted(): void {
    this.snapshotState.status = 'succeeded';
    this.snapshotState.currentStepId = undefined;
    this.snapshotState.finishedAt = this.now().toISOString();
    this.snapshotState.completedUnits = this.snapshotState.totalUnits;
    this.publish('run-completed', {});
  }

  runFailed(error: string): void {
    this.snapshotState.status = 'failed';
    this.snapshotState.finishedAt = this.now().toISOString();
    this.publish('run-failed', { error });
  }

  private publish(type: WorkflowProgressEventType, extra: Omit<WorkflowProgressEvent, 'type' | 'timestamp' | 'snapshot'> | Record<string, never>): void {
    this.snapshotState.updatedAt = this.now().toISOString();
    const total = Math.max(1, this.snapshotState.totalUnits);
    const done = Math.max(0, this.snapshotState.completedUnits + this.snapshotState.failedUnits);
    this.snapshotState.percent = Math.min(100, Math.round((done / total) * 100));

    const event: WorkflowProgressEvent = {
      type,
      timestamp: this.now().toISOString(),
      snapshot: this.snapshot(),
      ...(extra as Omit<WorkflowProgressEvent, 'type' | 'timestamp' | 'snapshot'>),
    };

    this.emit('progress', event);
  }
}

// ============================================================================
// Batch Processor
// ============================================================================

class BatchExecutionError extends Error {
  readonly result: BatchProcessingResult;

  constructor(message: string, result: BatchProcessingResult) {
    super(message);
    this.name = 'BatchExecutionError';
    this.result = result;
  }
}

export class BatchWorkflowProcessor {
  private readonly engine: CommandCompositionEngine;

  constructor(engine: CommandCompositionEngine) {
    this.engine = engine;
  }

  async run(
    step: WorkflowBatchStepDefinition,
    context: CompositionContext,
    options: {
      onRetry?: (event: { stepId: string; command: string; attempt: number; error: string }) => void;
      onItemProgress?: (event: { index: number; total: number; succeeded: number; failed: number }) => void;
    } = {}
  ): Promise<{ result: BatchProcessingResult; records: CommandExecutionWithDefinition[] }> {
    const raw = getPathValue(context.inputs, step.itemsPath);
    if (!Array.isArray(raw)) {
      throw new Error(`Batch step '${step.id}' expected array at inputs.${step.itemsPath}`);
    }

    const items = raw;
    const total = items.length;
    const concurrency = Math.max(1, Math.floor(step.concurrency ?? 1));

    const itemResults: BatchItemResult[] = [];
    const allRecords: CommandExecutionWithDefinition[] = [];

    let nextIndex = 0;
    let succeeded = 0;
    let failed = 0;
    let hardFailure = false;

    const worker = async () => {
      while (true) {
        if (hardFailure) return;

        const idx = nextIndex;
        nextIndex += 1;
        if (idx >= total) return;

        const item = items[idx];
        try {
          const out = await this.engine.execute(
            step.commands,
            {
              ...context,
              stepId: `${step.id}[${idx}]`,
              item,
            },
            {
              mode: step.mode ?? 'sequential',
              defaultRetry: step.retry,
              onRetry: options.onRetry,
            }
          );

          if (out.records.some((r) => r.record.status === 'failed')) {
            throw new Error(`One or more commands failed for batch item ${idx}`);
          }

          succeeded += 1;
          allRecords.push(...out.records);
          itemResults.push({
            index: idx,
            item,
            status: 'succeeded',
            commands: out.records.map((r) => r.record),
          });

          options.onItemProgress?.({ index: idx, total, succeeded, failed });
        } catch (error) {
          failed += 1;
          itemResults.push({
            index: idx,
            item,
            status: 'failed',
            commands: [],
            error: error instanceof Error ? error.message : String(error),
          });

          options.onItemProgress?.({ index: idx, total, succeeded, failed });

          if (!step.continueOnItemFailure) {
            hardFailure = true;
            return;
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, Math.max(total, 1)) }, () => worker());
    await Promise.all(workers);

    itemResults.sort((a, b) => a.index - b.index);

    const result: BatchProcessingResult = {
      totalItems: total,
      succeeded,
      failed,
      itemResults,
    };

    if (failed > 0 && !step.continueOnItemFailure) {
      throw new BatchExecutionError(`Batch step '${step.id}' failed (${failed}/${total} items failed)`, result);
    }

    return { result, records: allRecords };
  }
}

// ============================================================================
// Workflow Macro System
// ============================================================================

interface ExecutedStepRecord {
  stepId: string;
  executedCommands: CommandExecutionWithDefinition[];
  rollback?: WorkflowCommandReference[];
  item?: unknown;
}

export interface WorkflowMacroSystemConfig {
  commandLibrary?: ShortcutCommandLibrary;
  workflows?: WorkflowDefinition[];
  includePrebuiltWorkflows?: boolean;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  logger?: WorkflowLogger;
}

export interface WorkflowRunOptions {
  inputs?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  dryRun?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: WorkflowProgressEvent) => void;
}

export class WorkflowMacroSystem {
  private readonly registry = new Map<string, WorkflowDefinition>();
  private readonly now: () => Date;
  private readonly logger: WorkflowLogger;

  readonly commandLibrary: ShortcutCommandLibrary;
  readonly compositionEngine: CommandCompositionEngine;
  readonly batchProcessor: BatchWorkflowProcessor;

  constructor(config: WorkflowMacroSystemConfig = {}) {
    this.now = config.now ?? (() => new Date());
    this.logger = config.logger ?? defaultLogger;

    this.commandLibrary = config.commandLibrary ?? createDefaultShortcutLibrary({ now: this.now });
    this.compositionEngine = new CommandCompositionEngine({
      library: this.commandLibrary,
      now: this.now,
      sleep: config.sleep,
    });
    this.batchProcessor = new BatchWorkflowProcessor(this.compositionEngine);

    const includePrebuilt = config.includePrebuiltWorkflows ?? true;
    if (includePrebuilt) this.registerWorkflows(PREBUILT_WORKFLOWS);
    if (config.workflows?.length) this.registerWorkflows(config.workflows);
  }

  registerWorkflow(definition: WorkflowDefinition): void {
    if (!definition.name) throw new Error('WorkflowDefinition.name is required');
    if (!definition.steps?.length) throw new Error(`Workflow '${definition.name}' must include at least one step`);

    const ids = new Set<string>();
    for (const step of definition.steps) {
      if (ids.has(step.id)) throw new Error(`Workflow '${definition.name}' has duplicate step id '${step.id}'`);
      ids.add(step.id);
      if (!step.commands?.length) throw new Error(`Workflow '${definition.name}' step '${step.id}' has no commands`);
    }

    this.registry.set(definition.name, cloneValue(definition));
  }

  registerWorkflows(definitions: WorkflowDefinition[]): void {
    for (const def of definitions) this.registerWorkflow(def);
  }

  listWorkflows(): Array<Pick<WorkflowDefinition, 'name' | 'description' | 'version' | 'tags'>> {
    return [...this.registry.values()]
      .map((workflow) => ({
        name: workflow.name,
        description: workflow.description,
        version: workflow.version,
        tags: workflow.tags,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getWorkflow(name: string): WorkflowDefinition | undefined {
    const def = this.registry.get(name);
    return def ? cloneValue(def) : undefined;
  }

  async execute(name: string, options: WorkflowRunOptions = {}): Promise<WorkflowRunResult> {
    const workflow = this.registry.get(name);
    if (!workflow) throw new Error(`Workflow not found: ${name}`);

    const runId = crypto.randomUUID();
    const startedAt = this.now().toISOString();

    const inputs: Record<string, unknown> = {
      ...(cloneValue(workflow.defaults) as Record<string, unknown> | undefined),
      ...(cloneValue(options.inputs) as Record<string, unknown> | undefined),
    };

    const state: Record<string, unknown> = {
      ...(cloneValue(options.initialState) as Record<string, unknown> | undefined),
    };

    const totalUnits = estimateTotalUnits(workflow, inputs);
    const progress = new WorkflowProgressTracker({
      runId,
      workflowName: workflow.name,
      totalUnits,
      now: this.now,
    });

    if (options.onProgress) progress.on('progress', options.onProgress);
    progress.runStarted();

    const runContextBase: Omit<CompositionContext, 'stepId'> = {
      runId,
      workflowName: workflow.name,
      inputs,
      state,
      now: this.now,
      idempotencyCache: new Map<string, CommandResult>(),
      signal: options.signal,
    };

    const stepResults: WorkflowStepRunRecord[] = [];
    const executedStack: ExecutedStepRecord[] = [];

    const rollback: WorkflowRollbackResult = {
      attempted: false,
      succeeded: true,
      errors: [],
    };

    try {
      for (const step of workflow.steps) {
        this.assertNotAborted(options.signal);

        const shouldRun = evaluateCondition(step.condition, {
          workflowName: workflow.name,
          inputs,
          state,
        });

        progress.stepStarted(step.id);

        const stepStartedAt = this.now().toISOString();

        if (!shouldRun) {
          progress.stepCompleted(step.id, 1);
          stepResults.push({
            stepId: step.id,
            type: step.type === 'batch' ? 'batch' : 'commands',
            status: 'skipped',
            startedAt: stepStartedAt,
            finishedAt: this.now().toISOString(),
            commands: [],
          });
          continue;
        }

        if (options.dryRun) {
          const dryUnits = step.type === 'batch'
            ? Math.max(1, resolveBatchItems(step, inputs).length)
            : 1;

          progress.stepCompleted(step.id, dryUnits);
          stepResults.push({
            stepId: step.id,
            type: step.type === 'batch' ? 'batch' : 'commands',
            status: 'skipped',
            startedAt: stepStartedAt,
            finishedAt: this.now().toISOString(),
            commands: [],
          });
          continue;
        }

        try {
          if (step.type === 'batch') {
            const batch = await this.batchProcessor.run(
              step,
              {
                ...runContextBase,
                stepId: step.id,
              },
              {
                onRetry: (retry) => progress.retry(retry.stepId, retry.command, retry.attempt, retry.error),
                onItemProgress: (event) => {
                  progress.batchItem(step.id, event.index, event.total, event.succeeded, event.failed);
                },
              }
            );

            stepResults.push({
              stepId: step.id,
              type: 'batch',
              status: batch.result.failed > 0 ? 'failed' : 'succeeded',
              startedAt: stepStartedAt,
              finishedAt: this.now().toISOString(),
              commands: batch.records.map((r) => r.record),
              batch: batch.result,
              ...(batch.result.failed > 0 ? { error: `${batch.result.failed} batch items failed` } : {}),
            });

            executedStack.push({
              stepId: step.id,
              executedCommands: batch.records,
              rollback: step.rollback,
            });

            if (batch.result.failed > 0 && !step.continueOnItemFailure) {
              throw new Error(`Batch step failed: ${batch.result.failed} items`);
            }

            const units = Math.max(1, batch.result.totalItems);
            progress.stepCompleted(step.id, units);
          } else {
            const out = await this.compositionEngine.execute(
              step.commands,
              {
                ...runContextBase,
                stepId: step.id,
              },
              {
                mode: step.mode ?? 'sequential',
                defaultRetry: step.retry,
                onRetry: (retry) => progress.retry(retry.stepId, retry.command, retry.attempt, retry.error),
              }
            );

            const failed = out.records.find((r) => r.record.status === 'failed');
            if (failed) {
              throw new Error(`Command failed: ${failed.record.command} (${failed.record.error ?? 'unknown error'})`);
            }

            stepResults.push({
              stepId: step.id,
              type: 'commands',
              status: 'succeeded',
              startedAt: stepStartedAt,
              finishedAt: this.now().toISOString(),
              commands: out.records.map((r) => r.record),
            });

            executedStack.push({
              stepId: step.id,
              executedCommands: out.records,
              rollback: step.rollback,
            });

            progress.stepCompleted(step.id, 1);
          }
        } catch (stepError) {
          const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
          const result = stepError instanceof BatchExecutionError ? stepError.result : undefined;

          progress.stepFailed(
            step.id,
            errorMsg,
            step.type === 'batch' ? Math.max(1, result?.totalItems ?? 1) : 1
          );

          stepResults.push({
            stepId: step.id,
            type: step.type === 'batch' ? 'batch' : 'commands',
            status: 'failed',
            startedAt: stepStartedAt,
            finishedAt: this.now().toISOString(),
            commands: [],
            ...(result ? { batch: result } : {}),
            error: errorMsg,
          });

          const onError = step.onError ?? 'abort';
          if (onError === 'continue') {
            continue;
          }

          const shouldRollback = onError === 'rollback' || workflow.rollbackOnFailure !== false;
          if (shouldRollback) {
            rollback.attempted = true;
            progress.rollbackStarted(step.id);
            const rollbackErrors = await this.rollbackStack(
              executedStack,
              runContextBase,
              progress
            );

            rollback.errors.push(...rollbackErrors);
            rollback.succeeded = rollbackErrors.length === 0;
            progress.rollbackCompleted(step.id, rollbackErrors.length ? rollbackErrors.join('; ') : undefined);
          }

          progress.runFailed(errorMsg);

          const finishedAt = this.now().toISOString();
          return {
            runId,
            workflowName: workflow.name,
            status: 'failed',
            startedAt,
            finishedAt,
            durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
            inputs,
            state,
            steps: stepResults,
            rollback,
            progress: progress.snapshot(),
            error: errorMsg,
          };
        }
      }

      progress.runCompleted();

      const finishedAt = this.now().toISOString();
      return {
        runId,
        workflowName: workflow.name,
        status: options.dryRun ? 'dry-run' : 'succeeded',
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        inputs,
        state,
        steps: stepResults,
        rollback,
        progress: progress.snapshot(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error?.('Workflow macro execution failed unexpectedly', {
        workflow: workflow.name,
        runId,
        error: msg,
      });

      progress.runFailed(msg);
      const finishedAt = this.now().toISOString();
      return {
        runId,
        workflowName: workflow.name,
        status: 'failed',
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        inputs,
        state,
        steps: stepResults,
        rollback,
        progress: progress.snapshot(),
        error: msg,
      };
    }
  }

  private async rollbackStack(
    stack: ExecutedStepRecord[],
    context: Omit<CompositionContext, 'stepId'>,
    progress: WorkflowProgressTracker
  ): Promise<string[]> {
    const errors: string[] = [];

    for (const item of [...stack].reverse()) {
      this.assertNotAborted(context.signal);

      if (item.rollback?.length) {
        try {
          const out = await this.compositionEngine.execute(
            item.rollback,
            {
              ...context,
              stepId: `${item.stepId}:rollback`,
              item: item.item,
            },
            {
              mode: 'sequential',
              defaultRetry: { maxAttempts: 1, backoffMs: 0, maxBackoffMs: 0 },
            }
          );

          const failed = out.records.filter((record) => record.record.status === 'failed');
          for (const fail of failed) {
            errors.push(`${item.stepId}:rollback:${fail.record.command}: ${fail.record.error ?? 'unknown error'}`);
          }
        } catch (error) {
          errors.push(
            `${item.stepId}:rollback: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const rollbackErrors = await this.compositionEngine.rollback(
        item.executedCommands,
        {
          ...context,
          stepId: item.stepId,
          item: item.item,
        },
        {
          onRollbackError: (event) => {
            progress.retry(`${event.stepId}:rollback`, event.command, 1, event.error);
          },
        }
      );

      errors.push(...rollbackErrors);
    }

    return errors;
  }

  private assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Workflow execution aborted by signal');
  }
}

// ============================================================================
// Default Shortcut Command Library
// ============================================================================

export function createDefaultShortcutLibrary(config: { now?: () => Date } = {}): ShortcutCommandLibrary {
  const now = config.now ?? (() => new Date());
  const library = new ShortcutCommandLibrary();
  registerDefaultCommandsAndShortcuts(library, now);
  return library;
}
