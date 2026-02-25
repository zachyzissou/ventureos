import path from 'node:path';
import { OBSIDIAN_APP_CONFIG_PATH } from '../../../lib/paths.js';

export const DEFAULT_OBSIDIAN_MISSION_FOLDER = 'VentureOS/Missions';

export function obsidianAppConfigPath(): string {
  return process.env.OBSIDIAN_CONFIG_PATH ?? OBSIDIAN_APP_CONFIG_PATH;
}

export function hasDotObsidianSegment(p: string): boolean {
  return p.split(/[\\/]+/).some((seg) => seg === '.obsidian');
}

export function normalizeRelativePath(input: string): string | null {
  const raw = input.replace(/\\/g, '/').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return null;
  const normalized = path.posix.normalize(raw).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    return null;
  }
  if (hasDotObsidianSegment(normalized)) return null;
  return normalized;
}

export function resolveInsideVault(vaultPath: string, relPath: string): string | null {
  const resolvedVault = path.resolve(vaultPath);
  const target = path.resolve(resolvedVault, relPath);
  if (target !== resolvedVault && !target.startsWith(resolvedVault + path.sep)) return null;
  if (hasDotObsidianSegment(path.relative(resolvedVault, target))) return null;
  return target;
}
