#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# lint-kpi-definitions.sh — KPI Definition Linter
#
# Validates KPI JSON files for:
#   1. JSON schema compliance (all required fields present)
#   2. Data source syntax (valid table.column references)
#   3. Formula syntax (no undefined variables, valid type)
#   4. Agent references (agent exists in tactical overlays)
#   5. Thresholds (min/max values make sense, direction consistent)
#
# Compatible with bash 3.2+ (macOS default).
#
# Usage:
#   ./lint-kpi-definitions.sh [kpi_dir] [overlays_dir]
#
# Exit codes:
#   0 — All KPI definitions pass linting
#   1 — Lint errors found
#   2 — Script error
# =============================================================================

KPI_DIR="${1:-${KPI_DIR:-$HOME/clawd/agents/kpis}}"
OVERLAYS_DIR="${2:-${OVERLAYS_DIR:-$HOME/clawd/agents/tactical-overlays}}"
SCHEMA_FILE="${KPI_DIR}/schema.json"

log() { printf "[%s] %s\n" "$(date +%F' '%T)" "$*" >&2; }
die() { log "ERROR: $*"; exit 2; }

command -v jq >/dev/null 2>&1 || die "jq not found (brew install jq)"

[[ -d "$KPI_DIR" ]] || die "KPI directory not found: $KPI_DIR"
[[ -d "$OVERLAYS_DIR" ]] || die "Overlays directory not found: $OVERLAYS_DIR"

# --- Temp files ---
TMPDIR_WORK=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WORK"' EXIT

ERRORS_FILE="$TMPDIR_WORK/errors.txt"
WARNINGS_FILE="$TMPDIR_WORK/warnings.txt"
> "$ERRORS_FILE"
> "$WARNINGS_FILE"

# --- Build list of valid agent IDs from tactical overlays ---
VALID_AGENTS=""
for overlay in "$OVERLAYS_DIR"/*.json; do
    aid=$(jq -r '.agent_id // empty' "$overlay" 2>/dev/null) || continue
    [[ -n "$aid" ]] && VALID_AGENTS="$VALID_AGENTS $aid"
done
VALID_AGENTS=$(echo "$VALID_AGENTS" | tr ' ' '\n' | sort -u | tr '\n' ' ')

# --- Valid enum values from schema ---
VALID_CATEGORIES="quality performance impact reliability security collaboration"
VALID_FORMULA_TYPES="ratio count percentage average threshold custom"
VALID_CHART_TYPES="line bar gauge sparkline number"
VALID_FREQUENCIES="realtime hourly daily weekly"
VALID_DIRECTIONS="higher_is_better lower_is_better"
VALID_AGGREGATIONS="sum avg min max count distinct_count"

in_list() {
    local item="$1" list="$2"
    for x in $list; do
        [[ "$x" == "$item" ]] && return 0
    done
    return 1
}

add_error() {
    echo "  ❌ [$1] $2" >> "$ERRORS_FILE"
}

add_warning() {
    echo "  ⚠️  [$1] $2" >> "$WARNINGS_FILE"
}

# --- Counters ---
total_kpis=0
passed_kpis=0
error_count=0
warning_count=0

# --- Lint each KPI file ---
for kpi_file in "$KPI_DIR"/*.json; do
    basename_file="$(basename "$kpi_file")"
    
    # Skip non-KPI files
    [[ "$basename_file" == "schema.json" ]] && continue
    [[ "$basename_file" == ".known-issues.json" ]] && continue
    
    # Check valid JSON
    if ! jq empty "$kpi_file" 2>/dev/null; then
        add_error "$basename_file" "Invalid JSON — parse error"
        error_count=$((error_count + 1))
        continue
    fi
    
    kpi_id=$(jq -r '.kpi_id // empty' "$kpi_file" 2>/dev/null) || continue
    [[ -z "$kpi_id" ]] && continue
    
    total_kpis=$((total_kpis + 1))
    kpi_errors=0
    
    # ─── 1. Required Fields ───
    required_fields="kpi_id agent_id category name description stakeholder_description formula data_sources thresholds visualization audit_trail"
    for field in $required_fields; do
        val=$(jq -r ".$field // empty" "$kpi_file" 2>/dev/null)
        if [[ -z "$val" ]] || [[ "$val" == "null" ]]; then
            add_error "$kpi_id" "Missing required field: $field"
            kpi_errors=$((kpi_errors + 1))
        fi
    done
    
    # ─── 2. kpi_id format ───
    if ! echo "$kpi_id" | grep -qE '^[a-z]+_[a-z_]+$'; then
        add_error "$kpi_id" "kpi_id format invalid (must be {agent}_{metric_name} lowercase)"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    # ─── 3. Agent reference validation ───
    agent_id=$(jq -r '.agent_id // empty' "$kpi_file")
    if [[ -n "$agent_id" ]]; then
        if ! in_list "$agent_id" "$VALID_AGENTS"; then
            add_error "$kpi_id" "agent_id '$agent_id' not found in tactical overlays"
            kpi_errors=$((kpi_errors + 1))
        fi
        
        # kpi_id should start with agent_id
        if [[ "$kpi_id" != "${agent_id}_"* ]]; then
            add_warning "$kpi_id" "kpi_id doesn't start with agent_id '$agent_id'"
            warning_count=$((warning_count + 1))
        fi
    fi
    
    # ─── 4. Category validation ───
    category=$(jq -r '.category // empty' "$kpi_file")
    if [[ -n "$category" ]] && ! in_list "$category" "$VALID_CATEGORIES"; then
        add_error "$kpi_id" "Invalid category '$category' (valid: $VALID_CATEGORIES)"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    # ─── 5. Formula validation ───
    formula_type=$(jq -r '.formula.type // empty' "$kpi_file")
    if [[ -z "$formula_type" ]]; then
        add_error "$kpi_id" "Missing formula.type"
        kpi_errors=$((kpi_errors + 1))
    elif ! in_list "$formula_type" "$VALID_FORMULA_TYPES"; then
        add_error "$kpi_id" "Invalid formula.type '$formula_type'"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    # For ratio/percentage, numerator and denominator should exist
    if [[ "$formula_type" == "ratio" ]] || [[ "$formula_type" == "percentage" ]]; then
        numerator=$(jq -r '.formula.numerator // empty' "$kpi_file")
        denominator=$(jq -r '.formula.denominator // empty' "$kpi_file")
        if [[ -z "$numerator" ]]; then
            add_error "$kpi_id" "Formula type '$formula_type' requires numerator"
            kpi_errors=$((kpi_errors + 1))
        fi
        if [[ -z "$denominator" ]]; then
            add_error "$kpi_id" "Formula type '$formula_type' requires denominator"
            kpi_errors=$((kpi_errors + 1))
        fi
    fi
    
    # For count/average, field should exist
    if [[ "$formula_type" == "count" ]] || [[ "$formula_type" == "average" ]]; then
        formula_field=$(jq -r '.formula.field // empty' "$kpi_file")
        if [[ -z "$formula_field" ]]; then
            add_error "$kpi_id" "Formula type '$formula_type' requires field"
            kpi_errors=$((kpi_errors + 1))
        fi
        # Validate aggregation if present
        aggregation=$(jq -r '.formula.aggregation // empty' "$kpi_file")
        if [[ -n "$aggregation" ]] && ! in_list "$aggregation" "$VALID_AGGREGATIONS"; then
            add_error "$kpi_id" "Invalid formula.aggregation '$aggregation'"
            kpi_errors=$((kpi_errors + 1))
        fi
    fi
    
    # For custom, custom_function should exist
    if [[ "$formula_type" == "custom" ]]; then
        custom_fn=$(jq -r '.formula.custom_function // empty' "$kpi_file")
        if [[ -z "$custom_fn" ]]; then
            add_warning "$kpi_id" "Formula type 'custom' has no custom_function defined"
            warning_count=$((warning_count + 1))
        fi
    fi
    
    # ─── 6. Data Sources validation ───
    ds_count=$(jq '.data_sources | length' "$kpi_file" 2>/dev/null)
    if [[ "$ds_count" -eq 0 ]]; then
        add_error "$kpi_id" "data_sources is empty (need at least 1)"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    ds_idx=0
    while [[ $ds_idx -lt $ds_count ]]; do
        ds_table=$(jq -r ".data_sources[$ds_idx].table // empty" "$kpi_file")
        if [[ -z "$ds_table" ]]; then
            add_error "$kpi_id" "data_sources[$ds_idx] missing required 'table' field"
            kpi_errors=$((kpi_errors + 1))
        fi
        
        # Validate table name format (lowercase, underscores)
        if [[ -n "$ds_table" ]] && ! echo "$ds_table" | grep -qE '^[a-z_][a-z_0-9]*$'; then
            add_error "$kpi_id" "data_sources[$ds_idx].table '$ds_table' has invalid format"
            kpi_errors=$((kpi_errors + 1))
        fi
        
        # Validate filter SQL syntax (basic checks)
        ds_filter=$(jq -r ".data_sources[$ds_idx].filter // empty" "$kpi_file")
        if [[ -n "$ds_filter" ]]; then
            # Check for common SQL injection patterns
            if echo "$ds_filter" | grep -qiE '(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE)\s'; then
                add_error "$kpi_id" "data_sources[$ds_idx].filter contains dangerous SQL: $ds_filter"
                kpi_errors=$((kpi_errors + 1))
            fi
            # Check for balanced quotes
            single_quotes=$(echo "$ds_filter" | tr -cd "'" | wc -c | tr -d ' ')
            if [[ $((single_quotes % 2)) -ne 0 ]]; then
                add_error "$kpi_id" "data_sources[$ds_idx].filter has unbalanced quotes"
                kpi_errors=$((kpi_errors + 1))
            fi
        fi
        
        ds_idx=$((ds_idx + 1))
    done
    
    # ─── 7. Thresholds validation ───
    for thresh in excellent good acceptable poor; do
        thresh_val=$(jq -r ".thresholds.$thresh // empty" "$kpi_file")
        if [[ -z "$thresh_val" ]]; then
            add_error "$kpi_id" "Missing threshold: $thresh"
            kpi_errors=$((kpi_errors + 1))
        fi
    done
    
    # Check threshold ordering makes sense
    direction=$(jq -r '.thresholds.direction // "higher_is_better"' "$kpi_file")
    if [[ -n "$direction" ]] && ! in_list "$direction" "$VALID_DIRECTIONS"; then
        add_error "$kpi_id" "Invalid threshold direction '$direction'"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    excellent=$(jq -r '.thresholds.excellent // 0' "$kpi_file")
    good=$(jq -r '.thresholds.good // 0' "$kpi_file")
    acceptable=$(jq -r '.thresholds.acceptable // 0' "$kpi_file")
    poor=$(jq -r '.thresholds.poor // 0' "$kpi_file")
    
    if [[ "$direction" == "higher_is_better" ]]; then
        # excellent > good > acceptable > poor
        if python3 -c "exit(0 if $excellent >= $good >= $acceptable >= $poor else 1)" 2>/dev/null; then
            : # correct ordering
        else
            add_warning "$kpi_id" "Threshold ordering may be wrong for higher_is_better: excellent=$excellent good=$good acceptable=$acceptable poor=$poor"
            warning_count=$((warning_count + 1))
        fi
    elif [[ "$direction" == "lower_is_better" ]]; then
        # excellent < good < acceptable < poor
        if python3 -c "exit(0 if $excellent <= $good <= $acceptable <= $poor else 1)" 2>/dev/null; then
            : # correct ordering
        else
            add_warning "$kpi_id" "Threshold ordering may be wrong for lower_is_better: excellent=$excellent good=$good acceptable=$acceptable poor=$poor"
            warning_count=$((warning_count + 1))
        fi
    fi
    
    # ─── 8. Visualization validation ───
    chart_type=$(jq -r '.visualization.chart_type // empty' "$kpi_file")
    if [[ -n "$chart_type" ]] && ! in_list "$chart_type" "$VALID_CHART_TYPES"; then
        add_error "$kpi_id" "Invalid visualization.chart_type '$chart_type'"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    update_freq=$(jq -r '.visualization.update_frequency // empty' "$kpi_file")
    if [[ -n "$update_freq" ]] && ! in_list "$update_freq" "$VALID_FREQUENCIES"; then
        add_error "$kpi_id" "Invalid visualization.update_frequency '$update_freq'"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    dash_section=$(jq -r '.visualization.dashboard_section // empty' "$kpi_file")
    if [[ -z "$dash_section" ]]; then
        add_error "$kpi_id" "Missing visualization.dashboard_section"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    # ─── 9. Audit trail validation ───
    created=$(jq -r '.audit_trail.created // empty' "$kpi_file")
    last_modified=$(jq -r '.audit_trail.last_modified // empty' "$kpi_file")
    if [[ -z "$created" ]]; then
        add_error "$kpi_id" "Missing audit_trail.created date"
        kpi_errors=$((kpi_errors + 1))
    elif ! echo "$created" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
        add_error "$kpi_id" "audit_trail.created '$created' not in YYYY-MM-DD format"
        kpi_errors=$((kpi_errors + 1))
    fi
    if [[ -z "$last_modified" ]]; then
        add_error "$kpi_id" "Missing audit_trail.last_modified date"
        kpi_errors=$((kpi_errors + 1))
    fi
    
    # Track results
    if [[ $kpi_errors -eq 0 ]]; then
        passed_kpis=$((passed_kpis + 1))
    fi
    error_count=$((error_count + kpi_errors))
done

# --- Output ---
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║            VentureOS KPI Definition Lint Report             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  KPI Dir:     %-44s║\n" "$KPI_DIR"
printf "║  Overlays:    %-44s║\n" "$OVERLAYS_DIR"
printf "║  Run Date:    %-44s║\n" "$(date +%F' '%T)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ -s "$ERRORS_FILE" ]]; then
    echo "━━━ ERRORS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$ERRORS_FILE"
    echo ""
fi

if [[ -s "$WARNINGS_FILE" ]]; then
    echo "━━━ WARNINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cat "$WARNINGS_FILE"
    echo ""
fi

echo "━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total KPIs:     $total_kpis"
echo "  ✅ Passed:       $passed_kpis"
echo "  ❌ Errors:       $error_count"
echo "  ⚠️  Warnings:    $warning_count"
echo ""

if [[ $error_count -gt 0 ]]; then
    echo "❌ LINT FAILED — $error_count error(s) found"
    exit 1
else
    echo "✅ ALL KPI DEFINITIONS PASSED LINTING"
    exit 0
fi
