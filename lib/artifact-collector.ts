/**
 * Artifact Collector — VentureOS Mission Runner (P1 #29)
 *
 * Collects artifacts produced by squad tasks, writes them to a mission directory,
 * versions each delivery, and generates a manifest.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import type { DeliveryArtifactRef, SquadRole, TaskRunResult } from './mission-state-machine';

export interface ArtifactCollectorConfig {
  /** Root directory for mission artifacts. */
  baseDir?: string;
  /** Optional deterministic time source for tests. */
  now?: () => Date;
}

const DEFAULT_BASE_DIR = path.resolve(
  process.env.HOME ?? '~',
  'clawd/ventureos/runtime/missions/artifacts'
);

export interface ArtifactManifest {
  missionId: string;
  version: string;
  createdAt: string;
  artifacts: DeliveryArtifactRef[];
}

export class ArtifactCollector {
  private readonly baseDir: string;
  private readonly now: () => Date;

  constructor(config: ArtifactCollectorConfig = {}) {
    this.baseDir = config.baseDir ?? DEFAULT_BASE_DIR;
    this.now = config.now ?? (() => new Date());
  }

  getMissionDir(missionId: string): string {
    return path.join(this.baseDir, missionId);
  }

  /**
   * Create a new version directory (v0001, v0002, ...)
   */
  async createNewVersionDir(missionId: string): Promise<{ version: string; dir: string }>{
    const missionDir = this.getMissionDir(missionId);
    await fs.mkdir(missionDir, { recursive: true });

    const entries = await fs.readdir(missionDir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory() && /^v\d{4}$/.test(e.name))
      .map((e) => e.name)
      .sort();

    const nextNum = versions.length ? Number(versions[versions.length - 1].slice(1)) + 1 : 1;
    const version = `v${String(nextNum).padStart(4, '0')}`;
    const dir = path.join(missionDir, version);
    await fs.mkdir(dir, { recursive: true });
    return { version, dir };
  }

  /**
   * Collect artifacts from task results and write them to disk.
   */
  async collectFromResults(
    missionId: string,
    results: TaskRunResult[],
    extraArtifacts: Array<{ name: string; content: string; mediaType?: string; producedBy?: SquadRole }> = []
  ): Promise<{ artifactsDir: string; manifestPath: string; artifacts: DeliveryArtifactRef[] }>{
    const { version, dir } = await this.createNewVersionDir(missionId);

    const artifacts: DeliveryArtifactRef[] = [];

    const writeOne = async (name: string, content: string, producedBy?: SquadRole, taskId?: string) => {
      const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, '_');
      const fp = path.join(dir, safeName);
      await fs.writeFile(fp, content, 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      const sha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
      artifacts.push({ path: fp, sha256, bytes, producedBy, taskId });
    };

    for (const r of results) {
      for (const a of r.artifacts ?? []) {
        await writeOne(a.name, a.content, r.agentId, r.taskId);
      }
    }

    for (const a of extraArtifacts) {
      await writeOne(a.name, a.content, a.producedBy, undefined);
    }

    const manifest: ArtifactManifest = {
      missionId,
      version,
      createdAt: this.now().toISOString(),
      artifacts,
    };

    const manifestPath = path.join(dir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return { artifactsDir: dir, manifestPath, artifacts };
  }
}
