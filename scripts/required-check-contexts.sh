#!/usr/bin/env bash
set -euo pipefail

PR_NUMBER=""
JSON_OUT=""

usage() {
  cat <<'EOF_USAGE'
required-check-contexts.sh

Usage:
  bash scripts/required-check-contexts.sh --pr <number> [options]

Options:
  --pr <number>         Pull request number to audit
  --json-out <path>     Write machine-readable audit payload
  -h, --help            Show help

Environment (fixture mode for tests):
  REQUIRED_CHECKS_FIXTURE_JSON   Path to required_status_checks JSON fixture
  PR_HEAD_FIXTURE_JSON           Path to PR head/base JSON fixture
  COMMIT_STATUS_FIXTURE_JSON     Path to commit status JSON fixture
  CHECK_RUNS_FIXTURE_JSON        Path to check-runs JSON fixture
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

PR_JSON="$TMP_DIR/pr.json"
REQUIRED_JSON="$TMP_DIR/required.json"
COMMIT_STATUS_JSON="$TMP_DIR/commit-status.json"
CHECK_RUNS_JSON="$TMP_DIR/check-runs.json"
AUDIT_JSON="$TMP_DIR/audit.json"

if [[ -n "${PR_HEAD_FIXTURE_JSON:-}" ]]; then
  cp "$PR_HEAD_FIXTURE_JSON" "$PR_JSON"
else
  gh pr view "$PR_NUMBER" --json number,url,baseRefName,headRefOid,state > "$PR_JSON"
fi

base_ref="$(jq -r '.baseRefName // empty' "$PR_JSON")"
head_sha="$(jq -r '.headRefOid // empty' "$PR_JSON")"
pr_url="$(jq -r '.url // empty' "$PR_JSON")"
pr_state="$(jq -r '.state // ""' "$PR_JSON")"

if [[ -z "$base_ref" || -z "$head_sha" ]]; then
  echo "Failed to resolve PR base/head data for PR #$PR_NUMBER" >&2
  exit 2
fi

if [[ -n "${REQUIRED_CHECKS_FIXTURE_JSON:-}" ]]; then
  cp "$REQUIRED_CHECKS_FIXTURE_JSON" "$REQUIRED_JSON"
else
  repo_name="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
  gh api "repos/$repo_name/branches/$base_ref/protection" --jq '.required_status_checks' > "$REQUIRED_JSON"
fi

if [[ -n "${COMMIT_STATUS_FIXTURE_JSON:-}" ]]; then
  cp "$COMMIT_STATUS_FIXTURE_JSON" "$COMMIT_STATUS_JSON"
else
  repo_name="${repo_name:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
  gh api "repos/$repo_name/commits/$head_sha/status" > "$COMMIT_STATUS_JSON"
fi

if [[ -n "${CHECK_RUNS_FIXTURE_JSON:-}" ]]; then
  cp "$CHECK_RUNS_FIXTURE_JSON" "$CHECK_RUNS_JSON"
else
  repo_name="${repo_name:-$(gh repo view --json nameWithOwner --jq '.nameWithOwner')}"
  gh api "repos/$repo_name/commits/$head_sha/check-runs" -H "Accept: application/vnd.github+json" > "$CHECK_RUNS_JSON"
fi

python3 - "$PR_NUMBER" "$pr_url" "$pr_state" "$base_ref" "$head_sha" "$REQUIRED_JSON" "$COMMIT_STATUS_JSON" "$CHECK_RUNS_JSON" "$AUDIT_JSON" <<'PY'
from __future__ import annotations

import json
import pathlib
import sys
from collections import OrderedDict

pr_number = int(sys.argv[1])
pr_url = sys.argv[2]
pr_state = sys.argv[3]
base_ref = sys.argv[4]
head_sha = sys.argv[5]
required_path = pathlib.Path(sys.argv[6])
commit_status_path = pathlib.Path(sys.argv[7])
check_runs_path = pathlib.Path(sys.argv[8])
out_path = pathlib.Path(sys.argv[9])

required_payload = json.loads(required_path.read_text(encoding="utf-8"))
commit_status_payload = json.loads(commit_status_path.read_text(encoding="utf-8"))
check_runs_payload = json.loads(check_runs_path.read_text(encoding="utf-8"))

required_contexts: list[str] = []
if isinstance(required_payload, dict):
    contexts = required_payload.get("contexts")
    if isinstance(contexts, list):
        for c in contexts:
            if isinstance(c, str) and c.strip():
                required_contexts.append(c.strip())
    checks = required_payload.get("checks")
    if isinstance(checks, list):
        for row in checks:
            if isinstance(row, dict):
                c = row.get("context")
                if isinstance(c, str) and c.strip():
                    required_contexts.append(c.strip())
required_contexts = list(OrderedDict((c, None) for c in required_contexts).keys())

statuses = []
if isinstance(commit_status_payload, dict):
    raw_statuses = commit_status_payload.get("statuses")
    if isinstance(raw_statuses, list):
        statuses = [row for row in raw_statuses if isinstance(row, dict)]

check_runs = []
if isinstance(check_runs_payload, dict):
    raw_check_runs = check_runs_payload.get("check_runs")
    if isinstance(raw_check_runs, list):
        check_runs = [row for row in raw_check_runs if isinstance(row, dict)]

def classify_from_status(state: str) -> str:
    state = (state or "").lower()
    if state == "success":
        return "pass"
    if state in {"pending"}:
        return "pending"
    return "fail"

def classify_from_check(status: str, conclusion: str) -> str:
    status = (status or "").upper()
    conclusion = (conclusion or "").upper()
    if status != "COMPLETED":
        return "pending"
    if conclusion in {"SUCCESS", "NEUTRAL", "SKIPPED"}:
        return "pass"
    return "fail"

rows = []
for context in required_contexts:
    matched_status = next((row for row in statuses if str(row.get("context", "")) == context), None)
    if matched_status:
        result = classify_from_status(str(matched_status.get("state", "")))
        rows.append(
            {
                "context": context,
                "source": "commit-status",
                "result": result,
                "state": str(matched_status.get("state", "")),
                "detailsUrl": str(matched_status.get("target_url", "")),
            }
        )
        continue

    matched_check = next((row for row in check_runs if str(row.get("name", "")) == context), None)
    if matched_check:
        result = classify_from_check(str(matched_check.get("status", "")), str(matched_check.get("conclusion", "")))
        rows.append(
            {
                "context": context,
                "source": "check-run",
                "result": result,
                "state": str(matched_check.get("status", "")),
                "conclusion": str(matched_check.get("conclusion", "")),
                "detailsUrl": str(matched_check.get("details_url", "")),
            }
        )
        continue

    rows.append(
        {
            "context": context,
            "source": "missing",
            "result": "missing",
            "state": "",
            "detailsUrl": "",
        }
    )

missing = [row for row in rows if row["result"] == "missing"]
failing = [row for row in rows if row["result"] == "fail"]
pending = [row for row in rows if row["result"] == "pending"]
passing = [row for row in rows if row["result"] == "pass"]

if missing:
    status = "missing-contexts"
    exit_code = 3
elif failing or pending:
    status = "aligned-not-ready"
    exit_code = 4
else:
    status = "aligned-ready"
    exit_code = 0

if status == "missing-contexts":
    next_action = "Align branch protection required contexts with emitted check contexts"
elif status == "aligned-not-ready":
    next_action = "Fix or wait for required checks to reach success"
else:
    next_action = f"Merge eligible for PR #{pr_number}"

payload = {
    "pr": {
        "number": pr_number,
        "url": pr_url,
        "state": pr_state,
        "baseRef": base_ref,
        "headSha": head_sha,
    },
    "requiredContexts": required_contexts,
    "status": status,
    "exitCode": exit_code,
    "summary": {
        "required": len(required_contexts),
        "passing": len(passing),
        "pending": len(pending),
        "failing": len(failing),
        "missing": len(missing),
    },
    "rows": rows,
    "recommendedNextAction": next_action,
}

out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
PY

echo "Required Check Context Audit"
echo "  pr:               #$(jq -r '.pr.number' "$AUDIT_JSON")"
echo "  status:           $(jq -r '.status' "$AUDIT_JSON")"
echo "  required:         $(jq -r '.summary.required' "$AUDIT_JSON")"
echo "  passing:          $(jq -r '.summary.passing' "$AUDIT_JSON")"
echo "  pending:          $(jq -r '.summary.pending' "$AUDIT_JSON")"
echo "  failing:          $(jq -r '.summary.failing' "$AUDIT_JSON")"
echo "  missing:          $(jq -r '.summary.missing' "$AUDIT_JSON")"

echo ""
echo "Context Detail"
jq -r '.rows[] | "- \(.context): \(.result) (source=\(.source))"' "$AUDIT_JSON"

echo ""
echo "Recommended Next Action"
echo "  $(jq -r '.recommendedNextAction' "$AUDIT_JSON")"

if [[ -n "$JSON_OUT" ]]; then
  mkdir -p "$(dirname "$JSON_OUT")"
  cp "$AUDIT_JSON" "$JSON_OUT"
  echo ""
  echo "JSON report: $JSON_OUT"
fi

echo "REQUIRED_CHECK_CONTEXT_STATUS=$(jq -r '.status' "$AUDIT_JSON")"
echo "REQUIRED_CHECK_CONTEXT_AUDIT_DONE"
exit "$(jq -r '.exitCode' "$AUDIT_JSON")"
