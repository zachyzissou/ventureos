/**
 * Mission Data Provider — Phase 5.5
 *
 * Abstraction layer between the mission visualization system and the
 * data source. Supports:
 * - Mock data for development/testing
 * - REST API integration (when task queue system is available)
 * - WebSocket/SSE for real-time updates (Phase 5.4 integration)
 *
 * The provider emits a normalized MissionData[] array that the
 * rendering pipeline consumes without caring where data comes from.
 */

import type {
  MissionData,
  MissionDependency,
  MissionPhase,
  TaskSummary,
  SquadRole,
  TaskTier,
  TaskStatus,
  MissionHistoryEntry,
} from './types';
import { PHASE_PROGRESS } from './types';

// ═══════════════════════════════════════════
// Provider Interface
// ═══════════════════════════════════════════

export type MissionUpdateCallback = (missions: MissionData[], dependencies: MissionDependency[]) => void;

export interface MissionDataProvider {
  /** Start polling/subscribing for mission data */
  connect(): void;
  /** Stop polling/subscribing */
  disconnect(): void;
  /** Register a listener for data updates */
  onUpdate(callback: MissionUpdateCallback): void;
  /** Remove a listener */
  offUpdate(callback: MissionUpdateCallback): void;
  /** Get current snapshot */
  getMissions(): MissionData[];
  /** Get current dependencies */
  getDependencies(): MissionDependency[];
  /** Force a refresh */
  refresh(): Promise<void>;
}

// ═══════════════════════════════════════════
// Mock Data Provider (Development)
// ═══════════════════════════════════════════

export interface MockProviderConfig {
  /** How often to simulate updates (ms) */
  updateInterval?: number;
  /** Initial mission count */
  initialMissions?: number;
  /** Whether to simulate phase transitions */
  simulateTransitions?: boolean;
}

/**
 * Generates realistic mock mission data for development and testing.
 * Simulates phase transitions, task progress, and dependency chains.
 */
export class MockMissionDataProvider implements MissionDataProvider {
  private missions: MissionData[] = [];
  private dependencies: MissionDependency[] = [];
  private listeners: Set<MissionUpdateCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly config: Required<MockProviderConfig>;
  private tickCount = 0;

  constructor(config: MockProviderConfig = {}) {
    this.config = {
      updateInterval: config.updateInterval ?? 3000,
      initialMissions: config.initialMissions ?? 5,
      simulateTransitions: config.simulateTransitions ?? true,
    };
  }

  connect(): void {
    this.missions = this.generateInitialMissions(this.config.initialMissions);
    this.dependencies = this.generateDependencies(this.missions);
    this.emit();

    if (this.config.simulateTransitions && this.config.updateInterval > 0) {
      this.intervalId = setInterval(() => this.tick(), this.config.updateInterval);
    }
  }

  disconnect(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onUpdate(callback: MissionUpdateCallback): void {
    this.listeners.add(callback);
  }

  offUpdate(callback: MissionUpdateCallback): void {
    this.listeners.delete(callback);
  }

  getMissions(): MissionData[] {
    return [...this.missions];
  }

  getDependencies(): MissionDependency[] {
    return [...this.dependencies];
  }

  async refresh(): Promise<void> {
    this.emit();
  }

  /** Set missions directly (for testing) */
  setMissions(missions: MissionData[], dependencies?: MissionDependency[]): void {
    this.missions = missions;
    if (dependencies) this.dependencies = dependencies;
    this.emit();
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private emit(): void {
    const missions = [...this.missions];
    const deps = [...this.dependencies];
    for (const cb of this.listeners) {
      cb(missions, deps);
    }
  }

  private tick(): void {
    this.tickCount++;

    // Advance a random mission's phase
    const activeMissions = this.missions.filter(
      (m) => m.phase !== 'closed' && m.phase !== 'error'
    );

    if (activeMissions.length > 0) {
      const idx = this.tickCount % activeMissions.length;
      const mission = activeMissions[idx];
      this.advanceMission(mission);
    }

    // Update task progress for executing missions
    for (const m of this.missions) {
      if (m.phase === 'execute') {
        this.tickTaskProgress(m);
      }
    }

    this.emit();
  }

  private advanceMission(mission: MissionData): void {
    const phases: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed'];
    const currentIdx = phases.indexOf(mission.phase);
    if (currentIdx < 0 || currentIdx >= phases.length - 1) return;

    const nextPhase = phases[currentIdx + 1];
    mission.phase = nextPhase;
    mission.progress = PHASE_PROGRESS[nextPhase];
    mission.updatedAt = new Date().toISOString();
    mission.history.push({
      phase: nextPhase,
      enteredAt: mission.updatedAt,
      note: `Auto-transitioned to ${nextPhase}`,
    });
  }

  private tickTaskProgress(mission: MissionData): void {
    for (const task of mission.tasks) {
      if (task.status === 'running' && task.progress !== undefined) {
        task.progress = Math.min(100, task.progress + Math.random() * 15);
        if (task.progress >= 100) {
          task.status = 'succeeded';
        }
      } else if (task.status === 'queued' && Math.random() > 0.7) {
        task.status = 'running';
        task.progress = 0;
      }
    }

    // Recalculate mission progress based on task completion
    const taskProgresses = mission.tasks.map((t) =>
      t.status === 'succeeded' ? 100 : (t.progress ?? 0)
    );
    if (taskProgresses.length > 0) {
      const avgProgress = taskProgresses.reduce((a, b) => a + b, 0) / taskProgresses.length;
      // Blend phase progress with task progress
      const phaseBase = PHASE_PROGRESS[mission.phase];
      const phaseNext = PHASE_PROGRESS[mission.phase === 'execute' ? 'verify' : mission.phase];
      const phaseRange = phaseNext - phaseBase;
      mission.progress = Math.round(phaseBase + (phaseRange * avgProgress) / 100);
    }

    mission.queueDepth = mission.tasks.filter((t) => t.status === 'queued').length;
  }

  private generateInitialMissions(count: number): MissionData[] {
    const missions: MissionData[] = [];
    const phases: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver'];
    const roles: SquadRole[] = ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_delivery'];
    const titles = [
      'Security Audit Sprint',
      'API Gateway Refactor',
      'Dashboard Performance',
      'Queue Integration',
      'Model Router v2',
      'E2E Test Coverage',
      'Documentation Refresh',
      'Affinity Network Bonds',
    ];

    for (let i = 0; i < count; i++) {
      const phase = phases[i % phases.length];
      const assignedRoles = roles.slice(0, 2 + (i % 3)) as SquadRole[];
      const taskCount = 2 + (i % 4);
      const tasks = this.generateTasks(taskCount, phase, assignedRoles);
      const queueDepth = tasks.filter((t) => t.status === 'queued').length;
      const now = new Date();
      const createdAt = new Date(now.getTime() - (count - i) * 3600000).toISOString();

      missions.push({
        missionId: `mission-${String(i + 1).padStart(3, '0')}`,
        title: titles[i % titles.length],
        description: `Phase 5.5 mock mission #${i + 1}`,
        phase,
        progress: PHASE_PROGRESS[phase],
        assignedTo: assignedRoles,
        tasks,
        dependencies: [],
        history: this.generateHistory(phase, createdAt),
        createdAt,
        updatedAt: now.toISOString(),
        queueDepth,
      });
    }

    return missions;
  }

  private generateTasks(
    count: number,
    missionPhase: MissionPhase,
    roles: SquadRole[]
  ): TaskSummary[] {
    const tiers: TaskTier[] = ['P0', 'P1', 'P2', 'P3'];
    const tasks: TaskSummary[] = [];

    for (let i = 0; i < count; i++) {
      let status: TaskStatus;
      let progress: number | undefined;

      if (missionPhase === 'brief' || missionPhase === 'plan') {
        status = 'queued';
        progress = 0;
      } else if (missionPhase === 'execute') {
        const rand = Math.random();
        if (rand < 0.3) { status = 'succeeded'; progress = 100; }
        else if (rand < 0.7) { status = 'running'; progress = Math.round(Math.random() * 80); }
        else { status = 'queued'; progress = 0; }
      } else {
        status = 'succeeded';
        progress = 100;
      }

      tasks.push({
        id: `task-${i + 1}`,
        title: `Task ${i + 1}: ${['Implement', 'Review', 'Test', 'Deploy', 'Document'][i % 5]}`,
        tier: tiers[i % tiers.length],
        status,
        role: roles[i % roles.length],
        progress,
      });
    }

    return tasks;
  }

  private generateHistory(currentPhase: MissionPhase, createdAt: string): MissionHistoryEntry[] {
    const phases: MissionPhase[] = ['brief', 'plan', 'execute', 'verify', 'deliver', 'closed'];
    const idx = phases.indexOf(currentPhase);
    const history: MissionHistoryEntry[] = [];
    const baseTime = new Date(createdAt).getTime();

    for (let i = 0; i <= idx; i++) {
      history.push({
        phase: phases[i],
        enteredAt: new Date(baseTime + i * 600000).toISOString(),
        note: i === 0 ? 'Mission created' : `Transitioned to ${phases[i]}`,
      });
    }

    return history;
  }

  private generateDependencies(missions: MissionData[]): MissionDependency[] {
    if (missions.length < 2) return [];

    const deps: MissionDependency[] = [];
    const types: MissionDependency['type'][] = ['blocks', 'informs', 'feeds'];

    // Create a few dependency links
    for (let i = 1; i < missions.length && i < 4; i++) {
      const dep: MissionDependency = {
        from: missions[i - 1].missionId,
        to: missions[i].missionId,
        type: types[(i - 1) % types.length],
      };
      deps.push(dep);
      missions[i].dependencies.push(missions[i - 1].missionId);
    }

    return deps;
  }
}

// ═══════════════════════════════════════════
// REST API Provider (Production)
// ═══════════════════════════════════════════

export interface ApiProviderConfig {
  /** Base URL for the tactical-map API */
  baseUrl: string;
  /** Bearer token for auth */
  token: string;
  /** Poll interval in ms (0 to disable polling) */
  pollInterval?: number;
}

/**
 * Fetches mission data from the tactical-map REST API.
 * Falls back gracefully to empty state on errors.
 */
export class ApiMissionDataProvider implements MissionDataProvider {
  private missions: MissionData[] = [];
  private dependencies: MissionDependency[] = [];
  private listeners: Set<MissionUpdateCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly config: Required<ApiProviderConfig>;

  constructor(config: ApiProviderConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      token: config.token,
      pollInterval: config.pollInterval ?? 5000,
    };
  }

  connect(): void {
    // Initial fetch
    void this.refresh();

    if (this.config.pollInterval > 0) {
      this.intervalId = setInterval(() => void this.refresh(), this.config.pollInterval);
    }
  }

  disconnect(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onUpdate(callback: MissionUpdateCallback): void {
    this.listeners.add(callback);
  }

  offUpdate(callback: MissionUpdateCallback): void {
    this.listeners.delete(callback);
  }

  getMissions(): MissionData[] {
    return [...this.missions];
  }

  getDependencies(): MissionDependency[] {
    return [...this.dependencies];
  }

  async refresh(): Promise<void> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tactical-map/missions`, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        console.warn(`[MissionProvider] API error: ${res.status}`);
        return;
      }

      const data = await res.json() as {
        missions: MissionData[];
        dependencies: MissionDependency[];
      };

      this.missions = data.missions ?? [];
      this.dependencies = data.dependencies ?? [];
      this.emit();
    } catch (err) {
      console.warn('[MissionProvider] Fetch failed:', err);
    }
  }

  private emit(): void {
    const missions = [...this.missions];
    const deps = [...this.dependencies];
    for (const cb of this.listeners) {
      cb(missions, deps);
    }
  }
}
