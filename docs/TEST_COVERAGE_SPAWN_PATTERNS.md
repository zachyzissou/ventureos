# Test Coverage Report — Spawn Patterns

## Scope
This report covers tests added/used to validate the Antfarm-inspired workflow patterns in VentureOS spawn infrastructure.

## Covered Patterns
### 1) Retry logic (spawn reliability)
**Script under test:** `scripts/spawn-with-retry.mjs`

**Test:** `scripts/tests/test-spawn-with-retry.sh`

Validations:
- Exponential backoff schedule (2s, 4s, 8s) and timing expectations
- Successful recovery after transient failures
- Workspace isolation denial for cross-workspace writable paths
- Per-agent TMPDIR propagation to child process

---

### 2) Fresh context per step
**Script under test:** `scripts/spawn-with-verification.mjs`

**Test:** `scripts/tests/test-spawn-with-verification.sh` (TEST1)

Validations:
- Plan, dev, verify each receive a distinct `--context` file
- Context files are written under the run directory
- Dev context includes the plan output text (context passing)
- Output artifacts are written for each step

---

### 3) Verification loops
**Script under test:** `scripts/spawn-with-verification.mjs`

**Test:** `scripts/tests/test-spawn-with-verification.sh` (TEST2)

Validations:
- Verifier can request retry (`STATUS: retry`)
- Workflow runs a second dev + verify cycle
- Verifier issues are carried forward into the next dev context

---

### 4) Retry logic integrated into verified workflow
**Script under test:** `scripts/spawn-with-verification.mjs`

**Test:** `scripts/tests/test-spawn-with-verification.sh` (TEST3)

Validations:
- Transient failure on the plan spawn triggers per-step retries
- Backoff schedule can be overridden for fast test execution

## How to run locally
```bash
bash scripts/tests/test-spawn-with-retry.sh
bash scripts/tests/test-spawn-with-verification.sh
```
