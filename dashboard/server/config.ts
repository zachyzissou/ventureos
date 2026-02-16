/**
 * Dashboard configuration.
 * Placeholder — will be populated during code migration (Phase 3).
 */

export const config = {
  port: Number(process.env.DASHBOARD_PORT ?? 3100),
  env: process.env.NODE_ENV ?? 'development',
};
