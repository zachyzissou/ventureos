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
    openclaw "Monitor-Agent already running"
    exit 1
fi

# Activate venv and start (UNBUFFERED for real-time logging)
cd "$MONITOR_DIR"
source venv/bin/activate
nohup python -u -m monitor.main_loop >> "$LOG_DIR/monitor-agent.log" 2>> "$LOG_DIR/monitor-agent-error.log" &

PID=$!
openclaw $PID > "$LOG_DIR/monitor-agent.pid"
openclaw "Monitor-Agent started (PID: $PID)"
openclaw "Logs: $LOG_DIR/monitor-agent.log"
