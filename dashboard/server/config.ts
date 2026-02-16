/**
 * Dashboard configuration — environment-based paths.
 * Migrated from server/config.js (Phase 3 — Issue #76).
 *
 * Issue #79: Now delegates all path resolution to `lib/paths.ts`
 * instead of computing paths locally with `os.homedir()`.
 */

import {
  VENTUREOS_ROOT as LIB_VENTUREOS_ROOT,
  SHARED_CONTEXT_DIR,
  KPI_DIR as LIB_KPI_DIR,
  OBSERVATIONS_DIR as LIB_OBSERVATIONS_DIR,
} from '../../lib/paths.js';

import type { DashboardConfig } from './types.js';

export const VENTUREOS_ROOT: string = LIB_VENTUREOS_ROOT;

export const SHARED_CONTEXT: string = SHARED_CONTEXT_DIR;

export const KPI_DIR: string = LIB_KPI_DIR;

export const OBSERVATIONS_DIR: string = LIB_OBSERVATIONS_DIR;

export const config: DashboardConfig = {
  VENTUREOS_ROOT,
  SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
};
