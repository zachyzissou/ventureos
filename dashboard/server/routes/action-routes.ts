/**
 * Action API route handler extracted from server.ts for maintainability.
 *
 * Routes:
 *   POST /api/action/restart-openclaw
 *   POST /api/action/restart-dashboard
 *   POST /api/action/clear-cache
 *   POST /api/action/restart-tailscale
 *   POST /api/action/update-openclaw
 *   POST /api/action/kill-tmux
 *   POST /api/action/gc
 *   POST /api/action/check-update
 *   POST /api/action/sys-update
 *   POST /api/action/disk-cleanup
 *   POST /api/action/restart-claude
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

interface RestartActionPlan {
  command: string;
  timeoutMs: number;
  unsupportedReason?: string;
}

interface SafeErrorPayload {
  error: string;
  errorRef: string;
  status: number;
}

interface ExecCallbackError {
  message?: string;
}

interface ActionRoutesDeps {
  sendJson: (res: ServerResponse, data: unknown, status?: number) => void;
  runShellCommand: (
    command: string,
    timeoutMs: number,
  ) => Promise<{ ok: boolean; output: string; error?: string }>;
  resolveRestartActionCommand: (
    action: 'restart-openclaw' | 'restart-dashboard' | 'restart-tailscale',
  ) => RestartActionPlan;
  toSafeError: (error: unknown, context?: Record<string, unknown>) => SafeErrorPayload;
  logInfo: (scope: string, event: string, message: string, context?: Record<string, unknown>) => void;
  logError: (scope: string, event: string, message: string, context?: Record<string, unknown>) => void;
  clearCaches: () => void;
  workspaceDir: string;
  execCommand: (
    command: string,
    options: { timeout?: number },
    callback: (error: ExecCallbackError | null, stdout?: string) => void,
  ) => void;
}

async function runRestartAction(
  res: ServerResponse,
  deps: ActionRoutesDeps,
  action: 'restart-openclaw' | 'restart-dashboard' | 'restart-tailscale',
): Promise<void> {
  const plan = deps.resolveRestartActionCommand(action);
  if (plan.unsupportedReason) {
    deps.sendJson(res, { success: false, error: plan.unsupportedReason }, 400);
    return;
  }

  const result = await deps.runShellCommand(plan.command, plan.timeoutMs);
  if (!result.ok) {
    deps.sendJson(res, { success: false, error: result.error, output: result.output }, 502);
    return;
  }

  if (action === 'restart-dashboard') {
    deps.sendJson(res, {
      success: true,
      message: 'Dashboard restart command completed.',
      output: result.output,
    });
    return;
  }

  deps.sendJson(res, {
    success: result.ok,
    output: result.output,
    error: result.error,
  });
}

function isActionRequest(req: IncomingMessage): boolean {
  return Boolean(req.url && req.url.startsWith('/api/action/'));
}

export async function handleActionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ActionRoutesDeps,
): Promise<boolean> {
  if (!isActionRequest(req)) return false;
  if (req.method !== 'POST') return false;

  if (req.url === '/api/action/restart-openclaw') {
    try {
      deps.logInfo('dashboard', 'action_invoked', 'restart-openclaw requested', {
        action: 'restart-openclaw',
      });
      await runRestartAction(res, deps, 'restart-openclaw');
    } catch (error: unknown) {
      const safe = deps.toSafeError(error, { action: 'restart-openclaw' });
      deps.logError('dashboard', 'action_failed', 'restart-openclaw failed', {
        action: 'restart-openclaw',
        errorRef: safe.errorRef,
      });
      deps.sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
    }
    return true;
  }

  if (req.url === '/api/action/restart-dashboard') {
    try {
      await runRestartAction(res, deps, 'restart-dashboard');
    } catch (error: unknown) {
      const safe = deps.toSafeError(error, { action: 'restart-dashboard' });
      deps.sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
    }
    return true;
  }

  if (req.url === '/api/action/clear-cache') {
    try {
      deps.clearCaches();
      deps.sendJson(res, { success: true });
    } catch (error: unknown) {
      const safe = deps.toSafeError(error, { action: 'clear-cache' });
      deps.sendJson(res, { ok: false, error: safe.error, errorRef: safe.errorRef }, safe.status);
    }
    return true;
  }

  if (req.url === '/api/action/restart-tailscale') {
    await runRestartAction(res, deps, 'restart-tailscale');
    return true;
  }

  if (req.url === '/api/action/update-openclaw') {
    deps.execCommand('npm update -g openclaw', { timeout: 120000 }, (err, stdout) => {
      deps.sendJson(res, { success: !err, output: stdout?.trim(), error: err?.message });
    });
    return true;
  }

  if (req.url === '/api/action/kill-tmux') {
    deps.execCommand('tmux kill-server 2>/dev/null; echo ok', {}, () => {
      deps.sendJson(res, { success: true });
    });
    return true;
  }

  if (req.url === '/api/action/gc') {
    const projDir = `${deps.workspaceDir}/projects`;
    deps.execCommand(
      `if [ -d "${projDir}" ]; then for d in ${projDir}/*/; do cd "$d" && git gc --quiet 2>/dev/null; done; fi; cd ${deps.workspaceDir} && git gc --quiet 2>/dev/null; echo ok`,
      {},
      () => {
        deps.sendJson(res, { success: true });
      },
    );
    return true;
  }

  if (req.url === '/api/action/check-update') {
    deps.execCommand(
      'npm outdated -g openclaw 2>/dev/null || echo "up to date"',
      { timeout: 30000 },
      (_err, stdout) => {
        deps.sendJson(res, {
          success: true,
          output: (stdout ?? '').trim() || 'All packages up to date',
        });
      },
    );
    return true;
  }

  if (req.url === '/api/action/sys-update') {
    deps.execCommand(
      'apt update -qq && apt upgrade -y -qq 2>&1 | tail -5',
      { timeout: 300000 },
      (err, stdout) => {
        deps.sendJson(res, { success: !err, output: (stdout ?? '').trim(), error: err?.message });
      },
    );
    return true;
  }

  if (req.url === '/api/action/disk-cleanup') {
    deps.execCommand(
      'apt autoremove -y -qq 2>/dev/null; apt clean 2>/dev/null; journalctl --vacuum-time=7d 2>/dev/null; echo "Cleanup done"',
      { timeout: 60000 },
      (_err, stdout) => {
        deps.sendJson(res, { success: true, output: (stdout ?? '').trim() });
      },
    );
    return true;
  }

  if (req.url === '/api/action/restart-claude') {
    deps.execCommand(
      `tmux kill-session -t claude-persistent 2>/dev/null; sleep 1; tmux new-session -d -s claude-persistent -x 200 -y 60 && tmux send-keys -t claude-persistent "cd ${deps.workspaceDir} && claude" Enter && echo "Claude session started"`,
      { timeout: 20000 },
      (err, stdout) => {
        deps.sendJson(res, { success: !err, output: (stdout ?? '').trim() });
      },
    );
    return true;
  }

  return false;
}
