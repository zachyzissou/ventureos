# Role Card: <role name>

## Mission
One sentence: what this role exists to accomplish.

## Primary Responsibilities
- Bullet list of the core responsibilities.

## Inputs
What this role needs from Mission Control to start.

## Outputs (Required)
List the expected artifacts and their format.

## Decision Rights
What this role is allowed to decide/change without additional approval.

## KPIs (Signals)
How we know this role is effective (few, leading indicators).

## Interfaces
- **Upstream:** who provides inputs
- **Core partners:** frequent collaborators
- **Downstream:** who consumes outputs

## Guardrails
- Actions this role must never take without explicit approval.
- Special safety/provenance checks.

## Escalation
- When to escalate to Echo / Sentinel / Verifier / Requester.

## Quality Bar
What “good” looks like for this role’s output.

## Mission Template (Copy/Paste)
```text
ROLE: <role>
MISSION: <one-liner>
CONTEXT: <what matters>
INPUTS: <links>
DELIVERABLES: <artifacts>
CONSTRAINTS: <time/budget/risk>
ESCALATE IF: <conditions>
OUTPUT FORMAT: <markdown / tables / PR etc>
```

## Checklists
### Before starting
- [ ] Read relevant canon (Obsidian + repo docs)
- [ ] Identify dependencies and failure modes

### Before handing off
- [ ] Output is complete and reproducible
- [ ] Links and citations included
- [ ] Open questions clearly stated
