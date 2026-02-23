#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER=""
JSON_OUT=""

usage() {
  cat <<'EOF_USAGE'
pr-merge-readiness.sh

Usage:
  bash scripts/pr-merge-readiness.sh --pr <number> [options]

Options:
  --pr <number>         Pull request number to evaluate
  --json-out <path>     Write machine-readable readiness payload
  -h, --help            Show help

Environment:
  PR_MERGE_READINESS_FIXTURE_JSON
    Optional path to JSON payload (same shape as `gh pr view --json ...`)
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
    --pr)
      need_value "$@"
      PR_NUMBER="$2"
      shift 2
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

if ! [[ "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  echo "Invalid --pr value: '$PR_NUMBER' (expected numeric PR number)" >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
RAW_JSON="$TMP_DIR/pr.json"
ANALYSIS_JSON="$TMP_DIR/analysis.json"

if [[ -n "${PR_MERGE_READINESS_FIXTURE_JSON:-}" ]]; then
  cp "$PR_MERGE_READINESS_FIXTURE_JSON" "$RAW_JSON"
else
  gh pr view "$PR_NUMBER" \
    --json number,title,url,state,isDraft,reviewDecision,mergeStateStatus,author,baseRefName,headRefName,statusCheckRollup \
    > "$RAW_JSON"
fi

node - "$RAW_JSON" "$ANALYSIS_JSON" <<'NODE'
const fs = require("node:fs");

const rawPath = process.argv[2];
const outPath = process.argv[3];
const pr = JSON.parse(fs.readFileSync(rawPath, "utf8"));

const state = String(pr.state || "UNKNOWN").toUpperCase();
const reviewDecision = String(pr.reviewDecision || "").toUpperCase();
const mergeStateStatus = String(pr.mergeStateStatus || "").toUpperCase();

const checksRaw = Array.isArray(pr.statusCheckRollup) ? pr.statusCheckRollup : [];
const checks = checksRaw
  .map((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return null;
    const status = String(item?.status || "UNKNOWN").toUpperCase();
    const conclusion = String(item?.conclusion || "").toUpperCase();
    const workflowName = String(item?.workflowName || "");
    const detailsUrl = String(item?.detailsUrl || "");
    return { name, status, conclusion, workflowName, detailsUrl };
  })
  .filter(Boolean);

const blockers = [];
const blocker = (id, summary, nextCommand, meta = {}) => ({
  id,
  summary,
  nextCommand,
  ...meta,
});

if (state !== "OPEN") {
  blockers.push(
    blocker(
      "pr-not-open",
      `PR state is ${state}; merge readiness check is only meaningful for OPEN PRs`,
      `gh pr view ${pr.number}`
    )
  );
}

if (pr.isDraft === true) {
  blockers.push(
    blocker(
      "draft-pr",
      "PR is draft and cannot be merged",
      `gh pr ready ${pr.number}`
    )
  );
}

if (reviewDecision !== "APPROVED") {
  blockers.push(
    blocker(
      "approval-required",
      "At least one approving review is still required",
      `gh pr review ${pr.number} --approve`
    )
  );
}

const pendingChecks = checks.filter(
  (check) => check.status !== "COMPLETED" || check.conclusion === ""
);
const failingChecks = checks.filter((check) => {
  if (check.status !== "COMPLETED") return false;
  return !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion);
});

if (pendingChecks.length > 0) {
  const names = pendingChecks.map((check) => check.name).join(", ");
  blockers.push(
    blocker(
      "checks-pending",
      `Required/linked checks still in progress: ${names}`,
      `gh pr checks ${pr.number}`
    )
  );
}

if (failingChecks.length > 0) {
  const names = failingChecks.map((check) => `${check.name}:${check.conclusion}`).join(", ");
  blockers.push(
    blocker(
      "checks-failing",
      `Failing checks detected: ${names}`,
      `gh pr checks ${pr.number}`
    )
  );
}

if (blockers.length === 0 && !["CLEAN", "HAS_HOOKS"].includes(mergeStateStatus)) {
  blockers.push(
    blocker(
      "merge-state-blocked",
      `GitHub merge state is ${mergeStateStatus || "UNKNOWN"}`,
      `gh pr view ${pr.number} --json mergeStateStatus,reviewDecision,statusCheckRollup`
    )
  );
}

const status = blockers.length === 0 ? "merge-ready" : "blocked";
const exitCode = blockers.length === 0 ? 0 : 3;
const summary = {
  number: pr.number,
  title: pr.title || "",
  url: pr.url || "",
  author: pr.author?.login || "",
  baseRefName: pr.baseRefName || "",
  headRefName: pr.headRefName || "",
  state,
  isDraft: Boolean(pr.isDraft),
  reviewDecision,
  mergeStateStatus,
  checks: {
    total: checks.length,
    pending: pendingChecks.length,
    failing: failingChecks.length,
    passing: checks.filter((check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS").length,
  },
  status,
  exitCode,
  blockers,
  recommendedNextAction:
    blockers.length > 0 ? blockers[0].nextCommand : `gh pr merge ${pr.number} --merge --delete-branch`,
};

fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
NODE

echo "PR Merge Readiness"
echo "  pr:               #$(jq -r '.number' "$ANALYSIS_JSON")"
echo "  title:            $(jq -r '.title' "$ANALYSIS_JSON")"
echo "  status:           $(jq -r '.status' "$ANALYSIS_JSON")"
echo "  merge_state:      $(jq -r '.mergeStateStatus' "$ANALYSIS_JSON")"
echo "  review_decision:  $(jq -r '.reviewDecision' "$ANALYSIS_JSON")"
echo "  checks(total):    $(jq -r '.checks.total' "$ANALYSIS_JSON")"
echo "  checks(pending):  $(jq -r '.checks.pending' "$ANALYSIS_JSON")"
echo "  checks(failing):  $(jq -r '.checks.failing' "$ANALYSIS_JSON")"

echo ""
echo "Blockers"
jq -r '
  if (.blockers | length) == 0 then
    "- none"
  else
    .blockers[] | "- \(.id): \(.summary) -> next: \(.nextCommand)"
  end
' "$ANALYSIS_JSON"

echo ""
echo "Recommended Next Action"
echo "  $(jq -r '.recommendedNextAction' "$ANALYSIS_JSON")"

if [[ -n "$JSON_OUT" ]]; then
  mkdir -p "$(dirname "$JSON_OUT")"
  cp "$ANALYSIS_JSON" "$JSON_OUT"
  echo ""
  echo "JSON report: $JSON_OUT"
fi

echo "PR_MERGE_READINESS_STATUS=$(jq -r '.status' "$ANALYSIS_JSON")"
echo "PR_MERGE_READINESS_DONE"
exit "$(jq -r '.exitCode' "$ANALYSIS_JSON")"
