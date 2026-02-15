#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# validate-kpi-schema.sh — Runtime KPI Schema Validator
#
# Parses all KPI definitions, extracts table.column references, and validates
# them against the actual SQLite database schema.
#
# Compatible with bash 3.2+ (macOS default).
#
# Usage:
#   ./validate-kpi-schema.sh [db_path] [kpi_dir]
#
# Exit codes:
#   0 — All KPIs validate cleanly
#   1 — Schema mismatches found (missing tables or columns)
#   2 — Script error (missing dependencies, bad paths, etc.)
#
# Env overrides:
#   KPI_DIR        default: ~/clawd/agents/kpis
#   DB_PATH        default: ~/clawd/agents/ventureos-rpg.db
#   KNOWN_ISSUES   default: ~/clawd/agents/kpis/.known-issues.json
#   QUIET          set to 1 to suppress ✅ lines (only show issues)
# =============================================================================

DB_PATH="${1:-${DB_PATH:-$HOME/clawd/agents/ventureos-rpg.db}}"
KPI_DIR="${2:-${KPI_DIR:-$HOME/clawd/agents/kpis}}"
KNOWN_ISSUES="${KNOWN_ISSUES:-$HOME/clawd/agents/kpis/.known-issues.json}"
QUIET="${QUIET:-0}"

log() { printf "[%s] %s\n" "$(date +%F' '%T)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

# --- Dependency checks ---
command -v jq  >/dev/null 2>&1 || die "jq not found (brew install jq)"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not found"

[[ -f "$DB_PATH" ]] || die "Database not found: $DB_PATH"
[[ -d "$KPI_DIR" ]] || die "KPI directory not found: $KPI_DIR"

# --- Temp files for schema map ---
TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

TABLES_FILE="$TMPDIR_WORK/tables.txt"
COLUMNS_FILE="$TMPDIR_WORK/columns.txt"
KNOWN_FILE="$TMPDIR_WORK/known_issues.txt"

# --- Build schema map from actual DB ---
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" > "$TABLES_FILE"

# Build table.column list
> "$COLUMNS_FILE"
while IFS= read -r table; do
    sqlite3 "$DB_PATH" "PRAGMA table_info(${table});" | while IFS='|' read -r _cid col_name _rest; do
        echo "${table}.${col_name}" >> "$COLUMNS_FILE"
    done
done < "$TABLES_FILE"

sort -u "$COLUMNS_FILE" -o "$COLUMNS_FILE"

# --- Known derived fields (formula variables, not DB columns) ---
DERIVED_FIELDS="available_agent_minutes total_agent_minutes successful_deployments total_deployments covered_lines total_lines doc_quality_score gaps_flagged"

# --- SQL filter value strings to ignore (agent names, action types) ---
# These appear in WHERE clauses as string values, not column names
FILTER_VALUES="archivist atlas echo nexus oracle sentinel synth verifier health_check deployment backup incident_response incident_resolution coordination decision mission planning handoff escalation research_output documentation memory_retrieve memory_store pattern_detection coverage_audit threat_detection security_alert creation creation_review creation_reuse code_review approval test_review zero_downtime cross_domain knowledge_gap"

# --- Load known issues ---
> "$KNOWN_FILE"
if [[ -f "$KNOWN_ISSUES" ]]; then
    jq -r '.[]' "$KNOWN_ISSUES" 2>/dev/null >> "$KNOWN_FILE" || true
fi

# --- Helper: check if item is in a space-separated list ---
in_list() {
    local item="$1" list="$2"
    for x in $list; do
        [[ "$x" == "$item" ]] && return 0
    done
    return 1
}

# --- Helper: check if line exists in a file ---
in_file() {
    grep -qxF "$1" "$2" 2>/dev/null
}

# --- Extract column-like identifiers from a SQL filter string ---
extract_filter_columns() {
    local filter="$1"
    # Extract word-like identifiers, filter out SQL keywords and string values
    echo "$filter" | \
        tr "(),'\"" '     ' | \
        grep -oE '\b[a-z_][a-z_0-9]*\b' | \
        grep -v -iE '^(AND|OR|NOT|IN|LIKE|IS|NULL|BETWEEN|TRUE|FALSE|SELECT|FROM|WHERE)$' | \
        sort -u
}

# --- Counters ---
total_kpis=0
valid_kpis=0
missing_table_count=0
missing_column_count=0
known_issue_count=0

# --- Output buffers (use temp files) ---
VALID_OUT="$TMPDIR_WORK/valid.txt"
MISSING_TABLE_OUT="$TMPDIR_WORK/missing_table.txt"
MISSING_COLUMN_OUT="$TMPDIR_WORK/missing_column.txt"
KNOWN_ISSUE_OUT="$TMPDIR_WORK/known_issue.txt"
> "$VALID_OUT"
> "$MISSING_TABLE_OUT"
> "$MISSING_COLUMN_OUT"
> "$KNOWN_ISSUE_OUT"

# --- Validate each KPI ---
for kpi_file in "$KPI_DIR"/*.json; do
    basename_file="$(basename "$kpi_file")"
    
    # Skip non-KPI files
    [[ "$basename_file" == "schema.json" ]] && continue
    [[ "$basename_file" == ".known-issues.json" ]] && continue
    
    kpi_id=$(jq -r '.kpi_id // empty' "$kpi_file" 2>/dev/null) || continue
    [[ -z "$kpi_id" ]] && continue
    
    total_kpis=$((total_kpis + 1))
    kpi_valid=true
    
    # Get count of data_sources
    ds_count=$(jq '.data_sources | length' "$kpi_file" 2>/dev/null) || continue
    
    ds_idx=0
    while [[ $ds_idx -lt $ds_count ]]; do
        table=$(jq -r ".data_sources[$ds_idx].table // empty" "$kpi_file")
        field=$(jq -r ".data_sources[$ds_idx].field // empty" "$kpi_file")
        filter=$(jq -r ".data_sources[$ds_idx].filter // empty" "$kpi_file")
        
        ds_idx=$((ds_idx + 1))
        [[ -z "$table" ]] && continue
        
        # Check table exists
        if ! in_file "$table" "$TABLES_FILE"; then
            issue_key="${kpi_id}:${table}"
            if in_file "$issue_key" "$KNOWN_FILE"; then
                echo "  ⚠️  [KNOWN] $kpi_id → table '$table' missing (documented)" >> "$KNOWN_ISSUE_OUT"
                known_issue_count=$((known_issue_count + 1))
            else
                echo "  ❌ $kpi_id → table '$table' does NOT exist in DB" >> "$MISSING_TABLE_OUT"
                kpi_valid=false
                missing_table_count=$((missing_table_count + 1))
            fi
            continue
        fi
        
        # Check field column exists
        if [[ -n "$field" ]]; then
            if ! in_list "$field" "$DERIVED_FIELDS"; then
                col_key="${table}.${field}"
                if ! in_file "$col_key" "$COLUMNS_FILE"; then
                    issue_key="${kpi_id}:${col_key}"
                    if in_file "$issue_key" "$KNOWN_FILE"; then
                        echo "  ⚠️  [KNOWN] $kpi_id → column '$col_key' missing (documented)" >> "$KNOWN_ISSUE_OUT"
                        known_issue_count=$((known_issue_count + 1))
                    else
                        echo "  ⚠️  $kpi_id → column '$col_key' does NOT exist (field reference)" >> "$MISSING_COLUMN_OUT"
                        kpi_valid=false
                        missing_column_count=$((missing_column_count + 1))
                    fi
                fi
            fi
        fi
        
        # Check filter column references
        if [[ -n "$filter" ]]; then
            while IFS= read -r filter_col; do
                [[ -z "$filter_col" ]] && continue
                # Skip numeric literals
                [[ "$filter_col" =~ ^[0-9]+$ ]] && continue
                # Skip known SQL value strings (agent names, action types)
                in_list "$filter_col" "$FILTER_VALUES" && continue
                # Skip derived fields
                in_list "$filter_col" "$DERIVED_FIELDS" && continue
                
                col_key="${table}.${filter_col}"
                if ! in_file "$col_key" "$COLUMNS_FILE"; then
                    issue_key="${kpi_id}:${col_key}"
                    if in_file "$issue_key" "$KNOWN_FILE"; then
                        echo "  ⚠️  [KNOWN] $kpi_id → column '$col_key' missing in filter (documented)" >> "$KNOWN_ISSUE_OUT"
                        known_issue_count=$((known_issue_count + 1))
                    else
                        echo "  ⚠️  $kpi_id → column '$col_key' does NOT exist (filter: $filter)" >> "$MISSING_COLUMN_OUT"
                        kpi_valid=false
                        missing_column_count=$((missing_column_count + 1))
                    fi
                fi
            done < <(extract_filter_columns "$filter")
        fi
    done
    
    if $kpi_valid; then
        valid_kpis=$((valid_kpis + 1))
        echo "  ✅ $kpi_id — all data sources valid" >> "$VALID_OUT"
    fi
done

# --- Output ---
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          VentureOS KPI Schema Validation Report             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  Database:  %-47s║\n" "$DB_PATH"
printf "║  KPI Dir:   %-47s║\n" "$KPI_DIR"
printf "║  Run Date:  %-47s║\n" "$(date +%F' '%T)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Missing tables first (most severe)
if [[ -s "$MISSING_TABLE_OUT" ]]; then
    echo "━━━ MISSING TABLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$MISSING_TABLE_OUT"
    echo ""
fi

# Missing columns
if [[ -s "$MISSING_COLUMN_OUT" ]]; then
    echo "━━━ MISSING COLUMNS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$MISSING_COLUMN_OUT"
    echo ""
fi

# Known issues
if [[ -s "$KNOWN_ISSUE_OUT" ]]; then
    echo "━━━ KNOWN ISSUES (suppressed) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$KNOWN_ISSUE_OUT"
    echo ""
fi

# Valid KPIs
if [[ "$QUIET" != "1" ]] && [[ -s "$VALID_OUT" ]]; then
    echo "━━━ VALID KPIs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$VALID_OUT"
    echo ""
fi

# Summary
echo "━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total KPIs:         $total_kpis"
echo "  ✅ Valid:            $valid_kpis"
echo "  ❌ Missing tables:   $missing_table_count"
echo "  ⚠️  Missing columns:  $missing_column_count"
echo "  📋 Known issues:     $known_issue_count"
echo ""

has_issues=false
if [[ $missing_table_count -gt 0 ]] || [[ $missing_column_count -gt 0 ]]; then
    has_issues=true
fi

if $has_issues; then
    echo "❌ VALIDATION FAILED — $((missing_table_count + missing_column_count)) issue(s) found"
    echo ""
    echo "  To fix:"
    echo "    1. Update KPI definitions to match actual DB schema"
    echo "    2. OR add missing columns via init-rpg-database.sh"
    echo "    3. OR document as known: add to $KNOWN_ISSUES"
    echo ""
    exit 1
else
    echo "✅ ALL KPIs VALIDATED SUCCESSFULLY"
    echo ""
    exit 0
fi
