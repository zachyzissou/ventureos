#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/roadmap-status-sync.py"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

README_FIXTURE="$TMP_DIR/README.md"
ROADMAP_FIXTURE="$TMP_DIR/roadmap.md"
ISSUES_FIXTURE="$TMP_DIR/issues.json"

cat > "$README_FIXTURE" <<'EOF_README'
# Sample README

Roadmap pointer: https://github.com/zachyzissou/ventureos/issues/138

### Now (active)
- #453 Merge hygiene
- #451 Roadmap sync automation

### Next
- #452 Docs lint signal quality
EOF_README

cat > "$ROADMAP_FIXTURE" <<'EOF_ROADMAP'
## VentureOS Roadmap (Living)

## Now (Active)
- [ ] #453 PR merge hygiene
- [ ] #451 Roadmap status sync

## Next
- [ ] #452 Docs lint
EOF_ROADMAP

cat > "$ISSUES_FIXTURE" <<'EOF_ISSUES'
[
  {"number": 451, "state": "OPEN", "title": "Roadmap status sync"},
  {"number": 452, "state": "OPEN", "title": "Docs lint"},
  {"number": 453, "state": "OPEN", "title": "PR merge hygiene"}
]
EOF_ISSUES

python3 "$SCRIPT" \
  --readme "$README_FIXTURE" \
  --roadmap-body-file "$ROADMAP_FIXTURE" \
  --issues-json "$ISSUES_FIXTURE" \
  > "$TMP_DIR/pass.out"

grep -q "ROADMAP_STATUS_SYNC_OK" "$TMP_DIR/pass.out"
echo "ROADMAP_STATUS_SYNC_PASS_OK"

cat > "$ROADMAP_FIXTURE" <<'EOF_ROADMAP_MISMATCH'
## VentureOS Roadmap (Living)

## Now (Active)
- [ ] #453 PR merge hygiene
- [ ] #452 Docs lint

## Next
- [ ] #451 Roadmap status sync
EOF_ROADMAP_MISMATCH

if python3 "$SCRIPT" \
  --readme "$README_FIXTURE" \
  --roadmap-body-file "$ROADMAP_FIXTURE" \
  --issues-json "$ISSUES_FIXTURE" \
  > "$TMP_DIR/mismatch.out" 2>&1; then
  echo "Expected mismatch check to fail, but it passed" >&2
  exit 1
fi

grep -q "ROADMAP_STATUS_SYNC_FAIL" "$TMP_DIR/mismatch.out"
grep -q "only_in_readme_now" "$TMP_DIR/mismatch.out"
grep -q "only_in_roadmap_now" "$TMP_DIR/mismatch.out"
echo "ROADMAP_STATUS_SYNC_MISMATCH_FAIL_OK"

cat > "$ROADMAP_FIXTURE" <<'EOF_ROADMAP_CLOSED'
## VentureOS Roadmap (Living)

## Now (Active)
- [ ] #453 PR merge hygiene
- [ ] #451 Roadmap status sync
EOF_ROADMAP_CLOSED

cat > "$ISSUES_FIXTURE" <<'EOF_ISSUES_CLOSED'
[
  {"number": 451, "state": "OPEN", "title": "Roadmap status sync"},
  {"number": 453, "state": "CLOSED", "title": "PR merge hygiene"}
]
EOF_ISSUES_CLOSED

if python3 "$SCRIPT" \
  --readme "$README_FIXTURE" \
  --roadmap-body-file "$ROADMAP_FIXTURE" \
  --issues-json "$ISSUES_FIXTURE" \
  > "$TMP_DIR/closed.out" 2>&1; then
  echo "Expected closed-issue check to fail, but it passed" >&2
  exit 1
fi

grep -q "now_not_open" "$TMP_DIR/closed.out"
grep -q "ROADMAP_STATUS_SYNC_FAIL" "$TMP_DIR/closed.out"
echo "ROADMAP_STATUS_SYNC_CLOSED_FAIL_OK"
