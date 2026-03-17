import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import { ArtifactCollector } from '../artifact-collector';

function makeNow(startIso = '2026-02-15T00:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

describe('ArtifactCollector', () => {
  it('creates versioned directories and writes manifest', async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vos-artifacts-'));
    const collector = new ArtifactCollector({ baseDir, now: makeNow() });

    const r1 = await collector.collectFromResults(
      'm1',
      [
        {
          taskId: 't1',
          agentId: 'venture_delivery',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          status: 'succeeded',
          artifacts: [{ name: 'a.md', content: '# A' }],
        },
      ],
      [{ name: 'status-report.md', content: 'ok', producedBy: 'venture_memory' }]
    );

    expect(path.basename(r1.artifactsDir)).toBe('v0001');

    const manifestRaw = await fs.readFile(r1.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.missionId).toBe('m1');
    expect(manifest.version).toBe('v0001');
    expect(manifest.artifacts.length).toBe(2);

    const r2 = await collector.collectFromResults('m1', [], []);
    expect(path.basename(r2.artifactsDir)).toBe('v0002');
  });
});
