#!/bin/bash
# Test 1: Tier 1 Monitoring - Check if new GitHub PR exists
# Models: qwen3:8b, qwen3:14b, qwen3:32b vs Claude Haiku
# Expected: <10s response, boolean accuracy

TEST_PROMPT='Check the GitHub repository zachyzissou/Bloom for any open pull requests. You have access to the gh CLI tool. Simply run: gh pr list --repo zachyzissou/Bloom --state open --json number,title --limit 5

Return ONLY a JSON object with this structure:
{
  "has_open_prs": true/false,
  "count": <number>,
  "response_time": "<how long this took you>"
}

Be concise. Just run the command and report the facts.'

echo "=== TEST 1: Tier 1 Monitoring (Boolean Check) ==="
echo "Task: Check for open PRs in Bloom repo"
echo ""

# Test Qwen 8B
echo "Testing qwen3:8b..."
START=$(date +%s)
RESULT_8B=$(ollama run qwen3:8b "$TEST_PROMPT" 2>&1)
END=$(date +%s)
TIME_8B=$((END - START))
echo "Time: ${TIME_8B}s"
echo "Response: $RESULT_8B"
echo ""

# Test Qwen 14B
echo "Testing qwen3:14b..."
START=$(date +%s)
RESULT_14B=$(ollama run qwen3:14b "$TEST_PROMPT" 2>&1)
END=$(date +%s)
TIME_14B=$((END - START))
echo "Time: ${TIME_14B}s"
echo "Response: $RESULT_14B"
echo ""

# Test Qwen 32B
echo "Testing qwen3:32b..."
START=$(date +%s)
RESULT_32B=$(ollama run qwen3:32b "$TEST_PROMPT" 2>&1)
END=$(date +%s)
TIME_32B=$((END - START))
echo "Time: ${TIME_32B}s"
echo "Response: $RESULT_32B"
echo ""

echo "=== Summary ==="
echo "qwen3:8b  - ${TIME_8B}s"
echo "qwen3:14b - ${TIME_14B}s"
echo "qwen3:32b - ${TIME_32B}s"
