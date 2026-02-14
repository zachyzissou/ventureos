#!/bin/bash
# session-health-check.sh - Monitor agent session sizes and auto-cleanup
# Prevents token limit errors by detecting bloated sessions early

set -euo pipefail

AGENTS_DIR="/Users/zachgonser/.openclaw/agents"
WARN_SIZE_KB=400      # Warn at 400KB (approx 150K tokens)
CRITICAL_SIZE_KB=600  # Auto-reset at 600KB (approx 200K+ tokens)
SLURPNET_CHANNEL="1466893115460812979"

echo "=== Session Health Check $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

issues_found=0
resets_done=0

for agent in oracle atlas sentinel verifier archivist synth; do
    sessions_dir="$AGENTS_DIR/$agent/sessions"
    
    if [[ ! -d "$sessions_dir" ]]; then
        continue
    fi
    
    # Find all active session JSONL files
    while IFS= read -r session_file; do
        if [[ ! -f "$session_file" ]]; then
            continue
        fi
        
        size_kb=$(du -k "$session_file" | cut -f1)
        session_id=$(basename "$session_file" .jsonl)
        
        if (( size_kb >= CRITICAL_SIZE_KB )); then
            echo "❌ CRITICAL: $agent session $session_id is ${size_kb}KB (>= ${CRITICAL_SIZE_KB}KB)"
            echo "   → Auto-resetting to prevent token limit errors"
            
            # Backup before deleting
            backup_dir="$sessions_dir/backups"
            mkdir -p "$backup_dir"
            cp "$session_file" "$backup_dir/${session_id}-$(date +%Y%m%d-%H%M%S).jsonl.bak"
            
            # Delete bloated session
            rm "$session_file"
            
            ((resets_done++))
            ((issues_found++))
            
            # Report to SlurpNet
            message="🔄 **Session Auto-Reset**\n\nAgent: $agent\nSession: ${session_id:0:8}...\nSize: ${size_kb}KB (critical threshold: ${CRITICAL_SIZE_KB}KB)\nAction: Session reset, backup saved\n\nReason: Prevent token limit errors (200K max)"
            
            curl -X POST "https://discord.com/api/webhooks/1470220519319142667/$(cat ~/.credentials/discord-webhook-slurpnet.secret)" \
                -H "Content-Type: application/json" \
                -d "{\"content\": \"$message\"}" \
                2>/dev/null || true
                
        elif (( size_kb >= WARN_SIZE_KB )); then
            echo "⚠️  WARNING: $agent session $session_id is ${size_kb}KB (>= ${WARN_SIZE_KB}KB)"
            ((issues_found++))
        else
            echo "✅ OK: $agent session $session_id is ${size_kb}KB"
        fi
        
    done < <(find "$sessions_dir" -maxdepth 1 -name "*.jsonl" -type f)
done

echo ""
echo "Summary: $issues_found warnings/critical, $resets_done auto-resets"

if (( issues_found > 0 )); then
    exit 1  # Non-zero exit for monitoring
else
    exit 0
fi
