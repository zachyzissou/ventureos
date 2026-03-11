# Nexus 2.0 Clarifications (No Unanswered Questions)

## Q1: Who is final arbiter?
A: Human (Zach) is final arbiter.

## Q2: What does "competition results are advisory" mean?
A: Competing agents can generate options and scores, but they cannot finalize mission truth or execution state. Final acceptance is required by the primary control path (Nexus) and ultimately overridable by the human arbiter.

## Q3: What is single-token-first policy?
A: Do not introduce additional Discord/bot tokens for core operation. Prefer one token + deterministic routing. Expand only when explicitly justified and preflight-validated.

## Q4: What is the priority order for 2.0 work?
A:
1) Reliability
2) Creativity
3) Safety
4) Speed

## Q5: How is rollout tracked?
A: Visible incremental milestones in GitHub issues and PRs.

## Q6: What is out of scope right now?
A:
- Immediate runtime multi-account deployment.
- Token topology expansion.
- Any feature that weakens deterministic arbitration.

## Q7: What is the first implementation checkpoint?
A: Phase A (contract foundation) merged with passing targeted tests.
