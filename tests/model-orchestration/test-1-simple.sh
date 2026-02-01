#!/bin/bash
# Test 1: Simple Monitoring Task - Response Speed & Accuracy
# Task: Analyze a log snippet and determine if action is needed

TEST_PROMPT='You are monitoring a system. Analyze this log snippet and respond with JSON only:

LOG:
2026-01-31 18:00:01 [INFO] Cron job started: Bloom PR Monitor
2026-01-31 18:00:03 [INFO] Checking GitHub API...
2026-01-31 18:00:05 [SUCCESS] 2 open PRs found
2026-01-31 18:00:06 [INFO] PR #47: Fix collision detection
2026-01-31 18:00:06 [INFO] PR #48: Update networking layer
2026-01-31 18:00:07 [INFO] All checks passing, no action needed
2026-01-31 18:00:08 [INFO] Job completed successfully

Respond with ONLY this JSON (no explanation):
{
  "needs_action": true/false,
  "reason": "one sentence",
  "severity": "none/low/medium/high"
}'

echo "=== TEST 1: Tier 1 Monitoring ==="
echo "Testing response speed and accuracy for simple boolean task"
echo ""

# Test each model
for MODEL in "qwen3:8b" "qwen3:14b" "qwen3:32b"; do
    echo "Testing $MODEL..."
    START=$(date +%s)
    RESPONSE=$(ollama run $MODEL "$TEST_PROMPT" 2>&1)
    END=$(date +%s)
    DURATION=$((END - START))
    
    echo "Duration: ${DURATION}s"
    echo "Response:"
    echo "$RESPONSE"
    echo ""
    echo "---"
    echo ""
done

echo "Test complete. Review responses for accuracy."
