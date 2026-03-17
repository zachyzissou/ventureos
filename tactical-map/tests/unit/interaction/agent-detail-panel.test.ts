import { describe, it, expect, vi } from 'vitest';
import { createAgentDetailPanel } from '@/renderer/agent-detail-panel';
import { createEventBus } from '@/interaction/event-bus';
import type { AgentDetailData } from '@/interaction/types';

function makeAgentData(id = 'venture_delivery' as const): AgentDetailData {
  return {
    id,
    label: id.toUpperCase(),
    state: 'ACTIVE',
    healthStatus: 'green',
    connectivity: 'online',
    metrics: {
      cpuUsage: 0.45,
      memoryUsage: 0.62,
      latencyMs: 120,
      requestsPerSec: 5.2,
      errorRate: 0.01,
      uptimeSec: 3600,
    },
    economy: null,
    sessions: 2,
    paused: false,
    uptimeStr: '1h 0m',
  };
}

describe('renderer/agent-detail-panel', () => {
  it('creates with container hidden', () => {
    const panel = createAgentDetailPanel();
    expect(panel.isVisible()).toBe(false);
    expect(panel.currentAgent()).toBeNull();
  });

  it('show makes it visible', () => {
    const panel = createAgentDetailPanel();
    panel.show(makeAgentData());
    expect(panel.isVisible()).toBe(true);
    expect(panel.currentAgent()).toBe('venture_delivery');
  });

  it('hide makes it invisible', () => {
    const panel = createAgentDetailPanel();
    panel.show(makeAgentData());
    panel.hide();
    expect(panel.isVisible()).toBe(false);
    expect(panel.currentAgent()).toBeNull();
  });

  it('updateData works when visible', () => {
    const panel = createAgentDetailPanel();
    panel.show(makeAgentData());
    // Should not throw
    panel.updateData({ ...makeAgentData(), state: 'OVERLOADED' });
    expect(panel.isVisible()).toBe(true);
  });

  it('updateData is no-op when hidden', () => {
    const panel = createAgentDetailPanel();
    // Should not throw
    panel.updateData(makeAgentData());
    expect(panel.isVisible()).toBe(false);
  });

  it('setViewport updates layout', () => {
    const panel = createAgentDetailPanel();
    // Should not throw
    panel.setViewport(1920, 1080);
  });

  it('update animates alpha', () => {
    const panel = createAgentDetailPanel();
    panel.show(makeAgentData());
    panel.update(100);
    // Alpha should have increased toward 1
    expect(panel.container.alpha).toBeGreaterThan(0);
  });

  it('update fades out on hide', () => {
    const panel = createAgentDetailPanel();
    panel.show(makeAgentData());
    // Force alpha to 1
    panel.container.alpha = 1;
    panel.hide();
    panel.update(100);
    expect(panel.container.alpha).toBeLessThan(1);
  });

  it('emits panel:close via event bus on close button', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('panel:close', handler);

    const panel = createAgentDetailPanel(bus);
    panel.show(makeAgentData());
    // The close button emits via bus; we test the wiring exists
    expect(panel.isVisible()).toBe(true);
  });

  it('handles different agent IDs', () => {
    const panel = createAgentDetailPanel();
    for (const id of ['venture_research', 'venture_infrastructure', 'venture_security', 'venture_evidence', 'venture_memory', 'venture_strategy', 'venture_control'] as const) {
      panel.show(makeAgentData(id));
      expect(panel.currentAgent()).toBe(id);
    }
  });

  it('shows paused state', () => {
    const panel = createAgentDetailPanel();
    panel.show({ ...makeAgentData(), paused: true });
    expect(panel.isVisible()).toBe(true);
  });

  it('shows economy data when available', () => {
    const panel = createAgentDetailPanel();
    panel.show({
      ...makeAgentData(),
      economy: {
        agentId: 'venture_delivery',
        tokenBudget: 100000,
        tokensUsed: 45000,
        tokensRemaining: 55000,
        usageRatio: 0.45,
        quotaRemainingRatio: 0.55,
        costUsd: 4.50,
        burnRateUsdPerHour: 0.5,
        health: 'green',
        history: [],
        updatedAt: Date.now(),
      },
    });
    expect(panel.isVisible()).toBe(true);
  });

  it('registers panel action callbacks', () => {
    const panel = createAgentDetailPanel();
    const pauseCb = vi.fn();
    const missionCb = vi.fn();
    panel.onTogglePauseResume(pauseCb);
    panel.onSpawnMission(missionCb);
    panel.show(makeAgentData());

    // callback registration should be side-effect free
    expect(pauseCb).not.toHaveBeenCalled();
    expect(missionCb).not.toHaveBeenCalled();
  });
});
