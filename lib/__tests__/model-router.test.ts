/**
 * Model Router Tests — VentureOS Enhanced Model Routing (P2 #33)
 *
 * Coverage targets:
 * - Multi-factor scoring algorithm
 * - Quota tracking and enforcement
 * - Fallback chain logic
 * - Business unit overrides
 * - Performance tracking
 * - Edge cases (all models down, quota exhausted, etc.)
 */

import {
  ModelRouter,
  QuotaTracker,
  PerformanceTracker,
  DEFAULT_MODELS,
  getDefaultModelRouter,
  resetDefaultModelRouter,
  type ModelRouterConfig,
  type ModelDefinition,
  type RoutingRequest,
  type RoutingDecision,
  type BusinessUnitOverride,
  type ModelRouterLogger,
  type ModelTier,
  type QuotaState,
} from '../model-router';

// ── Helpers ──────────────────────────────────────────────────────────

function silentLogger(): ModelRouterLogger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function makeModels(overrides?: Partial<ModelDefinition>[]): ModelDefinition[] {
  const base = DEFAULT_MODELS.map(m => ({ ...m }));
  if (overrides) {
    for (const o of overrides) {
      const idx = base.findIndex(m => m.id === o.id);
      if (idx >= 0) Object.assign(base[idx], o);
    }
  }
  return base;
}

function makeRouter(overrides?: Partial<ModelRouterConfig>): ModelRouter {
  return new ModelRouter({
    models: overrides?.models ?? makeModels(),
    businessUnitOverrides: overrides?.businessUnitOverrides,
    quotaThreshold: overrides?.quotaThreshold,
    enforceQuota: overrides?.enforceQuota,
    logger: overrides?.logger ?? silentLogger(),
    now: overrides?.now ?? (() => new Date('2026-02-15T12:00:00Z')),
  });
}

function makeRequest(overrides?: Partial<RoutingRequest>): RoutingRequest {
  return {
    complexity: 'medium',
    timeSensitivity: 'normal',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ModelRouter', () => {
  // ── Basic Routing ─────────────────────────────────────────────────

  describe('selectModel', () => {
    it('returns a valid routing decision', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest());

      expect(decision).toBeDefined();
      expect(decision.model).toBeDefined();
      expect(decision.model.id).toBeTruthy();
      expect(decision.score).toEqual(expect.any(Number));
      expect(decision.breakdown).toBeDefined();
      expect(decision.tier).toBeGreaterThanOrEqual(1);
      expect(decision.tier).toBeLessThanOrEqual(3);
      expect(decision.decidedAt).toBeTruthy();
      expect(decision.reason).toBeTruthy();
    });

    it('selects tier 1 model for simple tasks', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
      }));

      expect(decision.tier).toBe(1);
    });

    it('selects tier 2 model for medium tasks', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        timeSensitivity: 'normal',
      }));

      expect(decision.tier).toBe(2);
    });

    it('selects tier 2 or 3 for complex tasks', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
      }));

      expect(decision.tier).toBeGreaterThanOrEqual(2);
    });

    it('respects minTier constraint', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        minTier: 2,
      }));

      expect(decision.tier).toBeGreaterThanOrEqual(2);
    });

    it('respects maxTier constraint', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
        maxTier: 1,
      }));

      expect(decision.tier).toBe(1);
    });

    it('includes score breakdown', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest());

      expect(decision.breakdown).toHaveProperty('complexityScore');
      expect(decision.breakdown).toHaveProperty('quotaScore');
      expect(decision.breakdown).toHaveProperty('priorityScore');
      expect(decision.breakdown).toHaveProperty('timeSensitivityScore');
      expect(decision.breakdown).toHaveProperty('performanceScore');
      expect(decision.breakdown).toHaveProperty('providerPreferenceScore');
      expect(decision.breakdown).toHaveProperty('capabilityMatchScore');
    });
  });

  // ── Complexity-Based Routing ──────────────────────────────────────

  describe('complexity scoring', () => {
    it('simple tasks prefer cheap models', () => {
      const router = makeRouter();
      const simple = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
      }));

      // Should pick tier 1
      expect(simple.model.tier).toBe(1);
    });

    it('complex tasks escalate to premium tier', () => {
      const router = makeRouter();
      const complex = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
        priorityOverride: 'high',
      }));

      expect(complex.model.tier).toBeGreaterThanOrEqual(2);
    });

    it('medium complexity gives balanced selection', () => {
      const router = makeRouter();
      const medium = router.selectModel(makeRequest({
        complexity: 'medium',
        timeSensitivity: 'normal',
      }));

      expect(medium.model.tier).toBe(2);
    });
  });

  // ── Time Sensitivity ──────────────────────────────────────────────

  describe('time sensitivity', () => {
    it('urgent tasks boost minimum tier to 2', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'urgent',
      }));

      expect(decision.tier).toBeGreaterThanOrEqual(2);
    });

    it('batch tasks allow tier 1', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
      }));

      expect(decision.tier).toBe(1);
    });

    it('urgent tasks have higher time sensitivity score', () => {
      const router = makeRouter();
      const urgent = router.selectModel(makeRequest({ timeSensitivity: 'urgent' }));
      const batch = router.selectModel(makeRequest({ timeSensitivity: 'batch' }));

      expect(urgent.breakdown.timeSensitivityScore).toBeGreaterThan(
        batch.breakdown.timeSensitivityScore
      );
    });
  });

  // ── Security-Aware Routing (Issue #224) ──────────────────────────

  describe('security-aware routing', () => {
    it('routes external content to high-risk tier', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        containsExternalContent: true,
      }));

      expect(decision.security.riskLevel).toBe('high');
      expect(decision.tier).toBe(3);
    });

    it('high-risk routing bypasses quota downgrade', () => {
      const router = makeRouter();
      router.quota.setQuota('global', { total: 10000, used: 9500, resetsAt: '2026-03-01' });
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        containsExternalContent: true,
      }));

      expect(decision.tier).toBe(3);
      expect(decision.quotaDowngraded).toBe(false);
    });

    it('supports per-request forced model override', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
        forceModel: 'gpt-4o-mini',
      }));

      expect(decision.model.id).toBe('gpt-4o-mini');
      expect(decision.security.forcedByRequest).toBe(true);
    });

    it('high-risk routing overrides restrictive maxTier policy', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'budget-locked',
            priority: 'low',
            maxTier: 1,
          },
        ],
      });
      const decision = router.selectModel(makeRequest({
        businessUnit: 'budget-locked',
        complexity: 'simple',
        timeSensitivity: 'batch',
        containsExternalContent: true,
      }));

      expect(decision.security.riskLevel).toBe('high');
      expect(decision.tier).toBe(3);
    });

    it('records injection detections from routing decisions', () => {
      const router = makeRouter();
      router.clearSecurityTelemetry();
      router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'normal',
        injectionScore: 0.91,
      }));

      const events = router.getInjectionDetections();
      expect(events.length).toBe(1);
      expect(events[0].injectionScore).toBeCloseTo(0.91, 2);
      expect(events[0].riskLevel).toBe('high');
    });

    it('provides dashboard-ready usage and savings summary', () => {
      const router = makeRouter();
      router.clearSecurityTelemetry();

      for (let i = 0; i < 6; i++) {
        router.selectModel(makeRequest({
          complexity: 'simple',
          timeSensitivity: 'batch',
          contentSources: ['internal'],
        }));
      }
      for (let i = 0; i < 3; i++) {
        router.selectModel(makeRequest({
          complexity: 'simple',
          timeSensitivity: 'normal',
          contentSources: ['web'],
        }));
      }

      const summary = router.getSecurityRoutingSummary();
      expect(summary.windowSize).toBe(9);
      expect(summary.riskCounts.low).toBe(6);
      expect(summary.riskCounts.high).toBe(3);
      expect(summary.estimatedSavingsUsd).toBeGreaterThan(0);
      expect(summary.modelUsage).toBeDefined();
    });
  });

  // ── Provider Preference ───────────────────────────────────────────

  describe('provider preference', () => {
    it('applies provider preference bonus', () => {
      const router = makeRouter();

      const withPref = router.selectModel(makeRequest({
        preferredProvider: 'anthropic',
        complexity: 'medium',
      }));

      expect(withPref.breakdown.providerPreferenceScore).toBeGreaterThanOrEqual(0);
      // If anthropic was selected, it should have the bonus
      if (withPref.model.provider === 'anthropic') {
        expect(withPref.breakdown.providerPreferenceScore).toBeGreaterThan(0);
      }
    });

    it('does not force provider — only a preference', () => {
      const router = makeRouter();
      // Even with preference, the model should be valid
      const decision = router.selectModel(makeRequest({
        preferredProvider: 'openai',
        complexity: 'simple',
        timeSensitivity: 'batch',
      }));

      expect(decision.model).toBeDefined();
    });
  });

  // ── Required Capabilities ─────────────────────────────────────────

  describe('capability filtering', () => {
    it('filters models by required capabilities', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        requiredCapabilities: ['reasoning'],
      }));

      expect(decision.model.capabilities).toContain('reasoning');
    });

    it('vision capability filters to models that support it', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        requiredCapabilities: ['vision'],
      }));

      expect(decision.model.capabilities).toContain('vision');
    });

    it('falls back when no model has required capability', () => {
      const router = makeRouter();
      const decision = router.selectModel(makeRequest({
        requiredCapabilities: ['nonexistent-capability'],
      }));

      // Should fallback with warning
      expect(decision.warnings.length).toBeGreaterThan(0);
      expect(decision.fallbackUsed).toBe(true);
    });
  });

  // ── Quota Enforcement ─────────────────────────────────────────────

  describe('quota enforcement', () => {
    it('downgrades to tier 1 when quota exceeds threshold', () => {
      const router = makeRouter();
      router.quota.setQuota('global', { total: 10000, used: 9500, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
      }));

      expect(decision.tier).toBe(1);
      expect(decision.quotaDowngraded).toBe(true);
    });

    it('does not downgrade when quota is below threshold', () => {
      const router = makeRouter();
      router.quota.setQuota('global', { total: 10000, used: 5000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
      }));

      expect(decision.quotaDowngraded).toBe(false);
    });

    it('exempts safety-critical tasks from quota downgrade', () => {
      const router = makeRouter();
      router.quota.setQuota('global', { total: 10000, used: 9500, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
        safetyCritical: true,
      }));

      expect(decision.tier).toBeGreaterThanOrEqual(2);
      expect(decision.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('security/safety critical'),
        ])
      );
    });

    it('custom quota threshold works', () => {
      const router = makeRouter({ quotaThreshold: 0.5 });
      router.quota.setQuota('global', { total: 10000, used: 6000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
      }));

      expect(decision.tier).toBe(1);
      expect(decision.quotaDowngraded).toBe(true);
    });

    it('disabling quota enforcement allows premium models', () => {
      const router = makeRouter({ enforceQuota: false });
      router.quota.setQuota('global', { total: 10000, used: 9999, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
      }));

      expect(decision.quotaDowngraded).toBe(false);
    });

    it('skips models when provider quota is exhausted', () => {
      const router = makeRouter();
      router.quota.setQuota('openai', { total: 1000, used: 1000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
      }));

      // Should avoid openai models
      expect(decision.model.provider).toBe('anthropic');
    });

    it('safety-critical requests bypass exhausted provider filtering', () => {
      const models = makeModels([
        { id: 'claude-haiku', status: 'unavailable' },
        { id: 'claude-sonnet', status: 'unavailable' },
        { id: 'claude-opus', status: 'unavailable' },
      ]);
      const router = makeRouter({ models });
      router.quota.setQuota('openai', { total: 1000, used: 1000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        safetyCritical: true,
      }));

      expect(decision.model.provider).toBe('openai');
    });
  });

  // ── Business Unit Overrides ───────────────────────────────────────

  describe('business unit overrides', () => {
    it('applies forced model from override', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'ventureos',
            priority: 'high',
            forcedModel: 'claude-opus',
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        businessUnit: 'ventureos',
      }));

      expect(decision.model.id).toBe('claude-opus');
      expect(decision.reason).toContain('Forced by business unit override');
    });

    it('request forceModel takes precedence over BU forcedModel', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'ventureos',
            priority: 'high',
            forcedModel: 'claude-opus',
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        businessUnit: 'ventureos',
        forceModel: 'gpt-4o-mini',
      }));

      expect(decision.model.id).toBe('gpt-4o-mini');
      expect(decision.security.forcedByRequest).toBe(true);
    });

    it('falls back when forced model is unavailable', () => {
      const models = makeModels([{ id: 'claude-opus', status: 'unavailable' }]);
      const router = makeRouter({
        models,
        businessUnitOverrides: [
          {
            businessUnit: 'ventureos',
            priority: 'high',
            forcedModel: 'claude-opus',
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        businessUnit: 'ventureos',
      }));

      // Should NOT be claude-opus since it's unavailable
      expect(decision.model.id).not.toBe('claude-opus');
      expect(decision.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('not available'),
        ])
      );
    });

    it('applies minTier from override', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'critical-app',
            priority: 'high',
            minTier: 2,
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        complexity: 'simple',
        timeSensitivity: 'batch',
        businessUnit: 'critical-app',
      }));

      expect(decision.tier).toBeGreaterThanOrEqual(2);
    });

    it('applies maxTier from override', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'budget-unit',
            priority: 'low',
            maxTier: 1,
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
        businessUnit: 'budget-unit',
      }));

      expect(decision.tier).toBe(1);
    });

    it('applies preferred provider from override', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'anthropic-shop',
            priority: 'medium',
            preferredProvider: 'anthropic',
          },
        ],
      });

      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        businessUnit: 'anthropic-shop',
      }));

      // Provider preference is a bonus, not a hard filter.
      // But it should at least not crash.
      expect(decision.model).toBeDefined();
    });

    it('priorityOverride in request takes precedence over BU priority', () => {
      const router = makeRouter({
        businessUnitOverrides: [
          {
            businessUnit: 'low-priority-bu',
            priority: 'low',
          },
        ],
      });

      const withOverride = router.selectModel(makeRequest({
        complexity: 'medium',
        businessUnit: 'low-priority-bu',
        priorityOverride: 'high',
      }));

      const withoutOverride = router.selectModel(makeRequest({
        complexity: 'medium',
        businessUnit: 'low-priority-bu',
      }));

      expect(withOverride.breakdown.priorityScore).toBeGreaterThan(withoutOverride.breakdown.priorityScore);
    });

    it('manages overrides dynamically', () => {
      const router = makeRouter();

      // Initially no override
      expect(router.getBusinessUnitOverride('new-bu')).toBeUndefined();

      // Add override
      router.setBusinessUnitOverride({
        businessUnit: 'new-bu',
        priority: 'high',
        forcedModel: 'gpt-4o',
      });

      const decision = router.selectModel(makeRequest({ businessUnit: 'new-bu' }));
      expect(decision.model.id).toBe('gpt-4o');

      // Remove override
      router.removeBusinessUnitOverride('new-bu');
      expect(router.getBusinessUnitOverride('new-bu')).toBeUndefined();
    });
  });

  // ── Fallback Chain ────────────────────────────────────────────────

  describe('fallback chain', () => {
    it('returns fallback when all models in tier are unavailable', () => {
      const models = makeModels([
        { id: 'gpt-4o', status: 'unavailable' },
        { id: 'claude-sonnet', status: 'unavailable' },
      ]);

      const router = makeRouter({ models });

      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        maxTier: 2,
        minTier: 2,
      }));

      // Should fallback since tier 2 models are unavailable
      expect(decision.fallbackUsed).toBe(true);
      expect(decision.warnings.length).toBeGreaterThan(0);
    });

    it('getFallbackChain returns models in correct order', () => {
      const router = makeRouter();
      const chain = router.getFallbackChain(2);

      // Tier 2 models should come first
      const firstTier2Idx = chain.findIndex(m => m.tier === 2);
      const firstNonTier2Idx = chain.findIndex(m => m.tier !== 2);

      if (firstTier2Idx >= 0 && firstNonTier2Idx >= 0) {
        expect(firstTier2Idx).toBeLessThan(firstNonTier2Idx);
      }
    });

    it('applies provider exhaustion checks in fallback selection', () => {
      const models = makeModels([
        { id: 'gpt-4o', status: 'unavailable' },
        { id: 'claude-sonnet', status: 'unavailable' },
      ]);
      const router = makeRouter({ models });
      router.quota.setQuota('openai', { total: 1000, used: 1000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'medium',
        minTier: 2,
        maxTier: 2,
      }));

      expect(decision.fallbackUsed).toBe(true);
      expect(decision.model.provider).toBe('anthropic');
    });

    it('handles all models unavailable', () => {
      const models = makeModels().map(m => ({ ...m, status: 'unavailable' as const }));
      const logger = silentLogger();
      const router = makeRouter({ models, logger });

      const decision = router.selectModel(makeRequest());

      expect(decision.fallbackUsed).toBe(true);
      expect(decision.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('All models unavailable'),
        ])
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('surfaces critical warning when quotas filter all available models', () => {
      const router = makeRouter();
      router.quota.setQuota('openai', { total: 1000, used: 1000, resetsAt: '2026-03-01' });
      router.quota.setQuota('anthropic', { total: 1000, used: 1000, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        timeSensitivity: 'urgent',
      }));

      expect(decision.fallbackUsed).toBe(true);
      expect(decision.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No models available after quota filtering'),
        ]),
      );
    });

    it('excludes unavailable models from fallback chain', () => {
      const models = makeModels([{ id: 'gpt-4o-mini', status: 'unavailable' }]);
      const router = makeRouter({ models });
      const chain = router.getFallbackChain(1);

      expect(chain.find(m => m.id === 'gpt-4o-mini')).toBeUndefined();
    });
  });

  // ── Model Management ──────────────────────────────────────────────

  describe('model management', () => {
    it('updates model status', () => {
      const router = makeRouter();
      router.updateModelStatus('gpt-4o', 'unavailable');

      const models = router.getModels();
      const gpt4o = models.find(m => m.id === 'gpt-4o');
      expect(gpt4o?.status).toBe('unavailable');
    });

    it('does not mutate the original config models array', () => {
      const models = makeModels();
      const originalStatus = models.find(m => m.id === 'gpt-4o')?.status;
      const router = makeRouter({ models });

      router.updateModelStatus('gpt-4o', 'unavailable');

      expect(models.find(m => m.id === 'gpt-4o')?.status).toBe(originalStatus);
    });

    it('getModels returns all models', () => {
      const router = makeRouter();
      expect(router.getModels().length).toBe(DEFAULT_MODELS.length);
    });

    it('getModelsByTier filters correctly', () => {
      const router = makeRouter();

      const tier1 = router.getModelsByTier(1);
      expect(tier1.every(m => m.tier === 1)).toBe(true);
      expect(tier1.length).toBe(2); // gpt-4o-mini, claude-haiku

      const tier3 = router.getModelsByTier(3);
      expect(tier3.every(m => m.tier === 3)).toBe(true);
      expect(tier3.length).toBe(2); // o1, claude-opus
    });

    it('getAvailableModels excludes unavailable', () => {
      const router = makeRouter();
      router.updateModelStatus('gpt-4o', 'unavailable');

      const available = router.getAvailableModels();
      expect(available.find(m => m.id === 'gpt-4o')).toBeUndefined();
      expect(available.length).toBe(DEFAULT_MODELS.length - 1);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty model list gracefully', () => {
      const logger = silentLogger();
      const router = makeRouter({ models: [], logger });

      const decision = router.selectModel(makeRequest());
      expect(decision.fallbackUsed).toBe(true);
    });

    it('handles request with all optional fields', () => {
      const router = makeRouter();
      const decision = router.selectModel({
        complexity: 'simple',
        timeSensitivity: 'batch',
        businessUnit: 'unknown-bu',
        priorityOverride: 'low',
        requiredCapabilities: ['chat'],
        preferredProvider: 'openai',
        minTier: 1,
        maxTier: 1,
        taskType: 'summarization',
        safetyCritical: false,
      });

      expect(decision.model).toBeDefined();
      expect(decision.tier).toBe(1);
    });

    it('handles conflicting minTier/maxTier', () => {
      const router = makeRouter();
      // minTier > maxTier after quota adjustment
      router.quota.setQuota('global', { total: 100, used: 95, resetsAt: '2026-03-01' });

      const decision = router.selectModel(makeRequest({
        complexity: 'complex',
        minTier: 3,
      }));

      // Should resolve without error
      expect(decision.model).toBeDefined();
    });

    it('degraded models are still selectable', () => {
      const models = makeModels().map(m => ({
        ...m,
        status: m.tier === 2 ? 'degraded' as const : m.status,
      }));
      const router = makeRouter({ models });

      const decision = router.selectModel(makeRequest({ complexity: 'medium' }));
      // Degraded models should still be candidates
      expect(decision.model).toBeDefined();
    });
  });
});

// ── QuotaTracker ────────────────────────────────────────────────────

describe('QuotaTracker', () => {
  it('tracks quota usage percentage', () => {
    const qt = new QuotaTracker();
    qt.setQuota('global', { total: 10000, used: 5000, resetsAt: '2026-03-01' });

    expect(qt.getUsagePercent('global')).toBe(0.5);
  });

  it('returns 0 for unknown keys', () => {
    const qt = new QuotaTracker();
    expect(qt.getUsagePercent('nonexistent')).toBe(0);
  });

  it('handles zero total quota', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 0, used: 0, resetsAt: '2026-03-01' });
    expect(qt.getUsagePercent('test')).toBe(0);
  });

  it('caps usage at 100%', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 200, resetsAt: '2026-03-01' });
    expect(qt.getUsagePercent('test')).toBe(1);
  });

  it('records usage correctly', () => {
    const qt = new QuotaTracker();
    qt.setQuota('global', { total: 1000, used: 0, resetsAt: '2026-03-01' });

    qt.recordUsage('global', 100);
    expect(qt.getUsagePercent('global')).toBe(0.1);

    qt.recordUsage('global', 400);
    expect(qt.getUsagePercent('global')).toBe(0.5);
  });

  it('does not exceed total on recordUsage', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 90, resetsAt: '2026-03-01' });

    qt.recordUsage('test', 50);
    expect(qt.getUsagePercent('test')).toBe(1);
  });

  it('isOverThreshold works correctly', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 91, resetsAt: '2026-03-01' });

    expect(qt.isOverThreshold('test', 0.9)).toBe(true);
    expect(qt.isOverThreshold('test', 0.95)).toBe(false);
  });

  it('isExhausted works correctly', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 99, resetsAt: '2026-03-01' });
    expect(qt.isExhausted('test')).toBe(false);

    qt.recordUsage('test', 1);
    expect(qt.isExhausted('test')).toBe(true);
  });

  it('resetUsage clears usage', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 80, resetsAt: '2026-03-01' });
    qt.resetUsage('test');

    expect(qt.getUsagePercent('test')).toBe(0);
  });

  it('export/import roundtrips', () => {
    const qt = new QuotaTracker();
    qt.setQuota('global', { total: 10000, used: 5000, resetsAt: '2026-03-01' });
    qt.setQuota('openai', { total: 5000, used: 2000, resetsAt: '2026-03-01' });

    const exported = qt.export();
    const qt2 = new QuotaTracker();
    qt2.import(exported);

    expect(qt2.getUsagePercent('global')).toBe(0.5);
    expect(qt2.getUsagePercent('openai')).toBe(0.4);
    expect(qt2.getKeys()).toEqual(expect.arrayContaining(['global', 'openai']));
  });

  it('getQuota returns quota state', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 50, resetsAt: '2026-03-01' });

    const q = qt.getQuota('test');
    expect(q?.total).toBe(100);
    expect(q?.used).toBe(50);
  });

  it('getQuota returns a defensive copy', () => {
    const qt = new QuotaTracker();
    qt.setQuota('test', { total: 100, used: 50, resetsAt: '2026-03-01' });

    const q = qt.getQuota('test');
    expect(q).toBeDefined();

    q!.used = 99;

    // Internal tracker state should be unchanged.
    expect(qt.getQuota('test')?.used).toBe(50);
  });

  it('getQuota returns undefined for unknown key', () => {
    const qt = new QuotaTracker();
    expect(qt.getQuota('nope')).toBeUndefined();
  });

  it('isExhausted returns false for unknown key', () => {
    const qt = new QuotaTracker();
    expect(qt.isExhausted('nope')).toBe(false);
  });

  it('recordUsage on unknown key is a no-op', () => {
    const qt = new QuotaTracker();
    qt.recordUsage('nope', 100);
    expect(qt.getUsagePercent('nope')).toBe(0);
  });

  it('resetUsage on unknown key is a no-op', () => {
    const qt = new QuotaTracker();
    qt.resetUsage('nope'); // Should not throw
  });
});

// ── PerformanceTracker ──────────────────────────────────────────────

describe('PerformanceTracker', () => {
  const fixedNow = () => new Date('2026-02-15T12:00:00Z');

  it('records and retrieves performance data', () => {
    const pt = new PerformanceTracker(fixedNow);
    pt.recordCompletion('gpt-4o', 'code-review', 2000, true, 0.9);

    const record = pt.getRecord('gpt-4o', 'code-review');
    expect(record).toBeDefined();
    expect(record!.modelId).toBe('gpt-4o');
    expect(record!.taskType).toBe('code-review');
    expect(record!.sampleCount).toBe(1);
    expect(record!.avgLatencyMs).toBe(2000);
    expect(record!.successRate).toBe(1);
    expect(record!.avgQualityScore).toBe(0.9);
  });

  it('computes exponential moving average on updates', () => {
    const pt = new PerformanceTracker(fixedNow);

    pt.recordCompletion('gpt-4o', 'summarize', 1000, true, 0.8);
    pt.recordCompletion('gpt-4o', 'summarize', 3000, true, 0.6);

    const record = pt.getRecord('gpt-4o', 'summarize');
    expect(record!.sampleCount).toBe(2);
    // EMA should move toward newer values
    expect(record!.avgLatencyMs).toBeGreaterThan(1000);
    expect(record!.avgLatencyMs).toBeLessThan(3000);
  });

  it('returns neutral score for insufficient data', () => {
    const pt = new PerformanceTracker(fixedNow);
    pt.recordCompletion('gpt-4o', 'test', 1000, true, 0.9);
    pt.recordCompletion('gpt-4o', 'test', 1000, true, 0.9);
    // Only 2 samples — below threshold of 3

    expect(pt.getPerformanceScore('gpt-4o', 'test')).toBe(0.5);
  });

  it('returns neutral score for unknown model+taskType', () => {
    const pt = new PerformanceTracker(fixedNow);
    expect(pt.getPerformanceScore('unknown', 'unknown')).toBe(0.5);
  });

  it('computes performance score correctly with sufficient data', () => {
    const pt = new PerformanceTracker(fixedNow);

    // Record 3+ completions for threshold
    for (let i = 0; i < 5; i++) {
      pt.recordCompletion('gpt-4o', 'code', 1000, true, 0.9);
    }

    const score = pt.getPerformanceScore('gpt-4o', 'code');
    // Good performance: quality 0.9 * 0.5 + success 1.0 * 0.35 + latency ~0.97 * 0.15
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('low quality results in lower performance score', () => {
    const pt = new PerformanceTracker(fixedNow);

    for (let i = 0; i < 5; i++) {
      pt.recordCompletion('bad-model', 'code', 5000, false, 0.2);
    }

    const score = pt.getPerformanceScore('bad-model', 'code');
    expect(score).toBeLessThan(0.5);
  });

  it('getBestModel returns model with highest performance', () => {
    const pt = new PerformanceTracker(fixedNow);

    for (let i = 0; i < 5; i++) {
      pt.recordCompletion('model-a', 'task', 1000, true, 0.9);
      pt.recordCompletion('model-b', 'task', 2000, true, 0.6);
      pt.recordCompletion('model-c', 'task', 3000, false, 0.3);
    }

    const best = pt.getBestModel('task', ['model-a', 'model-b', 'model-c']);
    expect(best).toBe('model-a');
  });

  it('getBestModel handles no data gracefully', () => {
    const pt = new PerformanceTracker(fixedNow);
    const best = pt.getBestModel('task', ['a', 'b', 'c']);
    // All candidates have equal neutral scores, so the implementation keeps the first candidate.
    expect(best).toBe('a');
  });

  it('export/import roundtrips', () => {
    const pt = new PerformanceTracker(fixedNow);
    pt.recordCompletion('gpt-4o', 'code', 1000, true, 0.8);
    pt.recordCompletion('claude-sonnet', 'summarize', 500, true, 0.95);

    const exported = pt.export();
    expect(exported.length).toBe(2);

    const pt2 = new PerformanceTracker(fixedNow);
    pt2.import(exported);

    expect(pt2.getRecord('gpt-4o', 'code')).toBeDefined();
    expect(pt2.getRecord('claude-sonnet', 'summarize')).toBeDefined();
  });

  it('getAll returns all records', () => {
    const pt = new PerformanceTracker(fixedNow);
    pt.recordCompletion('a', 't1', 100, true, 1);
    pt.recordCompletion('b', 't2', 200, true, 0.5);

    expect(pt.getAll().length).toBe(2);
  });

  it('clear removes all records', () => {
    const pt = new PerformanceTracker(fixedNow);
    pt.recordCompletion('a', 't1', 100, true, 1);
    pt.clear();

    expect(pt.getAll().length).toBe(0);
  });
});

// ── Singleton / Factory ─────────────────────────────────────────────

describe('getDefaultModelRouter', () => {
  afterEach(() => {
    resetDefaultModelRouter();
  });

  it('creates and caches default router', () => {
    const r1 = getDefaultModelRouter();
    const r2 = getDefaultModelRouter();
    expect(r1).toBe(r2);
  });

  it('reset clears the singleton', () => {
    const r1 = getDefaultModelRouter();
    resetDefaultModelRouter();
    const r2 = getDefaultModelRouter();
    expect(r1).not.toBe(r2);
  });

  it('accepts custom config on first creation', () => {
    const router = getDefaultModelRouter({
      quotaThreshold: 0.5,
    });

    router.quota.setQuota('global', { total: 100, used: 60, resetsAt: '2026-03-01' });

    const decision = router.selectModel(makeRequest({
      complexity: 'complex',
    }));

    expect(decision.quotaDowngraded).toBe(true);
  });
});

// ── Integration: Full Routing Scenarios ─────────────────────────────

describe('integration scenarios', () => {
  it('scenario: simple batch task with low quota', () => {
    const router = makeRouter();
    router.quota.setQuota('global', { total: 10000, used: 9200, resetsAt: '2026-03-01' });

    const decision = router.selectModel(makeRequest({
      complexity: 'simple',
      timeSensitivity: 'batch',
    }));

    expect(decision.tier).toBe(1);
    expect(decision.quotaDowngraded).toBe(true);
  });

  it('scenario: urgent complex task for high-priority BU', () => {
    const router = makeRouter({
      businessUnitOverrides: [
        { businessUnit: 'ventureos', priority: 'high', minTier: 2 },
      ],
    });

    const decision = router.selectModel(makeRequest({
      complexity: 'complex',
      timeSensitivity: 'urgent',
      businessUnit: 'ventureos',
    }));

    expect(decision.tier).toBeGreaterThanOrEqual(2);
    expect(decision.breakdown.priorityScore).toBe(100);
    expect(decision.breakdown.timeSensitivityScore).toBe(80);
  });

  it('scenario: medium task with performance data favoring a model', () => {
    const router = makeRouter();

    // Record great performance for claude-sonnet on code-review
    for (let i = 0; i < 10; i++) {
      router.performance.recordCompletion('claude-sonnet', 'code-review', 800, true, 0.95);
      router.performance.recordCompletion('gpt-4o', 'code-review', 3000, true, 0.7);
    }

    const decision = router.selectModel(makeRequest({
      complexity: 'medium',
      taskType: 'code-review',
    }));

    // Claude Sonnet should be preferred due to performance
    expect(decision.model.id).toBe('claude-sonnet');
  });

  it('scenario: provider outage with graceful fallback', () => {
    const models = makeModels([
      { id: 'gpt-4o-mini', status: 'unavailable' },
      { id: 'gpt-4o', status: 'unavailable' },
      { id: 'o1', status: 'unavailable' },
    ]);

    const router = makeRouter({ models });

    const decision = router.selectModel(makeRequest({
      complexity: 'medium',
      preferredProvider: 'openai', // Preferred but unavailable
    }));

    // Should fallback to anthropic
    expect(decision.model.provider).toBe('anthropic');
  });

  it('scenario: quota at exactly threshold boundary', () => {
    const router = makeRouter({ quotaThreshold: 0.9 });
    router.quota.setQuota('global', { total: 10000, used: 9000, resetsAt: '2026-03-01' });

    const decision = router.selectModel(makeRequest({
      complexity: 'complex',
    }));

    // At exactly 90% — should trigger downgrade
    expect(decision.tier).toBe(1);
    expect(decision.quotaDowngraded).toBe(true);
  });

  it('scenario: quota just below threshold', () => {
    const router = makeRouter({ quotaThreshold: 0.9 });
    router.quota.setQuota('global', { total: 10000, used: 8999, resetsAt: '2026-03-01' });

    const decision = router.selectModel(makeRequest({
      complexity: 'complex',
    }));

    // Below 90% — should NOT trigger downgrade
    expect(decision.quotaDowngraded).toBe(false);
  });

  it('scenario: recording completion updates performance metrics', () => {
    const router = makeRouter();

    const decision = router.selectModel(makeRequest({
      complexity: 'medium',
      taskType: 'analysis',
    }));

    // Simulate completion
    router.performance.recordCompletion(
      decision.model.id,
      'analysis',
      1500,
      true,
      0.85
    );

    const record = router.performance.getRecord(decision.model.id, 'analysis');
    expect(record).toBeDefined();
    expect(record!.sampleCount).toBe(1);
  });
});
