#!/bin/bash
# Monitor-Agent Management Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/com.clawdbot.monitor-agent.plist"
SERVICE_NAME="com.clawdbot.monitor-agent"

case "$1" in
    status)
        echo "📊 Monitor-Agent Status:"
        if launchctl list | grep -q "$SERVICE_NAME"; then
            launchctl list | grep "$SERVICE_NAME"
            echo ""
            echo "✅ Running"
            
            # Show recent log activity
            if [ -f "$SCRIPT_DIR/logs/monitor-agent.log" ]; then
                echo ""
                echo "📋 Recent Activity (last 10 lines):"
                tail -10 "$SCRIPT_DIR/logs/monitor-agent.log"
            fi
        else
            echo "❌ Not running"
        fi
        ;;
        
    start)
        echo "▶️  Starting Monitor-Agent..."
        launchctl load "$LAUNCHD_PLIST"
        sleep 2
        $0 status
        ;;
        
    stop)
        echo "⏹️  Stopping Monitor-Agent..."
        launchctl unload "$LAUNCHD_PLIST"
        echo "✅ Stopped"
        ;;
        
    restart)
        echo "🔄 Restarting Monitor-Agent..."
        $0 stop
        sleep 1
        $0 start
        ;;
        
    logs)
        echo "📋 Tailing Monitor-Agent logs (Ctrl+C to exit):"
        echo ""
        tail -f "$SCRIPT_DIR/logs/monitor-agent.log"
        ;;
        
    errors)
        echo "⚠️  Tailing Monitor-Agent error logs (Ctrl+C to exit):"
        echo ""
        tail -f "$SCRIPT_DIR/logs/monitor-agent.error.log"
        ;;
        
    test)
        echo "🧪 Testing Monitor-Agent..."
        cd "$SCRIPT_DIR"
        source venv/bin/activate
        python -m pytest -v
        ;;
        
    *)
        echo "Monitor-Agent Management"
        echo ""
        echo "Usage: $0 {status|start|stop|restart|logs|errors|test}"
        echo ""
        echo "Commands:"
        echo "  status   - Show service status and recent activity"
        echo "  start    - Start the Monitor-Agent service"
        echo "  stop     - Stop the Monitor-Agent service"
        echo "  restart  - Restart the Monitor-Agent service"
        echo "  logs     - Tail standard output logs"
        echo "  errors   - Tail error logs"
        echo "  test     - Run test suite"
        exit 1
        ;;
esac
