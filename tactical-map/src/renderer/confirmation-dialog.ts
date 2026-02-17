/**
 * Confirmation Dialog Renderer — Phase 5.7
 *
 * Modal dialog that appears for destructive actions (pause/resume).
 * Centers on screen with backdrop dimming.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { ConfirmationRequest } from '@/interaction/types';

export type ConfirmationDialogLayer = {
  container: Container;
  /** Show a confirmation dialog. */
  show: (request: ConfirmationRequest) => void;
  /** Hide the dialog. */
  hide: () => void;
  /** Set viewport size for centering. */
  setViewport: (width: number, height: number) => void;
  /** Per-frame animation. */
  update: (elapsedMs: number) => void;
  /** Is currently shown? */
  isVisible: () => boolean;
};

const DIALOG_WIDTH = 380;
const DIALOG_HEIGHT = 180;
const CORNER_RADIUS = 10;
const ANIM_SPEED = 0.006;

const fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

const SEVERITY_COLORS: Record<string, number> = {
  info: 0x00d4ff,
  warning: 0xffc247,
  danger: 0xff3b3b,
};

export function createConfirmationDialog(): ConfirmationDialogLayer {
  const container = new Container();
  container.visible = false;
  container.alpha = 0;
  container.zIndex = 2000;

  let visible = false;
  let targetAlpha = 0;
  let vpWidth = 1920;
  let vpHeight = 1080;
  let currentRequest: ConfirmationRequest | null = null;

  // Full-screen backdrop
  const backdrop = new Graphics();
  backdrop.eventMode = 'static';
  backdrop.cursor = 'default';
  container.addChild(backdrop);

  // Dialog body
  const dialog = new Container();
  container.addChild(dialog);

  const dialogBg = new Graphics();
  dialog.addChild(dialogBg);

  const titleText = new Text({ text: '', style: { fontSize: 16, fontWeight: 'bold', fill: 0xffffff, fontFamily } });
  titleText.position.set(20, 16);
  dialog.addChild(titleText);

  const messageText = new Text({ text: '', style: { fontSize: 13, fill: 0xcccccc, fontFamily, wordWrap: true, wordWrapWidth: DIALOG_WIDTH - 40 } });
  messageText.position.set(20, 48);
  dialog.addChild(messageText);

  // Buttons
  const confirmBtn = new Container();
  confirmBtn.eventMode = 'static';
  confirmBtn.cursor = 'pointer';
  const confirmBg = new Graphics();
  const confirmText = new Text({ text: 'Confirm', style: { fontSize: 13, fontWeight: 'bold', fill: 0xffffff, fontFamily } });
  confirmText.anchor.set(0.5, 0.5);
  confirmBtn.addChild(confirmBg, confirmText);
  dialog.addChild(confirmBtn);

  const cancelBtn = new Container();
  cancelBtn.eventMode = 'static';
  cancelBtn.cursor = 'pointer';
  const cancelBg = new Graphics();
  const cancelText = new Text({ text: 'Cancel', style: { fontSize: 13, fill: 0xcccccc, fontFamily } });
  cancelText.anchor.set(0.5, 0.5);
  cancelBtn.addChild(cancelBg, cancelText);
  dialog.addChild(cancelBtn);

  confirmBtn.on('pointertap', () => {
    if (currentRequest) {
      currentRequest.onConfirm();
      hide();
    }
  });

  cancelBtn.on('pointertap', () => {
    if (currentRequest) {
      currentRequest.onCancel();
      hide();
    }
  });

  // Block clicks through the backdrop
  backdrop.on('pointertap', () => {
    if (currentRequest) {
      currentRequest.onCancel();
      hide();
    }
  });

  function drawDialog(severity: string) {
    const accent = SEVERITY_COLORS[severity] ?? 0x00d4ff;

    dialogBg.clear();
    dialogBg.roundRect(0, 0, DIALOG_WIDTH, DIALOG_HEIGHT, CORNER_RADIUS)
      .fill({ color: 0x12122a, alpha: 0.96 });
    dialogBg.roundRect(0, 0, DIALOG_WIDTH, DIALOG_HEIGHT, CORNER_RADIUS)
      .stroke({ width: 2, color: accent, alpha: 0.8 });

    // Accent bar at top
    dialogBg.roundRect(0, 0, DIALOG_WIDTH, 4, CORNER_RADIUS)
      .fill({ color: accent, alpha: 0.9 });

    // Confirm button
    const btnW = 100;
    const btnH = 32;
    const btnY = DIALOG_HEIGHT - 50;

    confirmBg.clear();
    confirmBg.roundRect(0, 0, btnW, btnH, 4)
      .fill({ color: accent, alpha: 0.85 });
    confirmBtn.position.set(DIALOG_WIDTH - btnW - 20, btnY);
    confirmText.position.set(btnW / 2, btnH / 2);

    cancelBg.clear();
    cancelBg.roundRect(0, 0, btnW, btnH, 4)
      .fill({ color: 0x333366, alpha: 0.6 });
    cancelBtn.position.set(DIALOG_WIDTH - btnW * 2 - 36, btnY);
    cancelText.position.set(btnW / 2, btnH / 2);
  }

  function layoutCenter() {
    backdrop.clear();
    backdrop.rect(0, 0, vpWidth, vpHeight).fill({ color: 0x000000, alpha: 0.5 });
    backdrop.hitArea = { contains: () => true };

    dialog.position.set(
      (vpWidth - DIALOG_WIDTH) / 2,
      (vpHeight - DIALOG_HEIGHT) / 2,
    );
  }

  function show(request: ConfirmationRequest) {
    currentRequest = request;
    visible = true;
    targetAlpha = 1;
    container.visible = true;

    titleText.text = request.title;
    messageText.text = request.message;
    confirmText.text = request.confirmLabel;
    cancelText.text = request.cancelLabel;

    drawDialog(request.severity);
    layoutCenter();
  }

  function hide() {
    visible = false;
    targetAlpha = 0;
    currentRequest = null;
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

  return {
    container,
    show,
    hide,
    setViewport,
    update,
    isVisible: () => visible,
  };
}
