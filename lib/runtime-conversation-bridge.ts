/**
 * Runtime Conversation Bridge — VentureOS Issue #184
 *
 * Integrates ConversationEngine into the multi-agent runtime so that
 * real mission orchestration events (task dispatch, handoffs, completion)
 * flow through conversation lifecycle and persist for dashboard visibility
 * + mediation/security context.
 *
 * Architecture:
 * - Provides `MissionRunnerHooks` callback interface for MissionRunner
 * - On mission start: creates a conversation with all squad agents
 * - On task dispatch/completion: sends messages through conversation engine
 * - On mission close/error: closes the conversation
 * - All operations wrapped in try/catch for graceful degradation
 * - Idempotent: uses deterministic conversation IDs based on mission ID
 * - Observable: exposes metrics for ops debugging
 *
 * Fixes #184
 */

import { ConversationAPI, type ConversationEventMap } from './conversation-api';
import type {
  ConversationEngine,
  ConversationId,
  ConversationState,
  ConversationMessage,
} from './conversation-engine';
import type {
  MissionRecord,
  MissionPhase,
  MissionTask,
  TaskRunResult,
  MissionBrief,
} from './mission-state-machine';

// ─── Hook Interfaces ────────────────────────────────────────────────────────

/**
 * Lifecycle hooks for MissionRunner integration.
 * All hooks are optional and async-safe. Errors in hooks do NOT
 * propagate to the mission runner — they are caught and logged.
 */
export interface MissionRunnerHooks {
  onMissionCreated?(mission: MissionRecord): Promise<void>;
  onPhaseTransition?(mission: MissionRecord, from: MissionPhase, to: MissionPhase): Promise<void>;
  onTaskStart?(mission: MissionRecord, task: MissionTask, agentId: string): Promise<void>;
  onTaskComplete?(mission: MissionRecord, task: MissionTask, result: TaskRunResult): Promise<void>;
  onMissionClosed?(mission: MissionRecord): Promise<void>;
  onMissionError?(mission: MissionRecord, error: unknown): Promise<void>;
}

// ─── Metrics ────────────────────────────────────────────────────────────────

export interface BridgeMetrics {
  conversationsCreated: number;
  conversationsClosed: number;
  messagesSent: number;
  messagesBlocked: number;
  hookErrors: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

// ─── Bridge ─────────────────────────────────────────────────────────────────

export interface RuntimeConversationBridgeConfig {
  /** Log prefix for console output. Default: '[conv-bridge]' */
  logPrefix?: string;
  /** If true, suppress console.warn on hook errors. Default: false */
  silent?: boolean;
}

/**
 * Deterministic conversation ID from mission ID for idempotency.
 * This ensures re-running or resuming a mission reuses the same conversation.
 */
export function missionConversationId(missionId: string): ConversationId {
  return `mission_${missionId}`;
}

export class RuntimeConversationBridge implements MissionRunnerHooks {
  private readonly api: ConversationAPI;
  private readonly prefix: string;
  private readonly silent: boolean;

  // Track active mission→conversation mappings
  private activeConversations = new Map<string, ConversationId>();

  // Dedup: track messages already sent to avoid duplicates on resume
  private sentMessageKeys = new Set<string>();

  private metrics: BridgeMetrics = {
    conversationsCreated: 0,
    conversationsClosed: 0,
    messagesSent: 0,
    messagesBlocked: 0,
    hookErrors: 0,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
  };

  constructor(
    api: ConversationAPI,
    config: RuntimeConversationBridgeConfig = {},
  ) {
    this.api = api;
    this.prefix = config.logPrefix ?? '[conv-bridge]';
    this.silent = config.silent ?? false;
  }

  // ─── MissionRunnerHooks Implementation ──────────────────────────────

  async onMissionCreated(mission: MissionRecord): Promise<void> {
    await this.safeExec('onMissionCreated', async () => {
      const convId = missionConversationId(mission.missionId);

      // Check if conversation already exists (idempotent on resume)
      try {
        const existing = await this.api.getConversation(convId);
        if (existing) {
          this.activeConversations.set(mission.missionId, convId);
          this.log(`Reusing existing conversation ${convId} for mission ${mission.missionId}`);
          return;
        }
      } catch {
        // Not found — create new
      }

      // Derive participants from mission plan (if available) or brief
      const participants = this.deriveParticipants(mission);

      const state = await this.api.startConversation({
        conversationId: convId,
        participants: ['system', ...participants],
        currentTurn: 'system',
        metadata: {
          title: `Mission: ${mission.brief?.title ?? mission.missionId}`,
          missionId: mission.missionId,
          source: 'runtime-bridge',
          createdBy: 'RuntimeConversationBridge',
        },
      });

      this.activeConversations.set(mission.missionId, state.conversationId);
      this.metrics.conversationsCreated++;
      this.recordSuccess();
      this.log(`Created conversation ${state.conversationId} for mission ${mission.missionId}`);
    });
  }

  async onPhaseTransition(
    mission: MissionRecord,
    from: MissionPhase,
    to: MissionPhase,
  ): Promise<void> {
    await this.safeExec('onPhaseTransition', async () => {
      const convId = this.getConvId(mission.missionId);
      if (!convId) return;

      const dedup = `phase:${mission.missionId}:${from}:${to}`;
      if (this.sentMessageKeys.has(dedup)) return;

      await this.api.sendMessage({
        conversationId: convId,
        from: 'system',
        to: this.deriveParticipants(mission),
        content: `Mission phase transition: ${from} → ${to}`,
        overrideTurn: true,
      });

      this.sentMessageKeys.add(dedup);
      this.metrics.messagesSent++;
      this.recordSuccess();
    });
  }

  async onTaskStart(
    mission: MissionRecord,
    task: MissionTask,
    agentId: string,
  ): Promise<void> {
    await this.safeExec('onTaskStart', async () => {
      const convId = this.getConvId(mission.missionId);
      if (!convId) return;

      const dedup = `taskstart:${mission.missionId}:${task.taskId}`;
      if (this.sentMessageKeys.has(dedup)) return;

      // Ensure agent is a participant
      try {
        const state = await this.api.getConversation(convId);
        if (!state.participants.includes(agentId)) {
          await this.api.addParticipant(convId, agentId);
        }
      } catch {
        // Best-effort participant add
      }

      await this.api.sendMessage({
        conversationId: convId,
        from: 'system',
        to: [agentId],
        content: `Task dispatched to ${agentId}: ${task.title}\n\n${task.description}`,
        payload: {
          type: 'task_dispatch',
          data: { taskId: task.taskId, role: task.role },
        },
        overrideTurn: true,
      });

      this.sentMessageKeys.add(dedup);
      this.metrics.messagesSent++;
      this.recordSuccess();
    });
  }

  async onTaskComplete(
    mission: MissionRecord,
    task: MissionTask,
    result: TaskRunResult,
  ): Promise<void> {
    await this.safeExec('onTaskComplete', async () => {
      const convId = this.getConvId(mission.missionId);
      if (!convId) return;

      const dedup = `taskcomplete:${mission.missionId}:${task.taskId}:${result.status}`;
      if (this.sentMessageKeys.has(dedup)) return;

      const statusEmoji = result.status === 'succeeded' ? '✓' : result.status === 'failed' ? '✗' : '⊘';
      const summary = result.summary ? `\n\nSummary: ${result.summary}` : '';
      const errorInfo = result.error ? `\n\nError: ${result.error.message}` : '';

      await this.api.sendMessage({
        conversationId: convId,
        from: 'system',
        to: this.deriveParticipants(mission),
        content: `${statusEmoji} Task completed (${result.agentId}): ${task.title} — ${result.status}${summary}${errorInfo}`,
        payload: {
          type: 'task_result',
          data: {
            taskId: task.taskId,
            agentId: result.agentId,
            status: result.status,
            artifactCount: result.artifacts?.length ?? 0,
          },
        },
        overrideTurn: true,
      });

      this.sentMessageKeys.add(dedup);
      this.metrics.messagesSent++;
      this.recordSuccess();
    });
  }

  async onMissionClosed(mission: MissionRecord): Promise<void> {
    await this.safeExec('onMissionClosed', async () => {
      const convId = this.getConvId(mission.missionId);
      if (!convId) return;

      const dedup = `closed:${mission.missionId}`;
      if (this.sentMessageKeys.has(dedup)) return;

      // Send closing message
      await this.api.sendMessage({
        conversationId: convId,
        from: 'system',
        to: this.deriveParticipants(mission),
        content: `Mission closed: ${mission.brief?.title ?? mission.missionId}. Duration: ${mission.metrics?.durationMs ?? 'unknown'}ms`,
        payload: { type: 'mission_closed' },
        overrideTurn: true,
      });

      // Close the conversation
      await this.api.setStatus(convId, 'closed', 'Mission completed');

      this.sentMessageKeys.add(dedup);
      this.activeConversations.delete(mission.missionId);
      this.metrics.conversationsClosed++;
      this.metrics.messagesSent++;
      this.recordSuccess();
    });
  }

  async onMissionError(mission: MissionRecord, error: unknown): Promise<void> {
    await this.safeExec('onMissionError', async () => {
      const convId = this.getConvId(mission.missionId);
      if (!convId) return;

      const dedup = `error:${mission.missionId}:${mission.error?.occurredAt ?? ''}`;
      if (this.sentMessageKeys.has(dedup)) return;

      const errMsg = error instanceof Error ? error.message : String(error);

      await this.api.sendMessage({
        conversationId: convId,
        from: 'system',
        to: this.deriveParticipants(mission),
        content: `⚠ Mission error at phase ${mission.error?.atPhase ?? mission.phase}: ${errMsg}`,
        payload: {
          type: 'mission_error',
          data: {
            phase: mission.error?.atPhase ?? mission.phase,
            code: mission.error?.code,
          },
        },
        overrideTurn: true,
      });

      // Pause conversation (not close — may be resumed)
      await this.api.setStatus(convId, 'paused', `Mission error: ${errMsg}`);

      this.sentMessageKeys.add(dedup);
      this.metrics.messagesSent++;
      this.recordSuccess();
    });
  }

  // ─── Observability ──────────────────────────────────────────────────

  getMetrics(): Readonly<BridgeMetrics> {
    return { ...this.metrics };
  }

  getActiveConversations(): ReadonlyMap<string, ConversationId> {
    return new Map(this.activeConversations);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private getConvId(missionId: string): ConversationId | null {
    return this.activeConversations.get(missionId) ?? null;
  }

  private deriveParticipants(mission: MissionRecord): string[] {
    const agents = new Set<string>();

    // From plan tasks
    if (mission.plan?.tasks) {
      for (const task of mission.plan.tasks) {
        agents.add(task.role);
      }
    }

    // From execution results
    if (mission.execution?.results) {
      for (const result of mission.execution.results) {
        agents.add(result.agentId);
      }
    }

    // Fallback: at least include the general implementation lane.
    if (agents.size === 0) {
      agents.add('venture_delivery');
    }

    return [...agents];
  }

  /**
   * Execute a hook safely — catch all errors so the runtime never
   * breaks due to conversation engine failures.
   */
  private async safeExec(hookName: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err: unknown) {
      this.metrics.hookErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      this.metrics.lastErrorAt = new Date().toISOString();
      this.metrics.lastErrorMessage = `${hookName}: ${msg}`;
      if (!this.silent) {
        console.warn(`${this.prefix} Hook ${hookName} failed (degraded gracefully): ${msg}`);
      }
    }
  }

  private recordSuccess(): void {
    this.metrics.lastSuccessAt = new Date().toISOString();
  }

  private log(msg: string): void {
    if (!this.silent) {
      console.log(`${this.prefix} ${msg}`);
    }
  }
}

export default RuntimeConversationBridge;
