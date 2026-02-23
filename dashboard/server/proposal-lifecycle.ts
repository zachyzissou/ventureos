/**
 * Proposal → Mission → Step closed-loop lifecycle engine (Issue #227).
 *
 * Responsibilities:
 * - Track structured proposals with explicit approval gate.
 * - Materialize approved proposals into mission step plans.
 * - Execute mission steps in dependency order with cross-agent handoffs.
 * - Persist history + event log for dashboard/API consumers.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';
export type ProposalRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type MissionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
export type ProposalReviewAction = 'approve' | 'reject' | 'modify';

export interface ProposalRiskAssessment {
  level: ProposalRiskLevel;
  summary: string;
  mitigations: string[];
}

export interface ProposalStepTemplate {
  stepId: string;
  title: string;
  description: string;
  agentId: string;
  dependsOnStepIds: string[];
  expectedOutcome?: string;
  simulateFailure?: boolean;
}

export interface WorkProposal {
  proposalId: string;
  title: string;
  goal: string;
  submittedByAgentId: string;
  estimatedCostUsd: number;
  requiredSkills: string[];
  riskAssessment: ProposalRiskAssessment;
  steps: ProposalStepTemplate[];
  status: ProposalStatus;
  missionId?: string;
  createdAt: string;
  updatedAt: string;
  review?: {
    action: ProposalReviewAction;
    reviewerId: string;
    notes?: string;
    reviewedAt: string;
  };
}

export interface MissionStep {
  stepId: string;
  order: number;
  title: string;
  description: string;
  agentId: string;
  dependsOnStepIds: string[];
  status: StepStatus;
  expectedOutcome?: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  simulateFailure?: boolean;
}

export interface ProposalMission {
  missionId: string;
  proposalId: string;
  title: string;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  currentStepId?: string;
  steps: MissionStep[];
}

export type ProposalLifecycleEventType =
  | 'proposal.submitted'
  | 'proposal.reviewed'
  | 'mission.created'
  | 'mission.started'
  | 'step.assigned'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'step.handoff'
  | 'mission.completed'
  | 'mission.failed';

export interface ProposalLifecycleEvent {
  eventId: string;
  type: ProposalLifecycleEventType;
  ts: string;
  proposalId?: string;
  missionId?: string;
  stepId?: string;
  agentId?: string;
  toAgentId?: string;
  payload?: Record<string, unknown>;
}

interface ProposalLifecycleStore {
  version: 1;
  proposals: WorkProposal[];
  missions: ProposalMission[];
  events: ProposalLifecycleEvent[];
}

export interface SubmitProposalInput {
  title: string;
  goal: string;
  submittedByAgentId: string;
  estimatedCostUsd: number;
  requiredSkills: string[];
  riskAssessment: ProposalRiskAssessment;
  steps: Array<{
    stepId?: string;
    title: string;
    description: string;
    agentId: string;
    dependsOnStepIds?: string[];
    expectedOutcome?: string;
    simulateFailure?: boolean;
  }>;
}

export interface ProposalPatchInput {
  title?: string;
  goal?: string;
  estimatedCostUsd?: number;
  requiredSkills?: string[];
  riskAssessment?: Partial<ProposalRiskAssessment>;
  steps?: SubmitProposalInput['steps'];
}

export interface ReviewProposalInput {
  action: ProposalReviewAction;
  reviewerId: string;
  notes?: string;
  modifications?: ProposalPatchInput;
  autoStart?: boolean;
}

export interface StartMissionInput {
  missionId: string;
}

export interface ProposalLifecycleSummary {
  pendingProposals: WorkProposal[];
  activeMissions: ProposalMission[];
  recentEvents: ProposalLifecycleEvent[];
  stats: {
    totalProposals: number;
    totalMissions: number;
    pendingApprovals: number;
    runningMissions: number;
  };
}

interface ProposalLifecycleEngineOptions {
  now?: () => Date;
  stepDelayMs?: number;
}

const STORE_FILE = 'proposal-lifecycle.json';
const MAX_EVENTS = 2000;
const DEFAULT_STEP_DELAY_MS = 30;

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function sanitizeText(input: unknown, fallback = ''): string {
  if (typeof input !== 'string') return fallback;
  return input.trim();
}

function sanitizeId(input: unknown, fallbackPrefix: string): string {
  const cleaned = sanitizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || `${fallbackPrefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function clampNonNegativeNumber(input: unknown, fallback = 0): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n);
}

function uniqueStrings(values: unknown[], limit = 30): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = sanitizeText(value).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readStore(storePath: string): ProposalLifecycleStore {
  try {
    if (!fs.existsSync(storePath)) {
      return { version: 1, proposals: [], missions: [], events: [] };
    }
    const raw = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<ProposalLifecycleStore>;
    return {
      version: 1,
      proposals: Array.isArray(raw.proposals) ? raw.proposals : [],
      missions: Array.isArray(raw.missions) ? raw.missions : [],
      events: Array.isArray(raw.events) ? raw.events : [],
    };
  } catch {
    return { version: 1, proposals: [], missions: [], events: [] };
  }
}

function normalizeRiskAssessment(input: Partial<ProposalRiskAssessment> | undefined): ProposalRiskAssessment {
  const levelRaw = sanitizeText(input?.level, 'medium').toLowerCase();
  const level: ProposalRiskLevel =
    levelRaw === 'low' || levelRaw === 'medium' || levelRaw === 'high' || levelRaw === 'critical'
      ? levelRaw
      : 'medium';

  return {
    level,
    summary: sanitizeText(input?.summary, 'Risk review pending'),
    mitigations: uniqueStrings(Array.isArray(input?.mitigations) ? input.mitigations : []),
  };
}

function normalizeSteps(stepsInput: SubmitProposalInput['steps']): ProposalStepTemplate[] {
  if (!Array.isArray(stepsInput) || stepsInput.length === 0) {
    throw new Error('Proposal must define at least one step');
  }

  const normalized = stepsInput.map((raw, idx) => {
    const stepId = sanitizeId(raw.stepId, `step-${idx + 1}`);
    const title = sanitizeText(raw.title);
    const description = sanitizeText(raw.description);
    const agentId = sanitizeId(raw.agentId, 'agent');

    if (!title) throw new Error(`Step ${idx + 1} is missing title`);
    if (!description) throw new Error(`Step ${idx + 1} is missing description`);

    return {
      stepId,
      title,
      description,
      agentId,
      dependsOnStepIds: Array.isArray(raw.dependsOnStepIds)
        ? raw.dependsOnStepIds.map((value) => sanitizeId(value, 'step')).filter(Boolean)
        : [],
      expectedOutcome: sanitizeText(raw.expectedOutcome) || undefined,
      simulateFailure: raw.simulateFailure === true,
    } satisfies ProposalStepTemplate;
  });

  const existingIds = new Set(normalized.map((s) => s.stepId));
  for (const step of normalized) {
    step.dependsOnStepIds = step.dependsOnStepIds.filter((id) => id !== step.stepId && existingIds.has(id));
  }

  // Default to sequential chain when dependencies are omitted.
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i].dependsOnStepIds.length === 0 && i > 0) {
      normalized[i].dependsOnStepIds = [normalized[i - 1].stepId];
    }
  }

  return normalized;
}

function proposalToMission(proposal: WorkProposal, ts: string): ProposalMission {
  return {
    missionId: `mission-${crypto.randomUUID().slice(0, 8)}`,
    proposalId: proposal.proposalId,
    title: proposal.title,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
    steps: proposal.steps.map((step, index) => ({
      stepId: step.stepId,
      order: index + 1,
      title: step.title,
      description: step.description,
      agentId: step.agentId,
      dependsOnStepIds: step.dependsOnStepIds.slice(),
      status: 'pending',
      expectedOutcome: step.expectedOutcome,
      simulateFailure: step.simulateFailure,
    })),
  };
}

function dependenciesSatisfied(step: MissionStep, completedStepIds: Set<string>): boolean {
  return step.dependsOnStepIds.every((dep) => completedStepIds.has(dep));
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ProposalLifecycleEngine extends EventEmitter {
  private readonly storePath: string;
  private readonly now: () => Date;
  private readonly stepDelayMs: number;
  private readonly runningMissions = new Set<string>();
  private store: ProposalLifecycleStore;

  constructor(dataDir: string, opts: ProposalLifecycleEngineOptions = {}) {
    super();
    this.storePath = path.join(dataDir, STORE_FILE);
    this.now = opts.now ?? (() => new Date());
    this.stepDelayMs = Math.max(0, Math.min(5000, Math.trunc(opts.stepDelayMs ?? DEFAULT_STEP_DELAY_MS)));
    this.store = readStore(this.storePath);
  }

  listProposals(filter: { status?: ProposalStatus; limit?: number } = {}): WorkProposal[] {
    const limit = Math.max(1, Math.min(500, Math.trunc(filter.limit ?? 200)));
    const status = sanitizeText(filter.status);
    const proposals = this.store.proposals
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .filter((proposal) => !status || proposal.status === status);
    return deepClone(proposals.slice(0, limit));
  }

  getProposal(proposalId: string): WorkProposal | null {
    const found = this.store.proposals.find((proposal) => proposal.proposalId === proposalId);
    return found ? deepClone(found) : null;
  }

  submitProposal(input: SubmitProposalInput): WorkProposal {
    const title = sanitizeText(input.title);
    const goal = sanitizeText(input.goal);
    const submittedByAgentId = sanitizeId(input.submittedByAgentId, 'agent');
    if (!title) throw new Error('Proposal title is required');
    if (!goal) throw new Error('Proposal goal is required');

    const ts = nowIso(this.now);
    const proposal: WorkProposal = {
      proposalId: `proposal-${crypto.randomUUID().slice(0, 8)}`,
      title,
      goal,
      submittedByAgentId,
      estimatedCostUsd: clampNonNegativeNumber(input.estimatedCostUsd, 0),
      requiredSkills: uniqueStrings(Array.isArray(input.requiredSkills) ? input.requiredSkills : []),
      riskAssessment: normalizeRiskAssessment(input.riskAssessment),
      steps: normalizeSteps(input.steps),
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    };

    this.store.proposals.push(proposal);
    this.pushEvent({
      type: 'proposal.submitted',
      ts,
      proposalId: proposal.proposalId,
      payload: {
        title: proposal.title,
        submittedByAgentId: proposal.submittedByAgentId,
        estimatedCostUsd: proposal.estimatedCostUsd,
      },
    });
    this.persist();
    return deepClone(proposal);
  }

  reviewProposal(proposalId: string, review: ReviewProposalInput): {
    proposal: WorkProposal;
    mission?: ProposalMission;
  } {
    const proposal = this.store.proposals.find((item) => item.proposalId === proposalId);
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
    if (proposal.status === 'approved' || proposal.status === 'rejected') {
      throw new Error(`Proposal already finalized with status: ${proposal.status}`);
    }

    const action = sanitizeText(review.action).toLowerCase();
    if (action !== 'approve' && action !== 'reject' && action !== 'modify') {
      throw new Error(`Unsupported review action: ${review.action}`);
    }
    const reviewerId = sanitizeId(review.reviewerId, 'human');
    const notes = sanitizeText(review.notes) || undefined;

    if (review.modifications) {
      this.applyProposalPatch(proposal, review.modifications);
    }

    const ts = nowIso(this.now);
    proposal.status = action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : 'needs_changes';
    proposal.updatedAt = ts;
    proposal.review = {
      action,
      reviewerId,
      notes,
      reviewedAt: ts,
    };

    this.pushEvent({
      type: 'proposal.reviewed',
      ts,
      proposalId: proposal.proposalId,
      payload: {
        action,
        reviewerId,
        notes,
      },
    });

    let mission: ProposalMission | undefined;
    if (proposal.status === 'approved') {
      mission = proposalToMission(proposal, ts);
      proposal.missionId = mission.missionId;
      this.store.missions.push(mission);
      this.pushEvent({
        type: 'mission.created',
        ts,
        proposalId: proposal.proposalId,
        missionId: mission.missionId,
        payload: {
          title: mission.title,
          stepCount: mission.steps.length,
        },
      });

      const autoStart = review.autoStart !== false;
      if (autoStart) {
        mission = this.startMission({ missionId: mission.missionId });
      }
    }

    this.persist();
    return {
      proposal: deepClone(proposal),
      mission: mission ? deepClone(mission) : undefined,
    };
  }

  listMissions(filter: { status?: MissionStatus; limit?: number } = {}): ProposalMission[] {
    const limit = Math.max(1, Math.min(500, Math.trunc(filter.limit ?? 200)));
    const status = sanitizeText(filter.status);
    const missions = this.store.missions
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .filter((mission) => !status || mission.status === status);
    return deepClone(missions.slice(0, limit));
  }

  getMission(missionId: string): ProposalMission | null {
    const mission = this.store.missions.find((item) => item.missionId === missionId);
    return mission ? deepClone(mission) : null;
  }

  startMission(input: StartMissionInput): ProposalMission {
    const mission = this.store.missions.find((item) => item.missionId === input.missionId);
    if (!mission) throw new Error(`Mission not found: ${input.missionId}`);
    if (mission.status === 'running' || mission.status === 'completed') return deepClone(mission);
    if (mission.status === 'failed') throw new Error(`Mission already failed: ${input.missionId}`);

    const proposal = this.store.proposals.find((item) => item.proposalId === mission.proposalId);
    if (!proposal || proposal.status !== 'approved') {
      throw new Error('Mission cannot start before proposal approval');
    }

    const ts = nowIso(this.now);
    mission.status = 'running';
    mission.startedAt = mission.startedAt ?? ts;
    mission.updatedAt = ts;
    mission.currentStepId = mission.currentStepId ?? mission.steps.find((step) => step.status === 'pending')?.stepId;

    this.pushEvent({
      type: 'mission.started',
      ts,
      proposalId: mission.proposalId,
      missionId: mission.missionId,
      payload: {
        title: mission.title,
      },
    });
    this.persist();
    this.scheduleMissionExecution(mission.missionId);
    return deepClone(mission);
  }

  listEvents(filter: { missionId?: string; proposalId?: string; limit?: number } = {}): ProposalLifecycleEvent[] {
    const limit = Math.max(1, Math.min(1000, Math.trunc(filter.limit ?? 200)));
    const missionId = sanitizeText(filter.missionId);
    const proposalId = sanitizeText(filter.proposalId);
    const events = this.store.events
      .slice()
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .filter((event) => (!missionId || event.missionId === missionId) && (!proposalId || event.proposalId === proposalId));
    return deepClone(events.slice(0, limit));
  }

  getSummary(): ProposalLifecycleSummary {
    const pendingProposals = this.store.proposals
      .filter((proposal) => proposal.status === 'pending' || proposal.status === 'needs_changes')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 25);
    const activeMissions = this.store.missions
      .filter((mission) => mission.status === 'running' || mission.status === 'pending' || mission.status === 'blocked')
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 20);
    const recentEvents = this.store.events
      .slice()
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 80);

    return deepClone({
      pendingProposals,
      activeMissions,
      recentEvents,
      stats: {
        totalProposals: this.store.proposals.length,
        totalMissions: this.store.missions.length,
        pendingApprovals: this.store.proposals.filter((proposal) => proposal.status === 'pending').length,
        runningMissions: this.store.missions.filter((mission) => mission.status === 'running').length,
      },
    });
  }

  subscribe(listener: (event: ProposalLifecycleEvent) => void): () => void {
    this.on('event', listener);
    return () => {
      this.off('event', listener);
    };
  }

  private applyProposalPatch(proposal: WorkProposal, patch: ProposalPatchInput): void {
    const nextTitle = sanitizeText(patch.title);
    if (nextTitle) proposal.title = nextTitle;

    const nextGoal = sanitizeText(patch.goal);
    if (nextGoal) proposal.goal = nextGoal;

    if (patch.estimatedCostUsd != null) {
      proposal.estimatedCostUsd = clampNonNegativeNumber(patch.estimatedCostUsd, proposal.estimatedCostUsd);
    }

    if (Array.isArray(patch.requiredSkills)) {
      proposal.requiredSkills = uniqueStrings(patch.requiredSkills);
    }

    if (patch.riskAssessment) {
      proposal.riskAssessment = normalizeRiskAssessment({
        ...proposal.riskAssessment,
        ...patch.riskAssessment,
      });
    }

    if (Array.isArray(patch.steps) && patch.steps.length > 0) {
      proposal.steps = normalizeSteps(patch.steps);
    }
  }

  private scheduleMissionExecution(missionId: string): void {
    if (this.runningMissions.has(missionId)) return;
    this.runningMissions.add(missionId);

    void this.runMission(missionId).finally(() => {
      this.runningMissions.delete(missionId);
    });
  }

  private async runMission(missionId: string): Promise<void> {
    while (true) {
      const mission = this.store.missions.find((item) => item.missionId === missionId);
      if (!mission) return;
      if (mission.status !== 'running') return;

      const completedStepIds = new Set(
        mission.steps.filter((step) => step.status === 'completed').map((step) => step.stepId),
      );

      const pendingSteps = mission.steps.filter((step) => step.status === 'pending');
      if (pendingSteps.length === 0) {
        const ts = nowIso(this.now);
        mission.status = 'completed';
        mission.finishedAt = ts;
        mission.updatedAt = ts;
        mission.currentStepId = undefined;
        this.pushEvent({
          type: 'mission.completed',
          ts,
          missionId: mission.missionId,
          proposalId: mission.proposalId,
          payload: {
            stepCount: mission.steps.length,
          },
        });
        this.persist();
        return;
      }

      const readySteps = pendingSteps
        .filter((step) => dependenciesSatisfied(step, completedStepIds))
        .sort((a, b) => a.order - b.order);

      if (readySteps.length === 0) {
        const ts = nowIso(this.now);
        mission.status = 'blocked';
        mission.updatedAt = ts;
        this.pushEvent({
          type: 'mission.failed',
          ts,
          missionId: mission.missionId,
          proposalId: mission.proposalId,
          payload: {
            reason: 'No runnable steps found. Check dependencies.',
          },
        });
        this.persist();
        return;
      }

      const step = readySteps[0];
      const startedAt = nowIso(this.now);
      mission.currentStepId = step.stepId;
      mission.updatedAt = startedAt;
      step.status = 'running';
      step.startedAt = startedAt;

      this.pushEvent({
        type: 'step.assigned',
        ts: startedAt,
        missionId: mission.missionId,
        proposalId: mission.proposalId,
        stepId: step.stepId,
        agentId: step.agentId,
        payload: {
          order: step.order,
          title: step.title,
        },
      });
      this.pushEvent({
        type: 'step.started',
        ts: startedAt,
        missionId: mission.missionId,
        proposalId: mission.proposalId,
        stepId: step.stepId,
        agentId: step.agentId,
      });
      this.persist();

      await delay(this.stepDelayMs);

      const ts = nowIso(this.now);
      mission.updatedAt = ts;
      if (step.simulateFailure) {
        step.status = 'failed';
        step.finishedAt = ts;
        step.error = 'Simulated step failure';
        mission.status = 'failed';
        mission.finishedAt = ts;
        mission.currentStepId = step.stepId;
        this.pushEvent({
          type: 'step.failed',
          ts,
          missionId: mission.missionId,
          proposalId: mission.proposalId,
          stepId: step.stepId,
          agentId: step.agentId,
          payload: {
            error: step.error,
          },
        });
        this.pushEvent({
          type: 'mission.failed',
          ts,
          missionId: mission.missionId,
          proposalId: mission.proposalId,
          payload: {
            failedStepId: step.stepId,
            failedAgentId: step.agentId,
          },
        });
        this.persist();
        return;
      }

      step.status = 'completed';
      step.finishedAt = ts;
      step.summary = step.expectedOutcome || `Completed by ${step.agentId}`;
      this.pushEvent({
        type: 'step.completed',
        ts,
        missionId: mission.missionId,
        proposalId: mission.proposalId,
        stepId: step.stepId,
        agentId: step.agentId,
        payload: {
          summary: step.summary,
        },
      });

      const completedAfterStep = new Set(
        mission.steps.filter((item) => item.status === 'completed').map((item) => item.stepId),
      );
      const newlyReady = mission.steps
        .filter((item) => item.status === 'pending')
        .filter((item) => dependenciesSatisfied(item, completedAfterStep))
        .sort((a, b) => a.order - b.order);

      for (const nextStep of newlyReady) {
        if (nextStep.agentId !== step.agentId) {
          this.pushEvent({
            type: 'step.handoff',
            ts,
            missionId: mission.missionId,
            proposalId: mission.proposalId,
            stepId: nextStep.stepId,
            agentId: step.agentId,
            toAgentId: nextStep.agentId,
            payload: {
              fromStepId: step.stepId,
              toStepId: nextStep.stepId,
            },
          });
        }
      }

      this.persist();
    }
  }

  private pushEvent(event: Omit<ProposalLifecycleEvent, 'eventId'>): void {
    const next: ProposalLifecycleEvent = {
      ...event,
      eventId: `evt-${crypto.randomUUID().slice(0, 10)}`,
    };
    this.store.events.push(next);
    if (this.store.events.length > MAX_EVENTS) {
      this.store.events.splice(0, this.store.events.length - MAX_EVENTS);
    }
    this.emit('event', deepClone(next));
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf8');
  }
}

const engineCache = new Map<string, ProposalLifecycleEngine>();

export function getProposalLifecycleEngine(
  dataDir: string,
  opts: ProposalLifecycleEngineOptions = {},
): ProposalLifecycleEngine {
  const key = path.resolve(dataDir);
  const cached = engineCache.get(key);
  if (cached) return cached;
  const engine = new ProposalLifecycleEngine(key, opts);
  engineCache.set(key, engine);
  return engine;
}

export function resetProposalLifecycleEngine(dataDir?: string): void {
  if (!dataDir) {
    engineCache.clear();
    return;
  }
  engineCache.delete(path.resolve(dataDir));
}
