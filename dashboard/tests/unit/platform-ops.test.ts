import { describe, expect, it } from 'vitest';

import { getPlatformServiceStatuses, resolveRestartActionCommand } from '../../server/platform-ops.js';

describe('platform ops service status', () => {
  it('uses systemd probes on linux', () => {
    const commands: string[] = [];
    const statuses = getPlatformServiceStatuses({
      platform: 'linux',
      probe: (command) => {
        commands.push(command);
        return command.includes('openclaw') || command.includes('agent-dashboard');
      },
    });

    expect(commands).toEqual([
      'systemctl is-active --quiet openclaw',
      'systemctl is-active --quiet agent-dashboard',
      'systemctl is-active --quiet tailscaled',
    ]);
    expect(statuses).toEqual([
      { name: 'openclaw', active: true },
      { name: 'agent-dashboard', active: true },
      { name: 'tailscaled', active: false },
    ]);
  });

  it('uses launchd/openclaw/tailscale probes on macOS', () => {
    const commands: string[] = [];
    const statuses = getPlatformServiceStatuses({
      platform: 'darwin',
      probe: (command) => {
        commands.push(command);
        return command.includes('dashboard.monorepo') || command.includes('openclaw gateway status');
      },
    });

    expect(commands[0]).toContain('launchctl list com.openclaw.dashboard.monorepo');
    expect(commands[1]).toContain('openclaw gateway status');
    expect(commands[2]).toContain('tailscale status');
    expect(statuses).toEqual([
      { name: 'openclaw', active: true },
      { name: 'agent-dashboard', active: true },
      { name: 'tailscaled', active: false },
    ]);
  });
});

describe('platform ops restart commands', () => {
  it('resolves linux restart commands', () => {
    expect(resolveRestartActionCommand('restart-openclaw', { platform: 'linux' })).toEqual({
      command: 'openclaw gateway restart',
      timeoutMs: 60000,
    });
    expect(resolveRestartActionCommand('restart-dashboard', { platform: 'linux' })).toEqual({
      command: 'systemctl restart agent-dashboard',
      timeoutMs: 60000,
    });
    expect(resolveRestartActionCommand('restart-tailscale', { platform: 'linux' })).toEqual({
      command: 'systemctl restart tailscaled',
      timeoutMs: 60000,
    });
  });

  it('resolves macOS restart commands with launchd labels', () => {
    const dashboard = resolveRestartActionCommand('restart-dashboard', { platform: 'darwin', uid: 501 });
    expect(dashboard.timeoutMs).toBe(60000);
    expect(dashboard.command).toContain('launchctl kickstart -k gui/501/com.openclaw.dashboard.monorepo');
    expect(dashboard.command).toContain('com.openclaw.dashboard');

    const tailscale = resolveRestartActionCommand('restart-tailscale', { platform: 'darwin' });
    expect(tailscale.timeoutMs).toBe(60000);
    expect(tailscale.command).toContain('launchctl kickstart -k system/com.tailscaled');
  });

  it('returns unsupported command plans on unknown platforms', () => {
    const dashboard = resolveRestartActionCommand('restart-dashboard', { platform: 'win32', uid: null });
    expect(dashboard.command).toBe('');
    expect(dashboard.unsupportedReason).toContain('not supported');

    const tailscale = resolveRestartActionCommand('restart-tailscale', { platform: 'win32' });
    expect(tailscale.command).toBe('');
    expect(tailscale.unsupportedReason).toContain('not supported');
  });
});
