#!/usr/bin/env bash
# =============================================================================
# VentureOS Tactical Map — Performance Benchmark Runner
# =============================================================================
#
# Usage:
#   ./scripts/run-benchmarks.sh                  # Run all benchmarks
#   ./scripts/run-benchmarks.sh --suite render    # Run specific suite
#   ./scripts/run-benchmarks.sh --update-baselines # Update baselines after run
#   ./scripts/run-benchmarks.sh --ci              # CI mode (strict, generates reports)
#
# Environment:
#   PERF=1 is set automatically by this script.
#   CI=true triggers report generation and baseline comparison.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$PROJECT_DIR/performance-reports"
BASELINES_FILE="$PROJECT_DIR/performance-baselines.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
SUITE=""
UPDATE_BASELINES=false
CI_MODE=false
THRESHOLD=10

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite)
      SUITE="$2"
      shift 2
      ;;
    --update-baselines)
      UPDATE_BASELINES=true
      shift
      ;;
    --ci)
      CI_MODE=true
      shift
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --suite <name>        Run specific suite (render|load|memory|network)"
      echo "  --update-baselines    Update baseline file after successful run"
      echo "  --ci                  CI mode (strict, generates reports)"
      echo "  --threshold <pct>     Regression threshold percentage (default: 10)"
      echo "  -h, --help            Show this help"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Header
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🏎️  VentureOS Tactical Map — Performance Benchmarks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "$PROJECT_DIR"

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm install
fi

# Ensure Playwright browsers are installed
if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
  echo -e "${YELLOW}Installing Playwright browsers...${NC}"
  npx playwright install chromium
fi

# Build the project for consistent benchmarks
echo -e "${BLUE}Building tactical-map...${NC}"
npm run build 2>&1 | tail -3
echo ""

# Determine which test files to run
PERF_TEST_DIR="tests/performance"
TEST_FILES=""

case "${SUITE}" in
  render)
    TEST_FILES="$PERF_TEST_DIR/render-performance.test.ts"
    ;;
  load)
    TEST_FILES="$PERF_TEST_DIR/load-testing.test.ts"
    ;;
  memory)
    TEST_FILES="$PERF_TEST_DIR/memory-leak.test.ts"
    ;;
  network)
    TEST_FILES="$PERF_TEST_DIR/network-latency.test.ts"
    ;;
  "")
    TEST_FILES="$PERF_TEST_DIR/"
    ;;
  *)
    echo -e "${RED}Unknown suite: $SUITE${NC}"
    echo "Available: render, load, memory, network"
    exit 1
    ;;
esac

echo -e "${BLUE}Suite:${NC} ${SUITE:-all}"
echo -e "${BLUE}Threshold:${NC} ${THRESHOLD}%"
echo -e "${BLUE}CI mode:${NC} ${CI_MODE}"
echo ""

# Run benchmarks
echo -e "${BLUE}Running benchmarks...${NC}"
echo ""

PLAYWRIGHT_ARGS=(
  "--reporter=list"
)

if [ "$CI_MODE" = true ]; then
  PLAYWRIGHT_ARGS+=(
    "--reporter=list,json"
    "--workers=1"
    "--retries=1"
  )
  export PLAYWRIGHT_JSON_OUTPUT_DIR="$REPORT_DIR"
fi

# Set PERF flag to enable performance tests
export PERF=1

# Run with Playwright
set +e
npx playwright test $TEST_FILES "${PLAYWRIGHT_ARGS[@]}" 2>&1
EXIT_CODE=$?
set -e

echo ""

# Generate reports in CI mode
if [ "$CI_MODE" = true ]; then
  mkdir -p "$REPORT_DIR"

  echo -e "${BLUE}Generating performance reports...${NC}"

  # Copy baselines info to report dir
  if [ -f "$BASELINES_FILE" ]; then
    cp "$BASELINES_FILE" "$REPORT_DIR/baselines-used.json"
  fi

  # Git info for report
  COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

  echo "{
    \"commitSha\": \"$COMMIT_SHA\",
    \"branch\": \"$BRANCH\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"suite\": \"${SUITE:-all}\",
    \"threshold\": $THRESHOLD,
    \"exitCode\": $EXIT_CODE
  }" > "$REPORT_DIR/run-metadata.json"

  echo -e "${GREEN}Reports saved to: $REPORT_DIR${NC}"
fi

# Update baselines if requested
if [ "$UPDATE_BASELINES" = true ] && [ $EXIT_CODE -eq 0 ]; then
  echo -e "${YELLOW}Updating performance baselines...${NC}"
  echo -e "${YELLOW}Note: Baselines should only be updated after verified stable runs.${NC}"

  # Re-run the benchmarks with the update flag so the reporter captures new baselines
  export PERF_UPDATE_BASELINES=1
  echo -e "${BLUE}Re-running benchmarks to capture baselines...${NC}"
  npx playwright test $TEST_FILES --reporter=list 2>&1
  BASELINE_EXIT=$?

  if [ $BASELINE_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Performance baselines updated in ${BASELINES_FILE}${NC}"
    echo -e "${YELLOW}Review the changes and commit: git diff ${BASELINES_FILE}${NC}"
  else
    echo -e "${RED}❌ Baseline capture run failed (exit code: $BASELINE_EXIT). Baselines NOT updated.${NC}"
  fi
fi

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}  ✅ All performance benchmarks passed${NC}"
else
  echo -e "${RED}  ❌ Some benchmarks failed (exit code: $EXIT_CODE)${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

exit $EXIT_CODE
