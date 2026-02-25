#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LIMIT=30
MERGE_APPROVED=0
DRY_RUN=0
JSON_OUT=""
REPORT_DIR="${PR_QUEUE_REPORT_DIR:-$REPO_ROOT/runtime/reports/pr-queue}"
READINESS_SCRIPT="${PR_QUEUE_READINESS_SCRIPT:-$REPO_ROOT/scripts/pr-merge-readiness.sh}"
REQUIRED_CHECKS_SCRIPT="${PR_QUEUE_REQUIRED_CHECKS_SCRIPT:-$REPO_ROOT/scripts/required-check-contexts.sh}"

usage() {
  cat <<'EOF_USAGE'
pr-queue-sweep.sh

Usage:
  bash scripts/pr-queue-sweep.sh [options]

Options:
  --limit <n>          Number of open PRs to inspect (default: 30)
  --merge-approved     Merge PRs that are approved + merge-ready
  --dry-run            Print merge actions without executing
  --report-dir <path>  Evidence/report directory (default: runtime/reports/pr-queue)
  --json-out <path>    Write queue classification JSON report
  -h, --help           Show help

Environment:
  PR_QUEUE_FIXTURE_JSON
    Optional path to JSON payload (same shape as gh pr list --json output)
    for deterministic testing.
  PR_QUEUE_READINESS_SCRIPT
    Optional override path for readiness script (default: scripts/pr-merge-readiness.sh).
  PR_QUEUE_REQUIRED_CHECKS_SCRIPT
    Optional override path for required-check audit script (default: scripts/required-check-contexts.sh).
EOF_USAGE
}

need_value() {
  if [[ $# -lt 2 ]]; then
    echo "Missing value for $1" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      need_value "$@"
      LIMIT="$2"
      shift 2
      ;;
    --merge-approved)
      MERGE_APPROVED=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --json-out)
      need_value "$@"
      JSON_OUT="$2"
      shift 2
      ;;
    --report-dir)
      need_value "$@"
      REPORT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 ]]; then
  echo "Invalid --limit: $LIMIT" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
RAW_JSON="$TMP_DIR/prs.json"
CLASSIFIED_JSON="$TMP_DIR/classified.json"
MERGE_LIST="$TMP_DIR/merge-ready.txt"
MERGE_RESULTS_TSV="$TMP_DIR/merge-results.tsv"
MERGE_RESULTS_JSON="$TMP_DIR/merge-results.json"
FINAL_JSON="$TMP_DIR/final.json"

if [[ -n "${PR_QUEUE_FIXTURE_JSON:-}" ]]; then
  cp "$PR_QUEUE_FIXTURE_JSON" "$RAW_JSON"
else
  gh pr list --state open --limit "$LIMIT" \
    --json number,title,url,isDraft,reviewDecision,mergeStateStatus,headRefName,baseRefName,author \
    > "$RAW_JSON"
fi

node - "$RAW_JSON" "$CLASSIFIED_JSON" "$MERGE_LIST" <<'NODE'
const fs = require("node:fs");

const rawPath = process.argv[2];
const outPath = process.argv[3];
const mergePath = process.argv[4];

const rows = JSON.parse(fs.readFileSync(rawPath, "utf8"));

const mergeReadyStates = new Set(["CLEAN", "HAS_HOOKS"]);
const blockedStates = new Set(["BLOCKED", "DIRTY", "UNKNOWN", "UNSTABLE"]);

function classify(pr) {
  if (pr.isDraft) return "draft";
  if (String(pr.reviewDecision || "").toUpperCase() !== "APPROVED") return "review-needed";
  if (mergeReadyStates.has(String(pr.mergeStateStatus || "").toUpperCase())) return "approved-merge-ready";
  if (blockedStates.has(String(pr.mergeStateStatus || "").toUpperCase())) return "approved-blocked";
  return "approved-blocked";
}

const classified = rows.map((pr) => ({
  number: pr.number,
  title: pr.title,
  url: pr.url,
  reviewDecision: pr.reviewDecision || "",
  mergeStateStatus: pr.mergeStateStatus || "",
  isDraft: Boolean(pr.isDraft),
  headRefName: pr.headRefName || "",
  baseRefName: pr.baseRefName || "",
  author: pr.author?.login || "",
  queueState: classify(pr),
}));

const summary = {
  totalOpen: classified.length,
  draft: classified.filter((r) => r.queueState === "draft").length,
  reviewNeeded: classified.filter((r) => r.queueState === "review-needed").length,
  approvedMergeReady: classified.filter((r) => r.queueState === "approved-merge-ready").length,
  approvedBlocked: classified.filter((r) => r.queueState === "approved-blocked").length,
};

let queueStatus = "quiet";
let recommendedAction = "No immediate queue action required.";
if (summary.totalOpen === 0) {
  queueStatus = "empty";
  recommendedAction = "No open PRs in queue.";
} else if (summary.approvedMergeReady > 0) {
  queueStatus = "merge-ready";
  recommendedAction = "Run queue merge sweep to merge approved + green PRs.";
} else if (summary.approvedBlocked > 0) {
  queueStatus = "blocked";
  recommendedAction = "Resolve blocker conditions on approved PRs.";
} else if (summary.reviewNeeded > 0) {
  queueStatus = "review-needed";
  recommendedAction = "Request/complete reviews for queued PRs.";
}

summary.queueStatus = queueStatus;
summary.recommendedAction = recommendedAction;

const payload = { summary, prs: classified };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

const mergeReady = classified
  .filter((r) => r.queueState === "approved-merge-ready")
  .map((r) => String(r.number));

fs.writeFileSync(mergePath, mergeReady.join("\n"), "utf8");
NODE

cp "$CLASSIFIED_JSON" "$FINAL_JSON"

echo "PR Queue Summary"
echo "  total_open:          $(jq -r '.summary.totalOpen' "$CLASSIFIED_JSON")"
echo "  draft:               $(jq -r '.summary.draft' "$CLASSIFIED_JSON")"
echo "  review_needed:       $(jq -r '.summary.reviewNeeded' "$CLASSIFIED_JSON")"
echo "  approved_merge_ready:$(jq -r '.summary.approvedMergeReady' "$CLASSIFIED_JSON")"
echo "  approved_blocked:    $(jq -r '.summary.approvedBlocked' "$CLASSIFIED_JSON")"
echo "  queue_status:        $(jq -r '.summary.queueStatus' "$CLASSIFIED_JSON")"
echo "  next_action:         $(jq -r '.summary.recommendedAction' "$CLASSIFIED_JSON")"

echo ""
echo "PR Queue Detail"
jq -r '.prs[] | "#\(.number)\t\(.queueState)\t\(.mergeStateStatus)\t\(.reviewDecision)\t\(.title)"' "$CLASSIFIED_JSON"

if [[ "$MERGE_APPROVED" == "1" ]]; then
  timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
  merge_report_dir="$REPORT_DIR/$timestamp_utc"
  readiness_out_dir="$merge_report_dir/pr-merge-readiness"
  required_out_dir="$merge_report_dir/pr-required-checks"
  mkdir -p "$readiness_out_dir" "$required_out_dir"
  : > "$MERGE_RESULTS_TSV"

  while IFS= read -r pr_number || [[ -n "$pr_number" ]]; do
    [[ -z "$pr_number" ]] && continue

    readiness_json="$readiness_out_dir/pr-$pr_number.json"
    required_json="$required_out_dir/pr-$pr_number.json"

    readiness_rc=0
    required_rc=0
    if bash "$READINESS_SCRIPT" --pr "$pr_number" --json-out "$readiness_json" >/tmp/pr-queue-readiness-"$pr_number".out 2>&1; then
      readiness_rc=0
    else
      readiness_rc=$?
    fi
    if bash "$REQUIRED_CHECKS_SCRIPT" --pr "$pr_number" --json-out "$required_json" >/tmp/pr-queue-required-"$pr_number".out 2>&1; then
      required_rc=0
    else
      required_rc=$?
    fi

    if [[ "$readiness_rc" -ne 0 || "$required_rc" -ne 0 ]]; then
      echo "SKIP merge PR #$pr_number :: readiness evidence not green (readiness_rc=$readiness_rc required_rc=$required_rc)"
      printf '%s\t%s\t%s\t%s\t%s\n' "$pr_number" "$readiness_rc" "$required_rc" "blocked" "$readiness_json" >> "$MERGE_RESULTS_TSV"
      continue
    fi

    if [[ "$DRY_RUN" == "1" ]]; then
      echo "[dry-run] would merge PR #$pr_number"
      printf '%s\t%s\t%s\t%s\t%s\n' "$pr_number" "$readiness_rc" "$required_rc" "dry-run" "$readiness_json" >> "$MERGE_RESULTS_TSV"
      continue
    fi
    echo "Merging PR #$pr_number ..."
    gh pr merge "$pr_number" --merge --delete-branch
    printf '%s\t%s\t%s\t%s\t%s\n' "$pr_number" "$readiness_rc" "$required_rc" "merged" "$readiness_json" >> "$MERGE_RESULTS_TSV"
  done < "$MERGE_LIST"

  python3 - "$MERGE_RESULTS_TSV" "$MERGE_RESULTS_JSON" "$merge_report_dir" "$DRY_RUN" <<'PY'
import csv
import json
import pathlib
import sys
from datetime import datetime, timezone

rows_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
report_dir = pathlib.Path(sys.argv[3])
dry_run = sys.argv[4] == "1"

rows = []
if rows_path.exists():
    with rows_path.open("r", encoding="utf-8") as fh:
        reader = csv.reader(fh, delimiter="\t")
        for row in reader:
            if len(row) != 5:
                continue
            rows.append({
                "number": int(row[0]),
                "readinessExitCode": int(row[1]),
                "requiredChecksExitCode": int(row[2]),
                "action": row[3],
                "readinessJson": row[4],
            })

summary = {
    "totalCandidates": len(rows),
    "merged": sum(1 for row in rows if row["action"] == "merged"),
    "dryRun": sum(1 for row in rows if row["action"] == "dry-run"),
    "blocked": sum(1 for row in rows if row["action"] == "blocked"),
}
if summary["blocked"] > 0:
    status = "blocked"
elif summary["merged"] > 0 or summary["dryRun"] > 0:
    status = "ready-executed"
else:
    status = "no-candidates"

payload = {
    "generatedAtUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "status": status,
    "dryRun": dry_run,
    "reportDir": str(report_dir),
    "summary": summary,
    "results": rows,
}
out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

  jq --slurpfile mergeExec "$MERGE_RESULTS_JSON" '. + { mergeExecution: $mergeExec[0] }' "$FINAL_JSON" > "$TMP_DIR/final-merged.json"
  mv "$TMP_DIR/final-merged.json" "$FINAL_JSON"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "Merge mode: dry-run with readiness evidence capture."
  else
    echo "Merge mode: executed with readiness evidence capture."
  fi
  echo "Merge evidence dir: $merge_report_dir"
fi

if [[ -n "$JSON_OUT" ]]; then
  mkdir -p "$(dirname "$JSON_OUT")"
  cp "$FINAL_JSON" "$JSON_OUT"
  echo ""
  echo "JSON report: $JSON_OUT"
fi

echo "PR_QUEUE_STATUS=$(jq -r '.summary.queueStatus' "$FINAL_JSON")"
if [[ "$MERGE_APPROVED" == "1" ]]; then
  echo "PR_QUEUE_MERGE_EXECUTION_STATUS=$(jq -r '.mergeExecution.status' "$FINAL_JSON")"
fi
echo "PR_QUEUE_SWEEP_DONE"
