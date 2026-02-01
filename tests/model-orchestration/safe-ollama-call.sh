#!/bin/bash
# Safe Ollama Call Wrapper - Auto-validates context windows
# Usage: ./safe-ollama-call.sh <model> <task-type> <prompt>

set -e

MODEL="$1"
TASK_TYPE="${2:-extraction}"  # monitoring, extraction, reasoning
PROMPT="$3"

if [ -z "$MODEL" ] || [ -z "$PROMPT" ]; then
    echo "Usage: $0 <model> <task-type> <prompt>"
    echo "Example: $0 qwen3:8b monitoring 'Check if system is healthy'"
    exit 1
fi

# Get validated context size
VALIDATOR_DIR="$(dirname "$0")"
CONTEXT=$(node "$VALIDATOR_DIR/context-validator.js" recommend "$MODEL" "$TASK_TYPE")

if [ -z "$CONTEXT" ]; then
    echo "ERROR: Could not determine safe context for $MODEL"
    exit 1
fi

echo "[SAFE-CALL] Model: $MODEL | Task: $TASK_TYPE | Context: $CONTEXT tokens" >&2

# Make the call with validated context
curl -s http://localhost:11434/api/generate -d "{
  \"model\": \"$MODEL\",
  \"prompt\": \"$PROMPT\",
  \"stream\": false,
  \"options\": {
    \"num_ctx\": $CONTEXT,
    \"temperature\": 0.1
  }
}" | jq -r '.response'
