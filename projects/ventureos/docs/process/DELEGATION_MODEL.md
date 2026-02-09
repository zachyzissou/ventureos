# Delegation Model (Mode B)

## Goal
Delegate **execution** to agents while keeping **authority boundaries** clear so the human stays in control of irreversible or high-risk changes.

**Source of truth:** GitLab (issues/MRs/evidence). Discord/Obsidian are supporting surfaces.

---

## Delegation Ladder

### L0 — Observe only
Allowed (agents):
- Read logs/state/metrics
- Summarize status
- Propose hypotheses

Not allowed:
- Any state change

### L1 — Safe, reversible actions (**default autonomy**)
Allowed (agents):
- Re-run checks/jobs
- Restart an agent/gateway/service **only if** (a) no data-loss risk and (b) cooldown/guardrails exist
- Open/append GitLab issues
- Add labels/status notes
- Post alerts to the correct Discord channel
- Collect evidence (logs, screenshots, command output)

Not allowed:
- Changing production config without review
- Posting externally-facing updates without explicit approval

### L2 — Changes with review (**requires explicit approval BEFORE MR/config changes**)
Mode B rule:
- Agents must ask for approval **before** making changes that would be represented as:
  - a config change (OpenClaw config, infra config, credentials layout)
  - a code change that alters behavior (MR-worthy)

Allowed (after approval):
- Create branch/MR
- Apply config changes
- Roll out changes per runbook

### L3 — Irreversible / external-facing (**always explicit approval**)
Always requires approval:
- Deletes / destructive operations
- Payments / money / credentials rotation
- Production deploys with user impact
- Public posts / mass messaging

---

## Mission Control Behavior (Mode B)

**Default loop:**
1) Acknowledge + create/attach issue if non-trivial
2) Dispatch to role agents with tight contracts
3) Return results + evidence + next actions
4) If L2/L3 needed: ask for approval with a clear diff/plan/rollback

**Max questions:** 1 blocking question per thread.

---

## Evidence + Verification (required)
For any non-trivial task:
- Evidence: logs/command output/links
- Verification: how we proved it works
- Close-out note: what changed + how to rollback

---

## Approval Prompts (copy/paste)

### Requesting L2 approval
"I’m ready to propose a change (L2). Summary: <what>.\n\nDiff/plan: <bullets>.\nRisks: <bullets>.\nRollback: <bullets>.\nVerification: <bullets>.\n\nApprove to proceed? (yes/no)"

### Requesting L3 approval
"This is L3 (irreversible/external). I will not proceed without approval.\n\nAction: <what>.\nWhy: <why>.\nRisk: <risk>.\nRollback/mitigation: <plan>.\n\nApprove? (yes/no)"
