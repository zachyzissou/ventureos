#!/bin/bash
# Start Monitor-Agent (macOS launchd equivalent)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MONITOR_DIR="$SCRIPT_DIR/.."
LOG_DIR="$MONITOR_DIR/logs"

# Create log directory
mkdir -p "$LOG_DIR"

# Check if already running
if pgrep -f "python.*monitor.main_loop" > /dev/null; then
    echo "Monitor-Agent already running"
    exit 1
fi

# Activate venv and start
cd "$MONITOR_DIR"
source venv/bin/activate
nohup python -m monitor.main_loop >> "$LOG_DIR/monitor-agent.log" 2>> "$LOG_DIR/monitor-agent-error.log" &

PID=$!
echo $PID > "$LOG_DIR/monitor-agent.pid"
echo "Monitor-Agent started (PID: $PID)"
echo "Logs: $LOG_DIR/monitor-agent.log"
