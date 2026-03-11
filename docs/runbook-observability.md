# VentureOS Observability Runbook

> **Issue**: #195 — Observability Gap Closure  
> **Status**: Active  
> **Last Updated**: 2026-02-17

## Overview

VentureOS now emits **structured JSON logs**, propagates **correlation IDs** through request lifecycles, and provides an **incident report bundle** generator for operator triage.

---

## 1. Structured Logging

### Log Format

All structured logs are emitted as single-line JSON to stderr:

```json
{
  "timestamp": "2026-02-17T23:15:42.123Z",
  "level": "info",
  "subsystem": "dashboard",
  "event": "request_completed",
  "message": "GET /api/kpis → 200",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fields": {
    "method": "GET",
    "path": "/api/kpis",
    "statusCode": 200,
    "latencyMs": 42
  }
}
```

### Schema Fields

| Field | Type | Description |
|---|---|---|
| `timestamp` | ISO 8601 | When the log entry was created |
| `level` | `debug\|info\|warn\|error` | Severity level |
| `subsystem` | string | Component (e.g., `dashboard`, `auth`, `bridge`) |
| `event` | string | Machine-readable event type |
| `message` | string | Human-readable description |
| `correlationId` | string\|null | Request correlation ID (null if no context) |
| `fields` | object\|null | Additional context (auto-redacted) |

### Log Level Configuration

Set the minimum log level via environment variable:

```bash
export VENTUREOS_LOG_LEVEL=debug   # debug, info, warn, error
```

Default: `info`

### Key Events

| Event | Subsystem | Level | Description |
|---|---|---|---|
| `request_received` | dashboard | info | Incoming HTTP request |
| `request_completed` | dashboard | info/warn/error | Request finished (with status + latency) |
| `login_success` | auth | info | Successful authentication |
| `login_failure` | auth | warn | Failed authentication attempt |
| `action_invoked` | dashboard | info | Admin action triggered |
| `action_failed` | dashboard | error | Admin action failed |
| `incident_report_requested` | dashboard | info | Bundle generation started |
| `incident_report_generated` | dashboard | info | Bundle generated successfully |
| `incident_report_failed` | dashboard | error | Bundle generation failed |

---

## 2. Correlation IDs

### How It Works

1. **Accept**: If the request includes an `x-correlation-id` header, that value is used
2. **Generate**: If absent, a UUID v4 is auto-generated
3. **Propagate**: The ID is stored in Node.js `AsyncLocalStorage` and automatically included in all structured log entries during the request lifecycle
4. **Return**: The `x-correlation-id` header is set on the response

### Tracing a Request

**Send a request with a specific correlation ID:**

```bash
curl -H "x-correlation-id: my-debug-trace-123" \
     -H "Authorization: Bearer $TOKEN" \
     http://localhost:8001/api/kpis
```

**Find all logs for that request:**

```bash
# Filter structured logs by correlation ID
grep '"correlationId":"my-debug-trace-123"' /dev/stderr 2>&1 | jq .
```

**Check the response header:**

```bash
curl -v -H "x-correlation-id: my-debug-trace-123" \
     http://localhost:8001/api/health 2>&1 | grep x-correlation-id
# < x-correlation-id: my-debug-trace-123
```

**Auto-generated ID (no header sent):**

```bash
curl -v http://localhost:8001/api/health 2>&1 | grep x-correlation-id
# < x-correlation-id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Using Correlation IDs in Code

```typescript
import { getCorrelationId, runWithCorrelation } from './lib/structured-logger.js';
import { logInfo } from './lib/structured-logger.js';

// Inside a request handler (auto-populated by middleware):
logInfo('mymodule', 'my_event', 'Processing', { detail: 'value' });
// → correlationId is automatically included

// For background tasks:
runWithCorrelation('custom-job-id', () => {
  logInfo('worker', 'task_start', 'Background task started');
});
```

---

## 3. Incident Report Bundles

### What's in a Bundle

| Section | Contents |
|---|---|
| `structuredLogs` | Recent structured + audit log entries (capped at 500) |
| `auditLogs` | Dedicated audit log entries |
| `systemSnapshot` | OS, memory, CPU, disk, node version |
| `configSnapshot` | Relevant env vars (**redacted**) |
| `healthEndpoint` | Response from `/api/health` |
| `recentErrors` | Filtered error-level entries |

### Generate via API

```bash
# Generate with default 30-minute window
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:8001/api/incident-report | jq .

# Specify window (minutes)
curl -X POST -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8001/api/incident-report?window=60" | jq .
```

### Generate via CLI

```bash
# Default (30m window, saves to runtime/tmp/)
npx tsx scripts/incident-report.ts

# Custom window and output path
npx tsx scripts/incident-report.ts --window-minutes=60 --output=./incident-2026-02-17.json
```

### Redaction Guarantees

The bundle generator automatically redacts:
- **Key-based**: `token`, `password`, `secret`, `api_key`, `authorization`, `cookie`, `jwt`, `credentials`, etc.
- **Pattern-based**: OpenAI keys (`sk-...`), GitHub PATs (`ghp_...`), Slack tokens (`xoxb-...`), JWTs (`eyJ...`)
- **Environment variables**: Any env var with `token`/`secret` in the name

### Sharing Bundles

Bundles are safe to share with operators and attach to incident reports. No tokens, passwords, or PII are included.

---

## 4. Troubleshooting Cookbook

### "I need to trace a specific failing request"

1. Get the correlation ID from the error response or response header
2. Search logs: `grep '"correlationId":"<ID>"' /path/to/logs`
3. If using the API, send a test request with your own correlation ID

### "Dashboard is slow / timing out"

1. Generate an incident bundle: `curl -X POST http://localhost:8001/api/incident-report`
2. Check `systemSnapshot.memory.percent` and `systemSnapshot.loadAvg`
3. Look at `structuredLogs` for slow `request_completed` entries (high `latencyMs`)

### "I see auth failures in the audit log"

1. Filter logs: `grep '"event":"login_failure"' /path/to/logs`
2. Check the correlation ID to trace the full request
3. Verify the token hasn't rotated

### "I need to debug a bridge proxy issue"

1. Send request with correlation ID: `curl -H "x-correlation-id: bridge-debug-1" ...`
2. Check both dashboard and bridge logs for that ID
3. Generate incident bundle to see bridge health

---

## 5. File Locations

| File | Purpose |
|---|---|
| `lib/structured-logger.ts` | Core structured logging module |
| `dashboard/server/middleware/correlation-id.ts` | Correlation ID middleware |
| `scripts/incident-report.ts` | Bundle generator (CLI + library) |
| `runtime/logs/` | Log file directory |
| `runtime/tmp/` | Default incident bundle output |
| `docs/runbook-observability.md` | This document |
