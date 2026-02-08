# Config Change Safety Protocol (Codex‑Assisted)

## Purpose
Provide a **safe, repeatable** process for changing OpenClaw configuration with automatic rollback if a restart fails. Intended for changes tracked by an issue/milestone in GitLab.

## Trigger
- A config change is required (e.g., gateway bind, auth token rotation).
- A related GitLab issue/milestone exists.

## Tooling
- **Codex CLI agent** (coding‑agent) using **gpt‑5.3‑high**.
- Changes applied via `gateway config.patch` (not manual file edits).

## Safety Guarantees
- Config **backup before change**.
- **Validation + restart** after change.
- **Automatic rollback** to last known‑good config if restart fails.
- **Explicit approval** required before applying any config change.

---

## Step‑by‑Step Workflow

### 1) Pre‑flight
- `openclaw gateway status`
- `openclaw doctor --non-interactive`
- Backup config:
  - `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak-YYYYMMDD-HHMMSS`

### 2) Apply Patch (via RPC)
- `gateway config.get` → capture `baseHash`
- Apply change with `gateway config.patch` and a clear `note`.

### 3) Restart + Verify
- Restart gateway (automatic from config.patch or explicit if needed).
- Verify:
  - `openclaw gateway status` (running + RPC OK)
  - Optional: `curl -s http://127.0.0.1:18789/ >/dev/null`
  - Check last 200 lines of `~/.openclaw/logs/gateway.err.log`

### 4) Failure Handling (Auto‑Rollback)
If restart fails or config invalid:
- Restore backup config:
  - `cp ~/.openclaw/openclaw.json.bak-... ~/.openclaw/openclaw.json`
- `openclaw gateway restart`
- Re‑verify status + logs
- If still failing, **stop** and alert with logs.

---

## Codex CLI Agent Template (Summary)
Use when a config change issue is opened:

1. Identify target keys and desired values.
2. Run pre‑flight checklist.
3. Back up config.
4. Apply `config.patch` with baseHash.
5. Verify; if fail, rollback automatically.
6. Report outcome with exact commands + timestamps.

**Model:** gpt‑5.3‑high (fallback to gpt‑5.2‑codex only with approval).

---

## Logging / Audit
- Record in GitLab issue: change rationale, patch payload (redacted), verification results.
- Note rollback attempts if any.
