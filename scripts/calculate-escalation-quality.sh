#!/bin/bash
# calculate-escalation-quality.sh - Calculate escalation signal ratios and quality metrics
# Usage: calculate-escalation-quality.sh [--lookback-days N] [--apply-drift] [--agent AGENT]
# Example: calculate-escalation-quality.sh --lookback-days 30 --apply-drift

set -euo pipefail

# Configuration
DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
OUTPUT_DIR="$HOME/clawd/runtime/tmp"
SCRIPT_NAME="$(basename "$0")"

# Defaults
LOOKBACK_DAYS=30
APPLY_DRIFT=false
AGENT_FILTER=""
MIN_SAMPLE_SIZE=5

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --lookback-days)
            LOOKBACK_DAYS="$2"
            shift 2
            ;;
        --apply-drift)
            APPLY_DRIFT=true
            shift
            ;;
        --agent)
            AGENT_FILTER="$2"
            shift 2
            ;;
        -h|--help)
            cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Calculate escalation quality metrics and signal ratios.

Options:
  --lookback-days N   Days to look back (default: 30)
  --apply-drift       Apply drift adjustments to Khala Network
  --agent AGENT       Filter to specific agent (default: all)
  -h, --help          Show this help

Output:
  Quality report written to stdout and $OUTPUT_DIR/escalation-quality-report.txt

Examples:
  $SCRIPT_NAME --lookback-days 30
  $SCRIPT_NAME --agent sentinel --apply-drift
EOF
            exit 0
            ;;
        *)
            echo "❌ Error: Unknown option $1" >&2
            exit 1
            ;;
    esac
done

# Check database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: Database not found at $DB_PATH" >&2
    exit 1
fi

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# Build agent filter clause
AGENT_CLAUSE=""
if [ -n "$AGENT_FILTER" ]; then
    AGENT_CLAUSE="AND escalated_by = '$AGENT_FILTER'"
fi

# Calculate quality metrics
REPORT_FILE="$OUTPUT_DIR/escalation-quality-report.txt"
{
    echo "========================================"
    echo " Escalation Quality Report"
    echo "========================================"
    echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Lookback: Last $LOOKBACK_DAYS days"
    [ -n "$AGENT_FILTER" ] && echo "Agent: $AGENT_FILTER" || echo "Agent: All"
    echo ""
    
    # Get per-agent statistics
    sqlite3 "$DB_PATH" <<SQL
SELECT 
    escalated_by AS agent,
    COUNT(*) AS total,
    SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS validated,
    SUM(CASE WHEN validated_as_real = 0 THEN 1 ELSE 0 END) AS false_positives,
    SUM(CASE WHEN validated_as_real IS NULL THEN 1 ELSE 0 END) AS pending,
    ROUND(
        CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
        NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0),
        3
    ) AS signal_ratio,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) AS p0_count,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) AS p1_count,
    COUNT(CASE WHEN severity = 'medium' THEN 1 END) AS p2_count,
    COUNT(CASE WHEN severity = 'low' THEN 1 END) AS p3_count
FROM escalations
WHERE created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  $AGENT_CLAUSE
GROUP BY escalated_by
ORDER BY signal_ratio DESC;
SQL
    
    echo ""
    echo "========================================"
    echo " Signal Ratio Assessment"
    echo "========================================"
    echo ""
    
    # Get detailed assessment for each agent
    sqlite3 -separator ' | ' "$DB_PATH" <<SQL
.mode column
.headers on
SELECT 
    escalated_by AS Agent,
    ROUND(
        CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
        NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0),
        3
    ) AS SignalRatio,
    CASE 
        WHEN SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END) < $MIN_SAMPLE_SIZE 
            THEN 'Insufficient Data'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.80 
            THEN 'Excellent'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.60 
            THEN 'Good'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.40 
            THEN 'Acceptable'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.20 
            THEN 'Noisy'
        ELSE 'Crying Wolf'
    END AS Assessment,
    CASE 
        WHEN SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END) < $MIN_SAMPLE_SIZE 
            THEN 'N/A'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.80 
            THEN '+0.04 Verifier, +0.03 Echo'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.60 
            THEN '+0.02 Verifier'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.40 
            THEN 'No change'
        WHEN ROUND(CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
             NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0), 3) >= 0.20 
            THEN '-0.03 Verifier, -0.02 Echo'
        ELSE '-0.05 Verifier, -0.04 Echo'
    END AS DriftImpact
FROM escalations
WHERE created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  $AGENT_CLAUSE
GROUP BY escalated_by;
SQL
    
    echo ""
    echo "========================================"
    echo " Informational Escalation Monitoring"
    echo "========================================"
    echo ""
    
    # Track informational escalation usage
    sqlite3 -separator ' | ' "$DB_PATH" <<SQL
.mode column
.headers on
SELECT 
    escalated_by AS Agent,
    COUNT(*) AS Total,
    SUM(CASE WHEN severity = '' OR severity IS NULL THEN 1 ELSE 0 END) AS Informational,
    ROUND(
        CAST(SUM(CASE WHEN severity = '' OR severity IS NULL THEN 1 ELSE 0 END) AS REAL) / 
        NULLIF(COUNT(*), 0) * 100,
        1
    ) AS InformationalPct,
    CASE 
        WHEN ROUND(
            CAST(SUM(CASE WHEN severity = '' OR severity IS NULL THEN 1 ELSE 0 END) AS REAL) / 
            NULLIF(COUNT(*), 0) * 100,
            1
        ) > 30 THEN '⚠️  Above threshold'
        ELSE '✓ Within limits'
    END AS Status
FROM escalations
WHERE created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  $AGENT_CLAUSE
GROUP BY escalated_by;
SQL
    
    echo ""
    echo "Gaming Alert Threshold: 30% informational escalations"
    echo "Rationale: Excessive informational usage may indicate avoiding validation"
    echo ""
    
    echo ""
    echo "========================================"
    echo " Severity Calibration"
    echo "========================================"
    echo ""
    
    # Track severity accuracy (not yet implemented - would need severity adjustment tracking)
    echo "Note: Severity calibration tracking requires metadata.original_severity"
    echo "      to be populated when severity is adjusted post-validation."
    echo ""
    
    echo "========================================"
    echo " Recent Escalations (Last 10)"
    echo "========================================"
    echo ""
    
    sqlite3 -separator ' | ' "$DB_PATH" <<SQL
.mode column
.headers on
SELECT 
    id AS ID,
    escalated_by AS Escalator,
    escalated_to AS Target,
    severity AS Sev,
    SUBSTR(issue_description, 1, 40) AS Issue,
    CASE 
        WHEN validated_as_real = 1 THEN '✓ Valid'
        WHEN validated_as_real = 0 THEN '✗ False'
        ELSE '⏳ Pending'
    END AS Status,
    validated_by AS Validator
FROM escalations
WHERE created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  $AGENT_CLAUSE
ORDER BY created_at DESC
LIMIT 10;
SQL
    
    echo ""
    
} | tee "$REPORT_FILE"

# Apply drift if requested
if [ "$APPLY_DRIFT" = true ]; then
    echo ""
    echo "========================================"
    echo " Applying Monthly Drift Adjustments"
    echo "========================================"
    echo ""
    
    # Check idempotency: has drift already been applied this month?
    CURRENT_MONTH=$(date '+%Y-%m')
    DRIFT_MARKER_FILE="$OUTPUT_DIR/escalation-monthly-drift-last-run.txt"
    
    if [ -f "$DRIFT_MARKER_FILE" ]; then
        LAST_RUN=$(cat "$DRIFT_MARKER_FILE")
        if [ "$LAST_RUN" = "$CURRENT_MONTH" ]; then
            echo "⚠️  Monthly drift already applied for $CURRENT_MONTH"
            echo "   Marker file: $DRIFT_MARKER_FILE"
            echo "   Last run: $LAST_RUN"
            echo "   Skipping to prevent duplicate application"
            echo ""
            echo "   To force re-application, run:"
            echo "   rm $DRIFT_MARKER_FILE"
            echo ""
            exit 0
        fi
    fi
    
    echo "✓ Idempotency check passed - no drift applied yet for $CURRENT_MONTH"
    echo ""
    
    # Get agents with sufficient data
    AGENTS=$(sqlite3 "$DB_PATH" <<SQL
SELECT DISTINCT escalated_by
FROM escalations
WHERE created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  AND validated_as_real IS NOT NULL
  $AGENT_CLAUSE
GROUP BY escalated_by
HAVING COUNT(*) >= $MIN_SAMPLE_SIZE;
SQL
)
    
    for AGENT in $AGENTS; do
        # Calculate signal ratio
        SIGNAL_RATIO=$(sqlite3 "$DB_PATH" <<SQL
SELECT ROUND(
    CAST(SUM(CASE WHEN validated_as_real = 1 THEN 1 ELSE 0 END) AS REAL) / 
    NULLIF(SUM(CASE WHEN validated_as_real IS NOT NULL THEN 1 ELSE 0 END), 0),
    3
)
FROM escalations
WHERE escalated_by = '$AGENT'
  AND created_at >= datetime('now', '-$LOOKBACK_DAYS days')
  AND validated_as_real IS NOT NULL;
SQL
)
        
        # Determine drift amounts
        if (( $(echo "$SIGNAL_RATIO >= 0.80" | bc -l) )); then
            DRIFT_VERIFIER=0.04
            DRIFT_ECHO=0.03
            ASSESSMENT="Excellent"
        elif (( $(echo "$SIGNAL_RATIO >= 0.60" | bc -l) )); then
            DRIFT_VERIFIER=0.02
            DRIFT_ECHO=0.00
            ASSESSMENT="Good"
        elif (( $(echo "$SIGNAL_RATIO >= 0.40" | bc -l) )); then
            DRIFT_VERIFIER=0.00
            DRIFT_ECHO=0.00
            ASSESSMENT="Acceptable"
        elif (( $(echo "$SIGNAL_RATIO >= 0.20" | bc -l) )); then
            DRIFT_VERIFIER=-0.03
            DRIFT_ECHO=-0.02
            ASSESSMENT="Noisy"
        else
            DRIFT_VERIFIER=-0.05
            DRIFT_ECHO=-0.04
            ASSESSMENT="Crying Wolf"
        fi
        
        echo "Agent: $AGENT | Signal Ratio: $SIGNAL_RATIO | Assessment: $ASSESSMENT"
        
        # Apply drift to Verifier bond
        if (( $(echo "$DRIFT_VERIFIER != 0" | bc -l) )); then
            # Determine agent pair order
            if [[ "$AGENT" < "verifier" ]]; then
                AGENT_A="$AGENT"
                AGENT_B="verifier"
            else
                AGENT_A="verifier"
                AGENT_B="$AGENT"
            fi
            
            CURRENT=$(sqlite3 "$DB_PATH" "SELECT affinity FROM khala_network WHERE agent_a='$AGENT_A' AND agent_b='$AGENT_B';")
            
            if [ -n "$CURRENT" ]; then
                NEW=$(python3 -c "print(max(0.10, min(0.95, $CURRENT + $DRIFT_VERIFIER)))")
                
                sqlite3 "$DB_PATH" <<SQL
UPDATE khala_network
SET affinity = $NEW, updated_at = datetime('now')
WHERE agent_a = '$AGENT_A' AND agent_b = '$AGENT_B';

INSERT INTO khala_drift_history (agent_a, agent_b, old_affinity, new_affinity, delta, reason)
VALUES ('$AGENT_A', '$AGENT_B', $CURRENT, $NEW, $DRIFT_VERIFIER, 'monthly_escalation_quality:$SIGNAL_RATIO');
SQL
                
                echo "  → $AGENT ↔ Verifier: $CURRENT → $NEW (Δ $DRIFT_VERIFIER)"
            fi
        fi
        
        # Apply drift to Echo bond
        if (( $(echo "$DRIFT_ECHO != 0" | bc -l) )); then
            if [[ "$AGENT" < "echo" ]]; then
                AGENT_A="$AGENT"
                AGENT_B="echo"
            else
                AGENT_A="echo"
                AGENT_B="$AGENT"
            fi
            
            CURRENT=$(sqlite3 "$DB_PATH" "SELECT affinity FROM khala_network WHERE agent_a='$AGENT_A' AND agent_b='$AGENT_B';")
            
            if [ -n "$CURRENT" ]; then
                NEW=$(python3 -c "print(max(0.10, min(0.95, $CURRENT + $DRIFT_ECHO)))")
                
                sqlite3 "$DB_PATH" <<SQL
UPDATE khala_network
SET affinity = $NEW, updated_at = datetime('now')
WHERE agent_a = '$AGENT_A' AND agent_b = '$AGENT_B';

INSERT INTO khala_drift_history (agent_a, agent_b, old_affinity, new_affinity, delta, reason)
VALUES ('$AGENT_A', '$AGENT_B', $CURRENT, $NEW, $DRIFT_ECHO, 'monthly_escalation_quality:$SIGNAL_RATIO');
SQL
                
                echo "  → $AGENT ↔ Echo: $CURRENT → $NEW (Δ $DRIFT_ECHO)"
            fi
        fi
        
        echo ""
    done
    
    # Mark this month as processed
    echo "$CURRENT_MONTH" > "$DRIFT_MARKER_FILE"
    echo "✅ Monthly drift processing complete for $CURRENT_MONTH"
    echo "   Marker written to: $DRIFT_MARKER_FILE"
    echo ""
fi

echo "✅ Report saved to: $REPORT_FILE"

exit 0
