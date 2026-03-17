import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createControlClient } from '@/data/control-client';

// Mock fetch globally
const mockFetch = vi.fn();

describe('data/control-client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('location', { origin: 'http://localhost:8001' });
    // Mock localStorage for auth token
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'test-token'),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockOk(data: Record<string, unknown> = { ok: true }) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => data,
    });
  }

  function mockError(status = 500) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => 'Server Error',
    });
  }

  describe('pauseAgent', () => {
    it('sends POST to correct endpoint', async () => {
      mockOk();
      const client = createControlClient();
      const result = await client.pauseAgent('venture_delivery');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/agents/venture_delivery/pause');
      expect(opts.method).toBe('POST');
    });

    it('handles server errors gracefully', async () => {
      mockError(500);
      const onError = vi.fn();
      const client = createControlClient({ onError });
      const result = await client.pauseAgent('venture_delivery');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('resumeAgent', () => {
    it('sends POST to correct endpoint', async () => {
      mockOk();
      const client = createControlClient();
      await client.resumeAgent('venture_infrastructure');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/agents/venture_infrastructure/resume');
    });
  });

  describe('spawnMission', () => {
    it('sends mission data', async () => {
      mockOk({ ok: true, missionId: 'mission-123' });
      const client = createControlClient();
      const result = await client.spawnMission({
        title: 'Test Mission',
        description: 'A test',
        assignee: 'venture_delivery',
        priority: 'high',
      });

      expect(result.ok).toBe(true);
      expect(result.missionId).toBe('mission-123');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.title).toBe('Test Mission');
      expect(body.priority).toBe('high');
    });

    it('handles network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const client = createControlClient();
      const result = await client.spawnMission({
        title: 'Test',
        description: '',
        assignee: 'venture_delivery',
        priority: 'normal',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('adjustBudget', () => {
    it('sends budget adjustment', async () => {
      mockOk();
      const client = createControlClient();
      await client.adjustBudget({
        agentId: 'venture_research',
        newBudget: 50000,
        previousBudget: 30000,
      });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/agents/venture_research/budget');
      const body = JSON.parse(opts.body);
      expect(body.newBudget).toBe(50000);
      expect(body.previousBudget).toBe(30000);
    });
  });

  describe('setMissionPriority', () => {
    it('sends priority change', async () => {
      mockOk();
      const client = createControlClient();
      await client.setMissionPriority('mission-1', 'critical');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/missions/mission-1/priority');
      const body = JSON.parse(opts.body);
      expect(body.priority).toBe('critical');
    });
  });

  describe('updateConfig', () => {
    it('sends config update', async () => {
      mockOk();
      const client = createControlClient();
      await client.updateConfig('venture_security', { maxSessions: 5 });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/agents/venture_security/config');
      const body = JSON.parse(opts.body);
      expect(body.config.maxSessions).toBe(5);
    });
  });

  describe('fetchControlState', () => {
    it('loads persisted control state', async () => {
      mockOk({ ok: true, pausedAgents: ['venture_delivery'], budgets: { venture_delivery: 50000 } });
      const client = createControlClient();
      const result = await client.fetchControlState();

      expect(result.ok).toBe(true);
      expect(result.pausedAgents).toContain('venture_delivery');
      expect(result.budgets?.venture_delivery).toBe(50000);
    });
  });

  describe('fetchMissions', () => {
    it('fetches mission list from GET /missions', async () => {
      mockOk({
        ok: true,
        missions: [
          {
            missionId: 'mission-1',
            title: 'Test',
            description: '',
            assignee: 'venture_delivery',
            priority: 'normal',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      });
      const client = createControlClient();
      const result = await client.fetchMissions();

      expect(result.ok).toBe(true);
      expect(result.missions).toHaveLength(1);
      expect(result.missions![0].missionId).toBe('mission-1');
    });

    it('handles fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const client = createControlClient();
      const result = await client.fetchMissions();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('updateMission', () => {
    it('sends PATCH to correct endpoint', async () => {
      mockOk({ ok: true, missionId: 'mission-1', mission: { title: 'Updated' } });
      const client = createControlClient();
      const result = await client.updateMission('mission-1', {
        title: 'Updated',
        priority: 'high',
      });

      expect(result.ok).toBe(true);
      expect(result.missionId).toBe('mission-1');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/missions/mission-1');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.title).toBe('Updated');
      expect(body.priority).toBe('high');
    });

    it('encodes mission ID in URL', async () => {
      mockOk({ ok: true });
      const client = createControlClient();
      await client.updateMission('mission with spaces', { title: 'Test' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('mission%20with%20spaces');
    });

    it('handles server error', async () => {
      mockError(400);
      const onError = vi.fn();
      const client = createControlClient({ onError });
      const result = await client.updateMission('mission-1', { title: 'X' });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('auth headers', () => {
    it('includes Authorization header', async () => {
      mockOk();
      const client = createControlClient();
      await client.pauseAgent('venture_delivery');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-token');
    });
  });
});
