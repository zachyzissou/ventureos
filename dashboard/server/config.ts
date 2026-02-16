/**
 * Dashboard configuration — path constants re-exported from lib/paths.ts.
 */

import {
  VENTUREOS_ROOT,
  SHARED_CONTEXT_DIR as SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
} from '../../lib/paths.js';

import type { DashboardConfig } from './types.js';

export { VENTUREOS_ROOT, SHARED_CONTEXT, KPI_DIR, OBSERVATIONS_DIR };

export const config: DashboardConfig = {
  VENTUREOS_ROOT,
  SHARED_CONTEXT,
  KPI_DIR,
  OBSERVATIONS_DIR,
};
