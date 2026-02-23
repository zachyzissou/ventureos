import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  generateSelfImprovementDigest,
  loadSelfImprovementDigests,
  setRecommendationStatus,
} from '../../server/self-improvement.js';

const testRoot = path.join('/tmp', `test-self-improvement-${process.pid}`);
const dataDir = path.join(testRoot, 'data');
const workspaceDir = path.join(testRoot, 'workspace');

function fixedNow(): Date {
  return new Date('2026-02-21T12:00:00.000Z');
}

beforeEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, 'souls', 'oracle'), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, 'souls', 'oracle', 'SOUL.md'), '# Oracle Soul\n');
  fs.writeFileSync(path.join(workspaceDir, 'souls', 'oracle', 'PRINCIPLES.md'), '# Oracle Principles\n');
  fs.writeFileSync(
    path.join(dataDir, 'task-board.json'),
    JSON.stringify({
      tasks: [
        { id: 't1', title: 'Task 1', status: 'done', agentId: 'oracle', runtimeMs: 30_000, startedAt: Date.parse('2026-02-21T11:00:00.000Z') },
        { id: 't2', title: 'Task 2', status: 'failed', agentId: 'oracle', runtimeMs: 180_000, startedAt: Date.parse('2026-02-21T10:00:00.000Z') },
      ],
    }),
  );
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('self-improvement engine', () => {
  it('generates a digest with at least 3 recommendations and writes markdown', () => {
    const { digest, digestPath } = generateSelfImprovementDigest({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      now: fixedNow,
    });

    expect(digest.recommendations.length).toBeGreaterThanOrEqual(3);
    expect(digest.pendingCount).toBeGreaterThanOrEqual(3);
    expect(digest.digestContent).toContain('## Recommendations');
    expect(fs.existsSync(path.join(workspaceDir, digestPath))).toBe(true);

    const stored = loadSelfImprovementDigests(dataDir);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(digest.id);
  });

  it('approves and applies a recommendation inside allowed scope', () => {
    const generated = generateSelfImprovementDigest({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      now: fixedNow,
    });

    const recommendation = generated.digest.recommendations.find((rec) => rec.target.startsWith('souls/oracle/'));
    expect(recommendation).toBeDefined();

    const result = setRecommendationStatus({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      recommendationId: recommendation!.id,
      action: 'approve',
      now: fixedNow,
    });

    expect(result.ok).toBe(true);
    expect(result.recommendation?.status).toBe('applied');
    const targetPath = path.join(workspaceDir, recommendation!.target);
    const nextContent = fs.readFileSync(targetPath, 'utf8');
    expect(nextContent).toContain(recommendation!.proposedValue.split('\n')[0]);
  });

  it('rejects recommendations and updates counts', () => {
    const generated = generateSelfImprovementDigest({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      now: fixedNow,
    });
    const recommendation = generated.digest.recommendations[0];

    const result = setRecommendationStatus({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      recommendationId: recommendation.id,
      action: 'reject',
      now: fixedNow,
    });

    expect(result.ok).toBe(true);
    expect(result.recommendation?.status).toBe('rejected');
    expect(result.digest?.rejectedCount).toBeGreaterThanOrEqual(1);
  });

  it('blocks recommendations targeting files outside agent scope', () => {
    const generated = generateSelfImprovementDigest({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      now: fixedNow,
    });
    const first = generated.digest.recommendations[0];
    const digests = loadSelfImprovementDigests(dataDir);
    digests[0].recommendations[0].target = '../README.md';
    fs.writeFileSync(path.join(dataDir, 'self-improvement-digests.json'), JSON.stringify(digests, null, 2));

    const result = setRecommendationStatus({
      dataDir,
      workspaceDir,
      agentId: 'oracle',
      recommendationId: first.id,
      action: 'approve',
      now: fixedNow,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('outside allowed agent workspace scope');
  });
});

