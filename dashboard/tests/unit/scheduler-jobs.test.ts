import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getSchedulerJobs, __testOnly } from '../../server/scheduler-jobs.js';

let tmpDir: string;
let openclawDir: string;
let cronFile: string;
let launchAgentDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-jobs-'));
  openclawDir = path.join(tmpDir, 'openclaw');
  cronFile = path.join(openclawDir, 'cron', 'jobs.json');
  launchAgentDir = path.join(tmpDir, 'LaunchAgents');

  fs.mkdirSync(path.dirname(cronFile), { recursive: true });
  fs.mkdirSync(launchAgentDir, { recursive: true });

  fs.writeFileSync(
    cronFile,
    JSON.stringify(
      {
        jobs: [
          {
            id: 'job-1234',
            name: 'Nightly Digest',
            schedule: { expr: '0 8 * * *', tz: 'America/Chicago' },
            enabled: true,
            state: {
              lastStatus: 'ok',
              lastRunAtMs: 1700000000000,
              nextRunAtMs: 1700003600000,
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(path.join(launchAgentDir, 'ai.nexus.healthcheck.plist'), 'placeholder');
  fs.writeFileSync(path.join(launchAgentDir, 'com.google.keystone.agent.plist'), 'placeholder');

  const launchErr = path.join(tmpDir, 'logs', 'healthcheck.err.log');
  fs.mkdirSync(path.dirname(launchErr), { recursive: true });
  fs.writeFileSync(launchErr, 'boom\n');
  fs.utimesSync(launchErr, new Date('2026-02-20T10:00:00Z'), new Date('2026-02-20T10:00:00Z'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scheduler jobs', () => {
  it('combines openclaw cron and launchd automation jobs', () => {
    const nowMs = Date.parse('2026-02-21T12:00:00Z');
    const launchErr = path.join(tmpDir, 'logs', 'healthcheck.err.log');

    const jobs = getSchedulerJobs({
      cronFile,
      openclawDir,
      platform: 'darwin',
      nowMs,
      launchAgentDirs: [launchAgentDir],
      runCommand: (command, args) => {
        if (command === 'launchctl') {
          return 'PID\tStatus\tLabel\n-\t2\tai.nexus.healthcheck\n';
        }
        if (command === 'plutil') {
          const filePath = args[args.length - 1] ?? '';
          if (filePath.endsWith('ai.nexus.healthcheck.plist')) {
            return JSON.stringify({
              Label: 'ai.nexus.healthcheck',
              StartCalendarInterval: { Weekday: 1, Hour: 9, Minute: 15 },
              RunAtLoad: true,
              WatchPaths: ['/Users/zachgonser/.openclaw/workspace/launchd/state.json'],
              StandardErrorPath: launchErr,
            });
          }
          return JSON.stringify({
            Label: 'com.google.keystone.agent',
            StartInterval: 3600,
          });
        }
        throw new Error(`unexpected command: ${command}`);
      },
    });

    expect(jobs).toHaveLength(2);

    const cronJob = jobs.find((job) => job.source === 'openclaw-cron');
    expect(cronJob).toBeTruthy();
    expect(cronJob?.label).toBe('Nightly Digest');
    expect(cronJob?.triggerTypes).toEqual(['Cron']);
    expect(cronJob?.actions.canToggle).toBe(true);
    expect(cronJob?.actions.toggleId).toBe('job-1234');

    const launchJob = jobs.find((job) => job.source === 'launchd');
    expect(launchJob).toBeTruthy();
    expect(launchJob?.label).toBe('ai.nexus.healthcheck');
    expect(launchJob?.triggerTypes).toEqual([
      'StartCalendarInterval',
      'RunAtLoad',
      'WatchPaths',
    ]);
    expect(launchJob?.lastExit).toBe('failed');
    expect(launchJob?.lastExitCode).toBe(2);
    expect(launchJob?.enabled).toBe(true);
    expect(launchJob?.logPath).toBe(launchErr);
    expect(launchJob?.actions.canRun).toBe(false);
    expect(launchJob?.nextRunAt).not.toBeNull();
    expect(launchJob?.lastRunAt).toBe(Date.parse('2026-02-20T10:00:00Z'));
  });

  it('skips launchd discovery on non-macos hosts', () => {
    const jobs = getSchedulerJobs({
      cronFile,
      openclawDir,
      platform: 'linux',
      launchAgentDirs: [launchAgentDir],
      runCommand: () => {
        throw new Error('should not run launchctl/plutil on linux');
      },
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('openclaw-cron');
  });

  it('parses launchctl output and computes calendar next-run', () => {
    const parsed = __testOnly.parseLaunchctlList('PID\tStatus\tLabel\n42\t0\tai.nexus.worker\n-\t1\tai.nexus.health\n');
    expect(parsed.get('ai.nexus.worker')).toEqual({ pid: 42, status: 0 });
    expect(parsed.get('ai.nexus.health')).toEqual({ pid: null, status: 1 });

    const specs = __testOnly.normalizeCalendarSpecs({ Weekday: 0, Hour: 1, Minute: 0 });
    expect(specs).toHaveLength(1);
    expect(__testOnly.describeCalendarSpec(specs[0])).toContain('Sun 01:00');

    const next = __testOnly.computeNextCalendarRun(
      { Weekday: 0, Hour: 1, Minute: 0 },
      Date.parse('2026-02-20T23:00:00Z'),
    );
    expect(next).not.toBeNull();
  });
});
