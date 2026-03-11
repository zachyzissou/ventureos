#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SMOKE_SCRIPT="$ROOT/scripts/openclaw-local-smoke.sh"
TMP_DIR="$(mktemp -d)"
SERVER_PID=""
BRIDGE_SERVER_PID=""
RATE_LIMIT_SERVER_PID=""
NON_DASHBOARD_SERVER_PID=""
CONTROL_SURFACE_SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$BRIDGE_SERVER_PID" ]]; then
    kill "$BRIDGE_SERVER_PID" 2>/dev/null || true
    wait "$BRIDGE_SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$RATE_LIMIT_SERVER_PID" ]]; then
    kill "$RATE_LIMIT_SERVER_PID" 2>/dev/null || true
    wait "$RATE_LIMIT_SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$NON_DASHBOARD_SERVER_PID" ]]; then
    kill "$NON_DASHBOARD_SERVER_PID" 2>/dev/null || true
    wait "$NON_DASHBOARD_SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$CONTROL_SURFACE_SERVER_PID" ]]; then
    kill "$CONTROL_SURFACE_SERVER_PID" 2>/dev/null || true
    wait "$CONTROL_SURFACE_SERVER_PID" 2>/dev/null || true
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
FAKE_OPENCLAW_BIN_DIR="$TMP_DIR/fake-openclaw-bin"
mkdir -p "$FAKE_OPENCLAW_BIN_DIR"

cat > "$FAKE_OPENCLAW_BIN_DIR/openclaw" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "dashboard" ]]; then
  echo "Dashboard URL: ${OPENCLAW_FAKE_DASHBOARD_URL:-http://127.0.0.1:18789/#token=fake-dashboard-token}"
  echo "Browser launch disabled (--no-open). Use the URL above."
  exit 0
fi

if [[ "${1:-}" == "gateway" && "${2:-}" == "status" ]]; then
  mode="${OPENCLAW_FAKE_STATUS_MODE:-healthy}"
  if [[ "$mode" == "healthy" ]]; then
    cat <<'OUT'
Service: LaunchAgent (not loaded)
RPC probe: ok
Listening: 127.0.0.1:18789
OUT
    exit 0
  fi

  cat <<'OUT'
Service: LaunchAgent (not loaded)
Runtime: unknown
Service unit not found.
OUT
  exit 0
fi

if [[ "${1:-}" == "gateway" && "${2:-}" == "health" && "${3:-}" == "--json" ]]; then
  cat <<'OUT'
{"ok":true,"channels":{"discord":{"configured":true}},"agents":[{"agentId":"main"}]}
OUT
  exit 0
fi

if [[ "${1:-}" == "gateway" && "${2:-}" == "probe" && "${3:-}" == "--json" ]]; then
  cat <<'OUT'
{"ok":true,"targets":[{"id":"localLoopback","connect":{"ok":true}}]}
OUT
  exit 0
fi

if [[ "${1:-}" == "cron" && "${2:-}" == "list" && "${3:-}" == "--json" ]]; then
  cat <<'OUT'
{"jobs":[]}
OUT
  exit 0
fi

echo "unsupported fake openclaw invocation: $*" >&2
exit 1
SH
chmod +x "$FAKE_OPENCLAW_BIN_DIR/openclaw"

cat > "$TMP_DIR/mock-dashboard.py" <<'PY'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

PORT = int(sys.argv[1])
TOKEN = "Bearer test-token"
RATE_LIMIT_ONCE_PATH = sys.argv[2] if len(sys.argv) > 2 else ""
REQUEST_COUNTS = {}

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

    def _send_rate_limited(self):
        body = json.dumps({"ok": False, "error": "rate_limited"}).encode("utf-8")
        self.send_response(429)
        self.send_header("Content-Type", "application/json")
        self.send_header("Retry-After", "1")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _should_rate_limit_once(self):
        if not RATE_LIMIT_ONCE_PATH:
            return False
        if self.path != RATE_LIMIT_ONCE_PATH:
            return False
        count = REQUEST_COUNTS.get(self.path, 0)
        REQUEST_COUNTS[self.path] = count + 1
        return count == 0

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

        if self._should_rate_limit_once():
            self._send_rate_limited()
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

RATE_LIMIT_PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

NON_DASHBOARD_PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

CONTROL_SURFACE_PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

cat > "$TMP_DIR/mock-non-dashboard.py" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

PORT = int(sys.argv[1])

class Handler(BaseHTTPRequestHandler):
    server_version = "AirTunes/935.7.1"
    sys_version = ""

    def log_message(self, format, *args):
        pass

    def do_GET(self):
        self.send_response(403)
        self.send_header("Content-Length", "0")
        self.end_headers()

HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
PY

cat > "$TMP_DIR/mock-control-surface.py" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
import sys

PORT = int(sys.argv[1])

HTML = b"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>OpenClaw Control</title></head>
<body><openclaw-app></openclaw-app></body>
</html>"""

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(HTML)))
        self.end_headers()
        self.wfile.write(HTML)

HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
PY

python3 "$TMP_DIR/mock-dashboard.py" "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
python3 "$TMP_DIR/mock-bridge.py" "$BRIDGE_PORT" >/dev/null 2>&1 &
BRIDGE_SERVER_PID=$!
python3 "$TMP_DIR/mock-dashboard.py" "$RATE_LIMIT_PORT" "/api/services" >/dev/null 2>&1 &
RATE_LIMIT_SERVER_PID=$!
python3 "$TMP_DIR/mock-non-dashboard.py" "$NON_DASHBOARD_PORT" >/dev/null 2>&1 &
NON_DASHBOARD_SERVER_PID=$!
python3 "$TMP_DIR/mock-control-surface.py" "$CONTROL_SURFACE_PORT" >/dev/null 2>&1 &
CONTROL_SURFACE_SERVER_PID=$!
sleep 0.3

REPORT_DIR_BASELINE="$TMP_DIR/reports-baseline"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_BASELINE" \
  --profile full \
  --skip-openclaw-cli \
  --skip-bridge \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test.out

python3 - "$REPORT_DIR_BASELINE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
svg_reports = sorted(report_dir.glob("openclaw-local-smoke-*.svg"))
assert json_reports, "missing json report"
assert svg_reports, "missing svg report"

payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("status") == "pass", summary
assert summary.get("verdict") == "go", summary
assert isinstance(summary.get("readinessScore"), int), summary
assert summary.get("confidence") in {"high", "medium", "low"}, summary
assert summary.get("profile") == "full", summary
required_map = summary.get("requiredCheckStatusMap", {})
assert isinstance(required_map, dict), summary
assert required_map.get("dashboard-token") == "pass", required_map
auth = payload.get("auth", {})
assert auth.get("tokenSource") == "token-file", auth
assert auth.get("tokenHealth") in {"ok", "repaired"}, auth

check = next(c for c in payload.get("checks", []) if c["id"] == "dashboard-services")
for key in ("group", "severity", "likelyCause", "nextCommand"):
    assert key in check, check
print("OPENCLAW_LOCAL_SMOKE_BASELINE_OK")
PY

REPORT_DIR_QUICK="$TMP_DIR/reports-quick"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_QUICK" \
  --profile quick \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-quick.out

python3 - "$REPORT_DIR_QUICK" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing quick json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("profile") == "quick", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-map-route"]["status"] == "skipped", checks["dashboard-map-route"]
assert checks["bridge-scheduler-jobs"]["status"] == "skipped", checks["bridge-scheduler-jobs"]
print("OPENCLAW_LOCAL_SMOKE_QUICK_PROFILE_OK")
PY

REPORT_DIR_BRIDGE="$TMP_DIR/reports-bridge"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_BRIDGE" \
  --profile bridge \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --skip-map \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-bridge.out

python3 - "$REPORT_DIR_BRIDGE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing bridge json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("profile") == "bridge", summary
assert summary.get("verdict") == "go", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
bridge = checks.get("bridge-scheduler-jobs")
assert bridge is not None, "missing bridge check"
assert bridge.get("status") == "pass", bridge
assert bridge.get("severity") == "critical-optional", bridge
print("OPENCLAW_LOCAL_SMOKE_BRIDGE_PROFILE_OK")
PY

REPORT_DIR_FULL_BRIDGE="$TMP_DIR/reports-full-bridge"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_FULL_BRIDGE" \
  --profile full \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --skip-map \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-full-bridge.out

python3 - "$REPORT_DIR_FULL_BRIDGE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing full profile json report"
payload = json.loads(json_reports[-1].read_text())
checks = {c["id"]: c for c in payload.get("checks", [])}
bridge = checks.get("bridge-scheduler-jobs")
assert bridge is not None, "missing bridge check"
assert bridge.get("severity") == "warn", bridge
print("OPENCLAW_LOCAL_SMOKE_FULL_PROFILE_BRIDGE_SEVERITY_OK")
PY

REPORT_DIR_PROFILE_OVERRIDE="$TMP_DIR/reports-profile-override"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_PROFILE_OVERRIDE" \
  --profile quick \
  --profile full \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-profile-override.out

python3 - "$REPORT_DIR_PROFILE_OVERRIDE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing profile-override json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("profile") == "full", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-map-route"]["status"] == "pass", checks["dashboard-map-route"]
bridge = checks.get("bridge-scheduler-jobs")
assert bridge is not None, "missing bridge check"
assert bridge.get("status") == "pass", bridge
assert bridge.get("severity") == "warn", bridge
print("OPENCLAW_LOCAL_SMOKE_PROFILE_OVERRIDE_OK")
PY

REPORT_DIR_SKIP_OVERRIDE="$TMP_DIR/reports-skip-override"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_SKIP_OVERRIDE" \
  --skip-map \
  --profile full \
  --bridge-url "http://127.0.0.1:$BRIDGE_PORT" \
  --bridge-token-file "$BRIDGE_TOKEN_FILE" \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-skip-override.out

python3 - "$REPORT_DIR_SKIP_OVERRIDE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing skip-override json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("profile") == "full", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-map-route"]["status"] == "skipped", checks["dashboard-map-route"]
print("OPENCLAW_LOCAL_SMOKE_SKIP_OVERRIDE_OK")
PY

REPORT_DIR_RETRY="$TMP_DIR/reports-retry"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$RATE_LIMIT_PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_RETRY" \
  --profile full \
  --skip-openclaw-cli \
  --skip-map \
  --skip-bridge \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-retry.out

python3 - "$REPORT_DIR_RETRY" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing retry json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("status") == "pass", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-services"]["status"] == "pass", checks["dashboard-services"]
print("OPENCLAW_LOCAL_SMOKE_RETRY_429_OK")
PY

REPORT_DIR_NON_DASHBOARD="$TMP_DIR/reports-non-dashboard"
set +e
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$NON_DASHBOARD_PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_NON_DASHBOARD" \
  --profile quick \
  --skip-openclaw-cli \
  --skip-bridge \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-non-dashboard.out
NON_DASHBOARD_RC=$?
set -e

if [[ "$NON_DASHBOARD_RC" -ne 2 ]]; then
  echo "Expected non-dashboard smoke run to fail with exit 2, got $NON_DASHBOARD_RC" >&2
  exit 1
fi

python3 - "$REPORT_DIR_NON_DASHBOARD" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing non-dashboard json report"
payload = json.loads(json_reports[-1].read_text())
checks = {c["id"]: c for c in payload.get("checks", [])}
health = checks["dashboard-health"]
assert health["status"] == "fail", health
assert "non-dashboard target detected" in health.get("detail", "").lower(), health
assert checks["dashboard-config-auth"]["status"] == "skipped", checks["dashboard-config-auth"]
print("OPENCLAW_LOCAL_SMOKE_NON_DASHBOARD_DETECTION_OK")
PY

REPORT_DIR_CONTROL_SURFACE="$TMP_DIR/reports-control-surface"
CONTROL_MISSING_TOKEN_FILE="$TMP_DIR/missing-control-token.txt"
set +e
env PATH="$FAKE_OPENCLAW_BIN_DIR:$PATH" OPENCLAW_FAKE_DASHBOARD_URL="http://127.0.0.1:$CONTROL_SURFACE_PORT/#token=fake-dashboard-token" bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$CONTROL_SURFACE_PORT" \
  --token-file "$CONTROL_MISSING_TOKEN_FILE" \
  --report-dir "$REPORT_DIR_CONTROL_SURFACE" \
  --profile full \
  --skip-openclaw-cli \
  --skip-bridge \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-control-surface.out
CONTROL_SURFACE_RC=$?
set -e

if [[ "$CONTROL_SURFACE_RC" -ne 0 ]]; then
  echo "Expected OpenClaw control-surface smoke run to pass, got $CONTROL_SURFACE_RC" >&2
  cat /tmp/openclaw-local-smoke-test-control-surface.out >&2
  exit 1
fi

python3 - "$REPORT_DIR_CONTROL_SURFACE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing control-surface json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("status") == "pass", summary
assert payload.get("dashboardSurface") == "openclaw-control", payload
auth = payload.get("auth", {})
assert auth.get("tokenSource") == "openclaw-dashboard-url", auth
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-health"]["status"] == "pass", checks["dashboard-health"]
assert checks["dashboard-config-auth"]["status"] == "pass", checks["dashboard-config-auth"]
assert checks["dashboard-services"]["status"] == "pass", checks["dashboard-services"]
assert checks["dashboard-scheduler-jobs"]["status"] == "pass", checks["dashboard-scheduler-jobs"]
assert checks["dashboard-agent-health"]["status"] == "pass", checks["dashboard-agent-health"]
assert checks["dashboard-live-telemetry-sse"]["status"] == "pass", checks["dashboard-live-telemetry-sse"]
assert checks["dashboard-map-route"]["status"] == "skipped", checks["dashboard-map-route"]
print("OPENCLAW_LOCAL_SMOKE_CONTROL_SURFACE_OK")
PY

REPORT_DIR_URL_POLICY="$TMP_DIR/reports-url-policy"
DASHBOARD_PORT="$PORT" OPENCLAW_LOCAL_READY_DASHBOARD_URL="http://127.0.0.1:$PORT" DASHBOARD_URL="http://127.0.0.1:1" bash "$SMOKE_SCRIPT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_URL_POLICY" \
  --profile quick \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-url-policy.out

python3 - "$REPORT_DIR_URL_POLICY" "$PORT" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
port = sys.argv[2]
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing url-policy json report"
payload = json.loads(json_reports[-1].read_text())
assert payload.get("dashboardUrl") == f"http://127.0.0.1:{port}", payload
print("OPENCLAW_LOCAL_SMOKE_URL_POLICY_OK")
PY

REPAIR_TOKEN_FILE="$TMP_DIR/token-repair.txt"
printf "  test-token  \n" > "$REPAIR_TOKEN_FILE"
REPORT_DIR_TOKEN_REPAIR="$TMP_DIR/reports-token-repair"
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$REPAIR_TOKEN_FILE" \
  --report-dir "$REPORT_DIR_TOKEN_REPAIR" \
  --profile quick \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-token-repair.out

python3 - "$REPORT_DIR_TOKEN_REPAIR" "$REPAIR_TOKEN_FILE" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
token_file = Path(sys.argv[2])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing token-repair json report"
payload = json.loads(json_reports[-1].read_text())
auth = payload.get("auth", {})
assert auth.get("tokenHealth") == "repaired", auth
assert auth.get("tokenRepairAction") in {"normalized-single-line", "collapsed-duplicate-lines"}, auth
assert token_file.read_text(encoding="utf-8") == "test-token\n"
print("OPENCLAW_LOCAL_SMOKE_TOKEN_REPAIR_OK")
PY

BAD_TOKEN_FILE="$TMP_DIR/token-bad.txt"
printf "token-one\ntoken-two\n" > "$BAD_TOKEN_FILE"
REPORT_DIR_TOKEN_BAD="$TMP_DIR/reports-token-bad"
set +e
bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$BAD_TOKEN_FILE" \
  --report-dir "$REPORT_DIR_TOKEN_BAD" \
  --profile quick \
  --skip-openclaw-cli \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-token-bad.out 2>&1
TOKEN_BAD_RC=$?
set -e
if [[ "$TOKEN_BAD_RC" -ne 2 ]]; then
  echo "Expected malformed token run to fail with exit 2, got $TOKEN_BAD_RC" >&2
  exit 1
fi

python3 - "$REPORT_DIR_TOKEN_BAD" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing token-bad json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("requiredFailures", 0) >= 1, summary
auth = payload.get("auth", {})
assert auth.get("tokenHealth") == "invalid", auth
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["dashboard-token"]["status"] == "fail", checks["dashboard-token"]
print("OPENCLAW_LOCAL_SMOKE_TOKEN_GUARDRAIL_FAILURE_OK")
PY

REPORT_DIR_OPENCLAW_HEALTHY="$TMP_DIR/reports-openclaw-healthy"
env PATH="$FAKE_OPENCLAW_BIN_DIR:$PATH" OPENCLAW_FAKE_STATUS_MODE=healthy bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_OPENCLAW_HEALTHY" \
  --profile quick \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-openclaw-healthy.out

python3 - "$REPORT_DIR_OPENCLAW_HEALTHY" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing openclaw healthy json report"
payload = json.loads(json_reports[-1].read_text())
summary = payload.get("summary", {})
assert summary.get("status") == "pass", summary
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["openclaw-gateway-status"]["status"] == "pass", checks["openclaw-gateway-status"]
print("OPENCLAW_LOCAL_SMOKE_GATEWAY_SIGNAL_HEALTHY_OK")
PY

REPORT_DIR_OPENCLAW_UNHEALTHY="$TMP_DIR/reports-openclaw-unhealthy"
set +e
env PATH="$FAKE_OPENCLAW_BIN_DIR:$PATH" OPENCLAW_FAKE_STATUS_MODE=unhealthy bash "$SMOKE_SCRIPT" \
  --dashboard-url "http://127.0.0.1:$PORT" \
  --token-file "$TOKEN_FILE" \
  --report-dir "$REPORT_DIR_OPENCLAW_UNHEALTHY" \
  --profile quick \
  --timeout-sec 3 >/tmp/openclaw-local-smoke-test-openclaw-unhealthy.out
UNHEALTHY_RC=$?
set -e

if [[ "$UNHEALTHY_RC" -ne 2 ]]; then
  echo "Expected unhealthy gateway smoke run to exit 2, got $UNHEALTHY_RC" >&2
  exit 1
fi

python3 - "$REPORT_DIR_OPENCLAW_UNHEALTHY" <<'PY'
import json
from pathlib import Path
import sys

report_dir = Path(sys.argv[1])
json_reports = sorted(report_dir.glob("openclaw-local-smoke-*.json"))
assert json_reports, "missing openclaw unhealthy json report"
payload = json.loads(json_reports[-1].read_text())
checks = {c["id"]: c for c in payload.get("checks", [])}
assert checks["openclaw-gateway-status"]["status"] == "fail", checks["openclaw-gateway-status"]
print("OPENCLAW_LOCAL_SMOKE_GATEWAY_SIGNAL_UNHEALTHY_OK")
PY
