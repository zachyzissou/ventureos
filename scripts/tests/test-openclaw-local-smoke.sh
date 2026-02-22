#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE_SCRIPT="$ROOT/scripts/openclaw-local-smoke.sh"
TMP_DIR="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

TOKEN_FILE="$TMP_DIR/token.txt"
echo "test-token" > "$TOKEN_FILE"

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
            self._send_json(200, {"ok": True, "service": "mock-dashboard"})
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

        if not self._auth_ok():
            self._send_json(401, {"ok": False, "error": "unauthorized"})
            return

        if self.path == "/api/config":
            self._send_json(200, {"name": "mock-dashboard", "services": ["demo"]})
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

python3 "$TMP_DIR/mock-dashboard.py" "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 0.3

REPORT_DIR="$TMP_DIR/reports"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR" \
  --skip-openclaw-cli \
  --skip-bridge \
  --timeout-sec 3 >"$TMP_DIR/smoke-test.out"

python3 - <<PY
import json
from pathlib import Path

report_dir = Path("$REPORT_DIR")
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
md_reports = sorted(report_dir.glob("openclaw-local-smoke-*.md"))
assert json_reports, "missing json report"
assert md_reports, "missing markdown report"

payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("status") == "pass", summary
assert summary.get("requiredFailures") == 0, summary
ids = {c["id"] for c in payload.get("checks", [])}
for need in (
    "dashboard-health",
    "dashboard-config-auth",
    "dashboard-services",
    "dashboard-scheduler-jobs",
    "dashboard-agent-health",
    "dashboard-live-telemetry-sse",
):
    assert need in ids, f"missing check id: {need}"
print("OPENCLAW_LOCAL_SMOKE_TEST_OK")
PY
