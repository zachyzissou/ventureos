/**
 * Mission Edit Modal Renderer — Phase 5.7 (Issue #135)
 *
 * Full-screen modal for editing existing mission fields:
 * title, description, assignee, priority, and optional token budget.
 *
 * Mirrors the MissionSpawnModal structure but pre-populates
 * from existing mission data and calls updateMission on save.
 *
 * Protoss lore: The Recalibration Chamber — where a Templar Directive
 * can be reshaped, its priority realigned to the shifting battlefield.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { AGENT_ORDER, AGENT_COLORS } from '@/config';
import type { AgentId } from '@/config';
import type { MissionPriority } from '@/interaction/types';
import type { MissionUpdateRequest, PersistedMission } from '@/data/control-client';

export type MissionEditModalLayer = {
  container: Container;
  /** Open the modal pre-populated with mission data. */
  show: (mission: PersistedMission) => void;
  /** Close the modal. */
  hide: () => void;
  /** Set viewport for centering. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is shown? */
  isVisible: () => boolean;
  /** Get current form state. */
  getFormState: () => MissionEditFormState;
  /** Set a form field (for keyboard input / testing). */
  setField: (field: keyof MissionEditFormState, value: string) => void;
  /** Set on-submit callback. */
  onSubmit: (callback: (missionId: string, req: MissionUpdateRequest) => void) => void;
  /** Submit current form. */
  submit: () => void;
  /** Get the mission ID being edited. */
  editingMissionId: () => string | null;
};

export interface MissionEditFormState {
  title: string;
  description: string;
  assignee: AgentId;
  priority: MissionPriority;
  tokenBudget: string;
}

const MODAL_WIDTH = 440;
const MODAL_HEIGHT = 400;
const CORNER_RADIUS = 10;
const ANIM_SPEED = 0.006;
const FIELD_GAP = 36;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const PRIORITY_COLORS: Record<MissionPriority, number> = {
  low: 0x4aa0ff,
  normal: 0x39e58c,
  high: 0xffc247,
  critical: 0xff3b3b,
};

const RING_AGENTS = AGENT_ORDER.filter((a) => a !== 'nexus') as AgentId[];

export function createMissionEditModal(): MissionEditModalLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 2800;

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let submitCallback: ((missionId: string, req: MissionUpdateRequest) => void) | null = null;
  let currentMissionId: string | null = null;

  const form: MissionEditFormState = {
    title: '',
    description: '',
    assignee: 'synth',
    priority: 'normal',
    tokenBudget: '',
  };

  // Backdrop
  const backdrop = new Graphics();
  backdrop.eventMode = 'static';
  backdrop.cursor = 'default';
  backdrop.on('pointertap', hide);
  container.addChild(backdrop);

  // Modal body
  const modal = new Container();
  container.addChild(modal);

  const bg = new Graphics();
  modal.addChild(bg);

  // Title bar
  const titleBar = new Text({
    text: '✏️ EDIT MISSION',
    style: { fontSize: 16, fontWeight: 'bold', fill: 0xffd700, fontFamily },
  });
  titleBar.position.set(20, 16);
  modal.addChild(titleBar);

  // Mission ID subtitle
  const missionIdText = new Text({
    text: '',
    style: { fontSize: 10, fill: 0x666688, fontFamily },
  });
  missionIdText.position.set(20, 36);
  modal.addChild(missionIdText);

  // Field labels
  const fieldLabels = ['Title:', 'Description:', 'Assignee:', 'Priority:', 'Token Budget:'];
  const fieldValues: Text[] = [];
  const startY = 60;

  for (let i = 0; i < fieldLabels.length; i++) {
    const label = new Text({
      text: fieldLabels[i],
      style: { fontSize: 12, fill: 0x8888aa, fontFamily },
    });
    label.position.set(20, startY + i * FIELD_GAP);
    modal.addChild(label);

    const value = new Text({
      text: '',
      style: { fontSize: 13, fill: 0xffffff, fontFamily },
    });
    value.position.set(130, startY + i * FIELD_GAP);
    modal.addChild(value);
    fieldValues.push(value);
  }

  // Assignee selector dots
  const assigneeDots: Graphics[] = [];
  for (let i = 0; i < RING_AGENTS.length; i++) {
    const dot = new Graphics();
    dot.eventMode = 'static';
    dot.cursor = 'pointer';
    const agentId = RING_AGENTS[i];
    dot.on('pointertap', () => {
      form.assignee = agentId;
      renderForm();
    });
    modal.addChild(dot);
    assigneeDots.push(dot);
  }

  // Priority buttons
  const priorities: MissionPriority[] = ['low', 'normal', 'high', 'critical'];
  const priorityBtns: Container[] = [];
  for (const p of priorities) {
    const btn = new Container();
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    const btnBg = new Graphics();
    const btnTxt = new Text({
      text: p.toUpperCase(),
      style: { fontSize: 10, fontWeight: 'bold', fill: 0xffffff, fontFamily },
    });
    btnTxt.anchor.set(0.5, 0.5);
    btn.addChild(btnBg, btnTxt);
    btn.on('pointertap', () => {
      form.priority = p;
      renderForm();
    });
    modal.addChild(btn);
    priorityBtns.push(btn);
  }

  // Submit button
  const submitBtn = new Container();
  submitBtn.eventMode = 'static';
  submitBtn.cursor = 'pointer';
  const submitBg = new Graphics();
  const submitTxt = new Text({
    text: 'SAVE CHANGES',
    style: { fontSize: 13, fontWeight: 'bold', fill: 0xffffff, fontFamily },
  });
  submitTxt.anchor.set(0.5, 0.5);
  submitBtn.addChild(submitBg, submitTxt);
  submitBtn.on('pointertap', submit);
  modal.addChild(submitBtn);

  // Close button
  const closeBtn = new Container();
  closeBtn.eventMode = 'static';
  closeBtn.cursor = 'pointer';
  const closeTxt = new Text({ text: '✕', style: { fontSize: 18, fill: 0xffffff, fontFamily } });
  closeTxt.anchor.set(0.5, 0.5);
  closeBtn.addChild(closeTxt);
  closeBtn.on('pointertap', hide);
  modal.addChild(closeBtn);

  function submit() {
    if (!submitCallback || !currentMissionId || !form.title.trim()) return;
    const updates: MissionUpdateRequest = {
      title: form.title,
      description: form.description,
      assignee: form.assignee,
      priority: form.priority,
    };
    if (form.tokenBudget) {
      const parsed = parseInt(form.tokenBudget, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        updates.tokenBudget = parsed;
      }
    }
    submitCallback(currentMissionId, updates);
    hide();
  }

  function drawModal() {
    bg.clear();
    bg.roundRect(0, 0, MODAL_WIDTH, MODAL_HEIGHT, CORNER_RADIUS)
      .fill({ color: 0x0e0e24, alpha: 0.96 });
    bg.roundRect(0, 0, MODAL_WIDTH, MODAL_HEIGHT, CORNER_RADIUS)
      .stroke({ width: 2, color: 0xffd700, alpha: 0.5 });

    // Gold accent bar
    bg.roundRect(0, 0, MODAL_WIDTH, 3, CORNER_RADIUS)
      .fill({ color: 0xffd700, alpha: 0.8 });

    // Submit button
    const btnW = 160;
    const btnH = 36;
    const btnY = MODAL_HEIGHT - 56;
    submitBg.clear();
    submitBg.roundRect(0, 0, btnW, btnH, 4).fill({ color: 0x00d4ff, alpha: 0.85 });
    submitBtn.position.set((MODAL_WIDTH - btnW) / 2, btnY);
    submitTxt.position.set(btnW / 2, btnH / 2);

    // Close button
    closeBtn.position.set(MODAL_WIDTH - 30, 10);
    closeTxt.position.set(0, 0);
  }

  function renderForm() {
    fieldValues[0].text = form.title || '(enter title)';
    fieldValues[0].style.fill = form.title ? 0xffffff : 0x666688;

    fieldValues[1].text = form.description || '(enter description)';
    fieldValues[1].style.fill = form.description ? 0xffffff : 0x666688;

    fieldValues[2].text = form.assignee.toUpperCase();
    fieldValues[2].style.fill = AGENT_COLORS[form.assignee] ?? 0xffffff;

    fieldValues[3].text = form.priority.toUpperCase();
    fieldValues[3].style.fill = PRIORITY_COLORS[form.priority] ?? 0xffffff;

    fieldValues[4].text = form.tokenBudget || '(unlimited)';
    fieldValues[4].style.fill = form.tokenBudget ? 0xffffff : 0x666688;

    // Assignee selector dots
    const dotY = startY + 2 * FIELD_GAP + 14;
    for (let i = 0; i < RING_AGENTS.length; i++) {
      const dot = assigneeDots[i];
      const agentId = RING_AGENTS[i];
      const isSelected = agentId === form.assignee;
      dot.clear();
      dot.circle(0, 0, isSelected ? 8 : 6)
        .fill({ color: AGENT_COLORS[agentId], alpha: isSelected ? 1 : 0.4 });
      if (isSelected) {
        dot.circle(0, 0, 10).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
      }
      dot.position.set(130 + i * 26, dotY);
    }

    // Priority buttons
    const priY = startY + 3 * FIELD_GAP;
    for (let i = 0; i < priorities.length; i++) {
      const btn = priorityBtns[i];
      const p = priorities[i];
      const isSelected = p === form.priority;
      const btnBg = btn.getChildAt(0) as Graphics;
      const btnTxt = btn.getChildAt(1) as Text;
      const w = 60;
      const h = 22;
      btnBg.clear();
      btnBg.roundRect(0, 0, w, h, 3)
        .fill({ color: PRIORITY_COLORS[p], alpha: isSelected ? 0.8 : 0.2 });
      if (isSelected) {
        btnBg.roundRect(0, 0, w, h, 3)
          .stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
      }
      btn.position.set(130 + i * 68, priY);
      btnTxt.position.set(w / 2, h / 2);
    }

    missionIdText.text = currentMissionId ? `ID: ${currentMissionId}` : '';
  }

  function layoutCenter() {
    backdrop.clear();
    backdrop.rect(0, 0, vpWidth, vpHeight).fill({ color: 0x000000, alpha: 0.55 });
    backdrop.hitArea = { contains: () => true };

    modal.position.set(
      (vpWidth - MODAL_WIDTH) / 2,
      (vpHeight - MODAL_HEIGHT) / 2,
    );
  }

  function show(mission: PersistedMission) {
    currentMissionId = mission.missionId;
    form.title = mission.title;
    form.description = mission.description;
    form.assignee = mission.assignee;
    form.priority = mission.priority;
    form.tokenBudget = mission.tokenBudget ? String(mission.tokenBudget) : '';

    visible = true;
    targetAlpha = 1;
    container.visible = true;

    drawModal();
    renderForm();
    layoutCenter();
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
  }

  function setViewport(width: number, height: number) {
    vpWidth = width;
    vpHeight = height;
    if (visible) layoutCenter();
  }

  function update(elapsedMs: number) {
    if (container.alpha < targetAlpha) {
      container.alpha = Math.min(1, container.alpha + ANIM_SPEED * elapsedMs);
    } else if (container.alpha > targetAlpha) {
      container.alpha = Math.max(0, container.alpha - ANIM_SPEED * elapsedMs);
      if (container.alpha <= 0) container.visible = false;
    }
  }

  function setField(field: keyof MissionEditFormState, value: string) {
    (form as unknown as Record<string, string>)[field] = value;
    renderForm();
  }

  return {
    container,
    show,
    hide,
    setViewport,
    update,
    isVisible: () => visible,
    getFormState: () => ({ ...form }),
    setField,
    onSubmit: (cb) => { submitCallback = cb; },
    submit,
    editingMissionId: () => currentMissionId,
  };
}
