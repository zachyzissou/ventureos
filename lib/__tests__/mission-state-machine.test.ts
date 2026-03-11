import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import { MissionStateMachine } from '../mission-state-machine';

function makeNow(startIso = '2026-02-15T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

describe('MissionStateMachine', () => {
  it('persists state across reloads', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-sm-'));
    const sm = new MissionStateMachine({ persistDir: dir, now: makeNow() });

    const created = await sm.createMission({
      title: 't',
      description: 'd',
      requirements: ['r1'],
    });

    const planned = await sm.transition(created, 'plan', {
      plan: { createdAt: new Date().toISOString(), tasks: [] },
    });

    const sm2 = new MissionStateMachine({ persistDir: dir, now: makeNow() });
    const loaded = await sm2.loadMission(created.missionId);

    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe('plan');
    expect(loaded!.missionId).toBe(created.missionId);
    expect(loaded!.history.length).toBeGreaterThanOrEqual(2);

    // ensure transition persisted
    expect(planned.phase).toBe('plan');
  });

  it('rejects invalid forward transitions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-sm-'));
    const sm = new MissionStateMachine({ persistDir: dir, now: makeNow() });

    const created = await sm.createMission({
      title: 't',
      description: 'd',
      requirements: [],
    });

    await expect(sm.transition(created, 'execute' as any)).rejects.toThrow('Invalid mission transition');
  });

  it('fails into error and allows rollback to a phase in history', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-mission-sm-'));
    const sm = new MissionStateMachine({ persistDir: dir, now: makeNow() });

    const created = await sm.createMission({
      title: 't',
      description: 'd',
      requirements: [],
    });

    const planned = await sm.transition(created, 'plan', {
      plan: { createdAt: new Date().toISOString(), tasks: [] },
    });

    const errored = await sm.fail(planned, new Error('boom'), 'test_code', 'brief');
    expect(errored.phase).toBe('error');
    expect(errored.error?.message).toContain('boom');
    expect(errored.error?.code).toBe('test_code');

    const rolled = await sm.rollback(errored, 'brief');
    expect(rolled.phase).toBe('brief');
    expect(rolled.error).toBeUndefined();
  });
});
