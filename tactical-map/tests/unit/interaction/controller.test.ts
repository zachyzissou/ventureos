import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInteractionController } from '@/interaction/controller';
import { createEventBus } from '@/interaction/event-bus';
import { createStore } from '@/state/store';
import type { MapState } from '@/state/types';
import type { HealthState } from '@/health/types';
import type { EconomyState } from '@/economy/types';
import { createEmptyHealthState } from '@/health/state';
import { createEmptyEconomyState } from '@/economy/state';
import { AGENT_ORDER, AGENTS } from '@/config';
import type { AgentId } from '@/config';

// ─── Mock layers ───

function mockDetailPanel() {
  return {
    container: { visible: false } as any,
    show: vi.fn(),
    hide: vi.fn(),
    updateData: vi.fn(),
    setViewport: vi.fn(),
    update: vi.fn(),
    isVisible: vi.fn(() => false),
    currentAgent: vi.fn(() => null),
    onTogglePauseResume: vi.fn(),
    onSpawnMission: vi.fn(),
  };
}

function mockConfirmDialog() {
  return {
    container: { visible: false } as any,
    show: vi.fn(),
    hide: vi.fn(),
    setViewport: vi.fn(),
    update: vi.fn(),
    isVisible: vi.fn(() => false),
  };
}

function mockMissionModal() {
  let submitCb: any = null;
  return {
    container: { visible: false } as any,
    show: vi.fn(),
    hide: vi.fn(),
    setViewport: vi.fn(),
    update: vi.fn(),
    isVisible: vi.fn(() => false),
    getFormState: vi.fn(() => ({
      title: '',
      description: '',
      assignee: 'synth' as AgentId,
      priority: 'normal' as const,
      tokenBudget: '',
    })),
    setField: vi.fn(),
    onSubmit: vi.fn((cb: any) => { submitCb = cb; }),
    submit: vi.fn(() => {
      if (!submitCb) return;
      submitCb({
        title: 'Default mission',
        description: '',
        assignee: 'synth',
        priority: 'normal',
      });
    }),
    _getSubmitCb: () => submitCb,
  };
}

function mockCommandPalette() {
  return {
    container: { visible: false } as any,
    show: vi.fn(),
    hide: vi.fn(),
    setCommands: vi.fn(),
    setUserRole: vi.fn(),
    setQuery: vi.fn(),
    getQuery: vi.fn(() => ''),
    selectUp: vi.fn(),
    selectDown: vi.fn(),
    executeSelected: vi.fn(),
    setViewport: vi.fn(),
    update: vi.fn(),
    isVisible: vi.fn(() => false),
    resultCount: vi.fn(() => 0),
    selectedIndex: vi.fn(() => 0),
  };
}

function mockBudgetSlider() {
  return {
    container: { visible: false } as any,
    configure: vi.fn(),
    getValue: vi.fn(() => 0),
    onChange: vi.fn(),
    onCommit: vi.fn(),
    setVisible: vi.fn(),
    update: vi.fn(),
    currentAgent: vi.fn(() => null),
  };
}

function mockControlClient() {
  return {
    pauseAgent: vi.fn(async () => ({ ok: true })),
    resumeAgent: vi.fn(async () => ({ ok: true })),
    spawnMission: vi.fn(async () => ({ ok: true, missionId: 'test-1' })),
    adjustBudget: vi.fn(async () => ({ ok: true })),
    setMissionPriority: vi.fn(async () => ({ ok: true })),
    updateConfig: vi.fn(async () => ({ ok: true })),
    fetchControlState: vi.fn(async () => ({ ok: true, pausedAgents: [], budgets: {} })),
  };
}

function createTestMapState(): MapState {
  const agents = {} as MapState['agents'];
  for (let i = 0; i < AGENT_ORDER.length; i++) {
    const id = AGENT_ORDER[i];
    agents[id] = {
      id,
      position: id === 'nexus' ? { x: 0, y: 0 } : AGENTS.POSITIONS[i] ?? { x: 0, y: 0 },
      state: 'IDLE',
      sessions: 0,
    };
  }
  return { updatedAt: new Date().toISOString(), agents };
}

describe('interaction/controller', () => {
  let eventBus: ReturnType<typeof createEventBus>;
  let mapStore: ReturnType<typeof createStore<MapState>>;
  let healthStore: ReturnType<typeof createStore<HealthState>>;
  let economyStore: ReturnType<typeof createStore<EconomyState>>;
  let controlClient: ReturnType<typeof mockControlClient>;
  let detailPanel: ReturnType<typeof mockDetailPanel>;
  let confirmDialog: ReturnType<typeof mockConfirmDialog>;
  let missionModal: ReturnType<typeof mockMissionModal>;
  let commandPalette: ReturnType<typeof mockCommandPalette>;
  let budgetSlider: ReturnType<typeof mockBudgetSlider>;
  let controller: ReturnType<typeof createInteractionController>;

  beforeEach(() => {
    eventBus = createEventBus();
    mapStore = createStore<MapState>(createTestMapState());
    healthStore = createStore<HealthState>(createEmptyHealthState());
    economyStore = createStore<EconomyState>(createEmptyEconomyState());
    controlClient = mockControlClient();
    detailPanel = mockDetailPanel();
    confirmDialog = mockConfirmDialog();
    missionModal = mockMissionModal();
    commandPalette = mockCommandPalette();
    budgetSlider = mockBudgetSlider();

    controller = createInteractionController({
      eventBus,
      mapStore,
      healthStore,
      economyStore,
      controlClient,
      detailPanel,
      confirmDialog,
      missionModal,
      commandPalette,
      budgetSlider,
      canvas: { addEventListener: vi.fn(), removeEventListener: vi.fn() } as any,
    });
  });

  describe('getUIState', () => {
    it('returns initial state', () => {
      const state = controller.getUIState();
      expect(state.selectedAgent).toBeNull();
      expect(state.paletteOpen).toBe(false);
      expect(state.userRole).toBe('operator');
    });
  });

  describe('setUserRole', () => {
    it('updates the user role', () => {
      controller.setUserRole('admin');
      expect(controller.getUIState().userRole).toBe('admin');
    });

    it('propagates to command palette', () => {
      controller.setUserRole('viewer');
      expect(commandPalette.setUserRole).toHaveBeenCalledWith('viewer');
    });
  });

  describe('openAgentDetail', () => {
    it('shows the detail panel', () => {
      controller.openAgentDetail('synth');
      expect(detailPanel.show).toHaveBeenCalledOnce();
      expect(controller.getUIState().selectedAgent).toBe('synth');
    });

    it('provides correct agent data', () => {
      controller.openAgentDetail('oracle');
      const data = detailPanel.show.mock.calls[0][0];
      expect(data.id).toBe('oracle');
      expect(data.label).toBe('ORACLE');
      expect(data.state).toBe('IDLE');
    });

    it('blocked for insufficient role', () => {
      controller.setUserRole('viewer' as any);
      // Viewers CAN view (agent:view requires 'viewer')
      controller.openAgentDetail('synth');
      expect(detailPanel.show).toHaveBeenCalled();
    });

    it('shows budget slider only for admin role', () => {
      controller.openAgentDetail('synth');
      expect(budgetSlider.setVisible).toHaveBeenCalledWith(false);

      budgetSlider.setVisible.mockClear();
      controller.setUserRole('admin');
      controller.openAgentDetail('synth');
      expect(budgetSlider.configure).toHaveBeenCalled();
      expect(budgetSlider.setVisible).toHaveBeenCalledWith(true);
    });
  });

  describe('closeAgentDetail', () => {
    it('hides the panel', () => {
      controller.openAgentDetail('synth');
      controller.closeAgentDetail();
      expect(detailPanel.hide).toHaveBeenCalled();
      expect(budgetSlider.setVisible).toHaveBeenCalledWith(false);
      expect(controller.getUIState().selectedAgent).toBeNull();
    });
  });

  describe('pauseAgent', () => {
    it('shows confirmation dialog', () => {
      controller.pauseAgent('synth');
      expect(confirmDialog.show).toHaveBeenCalledOnce();
      const req = confirmDialog.show.mock.calls[0][0];
      expect(req.title).toContain('SYNTH');
      expect(req.severity).toBe('warning');
    });

    it('calls control client on confirm', async () => {
      controller.pauseAgent('atlas');
      const req = confirmDialog.show.mock.calls[0][0];
      await req.onConfirm();
      expect(controlClient.pauseAgent).toHaveBeenCalledWith('atlas');
    });

    it('blocked for viewers', () => {
      controller.setUserRole('viewer' as any);
      controller.pauseAgent('synth');
      expect(confirmDialog.show).not.toHaveBeenCalled();
    });
  });

  describe('resumeAgent', () => {
    it('shows confirmation dialog for resume', () => {
      controller.resumeAgent('synth');
      expect(confirmDialog.show).toHaveBeenCalledOnce();
      const req = confirmDialog.show.mock.calls[0][0];
      expect(req.title).toContain('SYNTH');
      expect(req.severity).toBe('info');
    });

    it('calls control client on confirm', async () => {
      controller.resumeAgent('atlas');
      const req = confirmDialog.show.mock.calls[0][0];
      await req.onConfirm();
      expect(controlClient.resumeAgent).toHaveBeenCalledWith('atlas');
    });
  });

  describe('openMissionSpawn', () => {
    it('opens the mission modal', () => {
      controller.openMissionSpawn();
      expect(missionModal.show).toHaveBeenCalled();
      expect(controller.getUIState().missionSpawnOpen).toBe(true);
    });

    it('passes default assignee', () => {
      controller.openMissionSpawn('oracle');
      expect(missionModal.show).toHaveBeenCalledWith('oracle');
    });

    it('prefills mission title for quick launch', () => {
      controller.openMissionSpawn('oracle');
      expect(missionModal.setField).toHaveBeenCalled();
      const calls = missionModal.setField.mock.calls.map((c: [string]) => c[0]);
      expect(calls).toContain('title');
    });
  });

  describe('command palette', () => {
    it('opens and closes', () => {
      controller.openCommandPalette();
      expect(commandPalette.show).toHaveBeenCalled();
      expect(controller.getUIState().paletteOpen).toBe(true);

      controller.closeCommandPalette();
      expect(commandPalette.hide).toHaveBeenCalled();
      expect(controller.getUIState().paletteOpen).toBe(false);
    });

    it('provides commands on open', () => {
      controller.openCommandPalette();
      expect(commandPalette.setCommands).toHaveBeenCalled();
      const cmds = commandPalette.setCommands.mock.calls[0][0];
      expect(cmds.length).toBeGreaterThan(0);
    });
  });

  describe('getCommands', () => {
    it('returns commands for all agents', () => {
      const cmds = controller.getCommands();
      // Should have view commands for all 8 agents
      const viewCmds = cmds.filter((c) => c.id.startsWith('view-'));
      expect(viewCmds.length).toBe(AGENT_ORDER.length);
    });

    it('includes mission spawn command', () => {
      const cmds = controller.getCommands();
      const spawnCmd = cmds.find((c) => c.id === 'spawn-mission');
      expect(spawnCmd).toBeDefined();
      expect(spawnCmd!.shortcut).toBe('⌘+M');
    });

    it('includes undo/redo commands', () => {
      const cmds = controller.getCommands();
      expect(cmds.find((c) => c.id === 'undo')).toBeDefined();
      expect(cmds.find((c) => c.id === 'redo')).toBeDefined();
    });
  });

  describe('event bus integration', () => {
    it('opens agent detail on agent:click event', () => {
      eventBus.emit({ type: 'agent:click', agentId: 'synth', timestamp: 1000 });
      expect(detailPanel.show).toHaveBeenCalled();
      expect(controller.getUIState().selectedAgent).toBe('synth');
    });

    it('closes detail on terrain:click', () => {
      eventBus.emit({ type: 'agent:click', agentId: 'synth', timestamp: 1000 });
      eventBus.emit({ type: 'terrain:click', timestamp: 2000 });
      expect(detailPanel.hide).toHaveBeenCalled();
    });
  });

  describe('store reactivity', () => {
    it('refreshes detail panel on map store change', () => {
      controller.openAgentDetail('synth');
      detailPanel.updateData.mockClear();

      // Trigger store change
      mapStore.update((s) => ({
        ...s,
        agents: {
          ...s.agents,
          synth: { ...s.agents.synth, state: 'ACTIVE' },
        },
      }));

      expect(detailPanel.updateData).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('cleans up without errors', () => {
      expect(() => controller.destroy()).not.toThrow();
    });
  });
});
