import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import type { CronJobInfo, GitCommit, GitRepo } from './types.js';
import { getPlatformServiceStatuses } from './platform-ops.js';

interface CronJobRaw {
  id: string;
  name?: string;
  schedule?: { expr?: string; tz?: string };
  enabled?: boolean;
  state?: {
    lastStatus?: string;
    lastRunAtMs?: number;
    nextRunAtMs?: number;
    lastDurationMs?: number;
  };
}

export function getCronJobs(cronFile: string): CronJobInfo[] {
  try {
    if (!fs.existsSync(cronFile)) return [];
    const data = JSON.parse(fs.readFileSync(cronFile, 'utf8')) as { jobs?: CronJobRaw[] };
    return (data.jobs ?? []).map((j): CronJobInfo => {
      let humanSchedule: string = j.schedule?.expr ?? '';
      try {
        const parts: string[] = humanSchedule.split(' ');
        if (parts.length === 5) {
          const [min, hour, , , dow] = parts;
          const dowNames: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          let readable: string = '';
          if (dow !== '*') readable = dowNames[parseInt(dow)] ?? dow;
          if (hour !== '*' && min !== '*') {
            readable +=
              (readable ? ' ' : '') +
              `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
          }
          if (j.schedule?.tz) readable += ` (${j.schedule.tz.split('/').pop()})`;
          if (readable) humanSchedule = readable;
        }
      } catch {
        // ignore
      }
      return {
        id: j.id,
        name: j.name ?? j.id.substring(0, 8),
        schedule: humanSchedule,
        enabled: j.enabled !== false,
        lastStatus: j.state?.lastStatus ?? 'unknown',
        lastRunAt: j.state?.lastRunAtMs ?? 0,
        nextRunAt: j.state?.nextRunAtMs ?? 0,
        lastDuration: j.state?.lastDurationMs ?? 0,
      };
    });
  } catch {
    return [];
  }
}

function getGitRepos(workspaceDir: string): GitRepo[] {
  const repos: GitRepo[] = [];
  const projDir: string = path.join(workspaceDir, 'projects');
  try {
    if (fs.existsSync(projDir)) {
      fs.readdirSync(projDir).forEach((d) => {
        const full: string = path.join(projDir, d);
        if (fs.existsSync(path.join(full, '.git'))) repos.push({ path: full, name: d });
      });
    }
  } catch {
    // ignore
  }
  if (fs.existsSync(path.join(workspaceDir, '.git'))) {
    repos.push({ path: workspaceDir, name: path.basename(workspaceDir) });
  }
  return repos;
}

export function getGitActivity(workspaceDir: string): GitCommit[] {
  try {
    const repos: GitRepo[] = getGitRepos(workspaceDir);
    const commits: GitCommit[] = [];
    for (const repo of repos) {
      try {
        if (!fs.existsSync(path.join(repo.path, '.git'))) continue;
        const log: string = execSync(
          `git -C ${repo.path} log --oneline --since='7 days ago' -10 --format='%H|%s|%at'`,
          { encoding: 'utf8', timeout: 5000 },
        ).trim();
        if (!log) continue;
        log.split('\n').forEach((line) => {
          const [hash, msg, ts] = line.split('|');
          commits.push({
            repo: repo.name,
            hash: (hash ?? '').substring(0, 7),
            message: msg ?? '',
            timestamp: parseInt(ts ?? '0') * 1000,
          });
        });
      } catch {
        // ignore
      }
    }
    commits.sort((a, b) => b.timestamp - a.timestamp);
    return commits.slice(0, 15);
  } catch {
    return [];
  }
}

export function getServicesStatus(): Array<{ name: string; active: boolean }> {
  return getPlatformServiceStatuses();
}

export function getMemoryFiles(
  memoryMdPath: string,
  heartbeatPath: string,
  memoryDir: string,
): Array<{ name: string; modified: number; size: number }> {
  const files: Array<{ name: string; modified: number; size: number }> = [];
  try {
    if (fs.existsSync(memoryMdPath)) {
      const stat: fs.Stats = fs.statSync(memoryMdPath);
      files.push({ name: 'MEMORY.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(heartbeatPath)) {
      const stat: fs.Stats = fs.statSync(heartbeatPath);
      files.push({ name: 'HEARTBEAT.md', modified: stat.mtimeMs, size: stat.size });
    }
  } catch {
    // ignore
  }
  try {
    if (fs.existsSync(memoryDir)) {
      const entries: string[] = fs
        .readdirSync(memoryDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse();
      entries.forEach((e) => {
        try {
          const stat: fs.Stats = fs.statSync(path.join(memoryDir, e));
          files.push({ name: 'memory/' + e, modified: stat.mtimeMs, size: stat.size });
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }
  return files;
}
