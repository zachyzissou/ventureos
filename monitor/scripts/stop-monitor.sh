#!/bin/bash
# Stop Monitor-Agent

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/../logs"
PID_FILE="$LOG_DIR/monitor-agent.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "PID file not found. Killing by process name..."
    pkill -f "python.*monitor.main_loop" || echo "No process found"
    exit 0
fi

PID=$(cat "$PID_FILE")
echo "Stopping Monitor-Agent (PID: $PID)..."

if kill -0 $PID 2>/dev/null; then
    kill -TERM $PID
    sleep 2
    
    # Force kill if still running
    if kill -0 $PID 2>/dev/null; then
        echo "Process didn't stop gracefully, force killing..."
        kill -9 $PID
    fi
    
    echo "Monitor-Agent stopped"
else
    echo "Process not running"
fi

rm -f "$PID_FILE"
