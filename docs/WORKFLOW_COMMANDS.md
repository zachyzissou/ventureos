# Workflow Commands (1‑Command Workflows)

## Purpose
Define **single‑command entrypoints** for common OpenClaw/VentureOS tasks, with **consistent args**, **safety gates**, and **durable outputs**. This is the operator‑facing catalog for “do the thing” commands.

These workflows are designed to be:
- **Discoverable** (list + describe)
- **Safe by default** (prechecks + approvals)
- **Auditable** (outputs + logs)
- **Composable** (usable by Mission Control and the Proactive Engine)

---

## Command Interface Pattern (Proposed)

### CLI shape
```
openclaw workflow list
openclaw workflow describe <name>
openclaw workflow run <name> [args]
```

### Standard flags (all workflows)
- `--issue <id|url>` → link to GitLab issue for audit trail
- `--dry-run` → show steps without side effects (default for destructive workflows)
- `--approve` → required for destructive/config‑changing workflows
- `--output <path>` → override default output path
- `--timeout <seconds>` → override default timeout (honor TIMEOUT_POLICY)
- `--max-attempts <n>` → override retry count (honor RETRY_POLICY)

### Execution wrapper (recommended)
All workflows should run through the standard wrapper for retries + timeouts:
```
scripts/guarded-run.sh <timeout> <max_attempts> <base_sleep> <command...>
```

For multi-agent fan-out workflows, wrap subagent dispatch with:
```
node scripts/spawn-with-retry.mjs -- <sessions_spawn args...>
```

---

## Safety Gates (Required)
These are **hard gates** before any workflow runs.

1) **Guardrails** → must comply with **GUARDRAILS.md**
2) **Budget gate** → respect **BUDGET_POLICY.md** thresholds
3) **Data class** → `public | internal | confidential | restricted`
4) **Side‑effects** → `read_only | reversible | destructive`
5) **Approval gate** → if destructive or config‑changing, require `--approve`
6) **Change freeze / blackout** → follow proactive windows or maintenance blocks

**Config changes** must follow **CONFIG_CHANGE_SAFETY.md** (no exceptions).

---

## Workflow Template (Use for all entries)
```
Name:
Intent:
Args:
Prechecks:
Steps:
Outputs:
Approval:
```

---

## Workflow Macros (Reusable Blocks)
Workflow commands should be **composed from reusable macros** instead of duplicating multi‑step logic. Macro schema, storage locations, and execution semantics are defined in **WORKFLOW_MACROS.md**.

---

## Catalog — Top 5 Common Workflows

### 1) Health Snapshot
**Name:** `health.snapshot`
**Intent:** Quick, one‑command health view of gateway + logs for triage.
**Args:**
- `--logs <n>` (default 200)
- `--output <path>` (default: `~/clawd/runtime/reports/health-YYYYMMDD-HHMMSS.md`)
**Prechecks:**
- OpenClaw CLI available
- Read‑only operations only
**Steps:**
1. `openclaw gateway status`
2. `openclaw doctor --non-interactive`
3. `tail -n <n> ~/.openclaw/logs/gateway.err.log`
4. `scripts/monitor-openclaw.sh`
**Outputs:**
- Health report markdown + console summary
**Approval:** none (read‑only)

---

### 2) Backup (Create)
**Name:** `backup.create`
**Intent:** Create a daily backup of OpenClaw config + memory state.
**Args:**
- `--output <path>` (optional override; default `~/backups/clawd/`)
**Prechecks:**
- Sufficient disk space
- Backup directory writable
**Steps:**
1. `scripts/backup-clawd.sh`
2. Verify SHA file exists
**Outputs:**
- `~/backups/clawd/clawd-YYYY-MM-DD.tar.gz`
- `~/backups/clawd/clawd-YYYY-MM-DD.tar.gz.sha256`
- Log: `~/clawd/runtime/logs/backups/YYYY-MM-DD.log`
**Approval:** none (reversible)

---

### 3) Restore (Apply)
**Name:** `backup.restore`
**Intent:** Restore a known‑good backup safely (dry‑run by default).
**Args:**
- `--archive <path>` (optional; default latest)
- `--confirm` (apply restore)
**Prechecks:**
- **Issue link required** (`--issue`)
- Explicit approval required (`--approve` + `--confirm`)
- Backup archive + checksum available
**Steps:**
1. `scripts/restore-backup.sh --archive <path>` (dry‑run)
2. Re‑run with `--confirm` after approval
**Outputs:**
- Dry‑run diff summary
- `RESTORE_OK: <archive>` on success
**Approval:** required (destructive/reversible)

---

### 4) Docs Lint
**Name:** `docs.lint`
**Intent:** Validate doc links + placeholders before merge.
**Args:**
- `--output <path>` (optional)
**Prechecks:**
- Repo root
- Clean working tree (recommended)
**Steps:**
1. `python scripts/docs-lint.py`
**Outputs:**
- Exit status + lint report
**Approval:** none (read‑only)

---

### 5) Budget Check
**Name:** `budget.check`
**Intent:** Generate a quick quota/cost report.
**Args:**
- none
**Prechecks:**
- Subscription quota tracker present
**Steps:**
1. `scripts/budget-check.sh`
**Outputs:**
- Console report (cron wrapper handles alerting)
**Approval:** none (read‑only)

---

## Notes
- Workflows should be **listable** and **describable** for discoverability.
- Proactive Engine can enqueue these workflows when appropriate (see **PROACTIVE_ENGINE.md**).
- Add new workflows to this catalog + **DOC_INDEX.md**.
