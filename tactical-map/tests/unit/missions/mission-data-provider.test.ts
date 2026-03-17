/**
 * Mission Data Provider Tests — Phase 5.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MockMissionDataProvider,
} from '../../../src/missions/mission-data-provider';
import type { MissionData, MissionDependency } from '../../../src/missions/types';

describe('MockMissionDataProvider', () => {
  let provider: MockMissionDataProvider;

  beforeEach(() => {
    provider = new MockMissionDataProvider({
      updateInterval: 0, // No auto-tick for predictable tests
      initialMissions: 5,
      simulateTransitions: false,
    });
  });

  afterEach(() => {
    provider.disconnect();
  });

  describe('connect()', () => {
    it('generates initial missions on connect', () => {
      provider.connect();
      const missions = provider.getMissions();
      expect(missions).toHaveLength(5);
    });

    it('generates missions with required fields', () => {
      provider.connect();
      const missions = provider.getMissions();
      for (const m of missions) {
        expect(m.missionId).toBeTruthy();
        expect(m.title).toBeTruthy();
        expect(m.phase).toBeTruthy();
        expect(typeof m.progress).toBe('number');
        expect(m.assignedTo.length).toBeGreaterThan(0);
        expect(Array.isArray(m.tasks)).toBe(true);
        expect(Array.isArray(m.history)).toBe(true);
        expect(m.createdAt).toBeTruthy();
        expect(m.updatedAt).toBeTruthy();
      }
    });

    it('generates dependencies between missions', () => {
      provider.connect();
      const deps = provider.getDependencies();
      expect(deps.length).toBeGreaterThan(0);
      for (const dep of deps) {
        expect(dep.from).toBeTruthy();
        expect(dep.to).toBeTruthy();
        expect(['blocks', 'informs', 'feeds']).toContain(dep.type);
      }
    });

    it('distributes missions across different phases', () => {
      provider.connect();
      const phases = new Set(provider.getMissions().map((m) => m.phase));
      expect(phases.size).toBeGreaterThan(1);
    });
  });

  describe('onUpdate/offUpdate', () => {
    it('notifies listeners on connect', () => {
      const callback = vi.fn();
      provider.onUpdate(callback);
      provider.connect();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array)
      );
    });

    it('stops notifying after offUpdate', () => {
      const callback = vi.fn();
      provider.onUpdate(callback);
      provider.connect();
      expect(callback).toHaveBeenCalledTimes(1);

      provider.offUpdate(callback);
      provider.refresh();
      expect(callback).toHaveBeenCalledTimes(1); // Not called again
    });

    it('supports multiple listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      provider.onUpdate(cb1);
      provider.onUpdate(cb2);
      provider.connect();
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe('setMissions()', () => {
    it('overrides missions and notifies listeners', () => {
      const callback = vi.fn();
      provider.onUpdate(callback);
      provider.connect();

      const custom: MissionData[] = [{
        missionId: 'custom-1',
        title: 'Custom Mission',
        description: 'Test',
        phase: 'execute',
        progress: 50,
        assignedTo: ['venture_research'],
        tasks: [],
        dependencies: [],
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queueDepth: 0,
      }];

      provider.setMissions(custom);
      expect(provider.getMissions()).toHaveLength(1);
      expect(provider.getMissions()[0].missionId).toBe('custom-1');
      expect(callback).toHaveBeenCalledTimes(2); // connect + setMissions
    });
  });

  describe('refresh()', () => {
    it('emits current data to listeners', async () => {
      const callback = vi.fn();
      provider.onUpdate(callback);
      provider.connect();
      await provider.refresh();
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('handles 0 initial missions', () => {
      const emptyProvider = new MockMissionDataProvider({
        initialMissions: 0,
        updateInterval: 0,
        simulateTransitions: false,
      });
      emptyProvider.connect();
      expect(emptyProvider.getMissions()).toHaveLength(0);
      expect(emptyProvider.getDependencies()).toHaveLength(0);
      emptyProvider.disconnect();
    });

    it('handles 1 initial mission (no dependencies)', () => {
      const singleProvider = new MockMissionDataProvider({
        initialMissions: 1,
        updateInterval: 0,
        simulateTransitions: false,
      });
      singleProvider.connect();
      expect(singleProvider.getMissions()).toHaveLength(1);
      expect(singleProvider.getDependencies()).toHaveLength(0);
      singleProvider.disconnect();
    });

    it('getMissions returns a copy (not reference)', () => {
      provider.connect();
      const a = provider.getMissions();
      const b = provider.getMissions();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});

describe('MockMissionDataProvider with auto-tick', () => {
  it('advances mission phases over time', async () => {
    const provider = new MockMissionDataProvider({
      updateInterval: 50, // fast ticks for testing
      initialMissions: 3,
      simulateTransitions: true,
    });

    const updates: MissionData[][] = [];
    provider.onUpdate((missions) => {
      updates.push([...missions]);
    });

    provider.connect();

    // Wait for a few ticks
    await new Promise((resolve) => setTimeout(resolve, 200));
    provider.disconnect();

    // Should have received multiple updates
    expect(updates.length).toBeGreaterThan(1);
  });
});
