/**
 * Interaction Controller — Phase 5.7
 *
 * Central orchestrator for all interactive controls.
 * Wires event bus, panels, modals, palette, permissions,
 * undo/redo, and keyboard shortcuts together.
 */

import type { AgentId } from '@/config';
import { AGENT_ORDER } from '@/config';
import type { Store } from '@/state/store';
import type { MapState } from '@/state/types';
import type { HealthState } from '@/health/types';
import type { EconomyState } from '@/economy/types';
import type { EventBus } from './event-bus';
import type {
  AgentDetailData,
  ConfirmationRequest,
  ControlAction,
  InteractiveUIState,
  PaletteCommand,
  UserRole,
} from './types';
import { createInitialUIState } from './types';
import { canPerformAction, validatePermission } from './permissions';
import { createUndoStack, pushUndo, undo, redo, canUndo, canRedo } from './undo';
import type { UndoStack } from './types';
import type { ControlClient, PersistedMission, MissionUpdateRequest } from '@/data/control-client';
import type { AgentDetailPanelLayer } from '@/renderer/agent-detail-panel';
import type { ConfirmationDialogLayer } from '@/renderer/confirmation-dialog';
import type { MissionSpawnModalLayer } from '@/renderer/mission-spawn-modal';
import type { MissionEditModalLayer } from '@/renderer/mission-edit-modal';
import type { MissionListPanelLayer } from '@/renderer/mission-list-panel';
import type { CommandPaletteLayer } from '@/renderer/command-palette';
import type { BudgetSliderLayer } from '@/renderer/budget-slider';

export type InteractionControllerOptions = {
  eventBus: EventBus;
  mapStore: Store<MapState>;
  healthStore: Store<HealthState>;
  economyStore: Store<EconomyState>;
  controlClient: ControlClient;
  detailPanel: AgentDetailPanelLayer;
  confirmDialog: ConfirmationDialogLayer;
  missionModal: MissionSpawnModalLayer;
  missionEditModal?: MissionEditModalLayer;
  missionListPanel?: MissionListPanelLayer;
  commandPalette: CommandPaletteLayer;
  budgetSlider: BudgetSliderLayer;
  canvas: HTMLCanvasElement;
  onUIStateChange?: (state: InteractiveUIState) => void;
};

export type InteractionController = {
  /** Get current UI state. */
  getUIState: () => InteractiveUIState;
  /** Set user role. */
  setUserRole: (role: UserRole) => void;
  /** Open agent detail by id. */
  openAgentDetail: (agentId: AgentId) => void;
  /** Close agent detail. */
  closeAgentDetail: () => void;
  /** Pause an agent (with confirmation). */
  pauseAgent: (agentId: AgentId) => void;
  /** Resume an agent (with confirmation). */
  resumeAgent: (agentId: AgentId) => void;
  /** Open mission spawn modal. */
  openMissionSpawn: (defaultAssignee?: AgentId) => void;
  /** Open the mission list panel (for in-map editing). */
  openMissionList: () => void;
  /** Close the mission list panel. */
  closeMissionList: () => void;
  /** Open mission edit modal for a specific mission. */
  openMissionEdit: (mission: PersistedMission) => void;
  /** Close mission edit modal. */
  closeMissionEdit: () => void;
  /** Open command palette. */
  openCommandPalette: () => void;
  /** Close command palette. */
  closeCommandPalette: () => void;
  /** Undo last action. */
  undoAction: () => void;
  /** Redo last undone action. */
  redoAction: () => void;
  /** Build palette commands. */
  getCommands: () => PaletteCommand[];
  /** Clean up listeners. */
  destroy: () => void;
};

export function createInteractionController(opts: InteractionControllerOptions): InteractionController {
  let uiState: InteractiveUIState = createInitialUIState();
  let undoStack: UndoStack = createUndoStack();

  // Track paused agents + budget overrides (seeded from server-side control state).
  const pausedAgents = new Set<AgentId>();
  const budgetOverrides = new Map<AgentId, number>();

  function resolveAgentBudget(agentId: AgentId): { budget: number; maxBudget: number } {
    const eco = opts.economyStore.get().agents[agentId];
    const fallbackBudget = budgetOverrides.get(agentId) ?? 100_000;
    const budget = Math.max(1, Math.round(eco?.tokenBudget ?? fallbackBudget));
    const pool = opts.economyStore.get().pool.tokenQuotaTotal;
    const poolBasedMax = pool > 0 ? Math.round(pool / 2) : 0;
    const maxBudget = Math.max(budget, poolBasedMax, fallbackBudget, 100_000);
    return { budget, maxBudget };
  }

  function updateBudgetInStore(agentId: AgentId, newBudget: number) {
    const nowMs = Date.now();
    opts.economyStore.update((curr) => {
      const agent = curr.agents[agentId];
      if (!agent) return curr;

      const tokenBudget = Math.max(1, Math.round(newBudget));
      const tokensUsed = Math.min(agent.tokensUsed, tokenBudget);
      const tokensRemaining = Math.max(0, tokenBudget - tokensUsed);
      const usageRatio = tokenBudget > 0 ? tokensUsed / tokenBudget : 0;
      const quotaRemainingRatio = tokenBudget > 0 ? tokensRemaining / tokenBudget : 0;

      return {
        ...curr,
        updatedAt: nowMs,
        agents: {
          ...curr.agents,
          [agentId]: {
            ...agent,
            tokenBudget,
            tokensUsed,
            tokensRemaining,
            usageRatio,
            quotaRemainingRatio,
            updatedAt: nowMs,
          },
        },
      };
    });
  }

  function updateUI(partial: Partial<InteractiveUIState>) {
    uiState = { ...uiState, ...partial };
    opts.onUIStateChange?.(uiState);
  }

  function setUserRole(role: UserRole) {
    updateUI({ userRole: role });
    opts.commandPalette.setUserRole(role);

    // Re-evaluate budget control visibility when role changes.
    if (!uiState.selectedAgent) return;
    if (canPerformAction(role, 'budget:adjust') && uiState.selectedAgent !== 'nexus') {
      const { budget, maxBudget } = resolveAgentBudget(uiState.selectedAgent);
      opts.budgetSlider.configure(uiState.selectedAgent, budget, maxBudget);
      opts.budgetSlider.setVisible(true);
    } else {
      opts.budgetSlider.setVisible(false);
    }
  }

  // ─── Agent Detail ───

  function buildAgentDetail(agentId: AgentId): AgentDetailData {
    const map = opts.mapStore.get();
    const health = opts.healthStore.get();
    const economy = opts.economyStore.get();

    const mapAgent = map.agents[agentId];
    const healthAgent = health.agents[agentId];
    const ecoAgent = economy.agents[agentId] ?? null;

    const uptimeSec = healthAgent?.metrics?.uptimeSec ?? 0;
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const uptimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      id: agentId,
      label: agentId.toUpperCase(),
      state: mapAgent?.state ?? 'IDLE',
      healthStatus: healthAgent?.status ?? 'green',
      connectivity: healthAgent?.connectivity ?? 'online',
      metrics: healthAgent?.metrics ?? {
        cpuUsage: 0, memoryUsage: 0, latencyMs: 0,
        requestsPerSec: 0, errorRate: 0, uptimeSec: 0,
      },
      economy: ecoAgent,
      sessions: mapAgent?.sessions ?? 0,
      paused: pausedAgents.has(agentId) || mapAgent?.paused === true,
      uptimeStr,
    };
  }

  function openAgentDetail(agentId: AgentId) {
    const err = validatePermission(uiState.userRole, 'agent:view');
    if (err) { console.warn(err); return; }

    const data = buildAgentDetail(agentId);
    opts.detailPanel.show(data);

    if (canPerformAction(uiState.userRole, 'budget:adjust') && agentId !== 'nexus') {
      const { budget, maxBudget } = resolveAgentBudget(agentId);
      opts.budgetSlider.configure(agentId, budget, maxBudget);
      opts.budgetSlider.setVisible(true);
    } else {
      opts.budgetSlider.setVisible(false);
    }

    updateUI({ selectedAgent: agentId });
    opts.eventBus.emit({ type: 'panel:open', agentId, timestamp: performance.now() });
  }

  function closeAgentDetail() {
    opts.detailPanel.hide();
    opts.budgetSlider.setVisible(false);
    updateUI({ selectedAgent: null });
    opts.eventBus.emit({ type: 'panel:close', timestamp: performance.now() });
  }

  // ─── Pause / Resume ───

  function pauseAgent(agentId: AgentId) {
    const err = validatePermission(uiState.userRole, 'agent:pause');
    if (err) { console.warn(err); return; }

    const request: ConfirmationRequest = {
      id: `pause-${agentId}-${Date.now()}`,
      title: `Pause ${agentId.toUpperCase()}?`,
      message: `This will pause all active sessions for ${agentId}. The agent will not process new tasks until resumed.`,
      confirmLabel: 'Pause',
      cancelLabel: 'Cancel',
      severity: 'warning',
      onConfirm: async () => {
        const action: ControlAction = {
          type: 'agent:pause',
          target: agentId,
          payload: {},
          createdAt: new Date().toISOString(),
        };
        const result = await opts.controlClient.pauseAgent(agentId);
        if (result.ok) {
          pausedAgents.add(agentId);
          undoStack = pushUndo(undoStack, action, { paused: false });
          // Refresh detail panel if open
          if (uiState.selectedAgent === agentId) {
            opts.detailPanel.updateData(buildAgentDetail(agentId));
          }
        } else {
          console.warn(`Failed to pause ${agentId}:`, result.error);
        }
      },
      onCancel: () => {},
    };

    opts.confirmDialog.show(request);
    updateUI({ confirmation: request });
  }

  function resumeAgent(agentId: AgentId) {
    const err = validatePermission(uiState.userRole, 'agent:resume');
    if (err) { console.warn(err); return; }

    const request: ConfirmationRequest = {
      id: `resume-${agentId}-${Date.now()}`,
      title: `Resume ${agentId.toUpperCase()}?`,
      message: `This will resume task processing for ${agentId}.`,
      confirmLabel: 'Resume',
      cancelLabel: 'Cancel',
      severity: 'info',
      onConfirm: async () => {
        const action: ControlAction = {
          type: 'agent:resume',
          target: agentId,
          payload: {},
          createdAt: new Date().toISOString(),
        };
        const result = await opts.controlClient.resumeAgent(agentId);
        if (result.ok) {
          pausedAgents.delete(agentId);
          undoStack = pushUndo(undoStack, action, { paused: true });
          if (uiState.selectedAgent === agentId) {
            opts.detailPanel.updateData(buildAgentDetail(agentId));
          }
        } else {
          console.warn(`Failed to resume ${agentId}:`, result.error);
        }
      },
      onCancel: () => {},
    };

    opts.confirmDialog.show(request);
    updateUI({ confirmation: request });
  }

  // ─── Mission Spawn ───

  function openMissionSpawn(defaultAssignee?: AgentId) {
    const err = validatePermission(uiState.userRole, 'mission:spawn');
    if (err) { console.warn(err); return; }

    opts.missionModal.show(defaultAssignee);

    // Ensure the modal is immediately submittable without keyboard wiring.
    const stamp = new Date();
    const defaultTitle = defaultAssignee
      ? `Support ${defaultAssignee.toUpperCase()} — ${stamp.toLocaleTimeString()}`
      : `New Mission — ${stamp.toLocaleTimeString()}`;
    opts.missionModal.setField('title', defaultTitle);

    if (defaultAssignee && defaultAssignee !== 'nexus') {
      opts.missionModal.setField('assignee', defaultAssignee);
    }

    updateUI({ missionSpawnOpen: true });
  }

  // Wire mission submit
  opts.missionModal.onSubmit(async (req) => {
    const result = await opts.controlClient.spawnMission(req);
    if (result.ok) {
      console.log(`[interactive] Mission spawned: ${result.missionId}`);
      const action: ControlAction = {
        type: 'mission:spawn',
        target: req.assignee,
        payload: { missionId: result.missionId, ...req },
        createdAt: new Date().toISOString(),
      };
      undoStack = pushUndo(undoStack, action, {});
    } else {
      console.warn(`Failed to spawn mission:`, result.error);
    }
    updateUI({ missionSpawnOpen: false });
  });

  // ─── Mission List / Edit (Issue #135) ───

  function openMissionList() {
    const err = validatePermission(uiState.userRole, 'mission:priority');
    if (err) { console.warn(err); return; }

    if (!opts.missionListPanel) {
      console.warn('[interactive] Mission list panel not available');
      return;
    }

    // Fetch missions from backend
    void opts.controlClient.fetchMissions?.().then((result) => {
      if (!result?.ok || !result.missions) {
        console.warn('[interactive] Failed to fetch missions:', result?.error);
        opts.missionListPanel!.show([]);
        return;
      }
      opts.missionListPanel!.show(result.missions);
    }).catch((err) => {
      console.warn('[interactive] Failed to fetch missions:', err);
      opts.missionListPanel!.show([]);
    });

    updateUI({ missionListOpen: true });
  }

  function closeMissionList() {
    opts.missionListPanel?.hide();
    updateUI({ missionListOpen: false });
  }

  function openMissionEdit(mission: PersistedMission) {
    const err = validatePermission(uiState.userRole, 'mission:priority');
    if (err) { console.warn(err); return; }

    if (!opts.missionEditModal) {
      console.warn('[interactive] Mission edit modal not available');
      return;
    }

    // Close list panel if open
    closeMissionList();

    opts.missionEditModal.show(mission);
    updateUI({ missionEditOpen: true });
  }

  function closeMissionEdit() {
    opts.missionEditModal?.hide();
    updateUI({ missionEditOpen: false });
  }

  // Wire mission list panel → edit
  if (opts.missionListPanel) {
    opts.missionListPanel.onEdit((mission) => {
      openMissionEdit(mission);
    });
  }

  // Wire mission edit modal submit
  if (opts.missionEditModal) {
    opts.missionEditModal.onSubmit(async (missionId, updates) => {
      const result = await opts.controlClient.updateMission(missionId, updates);
      if (result.ok) {
        console.log(`[interactive] Mission updated: ${missionId}`);
        const action: ControlAction = {
          type: 'mission:priority',
          target: (updates.assignee ?? 'system') as AgentId | 'system',
          payload: { missionId, ...updates },
          createdAt: new Date().toISOString(),
        };
        undoStack = pushUndo(undoStack, action, {});
      } else {
        console.warn(`Failed to update mission ${missionId}:`, result.error);
      }
      updateUI({ missionEditOpen: false });
    });
  }

  // Agent detail panel action wiring
  opts.detailPanel.onTogglePauseResume((agentId, paused) => {
    if (paused) resumeAgent(agentId);
    else pauseAgent(agentId);
  });

  opts.detailPanel.onSpawnMission((agentId) => {
    openMissionSpawn(agentId);
  });

  // Budget slider wiring
  opts.budgetSlider.onCommit(async (agentId, newBudget, previousBudget) => {
    const err = validatePermission(uiState.userRole, 'budget:adjust');
    if (err) {
      console.warn(err);
      const { maxBudget } = resolveAgentBudget(agentId);
      opts.budgetSlider.configure(agentId, previousBudget, maxBudget);
      return;
    }

    const action: ControlAction = {
      type: 'budget:adjust',
      target: agentId,
      payload: { newBudget, previousBudget },
      createdAt: new Date().toISOString(),
    };

    const result = await opts.controlClient.adjustBudget({
      agentId,
      newBudget,
      previousBudget,
    });

    if (!result.ok) {
      console.warn(`Failed to adjust budget for ${agentId}:`, result.error);
      const { maxBudget } = resolveAgentBudget(agentId);
      opts.budgetSlider.configure(agentId, previousBudget, maxBudget);
      return;
    }

    budgetOverrides.set(agentId, newBudget);
    updateBudgetInStore(agentId, newBudget);
    undoStack = pushUndo(undoStack, action, { previousBudget });
  });

  // ─── Command Palette ───

  function openCommandPalette() {
    opts.commandPalette.setCommands(getCommands());
    opts.commandPalette.show();
    updateUI({ paletteOpen: true });
    opts.eventBus.emit({ type: 'palette:open', timestamp: performance.now() });
  }

  function closeCommandPalette() {
    opts.commandPalette.hide();
    updateUI({ paletteOpen: false });
    opts.eventBus.emit({ type: 'palette:close', timestamp: performance.now() });
  }

  // ─── Undo / Redo ───

  function undoAction() {
    if (!canUndo(undoStack)) return;
    const [newStack, entry] = undo(undoStack);
    undoStack = newStack;
    if (entry) {
      console.log(`[interactive] Undo: ${entry.action.type} on ${entry.action.target}`);
      // Apply reverse action
      if (entry.action.type === 'agent:pause') {
        pausedAgents.delete(entry.action.target as AgentId);
        void opts.controlClient.resumeAgent(entry.action.target as AgentId);
      } else if (entry.action.type === 'agent:resume') {
        pausedAgents.add(entry.action.target as AgentId);
        void opts.controlClient.pauseAgent(entry.action.target as AgentId);
      } else if (entry.action.type === 'budget:adjust') {
        const agentId = entry.action.target as AgentId;
        const previousBudget = Number(entry.previousState.previousBudget ?? 0);
        budgetOverrides.set(agentId, previousBudget);
        updateBudgetInStore(agentId, previousBudget);
        void opts.controlClient.adjustBudget({
          agentId,
          newBudget: previousBudget,
          previousBudget: Number(entry.action.payload.newBudget ?? previousBudget),
        });
        if (uiState.selectedAgent === agentId) {
          const { maxBudget } = resolveAgentBudget(agentId);
          opts.budgetSlider.configure(agentId, previousBudget, maxBudget);
        }
      }
    }
  }

  function redoAction() {
    if (!canRedo(undoStack)) return;
    const [newStack, entry] = redo(undoStack);
    undoStack = newStack;
    if (entry) {
      console.log(`[interactive] Redo: ${entry.action.type} on ${entry.action.target}`);
      if (entry.action.type === 'agent:pause') {
        pausedAgents.add(entry.action.target as AgentId);
        void opts.controlClient.pauseAgent(entry.action.target as AgentId);
      } else if (entry.action.type === 'agent:resume') {
        pausedAgents.delete(entry.action.target as AgentId);
        void opts.controlClient.resumeAgent(entry.action.target as AgentId);
      } else if (entry.action.type === 'budget:adjust') {
        const agentId = entry.action.target as AgentId;
        const newBudget = Number(entry.action.payload.newBudget ?? 0);
        budgetOverrides.set(agentId, newBudget);
        updateBudgetInStore(agentId, newBudget);
        void opts.controlClient.adjustBudget({
          agentId,
          newBudget,
          previousBudget: Number(entry.previousState.previousBudget ?? newBudget),
        });
        if (uiState.selectedAgent === agentId) {
          const { maxBudget } = resolveAgentBudget(agentId);
          opts.budgetSlider.configure(agentId, newBudget, maxBudget);
        }
      }
    }
  }

  // ─── Build Commands ───

  function getCommands(): PaletteCommand[] {
    const cmds: PaletteCommand[] = [];

    // Per-agent commands
    for (const id of AGENT_ORDER) {
      cmds.push({
        id: `view-${id}`,
        label: `View ${id.toUpperCase()} Details`,
        category: 'agent',
        requiredRole: 'viewer',
        execute: () => openAgentDetail(id),
        keywords: [id, 'inspect', 'detail', 'info'],
      });

      if (id !== 'nexus') {
        cmds.push({
          id: `pause-${id}`,
          label: `Pause ${id.toUpperCase()}`,
          category: 'agent',
          requiredRole: 'operator',
          execute: () => pauseAgent(id),
          keywords: [id, 'stop', 'halt'],
        });

        cmds.push({
          id: `resume-${id}`,
          label: `Resume ${id.toUpperCase()}`,
          category: 'agent',
          requiredRole: 'operator',
          execute: () => resumeAgent(id),
          keywords: [id, 'start', 'continue'],
        });
      }
    }

    // Mission commands
    cmds.push({
      id: 'spawn-mission',
      label: 'Spawn New Mission',
      shortcut: '⌘+M',
      category: 'mission',
      requiredRole: 'operator',
      execute: () => openMissionSpawn(),
      keywords: ['create', 'new', 'launch', 'task'],
    });

    cmds.push({
      id: 'edit-missions',
      label: 'Edit Mission Priorities',
      shortcut: '⌘+E',
      category: 'mission',
      requiredRole: 'operator',
      execute: () => openMissionList(),
      keywords: ['edit', 'modify', 'change', 'priority', 'list', 'missions', 'update'],
    });

    // System commands
    cmds.push({
      id: 'undo',
      label: 'Undo Last Action',
      shortcut: '⌘+Z',
      category: 'system',
      requiredRole: 'operator',
      execute: () => undoAction(),
      keywords: ['reverse', 'revert'],
    });

    cmds.push({
      id: 'redo',
      label: 'Redo Last Action',
      shortcut: '⌘+⇧+Z',
      category: 'system',
      requiredRole: 'operator',
      execute: () => redoAction(),
      keywords: ['forward'],
    });

    return cmds;
  }

  // ─── Event Bus Wiring ───

  opts.eventBus.on('agent:click', (evt) => {
    if (evt.agentId) openAgentDetail(evt.agentId);
  });

  opts.eventBus.on('terrain:click', () => {
    if (uiState.selectedAgent) closeAgentDetail();
  });

  // ─── Keyboard Shortcuts ───

  function onKeyDown(e: KeyboardEvent) {
    // Scope global shortcuts to the tactical map canvas (or when body has focus).
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      const isCanvasFocused = active === opts.canvas;
      const isBodyFocused = active === document.body || active == null;
      if (!isCanvasFocused && !isBodyFocused) return;
    }

    const meta = e.metaKey || e.ctrlKey;

    // Cmd+K — Command Palette
    if (meta && e.key === 'k') {
      e.preventDefault();
      if (uiState.paletteOpen) closeCommandPalette();
      else openCommandPalette();
      return;
    }

    // Mission modal submit shortcut
    if (!meta && uiState.missionSpawnOpen && e.key === 'Enter') {
      e.preventDefault();
      opts.missionModal.submit();
      updateUI({ missionSpawnOpen: false });
      return;
    }

    // Mission edit modal submit shortcut
    if (!meta && uiState.missionEditOpen && e.key === 'Enter') {
      e.preventDefault();
      opts.missionEditModal?.submit();
      updateUI({ missionEditOpen: false });
      return;
    }

    // ESC — Close whatever is open (ordered by z-index)
    if (e.key === 'Escape') {
      if (uiState.paletteOpen) { closeCommandPalette(); return; }
      if (uiState.missionEditOpen) { closeMissionEdit(); return; }
      if (uiState.missionListOpen) { closeMissionList(); return; }
      if (uiState.confirmation) { opts.confirmDialog.hide(); updateUI({ confirmation: null }); return; }
      if (uiState.missionSpawnOpen) { opts.missionModal.hide(); updateUI({ missionSpawnOpen: false }); return; }
      if (uiState.selectedAgent) { closeAgentDetail(); return; }
    }

    // Cmd+Z — Undo
    if (meta && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoAction();
      return;
    }

    // Cmd+Shift+Z — Redo
    if (meta && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      redoAction();
      return;
    }

    // Cmd+M — Spawn Mission
    if (meta && e.key === 'm') {
      e.preventDefault();
      openMissionSpawn();
      return;
    }

    // Cmd+E — Edit Missions (open list)
    if (meta && e.key === 'e') {
      e.preventDefault();
      if (uiState.missionListOpen) closeMissionList();
      else openMissionList();
      return;
    }

    // Mission list keyboard nav
    if (uiState.missionListOpen && opts.missionListPanel) {
      if (e.key === 'ArrowUp') { e.preventDefault(); opts.missionListPanel.selectUp(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); opts.missionListPanel.selectDown(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = opts.missionListPanel.selectedMission();
        if (selected) openMissionEdit(selected);
      }
      return;
    }

    // Palette keyboard nav
    if (uiState.paletteOpen) {
      if (e.key === 'ArrowUp') { e.preventDefault(); opts.commandPalette.selectUp(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); opts.commandPalette.selectDown(); }
      else if (e.key === 'Enter') { e.preventDefault(); opts.commandPalette.executeSelected(); closeCommandPalette(); }
      else if (e.key === 'Backspace') {
        const q = opts.commandPalette.getQuery();
        opts.commandPalette.setQuery(q.slice(0, -1));
      }
      else if (e.key.length === 1 && !meta) {
        opts.commandPalette.setQuery(opts.commandPalette.getQuery() + e.key);
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  // Seed paused/budget state from backend persistence (best-effort).
  void opts.controlClient.fetchControlState?.().then((state) => {
    if (!state?.ok) return;

    for (const id of state.pausedAgents ?? []) {
      if (AGENT_ORDER.includes(id as AgentId)) pausedAgents.add(id as AgentId);
    }

    const entries = Object.entries(state.budgets ?? {});
    for (const [id, budget] of entries) {
      if (!AGENT_ORDER.includes(id as AgentId)) continue;
      if (typeof budget !== 'number' || !Number.isFinite(budget)) continue;
      const agentId = id as AgentId;
      budgetOverrides.set(agentId, Math.max(1, Math.round(budget)));
      updateBudgetInStore(agentId, Math.max(1, Math.round(budget)));
    }

    if (uiState.selectedAgent) {
      opts.detailPanel.updateData(buildAgentDetail(uiState.selectedAgent));
      if (canPerformAction(uiState.userRole, 'budget:adjust') && uiState.selectedAgent !== 'nexus') {
        const { budget, maxBudget } = resolveAgentBudget(uiState.selectedAgent);
        opts.budgetSlider.configure(uiState.selectedAgent, budget, maxBudget);
        opts.budgetSlider.setVisible(true);
      }
    }
  }).catch((err) => {
    console.warn('[interactive] failed to load control state', err);
  });

  // ─── Refresh detail panel on store changes ───
  const unsubMap = opts.mapStore.subscribe(() => {
    if (uiState.selectedAgent) {
      opts.detailPanel.updateData(buildAgentDetail(uiState.selectedAgent));
    }
  });

  const unsubHealth = opts.healthStore.subscribe(() => {
    if (uiState.selectedAgent) {
      opts.detailPanel.updateData(buildAgentDetail(uiState.selectedAgent));
    }
  });

  const unsubEconomy = opts.economyStore.subscribe(() => {
    if (!uiState.selectedAgent) return;

    opts.detailPanel.updateData(buildAgentDetail(uiState.selectedAgent));

    if (canPerformAction(uiState.userRole, 'budget:adjust') && uiState.selectedAgent !== 'nexus') {
      const { budget, maxBudget } = resolveAgentBudget(uiState.selectedAgent);
      opts.budgetSlider.configure(uiState.selectedAgent, budget, maxBudget);
      opts.budgetSlider.setVisible(true);
    }
  });

  function destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
    }
    unsubMap();
    unsubHealth();
    unsubEconomy();
  }

  return {
    getUIState: () => uiState,
    setUserRole,
    openAgentDetail,
    closeAgentDetail,
    pauseAgent,
    resumeAgent,
    openMissionSpawn,
    openMissionList,
    closeMissionList,
    openMissionEdit,
    closeMissionEdit,
    openCommandPalette,
    closeCommandPalette,
    undoAction,
    redoAction,
    getCommands,
    destroy,
  };
}
