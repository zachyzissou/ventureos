#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="$ROOT_DIR/tactical-map/scripts/summarize-performance-ci.mjs"

run_case() {
  local mode="$1"
  local exit_code="$2"
  local perf_output="$3"
  local expected_decision="$4"
  local expected_enabled="$5"
  local expected_suite="$6"

  local workdir
  workdir="$(mktemp -d)"
  trap 'rm -rf "$workdir"' RETURN

  cat > "$workdir/performance-output.txt" <<EOF
$perf_output
EOF
  printf '%s\n' "$exit_code" > "$workdir/benchmark-exit-code.txt"
  cat > "$workdir/playwright-results.json" <<EOF
{"status":"$([ "$exit_code" = "0" ] && echo passed || echo failed)","failedTests":[]}
EOF

  node "$SCRIPT_PATH" \
    --mode "$mode" \
    --output "$workdir/performance-output.txt" \
    --playwrightStatus "$workdir/playwright-results.json" \
    --exitCodeFile "$workdir/benchmark-exit-code.txt" \
    --reportsDir "$workdir/reports" \
    --sha "deadbeef" \
    --branch "main" \
    --pr "123" \
    --threshold "10" \
    --issue "630" \
    --stableSuites "load" \
    --informationalSuites "render,network,memory" \
    --executedSuites "load,render,network,memory"

  python3 - <<'PY' "$workdir/reports/performance-status.json" "$expected_decision" "$expected_enabled" "$expected_suite"
import json
import sys

path, expected_decision, expected_enabled, expected_suite = sys.argv[1:]
with open(path, 'r', encoding='utf-8') as handle:
    status = json.load(handle)

actual_decision = status["gating"]["decision"]
actual_enabled = "true" if status["gating"]["enabled"] else "false"
observed_suites = status["benchmark"]["observedSuites"]

if actual_decision != expected_decision:
    raise SystemExit(f"expected decision {expected_decision}, got {actual_decision}")
if actual_enabled != expected_enabled:
    raise SystemExit(f"expected enabled {expected_enabled}, got {actual_enabled}")
if expected_suite not in observed_suites:
    raise SystemExit(f"expected observed suite {expected_suite}, got {observed_suites}")
PY
  trap - RETURN
  rm -rf "$workdir"
}

run_case \
  "pr-stable" \
  "0" \
  "[perf:load:baseline] fps=60.01 min=59.90 mem=13.1MB delta=0.3MB" \
  "pass" \
  "true" \
  "load"

run_case \
  "pr-stable" \
  "1" \
  "[perf:load:baseline] fps=42.00 min=40.10 mem=13.1MB delta=0.3MB" \
  "fail" \
  "true" \
  "load"

run_case \
  "full-observe" \
  "1" \
  $'[perf:load:baseline] fps=60.01 min=59.90 mem=13.1MB delta=0.3MB\n[perf:render:idle] avg=1.52 min=1.21 p95ft=836.4ms' \
  "warn" \
  "false" \
  "render"

echo "test-performance-ci-summary.sh: PASS"
