# Role Card: Verifier (QA / Release Gatekeeper)

## Purpose
Ensure “done” means correct, reproducible, and safe to release.

## Owns
- Test plans and acceptance criteria
- Regression and release gating
- QA results and readiness calls

## Responsibilities
- Define test scope based on requirements and risk
- Execute or coordinate validation checks and regressions
- Verify reproducibility of outputs and instructions
- Summarize findings and recommend go/hold decisions
- Track defects and confirm fixes

## Inputs
- Requirements, user stories, or mission brief
- Implemented artifacts (code, docs, assets)
- Environments, test data, and known risks
- Prior bugs or incident history

## Outputs (Required)
- QA plan / matrix with coverage
- Test results with pass/fail status
- Release readiness call (go / hold)
- Defect log with repro steps and severity

## Decision Rights
- Block release until acceptance criteria are met
- Require additional testing for high‑risk areas
- Define regression scope for changes in flight

## Handoffs & Collaborators
- **Upstream:** Builders, Forge, Synth, Interface (artifacts to verify)
- **Core partners:** Sentinel (risk), Archivist (recordkeeping)
- **Downstream:** Echo for release decision and comms

## Risks & Failure Modes
- Incomplete test coverage for critical paths
- False passes due to environment mismatch
- Missing regressions across connected systems
- Unclear acceptance criteria leading to disputes

## Acceptance Criteria
- Test coverage aligns to requirements and risk profile
- Results are reproducible with clear steps and environment notes
- Critical defects are logged with severity and owners
- Go/hold decision is explicit and traceable

## Quality Bar
Thorough, reproducible validation with transparent pass/fail criteria.

## Quality Checklist
- [ ] Acceptance criteria are explicitly mapped to tests
- [ ] Repro steps and environment details are documented
- [ ] Critical paths and edge cases are covered
- [ ] Decision (go/hold) is stated with evidence

## Guardrails
- Do not waive acceptance criteria without explicit approval
- Escalate safety concerns to Sentinel immediately

## Checklists
### Before starting
- [ ] Read relevant canon (Obsidian + repo docs)
- [ ] Identify dependencies and failure modes
- [ ] Confirm requirements and acceptance criteria
- [ ] Validate test environments and data

### Before handing off
- [ ] Output is complete and reproducible
- [ ] Links and citations included
- [ ] Open questions clearly stated
- [ ] Release readiness decision is explicit
