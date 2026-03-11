import { execSync } from 'node:child_process';

export type ServiceStatus = { name: string; active: boolean };

export type RestartAction = 'restart-openclaw' | 'restart-dashboard' | 'restart-tailscale';

type CommandProbe = (command: string, timeoutMs: number) => boolean;

export interface PlatformOpsOptions {
  platform?: NodeJS.Platform;
  uid?: number | null;
  probe?: CommandProbe;
}

export interface RestartCommandPlan {
  command: string;
  timeoutMs: number;
  unsupportedReason?: string;
}

const DASHBOARD_LAUNCHD_LABELS = ['com.openclaw.dashboard.monorepo', 'com.openclaw.dashboard'];

function defaultProbe(command: string, timeoutMs: number): boolean {
  try {
    execSync(command, { stdio: 'ignore', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

function resolveUid(candidate?: number | null): number | null {
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
    return Math.floor(candidate);
  }
  if (typeof process.getuid === 'function') {
    return process.getuid();
  }
  return null;
}

export function getPlatformServiceStatuses(options: PlatformOpsOptions = {}): ServiceStatus[] {
  const platform = options.platform ?? process.platform;
  const probe = options.probe ?? defaultProbe;

  if (platform === 'linux') {
    return [
      { name: 'openclaw', active: probe('systemctl is-active --quiet openclaw', 3000) },
      { name: 'agent-dashboard', active: probe('systemctl is-active --quiet agent-dashboard', 3000) },
      { name: 'tailscaled', active: probe('systemctl is-active --quiet tailscaled', 3000) },
    ];
  }

  if (platform === 'darwin') {
    const dashboardActive = DASHBOARD_LAUNCHD_LABELS.some((label) =>
      probe(`launchctl list ${label} >/dev/null 2>&1`, 3000),
    );
    return [
      { name: 'openclaw', active: probe('openclaw gateway status >/dev/null 2>&1', 5000) },
      { name: 'agent-dashboard', active: dashboardActive },
      { name: 'tailscaled', active: probe('tailscale status >/dev/null 2>&1', 5000) },
    ];
  }

  return [
    { name: 'openclaw', active: probe('openclaw gateway status >/dev/null 2>&1', 5000) },
    { name: 'agent-dashboard', active: false },
    { name: 'tailscaled', active: probe('tailscale status >/dev/null 2>&1', 5000) },
  ];
}

export function resolveRestartActionCommand(
  action: RestartAction,
  options: PlatformOpsOptions = {},
): RestartCommandPlan {
  const platform = options.platform ?? process.platform;
  const uid = resolveUid(options.uid);

  switch (action) {
    case 'restart-openclaw':
      return { command: 'openclaw gateway restart', timeoutMs: 60000 };
    case 'restart-dashboard':
      if (platform === 'linux') {
        return { command: 'systemctl restart agent-dashboard', timeoutMs: 60000 };
      }
      if (platform === 'darwin' && uid != null) {
        const primary = `launchctl kickstart -k gui/${uid}/com.openclaw.dashboard.monorepo`;
        const legacy = `launchctl kickstart -k gui/${uid}/com.openclaw.dashboard`;
        return { command: `${primary} || ${legacy}`, timeoutMs: 60000 };
      }
      return {
        command: '',
        timeoutMs: 0,
        unsupportedReason: `restart-dashboard is not supported on platform '${platform}'`,
      };
    case 'restart-tailscale':
      if (platform === 'linux') {
        return { command: 'systemctl restart tailscaled', timeoutMs: 60000 };
      }
      if (platform === 'darwin') {
        // Requires elevated privileges on many macOS installs; caller surfaces failures.
        const primary = 'launchctl kickstart -k system/com.tailscaled';
        const fallback = 'launchctl kickstart -k system/com.tailscale.tailscaled';
        return { command: `${primary} || ${fallback}`, timeoutMs: 60000 };
      }
      return {
        command: '',
        timeoutMs: 0,
        unsupportedReason: `restart-tailscale is not supported on platform '${platform}'`,
      };
    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown restart action: ${exhaustive as string}`);
    }
  }
}
