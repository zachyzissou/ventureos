#!/usr/bin/env bash
set -euo pipefail

LIMIT=30
MERGE_APPROVED=0
DRY_RUN=0
JSON_OUT=""

usage() {
  cat <<'EOF_USAGE'
pr-queue-sweep.sh

Usage:
  bash scripts/pr-queue-sweep.sh [options]

Options:
  --limit <n>          Number of open PRs to inspect (default: 30)
  --merge-approved     Merge PRs that are approved + merge-ready
  --dry-run            Print merge actions without executing
  --json-out <path>    Write queue classification JSON report
  -h, --help           Show help

Environment:
  PR_QUEUE_FIXTURE_JSON
    Optional path to JSON payload (same shape as gh pr list --json output)
    for deterministic testing.
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

const payload = { summary, prs: classified };
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

const mergeReady = classified
  .filter((r) => r.queueState === "approved-merge-ready")
  .map((r) => String(r.number));

fs.writeFileSync(mergePath, mergeReady.join("\n"), "utf8");
NODE

echo "PR Queue Summary"
echo "  total_open:          $(jq -r '.summary.totalOpen' "$CLASSIFIED_JSON")"
echo "  draft:               $(jq -r '.summary.draft' "$CLASSIFIED_JSON")"
echo "  review_needed:       $(jq -r '.summary.reviewNeeded' "$CLASSIFIED_JSON")"
echo "  approved_merge_ready:$(jq -r '.summary.approvedMergeReady' "$CLASSIFIED_JSON")"
echo "  approved_blocked:    $(jq -r '.summary.approvedBlocked' "$CLASSIFIED_JSON")"

echo ""
echo "PR Queue Detail"
jq -r '.prs[] | "#\(.number)\t\(.queueState)\t\(.mergeStateStatus)\t\(.reviewDecision)\t\(.title)"' "$CLASSIFIED_JSON"

if [[ -n "$JSON_OUT" ]]; then
  mkdir -p "$(dirname "$JSON_OUT")"
  cp "$CLASSIFIED_JSON" "$JSON_OUT"
  echo ""
  echo "JSON report: $JSON_OUT"
fi

if [[ "$MERGE_APPROVED" == "1" ]]; then
  while IFS= read -r pr_number || [[ -n "$pr_number" ]]; do
    [[ -z "$pr_number" ]] && continue
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "[dry-run] would merge PR #$pr_number"
      continue
    fi
    echo "Merging PR #$pr_number ..."
    gh pr merge "$pr_number" --merge --delete-branch
  done < "$MERGE_LIST"
fi

echo "PR_QUEUE_SWEEP_DONE"
