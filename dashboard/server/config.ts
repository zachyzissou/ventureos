/**
 * Dashboard configuration — environment-based paths.
 * Migrated from server/config.js (Phase 3 — Issue #76).
 */

import os from 'node:os';
import path from 'node:path';

import type { DashboardConfig } from './types.js';

const homedir: string = os.homedir();

export const VENTUREOS_ROOT: string =
  process.env.VENTUREOS_ROOT ?? path.join(homedir, 'clawd', 'ventureos');

export const SHARED_CONTEXT: string =
  process.env.SHARED_CONTEXT ?? path.join(homedir, 'clawd', 'shared-context');

export const KPI_DIR: string =
  process.env.KPI_DIR ?? path.join(SHARED_CONTEXT, 'kpis');

export const OBSERVATIONS_DIR: string =
  process.env.OBSERVATIONS_DIR ?? path.join(homedir, '.openclaw', 'workspace-archivist', 'observations');

export const config: DashboardConfig = {
  VENTUREOS_ROOT,
  SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
};
