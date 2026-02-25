import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import { MissionRunner } from '../mission-runner';
import { MissionStateMachine } from '../mission-state-machine';

function makeNow(startIso = '2026-02-15T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

describe('MissionRunner — integration', () => {
  it('runs a simple mission end-to-end and produces artifacts', async () => {
    const persistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-state-'));
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-artifacts-'));
    const now = makeNow();

    const runner = new MissionRunner({
      persistDir,
      artifactsDir,
      now,
      agents: [
        {
          id: 'synth',
          async runTask(task) {
            return {
              summary: `done: ${task.title}`,
              artifacts: [{ name: 'output.md', content: '# Output\n\nHello' }],
            };
          },
        },
      ],
    });

    const out = await runner.runFromBrief({
      title: 'Hello Mission',
      description: 'No special keywords to avoid extra roles.',
      requirements: ['Produce at least one artifact'],
      deliverables: ['output.md', 'status-report.md'],
    });

    expect(out.mission.phase).toBe('closed');
    expect(out.delivered?.manifestPath).toBeTruthy();

    const manifestRaw = await fs.readFile(out.delivered!.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.artifacts.length).toBeGreaterThanOrEqual(1);

    // status report should exist
    await expect(fs.stat(out.delivered!.statusReportPath)).resolves.toBeTruthy();
  });

  it('can resume from a persisted brief state', async () => {
    const persistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-state-'));
    const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-artifacts-'));
    const now = makeNow();

    // Create only the brief state (simulating a crash/restart between phases)
    const sm = new MissionStateMachine({ persistDir, now });
    const created = await sm.createMission({
      title: 'Resume Mission',
      description: 'Should resume from brief to closed.',
      requirements: ['x'],
    });

    const runner = new MissionRunner({
      persistDir,
      artifactsDir,
      now,
      agents: [
        {
          id: 'synth',
          async runTask() {
            return { artifacts: [{ name: 'out.txt', content: 'ok' }] };
          },
        },
      ],
    });

    const out = await runner.resume(created.missionId);
    expect(out.mission.phase).toBe('closed');
  });
});
