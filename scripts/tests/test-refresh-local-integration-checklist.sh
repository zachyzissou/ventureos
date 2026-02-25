#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/refresh-local-integration-checklist.sh"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CHECKLIST="$TMP_DIR/LOCAL_INTEGRATION_CHECKLIST.md"
PREFLIGHT_JSON="$TMP_DIR/preflight-latest.json"
QUEUE_JSON="$TMP_DIR/queue-latest.json"

cat > "$CHECKLIST" <<'MD'
# Local Integration Checklist (Installer + OpenClaw)

Last verified: 2026-01-01
Owner: VentureOS installer execution

## Latest Preflight Evidence Result (Issue #520)

- Date (UTC): `2026-01-01`
- Generated: `2026-01-01T00:00:00Z`
- Install result marker: `PREFLIGHT`
- Preflight evidence status: `PASS`

## PR Queue Execution Cadence (Issue #504)

Queue status command (single-command health snapshot):

```bash
bash scripts/pr-queue-sweep.sh --json-out runtime/reports/pr-queue/queue-latest.json
```

## Latest Queue Cadence Result (Issue #522)

- Date (UTC): `2026-01-01`
- Queue status: `empty`

## Latest Installer Drill Result

- Date (UTC): `2026-01-01`
MD

cat > "$PREFLIGHT_JSON" <<'JSON'
{
  "generatedAtUtc": "2026-02-24T21:05:00Z",
  "status": "pass",
  "installResult": "PREFLIGHT",
  "command": {
    "invocation": "bash scripts/ventureos-install.sh --non-interactive --preflight-only --verify --openclaw-dir /tmp/.openclaw --bridge-env /tmp/bridge.env"
  },
  "artifacts": {
    "runLog": "runtime/reports/ventureos-install/ventureos-install-preflight-20260224T210500Z.log",
    "installReport": "runtime/reports/ventureos-install/ventureos-install-20260224T210501Z.md",
    "adoptionEvidenceJson": "runtime/reports/ventureos-install/ventureos-install-adoption-20260224T210501Z.json",
    "onboardingTranscript": "runtime/reports/ventureos-install/ventureos-onboarding-20260224T210501Z.md",
    "readinessStatusJson": "runtime/reports/openclaw-local-smoke/openclaw-local-ready-latest.json"
  },
  "restorePoint": "/tmp/restore-point-abc123"
}
JSON

cat > "$QUEUE_JSON" <<'JSON'
{
  "summary": {
    "totalOpen": 3,
    "draft": 1,
    "reviewNeeded": 1,
    "approvedMergeReady": 1,
    "approvedBlocked": 0,
    "queueStatus": "merge-ready",
    "recommendedAction": "Run queue merge sweep to merge approved + green PRs."
  },
  "prs": []
}
JSON

bash "$SCRIPT" \
  --checklist-path "$CHECKLIST" \
  --preflight-json "$PREFLIGHT_JSON" \
  --queue-json "$QUEUE_JSON" >/tmp/test-refresh-local-integration-checklist.out 2>&1

grep -q "LOCAL_INTEGRATION_CHECKLIST_REFRESH_RESULT=PASS" /tmp/test-refresh-local-integration-checklist.out
grep -q "Last verified: 2026-02-24" "$CHECKLIST"
grep -q "Generated: \`2026-02-24T21:05:00Z\`" "$CHECKLIST"
grep -q "Preflight evidence status: \`PASS\`" "$CHECKLIST"
grep -q "ventureos-install-preflight-20260224T210500Z.log" "$CHECKLIST"
grep -q "Restore point: \`/tmp/restore-point-abc123\`" "$CHECKLIST"
grep -q "Queue status: \`merge-ready\`" "$CHECKLIST"
grep -q "Recommended action: \`Run queue merge sweep to merge approved + green PRs.\`" "$CHECKLIST"
grep -q "total_open=\`3\` draft=\`1\` review_needed=\`1\` approved_merge_ready=\`1\` approved_blocked=\`0\`" "$CHECKLIST"

echo "REFRESH_LOCAL_INTEGRATION_CHECKLIST_TEST_OK"
