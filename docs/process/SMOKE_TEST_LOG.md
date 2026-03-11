# Smoke Test Log

- Issue: #45
- Purpose: validate templates + labels + MR linking.

## 2026-02-13 — Workspace isolation verification

Commands run:
- `bash scripts/tests/test-spawn-with-retry.sh`
- `bash scripts/tests/test-routing-healthcheck-isolation.sh`
- `bash scripts/tests/test-export-cron-logs.sh`

Results:
- ✅ `SPAWN_WITH_RETRY_TESTS_OK`
- ✅ `ROUTING_HEALTHCHECK_ISOLATION_OK`
- ✅ `EXPORT_CRON_LOGS_OK`

Coverage:
- Verified per-agent runtime isolation for **atlas** and **oracle**
- Verified cross-workspace path denial (`PATH_ISOLATION_DENY`)
- Verified per-agent temp dir propagation (`/tmp/agent-<agentId>/`)
