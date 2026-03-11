/**
 * Escalation Status Display tests — Issue #219, Phase 20.
 *
 * Tests for:
 * - computeEscalationStatus() — pure display model computation
 *   - Disabled policy → correct defaults
 *   - Enabled but not tracking → active state display
 *   - Tracking with no tiers triggered → pending tiers
 *   - Tracking with tiers triggered → triggered/cooldown states
 *   - All tiers triggered → correct "next tier" logic
 *   - State reset / de-escalation → inactive tiers
 *   - Edge cases: null policy, empty tiers, boundary times
 * - GET /api/task-board/escalation/status — API endpoint
 *   - Returns well-formed status snapshot
 *   - Respects current in-memory escalation state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeEscalationStatus,
  resetEscalationState,
  getEscalationState,
  updateEscalationState,
  evaluateEscalation,
  DEFAULT_ESCALATION_POLICY,
} from '../../../server/escalation-policy.js';
import type {
  EscalationPolicyConfig,
  EscalationState,
  EscalationStatusSnapshot,
  EscalationTierStatus,
} from '../../../server/escalation-policy.js';
import type { AlertSeverity } from '../../../server/alert-rules.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePolicy(overrides: Partial<EscalationPolicyConfig> = {}): EscalationPolicyConfig {
  return {
    enabled: true,
    triggerSeverity: 'critical',
    tiers: [
      { afterMs: 300_000, targetIds: ['target-1'], label: 'Page on-call' },
      { afterMs: 900_000, targetIds: ['target-2'], label: 'Notify manager' },
      { afterMs: 1_800_000, targetIds: ['target-3'], label: 'Executive alert' },
    ],
    cooldownMs: 300_000,
    ...overrides,
  };
}

function makeState(overrides: Partial<EscalationState> = {}): EscalationState {
  return {
    qualifyingSince: null,
    qualifyingSeverity: null,
    lastTriggeredTier: -1,
    lastNotifiedAt: {},
    ...overrides,
  };
}

const NOW = 1_700_000_000_000; // Fixed timestamp for deterministic tests

// ─── computeEscalationStatus() ──────────────────────────────────────────────

describe('computeEscalationStatus()', () => {
  describe('when policy is disabled/absent', () => {
    it('returns policyEnabled=false for null policy', () => {
      const result = computeEscalationStatus(null, makeState(), NOW);
      expect(result.policyEnabled).toBe(false);
      expect(result.isTracking).toBe(false);
      expect(result.tiers).toEqual([]);
      expect(result.currentTierIndex).toBe(-1);
      expect(result.currentTierLabel).toBeNull();
      expect(result.nextTierIndex).toBeNull();
      expect(result.computedAt).toBe(NOW);
    });

    it('returns policyEnabled=false for undefined policy', () => {
      const result = computeEscalationStatus(undefined, makeState(), NOW);
      expect(result.policyEnabled).toBe(false);
    });

    it('returns policyEnabled=false when policy.enabled=false', () => {
      const policy = makePolicy({ enabled: false });
      const result = computeEscalationStatus(policy, makeState(), NOW);
      expect(result.policyEnabled).toBe(false);
      expect(result.tiers).toEqual([]);
    });

    it('returns default triggerSeverity as "critical"', () => {
      const result = computeEscalationStatus(null, makeState(), NOW);
      expect(result.triggerSeverity).toBe('critical');
    });
  });

  describe('when policy is enabled but not tracking', () => {
    it('shows enabled status with inactive tiers', () => {
      const policy = makePolicy();
      const state = makeState(); // qualifyingSince = null
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.policyEnabled).toBe(true);
      expect(result.isTracking).toBe(false);
      expect(result.qualifyingSeverity).toBeNull();
      expect(result.qualifyingDurationMs).toBe(0);
      expect(result.qualifyingSince).toBeNull();
      expect(result.currentTierIndex).toBe(-1);
      expect(result.currentTierLabel).toBeNull();
      expect(result.nextTierIndex).toBeNull();
      expect(result.nextTierTimeRemainingMs).toBeNull();
    });

    it('marks all tiers as inactive', () => {
      const policy = makePolicy();
      const result = computeEscalationStatus(policy, makeState(), NOW);

      expect(result.tiers).toHaveLength(3);
      for (const tier of result.tiers) {
        expect(tier.status).toBe('inactive');
        expect(tier.timeRemainingMs).toBeNull();
      }
    });

    it('populates tier labels from config', () => {
      const policy = makePolicy();
      const result = computeEscalationStatus(policy, makeState(), NOW);

      expect(result.tiers[0].label).toBe('Page on-call');
      expect(result.tiers[1].label).toBe('Notify manager');
      expect(result.tiers[2].label).toBe('Executive alert');
    });

    it('generates default labels when config labels are missing', () => {
      const policy = makePolicy({
        tiers: [
          { afterMs: 60_000, targetIds: ['t1'] },
          { afterMs: 120_000, targetIds: ['t2'] },
        ],
      });
      const result = computeEscalationStatus(policy, makeState(), NOW);

      expect(result.tiers[0].label).toBe('Tier 1');
      expect(result.tiers[1].label).toBe('Tier 2');
    });

    it('reports triggerSeverity and cooldownMs from config', () => {
      const policy = makePolicy({ triggerSeverity: 'warning', cooldownMs: 600_000 });
      const result = computeEscalationStatus(policy, makeState(), NOW);

      expect(result.triggerSeverity).toBe('warning');
      expect(result.cooldownMs).toBe(600_000);
    });
  });

  describe('when tracking — no tiers triggered yet', () => {
    it('shows tracking state with correct qualifying duration', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 120_000, // 2 min ago
        qualifyingSeverity: 'critical',
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.policyEnabled).toBe(true);
      expect(result.isTracking).toBe(true);
      expect(result.qualifyingSeverity).toBe('critical');
      expect(result.qualifyingDurationMs).toBe(120_000);
      expect(result.qualifyingSince).toBe(NOW - 120_000);
    });

    it('marks all tiers as pending with correct time remaining', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 120_000, // 2 min elapsed (5min threshold for tier 0)
        qualifyingSeverity: 'critical',
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.tiers[0].status).toBe('pending');
      expect(result.tiers[0].timeRemainingMs).toBe(180_000); // 5min - 2min = 3min

      expect(result.tiers[1].status).toBe('pending');
      expect(result.tiers[1].timeRemainingMs).toBe(780_000); // 15min - 2min = 13min

      expect(result.tiers[2].status).toBe('pending');
      expect(result.tiers[2].timeRemainingMs).toBe(1_680_000); // 30min - 2min = 28min
    });

    it('identifies next tier correctly', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 120_000,
        qualifyingSeverity: 'critical',
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.nextTierIndex).toBe(0);
      expect(result.nextTierTimeRemainingMs).toBe(180_000);
    });

    it('currentTierIndex is -1 when no tiers triggered', () => {
      const result = computeEscalationStatus(
        makePolicy(),
        makeState({ qualifyingSince: NOW - 60_000, qualifyingSeverity: 'critical' }),
        NOW,
      );
      expect(result.currentTierIndex).toBe(-1);
      expect(result.currentTierLabel).toBeNull();
    });
  });

  describe('when tracking — tiers progressively triggered', () => {
    it('shows tier 0 as triggered after threshold', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 400_000, // 6m40s — past tier 0 threshold (5min)
        qualifyingSeverity: 'critical',
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: NOW - 100_000 },
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.currentTierIndex).toBe(0);
      expect(result.currentTierLabel).toBe('Page on-call');

      // Tier 0: triggered and in cooldown (notified 100s ago, cooldown 300s)
      expect(result.tiers[0].status).toBe('cooldown');
      expect(result.tiers[0].timeRemainingMs).toBe(200_000); // 300s - 100s

      // Tier 1: still pending
      expect(result.tiers[1].status).toBe('pending');
      expect(result.tiers[1].timeRemainingMs).toBe(500_000); // 15min - 6m40s
    });

    it('shows tier as triggered (not cooldown) when cooldown expired', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 600_000, // 10min elapsed
        qualifyingSeverity: 'critical',
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: NOW - 400_000 }, // notified 400s ago — past 300s cooldown
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.tiers[0].status).toBe('triggered');
      expect(result.tiers[0].timeRemainingMs).toBeNull();
    });

    it('identifies next tier correctly when tier 0 triggered', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 400_000,
        qualifyingSeverity: 'critical',
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: NOW - 100_000 },
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.nextTierIndex).toBe(1);
      expect(result.nextTierTimeRemainingMs).toBe(500_000);
    });

    it('shows all tiers triggered when all thresholds passed', () => {
      const policy = makePolicy();
      const state = makeState({
        qualifyingSince: NOW - 2_000_000, // 33min — past all 3 tiers
        qualifyingSeverity: 'critical',
        lastTriggeredTier: 2,
        lastNotifiedAt: {
          0: NOW - 1_700_000,
          1: NOW - 1_100_000,
          2: NOW - 200_000,
        },
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.currentTierIndex).toBe(2);
      expect(result.currentTierLabel).toBe('Executive alert');

      // Tier 0: triggered (cooldown expired)
      expect(result.tiers[0].status).toBe('triggered');
      // Tier 1: triggered (cooldown expired)
      expect(result.tiers[1].status).toBe('triggered');
      // Tier 2: in cooldown (200s < 300s)
      expect(result.tiers[2].status).toBe('cooldown');
      expect(result.tiers[2].timeRemainingMs).toBe(100_000);

      // No next tier (all triggered)
      expect(result.nextTierIndex).toBeNull();
      expect(result.nextTierTimeRemainingMs).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty tiers array', () => {
      const policy = makePolicy({ tiers: [] });
      const state = makeState({
        qualifyingSince: NOW - 100_000,
        qualifyingSeverity: 'critical',
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.policyEnabled).toBe(true);
      expect(result.isTracking).toBe(true);
      expect(result.tiers).toEqual([]);
      expect(result.nextTierIndex).toBeNull();
    });

    it('handles qualifying duration of exactly tier threshold', () => {
      const policy = makePolicy({
        tiers: [{ afterMs: 300_000, targetIds: ['t1'], label: 'Tier 1' }],
      });
      const state = makeState({
        qualifyingSince: NOW - 300_000, // Exactly at threshold
        qualifyingSeverity: 'critical',
        lastTriggeredTier: -1,
      });
      const result = computeEscalationStatus(policy, state, NOW);

      // At exactly the threshold, tier is pending (will fire on next eval)
      expect(result.tiers[0].status).toBe('pending');
      expect(result.tiers[0].timeRemainingMs).toBe(0);
    });

    it('handles single-tier policy', () => {
      const policy = makePolicy({
        tiers: [{ afterMs: 60_000, targetIds: ['t1'], label: 'Only tier' }],
      });
      const state = makeState({
        qualifyingSince: NOW - 120_000,
        qualifyingSeverity: 'critical',
        lastTriggeredTier: 0,
        lastNotifiedAt: { 0: NOW - 30_000 },
      });
      const result = computeEscalationStatus(policy, state, NOW);

      expect(result.tiers).toHaveLength(1);
      expect(result.tiers[0].status).toBe('cooldown');
      expect(result.currentTierIndex).toBe(0);
      expect(result.currentTierLabel).toBe('Only tier');
      expect(result.nextTierIndex).toBeNull(); // no more tiers
    });

    it('copies targetIds arrays (no shared references)', () => {
      const origTargets = ['t1', 't2'];
      const policy = makePolicy({
        tiers: [{ afterMs: 60_000, targetIds: origTargets }],
      });
      const result = computeEscalationStatus(policy, makeState(), NOW);
      expect(result.tiers[0].targetIds).toEqual(['t1', 't2']);
      expect(result.tiers[0].targetIds).not.toBe(origTargets);
    });

    it('uses default triggerSeverity when not specified in policy', () => {
      const policy: EscalationPolicyConfig = {
        enabled: true,
        tiers: [],
        // triggerSeverity intentionally omitted
      };
      const result = computeEscalationStatus(policy, makeState(), NOW);
      expect(result.triggerSeverity).toBe('critical');
    });

    it('uses default cooldownMs when not specified in policy', () => {
      const policy: EscalationPolicyConfig = {
        enabled: true,
        tiers: [],
        // cooldownMs intentionally omitted
      };
      const result = computeEscalationStatus(policy, makeState(), NOW);
      expect(result.cooldownMs).toBe(300_000);
    });

    it('returns computedAt matching the provided now', () => {
      const ts = 1_234_567_890_000;
      const result = computeEscalationStatus(makePolicy(), makeState(), ts);
      expect(result.computedAt).toBe(ts);
    });
  });

  describe('integration with real escalation state cycle', () => {
    beforeEach(() => {
      resetEscalationState();
    });

    it('tracks a full escalation lifecycle through the status computation', () => {
      const policy = makePolicy({
        tiers: [
          { afterMs: 60_000, targetIds: ['t1'], label: 'Tier 1' },
          { afterMs: 180_000, targetIds: ['t2'], label: 'Tier 2' },
        ],
      });

      // Phase 1: Not tracking yet
      let state = getEscalationState();
      let status = computeEscalationStatus(policy, state, NOW);
      expect(status.isTracking).toBe(false);
      expect(status.tiers.every(t => t.status === 'inactive')).toBe(true);

      // Phase 2: Start tracking — critical severity detected
      const decision1 = evaluateEscalation(policy, 'critical', state, NOW);
      updateEscalationState('critical', 'critical', decision1, NOW);

      state = getEscalationState();
      status = computeEscalationStatus(policy, state, NOW);
      expect(status.isTracking).toBe(true);
      expect(status.qualifyingSeverity).toBe('critical');
      expect(status.tiers[0].status).toBe('pending');
      expect(status.tiers[0].timeRemainingMs).toBe(60_000);

      // Phase 3: 90 seconds later — tier 1 should be past threshold
      const later = NOW + 90_000;
      const decision2 = evaluateEscalation(policy, 'critical', getEscalationState(), later);
      expect(decision2.shouldEscalate).toBe(true);
      expect(decision2.tierIndex).toBe(0);
      updateEscalationState('critical', 'critical', decision2, later);

      state = getEscalationState();
      status = computeEscalationStatus(policy, state, later);
      expect(status.currentTierIndex).toBe(0);
      expect(status.currentTierLabel).toBe('Tier 1');
      expect(status.tiers[0].status).toBe('cooldown');
      expect(status.tiers[1].status).toBe('pending');
      expect(status.nextTierIndex).toBe(1);

      // Phase 4: Severity drops to OK — escalation resets
      const recoverTime = later + 10_000;
      const decision3 = evaluateEscalation(policy, 'ok', getEscalationState(), recoverTime);
      updateEscalationState('ok', 'critical', decision3, recoverTime);

      state = getEscalationState();
      status = computeEscalationStatus(policy, state, recoverTime);
      expect(status.isTracking).toBe(false);
      expect(status.currentTierIndex).toBe(-1);
      expect(status.tiers.every(t => t.status === 'inactive')).toBe(true);
    });
  });
});

// ─── GET /api/task-board/escalation/status — API Endpoint Tests ──────────────

describe('GET /api/task-board/escalation/status', () => {
  // We test the route integration by importing the handler and making mock requests.
  // This mirrors the pattern used in task-board-escalation-policy.test.ts.

  let dataDir: string;
  let tmpDir: string;

  beforeEach(async () => {
    resetEscalationState();
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'escalation-status-test-'));
    dataDir = tmpDir;
  });

  // Helper to make mock HTTP request/response objects
  function makeMockReq(url: string, method = 'GET'): any {
    return {
      url,
      method,
      headers: {},
      on: () => {},
    };
  }

  function makeMockRes(): any {
    let responseData: any = null;
    let responseStatus = 200;
    return {
      writeHead: () => {},
      end: () => {},
      write: () => true,
      getResponseData: () => responseData,
      getResponseStatus: () => responseStatus,
      _setData: (data: any, status: number) => { responseData = data; responseStatus = status; },
    };
  }

  async function callEndpoint(dataDir: string): Promise<{ data: any; status: number }> {
    const { handleTaskBoard } = await import('../../../server/routes/task-board.js');
    const req = makeMockReq('/api/task-board/escalation/status');
    const res = makeMockRes();
    let capturedData: any = null;
    let capturedStatus = 200;

    const deps = {
      dataDir,
      sendJson: (r: any, data: any, status = 200) => {
        capturedData = data;
        capturedStatus = status;
      },
      readRequestBody: async () => '{}',
    };

    await handleTaskBoard(req, res, deps);
    return { data: capturedData, status: capturedStatus };
  }

  it('returns status snapshot with disabled policy by default', async () => {
    const { data, status } = await callEndpoint(dataDir);
    expect(status).toBe(200);
    expect(data).toBeDefined();
    expect(data.status).toBeDefined();
    expect(data.status.policyEnabled).toBe(false);
    expect(data.status.isTracking).toBe(false);
    expect(data.status.tiers).toEqual([]);
  });

  it('returns status with enabled policy when webhook config has escalation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Write a webhook config with escalation enabled
    const config = {
      enabled: true,
      targets: [
        { id: 'slack', name: 'Slack', url: 'https://hooks.slack.com/test', enabled: true },
      ],
      escalation: {
        enabled: true,
        triggerSeverity: 'critical',
        tiers: [
          { afterMs: 300000, targetIds: ['slack'], label: 'Page on-call' },
        ],
        cooldownMs: 300000,
      },
    };
    fs.writeFileSync(
      path.join(dataDir, 'task-board-webhook-config.json'),
      JSON.stringify(config, null, 2),
    );

    const { data, status } = await callEndpoint(dataDir);
    expect(status).toBe(200);
    expect(data.status.policyEnabled).toBe(true);
    expect(data.status.isTracking).toBe(false);
    expect(data.status.triggerSeverity).toBe('critical');
    expect(data.status.tiers).toHaveLength(1);
    expect(data.status.tiers[0].label).toBe('Page on-call');
    expect(data.status.tiers[0].status).toBe('inactive');
  });

  it('reflects in-memory escalation state in status response', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Setup: enable escalation and pre-seed escalation state
    const config = {
      enabled: true,
      targets: [
        { id: 't1', name: 'Target 1', url: 'https://example.com/hook', enabled: true },
      ],
      escalation: {
        enabled: true,
        triggerSeverity: 'critical',
        tiers: [
          { afterMs: 60000, targetIds: ['t1'], label: 'Quick alert' },
        ],
        cooldownMs: 120000,
      },
    };
    fs.writeFileSync(
      path.join(dataDir, 'task-board-webhook-config.json'),
      JSON.stringify(config, null, 2),
    );

    // Manually drive escalation state to "tracking"
    const { updateEscalationState: update, evaluateEscalation: evaluate } =
      await import('../../../server/escalation-policy.js');

    // Simulate: critical state detected
    const noDecision = { shouldEscalate: false, tierIndex: null, tier: null, targetIds: [], qualifyingDurationMs: 0, reason: '' };
    update('critical', 'critical', noDecision, Date.now() - 30_000);

    const { data } = await callEndpoint(dataDir);
    expect(data.status.policyEnabled).toBe(true);
    expect(data.status.isTracking).toBe(true);
    expect(data.status.qualifyingSeverity).toBe('critical');
    expect(data.status.qualifyingDurationMs).toBeGreaterThan(0);
    expect(data.status.tiers[0].status).toBe('pending');
  });
});
