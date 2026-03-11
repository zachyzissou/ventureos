/**
 * Synthetic Load Generator for Performance Testing
 *
 * Generates mock agent data, economy states, and health states
 * at configurable scales (100/500/1000 entity equivalents).
 */

// These types mirror the app's types but are self-contained for test use
export interface MockAgentNode {
  id: string;
  position: { x: number; y: number };
  state: 'IDLE' | 'ACTIVE' | 'OVERLOADED' | 'ERROR';
  sessions?: number;
  activeSessions?: Array<{
    id: string;
    label: string;
    startedAt: string;
    estimatedMs?: number;
    progress?: number;
  }>;
}

export interface MockMapState {
  updatedAt: string;
  agents: Record<string, MockAgentNode>;
}

export interface MockEconomyAgent {
  agentId: string;
  budgetUsed: number;
  budgetLimit: number;
  costPerHour: number;
  trend: Array<{ ts: number; value: number }>;
}

export interface MockHealthAgent {
  agentId: string;
  status: 'healthy' | 'degraded' | 'critical';
  connectivity: 'connected' | 'disconnected' | 'unstable';
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    latencyMs: number;
    uptimeMs: number;
  };
}

// Agent IDs matching the actual app
const AGENT_IDS = ['oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'echo', 'nexus'] as const;
const RING_AGENTS = AGENT_IDS.filter(id => id !== 'nexus');
const RING_RADIUS = 350;

// Activity labels for realistic session simulation
const ACTIVITY_LABELS = [
  'Researching API design patterns',
  'Deploying microservice cluster v2.4',
  'Running security audit scan',
  'Executing test suite: integration',
  'Compiling TypeScript bundle',
  'Indexing knowledge base entries',
  'Processing user query: architecture review',
  'Monitoring system health metrics',
  'Analyzing log anomalies',
  'Generating code synthesis output',
];

/**
 * Calculate ring positions for N agents (deterministic).
 */
function circlePositions(count: number, radius: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: Math.round(Math.cos(angle) * radius * 100) / 100,
      y: Math.round(Math.sin(angle) * radius * 100) / 100,
    });
  }
  return positions;
}

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * Ensures reproducible test data across runs.
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Map State Generation
// ---------------------------------------------------------------------------

export type LoadProfile = 'baseline' | 'stress' | 'maximum';

/**
 * Get the entity scaling factor for a load profile.
 *
 * Since the app has a fixed 8-agent architecture, "100/500/1000 agents"
 * is simulated by scaling session counts, particle emissions, and
 * data complexity proportionally:
 *   - baseline (100 equiv):  moderate sessions, light activity
 *   - stress (500 equiv):    heavy sessions, many active
 *   - maximum (1000 equiv):  maximum sessions, all overloaded, peak activity
 */
export function getLoadConfig(profile: LoadProfile) {
  switch (profile) {
    case 'baseline':
      return {
        label: '100 agents equivalent',
        sessionsPerAgent: 2,
        activeRatio: 0.5,
        overloadedRatio: 0,
        errorRatio: 0,
        economyTrendPoints: 16,
        healthAlertCount: 0,
        particleMultiplier: 1,
      };
    case 'stress':
      return {
        label: '500 agents equivalent',
        sessionsPerAgent: 4,
        activeRatio: 0.85,
        overloadedRatio: 0.15,
        errorRatio: 0,
        economyTrendPoints: 48,
        healthAlertCount: 3,
        particleMultiplier: 3,
      };
    case 'maximum':
      return {
        label: '1000 agents equivalent',
        sessionsPerAgent: 5,
        activeRatio: 0.7,
        overloadedRatio: 0.2,
        errorRatio: 0.1,
        economyTrendPoints: 64,
        healthAlertCount: 8,
        particleMultiplier: 5,
      };
  }
}

/**
 * Generate a complete MapState for a given load profile.
 */
export function generateMapState(profile: LoadProfile, seed: number = 42): MockMapState {
  const rand = mulberry32(seed);
  const config = getLoadConfig(profile);
  const positions = circlePositions(8, RING_RADIUS);

  const agents: Record<string, MockAgentNode> = {};

  for (let i = 0; i < AGENT_IDS.length; i++) {
    const id = AGENT_IDS[i];
    const pos = id === 'nexus' ? { x: 0, y: 0 } : positions[i] ?? { x: 0, y: 0 };

    // Determine state based on ratios
    let state: MockAgentNode['state'] = 'IDLE';
    const r = rand();
    if (r < config.errorRatio) state = 'ERROR';
    else if (r < config.errorRatio + config.overloadedRatio) state = 'OVERLOADED';
    else if (r < config.errorRatio + config.overloadedRatio + config.activeRatio) state = 'ACTIVE';

    const sessionCount = state === 'IDLE' ? 0 : config.sessionsPerAgent;
    const activeSessions = [];

    for (let s = 0; s < sessionCount; s++) {
      activeSessions.push({
        id: `${id}:perf-${s}`,
        label: ACTIVITY_LABELS[Math.floor(rand() * ACTIVITY_LABELS.length)],
        startedAt: new Date(Date.now() - Math.floor(rand() * 600_000)).toISOString(),
        estimatedMs: 30_000 + Math.floor(rand() * 120_000),
        progress: Math.round(rand() * 100) / 100,
      });
    }

    agents[id] = {
      id,
      position: pos,
      state,
      sessions: sessionCount,
      activeSessions,
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    agents,
  };
}

/**
 * Generate economy state data for a load profile.
 */
export function generateEconomyData(profile: LoadProfile, seed: number = 42): MockEconomyAgent[] {
  const rand = mulberry32(seed + 1000);
  const config = getLoadConfig(profile);
  const agents: MockEconomyAgent[] = [];

  for (const id of AGENT_IDS) {
    const budgetLimit = 100 + Math.floor(rand() * 400);
    const usageRatio = 0.3 + rand() * 0.6;
    const trend: Array<{ ts: number; value: number }> = [];

    const now = Date.now();
    for (let t = 0; t < config.economyTrendPoints; t++) {
      trend.push({
        ts: now - (config.economyTrendPoints - t) * 60_000,
        value: Math.round((usageRatio + (rand() - 0.5) * 0.2) * budgetLimit * 100) / 100,
      });
    }

    agents.push({
      agentId: id,
      budgetUsed: Math.round(usageRatio * budgetLimit * 100) / 100,
      budgetLimit,
      costPerHour: Math.round((5 + rand() * 20) * 100) / 100,
      trend,
    });
  }

  return agents;
}

/**
 * Generate health state data for a load profile.
 */
export function generateHealthData(profile: LoadProfile, seed: number = 42): MockHealthAgent[] {
  const rand = mulberry32(seed + 2000);
  const config = getLoadConfig(profile);
  const agents: MockHealthAgent[] = [];

  for (const id of AGENT_IDS) {
    const r = rand();
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (config.errorRatio > 0 && r < config.errorRatio) status = 'critical';
    else if (config.overloadedRatio > 0 && r < config.overloadedRatio + config.errorRatio) status = 'degraded';

    agents.push({
      agentId: id,
      status,
      connectivity: status === 'critical' ? 'unstable' : 'connected',
      metrics: {
        cpuUsage: Math.round((0.1 + rand() * 0.8) * 100) / 100,
        memoryUsage: Math.round((0.2 + rand() * 0.6) * 100) / 100,
        latencyMs: Math.round(10 + rand() * (profile === 'maximum' ? 500 : 100)),
        uptimeMs: Math.round(rand() * 86_400_000),
      },
    });
  }

  return agents;
}

/**
 * Generate a serializable load payload that can be injected into the page.
 * Contains mapState, economy, and health data for a given profile.
 */
export function generateLoadPayload(profile: LoadProfile, seed: number = 42) {
  return {
    profile,
    config: getLoadConfig(profile),
    mapState: generateMapState(profile, seed),
    economy: generateEconomyData(profile, seed),
    health: generateHealthData(profile, seed),
  };
}
