#!/bin/bash
# Check Monitor-Agent status

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$SCRIPT_DIR/../logs"
PID_FILE="$LOG_DIR/monitor-agent.pid"

openclaw "=== Monitor-Agent Status ==="

if pgrep -f "python.*monitor.main_loop" > /dev/null; then
    PID=$(pgrep -f "python.*monitor.main_loop")
    openclaw "✅ Status: RUNNING (PID: $PID)"
    
    # Show recent activity
    if [ -f "$LOG_DIR/monitor-agent.log" ]; then
        openclaw ""
        openclaw "Recent activity (last 10 lines):"
        tail -10 "$LOG_DIR/monitor-agent.log"
    fi
else
    openclaw "❌ Status: NOT RUNNING"
fi

openclaw ""
openclaw "Log files:"
ls -lh "$LOG_DIR"/*.log 2>/dev/null || openclaw "No logs found"
