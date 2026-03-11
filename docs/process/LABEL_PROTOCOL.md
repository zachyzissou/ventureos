# Label Protocol (GitHub-First)

These labels make workflow state explicit and enforce the Operating Contract.

## Canonical labels
- `needs-evidence` — default for any issue without close-out evidence block filled + links attached.
- `needs-review` — work is implemented; ready for PR review / second set of eyes.
- `needs-verification` — ready for QA verification against acceptance criteria.
- `blocked` — cannot proceed; comment must state blocker + next step.
- `no-code-change` — explicit exception when closing without PR/commit (must explain why).

## How labels should flow
1) **New issue** → apply `needs-evidence`.
2) **Implementation ready** -> open PR; apply `needs-review`.
3) **Post-merge / deployed** → apply `needs-verification` (if applicable).
4) **Verified** → remove `needs-*` labels; issue can be closed once close-out block is complete.

## Rules
- If `blocked` is applied, the latest comment must include: blocker, owner, and next check-in time.
- `no-code-change` is never implicit; it must be applied intentionally with justification.
