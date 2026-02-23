#!/bin/bash
set -euo pipefail

# ─── ensure-native-modules.sh ────────────────────────────────────────────────
# Validates that native Node.js addons match the current platform/architecture.
# Rebuilds mismatched modules automatically.
#
# Problem: npm install skips native module rebuild when the package version
# matches, even if the binary was compiled for a different platform (e.g., a
# Linux ELF binary on macOS arm64). This causes runtime dlopen() failures.
#
# Usage:
#   ./scripts/ensure-native-modules.sh           # auto-detect and fix
#   ./scripts/ensure-native-modules.sh --check   # check only (exit 1 if bad)
#
# Called from:
#   - npm postinstall hook (package.json)
#   - dashboard/scripts/install-macos.sh
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

LOAD_CHECK_LOG="$(mktemp "${TMPDIR:-/tmp}/ventureos-sqlite-load-check.XXXXXX")"
trap 'rm -f "$LOAD_CHECK_LOG"' EXIT

# ─── Platform detection ──────────────────────────────────────────────────────

CURRENT_OS="$(uname -s)"   # Darwin, Linux
CURRENT_ARCH="$(uname -m)" # arm64, x86_64

case "$CURRENT_OS" in
  Darwin) EXPECTED_FORMAT="Mach-O" ;;
  Linux)  EXPECTED_FORMAT="ELF" ;;
  *)      echo "⚠️  Unknown OS: $CURRENT_OS — skipping native module check"; exit 0 ;;
esac

echo "🔍 Checking native modules for $CURRENT_OS/$CURRENT_ARCH (expect $EXPECTED_FORMAT)"

# Validate the current Node runtime can actually dlopen and execute the addon.
# This catches ABI mismatches where binary format/arch look valid but NODE_MODULE_VERSION differs.
check_sqlite_runtime_load() {
  node <<'NODE'
try {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('SELECT 1 AS ok').get();
  db.close();
  process.exit(0);
} catch (err) {
  const msg = err && err.stack ? err.stack : String(err);
  console.error(msg);
  process.exit(1);
}
NODE
}

# ─── Check better-sqlite3 ────────────────────────────────────────────────────

SQLITE_BINARY="$REPO_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
NEEDS_REBUILD=false

if [[ ! -f "$SQLITE_BINARY" ]]; then
  echo "⚠️  better-sqlite3 binary not found — needs build"
  NEEDS_REBUILD=true
else
  BINARY_INFO="$(file "$SQLITE_BINARY" 2>/dev/null || echo "unknown")"

  if echo "$BINARY_INFO" | grep -q "$EXPECTED_FORMAT"; then
    # Format matches — also check architecture on macOS
    if [[ "$CURRENT_OS" == "Darwin" && "$CURRENT_ARCH" == "arm64" ]]; then
      if echo "$BINARY_INFO" | grep -q "arm64"; then
        echo "✅ better-sqlite3: Mach-O arm64 — correct"
      else
        echo "❌ better-sqlite3: Mach-O but wrong arch (expected arm64)"
        echo "   Found: $BINARY_INFO"
        NEEDS_REBUILD=true
      fi
    elif [[ "$CURRENT_OS" == "Darwin" && "$CURRENT_ARCH" == "x86_64" ]]; then
      if echo "$BINARY_INFO" | grep -q "x86_64"; then
        echo "✅ better-sqlite3: Mach-O x86_64 — correct"
      else
        echo "❌ better-sqlite3: Mach-O but wrong arch (expected x86_64)"
        echo "   Found: $BINARY_INFO"
        NEEDS_REBUILD=true
      fi
    else
      echo "✅ better-sqlite3: $EXPECTED_FORMAT format — correct"
    fi
  else
    echo "❌ better-sqlite3: wrong binary format"
    echo "   Expected: $EXPECTED_FORMAT ($CURRENT_OS/$CURRENT_ARCH)"
    echo "   Found:    $BINARY_INFO"
    NEEDS_REBUILD=true
  fi
fi

# Even if format/arch look correct, verify the current Node runtime can load it.
if ! $NEEDS_REBUILD; then
  if check_sqlite_runtime_load >"$LOAD_CHECK_LOG" 2>&1; then
    echo "✅ better-sqlite3: runtime load check passed"
  else
    echo "❌ better-sqlite3: runtime load check failed (likely ABI mismatch)"
    sed 's/^/   /' "$LOAD_CHECK_LOG" || true
    NEEDS_REBUILD=true
  fi
fi

# ─── Rebuild if needed ───────────────────────────────────────────────────────

if $NEEDS_REBUILD; then
  if $CHECK_ONLY; then
    echo ""
    echo "💡 Fix: cd $(basename "$REPO_ROOT") && npm rebuild better-sqlite3"
    exit 1
  fi

  echo ""
  echo "🔧 Rebuilding better-sqlite3 from source for $CURRENT_OS/$CURRENT_ARCH…"
  cd "$REPO_ROOT"
  npm rebuild better-sqlite3 --build-from-source

  # Verify rebuild succeeded
  if [[ -f "$SQLITE_BINARY" ]]; then
    VERIFY_INFO="$(file "$SQLITE_BINARY" 2>/dev/null || echo "unknown")"
    if echo "$VERIFY_INFO" | grep -q "$EXPECTED_FORMAT"; then
      if check_sqlite_runtime_load >"$LOAD_CHECK_LOG" 2>&1; then
        echo "✅ Rebuild successful: $VERIFY_INFO"
      else
        echo "❌ Rebuild produced binary that still fails to load"
        sed 's/^/   /' "$LOAD_CHECK_LOG" || true
        exit 1
      fi
    else
      echo "❌ Rebuild failed — binary still wrong format"
      echo "   Got: $VERIFY_INFO"
      exit 1
    fi
  else
    echo "❌ Rebuild failed — binary not found"
    exit 1
  fi
else
  echo ""
  echo "✅ All native modules match current platform"
fi
