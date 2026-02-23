#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REFRESH_SCRIPT="$ROOT/scripts/refresh-local-integration-ready.sh"
SMOKE_SCRIPT="$ROOT/scripts/openclaw-local-smoke.sh"
TMP_DIR="$(mktemp -d)"
SERVER_PID=""
BRIDGE_SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$BRIDGE_SERVER_PID" ]]; then
    kill "$BRIDGE_SERVER_PID" 2>/dev/null || true
    wait "$BRIDGE_SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

has_pattern() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$file"
    return $?
  fi
  grep -E -q "$pattern" "$file"
}

PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

BRIDGE_PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

TOKEN_FILE="$TMP_DIR/token.txt"
echo "test-token" > "$TOKEN_FILE"
BRIDGE_TOKEN_FILE="$TMP_DIR/bridge-token.txt"
echo "bridge-token" > "$BRIDGE_TOKEN_FILE"

cat > "$TMP_DIR/mock-dashboard.py" <<'PY'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

PORT = int(sys.argv[1])
TOKEN = "Bearer test-token"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self):
        return self.headers.get("Authorization", "") == TOKEN

    def do_GET(self):
        if self.path == "/api/health":
            self._send_json(200, {"ok": True})
            return

        if self.path == "/api/live-telemetry":
            if not self._auth_ok():
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return
            body = b"event: ping\ndata: {\"ok\":true}\n\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path == "/map/":
            if not self._auth_ok():
                self._send_json(401, {"ok": False, "error": "unauthorized"})
                return
            html = b"<html><body>map</body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        if not self._auth_ok():
            self._send_json(401, {"ok": False, "error": "unauthorized"})
            return

        if self.path == "/api/config":
            self._send_json(200, {"name": "mock-dashboard"})
        elif self.path == "/api/services":
            self._send_json(
                200,
                [
                    {"name": "openclaw", "active": True},
                    {"name": "agent-dashboard", "active": True},
                    {"name": "tailscaled", "active": False},
                ],
            )
        elif self.path == "/api/scheduler-jobs":
            self._send_json(200, [])
        elif self.path == "/api/agent-health":
            self._send_json(200, {"agents": []})
        else:
            self._send_json(404, {"ok": False, "error": "not_found"})

HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
PY

cat > "$TMP_DIR/mock-bridge.py" <<'PY'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

PORT = int(sys.argv[1])
TOKEN = "Bearer bridge-token"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        if self.path != "/api/bridge/scheduler-jobs":
            self.send_response(404)
            self.end_headers()
            return
        if self.headers.get("Authorization", "") != TOKEN:
            body = json.dumps({"ok": False, "error": "unauthorized"}).encode("utf-8")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        body = json.dumps([]).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
PY

python3 "$TMP_DIR/mock-dashboard.py" "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
python3 "$TMP_DIR/mock-bridge.py" "$BRIDGE_PORT" >/dev/null 2>&1 &
BRIDGE_SERVER_PID=$!
sleep 0.3

REPORT_DIR="$TMP_DIR/reports"
OUT_DOC="$TMP_DIR/LOCAL_INTEGRATION_READY.md"

bash "$REFRESH_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR" \
  --output-doc "$OUT_DOC" \
  --profile bridge \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --skip-map \
  --timeout-sec 3 >/tmp/refresh-local-integration-ready-test.out

sleep 1
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR" \
  --profile bridge \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --skip-map \
  --timeout-sec 3 >/tmp/refresh-local-integration-ready-test-smoke-2.out

bash "$REFRESH_SCRIPT" \
  --skip-smoke \
  --history-limit 1 \
  --report-dir "$REPORT_DIR" \
  --output-doc "$OUT_DOC" >/tmp/refresh-local-integration-ready-test-history.out

python3 - "$REPORT_DIR" "$OUT_DOC" <<'PY'
from pathlib import Path
import json
import sys

report_dir = Path(sys.argv[1])
doc_path = Path(sys.argv[2])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
svg_reports = sorted(report_dir.glob("openclaw-local-smoke-*.svg"))
assert len(json_reports) >= 2, "expected multiple smoke reports"
assert svg_reports, "missing status strip svg"
status_summary_json = report_dir / "openclaw-local-ready-latest.json"
status_summary_md = report_dir / "openclaw-local-ready-latest.md"
assert status_summary_json.exists(), "missing latest status summary json"
assert status_summary_md.exists(), "missing latest status summary markdown"

latest = json.loads(json_reports[-1].read_text(encoding="utf-8"))
summary = latest.get("summary", {})
assert summary.get("verdict") == "go", summary
assert summary.get("requiredFailures") == 0, summary

status_payload = json.loads(status_summary_json.read_text(encoding="utf-8"))
assert status_payload.get("status") == "ok", status_payload
assert status_payload.get("guardrails", {}).get("stale") is False, status_payload

text = doc_path.read_text(encoding="utf-8")
assert "## Mission Control Card" in text, text
assert "Verdict: `GO`" in text, text
assert "## Trend (Last 1 Runs)" in text, text
assert "Status strip SVG" in text, text
assert "Status summary JSON" in text, text
assert "Top 3 Blockers" in text, text
assert "## Current Next Steps" in text, text
print("REFRESH_LOCAL_INTEGRATION_READY_GO_SCENARIO_OK")
PY

# Retention check: prune to latest single timestamp group.
bash "$REFRESH_SCRIPT" \
  --skip-smoke \
  --history-limit 1 \
  --prune-keep 1 \
  --report-dir "$REPORT_DIR" \
  --output-doc "$OUT_DOC" >/tmp/refresh-local-prune.out

python3 - "$REPORT_DIR" <<'PY'
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
assert len(list(report_dir.glob("openclaw-local-smoke-*.json"))) == 1
assert len(list(report_dir.glob("openclaw-local-smoke-*.md"))) == 1
assert len(list(report_dir.glob("openclaw-local-smoke-*.svg"))) == 1
print("REFRESH_LOCAL_INTEGRATION_READY_PRUNE_CHECK_OK")
PY

# Input validation: prune-keep must be numeric.
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --prune-keep nope --report-dir "$REPORT_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-prune-invalid.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected invalid prune-keep failure" >&2
  exit 1
fi
if ! has_pattern "Invalid --prune-keep" /tmp/refresh-local-prune-invalid.out; then
  echo "expected prune-keep validation message" >&2
  cat /tmp/refresh-local-prune-invalid.out >&2
  exit 1
fi

echo "REFRESH_LOCAL_INTEGRATION_READY_PRUNE_VALIDATION_OK"

# Input validation: max-age-min must be numeric.
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --max-age-min nope --report-dir "$REPORT_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-max-age-invalid.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected invalid max-age-min failure" >&2
  exit 1
fi
if ! has_pattern "Invalid --max-age-min" /tmp/refresh-local-max-age-invalid.out; then
  echo "expected max-age-min validation message" >&2
  cat /tmp/refresh-local-max-age-invalid.out >&2
  exit 1
fi

echo "REFRESH_LOCAL_INTEGRATION_READY_MAX_AGE_VALIDATION_OK"

# Mismatch check: create a newer JSON without matching markdown.
sleep 1
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.json | tail -n 1)" "$REPORT_DIR/openclaw-local-smoke-20990101T000000Z.json"
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --report-dir "$REPORT_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-mismatch.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected mismatch failure" >&2
  exit 1
fi
if ! has_pattern "mismatched" /tmp/refresh-local-mismatch.out; then
  echo "expected mismatched error message" >&2
  cat /tmp/refresh-local-mismatch.out >&2
  exit 1
fi

echo "REFRESH_LOCAL_INTEGRATION_READY_MISMATCH_CHECK_OK"

# Schema validation check: invalid latest paired JSON should fail.
BAD_DIR="$TMP_DIR/reports-bad"
mkdir -p "$BAD_DIR"
cat > "$BAD_DIR/openclaw-local-smoke-20990101T010101Z.json" <<'JSON'
{"generatedAt":"20990101T010101Z","summary":{"status":"pass"},"checks":[]}
JSON
cat > "$BAD_DIR/openclaw-local-smoke-20990101T010101Z.md" <<'MD'
# bad
MD
cat > "$BAD_DIR/openclaw-local-smoke-20990101T010101Z.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>
SVG
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --report-dir "$BAD_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-schema.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected schema validation failure" >&2
  exit 1
fi
if ! has_pattern "schema" /tmp/refresh-local-schema.out; then
  echo "expected schema error message" >&2
  cat /tmp/refresh-local-schema.out >&2
  exit 1
fi

echo "REFRESH_LOCAL_INTEGRATION_READY_SCHEMA_CHECK_OK"

# SVG completeness check: latest paired JSON/MD without SVG must fail.
BAD_SVG_DIR="$TMP_DIR/reports-no-svg"
mkdir -p "$BAD_SVG_DIR"
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.json | tail -n 1)" "$BAD_SVG_DIR/openclaw-local-smoke-20990101T020202Z.json"
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.md | tail -n 1)" "$BAD_SVG_DIR/openclaw-local-smoke-20990101T020202Z.md"
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --report-dir "$BAD_SVG_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-svg.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected missing svg failure" >&2
  exit 1
fi
if ! has_pattern "SVG" /tmp/refresh-local-svg.out; then
  echo "expected svg error message" >&2
  cat /tmp/refresh-local-svg.out >&2
  exit 1
fi

echo "REFRESH_LOCAL_INTEGRATION_READY_SVG_CHECK_OK"

# Stale guardrail check: old latest artifacts should fail when max-age is configured.
STALE_DIR="$TMP_DIR/reports-stale"
mkdir -p "$STALE_DIR"
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.json | tail -n 1)" "$STALE_DIR/openclaw-local-smoke-20000101T000000Z.json"
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.md | tail -n 1)" "$STALE_DIR/openclaw-local-smoke-20000101T000000Z.md"
cp "$(ls -1 "$REPORT_DIR"/openclaw-local-smoke-*.svg | tail -n 1)" "$STALE_DIR/openclaw-local-smoke-20000101T000000Z.svg"
set +e
bash "$REFRESH_SCRIPT" --skip-smoke --max-age-min 1 --report-dir "$STALE_DIR" --output-doc "$OUT_DOC" >/tmp/refresh-local-stale.out 2>&1
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "expected stale guardrail failure" >&2
  exit 1
fi
if ! has_pattern "REFRESH_STALE=true" /tmp/refresh-local-stale.out; then
  echo "expected stale marker in refresh output" >&2
  cat /tmp/refresh-local-stale.out >&2
  exit 1
fi
if ! has_pattern "REFRESH_GUARDRAIL_RC=3" /tmp/refresh-local-stale.out; then
  echo "expected guardrail rc marker in refresh output" >&2
  cat /tmp/refresh-local-stale.out >&2
  exit 1
fi

python3 - "$STALE_DIR/openclaw-local-ready-latest.json" <<'PY'
from pathlib import Path
import json
import sys

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload.get("status") == "alert", payload
assert payload.get("guardrails", {}).get("stale") is True, payload
assert payload.get("guardrails", {}).get("guardrailRc") == 3, payload
print("REFRESH_LOCAL_INTEGRATION_READY_STALE_GUARD_OK")
PY
