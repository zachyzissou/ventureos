#!/usr/bin/env bash
set -euo pipefail

# check-protocol-triggers.sh — Evaluate personality protocol triggers and update `personality_activations`.
#
# This is the Phase 2 Track 5 “activation engine”: deterministic, idempotent, and auditable.
#
# Data sources (best-effort):
#   - RPG DB: psionic_stats, psionic_ranks, missions, escalations
#   - Optional observational memory tags: ~/.openclaw/workspace-archivist/observations/*.md (ripgrep)
#
# Usage:
#   ./check-protocol-triggers.sh [--db <db_path>] [--obs-dir <dir>] [--overlays-dir <dir>] [--dry-run]

DB_PATH="$HOME/clawd/agents/ventureos-rpg.db"
OBS_DIR="$HOME/.openclaw/workspace-archivist/observations"
OVERLAYS_DIR="$HOME/clawd/agents/tactical-overlays"
LOG_DIR="$HOME/clawd/runtime/logs"
DRY_RUN=0

usage() {
  cat >&2 <<'EOF'
check-protocol-triggers.sh

Optional:
  --db <db_path>           default: ~/clawd/agents/ventureos-rpg.db
  --obs-dir <dir>          default: ~/.openclaw/workspace-archivist/observations
  --overlays-dir <dir>     default: ~/clawd/agents/tactical-overlays
  --dry-run                print actions, do not modify DB

Examples:
  ./check-protocol-triggers.sh
  ./check-protocol-triggers.sh --dry-run
EOF
}

log() {
  printf "[%s] %s\n" "$(date +%F' '%T)" "$*" | tee -a "$LOG_FILE" >&2
}

die() { echo "ERROR: $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db) DB_PATH="${2:-}"; shift 2;;
    --obs-dir) OBS_DIR="${2:-}"; shift 2;;
    --overlays-dir) OVERLAYS_DIR="${2:-}"; shift 2;;
    --dry-run) DRY_RUN=1; shift 1;;
    -h|--help) usage; exit 0;;
    *) die "Unknown arg: $1";;
  esac
done

command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not found"
command -v python3 >/dev/null 2>&1 || die "python3 not found"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/protocol-triggers-$(date +%Y-%m-%d).log"

ACTIVATE="$HOME/clawd/scripts/activate-protocol.sh"
DEACTIVATE="$HOME/clawd/scripts/deactivate-protocol.sh"
[[ -x "$ACTIVATE" ]] || die "Missing or not executable: $ACTIVATE"
[[ -x "$DEACTIVATE" ]] || die "Missing or not executable: $DEACTIVATE"
[[ -f "$DB_PATH" ]] || die "DB not found: $DB_PATH"

HAS_RG=0
if command -v rg >/dev/null 2>&1 && [[ -d "$OBS_DIR" ]]; then
  HAS_RG=1
fi

sql1() {
  # Print a single scalar; empty -> 0
  local q="$1"
  local out
  out=$(sqlite3 "$DB_PATH" -noheader -batch "$q" 2>/dev/null || true)
  out="${out//$'\r'/}"
  if [[ -z "$out" ]]; then echo 0; else echo "$out"; fi
}

is_active() {
  local agent="$1" protocol="$2"
  local n
  n=$(sql1 "SELECT COUNT(*) FROM personality_activations WHERE agent_id='$agent' AND protocol_id='$protocol' AND deactivated_at IS NULL;")
  [[ "$n" != "0" ]]
}

count_obs_tag() {
  local agent="$1"
  [[ "$HAS_RG" -eq 1 ]] || { echo 0; return; }
  # sum per-file counts for lines containing #<agent>
  # Explicit file loop avoids ripgrep single-file format edge case
  local total=0
  local files=("$OBS_DIR"/*.md)
  
  # Check if any .md files exist
  if [[ -e "${files[0]}" ]]; then
    for file in "${files[@]}"; do
      if [[ -f "$file" ]]; then
        local count=$(rg --count "#$agent" "$file" 2>/dev/null | head -1 || echo "0")
        total=$((total + count))
      fi
    done
  fi
  
  echo "$total"
}

count_obs_pattern() {
  local agent="$1" tag="$2"
  [[ "$HAS_RG" -eq 1 ]] || { echo 0; return; }
  local agent_lines
  agent_lines=$(rg "#$agent" "$OBS_DIR"/*.md 2>/dev/null || true)
  if [[ -z "$agent_lines" ]]; then
    echo 0
    return
  fi
  # grep -c returns nonzero when 0 matches; suppress that.
  local c
  c=$(printf "%s\n" "$agent_lines" | grep -c "#$tag" 2>/dev/null || true)
  echo "${c:-0}"
}

json() {
  # shell-safe JSON builder via python
  # usage: json key1 val1 key2 val2 ... (vals are treated as JSON scalars when possible)
  python3 - "$@" <<'PY'
import json, sys
args = sys.argv[1:]
out = {}
if len(args) % 2 != 0:
    raise SystemExit("json(): expected even number of args")
for i in range(0, len(args), 2):
    k, v = args[i], args[i+1]
    # Try numeric / bool coercion.
    if v.lower() in ("true","false"):
        out[k] = (v.lower() == "true")
    else:
        try:
            if "." in v:
                out[k] = float(v)
            else:
                out[k] = int(v)
        except Exception:
            out[k] = v
print(json.dumps(out, separators=(",",":"), sort_keys=True))
PY
}

apply_state() {
  local agent="$1" protocol="$2" ptype="$3" should="$4" trigger_json="$5"

  if [[ "$should" == "1" ]]; then
    if is_active "$agent" "$protocol"; then
      log "= keep   $agent → $protocol"
    else
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "+ would-activate $agent → $protocol $trigger_json"
      else
        "$ACTIVATE" --db "$DB_PATH" --agent "$agent" --protocol "$protocol" --type "$ptype" --trigger "$trigger_json" >/dev/null
        log "+ activate $agent → $protocol $trigger_json"
      fi
    fi
  else
    if is_active "$agent" "$protocol"; then
      if [[ "$DRY_RUN" -eq 1 ]]; then
        log "- would-deactivate $agent → $protocol"
      else
        "$DEACTIVATE" --db "$DB_PATH" --agent "$agent" --protocol "$protocol" >/dev/null
        log "- deactivate $agent → $protocol"
      fi
    else
      log "= keep   $agent → $protocol (inactive)"
    fi
  fi
}

agent_list() {
  python3 - "$OVERLAYS_DIR" <<'PY'
import glob, json, os, sys
od = sys.argv[1]
ids = []
for p in glob.glob(os.path.join(od, "*.json")):
    try:
        with open(p, "r", encoding="utf-8") as f:
            j = json.load(f)
        aid = j.get("agent_id")
        if aid:
            ids.append(aid)
    except Exception:
        pass
for aid in sorted(set(ids)):
    print(aid)
PY
}

log "========================================="
log "Protocol Trigger Check Starting"$([[ "$DRY_RUN" -eq 1 ]] && printf " (DRY RUN)" || true)
log "DB_PATH=$DB_PATH"
log "OBS_DIR=$OBS_DIR (rg=$HAS_RG)"
log "OVERLAYS_DIR=$OVERLAYS_DIR"
log "LOG_FILE=$LOG_FILE"
log "========================================="

[[ -d "$OVERLAYS_DIR" ]] || die "OVERLAYS_DIR not found: $OVERLAYS_DIR"

agents=( $(agent_list) )
if [[ "${#agents[@]}" -eq 0 ]]; then
  die "No agents found (expected overlay JSONs with agent_id in $OVERLAYS_DIR)"
fi

# --- Per-agent evaluation ---
for agent in "${agents[@]}"; do
  log "--- agent=$agent ---"

  # Latest psionic snapshot (best-effort)
  IFS='|' read -r mem_count uniq_domains acceptance success appr_acc tasks_completed <<<"$(sqlite3 "$DB_PATH" -noheader -batch "
    SELECT
      COALESCE(memory_count,0),
      COALESCE(unique_domains,0),
      COALESCE(acceptance_rate,0.0),
      COALESCE(success_rate,0.0),
      COALESCE(approval_accuracy,0.0),
      COALESCE(tasks_completed,0)
    FROM psionic_stats
    WHERE agent_id='$agent'
    ORDER BY snapshot_date DESC
    LIMIT 1;
  " 2>/dev/null | tr -d '\r' | tr '\t' '|')"
  mem_count="${mem_count:-0}"
  uniq_domains="${uniq_domains:-0}"
  acceptance="${acceptance:-0}"
  success="${success:-0}"
  appr_acc="${appr_acc:-0}"
  tasks_completed="${tasks_completed:-0}"

  rank=$(sql1 "SELECT COALESCE(rank,0) FROM psionic_ranks WHERE agent_id='$agent' ORDER BY updated_at DESC LIMIT 1;")

  missions_completed=$(sql1 "SELECT COUNT(*) FROM missions WHERE agent_id='$agent' AND status='completed';")

  mission_success_rate=$(sqlite3 "$DB_PATH" -noheader -batch "
    SELECT
      COALESCE(AVG(CASE WHEN success=1 THEN 1.0 WHEN success=0 THEN 0.0 ELSE NULL END), NULL)
    FROM missions
    WHERE agent_id='$agent' AND status='completed' AND success IS NOT NULL;
  " 2>/dev/null | tr -d '\r')
  if [[ -z "${mission_success_rate:-}" || "$mission_success_rate" == "" || "$mission_success_rate" == "NULL" ]]; then
    mission_success_rate="$success"
  fi

  obs_count=$(count_obs_tag "$agent")

  # -----------------
  # Base protocols
  # -----------------

  # 1) reference_outcomes
  ref_metric="$mem_count"
  if [[ "$obs_count" -gt "$ref_metric" ]]; then ref_metric="$obs_count"; fi
  if [[ "$ref_metric" -ge 8 ]]; then
    apply_state "$agent" "reference_outcomes" "base" 1 "$(json observation_or_memory_count "$ref_metric" threshold 8)"
  else
    apply_state "$agent" "reference_outcomes" "base" 0 "$(json observation_or_memory_count "$ref_metric" threshold 8)"
  fi

  # 2) use_frameworks
  should_frameworks=0
  trig_frameworks=""
  if [[ "$HAS_RG" -eq 1 ]]; then
    dbg=$(count_obs_pattern "$agent" "debugging")
    ci=$(count_obs_pattern "$agent" "ci")
    infra=$(count_obs_pattern "$agent" "infrastructure")
    mon=$(count_obs_pattern "$agent" "monitoring")
    framework_patterns=$((dbg + ci + infra + mon))
    trig_frameworks="$(json pattern_count "$framework_patterns" threshold 6 source observations_tags)"
    [[ "$framework_patterns" -ge 6 ]] && should_frameworks=1
  else
    # Fallback proxy until pattern taxonomy is persisted in DB.
    trig_frameworks="$(json unique_domains "$uniq_domains" threshold 6 source unique_domains_proxy)"
    [[ "$uniq_domains" -ge 6 ]] && should_frameworks=1
  fi
  apply_state "$agent" "use_frameworks" "base" "$should_frameworks" "$trig_frameworks"

  # 3) show_confidence
  # Deterministic gate: requires mission volume + sustained quality.
  should_conf=0
  # Compare as floats via python
  if [[ "$(python3 - "$missions_completed" "$mission_success_rate" <<'PY'
import sys
m = int(sys.argv[1])
r = float(sys.argv[2])
print(1 if (m >= 10 and r >= 0.80) else 0)
PY
)" == "1" ]]; then
    should_conf=1
  fi
  apply_state "$agent" "show_confidence" "base" "$should_conf" "$(json missions_completed "$missions_completed" success_rate "$mission_success_rate" threshold_missions 10 threshold_success 0.8)"

  # 4) mentor_mode
  should_mentor=0
  [[ "$rank" -ge 7 ]] && should_mentor=1
  apply_state "$agent" "mentor_mode" "base" "$should_mentor" "$(json rank "$rank" threshold 7)"

  # -----------------
  # Agent-specific protocols (11 total)
  # -----------------

  if [[ "$agent" == "oracle" ]]; then
    research=$(count_obs_pattern "oracle" "research")
    cost=$(count_obs_pattern "oracle" "cost-optimization")
    decisions=$(count_obs_pattern "oracle" "decisions")
    rcount=$((research + cost + decisions))
    should=0
    [[ "$rcount" -ge 5 ]] && should=1
    apply_state "oracle" "cite_precedents" "quality_gate" "$should" "$(json research_observations "$rcount" threshold 5)"
  fi

  if [[ "$agent" == "atlas" ]]; then
    mon=$(count_obs_pattern "atlas" "monitoring")
    infra=$(count_obs_pattern "atlas" "infrastructure")
    mcount=$((mon + infra))
    should=0
    [[ "$mcount" -ge 3 ]] && should=1
    apply_state "atlas" "proactive_monitoring" "quality_gate" "$should" "$(json monitoring_implementations "$mcount" threshold 3)"
  fi

  if [[ "$agent" == "sentinel" ]]; then
    validated_30d=$(sql1 "SELECT COUNT(*) FROM escalations WHERE escalated_by='sentinel' AND validated_as_real IS NOT NULL AND created_at >= datetime('now','-30 days');")
    false_30d=$(sql1 "SELECT COUNT(*) FROM escalations WHERE escalated_by='sentinel' AND validated_as_real = 0 AND created_at >= datetime('now','-30 days');")
    true_30d=$(sql1 "SELECT COUNT(*) FROM escalations WHERE escalated_by='sentinel' AND validated_as_real = 1 AND created_at >= datetime('now','-30 days');")

    # false_positive_cooldown: activate on FP streak / volume.
    should_fp=0
    if [[ "$validated_30d" -ge 3 && "$false_30d" -ge 3 ]]; then
      should_fp=1
    fi
    apply_state "sentinel" "false_positive_cooldown" "quality_gate" "$should_fp" "$(json window_days 30 validated_escalations "$validated_30d" false_positives "$false_30d" threshold_false_positives 3)"

    # escalation_quality_mode: activate when signal ratio degrades.
    # Anti-gaming: require enough sample size.
    should_eq=0
    signal_ratio=$(python3 - "$true_30d" "$validated_30d" <<'PY'
import sys
true = int(sys.argv[1])
tot = int(sys.argv[2])
print(0.0 if tot <= 0 else true / tot)
PY
    )
    if [[ "$(python3 - "$validated_30d" "$signal_ratio" <<'PY'
import sys
n = int(sys.argv[1]); r = float(sys.argv[2])
print(1 if (n >= 5 and r < 0.70) else 0)
PY
)" == "1" ]]; then
      should_eq=1
    fi
    apply_state "sentinel" "escalation_quality_mode" "quality_gate" "$should_eq" "$(json window_days 30 validated_escalations "$validated_30d" true_positives "$true_30d" signal_ratio "$signal_ratio" threshold_ratio 0.7)"
  fi

  if [[ "$agent" == "synth" ]]; then
    ci=$(count_obs_pattern "synth" "ci")
    testing=$(count_obs_pattern "synth" "testing")
    pipe=$(count_obs_pattern "synth" "pipeline")
    cicount=$((ci + testing + pipe))
    should=0
    # gate on acceptance floor too (prevents activating from noisy logs only)
    if [[ "$(python3 - "$cicount" "$acceptance" <<'PY'
import sys
c = int(sys.argv[1])
a = float(sys.argv[2])
print(1 if (c >= 5 and a >= 0.70) else 0)
PY
)" == "1" ]]; then
      should=1
    fi
    apply_state "synth" "test_first_discipline" "quality_gate" "$should" "$(json ci_events "$cicount" threshold_ci 5 acceptance_rate "$acceptance" threshold_acceptance 0.7)"

    reviews=$(sql1 "SELECT COUNT(*) FROM missions WHERE agent_id='synth' AND status='completed' AND mission_type IN ('code_review','mr_review','review');")
    should2=0
    if [[ "$(python3 - "$reviews" "$appr_acc" <<'PY'
import sys
r = int(sys.argv[1])
a = float(sys.argv[2])
print(1 if (r >= 10 and a >= 0.85) else 0)
PY
)" == "1" ]]; then
      should2=1
    fi
    apply_state "synth" "code_review_checklist" "quality_gate" "$should2" "$(json review_count "$reviews" threshold_reviews 10 approval_accuracy "$appr_acc" threshold_accuracy 0.85)"
  fi

  if [[ "$agent" == "nexus" ]]; then
    handoff=$(count_obs_pattern "nexus" "handoff")
    prio=$(count_obs_pattern "nexus" "priorities")
    deleg=$(count_obs_pattern "nexus" "delegation")
    dispatch=$(count_obs_pattern "nexus" "dispatch")
    dcount=$((handoff + prio + deleg + dispatch))
    should=0
    [[ "$dcount" -ge 5 ]] && should=1
    apply_state "nexus" "autonomous_delegation" "quality_gate" "$should" "$(json delegations "$dcount" threshold 5)"

    p0=$(count_obs_pattern "nexus" "p0")
    p1=$(count_obs_pattern "nexus" "p1")
    p2=$(count_obs_pattern "nexus" "p2")
    triage=$(count_obs_pattern "nexus" "triage")
    pcount=$((prio + p0 + p1 + p2 + triage))
    should2=0
    [[ "$pcount" -ge 8 ]] && should2=1
    apply_state "nexus" "priority_stack_enforcement" "quality_gate" "$should2" "$(json priority_events "$pcount" threshold 8)"
  fi

  if [[ "$agent" == "archivist" ]]; then
    doc=$(count_obs_pattern "archivist" "documentation")
    policy=$(count_obs_pattern "archivist" "policy")
    memory=$(count_obs_pattern "archivist" "memory")
    obsm=$(count_obs_pattern "archivist" "observational-memory")
    cron=$(count_obs_pattern "archivist" "cron")
    dcount=$((doc + policy + memory + obsm + cron))
    should=0
    [[ "$dcount" -ge 5 ]] && should=1
    apply_state "archivist" "proactive_documentation" "quality_gate" "$should" "$(json documentation_events "$dcount" threshold 5)"

    pattern=$(count_obs_pattern "archivist" "pattern")
    insight=$(count_obs_pattern "archivist" "insight")
    lesson=$(count_obs_pattern "archivist" "lesson-learned")
    taxonomy=$(count_obs_pattern "archivist" "taxonomy")
    pcount=$((pattern + insight + lesson + taxonomy))
    should2=0
    [[ "$pcount" -ge 8 ]] && should2=1
    apply_state "archivist" "pattern_extraction" "quality_gate" "$should2" "$(json pattern_identifications "$pcount" threshold 8)"
  fi

  if [[ "$agent" == "verifier" ]]; then
    reviews=$(sql1 "SELECT COUNT(*) FROM missions WHERE agent_id='verifier' AND status='completed' AND mission_type IN ('approval','validation','review');")
    should=0
    if [[ "$(python3 - "$reviews" "$appr_acc" <<'PY'
import sys
r = int(sys.argv[1])
a = float(sys.argv[2])
print(1 if (r >= 20 and a >= 0.90) else 0)
PY
)" == "1" ]]; then
      should=1
    fi
    apply_state "verifier" "context_requirement_enforcement" "quality_gate" "$should" "$(json review_count "$reviews" threshold_reviews 20 approval_accuracy "$appr_acc" threshold_accuracy 0.9)"
  fi

  # Note: other agents (oracle/atlas/etc) only evaluate the base protocols unless explicitly listed above.

done

log "========================================="
log "Protocol Trigger Check Complete"$([[ "$DRY_RUN" -eq 1 ]] && printf " (DRY RUN)" || true)
log "Log: $LOG_FILE"
log "========================================="
