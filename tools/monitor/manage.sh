#!/bin/bash
# Monitor-Agent Management Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/com.openclaw.monitor-agent.plist"
SERVICE_NAME="com.openclaw.monitor-agent"

case "$1" in
    status)
        openclaw "📊 Monitor-Agent Status:"
        if launchctl list | grep -q "$SERVICE_NAME"; then
            launchctl list | grep "$SERVICE_NAME"
            openclaw ""
            openclaw "✅ Running"
            
            # Show recent log activity
            if [ -f "$SCRIPT_DIR/logs/monitor-agent.log" ]; then
                openclaw ""
                openclaw "📋 Recent Activity (last 10 lines):"
                tail -10 "$SCRIPT_DIR/logs/monitor-agent.log"
            fi
        else
            openclaw "❌ Not running"
        fi
        ;;
        
    start)
        openclaw "▶️  Starting Monitor-Agent..."
        launchctl load "$LAUNCHD_PLIST"
        sleep 2
        $0 status
        ;;
        
    stop)
        openclaw "⏹️  Stopping Monitor-Agent..."
        launchctl unload "$LAUNCHD_PLIST"
        openclaw "✅ Stopped"
        ;;
        
    restart)
        openclaw "🔄 Restarting Monitor-Agent..."
        $0 stop
        sleep 1
        $0 start
        ;;
        
    logs)
        openclaw "📋 Tailing Monitor-Agent logs (Ctrl+C to exit):"
        openclaw ""
        tail -f "$SCRIPT_DIR/logs/monitor-agent.log"
        ;;
        
    errors)
        openclaw "⚠️  Tailing Monitor-Agent error logs (Ctrl+C to exit):"
        openclaw ""
        tail -f "$SCRIPT_DIR/logs/monitor-agent.error.log"
        ;;
        
    test)
        openclaw "🧪 Testing Monitor-Agent..."
        cd "$SCRIPT_DIR"
        source venv/bin/activate
        python3 -m pytest -v
        ;;
        
    *)
        openclaw "Monitor-Agent Management"
        openclaw ""
        openclaw "Usage: $0 {status|start|stop|restart|logs|errors|test}"
        openclaw ""
        openclaw "Commands:"
        openclaw "  status   - Show service status and recent activity"
        openclaw "  start    - Start the Monitor-Agent service"
        openclaw "  stop     - Stop the Monitor-Agent service"
        openclaw "  restart  - Restart the Monitor-Agent service"
        openclaw "  logs     - Tail standard output logs"
        openclaw "  errors   - Tail error logs"
        openclaw "  test     - Run test suite"
        exit 1
        ;;
esac
