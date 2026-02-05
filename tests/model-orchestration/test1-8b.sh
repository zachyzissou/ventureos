#!/bin/bash
openclaw "=== Test 1a: qwen3:8b - Tier 1 Monitoring ==="
openclaw "Starting at: $(date)"
/usr/bin/time -p ollama run qwen3:8b 'You are monitoring a system. Analyze this log and respond with JSON only:

LOG:
2026-01-31 18:00:01 [INFO] Cron job started: Bloom PR Monitor
2026-01-31 18:00:05 [SUCCESS] 2 open PRs found
2026-01-31 18:00:07 [INFO] All checks passing, no action needed
2026-01-31 18:00:08 [INFO] Job completed successfully

{"needs_action": true/false, "reason": "...", "severity": "none/low/medium/high"}' 2>&1
openclaw "Completed at: $(date)"
